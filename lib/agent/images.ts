import type { AgentContext } from "./context";

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
/** Le stockage est limité à 2 Mo par image (voir docs/SUPABASE_STORAGE_2MB_LIMIT.md). */
const MAX_STORED_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** CDN dont les liens signés expirent : sans copie, l'image finirait cassée. */
const EXPIRING_CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

export type CopiedImage = { url: string; copied: boolean; error?: string };

/** Réduit une image trop lourde (1 600 px de côté au plus, JPEG) pour tenir sous 2 Mo. */
async function fitImage(buffer: Buffer, type: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (buffer.byteLength <= MAX_STORED_BYTES || type === "image/gif" || type === "image/svg+xml") {
    if (buffer.byteLength > MAX_STORED_BYTES) throw new Error("Image trop lourde pour le stockage (plus de 2 Mo)");
    return { buffer, contentType: type };
  }
  const { default: sharp } = await import("sharp");
  for (const [size, quality] of [
    [1600, 82],
    [1200, 75],
  ] as const) {
    const resized = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (resized.byteLength <= MAX_STORED_BYTES) return { buffer: resized, contentType: "image/jpeg" };
  }
  throw new Error("Image trop lourde pour le stockage, même réduite");
}

/**
 * Copie une image distante dans le stockage Supabase et renvoie son adresse publique.
 * En cas d'échec, l'adresse d'origine est gardée sauf pour les CDN à liens expirants.
 */
export async function copyImageToStorage(
  ctx: AgentContext,
  rawUrl: string | null | undefined,
  { bucket, folder }: { bucket: string; folder?: string },
): Promise<CopiedImage> {
  const url = (rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return { url: "", copied: false };
  if (url.includes("/storage/v1/object/public/")) return { url, copied: false };

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { url: "", copied: false, error: "Adresse d'image invalide" };
  }
  if (ctx.dryRun) return { url, copied: false };

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Image inaccessible (HTTP ${response.status})`);
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) throw new Error(`Ce lien n'est pas une image (${type || "type inconnu"})`);
    const downloaded = Buffer.from(await response.arrayBuffer());
    if (downloaded.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("Image trop lourde (plus de 15 Mo)");

    const { buffer, contentType } = await fitImage(downloaded, type);
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "jpg";
    const path = `${folder ? `${folder}/` : ""}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await ctx.supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType, cacheControl: "3600", upsert: false });
    if (error) throw error;
    return { url: ctx.supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, copied: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copie de l'image impossible";
    return { url: EXPIRING_CDN.test(host) ? "" : url, copied: false, error: message };
  }
}
