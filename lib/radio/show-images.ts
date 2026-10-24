/*
 * Radio : les visuels gardés des émissions (../live/docs/fonctionnalites/radio.md, « Les pochettes »).
 *
 * Chaque émission a sa pochette, dessinée par l'app dans la charte de la radio. Celles dont le visuel
 * tient en carré le gardent à la place : recadré en carré (1 200 px au plus, jamais agrandi), en WebP, dans
 * organizers-images/radio-shows/ comme les photos des artistes ; radio_shows.image_url pointe dessus
 * (null : la pochette). L'import horaire n'y touche pas. Posés par scripts/radio-show-images.mjs (les onze
 * choisis le 2026-10-23) et par le back-office (/admin/radio).
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";

type Client = SupabaseClient<Database>;

export const RADIO_SHOW_IMAGES = { bucket: "organizers-images", folder: "radio-shows" } as const;

/** Côté du carré, au plus. */
const MAX_SIDE = 1200;

/** Part de pixels transparents au-delà de laquelle un visuel est un logo détouré. */
const TRANSPARENT_SHARE = 0.2;

/**
 * Comment un visuel devient carré : recadré au centre (`cover`) ; posé entier sur le noir des pochettes,
 * avec une marge (`contain`, un logo détouré) ; ou un carré choisi, en fractions de la largeur et de la
 * hauteur de l'image (`crop` : `left`, `top`, et `size` en fraction du petit côté).
 */
export type ShowImageFit =
  | { kind: "cover" }
  | { kind: "contain"; padding?: number }
  | { kind: "crop"; left: number; top: number; size: number };

/** Le recadrage par défaut d'un visuel envoyé : sur le noir s'il est détouré, sinon au centre. */
export async function defaultShowImageFit(input: Buffer): Promise<ShowImageFit> {
  const { default: sharp } = await import("sharp");
  const image = sharp(input, { failOn: "none" });
  const { hasAlpha } = await image.metadata();
  if (!hasAlpha) return { kind: "cover" };
  const { data, info } = await image.ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (const value of data) if (value < 16) transparent += 1;
  return transparent / (info.width * info.height) > TRANSPARENT_SHARE ? { kind: "contain", padding: 0.08 } : { kind: "cover" };
}

/** Le visuel en carré, en WebP, sur le noir des pochettes là où il est transparent. */
export async function squareShowImage(input: Buffer, fit: ShowImageFit): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const flat = () => sharp(input, { failOn: "none" }).rotate().toColourspace("srgb").flatten({ background: "#000000" });
  const { width = 0, height = 0, orientation } = await sharp(input, { failOn: "none" }).metadata();
  // Une photo tournée par son EXIF : ses côtés s'échangent.
  const [w, h] = orientation && orientation >= 5 ? [height, width] : [width, height];
  if (!w || !h) throw new Error("Image illisible");

  if (fit.kind === "contain") {
    const side = Math.min(MAX_SIDE, Math.max(w, h));
    const inner = Math.max(1, Math.round(side * (1 - 2 * (fit.padding ?? 0))));
    const logo = await flat().resize({ width: inner, height: inner, fit: "inside" }).png().toBuffer();
    return sharp({ create: { width: side, height: side, channels: 3, background: "#000000" } })
      .composite([{ input: logo, gravity: "centre" }])
      .webp({ quality: 84 })
      .toBuffer();
  }

  if (fit.kind === "crop") {
    const size = Math.round(fit.size * Math.min(w, h));
    const left = Math.min(Math.max(0, Math.round(fit.left * w)), w - size);
    const top = Math.min(Math.max(0, Math.round(fit.top * h)), h - size);
    const side = Math.min(MAX_SIDE, size);
    return flat().extract({ left, top, width: size, height: size }).resize({ width: side, height: side }).webp({ quality: 84 }).toBuffer();
  }

  const side = Math.min(MAX_SIDE, w, h);
  return flat().resize({ width: side, height: side, fit: "cover", position: "centre" }).webp({ quality: 84 }).toBuffer();
}

/**
 * Dépose [image] (déjà carrée, WebP) pour l'émission [show] et la lui donne ; l'ancien fichier part s'il
 * n'est plus référencé. Le nom suit le contenu : un nouveau visuel a une nouvelle adresse (les caches).
 */
export async function setShowImage(supabase: Client, show: { id: string; slug: string; image_url: string | null }, image: Buffer) {
  const { bucket, folder } = RADIO_SHOW_IMAGES;
  const hash = createHash("sha1").update(image).digest("hex").slice(0, 12);
  const path = `${folder}/${show.slug}-${hash}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, image, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (uploadError) throw uploadError;
  const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from("radio_shows").update({ image_url: url }).eq("id", show.id);
  if (error) throw error;
  await removeReplacedStorageObject(supabase, {
    bucket,
    previousUrl: show.image_url,
    nextUrl: url,
    references: [{ table: "radio_shows", column: "image_url" }],
  });
  return url;
}

/** Retire le visuel de l'émission [show] : elle reprend sa pochette ; le fichier part s'il n'est plus référencé. */
export async function clearShowImage(supabase: Client, show: { id: string; image_url: string | null }) {
  const { error } = await supabase.from("radio_shows").update({ image_url: null }).eq("id", show.id);
  if (error) throw error;
  await removeReplacedStorageObject(supabase, {
    bucket: RADIO_SHOW_IMAGES.bucket,
    previousUrl: show.image_url,
    nextUrl: null,
    references: [{ table: "radio_shows", column: "image_url" }],
  });
}
