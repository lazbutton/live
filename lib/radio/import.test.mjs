/*
 * Radio : l'import horaire (lib/radio/import.ts) et son cron, contre un faux site de Radio Campus
 * Orléans (fixtures du 2026-10-23 pour Nation Groove, pages et flux fabriqués sur le même modèle pour
 * les autres) et un faux Supabase en mémoire, sans réseau.
 *   node --test lib/radio/import.test.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const { createClient } = require("@supabase/supabase-js");
const { NextRequest } = require("next/server");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const radioImport = await jiti.import(path.join(root, "lib/radio/import.ts"));
const cron = await jiti.import(path.join(root, "app/api/cron/radio-import/route.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  delete process.env.CRON_SECRET;
});

const fixture = (name) => fs.readFileSync(path.join(root, "lib/radio/fixtures", name), "utf8");
const SITE = "https://orleans.radiocampus.org/";
const STATION_ID = "e2f7ade2-f5d2-4408-90b4-f8bfca383399";
const NOW = new Date("2026-10-23T10:07:00Z");
const later = (minutes) => new Date(NOW.getTime() + minutes * 60_000);

// Faux Supabase : des tables en mémoire, ce que l'import demande à PostgREST -----------------------------

const TABLES = {
  radio_stations: { unique: [["id"]], defaults: () => ({ enabled: false }) },
  radio_shows: {
    unique: [["id"], ["station_id", "source_id"], ["station_id", "slug"]],
    defaults: () => ({ family: "musique", organizer_id: null, last_episode_at: null, style: null, description: null, feed_url: null, slots: [] }),
  },
  radio_show_sync: {
    unique: [["show_id"]],
    defaults: () => ({ source_modified_at: null, page_checked_at: null, feed_checked_at: null, feed_etag: null, feed_last_modified: null }),
  },
  radio_episodes: { unique: [["id"], ["guid"]], defaults: () => ({ duration_s: null, page_url: null }) },
};

function fakeSupabase(initial = {}) {
  const db = Object.fromEntries(Object.keys(TABLES).map((name) => [name, structuredClone(initial[name] ?? [])]));
  const writes = [];

  const parseIn = (value) =>
    value
      .slice(4, -1)
      .match(/"(?:[^"\\]|\\.)*"|[^,]+/g)
      .map((item) => (item.startsWith('"') ? JSON.parse(item) : item));
  const matches = (params) => (row) =>
    [...params].every(([column, filter]) => {
      if (["select", "order", "on_conflict", "columns", "limit"].includes(column)) return true;
      if (filter.startsWith("eq.")) return String(row[column]) === filter.slice(3);
      if (filter.startsWith("in.(")) return parseIn(filter).includes(String(row[column]));
      throw new Error(`Filtre non géré : ${column}=${filter}`);
    });
  const project = (row, select) =>
    !select || select === "*" ? { ...row } : Object.fromEntries(select.split(",").map((c) => [c.trim(), row[c.trim()]]));
  const conflict = (table, row, keys) =>
    db[table].find((existing) => keys.every((key) => existing[key] !== undefined && String(existing[key]) === String(row[key])));
  const reply = (request, rows, status = 200) => {
    const single = (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const prefer = request.headers.get("prefer") ?? "";
    if (request.method !== "GET" && !prefer.includes("return=representation")) return new Response(null, { status: 201 });
    return Response.json(single ? rows[0] : rows, { status });
  };

  async function handle(request) {
    const url = new URL(request.url);
    const table = url.pathname.replace("/rest/v1/", "");
    if (!TABLES[table]) throw new Error(`Table inattendue : ${table}`);
    const params = url.searchParams;
    const select = params.get("select");

    if (request.method === "GET") {
      let rows = db[table].filter(matches(params)).map((row) => project(row, select));
      const order = params.get("order");
      if (order) {
        const [column] = order.split(".");
        rows = rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])));
      }
      return Response.json(rows);
    }

    if (request.method === "POST") {
      const body = JSON.parse(await request.text());
      const values = Array.isArray(body) ? body : [body];
      const upsertOn = (request.headers.get("prefer") ?? "").includes("merge-duplicates") ? params.get("on_conflict")?.split(",") : null;
      const pending = [];
      for (const value of values) {
        const existing = upsertOn ? conflict(table, value, upsertOn) : null;
        if (existing) {
          pending.push({ existing, value });
          continue;
        }
        const row = { id: randomUUID(), ...TABLES[table].defaults(), ...value };
        const clash = TABLES[table].unique.find((keys) => conflict(table, row, keys) || pending.some((p) => !p.existing && keys.every((k) => String(p.row[k]) === String(row[k]))));
        if (clash) {
          return Response.json({ code: "23505", message: `duplicate key value violates unique constraint (${clash.join(", ")})` }, { status: 409 });
        }
        pending.push({ row });
      }
      const result = [];
      for (const item of pending) {
        if (item.existing) Object.assign(item.existing, item.value);
        else db[table].push(item.row);
        result.push(project(item.existing ?? item.row, select));
      }
      writes.push(`${upsertOn ? "UPSERT" : "INSERT"} ${table} ${values.length}`);
      return reply(request, result, 201);
    }

    if (request.method === "PATCH") {
      const changes = JSON.parse(await request.text());
      const rows = db[table].filter(matches(params));
      for (const row of rows) Object.assign(row, changes);
      writes.push(`UPDATE ${table} ${Object.keys(changes).sort().join(",")}`);
      return reply(request, rows.map((row) => project(row, select)));
    }

    if (request.method === "DELETE") {
      const rows = db[table].filter(matches(params));
      db[table] = db[table].filter((row) => !rows.includes(row));
      writes.push(`DELETE ${table} ${rows.length}`);
      return reply(request, rows);
    }
    throw new Error(`Méthode non gérée : ${request.method}`);
  }

  return { db, writes, handle };
}

// Faux site de la radio -------------------------------------------------------------------------------

const WP_SHOWS = JSON.parse(fixture("rco-wp-shows.json"));

/** Une page d'émission sur le modèle de celle de Nation Groove. */
function showPage({ style, slots, feed = true, slug }) {
  return `<!doctype html><html><body><main><article class="rco-show">
    <header class="rco-show-header"><h1 class="rco-show-title"><span>${slug}</span></h1>
    <p class="rco-show-style"><span>${style}</span></p></header>
    <div class="rco-show-content-wrapper"><div class="rco-show-infos">
    <div class="rco-show-infos-dates-time rco-show-infos-bloc"><ul>
    ${slots.map((slot) => `<li><span>${slot.split(" ")[0]}</span> ${slot.split(" ").slice(1).join(" ").replace("•", "&#8226;")}</li>`).join("")}
    </ul></div>
    ${feed ? `<div class="rco-show-infos-feeds"><ul><li class="rco-show-infos-feed-podcasts"><a href="${SITE}podcasts/${slug}/itunes/feed/">Podcasts</a></li></ul></div>` : ""}
    </div><div class="rco-show-content rco-content"><div class="rco-content-inner"><p>Présentation de ${slug}.</p>
    <div class="rco-share"><p>Partager sur</p></div></div></div></div></article></main></body></html>`;
}

/** Un flux RSS d'émission sur le modèle de celui de Nation Groove. */
function feed(items) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Flux</title>
    ${items
      .map(
        (item) => `<item><title>${item.title}</title><link>${SITE}podcast/${item.slug}/</link>
        <guid isPermaLink="false">${SITE}podcast/${item.slug}/</guid>
        <enclosure url="${SITE}wp-content/uploads/${item.slug}.mp3" length="1" type="audio/mpeg"/>
        <pubDate>${item.pubDate}</pubDate><itunes:duration>${item.duration ?? "59:47"}</itunes:duration></item>`,
      )
      .join("")}</channel></rss>`;
}

function fakeSite() {
  const state = {
    modified: {
      "nation-groove": "2026-09-01T08:00:00",
      "la-mag-culturel": "2026-09-01T08:00:00",
      "kawai-campus-club": "2026-09-02T08:00:00",
      dominicalite: "2026-09-03T08:00:00",
    },
    pages: {
      "nation-groove": () => new Response(fixture("rco-show-nation-groove.html")),
      "la-mag-culturel": () => new Response(showPage({ slug: "la-mag-culturel", style: "danse, théâtre, cinéma, musique", slots: ["Jeudi 17h00 • 18h00"] })),
      "kawai-campus-club": () => new Response(showPage({ slug: "kawai-campus-club", style: "Mangas, animes et pop culture japonaise", slots: ["Vendredi 19h00 • 20h00"] })),
      dominicalite: () => new Response(showPage({ slug: "dominicalite", style: "Groove", slots: ["Dimanche 20h00 • 21h00"], feed: false })),
    },
    feeds: {
      "nation-groove": { etag: '"ng-1"', body: () => fixture("rco-feed-nation-groove.xml") },
      "la-mag-culturel": {
        etag: '"mag-1"',
        body: () =>
          feed([
            { slug: "la-mag-culturel-30", title: "Le Mag Culturel du 22/10/2026", pubDate: "Thu, 22 Oct 2026 15:00:00 +0000" },
            { slug: "la-mag-culturel-29", title: "Le Mag Culturel du 15/10/2026", pubDate: "Thu, 15 Oct 2026 15:00:00 +0000" },
          ]),
      },
      "kawai-campus-club": {
        etag: '"kawai-1"',
        body: () => feed([{ slug: "kawai-campus-club-12", title: "Kawaï Campus Club du 16/10/2026", pubDate: "Fri, 16 Oct 2026 17:00:00 +0000" }]),
      },
      dominicalite: {
        etag: null,
        body: () => feed([{ slug: "dominicalite-5", title: "L'Enfer du Dimanche du 18/10/2026", pubDate: "Sun, 18 Oct 2026 18:00:00 +0000" }]),
      },
    },
    api: null,
  };
  const calls = [];
  const handle = (request) => {
    const url = new URL(request.url);
    calls.push({
      method: request.method,
      path: url.pathname,
      userAgent: request.headers.get("user-agent"),
      ifNoneMatch: request.headers.get("if-none-match"),
    });
    if (url.pathname === "/wp-json/wp/v2/show") {
      if (state.api) return state.api(request);
      const body = WP_SHOWS.map((show) => ({ ...show, modified_gmt: state.modified[show.slug] }));
      return Response.json(body, { headers: { "x-wp-total": String(body.length), "x-wp-totalpages": "1" } });
    }
    const page = /^\/emission\/([^/]+)\/$/.exec(url.pathname);
    if (page) return state.pages[page[1]]?.() ?? new Response("introuvable", { status: 404 });
    const rss = /^\/podcasts\/([^/]+)\/itunes\/feed\/$/.exec(url.pathname);
    if (rss && state.feeds[rss[1]]) {
      const current = state.feeds[rss[1]];
      if (current.etag && request.headers.get("if-none-match") === current.etag) return new Response(null, { status: 304 });
      return new Response(current.body(), { headers: current.etag ? { etag: current.etag, "content-type": "application/rss+xml" } : {} });
    }
    return new Response("introuvable", { status: 404 });
  };
  return { state, calls, handle };
}

function setup() {
  const supabase = fakeSupabase({
    radio_stations: [{ id: STATION_ID, name: "Radio Campus Orléans", site_url: SITE, enabled: false }],
  });
  const radio = fakeSite();
  const fetchImpl = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).origin === SUPABASE_URL) return supabase.handle(request);
    if (new URL(request.url).hostname === "orleans.radiocampus.org") return radio.handle(request);
    throw new Error(`Appel réseau inattendu : ${request.method} ${request.url}`);
  };
  const client = createClient(SUPABASE_URL, "service-key", { auth: { persistSession: false }, global: { fetch: fetchImpl } });
  const run = (now = NOW) => radioImport.importRadioStations(client, { fetchImpl, now, deadline: Date.now() + 60_000 });
  return { supabase, radio, fetchImpl, run };
}

const bySlug = (supabase) => Object.fromEntries(supabase.db.radio_shows.map((show) => [show.slug, show]));
const episodesOf = (supabase, slug) => {
  const id = bySlug(supabase)[slug].id;
  return supabase.db.radio_episodes.filter((episode) => episode.show_id === id).sort((a, b) => b.aired_at.localeCompare(a.aired_at));
};

// Les passages ----------------------------------------------------------------------------------------

test("premier passage : émissions créées avec leur famille par défaut, créneaux, styles, épisodes", async () => {
  const { supabase, radio, run } = setup();
  const report = await run();
  const [station] = report.stations;
  assert.equal(station.station, "Radio Campus Orléans");
  assert.deepEqual(
    {
      apiShows: station.apiShows,
      showsCreated: station.showsCreated,
      pagesRead: station.pagesRead,
      feedsRead: station.feedsRead,
      episodesCreated: station.episodesCreated,
      errors: station.errors,
      stoppedEarly: station.stoppedEarly,
    },
    { apiShows: 4, showsCreated: 4, pagesRead: 4, feedsRead: 4, episodesCreated: 34, errors: [], stoppedEarly: false },
  );

  const shows = bySlug(supabase);
  assert.deepEqual(
    Object.values(shows)
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map((show) => [show.slug, show.name, show.family, show.style, JSON.stringify(show.slots)]),
    [
      ["dominicalite", "L’Enfer du Dimanche", "musique", "Groove", '[{"weekday":7,"start":"20:00","end":"21:00"}]'],
      ["kawai-campus-club", "Kawaï Campus Club", "parole", "Mangas, animes et pop culture japonaise", '[{"weekday":5,"start":"19:00","end":"20:00"}]'],
      ["la-mag-culturel", "Le Mag Culturel", "parole", "Danse, théâtre, cinéma, musique", '[{"weekday":4,"start":"17:00","end":"18:00"}]'],
      ["nation-groove", "Nation Groove", "musique", "Drum'n bass, jungle, dubstep, electro", '[{"weekday":4,"start":"22:00","end":"24:00"}]'],
    ],
  );
  assert.equal(shows["nation-groove"].source_id, 36);
  assert.equal(shows["nation-groove"].station_id, STATION_ID);
  assert.equal(shows["nation-groove"].page_url, "https://orleans.radiocampus.org/emission/nation-groove/");
  assert.equal(shows["nation-groove"].feed_url, "https://orleans.radiocampus.org/podcasts/nation-groove/itunes/feed/");
  assert.match(shows["nation-groove"].description, /^À propos de l’émission\n\nReady Massive/);
  assert.equal(shows["la-mag-culturel"].description, "Présentation de la-mag-culturel.");
  // Sans lien sur sa page : le flux à l'adresse habituelle.
  assert.equal(shows.dominicalite.feed_url, "https://orleans.radiocampus.org/podcasts/dominicalite/itunes/feed/");

  const groove = episodesOf(supabase, "nation-groove");
  assert.equal(groove.length, 30);
  assert.deepEqual(
    (({ guid, title, aired_at, duration_s, audio_url, page_url }) => ({ guid, title, aired_at, duration_s, audio_url, page_url }))(groove[0]),
    {
      guid: "https://orleans.radiocampus.org/podcast/nation-groove-12/",
      title: "Nation Groove du 22/10/2026",
      aired_at: "2026-10-22T22:00:01+00:00",
      duration_s: 7187,
      audio_url: "https://orleans.radiocampus.org/wp-content/uploads/2026/10/podcast_36_261022_220001.mp3",
      page_url: "https://orleans.radiocampus.org/podcast/nation-groove-12/",
    },
  );
  assert.equal(episodesOf(supabase, "la-mag-culturel")[0].aired_at, "2026-10-22T17:00:00+00:00");

  // Suivi : la page lue, l'ETag du flux gardé pour la lecture suivante.
  const sync = supabase.db.radio_show_sync.find((row) => row.show_id === shows["nation-groove"].id);
  assert.equal(sync.feed_etag, '"ng-1"');
  assert.equal(sync.page_checked_at, NOW.toISOString());
  assert.equal(sync.source_modified_at, "2026-09-01T08:00:00.000Z");

  // Chez la radio : des GET seulement, avec un User-Agent qui nomme OutLive ; chaque page une fois.
  assert.ok(radio.calls.every((call) => call.method === "GET"));
  assert.ok(radio.calls.every((call) => call.userAgent === "OutLive/1.0 (+https://www.outlive.fr; agenda culturel d'Orleans, lecture seule)"));
  assert.equal(radio.calls.length, 1 + 4 + 4);
});

test("passage suivant, une heure après, rien de changé : pages pas relues, flux en 304, aucune écriture", async () => {
  const { supabase, radio, run } = setup();
  await run();
  supabase.writes.length = 0;
  radio.calls.length = 0;

  const report = await run(later(60));
  const [station] = report.stations;
  assert.deepEqual(
    [station.pagesRead, station.showsUpdated, station.feedsRead, station.feedsUnchanged, station.episodesCreated, station.episodesRemoved],
    [0, 0, 1, 3, 0, 0],
  );
  // dominicalite n'envoie pas d'ETag : relu, mais rien ne change.
  assert.deepEqual(supabase.writes.filter((write) => !write.includes("radio_show_sync")), []);
  assert.deepEqual(
    radio.calls.filter((call) => call.ifNoneMatch).map((call) => call.ifNoneMatch).sort(),
    ['"kawai-1"', '"mag-1"', '"ng-1"'],
  );
  assert.deepEqual(radio.calls.filter((call) => call.path.startsWith("/emission/")), []);
});

test("rejoué dans la même heure : les flux ne sont pas relus (50 minutes au moins entre deux lectures)", async () => {
  const { radio, run } = setup();
  await run();
  radio.calls.length = 0;
  const [station] = (await run(later(10))).stations;
  assert.equal(station.feedsSkipped, 4);
  assert.deepEqual(radio.calls.map((call) => call.path), ["/wp-json/wp/v2/show"]);
});

test("une émission modifiée sur le site : sa page relue ; famille et collectif choisis dans le back-office gardés", async () => {
  const { supabase, radio, run } = setup();
  await run();
  const groove = bySlug(supabase)["nation-groove"];
  groove.family = "parole";
  groove.organizer_id = "0a000000-0000-4000-8000-000000000001";
  radio.state.modified["nation-groove"] = "2026-10-23T09:00:00";
  radio.state.pages["nation-groove"] = () =>
    new Response(fixture("rco-show-nation-groove.html").replace("Drum'n bass, jungle, dubstep, electro", "Jungle, dubstep").replace("22h00", "21h00"));
  supabase.writes.length = 0;

  const [station] = (await run(later(60))).stations;
  assert.deepEqual([station.pagesRead, station.showsUpdated], [1, 1]);
  const after = bySlug(supabase)["nation-groove"];
  assert.equal(after.style, "Jungle, dubstep");
  assert.deepEqual(after.slots, [{ weekday: 4, start: "21:00", end: "24:00" }]);
  assert.equal(after.family, "parole");
  assert.equal(after.organizer_id, "0a000000-0000-4000-8000-000000000001");
  assert.deepEqual(supabase.writes.filter((write) => write.startsWith("UPDATE radio_shows")), ["UPDATE radio_shows slots,style"]);
});

test("un flux qui change : épisode nouveau ajouté, épisode sorti du flux retiré", async () => {
  const { supabase, radio, run } = setup();
  await run();
  radio.state.feeds["la-mag-culturel"] = {
    etag: '"mag-2"',
    body: () =>
      feed([
        { slug: "la-mag-culturel-31", title: "Le Mag Culturel du 29/10/2026", pubDate: "Thu, 29 Oct 2026 16:00:00 +0000", duration: "1:00:00" },
        { slug: "la-mag-culturel-30", title: "Le Mag Culturel du 22/10/2026", pubDate: "Thu, 22 Oct 2026 15:00:00 +0000" },
      ]),
  };
  const [station] = (await run(later(60))).stations;
  assert.deepEqual([station.episodesCreated, station.episodesUpdated, station.episodesRemoved], [1, 0, 1]);
  // Le 29 octobre, à l'heure d'hiver : 16:00 UTC = 17:00 à Paris.
  assert.deepEqual(
    episodesOf(supabase, "la-mag-culturel").map((episode) => [episode.title, episode.aired_at, episode.duration_s]),
    [
      ["Le Mag Culturel du 29/10/2026", "2026-10-29T17:00:00+00:00", 3600],
      ["Le Mag Culturel du 22/10/2026", "2026-10-22T17:00:00+00:00", 3587],
    ],
  );
});

test("un flux vide ou illisible, une page qui n'est pas une page d'émission : rien n'est retiré ni changé", async () => {
  const { supabase, radio, run } = setup();
  await run();
  radio.state.feeds["kawai-campus-club"] = { etag: '"kawai-2"', body: () => feed([]) };
  radio.state.feeds["la-mag-culturel"] = { etag: '"mag-2"', body: () => "<html><body>Maintenance</body></html>" };
  radio.state.modified.dominicalite = "2026-10-23T09:00:00";
  radio.state.pages.dominicalite = () => new Response("<html><body><p>Maintenance</p></body></html>");

  const [station] = (await run(later(60))).stations;
  assert.equal(episodesOf(supabase, "kawai-campus-club").length, 1);
  assert.equal(episodesOf(supabase, "la-mag-culturel").length, 2);
  assert.equal(bySlug(supabase).dominicalite.style, "Groove");
  assert.deepEqual([station.pagesFailed, station.feedsFailed, station.episodesRemoved], [1, 1, 0]);
  assert.deepEqual(station.errors.sort(), [
    "Flux la-mag-culturel : Flux RSS illisible : pas de <channel>.",
    "Page dominicalite : pas une page d'émission",
  ]);
});

test("une page en erreur : l'émission attend le passage suivant ; une API muette ne change rien", async () => {
  const { supabase, radio, run } = setup();
  radio.state.pages["kawai-campus-club"] = () => new Response("erreur", { status: 500 });
  const [first] = (await run()).stations;
  assert.deepEqual([first.showsCreated, first.pagesFailed], [3, 1]);
  assert.match(first.errors.join("\n"), /Page kawai-campus-club : .*HTTP 500/);
  assert.equal(bySlug(supabase)["kawai-campus-club"], undefined);

  radio.state.pages["kawai-campus-club"] = () =>
    new Response(showPage({ slug: "kawai-campus-club", style: "Mangas", slots: ["Vendredi 19h00 • 20h00"] }));
  const [second] = (await run(later(60))).stations;
  assert.equal(second.showsCreated, 1);
  assert.equal(bySlug(supabase)["kawai-campus-club"].family, "parole");

  radio.state.api = () => new Response("indisponible", { status: 503 });
  const [third] = (await run(later(120))).stations;
  assert.equal(third.apiShows, null);
  assert.match(third.errors[0], /^API des émissions : .*HTTP 503/);
  // Les flux des émissions connues sont lus quand même.
  assert.equal(third.feedsUnchanged + third.feedsRead, 4);
  assert.equal(supabase.db.radio_shows.length, 4);
});

test("un slug déjà pris : seule l'émission en cause n'est pas créée", async () => {
  const { supabase, radio, run } = setup();
  supabase.db.radio_shows.push({
    id: "0b000000-0000-4000-8000-000000000001",
    station_id: STATION_ID,
    source_id: 1,
    slug: "la-mag-culturel",
    name: "Ancienne fiche",
    page_url: "https://orleans.radiocampus.org/emission/ancienne/",
    family: "parole",
    slots: [],
  });
  radio.state.api = () => Response.json(WP_SHOWS.map((show) => ({ ...show, modified_gmt: radio.state.modified[show.slug] })));
  const [station] = (await run()).stations;
  assert.equal(station.showsCreated, 3);
  assert.match(station.errors.join("\n"), /Création de la-mag-culturel : duplicate key/);
  assert.equal(supabase.db.radio_shows.length, 4);
});

test("cron : secret exigé, puis l'import avec la clé service role", async () => {
  const { supabase, fetchImpl } = setup();
  globalThis.fetch = fetchImpl;
  const call = (authorization) =>
    cron.GET(new NextRequest("http://localhost/api/cron/radio-import", authorization ? { headers: { authorization } } : {}));

  assert.equal((await call()).status, 401);
  process.env.CRON_SECRET = "s3cret";
  assert.equal((await call("Bearer autre")).status, 401);
  assert.equal(supabase.db.radio_shows.length, 0);

  const response = await call("Bearer s3cret");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.stations[0].showsCreated, 4);
  assert.equal(supabase.db.radio_shows.length, 4);
});
