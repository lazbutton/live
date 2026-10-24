/*
 * Radio : ce que publie le site WordPress de Radio Campus Orléans (thème « rco »), lu en lecture seule
 * (`../live/docs/fonctionnalites/radio.md`, « Pour qui » et « Le contrat avec live-admin ») :
 * - l'API WordPress des émissions (`/wp-json/wp/v2/show`) : id, slug, nom, page, date de modification ;
 * - la page de chaque émission : le style (`.rco-show-style`), les créneaux
 *   (`.rco-show-infos-dates-time li`, « Jeudi 22h00 • 00h00 »), le lien du flux, la présentation ;
 * - la page « Titres diffusés » (`admin-ajax.php?action=rco-get-past-titles`, du HTML dans du JSON) :
 *   les morceaux et les débuts d'émission des quatre derniers jours.
 * Fixtures : lib/radio/fixtures/ (lues le 2026-10-23).
 */
import * as cheerio from "cheerio";

import { capitalizeFirst, collapseSpaces, htmlToText, normalizeForMatch } from "./text";

export type RadioFamily = "musique" | "parole";

/** Un créneau de la grille, comme `radio_shows.slots` : jour ISO (1 = lundi), heures de Paris. */
export type RadioSlot = {
  weekday: number;
  start: string;
  end: string;
};

/**
 * Famille par défaut d'une émission à sa création : parole pour ces 19, musique pour les autres
 * (`../live/docs/fonctionnalites/radio.md`, « Le contrat avec live-admin »). Ensuite modifiable dans le
 * back-office ; l'import n'y touche plus.
 */
export const SPOKEN_SHOW_SLUGS = new Set([
  "quoique-ten-dises",
  "champion-des-ondes",
  "la-mag-culturel",
  "ecoute-ta-fac",
  "alors-on-se-fait-un-film",
  "cine-qua-non",
  "parlons-philo",
  "a-batons-rompus",
  "lemission-du-fictionnaire",
  "la-science-infuse",
  "les-clitoriciennes",
  "univox",
  "redac-pop",
  "la-diagonale",
  "kawai-campus-club",
  "double-saut",
  "pause-poesie",
  "le-moulin-a-paroles",
  "h1000",
]);

export function defaultShowFamily(slug: string): RadioFamily {
  return SPOKEN_SHOW_SLUGS.has(slug) ? "parole" : "musique";
}

// Adresses --------------------------------------------------------------------------------------------

/** Une page de l'API des émissions (100 au plus par page), avec les seuls champs lus. */
export function wpShowsUrl(siteUrl: string, page = 1): string {
  const url = new URL("wp-json/wp/v2/show", siteUrl);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));
  url.searchParams.set("_fields", "id,slug,link,title,modified_gmt");
  return url.toString();
}

/** Le flux RSS d'une émission, quand sa page n'en donne pas le lien. */
export function defaultFeedUrl(siteUrl: string, slug: string): string {
  return new URL(`podcasts/${encodeURIComponent(slug)}/itunes/feed/`, siteUrl).toString();
}

/** « Titres diffusés » : le HTML des quatre derniers jours, dans du JSON. */
export function pastTitlesUrl(siteUrl: string): string {
  return new URL("wp-admin/admin-ajax.php?action=rco-get-past-titles", siteUrl).toString();
}

// API WordPress des émissions ---------------------------------------------------------------------

export type WpShow = {
  sourceId: number;
  slug: string;
  name: string;
  pageUrl: string;
  /** Dernière modification de l'émission sur le site (instant, ISO), si l'API la donne. */
  modifiedAt: string | null;
};

function decodeHtmlText(value: unknown): string {
  if (typeof value !== "string") return "";
  return collapseSpaces(cheerio.load(`<p>${value}</p>`)("p").first().text());
}

/** Les émissions d'une réponse de `/wp-json/wp/v2/show` ; une entrée illisible est sautée. */
export function parseWpShows(json: unknown): WpShow[] {
  if (!Array.isArray(json)) throw new Error("API des émissions : un tableau était attendu.");
  const shows: WpShow[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const sourceId = Number(row.id);
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    const title = row.title && typeof row.title === "object" ? (row.title as Record<string, unknown>).rendered : row.title;
    const name = decodeHtmlText(title);
    const pageUrl = typeof row.link === "string" ? row.link.trim() : "";
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !slug || !name || !/^https?:\/\//.test(pageUrl)) continue;
    const modified = typeof row.modified_gmt === "string" && row.modified_gmt ? new Date(`${row.modified_gmt}Z`) : null;
    shows.push({
      sourceId,
      slug,
      name,
      pageUrl,
      modifiedAt: modified && !Number.isNaN(modified.getTime()) ? modified.toISOString() : null,
    });
  }
  return shows;
}

// Page d'une émission --------------------------------------------------------------------------------

const WEEKDAYS: Record<string, number> = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 7,
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Un créneau écrit sur la page (« Jeudi 22h00 • 00h00 ») ; null s'il ne se lit pas. Une fin à minuit
 * s'écrit « 24:00 » ; une fin plus tôt que le début finit le lendemain (« Samedi 23h00 • 02h00 »).
 */
export function parseSlotLine(text: string): RadioSlot | null {
  const match =
    /^(\p{L}+)\s+(\d{1,2})\s*h\s*(\d{2})?\s*(?:[•·\-–—]|à)\s*(\d{1,2})\s*h\s*(\d{2})?$/iu.exec(collapseSpaces(text));
  if (!match) return null;
  const weekday = WEEKDAYS[normalizeForMatch(match[1])];
  const startHour = Number(match[2]);
  const startMinute = Number(match[3] ?? 0);
  const endHour = Number(match[4]);
  const endMinute = Number(match[5] ?? 0);
  if (!weekday || startHour > 23 || startMinute > 59 || endHour > 24 || endMinute > 59) return null;
  if (endHour === 24 && endMinute > 0) return null;
  const start = `${pad(startHour)}:${pad(startMinute)}`;
  const end = (endHour === 0 || endHour === 24) && endMinute === 0 ? "24:00" : `${pad(endHour)}:${pad(endMinute)}`;
  if (start === end) return null;
  return { weekday, start, end };
}

export type RcoShowPage = {
  style: string | null;
  slots: RadioSlot[];
  /** Les lignes de créneau qui ne se lisent pas (gardées pour le compte rendu de l'import). */
  unreadSlots: string[];
  feedUrl: string | null;
  description: string | null;
};

/**
 * La page d'une émission. null si ce n'est pas une page d'émission (thème changé, page d'erreur) :
 * l'import garde alors ce qu'il savait déjà.
 */
export function parseRcoShowPage(html: string, pageUrl: string): RcoShowPage | null {
  const $ = cheerio.load(html);
  const article = $("article.rco-show").first();
  if (!article.length) return null;

  const style = collapseSpaces(article.find(".rco-show-style").first().text());

  const slots: RadioSlot[] = [];
  const unreadSlots: string[] = [];
  article.find(".rco-show-infos-dates-time li").each((_, element) => {
    const line = collapseSpaces($(element).text());
    if (!line) return;
    const slot = parseSlotLine(line);
    if (!slot) unreadSlots.push(line);
    else if (!slots.some((known) => known.weekday === slot.weekday && known.start === slot.start)) slots.push(slot);
  });

  const feedHref =
    article.find(".rco-show-infos-feed-podcasts a[href]").first().attr("href") ??
    article.find('a[href*="/podcasts/"][href$="/feed/"]').first().attr("href");
  let feedUrl: string | null = null;
  if (feedHref) {
    try {
      feedUrl = new URL(feedHref, pageUrl).toString();
    } catch {
      feedUrl = null;
    }
  }

  const content = article.find(".rco-show-content .rco-content-inner").first().clone();
  content.find(".rco-share, .wp-block-image").remove();

  return {
    style: style ? capitalizeFirst(style) : null,
    slots,
    unreadSlots,
    feedUrl,
    description: htmlToText(content.html()),
  };
}

// « Titres diffusés » ------------------------------------------------------------------------------

export type PastTitleEntry =
  | { kind: "show"; at: string; name: string }
  | { kind: "track"; at: string; artist: string | null; title: string };

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

/**
 * Le jour d'un titre de journée (« vendredi 23 octobre ») : l'année est celle du dernier
 * 23 octobre passé, aujourd'hui compris (`today` : `AAAA-MM-JJ`, heure de Paris).
 */
export function parsePastTitlesDay(header: string, today: string): string | null {
  const match = /(\d{1,2})(?:er)?\s+(\p{L}+)/u.exec(normalizeForMatch(header));
  const [year, month, day] = today.split("-").map(Number);
  if (!match || !year) return null;
  const entryDay = Number(match[1]);
  const entryMonth = MONTHS[match[2]];
  if (!entryMonth || entryDay < 1 || entryDay > 31) return null;
  const entryYear = entryMonth > month || (entryMonth === month && entryDay > day) ? year - 1 : year;
  return `${entryYear}-${pad(entryMonth)}-${pad(entryDay)}`;
}

/**
 * Les entrées de « Titres diffusés », dans l'ordre de la page (la plus récente d'abord) : un début
 * d'émission (« 12:00 La Méridienne ») ou un morceau (« 11:57 Genevieve Murphy - Like Smoke »).
 * `at` : l'heure de Paris étiquetée UTC.
 */
export function parseRcoPastTitles(html: string, today: string): PastTitleEntry[] {
  const $ = cheerio.load(html);
  const entries: PastTitleEntry[] = [];
  $(".rco-past-titles-day-wrapper").each((_, dayElement) => {
    const day = parsePastTitlesDay($(dayElement).find("h2").first().text(), today);
    if (!day) return;
    $(dayElement)
      .find(".rco-past-titles-list > li")
      .each((__, item) => {
        const time = /^(\d{1,2}):(\d{2})$/.exec(collapseSpaces($(item).find(".rco-past-title-time").first().text()));
        if (!time) return;
        const at = `${day}T${pad(Number(time[1]))}:${time[2]}:00+00:00`;
        const show = collapseSpaces($(item).find(".rco-past-title-show").first().text());
        if (show) {
          entries.push({ kind: "show", at, name: show });
          return;
        }
        const title = collapseSpaces($(item).find(".rco-past-title-title").first().text());
        if (!title) return;
        const artist = collapseSpaces($(item).find(".rco-past-title-artist").first().text());
        entries.push({ kind: "track", at, artist: artist || null, title });
      });
  });
  return entries;
}

/** La réponse JSON d'`admin-ajax.php?action=rco-get-past-titles` : `{ success, data: { past_titles } }`. */
export function parsePastTitlesResponse(json: unknown, today: string): PastTitleEntry[] {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const data = body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  if (body?.success !== true || typeof data?.past_titles !== "string") {
    throw new Error("Titres diffusés : réponse inattendue.");
  }
  return parseRcoPastTitles(data.past_titles, today);
}
