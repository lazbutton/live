/*
 * Vignette d'une affiche pour les listes de l'app (étape C7a de ../live/docs/PLAN_REFONTE.md) :
 * environ 800 px de large, WebP, 40 à 70 Ko. Donne aussi les dimensions de l'original
 * (orientation EXIF appliquée) et sa couleur dominante : l'app réserve la place de l'image, au
 * bon ratio et dans sa couleur, avant son arrivée.
 */
import type { OutputInfo } from "sharp";

/** Une carte pleine largeur sur téléphone : ~400 pt × 2. */
export const CARD_WIDTH = 800;
/** Une affiche très haute (programme, infographie) est bornée en hauteur. */
export const CARD_MAX_HEIGHT = 1600;
/** Poids visé ; la qualité baisse par paliers jusqu'à le tenir. */
export const CARD_MAX_BYTES = 70 * 1024;
const QUALITIES = [80, 70, 60, 50, 40];
/** ~40 Mpx : au-delà, le décodage risque de saturer la mémoire d'une fonction Vercel. */
const MAX_INPUT_PIXELS = 40_000_000;

/** Échec d'une vignette. `retry` : passager (réseau, stockage), à retenter plus tard. */
export class ImageCardError extends Error {
  readonly retry: boolean;

  constructor(message: string, retry = false) {
    super(message);
    this.name = "ImageCardError";
    this.retry = retry;
  }
}

export type RenderedImageCard = {
  webp: Buffer;
  /** Dimensions de l'original, orientation EXIF appliquée. */
  width: number;
  height: number;
  /** Couleur dominante, « #rrggbb ». */
  color: string;
  card: { width: number; height: number; quality: number };
};

function toHex({ r, g, b }: { r: number; g: number; b: number }) {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Vignette WebP d'une image (JPEG, PNG, WebP, GIF, AVIF…). Le SVG est refusé. */
export async function renderImageCard(input: Buffer): Promise<RenderedImageCard> {
  const { default: sharp } = await import("sharp");
  const open = () => sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS });

  try {
    const metadata = await open().metadata();
    if (metadata.format === "svg") throw new ImageCardError("Image SVG, non prise en charge");
    const { width, height } = metadata.autoOrient;
    if (!width || !height) throw new ImageCardError("Dimensions de l'image illisibles");

    const encode = async (quality: number) => {
      const { data, info }: { data: Buffer; info: OutputInfo } = await open()
        .rotate()
        .resize({ width: CARD_WIDTH, height: CARD_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
        .webp({ quality, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
      return { data, info, quality };
    };

    let card = await encode(QUALITIES[0]);
    for (const quality of QUALITIES.slice(1)) {
      if (card.data.byteLength <= CARD_MAX_BYTES) break;
      card = await encode(quality);
    }

    const { dominant } = await sharp(card.data).stats();
    return {
      webp: card.data,
      width,
      height,
      color: toHex(dominant),
      card: { width: card.info.width, height: card.info.height, quality: card.quality },
    };
  } catch (error) {
    if (error instanceof ImageCardError) throw error;
    throw new ImageCardError(`Image illisible (${error instanceof Error ? error.message : String(error)})`);
  }
}
