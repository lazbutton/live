/*
 * Radio : « ce qui passe », pour `GET /api/v1/radio/{stationId}/live` (contrat : docs/API_APP.md,
 * « Radio »). Trois sources :
 * - la grille, en SQL (`radio_live_grid`) : l'émission en cours, la suivante, et celles prévues autour de
 *   maintenant ;
 * - le titre du serveur Icecast (`status_url`) : pendant une émission, son nom ; entre deux, le morceau ;
 * - « Titres diffusés » sur le site de la radio, pour les morceaux d'avant (gardés 60 s).
 *
 * Règles :
 * - pendant une émission, la radio n'envoie que son nom : `show` d'après la grille, `track` à null ;
 * - si la grille annonce une émission mais que le serveur envoie un morceau (l'émission n'a pas lieu),
 *   c'est la playlist : `show` à null, `track` et `recentTracks` ;
 * - entre deux émissions : `track` et `recentTracks`, les quatre d'avant (sans jingles, sans remonter
 *   au-delà d'un début d'émission ni de deux heures) ;
 * - serveur muet : `show` d'après la grille, `track` à null, `recentTracks` vide ;
 * - le serveur envoie le nom d'une émission prévue mais pas active (La Méridienne, sans podcast) : ni
 *   `show` ni `track`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RadioLiveResponse, RadioRecentTrack } from "@/lib/api/v1/radio/schemas";
import { parisToday } from "@/lib/scraping/dates";
import type { Database } from "@/lib/supabase/database.types";

import { pickIcecastTitle } from "./icecast";
import { parseLenientJson, radioGet, readText, type RadioFetch } from "./http";
import { parsePastTitlesResponse, pastTitlesUrl, type PastTitleEntry } from "./rco-site";
import { collapseSpaces, formatParisLabelled, toParisLabelledUtc } from "./text";
import { cleanArtist, cleanTrackTitle, isJingle, parseStreamTitle, sameTrack, titleNamesShow, type RadioTrack } from "./tracks";

export type RadioStationRow = {
  id: string;
  name: string;
  frequency: string;
  stream_url: string;
  stream_url_light: string | null;
  status_url: string;
  site_url: string;
};

export type RadioGridRow = {
  kind: string;
  show_id: string;
  name: string;
  style: string | null;
  family: string;
  starts_at: string;
  ends_at: string;
};

const RECENT_TRACKS = 4;
const RECENT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

type StreamTitleKind =
  | { kind: "silent" }
  | { kind: "show" }
  | { kind: "jingle" }
  | { kind: "track"; track: RadioTrack };

/**
 * Ce que dit le titre du serveur : rien (serveur muet ou sans titre), le nom d'une émission prévue
 * autour de maintenant, un jingle, ou un morceau.
 */
export function classifyStreamTitle(
  streamTitle: string | null | undefined,
  grid: RadioGridRow[],
  stationName: string,
): StreamTitleKind {
  const title = collapseSpaces(streamTitle);
  if (!title) return { kind: "silent" };
  if (grid.some((row) => row.kind === "on_air" && titleNamesShow(title, row.name))) return { kind: "show" };
  const parsed = parseStreamTitle(title);
  if (!parsed || isJingle(parsed, stationName)) return { kind: "jingle" };
  return { kind: "track", track: { title: cleanTrackTitle(parsed.title), artist: cleanArtist(parsed.artist) } };
}

/** Les morceaux de « Titres diffusés » joués avant `current` (le plus récent d'abord). */
export function recentTracksBefore(
  entries: PastTitleEntry[] | null,
  current: RadioTrack | null,
  stationName: string,
  now: Date,
): RadioRecentTrack[] {
  const nowWall = Date.parse(toParisLabelledUtc(now));
  const tracks: RadioRecentTrack[] = [];
  let first = true;
  for (const entry of entries ?? []) {
    // Une heure à venir : la page et l'horloge ne s'accordent pas, l'entrée ne compte pas.
    if (Date.parse(entry.at) > nowWall) continue;
    // Avant un début d'émission, ce n'est plus « juste avant ».
    if (entry.kind === "show") break;
    if (isJingle(entry, stationName)) continue;
    if (nowWall - Date.parse(entry.at) > RECENT_MAX_AGE_MS) break;
    if (first) {
      first = false;
      // La page a souvent déjà le morceau en cours en tête.
      if (current && sameTrack(entry, current)) continue;
    }
    tracks.push({ at: entry.at, title: cleanTrackTitle(entry.title), artist: cleanArtist(entry.artist) });
    if (tracks.length === RECENT_TRACKS) break;
  }
  return tracks;
}

/** Les morceaux d'avant ne servent qu'entre deux émissions, quand le serveur envoie un morceau ou un jingle. */
export function needsRecentTracks(title: StreamTitleKind, grid: RadioGridRow[]): boolean {
  return title.kind === "track" || (title.kind === "jingle" && !grid.some((row) => row.kind === "live"));
}

export type RadioLiveInput = {
  station: RadioStationRow;
  grid: RadioGridRow[];
  /** Titre du serveur ; null : sans titre ; undefined : serveur muet. */
  streamTitle: string | null | undefined;
  /** « Titres diffusés » ; null : pas lus (inutiles, ou site muet). */
  pastTitles: PastTitleEntry[] | null;
  now: Date;
};

function asFamily(value: string): "musique" | "parole" {
  return value === "parole" ? "parole" : "musique";
}

export function buildRadioLive(input: RadioLiveInput): RadioLiveResponse {
  const { station, grid, now } = input;
  const live = grid.find((row) => row.kind === "live") ?? null;
  const next = grid.find((row) => row.kind === "next") ?? null;
  const title = classifyStreamTitle(input.streamTitle, grid, station.name);

  const playlist = title.kind === "track";
  const show = playlist ? null : live;
  const track = title.kind === "track" ? title.track : null;
  const recentTracks = needsRecentTracks(title, grid)
    ? recentTracksBefore(input.pastTitles, track, station.name, now)
    : [];

  return {
    station: {
      id: station.id,
      name: station.name,
      frequency: station.frequency,
      streamUrl: station.stream_url,
      streamUrlLight: station.stream_url_light,
    },
    show: show
      ? {
          id: show.show_id,
          name: show.name,
          style: show.style,
          family: asFamily(show.family),
          startsAt: formatParisLabelled(show.starts_at),
          endsAt: formatParisLabelled(show.ends_at),
        }
      : null,
    track,
    next: next
      ? {
          id: next.show_id,
          name: next.name,
          style: next.style,
          family: asFamily(next.family),
          startsAt: formatParisLabelled(next.starts_at),
        }
      : null,
    recentTracks,
    updatedAt: toParisLabelledUtc(now),
  };
}

// Lectures, gardées en mémoire de la fonction : le titre du serveur 10 s, « Titres diffusés » 60 s ---------

const STATUS_TTL_MS = 10_000;
const PAST_TITLES_TTL_MS = 60_000;
const STATUS_TIMEOUT_MS = 3_000;
const PAST_TITLES_TIMEOUT_MS = 4_000;

type CacheEntry<T> = { expires: number; value: Promise<T> };

export type RadioLiveCache = {
  status: Map<string, CacheEntry<string | null | undefined>>;
  pastTitles: Map<string, CacheEntry<PastTitleEntry[]>>;
};

export function createRadioLiveCache(): RadioLiveCache {
  return { status: new Map(), pastTitles: new Map() };
}

const sharedCache = createRadioLiveCache();

function cached<T>(map: Map<string, CacheEntry<T>>, key: string, ttlMs: number, nowMs: number, load: () => Promise<T>) {
  const hit = map.get(key);
  if (hit && hit.expires > nowMs) return hit.value;
  const value = load();
  map.set(key, { expires: nowMs + ttlMs, value });
  // Un échec n'est pas gardé : la lecture suivante réessaie.
  value.catch(() => {
    if (map.get(key)?.value === value) map.delete(key);
  });
  return value;
}

async function fetchStreamTitle(station: RadioStationRow, fetchImpl?: RadioFetch) {
  const response = await radioGet(station.status_url, { fetchImpl, timeoutMs: STATUS_TIMEOUT_MS, accept: "application/json" });
  const text = await readText(station.status_url, response);
  return pickIcecastTitle(parseLenientJson(text), station.stream_url);
}

async function fetchPastTitles(station: RadioStationRow, now: Date, fetchImpl?: RadioFetch) {
  const url = pastTitlesUrl(station.site_url);
  const response = await radioGet(url, { fetchImpl, timeoutMs: PAST_TITLES_TIMEOUT_MS, accept: "application/json" });
  return parsePastTitlesResponse(JSON.parse(await readText(url, response)), parisToday(now));
}

export type RadioLiveDeps = {
  /** Client anon : la RLS cache une station désactivée (404), comme pour l'app. */
  supabase: SupabaseClient<Database>;
  fetchImpl?: RadioFetch;
  now?: Date;
  cache?: RadioLiveCache;
};

/** « Ce qui passe » sur une station ; null si elle est inconnue ou désactivée. */
export async function getRadioLive(stationId: string, deps: RadioLiveDeps): Promise<RadioLiveResponse | null> {
  const now = deps.now ?? new Date();
  const cache = deps.cache ?? sharedCache;
  const [stationResult, gridResult] = await Promise.all([
    deps.supabase
      .from("radio_stations")
      .select("id, name, frequency, stream_url, stream_url_light, status_url, site_url")
      .eq("id", stationId)
      .maybeSingle(),
    deps.supabase.rpc("radio_live_grid", { p_station: stationId }),
  ]);
  if (stationResult.error) throw stationResult.error;
  const station = stationResult.data;
  if (!station) return null;
  if (gridResult.error) throw gridResult.error;
  const grid = (gridResult.data ?? []) as RadioGridRow[];

  const streamTitle = await cached(cache.status, station.status_url, STATUS_TTL_MS, now.getTime(), () =>
    fetchStreamTitle(station, deps.fetchImpl),
  ).catch((error: unknown) => {
    console.warn("Radio : serveur de diffusion muet", station.status_url, error instanceof Error ? error.message : error);
    return undefined;
  });

  const title = classifyStreamTitle(streamTitle, grid, station.name);
  const pastTitles = needsRecentTracks(title, grid)
    ? await cached(cache.pastTitles, station.site_url, PAST_TITLES_TTL_MS, now.getTime(), () =>
        fetchPastTitles(station, now, deps.fetchImpl),
      ).catch((error: unknown) => {
        console.warn("Radio : titres diffusés illisibles", station.site_url, error instanceof Error ? error.message : error);
        return null;
      })
    : null;

  return buildRadioLive({ station, grid, streamTitle, pastTitles, now });
}
