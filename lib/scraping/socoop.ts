import { toParisWallClock } from "./dates";
import { SCRAPER_USER_AGENT } from "./fetch-html";
import { decodeHtmlText, type CheerioDocument } from "./structured-event";

/*
 * Billetteries Socoop « So Ticket » (L'Astrolabe, La Passerelle…) : l'agenda est dessiné en
 * JavaScript par des composants <sonic-…>, la page ne contient aucun lien vers les spectacles.
 * On lit donc l'API publique qu'appelle la page, avec le jeton client anonyme qu'elle publie
 * elle-même (`<sonic-tickets-app token="…" serviceURL="/api/v2">`).
 */

export type SocoopAgenda = {
  origin: string;
  /** Base de l'API (`https://billetterie.lastrolabe.org/api/v2`). */
  apiUrl: string;
  token: string;
};

export type SocoopShow = {
  id?: number;
  slug?: string;
  /** Début, horodatage Unix en secondes. */
  start_date?: number;
  edito?: { title?: string | null } | null;
  picture?: { url?: string | null } | null;
  infos_status?: { publication?: string | null } | null;
};

export type SocoopAgendaEvent = { url: string; title?: string; date?: string; image_url?: string; cancelled?: boolean };

const PAGE_SIZE = 50;

/** Agenda Socoop de la page (attributs lus en minuscules, comme cheerio les range). */
export function readSocoopAgenda($: CheerioDocument, pageUrl: string): SocoopAgenda | null {
  if ($("sonic-agenda").length === 0) return null;
  const app = $("[token][serviceurl]").first();
  const token = app.attr("token")?.trim();
  const service = app.attr("serviceurl")?.trim();
  if (!token || !service) return null;
  try {
    const origin = new URL(pageUrl).origin;
    return { origin, apiUrl: new URL(service, origin).toString().replace(/\/+$/, ""), token };
  } catch {
    return null;
  }
}

/** Spectacles à venir de l'agenda, par pages de 50. */
export async function fetchSocoopShows(agenda: SocoopAgenda, { maxShows = 200 } = {}): Promise<SocoopShow[]> {
  const shows: SocoopShow[] = [];
  for (let offset = 0; offset < maxShows; offset += PAGE_SIZE) {
    const response = await fetch(`${agenda.apiUrl}/shows?offset=${offset}&limit=${PAGE_SIZE}&next=1&ids_agenda=0`, {
      headers: { Authorization: `Bearer ${agenda.token}`, Accept: "application/json", "User-Agent": SCRAPER_USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`L'API de la billetterie répond avec une erreur ${response.status}.`);
    const json = (await response.json()) as { data?: unknown };
    const page = Array.isArray(json.data) ? (json.data as SocoopShow[]) : [];
    shows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return shows;
}

/** Un spectacle → sa page publique (`/agenda/241-JUKE-BOX-BOUM`), qui s'importe comme les autres. */
export function socoopShowToAgendaEvent(show: SocoopShow, origin: string): SocoopAgendaEvent | null {
  if (!show?.slug) return null;
  const start = typeof show.start_date === "number" && show.start_date > 0 ? toParisWallClock(new Date(show.start_date * 1000)) : null;
  const title = show.edito?.title ? decodeHtmlText(show.edito.title) : undefined;
  return {
    url: `${origin}/agenda/${encodeURI(show.slug)}`,
    title: title || undefined,
    date: start?.value,
    image_url: show.picture?.url || undefined,
    cancelled: /cancel|annul/i.test(show.infos_status?.publication || "") || undefined,
  };
}
