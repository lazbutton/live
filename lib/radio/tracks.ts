/*
 * Radio : les titres de la playlist, tels que l'app les affiche (contrat : docs/API_APP.md, « Radio »).
 *
 * Nettoyés de trois choses seulement, le reste tel que la radio l'envoie :
 * - les jingles (« Tu ecoutes Radio Campus Orleans – Jingle ») : retirés ;
 * - les numéros de piste au début (« 01 It Must Change », « 05 - Ana Lua Caiano - … », « 19_Slow Disco »,
 *   « 1. BJÖRNHORN I ») ; un nombre qui fait partie du titre reste (« 72-Hour Sweat », « 10.0 LUFS »,
 *   « 7 Miles to Jordan », « 2019 ») ;
 * - les fins de nom de fichier (« _GBCVZ2200466_44k-16b », « .mp3 », « [44_16] », « _241105 »).
 */
import { collapseSpaces, normalizeForMatch } from "./text";

export type RadioTrack = {
  title: string;
  artist: string | null;
};

/**
 * Numéro de piste au début : un ou deux chiffres suivis d'un tiret entre espaces, d'un point et d'une
 * espace, ou d'un souligné ; « 0N » suivi d'une espace. « 11 Magic Circle » reste (« 99 Luftballons »
 * aussi).
 */
const TRACK_NUMBER = /^(?:\d{1,2}\s*[-–—]\s+|\d{1,2}\.\s+|\d{1,2}_+|0\d\s+)(?=\S)/;

/** Fins de nom de fichier, retirées tant qu'il en reste une. */
const FILE_ENDINGS = [
  // Extension audio.
  /\.(?:mp3|wav|flac|aiff?|m4a|aac|ogg|opus|wma)$/i,
  // Échantillonnage et résolution : « _44k-16b », « _48k_24bit », « 44.1k-16b ».
  /[\s_-]+\d{2}(?:[.,]\d)?\s?k(?:hz)?[\s_-]?\d{2}\s?b(?:its?)?$/i,
  // Entre crochets : « [44_16] ».
  /\s*\[\d{2}[_-]\d{2}\]$/,
  // Code ISRC : « _GBCVZ2200466 ».
  /[\s_]+[A-Z]{2}[A-Z0-9]{3}\d{7}$/,
  // Date ou numéro de fichier après un souligné : « _241105 ».
  /_\d{6,8}$/,
  // Séparateurs restés au bout : « Made _ ».
  /[\s_-]+$/,
];

export function cleanTrackTitle(title: string): string {
  const original = collapseSpaces(title);
  let cleaned = original.replace(TRACK_NUMBER, "");
  for (let pass = 0; pass < 6; pass += 1) {
    const before = cleaned;
    for (const ending of FILE_ENDINGS) cleaned = cleaned.replace(ending, "");
    if (cleaned === before) break;
  }
  cleaned = collapseSpaces(cleaned);
  return cleaned || original;
}

export function cleanArtist(artist: string | null | undefined): string | null {
  const cleaned = collapseSpaces(artist);
  return cleaned || null;
}

/**
 * Un jingle : « Jingle » en titre ou en artiste, « Tu écoutes Radio … », ou le nom de la station dans le
 * texte (« Tu ecoutes Radio Campus Orleans »).
 */
export function isJingle(track: { title?: string | null; artist?: string | null }, stationName: string): boolean {
  const title = normalizeForMatch(track.title);
  const artist = normalizeForMatch(track.artist);
  if (title === "jingle" || artist === "jingle") return true;
  const station = normalizeForMatch(stationName);
  const text = ` ${artist} ${title} `;
  return text.includes(" tu ecoutes radio ") || (station.length > 0 && text.includes(` ${station} `));
}

/**
 * Le titre du serveur de diffusion (« Akiko Yano - To Ki Me Ki ») en artiste et titre, au premier
 * tiret entre espaces. Sans tiret : un titre sans artiste. Rien de lisible : null.
 */
export function parseStreamTitle(raw: string | null | undefined): RadioTrack | null {
  const text = collapseSpaces(raw);
  // « - NOVORAMA » : un titre sans artiste.
  const leading = /^[-–—]\s*(.+)$/.exec(text);
  const separated = leading ? null : /^(.+?)\s+[-–—]\s+(.+)$/.exec(text);
  const track: RadioTrack = leading
    ? { artist: null, title: collapseSpaces(leading[1]) }
    : separated
      ? { artist: cleanArtist(separated[1]), title: collapseSpaces(separated[2]) }
      : { artist: null, title: text };
  return /[\p{L}\p{N}]/u.test(track.title) ? track : null;
}

/** Le titre du serveur est le nom de cette émission (« LA MERIDIENNE – RADIO CAMPUS TOURS »). */
export function titleNamesShow(raw: string | null | undefined, showName: string): boolean {
  const name = normalizeForMatch(showName);
  if (!name) return false;
  return ` ${normalizeForMatch(raw)} `.includes(` ${name} `);
}

/** Deux morceaux identiques, sans tenir compte des accents, de la casse ni des numéros de piste. */
export function sameTrack(a: RadioTrack, b: RadioTrack): boolean {
  const key = (track: RadioTrack) => normalizeForMatch(`${track.artist ?? ""} ${cleanTrackTitle(track.title)}`);
  return key(a) === key(b);
}
