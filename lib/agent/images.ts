import type { SupabaseClient } from "@supabase/supabase-js";

import { downloadImage } from "@/lib/image-cards/service";
import type { AgentContext } from "./context";

/** Le stockage est limité à 2 Mo par image (voir docs/SUPABASE_STORAGE_2MB_LIMIT.md). */
const MAX_STORED_BYTES = 2 * 1024 * 1024;
/** CDN dont les liens signés expirent : sans copie, l'image finirait cassée. */
const EXPIRING_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
/** Formats gardés tels quels ; les autres (AVIF, HEIF, TIFF…), que l'app n'affiche pas, passent en JPEG. */
const KEPT_FORMATS: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type CopiedImage = { url: string; copied: boolean; error?: string };
export type StoredImage = { url: string; contentType: string; bytes: number };
export type StorageTarget = { bucket: string; folder?: string };

/** Adresse publique d'un fichier de Storage : rien à copier. */
export function isStorageUrl(url: string) {
  return url.includes("/storage/v1/object/public/");
}

/**
 * Prépare une image pour Storage. Le format est lu dans le fichier, pas dans l'en-tête HTTP : des
 * hébergeurs envoient leurs affiches en `application/octet-stream` (S3 de Weezevent). JPEG pour les
 * formats que l'app n'affiche pas ; au-delà de 2 Mo, réduite à 1 600 px de côté au plus.
 */
export async function prepareImage(buffer: Buffer): Promise<{ buffer: Buffer; contentType: string }> {
  const { default: sharp } = await import("sharp");
  let format: string | undefined;
  try {
    ({ format } = await sharp(buffer).metadata());
  } catch {
    throw new Error("Ce lien n'est pas une image lisible");
  }
  if (format === "svg") throw new Error("Image SVG non prise en charge");
  if (!format) throw new Error("Ce lien n'est pas une image lisible");

  const kept = KEPT_FORMATS[format];
  if (kept && buffer.byteLength <= MAX_STORED_BYTES) return { buffer, contentType: kept };
  if (format === "gif") throw new Error("Image trop lourde pour le stockage (plus de 2 Mo)");
  for (const [size, quality] of [
    [1600, 82],
    [1200, 75],
  ] as const) {
    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (resized.byteLength <= MAX_STORED_BYTES) return { buffer: resized, contentType: "image/jpeg" };
  }
  throw new Error("Image trop lourde pour le stockage, même réduite");
}

/** Dépose une image dans Storage (nom unique, comme les envois de l'admin) et renvoie son adresse publique. */
export async function storeImage(
  supabase: SupabaseClient,
  image: Buffer,
  { bucket, folder }: StorageTarget,
): Promise<StoredImage> {
  const { buffer, contentType } = await prepareImage(image);
  const path = `${folder ? `${folder}/` : ""}${Date.now()}-${Math.random().toString(36).slice(2)}.${EXTENSIONS[contentType]}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw error;
  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, contentType, bytes: buffer.byteLength };
}

/**
 * Télécharge une image distante (15 Mo au plus, ni hôte local ni adresse IP, redirections vérifiées :
 * `downloadImage` des vignettes) et la dépose dans Storage.
 */
export async function copyRemoteImage(supabase: SupabaseClient, url: string, target: StorageTarget) {
  return storeImage(supabase, await downloadImage(url), target);
}

/**
 * Copie une image distante dans le stockage Supabase et renvoie son adresse publique.
 * En cas d'échec, l'adresse d'origine est gardée sauf pour les CDN à liens expirants ; le cron des
 * vignettes retente la copie des affiches chaque nuit (lib/image-cards/external-posters.ts).
 */
export async function copyImageToStorage(
  ctx: AgentContext,
  rawUrl: string | null | undefined,
  target: StorageTarget,
): Promise<CopiedImage> {
  const url = (rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return { url: "", copied: false };
  if (isStorageUrl(url)) return { url, copied: false };

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { url: "", copied: false, error: "Adresse d'image invalide" };
  }
  if (ctx.dryRun) return { url, copied: false };

  try {
    return { url: (await copyRemoteImage(ctx.supabase, url, target)).url, copied: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copie de l'image impossible";
    return { url: EXPIRING_CDN.test(host) ? "" : url, copied: false, error: message };
  }
}
