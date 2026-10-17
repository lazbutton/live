/*
 * Événements à venir d'une page Facebook publique, lus sans connexion (onglet « Événements »).
 * Les pages qui réservent leurs événements aux membres connectés renvoient une erreur :
 * l'agent les lit alors dans le navigateur.
 */

export type FacebookPageEvent = {
  url: string;
  title?: string;
  /** Date indicative, heure murale de Paris (`YYYY-MM-DDTHH:mm:00`). */
  date?: string;
  cancelled?: boolean;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Date affichée dans la liste (« Sat, Oct 24 at 7:00 PM CEST », « Thu, Nov 19 - Nov 22 ») :
 * heure locale de l'événement, année déduite du jour de la semaine (sinon prochaine occurrence).
 */
export function parseFacebookListDate(text: string | undefined, now: Date = new Date()): string | undefined {
  const match = /(?:\b(sun|mon|tue|wed|thu|fri|sat)\w*,?\s+)?\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/i.exec(
    text || "",
  );
  if (!match) return undefined;
  const [, weekdayName, monthName, dayText, yearText, hourText, minuteText, meridiem] = match;
  const month = MONTHS.indexOf(monthName.toLowerCase()) + 1;
  const day = Number(dayText);
  const weekday = weekdayName ? WEEKDAYS.indexOf(weekdayName.toLowerCase()) : -1;
  const weekdayOf = (year: number) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const thisYear = now.getFullYear();
  let year = yearText ? Number(yearText) : undefined;
  if (year === undefined && weekday >= 0) year = [thisYear, thisYear + 1].find((candidate) => weekdayOf(candidate) === weekday);
  if (year === undefined) {
    const passed = new Date(thisYear, month - 1, day + 1).getTime() < now.getTime();
    year = passed ? thisYear + 1 : thisYear;
  }
  let hour = hourText ? Number(hourText) % 12 : 0;
  if (meridiem?.toLowerCase() === "pm") hour += 12;
  if (hourText && !meridiem) hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

/** Adresse de la page telle que l'attend la bibliothèque (sans onglet ni paramètres). */
function pageAddress(raw: string): { kind: "page" | "profile" | "group"; url: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] === "profile.php") {
    const id = url.searchParams.get("id");
    return id ? { kind: "profile", url: `https://www.facebook.com/profile.php?id=${id}` } : null;
  }
  if (segments[0] === "groups" && segments[1]) return { kind: "group", url: `https://www.facebook.com/groups/${segments[1]}` };
  if (!segments[0] || ["events", "pages", "p", "people"].includes(segments[0])) return null;
  return { kind: "page", url: `https://www.facebook.com/${segments[0]}` };
}

export async function listFacebookPageEvents(rawUrl: string): Promise<FacebookPageEvent[]> {
  const address = pageAddress(rawUrl);
  if (!address) throw new Error("Adresse de page Facebook non reconnue.");
  const library = await import("facebook-event-scraper");
  const list =
    address.kind === "profile"
      ? await library.scrapeFbEventListFromProfile(address.url, library.EventType.Upcoming)
      : address.kind === "group"
        ? await library.scrapeFbEventListFromGroup(address.url, library.EventType.Upcoming)
        : await library.scrapeFbEventListFromPage(address.url, library.EventType.Upcoming);
  return list
    .filter((event) => event.url && !event.isPast)
    .map((event) => ({
      url: event.url,
      title: event.name || undefined,
      date: parseFacebookListDate(event.date),
      cancelled: event.isCanceled || undefined,
    }));
}
