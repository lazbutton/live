/*
 * Radio : l'import horaire des émissions et des épisodes (`GET /api/cron/radio-import`), en lecture
 * seule chez la radio (`../live/docs/RADIO_CAMPUS.md`, § 4). Pour chaque station, activée ou non (le
 * back-office prépare familles et collectifs avant l'activation) :
 *
 * 1. l'API WordPress des émissions : leur liste (id, slug, nom, page, date de modification) ;
 * 2. la page d'une émission, seulement si elle est nouvelle, modifiée sur le site, ou lue il y a plus de
 *    24 heures (12 par passage au plus pour ces dernières) : style, créneaux, lien du flux, présentation ;
 * 3. le flux RSS de chaque émission, pas plus d'une fois en 50 minutes, en lecture conditionnelle
 *    (ETag, Last-Modified : 304 sans changement) : ses épisodes (les 30 derniers), dates converties en
 *    heure de Paris étiquetée UTC.
 *
 * Idempotent : n'écrit que ce qui change. Une émission créée prend la famille par défaut (parole pour
 * les 19 de SPOKEN_SHOW_SLUGS, musique sinon) ; ensuite, famille et collectif (`organizer_id`) ne
 * bougent que dans le back-office. Un épisode retiré du flux est retiré ; une émission retirée du site
 * reste (ses épisodes la gardent active 45 jours). Une page ou un flux illisible ne change rien.
 * Trois lectures à la fois au plus ; plus rien n'est commencé après `deadline`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, TablesInsert } from "@/lib/supabase/database.types";

import { radioGet, readText, RadioHttpError, type RadioFetch } from "./http";
import {
  defaultFeedUrl,
  defaultShowFamily,
  parseRcoShowPage,
  parseWpShows,
  wpShowsUrl,
  type RadioSlot,
  type WpShow,
} from "./rco-site";
import { parseRssEpisodes, type RssEpisode } from "./rss";

type Client = SupabaseClient<Database>;

const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_REFRESH_MS = 24 * 60 * 60 * 1000;
const STALE_PAGES_PER_RUN = 12;
const FEED_MIN_INTERVAL_MS = 50 * 60 * 1000;
const MAX_API_PAGES = 5;

export type RadioStationImport = {
  station: string;
  /** Émissions de l'API WordPress ; null si l'API ne répond pas. */
  apiShows: number | null;
  showsCreated: number;
  showsUpdated: number;
  pagesRead: number;
  pagesFailed: number;
  feedsRead: number;
  /** 304 : rien de nouveau depuis la dernière lecture. */
  feedsUnchanged: number;
  /** Lus il y a moins de 50 minutes : pas relus. */
  feedsSkipped: number;
  feedsFailed: number;
  episodesCreated: number;
  episodesUpdated: number;
  episodesRemoved: number;
  /** Créneaux écrits sur une page qui ne se lisent pas. */
  unreadSlots: Array<{ slug: string; line: string }>;
  /** Lectures ou écritures en échec (une ligne chacune). */
  errors: string[];
  /** Le passage s'est arrêté à `deadline` : la suite au prochain. */
  stoppedEarly: boolean;
};

export type RadioImportReport = { stations: RadioStationImport[] };

export type RadioImportOptions = {
  fetchImpl?: RadioFetch;
  now?: Date;
  /** Instant (ms) après lequel plus aucune lecture n'est commencée. */
  deadline?: number;
  concurrency?: number;
};

type Settings = { fetchImpl?: RadioFetch; now: Date; deadline: number; concurrency: number };

type StationRow = { id: string; name: string; site_url: string };

type ShowRow = {
  id: string;
  source_id: number;
  slug: string;
  name: string;
  style: string | null;
  description: string | null;
  page_url: string;
  feed_url: string | null;
  slots: Json;
};

type SyncRow = {
  show_id: string;
  source_modified_at: string | null;
  page_checked_at: string | null;
  feed_checked_at: string | null;
  feed_etag: string | null;
  feed_last_modified: string | null;
};

type EpisodeRow = {
  id: string;
  guid: string;
  title: string;
  aired_at: string;
  duration_s: number | null;
  audio_url: string;
  page_url: string | null;
};

const SHOW_COLUMNS = "id, source_id, slug, name, style, description, page_url, feed_url, slots";

/** Les éléments, `limit` à la fois ; plus rien n'est commencé après `deadline`. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  deadline: number,
  work: (item: T) => Promise<R>,
): Promise<{ results: Array<R | undefined>; stoppedEarly: boolean }> {
  const results: Array<R | undefined> = new Array(items.length).fill(undefined);
  let next = 0;
  let stoppedEarly = false;
  const worker = async () => {
    while (next < items.length) {
      if (Date.now() >= deadline) {
        stoppedEarly = true;
        return;
      }
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return { results, stoppedEarly };
}

const sameInstant = (a: string | null | undefined, b: string | null | undefined) =>
  (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);

function slotsKey(slots: unknown): string {
  return JSON.stringify(
    (Array.isArray(slots) ? (slots as RadioSlot[]) : []).map((slot) => [slot.weekday, slot.start, slot.end]),
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

async function readSync(supabase: Client, showIds: string[]): Promise<Map<string, SyncRow>> {
  const syncByShow = new Map<string, SyncRow>();
  // Par paquets de 100 : les ids passent dans l'adresse.
  for (let start = 0; start < showIds.length; start += 100) {
    const { data, error } = await supabase
      .from("radio_show_sync")
      .select("show_id, source_modified_at, page_checked_at, feed_checked_at, feed_etag, feed_last_modified")
      .in("show_id", showIds.slice(start, start + 100));
    if (error) throw error;
    for (const sync of data ?? []) syncByShow.set(sync.show_id, sync);
  }
  return syncByShow;
}

async function fetchWpShowList(station: StationRow, fetchImpl?: RadioFetch): Promise<WpShow[]> {
  const shows: WpShow[] = [];
  for (let page = 1; page <= MAX_API_PAGES; page += 1) {
    const url = wpShowsUrl(station.site_url, page);
    const response = await radioGet(url, { fetchImpl, timeoutMs: REQUEST_TIMEOUT_MS, accept: "application/json" });
    shows.push(...parseWpShows(JSON.parse(await readText(url, response))));
    const totalPages = Number(response.headers.get("x-wp-totalpages") ?? "1");
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
  }
  return shows;
}

type PageFields = Pick<TablesInsert<"radio_shows">, "style" | "description" | "feed_url" | "slots">;
type PageResult = { wp: WpShow; row: ShowRow | null; fields: PageFields | null };

function showChanges(row: ShowRow, wp: WpShow, fields: PageFields | null): Partial<ShowRow> {
  const changes: Partial<ShowRow> = {};
  if (row.name !== wp.name) changes.name = wp.name;
  if (row.slug !== wp.slug) changes.slug = wp.slug;
  if (row.page_url !== wp.pageUrl) changes.page_url = wp.pageUrl;
  if (fields) {
    if (row.style !== (fields.style ?? null)) changes.style = fields.style ?? null;
    if (row.description !== (fields.description ?? null)) changes.description = fields.description ?? null;
    if (row.feed_url !== (fields.feed_url ?? null)) changes.feed_url = fields.feed_url ?? null;
    if (slotsKey(row.slots) !== slotsKey(fields.slots)) changes.slots = fields.slots as Json;
  }
  return changes;
}

/** La liste des émissions et les pages à relire, puis les émissions créées ou mises à jour. */
async function syncShows(supabase: Client, station: StationRow, report: RadioStationImport, settings: Settings) {
  const { data, error } = await supabase.from("radio_shows").select(SHOW_COLUMNS).eq("station_id", station.id);
  if (error) throw error;
  const rows = (data ?? []) as ShowRow[];
  const syncByShow = await readSync(supabase, rows.map((row) => row.id));

  let api: WpShow[];
  try {
    api = await fetchWpShowList(station, settings.fetchImpl);
    report.apiShows = api.length;
  } catch (error) {
    report.errors.push(`API des émissions : ${errorText(error)}`);
    return;
  }

  // Pages à lire : nouvelles, modifiées sur le site, jamais lues ; puis les plus anciennes lectures
  // (plus de 24 h), 12 au plus. Les autres émissions ne suivent que leur nom, slug et page.
  const rowBySource = new Map(rows.map((row) => [Number(row.source_id), row]));
  const urgent: PageResult[] = [];
  const stale: Array<PageResult & { checkedAt: number }> = [];
  const listOnly: PageResult[] = [];
  for (const wp of api) {
    const row = rowBySource.get(wp.sourceId) ?? null;
    const sync = row ? syncByShow.get(row.id) : undefined;
    if (!row || !sync?.page_checked_at || (wp.modifiedAt && !sameInstant(wp.modifiedAt, sync.source_modified_at))) {
      urgent.push({ wp, row, fields: null });
      continue;
    }
    const checkedAt = Date.parse(sync.page_checked_at);
    if (settings.now.getTime() - checkedAt > PAGE_REFRESH_MS) stale.push({ wp, row, fields: null, checkedAt });
    else listOnly.push({ wp, row, fields: null });
  }
  stale.sort((a, b) => a.checkedAt - b.checkedAt);
  const toRead = [...urgent, ...stale.slice(0, STALE_PAGES_PER_RUN)];
  listOnly.push(...stale.slice(STALE_PAGES_PER_RUN));

  const { results, stoppedEarly } = await mapWithLimit(toRead, settings.concurrency, settings.deadline, async (work) => {
    try {
      const response = await radioGet(work.wp.pageUrl, {
        fetchImpl: settings.fetchImpl,
        timeoutMs: REQUEST_TIMEOUT_MS,
        accept: "text/html",
      });
      const page = parseRcoShowPage(await readText(work.wp.pageUrl, response), work.wp.pageUrl);
      if (!page) throw new Error("pas une page d'émission");
      report.pagesRead += 1;
      for (const line of page.unreadSlots) report.unreadSlots.push({ slug: work.wp.slug, line });
      const fields: PageFields = {
        style: page.style,
        description: page.description,
        feed_url: page.feedUrl ?? defaultFeedUrl(station.site_url, work.wp.slug),
        slots: page.slots as unknown as Json,
      };
      return { ...work, fields };
    } catch (error) {
      report.pagesFailed += 1;
      report.errors.push(`Page ${work.wp.slug} : ${errorText(error)}`);
      return work;
    }
  });
  if (stoppedEarly) report.stoppedEarly = true;

  const checkedAt = settings.now.toISOString();
  const syncUpdates: Array<TablesInsert<"radio_show_sync">> = [];

  // Émissions nouvelles (page lue) : créées avec leur famille par défaut. Par lot ; si le lot est refusé,
  // une à une, pour ne perdre que celle qui coince (un slug déjà pris…).
  const created = results.filter((result): result is PageResult => Boolean(result?.fields && !result.row));
  const insertRows = created.map((result) => ({
    station_id: station.id,
    source_id: result.wp.sourceId,
    slug: result.wp.slug,
    name: result.wp.name,
    page_url: result.wp.pageUrl,
    family: defaultShowFamily(result.wp.slug),
    ...result.fields,
  }));
  const inserted: Array<{ id: string; source_id: number }> = [];
  if (insertRows.length) {
    const batch = await supabase.from("radio_shows").insert(insertRows).select("id, source_id");
    if (!batch.error) inserted.push(...batch.data);
    else {
      for (const row of insertRows) {
        const single = await supabase.from("radio_shows").insert(row).select("id, source_id").single();
        if (single.error) report.errors.push(`Création de ${row.slug} : ${errorText(single.error)}`);
        else inserted.push(single.data);
      }
    }
  }
  report.showsCreated += inserted.length;
  for (const row of inserted) {
    const result = created.find((candidate) => candidate.wp.sourceId === Number(row.source_id));
    syncUpdates.push({ show_id: row.id, source_modified_at: result?.wp.modifiedAt ?? null, page_checked_at: checkedAt });
  }

  // Émissions connues : ce qui a changé seulement (la page lue, sinon le nom, le slug et l'adresse).
  for (const result of [...results, ...listOnly]) {
    if (!result?.row) continue;
    const changes = showChanges(result.row, result.wp, result.fields);
    if (Object.keys(changes).length) {
      const { error: updateError } = await supabase.from("radio_shows").update(changes).eq("id", result.row.id);
      if (updateError) report.errors.push(`Émission ${result.row.slug} : ${errorText(updateError)}`);
      else report.showsUpdated += 1;
    }
    if (result.fields) {
      syncUpdates.push({ show_id: result.row.id, source_modified_at: result.wp.modifiedAt, page_checked_at: checkedAt });
    }
  }

  if (syncUpdates.length) {
    const { error: syncError } = await supabase.from("radio_show_sync").upsert(syncUpdates, { onConflict: "show_id" });
    if (syncError) report.errors.push(`Suivi des pages : ${errorText(syncError)}`);
  }
}

function episodeChanged(row: EpisodeRow, episode: RssEpisode): boolean {
  return (
    row.title !== episode.title ||
    !sameInstant(row.aired_at, episode.airedAt) ||
    row.duration_s !== episode.durationS ||
    row.audio_url !== episode.audioUrl ||
    row.page_url !== episode.pageUrl
  );
}

/** Le flux d'une émission : les épisodes nouveaux, changés ou retirés. */
async function syncFeed(
  supabase: Client,
  station: StationRow,
  show: { id: string; slug: string; feed_url: string | null },
  sync: SyncRow | undefined,
  report: RadioStationImport,
  settings: Settings,
) {
  const feedUrl = show.feed_url ?? defaultFeedUrl(station.site_url, show.slug);
  const headers: Record<string, string> = {};
  if (sync?.feed_etag) headers["If-None-Match"] = sync.feed_etag;
  if (sync?.feed_last_modified) headers["If-Modified-Since"] = sync.feed_last_modified;
  const response = await radioGet(feedUrl, {
    fetchImpl: settings.fetchImpl,
    timeoutMs: REQUEST_TIMEOUT_MS,
    accept: "application/rss+xml, application/xml, text/xml",
    headers,
  });
  const checkedAt = settings.now.toISOString();

  if (response.status === 304) {
    await response.body?.cancel().catch(() => undefined);
    report.feedsUnchanged += 1;
    const { error } = await supabase
      .from("radio_show_sync")
      .upsert({ show_id: show.id, feed_checked_at: checkedAt }, { onConflict: "show_id" });
    if (error) throw error;
    return;
  }

  const { episodes } = parseRssEpisodes(await readText(feedUrl, response));
  report.feedsRead += 1;

  const { data: existing, error: readError } = await supabase
    .from("radio_episodes")
    .select("id, guid, title, aired_at, duration_s, audio_url, page_url")
    .eq("show_id", show.id);
  if (readError) throw readError;
  const byGuid = new Map((existing ?? []).map((row) => [row.guid, row as EpisodeRow]));

  const changed = episodes.filter((episode) => {
    const row = byGuid.get(episode.guid);
    return !row || episodeChanged(row, episode);
  });
  if (changed.length) {
    const { error } = await supabase.from("radio_episodes").upsert(
      changed.map((episode) => ({
        show_id: show.id,
        guid: episode.guid,
        title: episode.title,
        aired_at: episode.airedAt,
        duration_s: episode.durationS,
        audio_url: episode.audioUrl,
        page_url: episode.pageUrl,
      })),
      { onConflict: "guid" },
    );
    if (error) throw error;
    for (const episode of changed) {
      if (byGuid.has(episode.guid)) report.episodesUpdated += 1;
      else report.episodesCreated += 1;
    }
  }

  // Sortis du flux (au-delà des 30 derniers, ou retirés par la radio) : retirés ici aussi. Un flux vide
  // ne retire rien (flux cassé plutôt qu'émission sans épisodes).
  const inFeed = new Set(episodes.map((episode) => episode.guid));
  const removed = (existing ?? []).filter((row) => !inFeed.has(row.guid));
  if (episodes.length && removed.length) {
    const { error } = await supabase.from("radio_episodes").delete().in("id", removed.map((row) => row.id));
    if (error) throw error;
    report.episodesRemoved += removed.length;
  }

  const { error: syncError } = await supabase.from("radio_show_sync").upsert(
    {
      show_id: show.id,
      feed_checked_at: checkedAt,
      feed_etag: response.headers.get("etag"),
      feed_last_modified: response.headers.get("last-modified"),
    },
    { onConflict: "show_id" },
  );
  if (syncError) throw syncError;
}

/** Les flux des émissions de la station, les moins récemment lus d'abord. */
async function syncEpisodes(supabase: Client, station: StationRow, report: RadioStationImport, settings: Settings) {
  const { data, error } = await supabase.from("radio_shows").select("id, slug, feed_url").eq("station_id", station.id);
  if (error) throw error;
  const shows = data ?? [];
  const syncByShow = await readSync(supabase, shows.map((show) => show.id));
  const lastRead = (id: string) => Date.parse(syncByShow.get(id)?.feed_checked_at ?? "1970-01-01T00:00:00Z");

  const due = shows
    .filter((show) => {
      if (settings.now.getTime() - lastRead(show.id) >= FEED_MIN_INTERVAL_MS) return true;
      report.feedsSkipped += 1;
      return false;
    })
    .sort((a, b) => lastRead(a.id) - lastRead(b.id) || a.slug.localeCompare(b.slug));

  const { stoppedEarly } = await mapWithLimit(due, settings.concurrency, settings.deadline, async (show) => {
    try {
      await syncFeed(supabase, station, show, syncByShow.get(show.id), report, settings);
    } catch (feedError) {
      report.feedsFailed += 1;
      const status = feedError instanceof RadioHttpError && feedError.status ? ` (HTTP ${feedError.status})` : "";
      report.errors.push(`Flux ${show.slug}${status} : ${errorText(feedError)}`);
    }
  });
  if (stoppedEarly) report.stoppedEarly = true;
}

/** Importe les émissions et les épisodes de toutes les stations. */
export async function importRadioStations(supabase: Client, options: RadioImportOptions = {}): Promise<RadioImportReport> {
  const settings: Settings = {
    fetchImpl: options.fetchImpl,
    now: options.now ?? new Date(),
    deadline: options.deadline ?? Date.now() + 45_000,
    concurrency: options.concurrency ?? 3,
  };
  const { data: stations, error } = await supabase.from("radio_stations").select("id, name, site_url").order("name");
  if (error) throw error;

  const report: RadioImportReport = { stations: [] };
  for (const station of stations ?? []) {
    const stationReport: RadioStationImport = {
      station: station.name,
      apiShows: null,
      showsCreated: 0,
      showsUpdated: 0,
      pagesRead: 0,
      pagesFailed: 0,
      feedsRead: 0,
      feedsUnchanged: 0,
      feedsSkipped: 0,
      feedsFailed: 0,
      episodesCreated: 0,
      episodesUpdated: 0,
      episodesRemoved: 0,
      unreadSlots: [],
      errors: [],
      stoppedEarly: false,
    };
    report.stations.push(stationReport);
    await syncShows(supabase, station, stationReport, settings);
    await syncEpisodes(supabase, station, stationReport, settings);
  }
  return report;
}
