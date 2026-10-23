/*
 * Radio : les épisodes du flux RSS d'une émission (les 30 derniers chez Radio Campus Orléans,
 * `/podcasts/<slug>/itunes/feed/`). Un MP3 par diffusion, titré « Nation Groove du 22/10/2026 ».
 *
 * Dates : le flux donne de vrais instants UTC (« Thu, 22 Oct 2026 20:00:01 +0000 », 22:00 à Paris) ;
 * l'épisode est rangé à l'heure de Paris étiquetée UTC (« 2026-10-22T22:00:01+00:00 »), comme
 * events.date.
 */
import * as cheerio from "cheerio";

import { collapseSpaces, toParisLabelledUtc } from "./text";

export type RssEpisode = {
  guid: string;
  title: string;
  /** Heure de Paris étiquetée UTC. */
  airedAt: string;
  durationS: number | null;
  audioUrl: string;
  pageUrl: string | null;
};

/** `itunes:duration` en secondes : « 1:59:47 », « 59:47 » ou « 7187 » ; null sinon. */
export function parseItunesDuration(value: string | null | undefined): number | null {
  const text = collapseSpaces(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return seconds > 0 ? seconds : null;
  }
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  const total = Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
  return total > 0 ? total : null;
}

function httpUrl(value: string | undefined | null): string | null {
  const text = collapseSpaces(value);
  return /^https?:\/\//i.test(text) ? text : null;
}

export type RssParseResult = {
  episodes: RssEpisode[];
  /** Entrées sans fichier audio ni date lisible, sautées. */
  skipped: number;
};

/** Les épisodes d'un flux RSS 2.0 (podcast), dans l'ordre du flux ; un même guid n'est gardé qu'une fois. */
export function parseRssEpisodes(xml: string): RssParseResult {
  const $ = cheerio.load(xml, { xmlMode: true });
  if (!$("rss > channel, channel").length) throw new Error("Flux RSS illisible : pas de <channel>.");

  const episodes: RssEpisode[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  $("item").each((_, element) => {
    const item = $(element);
    const audioUrl = httpUrl(item.children("enclosure").first().attr("url"));
    const published = new Date(collapseSpaces(item.children("pubDate").first().text()));
    const title = collapseSpaces(item.children("title").first().text());
    if (!audioUrl || Number.isNaN(published.getTime()) || !title) {
      skipped += 1;
      return;
    }
    const pageUrl = httpUrl(item.children("link").first().text());
    const guid = collapseSpaces(item.children("guid").first().text()) || pageUrl || audioUrl;
    if (seen.has(guid)) {
      skipped += 1;
      return;
    }
    seen.add(guid);
    episodes.push({
      guid,
      title,
      airedAt: toParisLabelledUtc(published),
      durationS: parseItunesDuration(item.children("itunes\\:duration").first().text()),
      audioUrl,
      pageUrl,
    });
  });
  return { episodes, skipped };
}
