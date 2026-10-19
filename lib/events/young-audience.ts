import { normalizeName } from "@/lib/events/import-prefill";

/*
 * Jeune public : événement pensé pour les enfants ou les familles (conte, spectacle « dès 3 ans »,
 * stage 7-10 ans, boum, réveil livres 0-3 ans, atelier parent-enfant…). Repéré sur le titre, les mots-clés
 * ou tags de la source et la description. Un spectacle « tout public dès 12 ans » n'en est pas un : seul un
 * âge minimum de 6 ans au plus, ou une tranche d'âge qui s'arrête avant 18 ans, désigne un public d'enfants ;
 * pour un atelier, un âge minimum jusqu'à 12 ans aussi, sauf s'il s'adresse à tous les publics.
 * Sert à remplir events.is_young_audience à la collecte et à écarter ces événements d'On sort !.
 */

export type YoungAudienceInput = {
  title?: string | null;
  description?: string | null;
  /** Mots-clés, tags ou catégories de la source (« Jeune public », « Enfants »…). */
  tags?: Array<string | null | undefined> | null;
  /** Catégorie OutLive : un atelier « dès 8 ans » est un atelier d'enfants. */
  category?: string | null;
};

/** Mentions explicites, dans le titre ou la description (texte sans accents). */
const LABEL =
  /\b(jeunes? publics?|(les|aux|des|pour) touts? petits|a hauteur d enfants?|parents? enfants?|un adulte et un enfant)\b/;
/**
 * Seulement dans le titre : « en famille », « boum », « bébés », « pour les enfants » décrivent l'événement
 * lui-même (dans une description : « Bébé éléphant », « ateliers pour les enfants » pendant le concert…).
 */
const TITLE_LABEL = /\b(en famille|boum|touts? petits|bebes?|pour (les )?enfants)\b/;
/** Tag ou mot-clé qui désigne à lui seul un public d'enfants. */
const TAG = /^(jeunes? publics?|enfants?|jeunesse|famille|en famille|touts? petits|bebes?)$/;
/** Atelier, stage, initiation : d'après la catégorie ou le début du titre. */
const WORKSHOP_TITLE = /^(ateliers?|stages?|initiations?|cours|workshops?)\b/;
/** Atelier ouvert à tous : son âge minimum ne fait pas un public d'enfants. */
const ALL_AGES = /\b(tout public|tous publics|tous les publics|adultes?)\b/;
/**
 * « Dès 3 ans », « à partir de 18 mois », « tout public des 3 ans » (accents gardés : « des 5 ans du collectif »
 * n'est pas un âge, sauf après « public »). `\b` ne connaît pas les lettres accentuées : le début d'un mot est
 * repéré par l'espace qui précède.
 */
const MINIMUM_AGE =
  /(?:^|\s)(?:dès|à partir de|a partir de|à partir d|a partir d|publics? des)\s+(\d{1,2})\s+(mois|ans?)(?=\s|$)/gu;
/** « 7-10 ans », « de 0 à 3 ans », « entre 8 et 12 ans ». */
const AGE_RANGE = /(?:^|\s)(?:de\s+|entre\s+)?(\d{1,2})\s+(?:à\s+|a\s+|et\s+)?(\d{1,2})\s+ans(?=\s|$)/gu;
/** « de 18 mois à 3 ans » : des tout-petits. */
const BABY_RANGE = /(?:^|\s)(?:de\s+)?\d{1,2}\s+mois\s+(?:à\s+|a\s+|et\s+)?\d{1,2}\s+(?:mois|ans)(?=\s|$)/u;

/** Âge minimum le plus élevé qui désigne encore un public d'enfants. */
const MAX_CHILD_MINIMUM_AGE = 6;
/** Pour un atelier ou un stage. */
const MAX_WORKSHOP_MINIMUM_AGE = 12;
/** Tranche d'âge réservée aux mineurs (« 11-15 ans », « 15-17 ans »). */
const MAX_CHILD_RANGE_END = 17;

/** Minuscules, accents gardés, ponctuation remplacée par des espaces. */
function words(value: string) {
  return value.toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function ageCue(value: string, workshop: boolean): string | null {
  const text = words(value);
  const babies = BABY_RANGE.exec(text);
  if (babies) return babies[0].trim();
  const maxMinimumAge = workshop && !ALL_AGES.test(normalizeName(value)) ? MAX_WORKSHOP_MINIMUM_AGE : MAX_CHILD_MINIMUM_AGE;
  for (const match of text.matchAll(MINIMUM_AGE)) {
    if (match[2] === "mois" || Number(match[1]) <= maxMinimumAge) return match[0].trim();
  }
  for (const match of text.matchAll(AGE_RANGE)) {
    const [low, high] = [Number(match[1]), Number(match[2])];
    if (low < high && high <= MAX_CHILD_RANGE_END) return match[0].trim();
  }
  return null;
}

/**
 * Indice qui fait d'un événement un événement jeune public (« jeune public », « dès 3 ans »,
 * « 7 10 ans », tag « Enfants »…), ou null.
 */
export function youngAudienceCue({ title, description, tags, category }: YoungAudienceInput): string | null {
  for (const tag of tags || []) {
    const value = normalizeName(tag || "");
    if (value && TAG.test(value)) return value;
  }
  const normalizedTitle = normalizeName(title || "");
  const workshop = normalizeName(category || "") === "atelier" || WORKSHOP_TITLE.test(normalizedTitle);
  const titleCue =
    LABEL.exec(normalizedTitle)?.[0] || TITLE_LABEL.exec(normalizedTitle)?.[0] || ageCue(title || "", workshop);
  if (titleCue) return titleCue;
  return LABEL.exec(normalizeName(description || ""))?.[0] || ageCue(description || "", workshop);
}

export function isYoungAudience(input: YoungAudienceInput) {
  return youngAudienceCue(input) !== null;
}
