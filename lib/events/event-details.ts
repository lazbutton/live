import type { Tables } from "@/lib/supabase/database.types";

/*
 * Ce que la fiche d'un événement dit en plus (../live/docs/chantiers/pour-toi.md, « Des fiches plus riches ») :
 * le genre (events.genre_ids, une liste fermée par catégorie : event_genres), pour qui (audience, min_age) et la
 * réservation (booking). Les valeurs et leurs libellés, les mêmes que l'app (« un mot par chose ») ; les règles
 * vivent en SQL (migration 20261024170000 : genres de la catégorie, is_young_audience recalculé depuis audience).
 */

export const EVENT_AUDIENCES = [
  { value: "all", label: "Tout public" },
  { value: "family", label: "En famille" },
  { value: "teens", label: "Ados" },
  { value: "adults", label: "Adultes" },
] as const;

export type EventAudience = (typeof EVENT_AUDIENCES)[number]["value"];

export const EVENT_BOOKINGS = [
  { value: "none", label: "Sans réservation" },
  { value: "reservation", label: "Sur réservation" },
  { value: "online", label: "Billetterie en ligne" },
] as const;

export type EventBooking = (typeof EVENT_BOOKINGS)[number]["value"];

/** Les valeurs seules (schémas zod des outils de l'agent). */
export const EVENT_AUDIENCE_VALUES = EVENT_AUDIENCES.map((audience) => audience.value) as [EventAudience, ...EventAudience[]];
export const EVENT_BOOKING_VALUES = EVENT_BOOKINGS.map((booking) => booking.value) as [EventBooking, ...EventBooking[]];

/** Âges minimum permis (contrainte d'events.min_age). */
export const MIN_AGE_RANGE = { min: 1, max: 18 } as const;

export type EventGenreOption = Pick<
  Tables<"event_genres">,
  "id" | "category_id" | "name" | "phrase" | "display_order" | "is_active"
>;

export function isEventAudience(value: unknown): value is EventAudience {
  return EVENT_AUDIENCES.some((audience) => audience.value === value);
}

export function isEventBooking(value: unknown): value is EventBooking {
  return EVENT_BOOKINGS.some((booking) => booking.value === value);
}

export function audienceLabel(value: unknown) {
  return EVENT_AUDIENCES.find((audience) => audience.value === value)?.label ?? null;
}

export function bookingLabel(value: unknown) {
  return EVENT_BOOKINGS.find((booking) => booking.value === value)?.label ?? null;
}

/** Un âge minimum entier de 1 à 18 ans (« 6 », 6), sinon null. */
export function toMinAge(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,2}$/.test(text)) return null;
  const age = Number(text);
  return age >= MIN_AGE_RANGE.min && age <= MIN_AGE_RANGE.max ? age : null;
}

/** « Dès 6 ans », « Dès 1 an ». */
export function minAgeLabel(age: number | null | undefined) {
  if (!age) return null;
  return `Dès ${age} an${age > 1 ? "s" : ""}`;
}

/**
 * Les genres qu'on peut choisir pour une catégorie : les actifs, plus ceux déjà portés (`keepIds`, un genre
 * désactivé depuis), dans l'ordre de la liste.
 */
export function genresOfCategory<T extends EventGenreOption>(
  genres: T[],
  categoryId: string | null | undefined,
  keepIds: string[] = [],
) {
  if (!categoryId) return [];
  return genres
    .filter((genre) => genre.category_id === categoryId && (genre.is_active || keepIds.includes(genre.id)))
    .sort((left, right) => left.display_order - right.display_order || left.name.localeCompare(right.name, "fr"));
}

/** Les genres choisis qui appartiennent à la catégorie (la base retire les autres à l'enregistrement). */
export function genreIdsForCategory(genreIds: string[], genres: EventGenreOption[], categoryId: string | null | undefined) {
  if (!categoryId) return [];
  const ofCategory = new Set(genres.filter((genre) => genre.category_id === categoryId).map((genre) => genre.id));
  return [...new Set(genreIds)].filter((id) => ofCategory.has(id));
}

/** Nom comparable : sans accents, casse ni ponctuation (« Électro » = « electro »). */
function comparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Genres nommés par une source (la lecture par IA, l'agent), rapprochés des genres actifs de la catégorie par leur
 * nom ou leur phrase, casse et accents ignorés. Un nom hors de la liste n'est pas deviné : il revient dans
 * `unmatched`, à signaler (un genre qui manque à la liste).
 */
export function matchGenreIds(names: unknown, genres: EventGenreOption[], categoryId: string | null | undefined) {
  const wanted = Array.isArray(names) ? names.filter((name): name is string => typeof name === "string" && Boolean(name.trim())) : [];
  const offered = genresOfCategory(genres, categoryId);
  const ids: string[] = [];
  const unmatched: string[] = [];
  for (const name of wanted) {
    const key = comparable(name);
    const genre = offered.find((candidate) => comparable(candidate.name) === key || comparable(candidate.phrase) === key);
    if (!genre) unmatched.push(name.trim());
    else if (!ids.includes(genre.id)) ids.push(genre.id);
  }
  return { ids, unmatched };
}

/** Pour qui, l'âge et la réservation lus par une source : seulement des valeurs des listes, sinon null. */
export function readEventDetails(data: { audience?: unknown; min_age?: unknown; booking?: unknown }) {
  return {
    audience: isEventAudience(data.audience) ? data.audience : null,
    minAge: toMinAge(data.min_age),
    booking: isEventBooking(data.booking) ? data.booking : null,
  };
}

/**
 * Les colonnes d'events tirées d'un préremplissage d'import (`buildEventFormPrefillFromImport`) : les genres
 * reconnus, pour qui, l'âge et la réservation, « lus, à confirmer » s'il y en a.
 */
export function detailsColumnsFromPrefill(prefill: {
  form?: { audience?: string; min_age?: string; booking?: string };
  genreIds?: string[];
  detailsToConfirm?: boolean;
}) {
  const form = prefill.form || {};
  return {
    genre_ids: prefill.genreIds || [],
    audience: isEventAudience(form.audience) ? form.audience : null,
    min_age: toMinAge(form.min_age),
    booking: isEventBooking(form.booking) ? form.booking : null,
    details_to_confirm: Boolean(prefill.detailsToConfirm),
  };
}
