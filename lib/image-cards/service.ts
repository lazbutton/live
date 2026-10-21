/*
 * Vignettes des affiches (events.image_card_url, image_width, image_height, image_color) :
 * téléchargement de l'affiche, rendu (render.ts), dépôt dans Storage, écriture en base.
 * Appelé par le webhook de la base (POST /api/events/[id]/image-card), le cron quotidien
 * (GET /api/cron/image-cards) et le script de rattrapage (scripts/backfill-image-cards.mjs).
 * Mode d'emploi : docs/EVENT_IMAGE_CARDS.md.
 *
 * Une vignette n'est écrite que si image_url n'a pas changé depuis la lecture : quand l'affiche
 * change, la base remet ces colonnes à null et le webhook de la nouvelle affiche prend le relais.
 */
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TablesUpdate } from "@/lib/supabase/database.types";
import { ImageCardError, renderImageCard } from "./render";

type Client = SupabaseClient<Database>;

export const CARDS_BUCKET = "event-images";
/** Un fichier par adresse d'affiche, partagé par les séances qui la reprennent. */
const CARDS_FOLDER = "cards";
/**
 * Version du rendu (render.ts), dans le chemin des vignettes (`cards/v2/…`). À changer si le rendu
 * change : nouvelles adresses, pas de cache périmé ; les vignettes d'une autre version restent
 * affichées jusqu'à être refaites par le rattrapage (scripts/backfill-image-cards.mjs). 1 : 800 px,
 * 70 Ko, fichiers à la racine de `cards/` (C7a) ; 2 : 1 200 px, 140 Ko (C7b).
 */
const CARD_VERSION = 2;
const CURRENT_CARDS_FOLDER = `${CARDS_FOLDER}/v${CARD_VERSION}`;
/** Adresses des vignettes de la version courante (motif `like` de PostgREST). */
const CURRENT_CARD_PATTERN = `%/${CARDS_BUCKET}/${CURRENT_CARDS_FOLDER}/%`;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PAGE_SIZE = 1000;

export type ImageCardColumns = {
  image_card_url: string;
  image_width: number;
  image_height: number;
  image_color: string;
};

export type ImageCardResult =
  | { eventId: string; status: "created"; card: ImageCardColumns; bytes: number }
  | { eventId: string; status: "reused"; card: ImageCardColumns }
  /** `stale` : l'affiche a changé pendant le traitement ; `up_to_date` : vignette déjà faite. */
  | { eventId: string; status: "up_to_date" | "no_image" | "not_found" | "stale" }
  /** `retry` : échec passager, rien n'est noté ; sinon l'échec est noté dans image_card_error. */
  | { eventId: string; status: "failed"; error: string; retry: boolean };

export type PendingImageCard = { id: string; image_url: string };

export type ImageCardReport = {
  /** Événements traités et affiches distinctes parmi eux. */
  events: number;
  images: number;
  created: number;
  reused: number;
  failed: number;
  retryLater: number;
  stale: number;
  /** Pas traités faute de temps (repris au prochain passage). */
  notProcessed: number;
  /** Vignettes fabriquées (une par affiche) et leur poids, en octets. */
  cards: number;
  averageBytes: number | null;
  maxBytes: number | null;
  errors: Array<{ eventId: string; imageUrl: string; error: string }>;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Chemin de la vignette d'une affiche, dans le bucket des affiches. */
export function imageCardPath(imageUrl: string) {
  const hash = createHash("sha256").update(`v${CARD_VERSION}:${imageUrl.trim()}`).digest("hex");
  return `${CURRENT_CARDS_FOLDER}/${hash.slice(0, 32)}.webp`;
}

/** Vignette faite par le rendu actuel (sinon : à refaire, mais affichable d'ici là). */
export function isCurrentImageCard(imageCardUrl: string | null | undefined) {
  return Boolean(imageCardUrl?.includes(`/${CARDS_BUCKET}/${CURRENT_CARDS_FOLDER}/`));
}

/** Adresse téléchargeable : http(s), sans identifiants, ni hôte local ni adresse IP. */
function checkImageUrl(raw: string, base?: URL) {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new ImageCardError("Adresse d'image invalide");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ImageCardError("Adresse d'image invalide (http ou https attendu)");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    url.username ||
    url.password ||
    isIP(host) ||
    !host.includes(".") ||
    /\.(localhost|local|internal)$/.test(host)
  ) {
    throw new ImageCardError("Adresse d'image refusée (hôte local ou adresse IP)");
  }
  return url;
}

/** Télécharge une affiche (15 Mo au plus) ; les redirections sont vérifiées une à une. */
export async function downloadImage(imageUrl: string): Promise<Buffer> {
  let url = checkImageUrl(imageUrl.trim());
  for (let redirects = 0; ; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        redirect: "manual",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ImageCardError(`Image injoignable (${errorMessage(error)})`, true);
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (redirects >= MAX_REDIRECTS) throw new ImageCardError("Image inaccessible (trop de redirections)");
      url = checkImageUrl(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      const retry = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new ImageCardError(`Image inaccessible (HTTP ${response.status})`, retry);
    }
    if (Number(response.headers.get("content-length") || 0) > MAX_DOWNLOAD_BYTES) {
      await response.body?.cancel();
      throw new ImageCardError("Image trop lourde (plus de 15 Mo)");
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new ImageCardError(`Téléchargement de l'image interrompu (${errorMessage(error)})`, true);
    }
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new ImageCardError("Image trop lourde (plus de 15 Mo)");
    if (buffer.byteLength === 0) throw new ImageCardError("Image vide");
    return buffer;
  }
}

/** Fabrique la vignette d'une affiche et la dépose dans Storage (même adresse si déjà faite). */
export async function createImageCard(supabase: Client, imageUrl: string) {
  const rendered = await renderImageCard(await downloadImage(imageUrl));
  const path = imageCardPath(imageUrl);
  const storage = supabase.storage.from(CARDS_BUCKET);
  const { error } = await storage.upload(path, rendered.webp, {
    contentType: "image/webp",
    // Adresse propre à l'affiche et à CARD_VERSION : son contenu ne change pas.
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new ImageCardError(`Dépôt de la vignette impossible (${error.message})`, true);

  const card: ImageCardColumns = {
    image_card_url: storage.getPublicUrl(path).data.publicUrl,
    image_width: rendered.width,
    image_height: rendered.height,
    image_color: rendered.color,
  };
  return { card, bytes: rendered.webp.byteLength };
}

/** Vignette déjà faite par le rendu actuel pour la même affiche (séances, événement dupliqué). */
async function findExistingCard(supabase: Client, imageUrl: string): Promise<ImageCardColumns | null> {
  const { data, error } = await supabase
    .from("events")
    .select("image_card_url, image_width, image_height, image_color")
    .eq("image_url", imageUrl)
    .like("image_card_url", CURRENT_CARD_PATTERN)
    .limit(1);
  if (error) throw new ImageCardError(`Lecture des vignettes impossible (${error.message})`, true);
  const row = data?.[0];
  if (!row?.image_card_url || !row.image_width || !row.image_height || !row.image_color) return null;
  return {
    image_card_url: row.image_card_url,
    image_width: row.image_width,
    image_height: row.image_height,
    image_color: row.image_color,
  };
}

/** Écrit sur les événements dont l'affiche est toujours `imageUrl` ; renvoie leurs ids. */
async function writeIfUnchanged(
  supabase: Client,
  eventIds: string[],
  imageUrl: string,
  values: TablesUpdate<"events">,
) {
  const { data, error } = await supabase
    .from("events")
    .update(values)
    .in("id", eventIds)
    .eq("image_url", imageUrl)
    .select("id");
  if (error) throw new ImageCardError(`Écriture de la vignette impossible (${error.message})`, true);
  return new Set((data ?? []).map((row) => row.id));
}

/** Vignette d'une affiche, posée sur les événements qui la partagent. */
async function applyToGroup(supabase: Client, eventIds: string[], imageUrl: string): Promise<ImageCardResult[]> {
  try {
    let card = await findExistingCard(supabase, imageUrl);
    let bytes: number | null = null;
    if (!card) ({ card, bytes } = await createImageCard(supabase, imageUrl));
    const written = await writeIfUnchanged(supabase, eventIds, imageUrl, { ...card, image_card_error: null });
    return eventIds.map((eventId): ImageCardResult => {
      if (!written.has(eventId)) return { eventId, status: "stale" };
      return bytes === null ? { eventId, status: "reused", card } : { eventId, status: "created", card, bytes };
    });
  } catch (caught) {
    const error = caught instanceof ImageCardError ? caught : new ImageCardError(errorMessage(caught), true);
    if (!error.retry) {
      // Noté pour ne pas retenter chaque nuit ; effacé par la base quand l'affiche change.
      await writeIfUnchanged(supabase, eventIds, imageUrl, { image_card_error: error.message.slice(0, 500) }).catch(
        () => undefined,
      );
    }
    return eventIds.map((eventId) => ({ eventId, status: "failed", error: error.message, retry: error.retry }));
  }
}

/** Vignette d'un événement (webhook de la base). */
export async function refreshImageCard(supabase: Client, eventId: string): Promise<ImageCardResult> {
  const { data: event, error } = await supabase
    .from("events")
    .select("id, image_url, image_card_url")
    .eq("id", eventId)
    .maybeSingle();
  if (error) return { eventId, status: "failed", error: `Lecture de l'événement impossible (${error.message})`, retry: true };
  if (!event) return { eventId, status: "not_found" };
  if (!event.image_url?.trim()) return { eventId, status: "no_image" };
  if (isCurrentImageCard(event.image_card_url)) return { eventId, status: "up_to_date" };
  const [result] = await applyToGroup(supabase, [eventId], event.image_url);
  return result;
}

/**
 * Vignettes à faire : `missing`, aucune ; `outdated`, faite par un autre rendu (CARD_VERSION), affichée
 * d'ici là. Toujours pour un événement avec une affiche, sans échec noté (sauf `retryErrors`).
 */
export type ImageCardNeed = "missing" | "outdated";

type ListOptions = { limit?: number; retryErrors?: boolean; need?: ImageCardNeed };

/** Événements dont la vignette est à faire ([ImageCardNeed]), les plus récents d'abord. */
export async function listMissingImageCards(
  supabase: Client,
  { limit = Number.POSITIVE_INFINITY, retryErrors = false, need = "missing" }: ListOptions = {},
): Promise<PendingImageCard[]> {
  const rows: PendingImageCard[] = [];
  while (rows.length < limit) {
    const size = Math.min(PAGE_SIZE, limit - rows.length);
    let query = supabase.from("events").select("id, image_url").not("image_url", "is", null).neq("image_url", "");
    query =
      need === "missing"
        ? query.is("image_card_url", null)
        : query.not("image_card_url", "is", null).not("image_card_url", "like", CURRENT_CARD_PATTERN);
    if (!retryErrors) query = query.is("image_card_error", null);
    const { data, error } = await query
      .order("date", { ascending: false })
      .order("id")
      .range(rows.length, rows.length + size - 1);
    if (error) throw new Error(`Lecture des événements sans vignette impossible (${error.message})`);
    for (const row of data ?? []) if (row.image_url) rows.push({ id: row.id, image_url: row.image_url });
    if ((data ?? []).length < size) break;
  }
  return rows;
}

export async function countMissingImageCards(
  supabase: Client,
  { retryErrors = false, need = "missing" }: Omit<ListOptions, "limit"> = {},
) {
  let query = supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .not("image_url", "is", null)
    .neq("image_url", "");
  query =
    need === "missing"
      ? query.is("image_card_url", null)
      : query.not("image_card_url", "is", null).not("image_card_url", "like", CURRENT_CARD_PATTERN);
  if (!retryErrors) query = query.is("image_card_error", null);
  const { count, error } = await query;
  if (error) throw new Error(`Comptage des événements sans vignette impossible (${error.message})`);
  return count ?? 0;
}

/**
 * Pose les vignettes des événements donnés, `concurrency` affiches à la fois.
 * Après `deadline` (horodatage en ms), plus aucune affiche n'est commencée.
 */
export async function applyImageCards(
  supabase: Client,
  pending: PendingImageCard[],
  { deadline = Number.POSITIVE_INFINITY, concurrency = 3 }: { deadline?: number; concurrency?: number } = {},
) {
  const groups = new Map<string, string[]>();
  for (const { id, image_url } of pending) groups.set(image_url, [...(groups.get(image_url) ?? []), id]);

  const queue = [...groups.entries()];
  const results: Array<ImageCardResult & { imageUrl: string }> = [];
  /** Poids de chaque vignette fabriquée (une par affiche). */
  const sizes: number[] = [];
  let images = 0;
  const worker = async () => {
    while (queue.length > 0 && Date.now() < deadline) {
      const [imageUrl, eventIds] = queue.shift()!;
      images += 1;
      const groupResults = await applyToGroup(supabase, eventIds, imageUrl);
      const created = groupResults.find((result) => result.status === "created");
      if (created?.status === "created") sizes.push(created.bytes);
      results.push(...groupResults.map((result) => ({ ...result, imageUrl })));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));

  const failures = results.flatMap((result) => (result.status === "failed" ? [result] : []));
  const report: ImageCardReport = {
    events: results.length,
    images,
    created: results.filter((result) => result.status === "created").length,
    reused: results.filter((result) => result.status === "reused").length,
    failed: failures.filter((failure) => !failure.retry).length,
    retryLater: failures.filter((failure) => failure.retry).length,
    stale: results.filter((result) => result.status === "stale").length,
    notProcessed: pending.length - results.length,
    cards: sizes.length,
    averageBytes: sizes.length ? Math.round(sizes.reduce((sum, size) => sum + size, 0) / sizes.length) : null,
    maxBytes: sizes.length ? Math.max(...sizes) : null,
    errors: failures
      .slice(0, 20)
      .map((failure) => ({ eventId: failure.eventId, imageUrl: failure.imageUrl, error: failure.error })),
  };
  return { results, report };
}

/**
 * Filet du webhook : vignettes manquantes, dans la limite de temps d'une fonction Vercel. Pas
 * celles d'un ancien rendu : les refaire réécrit tous les événements, c'est au rattrapage
 * (scripts/backfill-image-cards.mjs), lancé à la main.
 */
export async function fillMissingImageCards(
  supabase: Client,
  {
    limit = 200,
    deadline = Number.POSITIVE_INFINITY,
    retryErrors = false,
  }: { limit?: number; deadline?: number; retryErrors?: boolean } = {},
) {
  const pending = await listMissingImageCards(supabase, { limit, retryErrors });
  const { report } = await applyImageCards(supabase, pending, { deadline });
  return { ...report, remaining: await countMissingImageCards(supabase, { retryErrors }) };
}
