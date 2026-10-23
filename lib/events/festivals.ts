/**
 * Festivals (../live/docs/FESTIVALS.md, § 4) : un festival est un événement de la catégorie Festival qui contient
 * les autres (`events.festival_id`), avec ses lieux à lui (`festival_locations`). Ici, ce que l'admin en calcule :
 * la catégorie, les dates qu'il couvre, les alertes de son programme, et les événements qui le nomment
 * (suggestions du programme).
 *
 * Les dates sont celles de la base : l'heure de Paris étiquetée UTC (`parseDateWithoutTimezone`), comparées en
 * heure murale.
 */
import { addDays, format, isSameDay, isSameMonth, isSameYear } from "date-fns";
import { fr } from "date-fns/locale";

import { parseDateWithoutTimezone } from "@/lib/date-utils";

type Dated = { date: string; end_date?: string | null };

/**
 * Le texte comme `app_search_normalize` (la recherche de l'app) : sans accents ni casse, ce qui n'est ni lettre
 * ni chiffre en espaces. « Fulgurances Électroniques – Micro » → « fulgurances electroniques micro ».
 */
export function normalizeFestivalText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** La catégorie Festival, par son id (une ligne de `categories` nommée « Festival ») ou par son nom. */
export function isFestivalCategory(
  category: string | null | undefined,
  categories: ReadonlyArray<{ id: string; name: string }>,
): boolean {
  const value = category?.trim();
  if (!value) return false;
  if (normalizeFestivalText(value) === "festival") return true;
  return categories.some((entry) => entry.id === value && normalizeFestivalText(entry.name) === "festival");
}

/** L'id de la catégorie Festival dans `categories`, s'il y en a une. */
export function festivalCategoryId(categories: ReadonlyArray<{ id: string; name: string }>): string | null {
  return categories.find((entry) => normalizeFestivalText(entry.name) === "festival")?.id ?? null;
}

// Retirés en tête du nom : « Festival des Bouts du Monde » → « bouts du monde ».
const LEADING_WORDS = new Set(["le", "la", "les", "l", "de", "des", "du", "d", "au", "aux", "en"]);
// Numéro d'édition ou année : « #2 », « 2e », « 2ème », « 1er », « 2026 ».
const EDITION_NUMBER = /^\d+(?:e|er|ere|eme|nd|nde)?$/;

/**
 * Le nom d'un festival, pour le reconnaître dans un texte : normalisé (`normalizeFestivalText`), sans le mot
 * « festival », sans numéro d'édition ni année, sans article en tête. « Fulgurances Électroniques #2 » →
 * « fulgurances electroniques » ; « 3e édition du Festival des Bouts du Monde » → « bouts du monde ».
 */
export function festivalNameKey(title: string | null | undefined): string {
  const words = normalizeFestivalText(title)
    .split(" ")
    .filter((word) => word && !["festival", "festivals", "edition", "editions"].includes(word))
    .filter((word) => !EDITION_NUMBER.test(word));
  while (words.length > 0 && LEADING_WORDS.has(words[0])) words.shift();
  return words.join(" ");
}

/**
 * Le texte nomme-t-il le festival dont `key` est le nom (`festivalNameKey`) : ses mots, entiers et dans l'ordre.
 * Un nom de moins de 4 lettres ne reconnaît rien (« Festival 2026 », « Festival du MO »).
 */
export function textNamesFestival(text: string | null | undefined, key: string): boolean {
  if (key.replace(/ /g, "").length < 4) return false;
  return ` ${normalizeFestivalText(text)} `.includes(` ${key} `);
}

/**
 * Les dates d'un festival, en heure murale : de son premier jour à 0 h jusqu'à sa fin ; sans fin (ou une fin
 * avant le début), jusqu'à la fin de son premier jour.
 */
export function festivalSpan(festival: Dated): { start: Date; end: Date } | null {
  const start = parseDateWithoutTimezone(festival.date);
  if (!start) return null;
  const firstDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = parseDateWithoutTimezone(festival.end_date ?? null);
  return { start: firstDay, end: end && end.getTime() > start.getTime() ? end : addDays(firstDay, 1) };
}

/** Le début d'un événement tombe-t-il dans les dates du festival (`festivalSpan`) ? */
export function festivalCovers(festival: Dated, eventDate: string | null | undefined): boolean {
  const span = festivalSpan(festival);
  const date = parseDateWithoutTimezone(eventDate ?? null);
  if (!span || !date) return false;
  return date.getTime() >= span.start.getTime() && date.getTime() <= span.end.getTime();
}

/**
 * Les jours d'un festival, pour les afficher : une nuit qui finit avant 6 h compte pour la veille (la règle de
 * l'app, « Ce soir » de 18 h à 6 h) : Fulgurances, du jeudi 21:00 au dimanche 04:45, dure du jeudi au samedi.
 */
export function festivalDays(festival: Dated): { first: Date; last: Date } | null {
  const start = parseDateWithoutTimezone(festival.date);
  if (!start) return null;
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = parseDateWithoutTimezone(festival.end_date ?? null);
  if (!end || end.getTime() <= start.getTime()) return { first, last: first };
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const last = end.getHours() < 6 && endDay.getTime() > first.getTime() ? addDays(endDay, -1) : endDay;
  return { first, last };
}

/** « 19 – 21 nov. », « 30 oct. – 2 nov. », « 19 nov. » ; l'année si elle n'est pas celle de `now`. */
export function formatFestivalDates(festival: Dated, now: Date = new Date()): string {
  const days = festivalDays(festival);
  if (!days) return "";
  const year = isSameYear(days.last, now) ? "" : " yyyy";
  if (isSameDay(days.first, days.last)) return format(days.first, `d MMM${year}`, { locale: fr });
  if (isSameMonth(days.first, days.last)) {
    return `${format(days.first, "d", { locale: fr })} – ${format(days.last, `d MMM${year}`, { locale: fr })}`;
  }
  const firstYear = isSameYear(days.first, days.last) ? "" : " yyyy";
  return `${format(days.first, `d MMM${firstYear}`, { locale: fr })} – ${format(days.last, `d MMM${year}`, { locale: fr })}`;
}

export type ProgrammeWarning = "Sans lieu" | "Sans fin" | "Hors des dates du festival";

/**
 * Les alertes d'un événement du programme : sans lieu, sans heure de fin, ou qui commence ou finit hors des dates
 * du festival (`festivalSpan`).
 */
export function programmeWarnings(
  event: Dated & { location_id: string | null },
  festival: Dated,
): ProgrammeWarning[] {
  const warnings: ProgrammeWarning[] = [];
  if (!event.location_id) warnings.push("Sans lieu");
  if (!event.end_date) warnings.push("Sans fin");
  const span = festivalSpan(festival);
  const start = parseDateWithoutTimezone(event.date);
  const end = parseDateWithoutTimezone(event.end_date ?? null);
  if (
    span &&
    start &&
    (start.getTime() < span.start.getTime() ||
      start.getTime() > span.end.getTime() ||
      (end != null && end.getTime() > span.end.getTime()))
  ) {
    warnings.push("Hors des dates du festival");
  }
  return warnings;
}

/**
 * Les suggestions du programme d'un festival : parmi `candidates`, les événements dont la date tombe dans les
 * siennes et dont le titre ou la description le nomment (`festivalNameKey`, `textNamesFestival`). Ni le festival
 * lui-même, ni ce qui est déjà dans son programme (`exclude`), ni un événement rattaché à un autre festival, ni un
 * festival qui a son propre programme (un festival n'est pas dans un festival). Par date.
 */
export function suggestProgramme<
  T extends Dated & { id: string; title: string | null; description?: string | null; festival_id?: string | null },
>(
  festival: Dated & { id?: string | null; title: string | null },
  candidates: ReadonlyArray<T>,
  exclude: ReadonlyArray<string> = [],
): T[] {
  const key = festivalNameKey(festival.title);
  const excluded = new Set(exclude);
  if (festival.id) excluded.add(festival.id);
  const festivalsWithProgramme = new Set(candidates.map((candidate) => candidate.festival_id).filter(Boolean));
  return candidates
    .filter((candidate) => !excluded.has(candidate.id))
    .filter((candidate) => !candidate.festival_id || candidate.festival_id === festival.id)
    .filter((candidate) => !festivalsWithProgramme.has(candidate.id))
    .filter((candidate) => festivalCovers(festival, candidate.date))
    .filter(
      (candidate) =>
        textNamesFestival(candidate.title, key) || textNamesFestival(candidate.description ?? null, key),
    )
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}

/**
 * Une date en heure murale (un `Date` local) au format de la base, pour filtrer `events.date` :
 * « 2026-11-19T00:00:00.000Z » pour le 19 novembre à 0 h.
 */
export function toDatabaseWallClock(date: Date): string {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()),
  ).toISOString();
}

/** Le message d'une erreur d'enregistrement, en français quand c'est une règle des festivals. */
export function describeFestivalError(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null;
  if (error.code === "23514" && /festival/i.test(error.message ?? "")) {
    return "Un festival ne peut pas faire partie d’un festival : retire d’abord son programme, ou choisis un autre festival.";
  }
  return null;
}
