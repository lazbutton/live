/*
 * Radio : « ce qui passe » (lib/radio/live.ts) et sa route GET /api/v1/radio/{stationId}/live, contre la
 * grille telle que la rend radio_live_grid, les fixtures du 2026-10-23 (titre Icecast, « Titres
 * diffusés ») et un faux Supabase, sans réseau.
 *   node --test lib/radio/live.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const { createClient } = require("@supabase/supabase-js");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const live = await jiti.import(path.join(root, "lib/radio/live.ts"));
const site = await jiti.import(path.join(root, "lib/radio/rco-site.ts"));
const { radioLiveResponseSchema } = await jiti.import(path.join(root, "lib/api/v1/radio/schemas.ts"));
const route = await jiti.import(path.join(root, "app/api/v1/radio/[stationId]/live/route.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const fixture = (name) => fs.readFileSync(path.join(root, "lib/radio/fixtures", name), "utf8");
const PAST_TITLES = site.parsePastTitlesResponse(JSON.parse(fixture("rco-past-titles.json")), "2026-10-23");

/** Un instant donné à l'heure de Paris (heure d'été jusqu'au 25 octobre 2026). */
const paris = (wall) => new Date(`${wall}+02:00`);

const STATION_ID = "e2f7ade2-f5d2-4408-90b4-f8bfca383399";
const STATION = {
  id: STATION_ID,
  name: "Radio Campus Orléans",
  frequency: "88.3",
  stream_url: "https://streams.labomedia.org:8443/stream_rco",
  stream_url_light: null,
  status_url: "https://streams.labomedia.org:8443/status-json.xsl",
  site_url: "https://orleans.radiocampus.org/",
};

// Lignes telles que les rend radio_live_grid (PostgREST : timestamptz en « +00:00 »).
const show = (id, name, style, family, start, end) => ({
  show_id: `5a000000-0000-4000-8000-0000000000${id}`,
  name,
  style,
  family,
  starts_at: `${start}:00+00:00`,
  ends_at: `${end}:00+00:00`,
});
const KAWAI = show("02", "Kawaï Campus Club", "Mangas, animes et pop culture japonaise", "parole", "2026-10-23T19:00", "2026-10-23T20:00");
const BLOCKCHAIN = show("03", "Blockchain", "Hip-hop", "musique", "2026-10-23T20:00", "2026-10-23T21:00");
const MERIDIENNE = show("07", "La Méridienne", "Sciences", "parole", "2026-10-23T12:00", "2026-10-23T13:00");
const POESIE = show("12", "Pause Poésie", "Poésie", "parole", "2026-10-23T14:00", "2026-10-23T15:00");
const DOUBLE_SAUT = show("13", "Double Saut", "Jeux video", "parole", "2026-10-23T18:00", "2026-10-23T19:00");

const KAWAI_ON_AIR = [
  { kind: "live", ...KAWAI },
  { kind: "next", ...BLOCKCHAIN },
  { kind: "on_air", ...DOUBLE_SAUT },
  { kind: "on_air", ...KAWAI },
];
const BEFORE_NOON = [{ kind: "next", ...MERIDIENNE }];

const build = (input) => {
  const body = live.buildRadioLive({ station: STATION, pastTitles: null, ...input });
  radioLiveResponseSchema.parse(body);
  return body;
};

// Les règles ------------------------------------------------------------------------------------------

test("pendant une émission (l'exemple du contrat) : l'émission de la grille, sans morceau", () => {
  const body = build({ grid: KAWAI_ON_AIR, streamTitle: "KAWAÏ CAMPUS CLUB", now: paris("2026-10-23T19:12:04") });
  assert.deepEqual(body, {
    station: {
      id: STATION_ID,
      name: "Radio Campus Orléans",
      frequency: "88.3",
      streamUrl: "https://streams.labomedia.org:8443/stream_rco",
      streamUrlLight: null,
    },
    show: {
      id: KAWAI.show_id,
      name: "Kawaï Campus Club",
      style: "Mangas, animes et pop culture japonaise",
      family: "parole",
      startsAt: "2026-10-23T19:00:00+00:00",
      endsAt: "2026-10-23T20:00:00+00:00",
      imageUrl: null,
    },
    track: null,
    next: {
      id: BLOCKCHAIN.show_id,
      name: "Blockchain",
      style: "Hip-hop",
      family: "musique",
      startsAt: "2026-10-23T20:00:00+00:00",
      imageUrl: null,
    },
    recentTracks: [],
    updatedAt: "2026-10-23T19:12:04+00:00",
  });
});

test("le visuel gardé d'une émission passe tel quel ; sans visuel, null", () => {
  const image = "https://example.supabase.co/storage/v1/object/public/organizers-images/radio-shows/kawai.webp";
  const body = build({
    grid: [
      { kind: "live", ...KAWAI, image_url: image },
      { kind: "next", ...BLOCKCHAIN, image_url: null },
      { kind: "on_air", ...DOUBLE_SAUT },
      { kind: "on_air", ...KAWAI, image_url: image },
    ],
    streamTitle: "KAWAÏ CAMPUS CLUB",
    now: paris("2026-10-23T19:12:04"),
  });
  assert.equal(body.show.imageUrl, image);
  assert.equal(body.next.imageUrl, null);
});

test("entre deux émissions : le morceau, nettoyé, et les quatre d'avant (fixture « Titres diffusés »)", () => {
  // À 11:58:30, la page a déjà « Like Smoke » en tête (et, enregistrée à 12:08, La Méridienne à 12:00).
  const body = build({
    grid: BEFORE_NOON,
    streamTitle: "Genevieve Murphy - Like Smoke",
    pastTitles: PAST_TITLES,
    now: paris("2026-10-23T11:58:30"),
  });
  assert.equal(body.show, null);
  assert.deepEqual(body.track, { title: "Like Smoke", artist: "Genevieve Murphy" });
  assert.equal(body.next.name, "La Méridienne");
  assert.deepEqual(body.recentTracks, [
    { at: "2026-10-23T11:52:00+00:00", title: "Slow Disco (Nina Kraviz Gabber Me Gently Remix)", artist: "St. Vincent" },
    { at: "2026-10-23T11:48:00+00:00", title: "Ar", artist: "Pérola Branca" },
    { at: "2026-10-23T11:42:00+00:00", title: "Skaba", artist: "Elayn" },
    { at: "2026-10-23T11:37:00+00:00", title: "It Must Change", artist: "ANOHNI" },
  ]);
});

test("entre deux émissions : les heures postérieures et les jingles ne comptent pas", () => {
  const body = build({
    grid: BEFORE_NOON,
    streamTitle: "Akiko Yano - To Ki Me Ki",
    pastTitles: PAST_TITLES,
    now: paris("2026-10-23T11:30:00"),
  });
  assert.deepEqual(body.track, { title: "To Ki Me Ki", artist: "Akiko Yano" });
  assert.deepEqual(
    body.recentTracks.map((track) => `${track.at.slice(11, 16)} ${track.artist} – ${track.title}`),
    [
      "11:23 Nite Fleit – Little Robot",
      "11:18 Nite Fleit & Umwelt – The Hellgramite Method",
      "11:11 Helena Hauff – Turn Your Sights Inward",
      "11:08 La Yegros – Todo yo",
    ],
  );
});

test("un jingle entre deux émissions : pas de morceau, les quatre derniers morceaux", () => {
  const body = build({
    grid: BEFORE_NOON,
    streamTitle: "Tu ecoutes Radio Campus Orleans - Jingle",
    pastTitles: PAST_TITLES,
    now: paris("2026-10-23T11:33:30"),
  });
  assert.equal(body.show, null);
  assert.equal(body.track, null);
  assert.deepEqual(body.recentTracks.map((track) => track.title), [
    "To Ki Me Ki",
    "Little Robot",
    "The Hellgramite Method",
    "Turn Your Sights Inward",
  ]);
});

test("la grille annonce une émission mais le serveur envoie un morceau : c'est la playlist", () => {
  const body = build({
    grid: KAWAI_ON_AIR,
    streamTitle: "Akiko Yano - To Ki Me Ki",
    pastTitles: [
      { kind: "track", at: "2026-10-23T19:10:00+00:00", artist: "Akiko Yano", title: "To Ki Me Ki" },
      { kind: "track", at: "2026-10-23T19:06:00+00:00", artist: "Gordan", title: "Mara" },
      { kind: "track", at: "2026-10-23T19:05:00+00:00", artist: "Tu ecoutes Radio Campus Orleans", title: "Jingle" },
      { kind: "track", at: "2026-10-23T19:01:00+00:00", artist: "LPV", title: "72-Hour Sweat" },
      { kind: "show", at: "2026-10-23T18:00:00+00:00", name: "Double Saut" },
      { kind: "track", at: "2026-10-23T17:58:00+00:00", artist: "Avant", title: "L'émission" },
    ],
    now: paris("2026-10-23T19:12:04"),
  });
  assert.equal(body.show, null);
  assert.deepEqual(body.track, { title: "To Ki Me Ki", artist: "Akiko Yano" });
  assert.equal(body.next.name, "Blockchain");
  // Arrêtés au début de Double Saut : ce qui précède n'est plus « juste avant ».
  assert.deepEqual(body.recentTracks.map((track) => track.title), ["Mara", "72-Hour Sweat"]);
});

test("le serveur envoie le nom d'une émission prévue mais pas active : ni émission ni morceau", () => {
  const body = build({
    grid: [{ kind: "next", ...POESIE }, { kind: "on_air", ...MERIDIENNE }],
    streamTitle: "LA MERIDIENNE – RADIO CAMPUS TOURS",
    pastTitles: PAST_TITLES,
    now: paris("2026-10-23T12:05:00"),
  });
  assert.equal(body.show, null);
  assert.equal(body.track, null);
  assert.equal(body.next.name, "Pause Poésie");
  assert.deepEqual(body.recentTracks, []);
});

test("serveur muet : l'émission d'après la grille, pas de morceau", () => {
  for (const streamTitle of [undefined, null, "   "]) {
    const during = build({ grid: KAWAI_ON_AIR, streamTitle, pastTitles: PAST_TITLES, now: paris("2026-10-23T19:12:04") });
    assert.equal(during.show.name, "Kawaï Campus Club");
    assert.equal(during.track, null);
    assert.deepEqual(during.recentTracks, []);
    const between = build({ grid: BEFORE_NOON, streamTitle, pastTitles: PAST_TITLES, now: paris("2026-10-23T11:58:30") });
    assert.equal(between.show, null);
    assert.equal(between.track, null);
    assert.deepEqual(between.recentTracks, []);
  }
});

test("un jingle pendant une émission : l'émission reste", () => {
  const body = build({ grid: KAWAI_ON_AIR, streamTitle: "Tu ecoutes Radio Campus Orleans - Jingle", now: paris("2026-10-23T19:00:20") });
  assert.equal(body.show.name, "Kawaï Campus Club");
  assert.equal(body.track, null);
  assert.deepEqual(body.recentTracks, []);
});

test("morceaux d'avant : rien au-delà d'un début d'émission, ni de deux heures", () => {
  // À 13:05, la playlist reprend après La Méridienne (12:00) : rien « juste avant ».
  const afterShow = build({ grid: [], streamTitle: "Gina Été - The Last Air", pastTitles: PAST_TITLES, now: paris("2026-10-23T13:05:00") });
  assert.deepEqual(afterShow.track, { title: "The Last Air", artist: "Gina Été" });
  assert.deepEqual(afterShow.recentTracks, []);
  const stale = build({
    grid: [],
    streamTitle: "A - B",
    pastTitles: [
      { kind: "track", at: "2026-10-23T12:20:00+00:00", artist: "C", title: "D" },
      { kind: "track", at: "2026-10-23T10:20:00+00:00", artist: "E", title: "F" },
    ],
    now: paris("2026-10-23T12:30:00"),
  });
  assert.deepEqual(stale.recentTracks.map((track) => track.title), ["D"]);
  const nothing = build({ grid: [], streamTitle: "A - B", pastTitles: null, now: paris("2026-10-23T12:30:00") });
  assert.deepEqual(nothing.recentTracks, []);
});

test("sans émission en cours ni à venir : show et next à null", () => {
  const body = build({ grid: [], streamTitle: "Akiko Yano - To Ki Me Ki", now: paris("2026-10-23T11:30:00") });
  assert.equal(body.show, null);
  assert.equal(body.next, null);
  assert.equal(body.station.streamUrlLight, null);
});

// Les lectures : faux Supabase, faux serveur de la radio ------------------------------------------------

/** Faux Supabase : radio_stations (sous la RLS, comme pour anon) et rpc/radio_live_grid. */
function fakeSupabase({ stations = [STATION], grid = KAWAI_ON_AIR, failGrid = false } = {}) {
  const requests = [];
  async function handle(request) {
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}`);
    if (request.method === "GET" && url.pathname === "/rest/v1/radio_stations") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      return Response.json(stations.filter((station) => station.id === id));
    }
    if (request.method === "POST" && url.pathname === "/rest/v1/rpc/radio_live_grid") {
      if (failGrid) return Response.json({ code: "57014", message: "canceling statement due to statement timeout" }, { status: 500 });
      const body = JSON.parse(await request.text());
      return Response.json(body.p_station === stations[0]?.id ? grid : []);
    }
    throw new Error(`Requête Supabase inattendue : ${request.method} ${request.url}`);
  }
  return { requests, handle };
}

/** fetch du test : Supabase, le serveur Icecast et « Titres diffusés ». */
function fakeFetch({ supabase, status = () => Response.json(JSON.parse(fixture("icecast-status.json"))), pastTitles }) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === SUPABASE_URL) return supabase.handle(request);
    calls.push({ method: request.method, url: request.url, userAgent: request.headers.get("user-agent") });
    if (url.pathname.endsWith("/status-json.xsl")) return status(request);
    if (url.pathname.endsWith("/wp-admin/admin-ajax.php") && url.searchParams.get("action") === "rco-get-past-titles") {
      return pastTitles ? pastTitles(request) : new Response(fixture("rco-past-titles.json"), { headers: { "content-type": "application/json" } });
    }
    throw new Error(`Appel réseau inattendu : ${request.method} ${request.url}`);
  };
  return { calls, fetchImpl };
}

const client = (fetchImpl) =>
  createClient(SUPABASE_URL, "anon-key", { auth: { persistSession: false }, global: { fetch: fetchImpl } });

const icecastTitle = (title) => () =>
  Response.json({ icestats: { source: { listenurl: "http://streams.labomedia.org:8000/stream_rco_dab.mp3", title } } });

test("lecture : station inconnue ou désactivée (invisible sous la RLS) → null, sans appeler la radio", async () => {
  const supabase = fakeSupabase({ stations: [] });
  const { calls, fetchImpl } = fakeFetch({ supabase });
  const result = await live.getRadioLive(STATION_ID, { supabase: client(fetchImpl), fetchImpl, cache: live.createRadioLiveCache() });
  assert.equal(result, null);
  assert.deepEqual(calls, []);
});

test("lecture : titre Icecast et grille ; « Titres diffusés » lus seulement entre deux émissions", async () => {
  const supabase = fakeSupabase();
  const { calls, fetchImpl } = fakeFetch({ supabase, status: icecastTitle("KAWAÏ CAMPUS CLUB") });
  const cache = live.createRadioLiveCache();
  const body = await live.getRadioLive(STATION_ID, { supabase: client(fetchImpl), fetchImpl, cache, now: paris("2026-10-23T19:12:04") });
  assert.equal(body.show.name, "Kawaï Campus Club");
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/status-json.xsl"]);
  // Des GET, avec un User-Agent qui nomme OutLive.
  assert.ok(calls.every((call) => call.method === "GET" && call.userAgent.startsWith("OutLive/")));

  const between = fakeFetch({ supabase: fakeSupabase({ grid: BEFORE_NOON }), status: icecastTitle("Genevieve Murphy - Like Smoke") });
  const body2 = await live.getRadioLive(STATION_ID, {
    supabase: client(between.fetchImpl),
    fetchImpl: between.fetchImpl,
    cache: live.createRadioLiveCache(),
    now: paris("2026-10-23T11:58:30"),
  });
  assert.deepEqual(body2.track, { title: "Like Smoke", artist: "Genevieve Murphy" });
  assert.equal(body2.recentTracks.length, 4);
  assert.deepEqual(between.calls.map((call) => new URL(call.url).pathname), ["/status-json.xsl", "/wp-admin/admin-ajax.php"]);
});

test("lecture : le titre gardé 10 s, « Titres diffusés » 60 s ; un échec n'est pas gardé", async () => {
  const supabase = fakeSupabase({ grid: BEFORE_NOON });
  let failStatus = false;
  const { calls, fetchImpl } = fakeFetch({
    supabase,
    status: (request) => (failStatus ? new Response("indisponible", { status: 503 }) : icecastTitle("Akiko Yano - To Ki Me Ki")(request)),
  });
  const cache = live.createRadioLiveCache();
  const read = (wall) => live.getRadioLive(STATION_ID, { supabase: client(fetchImpl), fetchImpl, cache, now: paris(wall) });
  const count = (suffix) => calls.filter((call) => new URL(call.url).pathname.endsWith(suffix)).length;

  await read("2026-10-23T11:30:00");
  await read("2026-10-23T11:30:09");
  assert.deepEqual([count("status-json.xsl"), count("admin-ajax.php")], [1, 1]);
  await read("2026-10-23T11:30:11");
  assert.deepEqual([count("status-json.xsl"), count("admin-ajax.php")], [2, 1]);
  await read("2026-10-23T11:31:01");
  assert.deepEqual([count("status-json.xsl"), count("admin-ajax.php")], [3, 2]);

  // Serveur muet : 200 d'après la grille, et la lecture suivante réessaie.
  failStatus = true;
  const silent = await read("2026-10-23T11:31:20");
  assert.equal(silent.track, null);
  assert.equal(silent.next.name, "La Méridienne");
  await read("2026-10-23T11:31:21");
  assert.equal(count("status-json.xsl"), 5);
});

test("lecture : « Titres diffusés » illisibles → le morceau sans ceux d'avant", async () => {
  const supabase = fakeSupabase({ grid: BEFORE_NOON });
  const { fetchImpl } = fakeFetch({
    supabase,
    status: icecastTitle("Akiko Yano - To Ki Me Ki"),
    pastTitles: () => new Response("<html>Erreur</html>", { status: 200 }),
  });
  const body = await live.getRadioLive(STATION_ID, {
    supabase: client(fetchImpl),
    fetchImpl,
    cache: live.createRadioLiveCache(),
    now: paris("2026-10-23T11:30:00"),
  });
  assert.deepEqual(body.track, { title: "To Ki Me Ki", artist: "Akiko Yano" });
  assert.deepEqual(body.recentTracks, []);
});

// La route --------------------------------------------------------------------------------------------

let stationCount = 0;
/** Une station par test de route : la mémoire de la fonction ne passe pas d'un test à l'autre. */
function routeStation() {
  stationCount += 1;
  return { ...STATION, status_url: `https://flux${stationCount}.test/status-json.xsl`, site_url: `https://radio${stationCount}.test/` };
}

const get = (stationId) =>
  route.GET(new Request(`http://localhost/api/v1/radio/${stationId}/live`), { params: Promise.resolve({ stationId }) });

test("route : 200, en cache 10 s, CORS, forme du contrat", async () => {
  const station = routeStation();
  const supabase = fakeSupabase({ stations: [station] });
  globalThis.fetch = fakeFetch({ supabase, status: icecastTitle("KAWAÏ CAMPUS CLUB") }).fetchImpl;
  const response = await get(STATION_ID);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=10, s-maxage=10, stale-while-revalidate=10");
  assert.equal(response.headers.get("cdn-cache-control"), "public, max-age=10, s-maxage=10, stale-while-revalidate=10");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const body = radioLiveResponseSchema.parse(await response.json());
  assert.equal(body.station.id, STATION_ID);
  assert.equal(body.show.name, "Kawaï Campus Club");
  assert.equal(body.next.name, "Blockchain");
});

test("route : station désactivée ou inconnue, id illisible → 404", async () => {
  const supabase = fakeSupabase({ stations: [] });
  globalThis.fetch = fakeFetch({ supabase }).fetchImpl;
  const unknown = await get(STATION_ID);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await unknown.json(), { error: { code: "not_found", message: "Station introuvable" } });

  const before = supabase.requests.length;
  const invalid = await get("radio-campus");
  assert.equal(invalid.status, 404);
  assert.equal(supabase.requests.length, before);
});

test("route : la radio ne répond pas → 200 avec la grille ; la base en erreur → 500", async () => {
  const station = routeStation();
  globalThis.fetch = fakeFetch({
    supabase: fakeSupabase({ stations: [station] }),
    status: () => {
      throw new TypeError("fetch failed");
    },
  }).fetchImpl;
  const silent = await get(STATION_ID);
  assert.equal(silent.status, 200);
  const body = await silent.json();
  assert.equal(body.show.name, "Kawaï Campus Club");
  assert.equal(body.track, null);

  globalThis.fetch = fakeFetch({ supabase: fakeSupabase({ stations: [routeStation()], failGrid: true }) }).fetchImpl;
  const failed = await get(STATION_ID);
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).error.code, "internal_error");
});

test("route : OPTIONS (CORS) → 204", async () => {
  const response = route.OPTIONS();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS");
});
