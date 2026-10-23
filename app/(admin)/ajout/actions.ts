"use server";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { linkColumn, normalizeQuickLink, type QuickLink } from "@/lib/collecte/quick-links";
import { getSocialHandle, hostOf, isSharedHost } from "@/lib/collecte/source-kind";
import { createClient } from "@/lib/supabase/server";

/*
 * Ajout rapide depuis le téléphone (/ajout). Un lieu qui organise ses soirées ou une
 * structure, dès qu'ils ont un lien, reçoivent automatiquement leur source de collecte
 * (déclencheurs upsert_owner_source_from_*) : l'IA les lit à la collecte suivante.
 * Les écritures passent par la session de l'admin (RLS), comme le reste de l'admin.
 */

export type QuickEntryType = "location" | "organizer" | "artist";

export type QuickMatch = {
  type: QuickEntryType;
  id: string;
  name: string;
  /** Adresse du lieu ou lien principal de la fiche. */
  detail: string | null;
  /** Une source active la fait déjà lire par la collecte. */
  followed: boolean;
  /** Le lien saisi est déjà sur cette fiche. */
  sameLink: boolean;
  /** La fiche n'a pas encore de lien de ce type : on peut l'y ajouter. */
  canAttach: boolean;
};

export type QuickEntryInput = {
  type: QuickEntryType;
  name: string;
  link?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Lieu : organise ses propres soirées, donc suivi par la collecte. */
  follow?: boolean;
  artistType?: string | null;
  originCity?: string | null;
};

export type QuickEntryResult =
  | {
      ok: true;
      entry: { type: QuickEntryType; id: string; name: string };
      followed: boolean;
      linkLabel: string | null;
    }
  | { ok: false; error: string; duplicate?: QuickMatch };

type Failure = { ok: false; error: string };

type Candidate = {
  type: QuickEntryType;
  id: string;
  name: string;
  address?: string | null;
  is_organizer?: boolean | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
};

const TABLES: Record<QuickEntryType, string> = {
  location: "locations",
  organizer: "organizers",
  artist: "artists",
};

const LABELS: Record<QuickEntryType, string> = {
  location: "lieu",
  organizer: "structure",
  artist: "artiste",
};

async function adminSession(): Promise<{ supabase: SupabaseClient; user: User } | Failure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée : reconnecte-toi." };
  const role = user.app_metadata?.role;
  if (role !== "admin") return { ok: false, error: "Accès réservé aux administrateurs." };
  return { supabase, user };
}

function cleanText(value: string | null | undefined, max = 200) {
  return (value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

/** Nom comparable : sans accents, casse ni ponctuation (« Théâtre d'Orléans » → « theatre d orleans »). */
function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Début d'une page HTML (5 s au plus), pour en lire le nom. */
async function fetchPageHtml(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !/html/i.test(response.headers.get("content-type") || "")) return "";
    return (await response.text()).slice(0, 300_000);
  } finally {
    clearTimeout(timer);
  }
}

/** Lien saisi → lien exploitable, ou message à afficher. */
function parseLink(raw: string | null | undefined): { link: QuickLink | null } | Failure {
  if (!cleanText(raw)) return { link: null };
  const link = normalizeQuickLink(raw);
  if (!link) return { ok: false, error: "Lien non reconnu : colle l'adresse d'un compte Instagram, d'une page Facebook ou d'un site." };
  if (link.isPost) return { ok: false, error: "C'est une publication : colle plutôt le lien du compte ou de la page." };
  return { link };
}

async function loadCandidates(supabase: SupabaseClient): Promise<Candidate[]> {
  const [locations, organizers, artists] = await Promise.all([
    supabase.from("locations").select("id, name, address, is_organizer, instagram_url, facebook_url, website_url"),
    supabase.from("organizers").select("id, name, instagram_url, facebook_url, website_url"),
    supabase.from("artists").select("id, name, instagram_url, website_url"),
  ]);
  const error = locations.error || organizers.error || artists.error;
  if (error) throw new Error(error.message);
  return [
    ...(locations.data || []).map((row) => ({ ...row, type: "location" as const })),
    ...(organizers.data || []).map((row) => ({ ...row, type: "organizer" as const })),
    ...(artists.data || []).map((row) => ({ ...row, type: "artist" as const })),
  ];
}

/** Propriétaires (structures et lieux) dont la source de collecte est active. */
async function loadFollowedOwners(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("event_sources")
    .select("organizer_id, organizer_location_id, status")
    .eq("source_scope", "owner")
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return new Set((data || []).map((row) => row.organizer_id || row.organizer_location_id).filter(Boolean) as string[]);
}

function candidateLinks(candidate: Candidate) {
  return [candidate.instagram_url, candidate.facebook_url, candidate.website_url].filter((value): value is string =>
    Boolean(value?.trim()),
  );
}

function sameLink(link: QuickLink, url: string) {
  const other = normalizeQuickLink(url);
  if (!other || other.kind !== link.kind) return false;
  if (link.kind !== "website") return Boolean(link.handle) && link.handle === getSocialHandle(other.url);
  const host = hostOf(link.url);
  return Boolean(host) && host === hostOf(other.url) && (!isSharedHost(host) || link.url === other.url);
}

function canAttach(candidate: Candidate, link: QuickLink | null) {
  if (!link) return false;
  if (candidate.type === "artist" && link.kind === "facebook") return false;
  return !cleanText(candidate[linkColumn(link.kind)]);
}

function toMatch(candidate: Candidate, link: QuickLink | null, followedOwners: Set<string>): QuickMatch {
  const links = candidateLinks(candidate);
  return {
    type: candidate.type,
    id: candidate.id,
    name: candidate.name,
    detail: candidate.type === "location" ? candidate.address || null : (links[0] ? normalizeQuickLink(links[0])?.label ?? links[0] : null),
    followed: candidate.type !== "artist" && followedOwners.has(candidate.id),
    sameLink: Boolean(link) && links.some((url) => sameLink(link as QuickLink, url)),
    canAttach: canAttach(candidate, link),
  };
}

function rankMatches(candidates: Candidate[], name: string, link: QuickLink | null, followedOwners: Set<string>) {
  const key = normalizeName(name);
  const scored: Array<{ match: QuickMatch; score: number }> = [];
  for (const candidate of candidates) {
    const match = toMatch(candidate, link, followedOwners);
    const candidateKey = normalizeName(candidate.name);
    let score = 0;
    if (match.sameLink) score = 3;
    else if (key && candidateKey === key) score = 2;
    else if (key.length >= 4 && candidateKey.length >= 4 && (candidateKey.includes(key) || key.includes(candidateKey))) score = 1;
    if (score) scored.push({ match, score });
  }
  return scored.sort((left, right) => right.score - left.score).map((item) => item.match);
}

/** Fiches existantes qui ressemblent à la saisie (même lien, même nom ou nom proche). */
export async function findQuickMatches(input: { name: string; link?: string | null }): Promise<
  { ok: true; matches: QuickMatch[] } | Failure
> {
  const session = await adminSession();
  if ("ok" in session) return session;
  const link = normalizeQuickLink(input.link);
  const name = cleanText(input.name, 120);
  if (normalizeName(name).length < 3 && !link) return { ok: true, matches: [] };
  try {
    const [candidates, followedOwners] = await Promise.all([loadCandidates(session.supabase), loadFollowedOwners(session.supabase)]);
    return { ok: true, matches: rankMatches(candidates, name, link?.isPost ? null : link, followedOwners).slice(0, 5) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Recherche impossible" };
  }
}

/** Nom d'un site (balise og:site_name ou titre) pour préremplir la saisie. */
export async function suggestNameFromWebsite(rawLink: string): Promise<{ ok: true; name: string } | Failure> {
  const session = await adminSession();
  if ("ok" in session) return session;
  const link = normalizeQuickLink(rawLink);
  const host = link ? hostOf(link.url) : "";
  // Seulement des sites publics : ni plateforme partagée, ni adresse locale ou IP.
  if (!link || link.kind !== "website" || isSharedHost(host) || host === "localhost" || /^[\d.]+$|:/.test(host)) {
    return { ok: true, name: "" };
  }
  try {
    const html = await fetchPageHtml(link.url);
    const meta = (property: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, "i"))?.[1];
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const raw = meta("og:site_name") || (title ? title.split(/\s[|–—-]\s/).pop() : "") || meta("og:title") || "";
    const name = raw
      .replace(/&amp;/g, "&")
      .replace(/&#0?39;|&rsquo;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    return { ok: true, name: name.length > 1 && name.length <= 80 ? name : "" };
  } catch {
    return { ok: true, name: "" };
  }
}

async function logQuickAction(
  supabase: SupabaseClient,
  user: User,
  action: string,
  entry: { type: QuickEntryType; id: string; name: string },
  metadata: Record<string, unknown>,
) {
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_user_id: user.id,
    actor_email: user.email ?? null,
    action,
    entity_type: entry.type,
    entity_id: entry.id,
    entity_label: entry.name,
    metadata: { via: "ajout-mobile", ...metadata },
  });
  if (error) console.warn("Audit log non enregistré:", error.message);
}

async function isFollowed(supabase: SupabaseClient, type: QuickEntryType, id: string) {
  if (type === "artist") return false;
  const { data } = await supabase
    .from("event_sources")
    .select("id")
    .eq(type === "organizer" ? "organizer_id" : "organizer_location_id", id)
    .eq("status", "active")
    .limit(1);
  return Boolean(data?.length);
}

/** Crée un lieu, une structure ou un artiste ; refuse un doublon évident (même lien ou même nom). */
export async function createQuickEntry(input: QuickEntryInput): Promise<QuickEntryResult> {
  const session = await adminSession();
  if ("ok" in session) return session;
  const { supabase, user } = session;

  const type = input.type;
  if (!TABLES[type]) return { ok: false, error: "Type inconnu." };
  const name = cleanText(input.name, 120);
  if (name.length < 2) return { ok: false, error: "Indique un nom." };
  const parsed = parseLink(input.link);
  if ("ok" in parsed) return parsed;
  const { link } = parsed;
  const address = cleanText(input.address, 300);
  if (type === "location" && address.length < 5) return { ok: false, error: "Indique l'adresse du lieu." };

  try {
    const [candidates, followedOwners] = await Promise.all([loadCandidates(supabase), loadFollowedOwners(supabase)]);
    const duplicate = rankMatches(
      candidates.filter((candidate) => candidate.type === type),
      name,
      link,
      followedOwners,
    ).find((match) => match.sameLink || normalizeName(match.name) === normalizeName(name));
    if (duplicate) {
      return { ok: false, error: `${duplicate.name} existe déjà (${LABELS[type]}).`, duplicate };
    }

    const linkFields = link ? { [linkColumn(link.kind)]: link.url } : {};
    const row =
      type === "location"
        ? {
            name,
            address,
            latitude: Number.isFinite(input.latitude) ? input.latitude : null,
            longitude: Number.isFinite(input.longitude) ? input.longitude : null,
            is_organizer: Boolean(input.follow),
            ...linkFields,
          }
        : type === "organizer"
          ? { name, ...linkFields }
          : {
              name,
              ...(link?.kind === "instagram" ? { instagram_url: link.url } : link ? { website_url: link.url } : {}),
              artist_type_label: cleanText(input.artistType, 60) || null,
              origin_city: cleanText(input.originCity, 80) || null,
              created_by: user.id,
            };

    const { data, error } = await supabase.from(TABLES[type]).insert(row).select("id, name").single();
    if (error || !data) return { ok: false, error: error?.message || "Enregistrement impossible." };

    const entry = { type, id: data.id as string, name: data.name as string };
    await logQuickAction(supabase, user, `${type}.create`, entry, { link: link?.url ?? null });
    return { ok: true, entry, followed: await isFollowed(supabase, type, entry.id), linkLabel: link?.label ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
}

/** Ajoute le lien saisi à une fiche existante qui ne l'a pas encore (et fait suivre un lieu). */
export async function attachLinkToEntry(input: {
  type: QuickEntryType;
  id: string;
  link: string;
  follow?: boolean;
}): Promise<QuickEntryResult> {
  const session = await adminSession();
  if ("ok" in session) return session;
  const { supabase, user } = session;

  const parsed = parseLink(input.link);
  if ("ok" in parsed) return parsed;
  const { link } = parsed;
  if (!link || !TABLES[input.type]) return { ok: false, error: "Lien manquant." };
  if (input.type === "artist" && link.kind === "facebook") {
    return { ok: false, error: "Une fiche artiste ne garde pas de page Facebook : colle son Instagram ou son site." };
  }

  const column = input.type === "artist" && link.kind !== "instagram" ? "website_url" : linkColumn(link.kind);
  const { data: current, error: readError } = await supabase
    .from(TABLES[input.type])
    .select(`id, name, ${column}`)
    .eq("id", input.id)
    .single();
  if (readError || !current) return { ok: false, error: readError?.message || "Fiche introuvable." };
  const existing = (current as Record<string, unknown>)[column];
  if (typeof existing === "string" && existing.trim()) {
    return { ok: false, error: "Cette fiche a déjà un lien de ce type : modifie-la depuis l'admin." };
  }

  const update: Record<string, unknown> = { [column]: link.url };
  if (input.type === "location" && input.follow) update.is_organizer = true;
  const { error } = await supabase.from(TABLES[input.type]).update(update).eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  const entry = { type: input.type, id: input.id, name: (current as { name: string }).name };
  await logQuickAction(supabase, user, `${input.type}.update`, entry, { link: link.url, attached: column });
  return { ok: true, entry, followed: await isFollowed(supabase, input.type, input.id), linkLabel: link.label };
}
