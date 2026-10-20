/*
 * Affiches hébergées hors de Storage (billetteries, sites des lieux, lien saisi dans Notion…),
 * recopiées dans le bucket des affiches : un hébergeur peut retirer son image (11 affiches
 * billetweb.fr en 404 le 2026-10-20) ou la refuser au web (CORS de lastrolabe.org). image_url
 * prend l'adresse de la copie ; la base remet alors la vignette à zéro et son webhook la refait
 * d'après la copie (docs/EVENT_IMAGE_CARDS.md).
 * Appelé par le cron quotidien (GET /api/cron/image-cards) et par scripts/copy-external-images.mjs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { copyRemoteImage, isStorageUrl } from "@/lib/agent/images";
import type { Database } from "@/lib/supabase/database.types";
import { CARDS_BUCKET } from "./service";

type Client = SupabaseClient<Database>;

/** Une affiche distante et les événements qui la portent (séances, doublons). */
export type ExternalPoster = { imageUrl: string; eventIds: string[] };

export type ExternalPosterResult =
  | (ExternalPoster & { status: "copied"; url: string; updated: number })
  | (ExternalPoster & { status: "failed"; error: string });

export type ExternalPostersReport = {
  /** Affiches distantes trouvées (dans la limite demandée) et événements qui les portent. */
  posters: number;
  events: number;
  copied: number;
  failed: number;
  /** Pas traitées faute de temps (reprises au prochain passage). */
  notProcessed: number;
  results: ExternalPosterResult[];
};

const PAGE_SIZE = 1000;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Affiches hors de Storage des événements non archivés, les plus proches d'abord. Une affiche
 * dont la vignette a échoué pour de bon (image_card_error) est laissée : sa copie échouerait aussi.
 */
export async function listExternalPosters(
  supabase: Client,
  { limit = Number.POSITIVE_INFINITY }: { limit?: number } = {},
): Promise<ExternalPoster[]> {
  const posters = new Map<string, string[]>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("events")
      .select("id, image_url")
      .not("image_url", "is", null)
      .neq("image_url", "")
      .not("image_url", "like", "%/storage/v1/object/public/%")
      .eq("archived", false)
      .is("image_card_error", null)
      .order("date", { ascending: false })
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Lecture des affiches hors de Storage impossible (${error.message})`);
    for (const { id, image_url: imageUrl } of data ?? []) {
      if (!imageUrl?.trim() || isStorageUrl(imageUrl)) continue;
      posters.set(imageUrl, [...(posters.get(imageUrl) ?? []), id]);
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return [...posters.entries()].slice(0, limit).map(([imageUrl, eventIds]) => ({ imageUrl, eventIds }));
}

/** Copie une affiche dans Storage et la pose sur les événements qui la portent toujours. */
async function copyPoster(supabase: Client, poster: ExternalPoster): Promise<ExternalPosterResult> {
  let url: string;
  try {
    ({ url } = await copyRemoteImage(supabase, poster.imageUrl, { bucket: CARDS_BUCKET }));
  } catch (error) {
    return { ...poster, status: "failed", error: errorMessage(error) };
  }
  // Toutes les lignes qui portent encore cette adresse, séances archivées comprises.
  const { data, error } = await supabase
    .from("events")
    .update({ image_url: url })
    .eq("image_url", poster.imageUrl)
    .select("id");
  if (error) return { ...poster, status: "failed", error: `Écriture de l'affiche impossible (${error.message})` };
  return { ...poster, status: "copied", url, updated: (data ?? []).length };
}

/**
 * Recopie dans Storage les affiches distantes, `limit` au plus, une à la fois. Après `deadline`
 * (horodatage en ms), plus aucune copie n'est commencée.
 */
export async function copyExternalPosters(
  supabase: Client,
  { limit = Number.POSITIVE_INFINITY, deadline = Number.POSITIVE_INFINITY }: { limit?: number; deadline?: number } = {},
): Promise<ExternalPostersReport> {
  const pending = await listExternalPosters(supabase, { limit });
  const results: ExternalPosterResult[] = [];
  for (const poster of pending) {
    if (Date.now() >= deadline) break;
    results.push(await copyPoster(supabase, poster));
  }
  return {
    posters: pending.length,
    events: pending.reduce((sum, poster) => sum + poster.eventIds.length, 0),
    copied: results.filter((result) => result.status === "copied").length,
    failed: results.filter((result) => result.status === "failed").length,
    notProcessed: pending.length - results.length,
    results,
  };
}
