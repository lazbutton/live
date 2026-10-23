import {
  baseDomain,
  getSocialHandle,
  getSourceKind,
  hostOf,
  isSharedHost,
  type SourceKind,
} from "@/lib/collecte/source-kind";

import type { AgentContext } from "./context";

/** Source de collecte telle que la voit l'agent. */
export type AgentSource = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string;
  /**
   * Page à lire avec scan_agenda : pour un site, l'agenda configuré du propriétaire, sinon le site ;
   * pour Facebook, la page elle-même (événements à venir publics). Instagram : à lire dans le navigateur.
   */
  scan_url: string | null;
  owner: { id: string; type: "organizer" | "location"; name: string } | null;
  status: string;
  due: boolean;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  frequency_days: number;
  scan_count: number;
  discovery_count: number;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function fetchAgentSources(ctx: AgentContext): Promise<AgentSource[]> {
  const [sourcesRes, organizersRes, locationsRes, agendasRes] = await Promise.all([
    ctx.supabase
      .from("intake_sources_view")
      .select(
        "id, name, url, status, organizer_id, organizer_location_id, scan_frequency_days, last_scanned_at, next_scan_at, scan_count, discovery_count",
      ),
    ctx.supabase.from("organizers").select("id, name"),
    ctx.supabase.from("locations").select("id, name"),
    ctx.supabase.from("organizer_agenda_scraping_configs").select("organizer_id, location_id, agenda_url"),
  ]);
  const error = sourcesRes.error || organizersRes.error || locationsRes.error;
  if (error) throw error;

  const names = new Map<string, string>();
  for (const row of [...(organizersRes.data || []), ...(locationsRes.data || [])] as any[]) names.set(row.id, row.name);
  const agendaByOwner = new Map<string, string>();
  for (const row of (agendasRes.data || []) as any[]) {
    const ownerId = row.location_id || row.organizer_id;
    if (ownerId && row.agenda_url && !agendaByOwner.has(ownerId)) agendaByOwner.set(ownerId, row.agenda_url);
  }

  const now = Date.now();
  return ((sourcesRes.data || []) as any[]).map((row) => {
    const kind = getSourceKind(row.url);
    const ownerId: string | null = row.organizer_id || row.organizer_location_id || null;
    return {
      id: row.id,
      name: row.name,
      kind,
      url: row.url,
      scan_url:
        kind === "facebook" ? row.url : kind === "website" ? (ownerId && agendaByOwner.get(ownerId)) || row.url : null,
      owner: ownerId
        ? {
            id: ownerId,
            type: row.organizer_id ? ("organizer" as const) : ("location" as const),
            name: names.get(ownerId) || row.name,
          }
        : null,
      status: row.status,
      due: row.status === "active" && (!row.next_scan_at || Date.parse(row.next_scan_at) <= now),
      last_reviewed_at: row.last_scanned_at,
      next_review_at: row.next_scan_at,
      frequency_days: row.scan_frequency_days,
      scan_count: row.scan_count ?? 0,
      discovery_count: row.discovery_count ?? 0,
    };
  });
}

export async function listAgentSources(
  ctx: AgentContext,
  { dueOnly = true, kind = "all" }: { dueOnly?: boolean; kind?: "all" | "website" | "social" },
) {
  const sources = await fetchAgentSources(ctx);
  return sources
    .filter((source) => (dueOnly ? source.due : true))
    .filter((source) => (kind === "all" ? true : kind === "website" ? source.kind === "website" : source.kind !== "website"))
    .sort((left, right) => {
      const leftTime = left.next_review_at ? Date.parse(left.next_review_at) : 0;
      const rightTime = right.next_review_at ? Date.parse(right.next_review_at) : 0;
      return leftTime - rightTime || left.name.localeCompare(right.name, "fr");
    });
}

export async function getAgentSource(ctx: AgentContext, sourceId: string) {
  return (await fetchAgentSources(ctx)).find((source) => source.id === sourceId) ?? null;
}

/**
 * Source suivie d'où vient une page : par identifiant, sinon par le site ou le compte.
 * Seule une source active compte comme « connue » (publication directe possible).
 */
export async function resolveKnownSource(
  ctx: AgentContext,
  { sourceId, url }: { sourceId?: string | null; url?: string | null },
): Promise<AgentSource | null> {
  const sources = (await fetchAgentSources(ctx)).filter((source) => source.status === "active");
  if (sourceId) return sources.find((source) => source.id === sourceId) ?? null;
  if (!url) return null;

  const kind = getSourceKind(url);
  if (kind === "website") {
    const host = hostOf(url);
    if (!host || isSharedHost(host)) return null;
    const websites = sources.filter((source) => source.kind === "website");
    const hostsOf = (source: AgentSource) =>
      [source.url, source.scan_url].filter((value): value is string => Boolean(value)).map(hostOf);
    // Même hôte, sinon même domaine (« www.lastrolabe.org » et « billetterie.lastrolabe.org »),
    // sauf pour les plateformes partagées dont seul le sous-domaine désigne un lieu.
    const domain = baseDomain(host);
    return (
      websites.find((source) => hostsOf(source).includes(host)) ??
      (isSharedHost(domain)
        ? null
        : websites.find((source) => hostsOf(source).some((value) => !isSharedHost(value) && baseDomain(value) === domain))) ??
      null
    );
  }
  const handle = getSocialHandle(url);
  if (!handle) return null;
  return sources.find((source) => source.kind === kind && getSocialHandle(source.url) === handle) ?? null;
}

/** Marque une source revue : elle revient dans « À revoir » après sa fréquence de revue. */
export async function markAgentSourceReviewed(ctx: AgentContext, sourceId: string, imported = 0) {
  const { data: source, error } = await ctx.supabase
    .from("event_sources")
    .select("id, name, scan_frequency_days, scan_count, discovery_count, next_scan_at")
    .eq("id", sourceId)
    .single();
  if (error || !source) throw new Error(error?.message || "Source introuvable");

  const now = new Date();
  const update = {
    last_scanned_at: now.toISOString(),
    next_scan_at: addDays(now, source.scan_frequency_days || 7).toISOString(),
    scan_count: (source.scan_count || 0) + 1,
    ...(imported > 0 ? { discovery_count: (source.discovery_count || 0) + imported, last_found_at: now.toISOString() } : {}),
  };
  if (!ctx.dryRun) {
    const { error: updateError } = await ctx.supabase.from("event_sources").update(update).eq("id", sourceId);
    if (updateError) throw new Error(updateError.message);
    // Historique des revues (colonnes communes à toutes les versions de la table).
    const { error: logError } = await ctx.supabase.from("event_source_scan_logs").insert({
      source_id: sourceId,
      action: "scanned",
      scanned_at: update.last_scanned_at,
      previous_next_scan_at: source.next_scan_at,
      next_scan_at: update.next_scan_at,
      previous_scan_count: source.scan_count,
      scan_count: update.scan_count,
      opportunities_found: imported,
      notes: `Revue par l'agent${imported > 0 ? ` (${imported} événement${imported > 1 ? "s" : ""} importé${imported > 1 ? "s" : ""})` : ""}.`,
      created_by: null,
    });
    if (logError) console.warn("Historique de revue non enregistré:", logError.message);
  }
  return { source_id: sourceId, name: source.name, next_review_at: update.next_scan_at, dry_run: ctx.dryRun || undefined };
}

/** Source d'une fiche créée par l'agent : suivie (« active ») ou en pause, à réactiver dans la Collecte de l'admin. */
export type CreatedOwnerSource = { id: string; url: string; status: string };

/**
 * Source de collecte d'une fiche que l'agent vient de créer. Les triggers des migrations 20260429105500 et
 * 20260429114500 en créent une pour un organisateur, ou un lieu-organisateur, qui a un lien (site, sinon
 * Instagram, sinon Facebook) : active et à revoir tout de suite, comme une fiche créée dans l'admin. Créée par
 * l'agent, elle passe en pause sauf `follow` : suivre une source (relue à chaque collecte, publication directe)
 * reste le choix de l'utilisateur. Le trigger la réactive si le nom ou un lien de la fiche change.
 */
export async function settleCreatedOwnerSource(
  ctx: AgentContext,
  owner: { type: "organizer" | "location"; id: string },
  follow: boolean,
): Promise<CreatedOwnerSource | null> {
  const { data: source, error } = await ctx.supabase
    .from("event_sources")
    .select("id, url, status, notes")
    .eq(owner.type === "organizer" ? "organizer_id" : "organizer_location_id", owner.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source) return null;
  if (follow || source.status !== "active") return { id: source.id, url: source.url, status: source.status };

  const note = "[agent] Fiche créée par la collecte : source en pause, à réactiver pour la suivre.";
  const { error: updateError } = await ctx.supabase
    .from("event_sources")
    .update({ status: "paused", notes: [source.notes, note].filter(Boolean).join("\n") })
    .eq("id", source.id);
  if (updateError) throw new Error(updateError.message);
  return { id: source.id, url: source.url, status: "paused" };
}
