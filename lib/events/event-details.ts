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
