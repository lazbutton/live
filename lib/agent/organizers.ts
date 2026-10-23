import { logAgentAction } from "./audit";
import { invalidateAgentReferences, loadAgentReferences, type AgentContext } from "./context";
import { linkKeyLabel, linkKeys, nameProximity, normalizePlaceLinks, type PlaceLinks } from "./places";
import { settleCreatedOwnerSource, type CreatedOwnerSource } from "./sources";

/*
 * Organisateurs créés par l'agent de collecte (associations, collectifs, compagnies, programmateurs), comme
 * dans l'admin : un nom et au moins un lien public (site, Instagram, Facebook), lus sur leurs pages. Le
 * trigger format_entity_label met le nom en forme ; un organisateur qui a un lien reçoit une source de
 * collecte (trigger), mise en pause sauf `follow` (voir settleCreatedOwnerSource).
 *
 * Doublons écartés : même compte Instagram, même page Facebook ou même site qu'un organisateur ou un lieu ;
 * nom proche, sauf si les deux fiches ont des liens et qu'aucun ne se recoupe (deux structures différentes).
 * Une fiche existante n'est jamais modifiée.
 */

export type AgentOrganizerInput = {
  name: string;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  short_description?: string | null;
  /** Suivre sa source de collecte ; en pause sinon. */
  follow?: boolean;
};

export type AgentOrganizerResult = {
  status: "created" | "exists" | "refused";
  id?: string | null;
  name: string;
  /** organizer : fiche d'organisateur ; location : un lieu (lieu-organisateur ou non). */
  type?: "organizer" | "location";
  /** Fiche existante : ce qui la désigne (« même compte Instagram », « nom proche »…). */
  matched_by?: string;
  reason?: string;
  links?: PlaceLinks;
  source?: CreatedOwnerSource | { status: string } | null;
  dry_run?: boolean;
};

type Candidate = {
  id: string;
  name: string;
  type: "organizer" | "location";
  /** Lieu marqué lieu-organisateur (choisissable comme organisateur d'un événement). */
  organizer: boolean;
  keys: string[];
};

/**
 * Retrouve un organisateur (ou le lieu qui organise) par ses liens ou son nom ; le crée sinon, s'il a au moins
 * un lien. Un lieu retrouvé qui n'est pas lieu-organisateur se rattache comme lieu, pas comme organisateur.
 */
export async function findOrCreateOrganizer(ctx: AgentContext, input: AgentOrganizerInput): Promise<AgentOrganizerResult> {
  const name = (input.name || "").replace(/\s+/g, " ").trim();
  const base = { name, dry_run: ctx.dryRun || undefined };
  if (!name) return { ...base, status: "refused", reason: "Nom manquant" };

  const { links, invalid } = normalizePlaceLinks(input);
  const keys = linkKeys(links);
  const references = await loadAgentReferences(ctx);
  const candidates = new Map<string, Candidate>();
  for (const organizer of references.organizers) {
    candidates.set(organizer.id, {
      id: organizer.id,
      name: organizer.name,
      type: organizer.type,
      organizer: true,
      keys: linkKeys(organizer),
    });
  }
  for (const location of references.locations) {
    if (candidates.has(location.id)) continue;
    candidates.set(location.id, {
      id: location.id,
      name: location.name,
      type: "location",
      organizer: Boolean(location.is_organizer),
      keys: linkKeys(location),
    });
  }

  const existing = (candidate: Candidate, matchedBy: string): AgentOrganizerResult => ({
    ...base,
    status: "exists",
    id: candidate.id,
    name: candidate.name,
    type: candidate.type,
    matched_by: matchedBy,
    reason: candidate.organizer
      ? undefined
      : "C'est un lieu, pas un organisateur : rattache-le comme lieu (location_id) ; il ne devient organisateur qu'une fois marqué lieu-organisateur dans l'admin.",
  });

  // Mêmes liens : la même structure, quel que soit le nom.
  for (const candidate of candidates.values()) {
    const shared = candidate.keys.find((key) => keys.includes(key));
    if (shared) return existing(candidate, linkKeyLabel(shared));
  }
  // Même nom : la même structure. Nom proche : aussi, sauf liens connus des deux côtés (aucun ne se recoupe ici).
  // Le même nom d'abord, puis les organisateurs avant les simples lieux.
  const [byName] = [...candidates.values()]
    .map((candidate) => ({ candidate, proximity: nameProximity(candidate.name, name) }))
    .filter(
      ({ candidate, proximity }) => proximity === "same" || (proximity === "close" && !(keys.length && candidate.keys.length)),
    )
    .sort(
      (left, right) =>
        Number(right.proximity === "same") - Number(left.proximity === "same") ||
        Number(right.candidate.organizer) - Number(left.candidate.organizer),
    );
  if (byName) return existing(byName.candidate, byName.proximity === "same" ? "même nom" : "nom proche");

  const hasLink = keys.length > 0;
  if (!hasLink) {
    return {
      ...base,
      status: "refused",
      reason:
        "Lien manquant : un organisateur se crée avec son site, son compte Instagram ou sa page Facebook, lus sur ses pages" +
        (invalid.length ? ` (liens illisibles : ${invalid.join(", ")})` : "") +
        ".",
    };
  }

  const created: AgentOrganizerResult = {
    ...base,
    status: "created",
    id: null,
    type: "organizer",
    links,
    reason: invalid.length ? `Liens ignorés (ni un compte ni un site) : ${invalid.join(", ")}` : undefined,
    source: { status: input.follow ? "active" : "paused" },
  };
  if (ctx.dryRun) return created;

  const { data, error } = await ctx.supabase
    .from("organizers")
    .insert({ name, ...links, short_description: input.short_description?.trim() || null })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message || "Organisateur non créé");
  invalidateAgentReferences(ctx);

  const source = await settleCreatedOwnerSource(ctx, { type: "organizer", id: data.id }, Boolean(input.follow));
  await logAgentAction(ctx, {
    action: "organizer.create",
    entityType: "organizer",
    entityId: data.id,
    entityLabel: data.name,
    metadata: { ...links, source_id: source?.id ?? null, source_status: source?.status ?? null },
  });
  return { ...created, id: data.id, name: data.name, source };
}
