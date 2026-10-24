/*
 * Vignette d'une affiche pour les listes de l'app (étapes C7a et C7b de la refonte : ../live/docs/HISTORIQUE.md,
 * « Plan de refonte (fluidité et look) » ; ce que l'app en fait : ../live/docs/ARCHITECTURE.md, « Les données ») :
 * 1 200 px de large au plus, WebP, 140 Ko au plus (une affiche très chargée est rétrécie). Donne aussi les dimensions de l'original
 * (orientation EXIF appliquée) et sa couleur dominante : l'app réserve la place de l'image, au
 * bon ratio et dans sa couleur, avant son arrivée.
 *
 * Changer le rendu demande de changer CARD_VERSION (service.ts) : docs/EVENT_IMAGE_CARDS.md.
 */
import type { OutputInfo } from "sharp";

/**
 * Une carte pleine largeur sur un iPhone à ×3 : 362 à 400 pt, soit 1 086 à 1 200 px. À 800 px
 * (C7a), une affiche y était agrandie de 1,36 à 1,65 fois, ce qui se voyait (mesure C7b du
 * 2026-10-21 : 40 cartes de l'accueil en 2,3 Mo, contre 8,2 Mo pour les originaux).
 */
export const CARD_WIDTH = 1200;
/** Une affiche très haute (programme, infographie) est bornée en hauteur. */
export const CARD_MAX_HEIGHT = 2400;
/**
 * Poids maximal : la qualité baisse par paliers, puis, si la plus basse ne suffit pas, les dimensions
 * baissent jusqu'à le tenir. Affiches très chargées (photo granuleuse, texte fin) : 3 sur 286 en prod
 * le 2026-10-21, jusqu'à 249,8 Ko à 1 200 px et qualité 40 (172 Ko encore à qualité 20) ; ~820 à
 * 900 px de large avec cette borne.
 */
export const CARD_MAX_BYTES = 140 * 1024;
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

    const encode = async (quality: number, box = { width: CARD_WIDTH, height: CARD_MAX_HEIGHT }) => {
      const { data, info }: { data: Buffer; info: OutputInfo } = await open()
        .rotate()
        .resize({ ...box, fit: "inside", withoutEnlargement: true })
        .webp({ quality, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
      return { data, info, quality };
    };

    let card = await encode(QUALITIES[0]);
    for (const quality of QUALITIES.slice(1)) {
      if (card.data.byteLength <= CARD_MAX_BYTES) break;
      card = await encode(quality);
    }
    // Le poids baisse moins vite que le nombre de pixels (mesuré sur les affiches trop lourdes de la
    // prod : ~ pixels^0,8) : côtés réduits d'après l'écart, de 5 % au moins à chaque essai.
    while (card.data.byteLength > CARD_MAX_BYTES) {
      const scale = Math.min(0.95, 0.97 * (CARD_MAX_BYTES / card.data.byteLength) ** 0.6);
      card = await encode(card.quality, {
        width: Math.max(1, Math.floor(card.info.width * scale)),
        height: Math.max(1, Math.floor(card.info.height * scale)),
      });
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
