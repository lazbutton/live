import { FIRST_NAMES } from "@/lib/events/first-names";
import { normalizeName } from "@/lib/events/import-prefill";

/*
 * Noms d'artistes lus sur une page, une affiche ou un post. Deux étapes :
 * - découpage (extraction comme création) : « A + B » donne deux artistes et les mentions
 *   « 1ère partie » disparaissent ;
 * - refus à la création d'une fiche : seuls les artistes musicaux ont une fiche (concerts et DJ sets,
 *   ni compagnie ni humoriste), jamais au nom du titre de l'événement, ni pour un prénom seul,
 *   un atelier ou une mention générique.
 * Module pur, partagé par l'extraction (lib/scraping) et l'agent (lib/agent).
 */

/** « 1ère partie », « 1ERE PARTIE », « 1re partie », « première partie », « en 1ère partie »… */
const SUPPORT_ACT = String.raw`(?:en\s+)?(?:1\s*(?:[èeé]re|re|ʳᵉ)s?|premi[èe]res?)\s*parties?\b`;
const SUPPORT_ACT_PREFIX = new RegExp(String.raw`^${SUPPORT_ACT}\s*[:–—-]?\s*`, "iu");
/** « Razorlight (1ère partie : X) » se lit comme « Razorlight + 1ère partie : X ». */
const SUPPORT_ACT_IN_BRACKETS = new RegExp(String.raw`\s*[(\[]\s*\+?\s*(${SUPPORT_ACT}[^)\]]*)[)\]]`, "giu");
/** « + » entre deux noms (« C+C Music Factory », sans espace, reste entier). */
const ACT_SEPARATOR = /\s+\+\s*|\s*\+\s+/;

/** Mentions qui ne désignent pas un artiste (« DJ set », « invités surprise »…). */
const GENERIC_NAMES =
  /^(dj ?set|djs?|guests?|special guests?|invit[ée]s?( surprises?)?|surprises?|line[- ]?up|tba|tbc|tbd|et (bien )?d'autres|et plus( encore)?|artistes? (à|a) venir|programmation|r[ée]sidents?|open ?mic|sc[eè]ne ouverte|b2b|live|concert|soir[ée]e)$/i;

/* Comparés au nom normalisé (minuscules, sans accents ni ponctuation). */
/** Structures non musicales reconnaissables à leur nom (« Cie les Modits », « Cirque Alfonse »). */
const NON_MUSICAL_STRUCTURE = /^(compagnie|cie|cirque|ballet|theatre|troupe)\b/;
/** Types annoncés non musicaux (« Humoriste », « Drag », « Danseuse »…)… */
const NON_MUSICAL_TYPE =
  /\b(humoriste|humour|comedien|comedienne|theatre|compagnie|cie|dans(e|eur|euse)s?|choregraphe|drag|magicien|magicienne|conteur|conteuse|clown|cirque|circassien|circassienne|acrobate|jongleur|jongleuse|marionnettiste|realisateur|realisatrice|cineaste|ecrivain|ecrivaine|conferencier|conferenciere|animateur|animatrice|metteur|metteuse|plasticien|plasticienne|illustrateur|illustratrice|photographe)\b/;
/** …sauf mention musicale (« Conteur et musicien », « Auteur-compositeur »). */
const MUSICAL_TYPE =
  /\b(dj|mc|musi\w*|chant\w*|rap\w*|groupe|band|orchestre|ensemble|choeur|chorale|quatuor|quartet|trio|duo|fanfare|composit\w*|beatmaker|pianiste|guitariste|bassiste|batteur|batteuse|violon\w*|saxophoniste|chanson\w*)\b/;

function stripSupportAct(name: string) {
  return name.replace(SUPPORT_ACT_PREFIX, "").trim();
}

/** Un nom par artiste : « A + B » découpé, mentions « 1ère partie » et génériques retirées, sans doublon. */
export function splitArtistNames(values: unknown): string[] {
  const raws = Array.isArray(values) ? values : typeof values === "string" ? [values] : [];
  const names = new Map<string, string>();
  for (const raw of raws) {
    if (typeof raw !== "string") continue;
    for (const part of raw.replace(SUPPORT_ACT_IN_BRACKETS, " + $1").split(ACT_SEPARATOR)) {
      const name = stripSupportAct(part.replace(/\s+/g, " ").trim());
      const key = normalizeName(name);
      if (key && !GENERIC_NAMES.test(name) && !names.has(key)) names.set(key, name);
    }
  }
  return [...names.values()];
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const PLAIN_FIRST_NAMES = new Set([...FIRST_NAMES].map(stripAccents));

/** Prénom seul, éventuellement composé (« Candice », « ZELIE », « Jean-Yves »). */
export function isFirstNameOnly(name: string) {
  const parts = name.normalize("NFC").trim().toLowerCase().split("-");
  return parts.every(
    (part) =>
      FIRST_NAMES.has(part) ||
      // Écrit sans accent (« Deborah ») : comparé aux prénoms désaccentués ; un accent
      // inhabituel (« Edgär ») signale plutôt un nom de scène.
      (stripAccents(part) === part && PLAIN_FIRST_NAMES.has(part)),
  );
}

/** Catégorie d'événement musicale (« Concert », « DJ Set ») : les seules qui créent des fiches d'artistes. */
export function isMusicCategory(category: string | null | undefined) {
  return /\b(concert|dj|musique|music)/.test(normalizeName(category || ""));
}

export type ArtistContext = {
  /** Événement qui annonce ce nom : fiche seulement pour un concert ou un DJ set, jamais au nom du titre. */
  event?: { title?: string | null; category?: string | null };
  /** Compte Instagram fourni : un prénom seul désigne alors un artiste identifié. */
  hasInstagram?: boolean;
  /** Type annoncé (« DJ », « Groupe », « Humoriste »…). */
  typeLabel?: string | null;
};

/** Raison de ne pas créer de fiche pour cet artiste (null : artiste musical plausible). */
export function artistRefusal(name: string, { event, hasInstagram = false, typeLabel }: ArtistContext = {}) {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const key = normalizeName(trimmed);
  if (trimmed.length < 2 || trimmed.length > 60 || /https?:\/\/|www\.|@.+\./i.test(trimmed)) {
    return "Nom peu plausible pour un artiste";
  }
  if (GENERIC_NAMES.test(trimmed) || !stripSupportAct(trimmed)) return "Mention générique, pas un artiste";
  const acts = splitArtistNames([trimmed]);
  if (acts.length !== 1 || acts[0] !== trimmed) return "Plusieurs artistes ou « 1ère partie » : un nom par fiche";
  if (/^ateliers?\b/.test(key)) return "Atelier, pas un artiste";
  if (NON_MUSICAL_STRUCTURE.test(key)) return "Compagnie, cirque ou théâtre : pas un artiste musical";
  const type = normalizeName(typeLabel || "");
  if (NON_MUSICAL_TYPE.test(type) && !MUSICAL_TYPE.test(type)) return `Type non musical (${typeLabel})`;
  if (event && !isMusicCategory(event.category)) {
    return event.category
      ? `Événement non musical (${event.category}) : fiches réservées aux concerts et DJ sets`
      : "Catégorie inconnue : fiches réservées aux concerts et DJ sets";
  }
  if (event?.title && key === normalizeName(event.title)) return "Titre de l'événement, pas un artiste";
  // Un prénom tête d'affiche (« ZELIE + 1ERE PARTIE ») reste un artiste.
  const billed = Boolean(event?.title) && splitArtistNames([event?.title]).some((act) => normalizeName(act) === key);
  if (!hasInstagram && !billed && isFirstNameOnly(trimmed)) return "Prénom seul, sans nom ni compte Instagram";
  return null;
}
