import { isValid, parse } from "date-fns";
import { fr } from "date-fns/locale";

import { getZonedDateParts } from "@/lib/cron-timezone";

/*
 * L'app stocke les heures « murales » (20:00 saisi = 20:00 affiché, sans fuseau).
 * Toute date scrapée est donc ramenée à l'heure de Paris, au format
 * `YYYY-MM-DDTHH:mm:00`, sans suffixe de fuseau.
 */

export type WallClockDate = {
  value: string;
  /** Faux quand seule la date est connue (heure à vérifier). */
  timeKnown: boolean;
  /** Le jour de la semaine écrit ne correspond pas à la date (« dimanche 11 novembre 2026 »). */
  weekdayMismatch?: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");

function formatWallClock(parts: { year: number; month: number; day: number; hour: number; minute: number }) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:00`;
}

const DATE_PATTERNS_WITH_YEAR = [
  "d/M/yyyy HH:mm",
  "d/M/yyyy H:mm",
  "d-M-yyyy HH:mm",
  "d-M-yyyy H:mm",
  "d.M.yyyy HH:mm",
  "d.M.yyyy H:mm",
  "d/M/yyyy",
  "d-M-yyyy",
  "d.M.yyyy",
  "d MMMM yyyy HH:mm",
  "d MMMM yyyy H:mm",
  "d MMM yyyy HH:mm",
  "d MMM yyyy H:mm",
  "d MMMM yyyy",
  "d MMM yyyy",
];

const DATE_PATTERNS_WITHOUT_YEAR = [
  "d/M HH:mm",
  "d/M H:mm",
  "d.M HH:mm",
  "d/M",
  "d.M",
  "d MMMM HH:mm",
  "d MMMM H:mm",
  "d MMM HH:mm",
  "d MMM H:mm",
  "d MMMM",
  "d MMM",
];

/** Jours de la semaine (numérotation de `Date.getDay`, dimanche = 0), noms complets et abrégés. */
const WEEKDAY_NUMBERS: Record<string, number> = {
  dimanche: 0,
  dim: 0,
  lundi: 1,
  lun: 1,
  mardi: 2,
  mar: 2,
  mercredi: 3,
  mer: 3,
  jeudi: 4,
  jeu: 4,
  vendredi: 5,
  ven: 5,
  samedi: 6,
  sam: 6,
};
const WEEKDAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEKDAY = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim";

function sanitizeFrenchDate(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b1er\b/g, "1")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+[•–—|-]\s+/g, " ")
    .replace(/\s+(à|a|dès|des|de)\s+(?=\d)/gi, " ")
    .replace(/\b([a-zàâçéèêëîïôûùüÿœæ]{3,})\./giu, "$1")
    .replace(/(\d{1,2})\s*h\s*(\d{2})/gi, "$1:$2")
    .replace(/(\d{1,2})\s*h\b/gi, "$1:00")
    .trim();
}

/** Jour de la semaine (0 = dimanche) d'une date du calendrier. */
function weekdayOf(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Analyse une date écrite en français (« samedi 17 octobre 2026 à 20h30 », « dim. 01/11 », « 17/10 »). */
export function parseFrenchDate(
  value: string,
  referenceDate: Date = new Date(),
): { date: Date; timeKnown: boolean; weekdayMismatch?: boolean } | null {
  let cleaned = sanitizeFrenchDate(value);
  if (!cleaned) return null;
  // Le jour de la semaine est lu à part : il sert à trouver l'année, pas à date-fns.
  const weekdayMatch = new RegExp(`^(${WEEKDAY})\\.?\\s+(?=\\d)`).exec(cleaned);
  const weekday = weekdayMatch ? WEEKDAY_NUMBERS[weekdayMatch[1]] : undefined;
  if (weekdayMatch) cleaned = cleaned.slice(weekdayMatch[0].length);
  const hasYear = /\b(19|20)\d{2}\b/.test(cleaned);
  const patterns = hasYear ? DATE_PATTERNS_WITH_YEAR : DATE_PATTERNS_WITHOUT_YEAR;

  for (const pattern of patterns) {
    const parsed = parse(cleaned, pattern, referenceDate, { locale: fr });
    if (!isValid(parsed)) continue;
    const timeKnown = /H/.test(pattern);
    const sameWeekday = (date: Date) => weekday === undefined || date.getDay() === weekday;
    if (hasYear) return { date: parsed, timeKnown, weekdayMismatch: !sameWeekday(parsed) || undefined };

    // Sans année : l'année où ce jour tombe bien le jour de semaine écrit (« mercredi 7 octobre »
    // est le 7 octobre 2026 et non 2027) ; une seule convient entre l'an dernier et l'an prochain.
    if (weekday !== undefined) {
      for (const offset of [0, 1, -1]) {
        const candidate = new Date(parsed);
        candidate.setFullYear(parsed.getFullYear() + offset);
        if (candidate.getDate() === parsed.getDate() && sameWeekday(candidate)) return { date: candidate, timeKnown };
      }
    }
    // Sinon : une date déjà passée de plus de deux mois désigne l'an prochain.
    if (parsed.getTime() < referenceDate.getTime() - 60 * 86_400_000) {
      parsed.setFullYear(parsed.getFullYear() + 1);
    }
    return { date: parsed, timeKnown, weekdayMismatch: weekday !== undefined || undefined };
  }
  return null;
}

export type ParisWallClockOptions = {
  /** Les dates ISO sans fuseau sont en UTC (pages Odoo), pas des heures murales. */
  naiveUtc?: boolean;
};

/** Ramène une date (ISO avec ou sans fuseau, ou texte français) à l'heure murale de Paris. */
export function toParisWallClock(
  value: unknown,
  referenceDate: Date = new Date(),
  options: ParisWallClockOptions = {},
): WallClockDate | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { value: formatWallClock(getZonedDateParts(value)), timeKnown: true };
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ISO avec fuseau (Z, +02:00…) : conversion vers Europe/Paris.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const date = new Date(trimmed.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    if (Number.isNaN(date.getTime())) return null;
    return { value: formatWallClock(getZonedDateParts(date)), timeKnown: true };
  }

  // ISO sans fuseau : déjà une heure murale, sauf pour les sources qui écrivent en UTC.
  const local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(trimmed);
  if (local) {
    const [, year, month, day, hour, minute] = local;
    if (hour === undefined) return { value: `${year}-${month}-${day}T00:00:00`, timeKnown: false };
    if (options.naiveUtc) {
      const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
      return { value: formatWallClock(getZonedDateParts(utc)), timeKnown: true };
    }
    return { value: `${year}-${month}-${day}T${hour}:${minute}:00`, timeKnown: true };
  }

  const parsed = parseFrenchDate(trimmed, referenceDate);
  if (!parsed) return null;
  return {
    value: formatWallClock({
      year: parsed.date.getFullYear(),
      month: parsed.date.getMonth() + 1,
      day: parsed.date.getDate(),
      hour: parsed.timeKnown ? parsed.date.getHours() : 0,
      minute: parsed.timeKnown ? parsed.date.getMinutes() : 0,
    }),
    timeKnown: parsed.timeKnown,
    ...(parsed.weekdayMismatch ? { weekdayMismatch: true } : {}),
  };
}

/** Date du jour à Paris (`YYYY-MM-DD`), pour écarter les événements passés. */
export function parisToday(now: Date = new Date()) {
  const parts = getZonedDateParts(now);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

const MONTHS = "janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?";
/** Jour de semaine facultatif devant une date (« mercredi 7 octobre », « dim. 01/11 »). */
const OPTIONAL_WEEKDAY = `(?:\\b(?:${WEEKDAY})\\.?\\s+)?`;

/** Repère une date dans un texte libre ou une URL (indice pour trier les liens d'agenda). */
export function findDateInText(text: string, referenceDate: Date = new Date()): WallClockDate | null {
  const candidates = [
    new RegExp(
      `${OPTIONAL_WEEKDAY}\\b\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\.?(?:\\s+\\d{4})?(?:\\s*(?:à|-|,)?\\s*\\d{1,2}\\s*[h:]\\s*\\d{0,2})?`,
      "i",
    ),
    new RegExp(`${OPTIONAL_WEEKDAY}\\b\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}(?:\\s*(?:à|-)?\\s*\\d{1,2}\\s*[h:]\\s*\\d{0,2})?`, "i"),
    /\b\d{1,2}-\d{1,2}-\d{4}\b/,
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/,
    new RegExp(`${OPTIONAL_WEEKDAY}\\b\\d{1,2}\\/\\d{1,2}\\b(?!\\/\\d)`, "i"),
  ];
  for (const pattern of candidates) {
    const match = pattern.exec(text);
    if (!match) continue;
    const parsed = toParisWallClock(match[0], referenceDate);
    if (parsed) return parsed;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Contrôle des dates lues                                             */
/* ------------------------------------------------------------------ */

function monthNumber(raw: string) {
  const key = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const prefixes = ["jan", "fev", "mar", "avr", "mai", "juin", "juil", "aou", "sep", "oct", "nov", "dec"];
  const index = prefixes.findIndex((prefix) => key.startsWith(prefix));
  return index === -1 ? undefined : index + 1;
}

type DateMention = { raw: string; day: number; month: number; year?: number; weekday?: number };

const MENTION_PATTERN = `(?:\\b(${WEEKDAY})\\.?\\s+)?\\b(\\d{1,2})(?:er)?(?:\\s+(${MONTHS})\\b\\.?|\\s*[/.]\\s*(\\d{1,2})(?!\\d))(?:(?:\\s+|\\s*[/.]\\s*)((?:19|20)\\d{2})\\b)?`;

/** Dates écrites dans un texte, avec leur jour de semaine et leur année quand ils y sont. */
function findDateMentions(text: string): DateMention[] {
  const mentions: DateMention[] = [];
  for (const match of text.matchAll(new RegExp(MENTION_PATTERN, "gi"))) {
    const [raw, weekday, day, monthName, monthDigits, year] = match;
    const month = monthName ? monthNumber(monthName) : Number(monthDigits);
    if (!month || month > 12 || Number(day) < 1 || Number(day) > 31) continue;
    mentions.push({
      raw: raw.trim(),
      day: Number(day),
      month,
      year: year ? Number(year) : undefined,
      weekday: weekday ? WEEKDAY_NUMBERS[weekday.toLowerCase()] : undefined,
    });
  }
  return mentions;
}

/**
 * Nombre de dates écrites dans un texte (« 28 février », « 12/02/2027 ») : un agenda en texte seul
 * en cite plusieurs. Les « 24/7 » et autres chiffres sans mois écrit ni année ne comptent pas.
 */
export function countDateMentions(text: string) {
  return findDateMentions(text).filter((mention) => /[a-zé]/i.test(mention.raw) || mention.year !== undefined).length;
}

export type DateCheck = {
  /** Date retenue (`YYYY-MM-DDTHH:mm:ss`), éventuellement avec l'année corrigée. */
  value: string;
  /** Année corrigée d'après le jour de la semaine écrit sur la page. */
  corrected?: boolean;
  /** Incohérence à faire vérifier (la date n'est pas sûre). */
  warning?: string;
};

/**
 * Confronte une date lue (souvent par l'IA) aux mentions « jour de semaine + date » de la page :
 * « mercredi 7 octobre » rend l'année certaine (2026 et non 2027) ; « dimanche 11 novembre 2026 »
 * (un mercredi) signale une page incohérente.
 */
export function checkDateAgainstText(value: string, texts: Array<string | null | undefined>): DateCheck {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return { value };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const mentions = texts
    .flatMap((text) => findDateMentions(text || ""))
    .filter((mention) => mention.weekday !== undefined && mention.day === day && mention.month === month);
  if (mentions.length === 0) return { value };

  const fits = (candidate: number, mention: DateMention) =>
    (mention.year === undefined || mention.year === candidate) && weekdayOf(candidate, month, day) === mention.weekday;
  if (mentions.some((mention) => fits(year, mention))) return { value };

  const label = `${pad(day)}/${pad(month)}/${year}`;
  const sameYear = mentions.find((mention) => mention.year === year);
  if (sameYear) {
    return { value, warning: `La page annonce « ${sameYear.raw} », or le ${label} est un ${WEEKDAY_NAMES[weekdayOf(year, month, day)]}.` };
  }
  // Seules les mentions sans année fixent l'année (« mercredi 7 octobre ») ; une autre année écrite
  // en toutes lettres parle sans doute d'une autre édition.
  const undated = mentions.filter((mention) => mention.year === undefined);
  if (undated.length === 0) return { value };
  const corrected = [year - 1, year + 1].find((candidate) => undated.every((mention) => fits(candidate, mention)));
  if (corrected !== undefined) return { value: `${corrected}${value.slice(4)}`, corrected: true };
  return { value, warning: `La page annonce « ${undated[0].raw} », qui ne correspond pas au ${label}.` };
}

/* ------------------------------------------------------------------ */
/* Ouverture des portes et début                                       */
/* ------------------------------------------------------------------ */

const CLOCK = "(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?(?!\\d)";
/** « OUVERTURE DES PORTES À 15H », « ouverture des portes : 19h30 ». */
const DOORS_PATTERN = new RegExp(`ouverture\\s+des\\s+portes\\s*(?:à|a|:|-|dès|des)?\\s*${CLOCK}`, "gi");
/** « DÉBUT À 15H30 », « DÉBUT DE LA 1ÈRE PARTIE À 21H », « début du concert : 20h30 », « débute à 20h ». */
const START_PATTERN = new RegExp(
  `d[ée]but(?:e|era)?(?:\\s+(?:du|de\\s+la|de\\s+l['’]|des|de)\\s+[^,.;:\\n]{1,40}?)?\\s*(?:à|a|:|-)?\\s*${CLOCK}`,
  "gi",
);

function clockTimes(texts: Array<string | null | undefined>, pattern: RegExp) {
  const times = new Set<string>();
  for (const text of texts) {
    for (const match of (text || "").matchAll(pattern)) {
      const [hour, minute] = [Number(match[1]), Number(match[2] ?? 0)];
      if (hour <= 23 && minute <= 59) times.add(`${pad(hour)}:${pad(minute)}`);
    }
  }
  return times;
}

/**
 * Heures d'ouverture des portes et de début écrites dans une page (« OUVERTURE DES PORTES À 20H, DÉBUT DE
 * LA 1ÈRE PARTIE À 20H30 » → 20:00 et 20:30), au format `HH:mm`. Une heure n'est rendue que si la page
 * n'en écrit qu'une (plusieurs séances : rien).
 */
export function findDoorsAndStart(texts: Array<string | null | undefined>): { doors?: string; start?: string } {
  const doors = clockTimes(texts, DOORS_PATTERN);
  const starts = clockTimes(texts, START_PATTERN);
  return {
    ...(doors.size === 1 ? { doors: [...doors][0] } : {}),
    ...(starts.size === 1 ? { start: [...starts][0] } : {}),
  };
}

/** Plage de jours dans un titre (« du 19 au 21/11 », « 19-21 novembre ») : rien à comparer. */
const TITLE_DATE_RANGE = new RegExp(`\\b\\d{1,2}(?:er)?\\s*(?:au|-|–|&|et)\\s*\\d{1,2}(?:er)?\\s*(?:/|${MONTHS})`, "i");

/**
 * Date écrite dans le titre qui ne correspond à aucune séance (« Atelier teinture - dim. 12/07 »
 * pour un atelier du 21/11) : titre périmé recopié, ou mauvaise date retenue.
 */
export function titleDateConflict(title: string, dates: Array<string | null | undefined>): string | null {
  if (TITLE_DATE_RANGE.test(title)) return null;
  const mentions = findDateMentions(title);
  const days = dates
    .map((date) => /^\d{4}-(\d{2})-(\d{2})/.exec(date || ""))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({ month: Number(match[1]), day: Number(match[2]) }));
  if (mentions.length === 0 || days.length === 0) return null;
  if (mentions.some((mention) => days.some((day) => day.day === mention.day && day.month === mention.month))) return null;
  return `Le titre annonce « ${mentions[0].raw} », la date lue est le ${pad(days[0].day)}/${pad(days[0].month)}.`;
}

const TITLE_DATE = `(?:(?:${WEEKDAY})\\.?\\s+)?\\d{1,2}(?:er)?(?:\\s+(?:${MONTHS})\\.?|\\s*/\\s*\\d{1,2})(?:(?:\\s+|\\s*/\\s*)(?:19|20)\\d{2})?`;
const TRAILING_TITLE_DATE = new RegExp(`\\s*[-–—|:,]\\s*${TITLE_DATE}\\s*$`, "i");
const LEADING_TITLE_DATE = new RegExp(`^${TITLE_DATE}\\s*[-–—|:,]\\s*`, "i");
/** « Live de chant - Novembre 2026 », « Expo (octobre 2026) ». */
const TRAILING_MONTH_YEAR = new RegExp(`\\s*[-–—|:,(]\\s*(?:${MONTHS})\\.?\\s+(?:19|20)\\d{2}\\s*\\)?\\s*$`, "i");

/**
 * Retire la date collée au début ou à la fin d'un titre (« Atelier broderie - dim. 01/11 »,
 * « Samedi 31 octobre 2026 : Atelier SITA », « … - Novembre 2026 ») : l'agenda affiche déjà la date.
 */
export function stripDateFromTitle(title: string) {
  const stripped = title
    .replace(TRAILING_TITLE_DATE, "")
    .replace(TRAILING_MONTH_YEAR, "")
    .replace(LEADING_TITLE_DATE, "")
    .trim();
  return stripped.length >= 3 ? stripped : title.trim();
}
