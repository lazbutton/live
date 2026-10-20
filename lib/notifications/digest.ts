/**
 * Résumés poussés par les crons `daily-events` et `weekly-summary` (U9) : la plage couverte, les événements
 * d'un utilisateur, le message et les données que l'app lit au toucher. Fonctions pures, sans base
 * (`digest.test.mjs`) ; les événements d'une plage se lisent en SQL (`loadDigestEvents`,
 * `app_events_in_range`), comme dans l'app : la règle d'appartenance n'est pas ici.
 *
 * - Chaque matin : « 3 événements ce soir dans tes catégories » (ce soir = de 18 h à 6 h le lendemain,
 *   comme le raccourci « Ce soir » de l'app, `EventsListPeriod`) ; rien ce soir, ce qui reste aujourd'hui ;
 *   rien du tout, pas de message.
 * - Le lundi : « 12 événements cette semaine dans tes catégories », du lundi au dimanche.
 *
 * Sont comptés les événements qui commencent dans la plage (le `starting_count` d'`app_event_counts`) :
 * une exposition de plusieurs mois appartient à chaque soirée, elle ne ferait qu'un message chaque jour.
 * Titres et corps courts, en français, sans donnée personnelle. L'aperçu de l'app (« Tu recevras »,
 * `notification_digest_preview.dart`) reprend `digestTitle` : changer l'un, c'est changer l'autre.
 */

import { addDaysToLocalDate, getIsoLocalDate, type LocalDateParts } from "@/lib/cron-timezone";

export type DigestPeriod = "tonight" | "today" | "week";

/** Plage [start, end) en heure de Paris, sans fuseau (« 2026-10-21T18:00:00 »), pour `app_events_in_range`. */
export interface DigestRange {
  start: string;
  end: string;
}

/** Un événement lu par `loadDigestEvents` : `date` est l'heure de Paris étiquetée UTC (convention de la base). */
export interface DigestEvent {
  id: string;
  title: string;
  date: string;
  category: string | null;
}

export interface DigestCategory {
  id: string;
  name: string;
}

/** « Ce soir » commence à 18 h et finit à 6 h le lendemain (`EventsListPeriod` de l'app). */
const EVENING_HOUR = 18;
const NIGHT_END_HOUR = 6;

/** Au plus autant d'ids dans les données : APNs et FCM limitent un message à 4 Ko. */
const MAX_EVENT_IDS = 10;

/** Au-delà, un titre est coupé au dernier mot entier. */
const MAX_TITLE_LENGTH = 40;

function at(day: LocalDateParts, hour: number): string {
  return `${getIsoLocalDate(day)}T${String(hour).padStart(2, "0")}:00:00`;
}

/** Ce soir : [today], de 18 h à 6 h le lendemain. */
export function tonightRange(today: LocalDateParts): DigestRange {
  return { start: at(today, EVENING_HOUR), end: at(addDaysToLocalDate(today, 1), NIGHT_END_HOUR) };
}

/** La journée de [today], de 0 h à minuit. */
export function dayRange(today: LocalDateParts): DigestRange {
  return { start: at(today, 0), end: at(addDaysToLocalDate(today, 1), 0) };
}

/** La semaine de [monday] : du lundi 0 h au lundi suivant 0 h. */
export function weekRange(monday: LocalDateParts): DigestRange {
  return { start: at(monday, 0), end: at(addDaysToLocalDate(monday, 7), 0) };
}

/** L'événement commence dans [range] (et ne fait pas que la traverser). */
export function startsIn(event: Pick<DigestEvent, "date">, range: DigestRange): boolean {
  const start = Date.parse(event.date);
  // Les bornes sont l'heure de Paris, comme `date` : comparées toutes deux comme des heures UTC.
  return start >= Date.parse(`${range.start}Z`) && start < Date.parse(`${range.end}Z`);
}

/**
 * L'id de la catégorie d'un événement : `events.category` contient un id ou, pour des lignes anciennes,
 * un nom (comme `app_events_in_range` les compare) ; `null` si aucune ne correspond.
 */
export function categoryIdOf(raw: string | null, categories: DigestCategory[]): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  const match =
    categories.find((category) => category.id.toLowerCase() === lower) ??
    categories.find((category) => category.name.trim().toLowerCase() === lower);
  return match?.id ?? null;
}

/** Les événements de [events] dans les catégories [categoryIds], dans le même ordre. */
export function inCategories<T extends DigestEvent>(
  events: T[],
  categoryIds: string[],
  categories: DigestCategory[],
): T[] {
  const wanted = new Set(categoryIds);
  return events.filter((event) => {
    const id = categoryIdOf(event.category, categories);
    return id !== null && wanted.has(id);
  });
}

/** Les ids des catégories de [events], sans doublons, dans l'ordre des événements. */
export function categoryIdsOf(events: DigestEvent[], categories: DigestCategory[]): string[] {
  const ids = events
    .map((event) => categoryIdOf(event.category, categories))
    .filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

export interface DigestPlan<T extends DigestEvent> {
  period: DigestPeriod;
  events: T[];
}

/**
 * Le résumé du matin d'un utilisateur : ce soir s'il s'y passe quelque chose dans ses catégories, sinon
 * le reste de la journée ; `null` : rien à envoyer. [tonight] et [today] : les événements qui commencent
 * dans ces plages (`startsIn`), triés par date.
 */
export function planDailyDigest<T extends DigestEvent>(
  tonight: T[],
  today: T[],
  categoryIds: string[],
  categories: DigestCategory[],
): DigestPlan<T> | null {
  const evening = inCategories(tonight, categoryIds, categories);
  if (evening.length > 0) return { period: "tonight", events: evening };
  const day = inCategories(today, categoryIds, categories);
  if (day.length > 0) return { period: "today", events: day };
  return null;
}

/** « 3 événements ce soir dans tes catégories ». */
export function digestTitle(count: number, period: DigestPeriod): string {
  const events = count === 1 ? "1 événement" : `${count} événements`;
  const when =
    period === "tonight" ? "ce soir" : period === "today" ? "aujourd’hui" : "cette semaine";
  return `${events} ${when} dans tes catégories`;
}

/** Un titre d'événement sur une ligne, coupé au dernier mot entier au-delà de 40 caractères. */
export function shortTitle(title: string): string {
  const flat = title.replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_TITLE_LENGTH) return flat;
  const cut = flat.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,.;:!?–-]+$/, "")}…`;
}

/** Les deux premiers titres, puis le reste : « Luiza, Dédoublée et 1 autre ». */
export function digestBody(titles: string[]): string {
  const shown = titles.slice(0, 2).map(shortTitle);
  const rest = titles.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} et ${rest} ${rest === 1 ? "autre" : "autres"}`;
  return shown.join(" et ");
}

/**
 * Données de la notification, lues par l'app au toucher (l'accueil sur la période et ces catégories).
 * FCM les envoie en texte : les listes y deviennent « a,b » (`fcm.ts`) ; APNs les garde en listes.
 * Contrat : `docs/API_APP.md`, « Résumés poussés ».
 */
export function digestData(input: {
  period: DigestPeriod;
  /** Le jour du résumé (aujourd'hui, ou le lundi de la semaine). */
  date: string;
  /** Dernier jour couvert, pour la semaine. */
  endDate?: string;
  categoryIds: string[];
  eventIds: string[];
}): Record<string, unknown> {
  const common = {
    period: input.period,
    categories: input.categoryIds,
    event_ids: input.eventIds.slice(0, MAX_EVENT_IDS),
    events_count: input.eventIds.length,
  };
  if (input.period === "week") {
    return { type: "weekly_summary", start_date: input.date, end_date: input.endDate ?? input.date, ...common };
  }
  return { type: "daily_events", date: input.date, ...common };
}
