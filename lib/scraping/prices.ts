import { normalizeName } from "@/lib/events/import-prefill";

/*
 * Prix d'appel d'un événement : le tarif le plus bas ouvert au public (réduit, prévente, sur place,
 * enfant…). Un tarif réservé à un public (abonnés qui prennent plusieurs spectacles, adhérents,
 * détenteurs de la carte du lieu, groupes, scolaires, CE, invités, élèves du conservatoire) n'en est pas
 * un, même quand il est le moins cher : « Abonné.e » 20 € pour un concert à 25 € en prévente
 * (L'Astrolabe), « Parcours culturel (MMD) » 5 € réservé aux élèves du conservatoire (L'Unisson).
 */

export type Tariff = {
  /** Nom du tarif (« Prévente », « Tarif adhérent », « Carte Passerelle »). */
  name?: string | null;
  /** Conditions écrites sous le tarif (« Réservé aux élèves du conservatoire de… »). */
  description?: string | null;
  price: number;
};

/** Tarif réduit ou plein : ouvert à tous, même quand il cite les abonnés parmi ses ayants droit. */
const PUBLIC_RATE = /\b(reduit|reduite|reduits|plein)\b/;
/** Mots d'un nom de tarif réservé à un public (texte normalisé : sans accents ni ponctuation). */
const RESTRICTED_NAME =
  /\b(abonne\w*|abonnement|adherent\w*|adhesion|membres?|cartes?|groupes?|scolaires?|invitations?|invitee?s?|exonere\w*|exoneration|partenaires?|benevoles?|professionnel\w*|conservatoire|parcours culturels?)\b/;
/** Sigles écrits en capitales : « Tarif CE », « CSE », « Parcours culturel (MMD) ». */
const RESTRICTED_ACRONYM = /\b(CE|CSE|MMD)\b/;
/** « Non adhérent », « hors abonnement » : le tarif de tout le monde. */
const NEGATED = /\b(non|hors|sans)\s+(abonne\w*|abonnement|adherent\w*|adhesion|membres?|cartes?)\b/g;
/** « Réservé aux élèves du conservatoire », « réservé aux étudiants inscrits à l'Université d'Orléans ». */
const RESERVED_TO = /r[ée]serv[ée]e?s?\s+(?:à|a|aux?)\s+([^,.;:()]{1,120})/gi;
const RESTRICTED_AUDIENCE =
  /\b(abonne\w*|adherent\w*|membres?|conservatoire|(?:etudiant|eleve)e?s?\s+inscrite?s?|eleves?\s+d(?:u|e|es))\b/;

/** Tarif réservé à un public (abonnés, adhérents, carte du lieu, groupes, élèves du conservatoire…). */
export function isRestrictedTariff(tariff: Pick<Tariff, "name" | "description">) {
  const name = tariff.name || "";
  const normalized = normalizeName(name).replace(NEGATED, " ");
  if (PUBLIC_RATE.test(normalized)) return false;
  if (RESTRICTED_ACRONYM.test(name) || RESTRICTED_NAME.test(normalized)) return true;
  for (const match of (tariff.description || "").matchAll(RESERVED_TO)) {
    if (RESTRICTED_AUDIENCE.test(normalizeName(match[1]))) return true;
  }
  return false;
}

/**
 * Fourchette des tarifs ouverts au public. Vide quand tous les tarifs sont réservés : mieux vaut un prix
 * inconnu qu'un prix d'abonné. Un billet gratuit à côté de billets payants (« Goûter/Atelier - Gratuit »
 * pour les enfants qui ont vu le spectacle, accompagnateur) n'est pas le prix du spectacle.
 */
export function publicPriceRange(tariffs: Tariff[]): { min?: number; max?: number } {
  const prices = tariffs
    .filter((tariff) => Number.isFinite(tariff.price) && tariff.price >= 0 && !isRestrictedTariff(tariff))
    .map((tariff) => tariff.price);
  const paying = prices.filter((price) => price > 0);
  const kept = paying.length > 0 ? paying : prices;
  if (kept.length === 0) return {};
  return { min: Math.min(...kept), max: Math.max(...kept) };
}

const AMOUNT = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|euros?\b)/gi;
/** « de 12 à 36 euros » : le premier montant n'a pas d'unité. */
const RANGE_START = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:à|-|–)\s*\d{1,3}(?:[.,]\d{1,2})?\s*(?:€|euros?\b)/gi;

function amountOf(raw: string) {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value >= 0 && value <= 500 ? value : null;
}

/**
 * Tarifs d'une ligne (« ABONNÉ ASTRO : 20€ / PRÉVENTE : 25€ », « Plein 12€, réduit 8€ ») : coupée aux
 * « / », « | », « • », « ; », retours à la ligne, virgules et tirets entre espaces, hors parenthèses
 * (« Réduit (étudiants, demandeurs d'emploi) : 7€ » reste d'un morceau).
 */
function tariffSegments(text: string) {
  const segments: string[] = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    const spaced = text[index - 1] === " " && text[index + 1] === " ";
    const separator =
      depth === 0 && (/[/|•;\n]/.test(char) || (char === "," && text[index + 1] === " ") || (/[-–]/.test(char) && spaced));
    if (separator) {
      segments.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  segments.push(current);
  return segments;
}

/**
 * Montants des tarifs ouverts au public dans un texte de tarifs, lus avec leur libellé : « Plein : 12€ /
 * Réduit : 8€ / Abonnés : 6€ » → 12 et 8.
 */
export function publicAmountsInText(text: string): number[] {
  return tariffSegments(text).flatMap((segment) => {
    if (isRestrictedTariff({ name: segment })) return [];
    return [AMOUNT, RANGE_START].flatMap((pattern) =>
      [...segment.matchAll(pattern)].map((match) => amountOf(match[1])).filter((value): value is number => value !== null),
    );
  });
}
