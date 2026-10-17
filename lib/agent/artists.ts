import { getSocialHandle } from "@/lib/collecte/source-kind";
import { artistRefusal, type ArtistContext } from "@/lib/events/artist-names";
import { normalizeName } from "@/lib/events/import-prefill";

import { logAgentAction } from "./audit";
import { invalidateAgentReferences, loadAgentReferences, type AgentContext } from "./context";
import { copyImageToStorage } from "./images";

export type AgentArtistInput = {
  name: string;
  instagram_url?: string | null;
  image_url?: string | null;
  origin_city?: string | null;
  short_description?: string | null;
  artist_type_label?: string | null;
};

export type AgentArtistResult = {
  id: string | null;
  name: string;
  created: boolean;
  skipped?: string;
};

/** « @handle », « handle » ou lien complet → https://www.instagram.com/handle/ */
export function normalizeInstagramUrl(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    const handle = getSocialHandle(raw);
    return handle ? `https://www.instagram.com/${handle}/` : null;
  }
  const handle = raw.replace(/^@/, "").replace(/\/+$/, "");
  return /^[a-z0-9._]{1,30}$/i.test(handle) ? `https://www.instagram.com/${handle.toLowerCase()}/` : null;
}

/** « GRAND GRAOU » → « Grand Graou » (les sigles sans voyelle, comme « MGMT », restent tels quels). */
export function tidyArtistName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const letters = trimmed.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4 || letters !== letters.toUpperCase() || !/[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]/.test(letters)) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-'’(])(\p{L})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\b(Dj|Mc)\b/g, (prefix) => prefix.toUpperCase());
}

/**
 * Retrouve un artiste (nom ou compte Instagram) ; le crée s'il n'existe pas et que `create` est vrai,
 * sauf refus : artiste non musical, titre de l'événement, prénom seul, atelier… (voir artistRefusal).
 */
export async function findOrCreateArtist(
  ctx: AgentContext,
  input: AgentArtistInput,
  { create = true, event }: { create?: boolean; event?: ArtistContext["event"] } = {},
): Promise<AgentArtistResult> {
  const name = tidyArtistName(input.name || "");
  if (!name) return { id: null, name, created: false, skipped: "Nom manquant" };

  const references = await loadAgentReferences(ctx);
  const key = normalizeName(name);
  const instagramUrl = normalizeInstagramUrl(input.instagram_url);
  const handle = instagramUrl ? getSocialHandle(instagramUrl) : "";
  const existing =
    references.artists.find((artist) => normalizeName(artist.name) === key) ||
    (handle
      ? references.artists.find((artist) => {
          const url = (artist as { instagram_url?: string | null }).instagram_url;
          return Boolean(url) && getSocialHandle(url as string) === handle;
        })
      : undefined);
  if (existing) return { id: existing.id, name: existing.name, created: false };

  if (!create) return { id: null, name, created: false, skipped: "Aucune fiche existante" };
  const refusal = artistRefusal(name, {
    event,
    hasInstagram: Boolean(instagramUrl),
    typeLabel: input.artist_type_label,
  });
  if (refusal) return { id: null, name, created: false, skipped: refusal };
  if (ctx.dryRun) return { id: null, name, created: true };

  const image = await copyImageToStorage(ctx, input.image_url, { bucket: "organizers-images", folder: "artists" });
  const { data, error } = await ctx.supabase
    .from("artists")
    .insert({
      name,
      instagram_url: instagramUrl,
      image_url: image.url || null,
      origin_city: input.origin_city?.trim() || null,
      short_description: input.short_description?.trim() || null,
      artist_type_label: input.artist_type_label?.trim() || null,
      created_by: null,
    })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message || "Artiste non créé");

  invalidateAgentReferences(ctx);
  await logAgentAction(ctx, {
    action: "artist.create",
    entityType: "artist",
    entityId: data.id,
    entityLabel: data.name,
    metadata: { instagram_url: instagramUrl },
  });
  return { id: data.id, name: data.name, created: true };
}
