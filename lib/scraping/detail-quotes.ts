/*
 * Pour qui, l'âge et la réservation lus par l'IA ne sont gardés qu'avec la phrase de la page qui les dit
 * (scrape-event-page.ts, « rien n'est deviné ») : la citation doit être dans la page, et contenir les mots de la valeur
 * qu'elle prouve. Sans eux, l'IA a lu autre chose : « Dès 18h30 » n'est pas un âge, « June et Hiver, 10 ans » (deux
 * personnages) ne dit pas pour qui est le spectacle.
 */

/** Texte comparable : sans accents, casse ni ponctuation. */
export function comparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const AUDIENCE_WORDS: Record<string, RegExp> = {
  all: /\b(tout public|tous publics|tous les publics|ouverte? a tous|ouverte? a toutes|toutes et tous|tous et toutes|tous ages|tout age|intergenerationnel(le)?|petits et grands|de 7 a 77 ans)\b/,
  family: /\b(famille|familles|familial|familiale|enfants?|jeunes? publics?|petits|tout petits|parents?|bebes?)\b/,
  teens: /\b(ados?|adolescents?|adolescentes?|collegiens?|lyceens?)\b|\b\d{1,2} (a |et )?1[0-7] ans\b/,
  adults: /\b(adultes?|majeurs?|public averti|interdit aux mineurs|moins de 1[6-8] ans|plus de 1[6-8] ans)\b/,
};

const BOOKING_WORDS: Record<string, RegExp> = {
  none: /\b(sans reservation|pas de reservation|sans inscription|pas d inscription|sans reserver|pas besoin de reserver|(places?|billets?|vente) sur place)\b/,
  reservation: /\b(reserv\w*|inscri\w*|places limitees)\b/,
  online: /\b(billet\w*|reserv\w*|ticket\w*|panier|seances?|tarifs?|acheter|achat|places?|complet|weezevent|helloasso|billetweb|mapado|shotgun|dice|fnac|yurplan|placeminute)\b/,
};

/** L'âge `age` (en années) écrit dans la citation : « 6 ans », « 18 mois » (2 ans), « majeurs » (18). */
function saysAge(text: string, age: number) {
  for (const match of text.matchAll(/\b(\d{1,2}) (ans?|mois)\b/g)) {
    const value = Number(match[1]);
    if (match[2] === "mois" ? Math.ceil(value / 12) === age : value === age) return true;
  }
  return age === 18 && /\bmajeurs?\b/.test(text);
}

/** La citation contient-elle les mots de la valeur qu'elle doit prouver ? */
export function quoteSupports(field: "audience" | "min_age" | "booking", value: string | number, quote: string) {
  const text = comparableText(quote);
  if (field === "min_age") return typeof value === "number" && saysAge(text, value);
  const words = (field === "audience" ? AUDIENCE_WORDS : BOOKING_WORDS)[String(value)];
  return Boolean(words?.test(text));
}
