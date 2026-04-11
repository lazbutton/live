const DEFAULT_TIME_ZONE = "Europe/Paris";

export interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ZonedDateParts extends LocalDateParts {
  hour: number;
  minute: number;
  second: number;
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function getZonedDateParts(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(date);

  const values = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): number {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

export function zonedTimeToUtc(
  parts: ZonedDateParts,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let result = new Date(utcGuess);
  for (let i = 0; i < 2; i += 1) {
    const offsetMs = getTimeZoneOffsetMs(result, timeZone);
    result = new Date(utcGuess - offsetMs);
  }

  return result;
}

export function addDaysToLocalDate(
  parts: LocalDateParts,
  days: number,
): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function getIsoLocalDate(parts: LocalDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getIsoLocalTime(parts: Pick<ZonedDateParts, "hour" | "minute">): string {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function getLocalWeekday(parts: LocalDateParts): number {
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

function normalizeMinutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function formatHourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Compare deux horaires HH:mm avec une fenêtre tolérante, en gérant aussi
 * correctement le passage à minuit (ex: 23:58 vs 00:02).
 */
export function isWithinScheduledWindow(args: {
  currentHour: number;
  currentMinute: number;
  scheduledHour: number;
  scheduledMinute: number;
  windowMinutes: number;
}): boolean {
  const current = normalizeMinutesOfDay(args.currentHour, args.currentMinute);
  const scheduled = normalizeMinutesOfDay(args.scheduledHour, args.scheduledMinute);
  const rawDiff = Math.abs(current - scheduled);
  const wrappedDiff = 24 * 60 - rawDiff;
  const shortestDiff = Math.min(rawDiff, wrappedDiff);
  return shortestDiff <= args.windowMinutes;
}
