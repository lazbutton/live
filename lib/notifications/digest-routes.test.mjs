/*
 * Les crons des résumés (daily-events, weekly-summary) et des suivis (follows-digest) exécutés pour de
 * vrai contre un faux PostgREST en mémoire, branché sur `globalThis.fetch` : qui reçoit quoi, avec
 * quelles données. L'envoi (APNs, FCM) est remplacé par un espion : rien ne sort.
 *   node --test lib/notifications/digest-routes.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, afterEach, beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.CRON_SECRET = "secret-de-test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const daily = await jiti.import(path.join(root, "app/api/cron/notifications/daily-events/route.ts"));
const weekly = await jiti.import(path.join(root, "app/api/cron/notifications/weekly-summary/route.ts"));
const follows = await jiti.import(path.join(root, "app/api/cron/notifications/follows-digest/route.ts"));
const notifications = await jiti.import(path.join(root, "lib/notifications/index.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

// --- Faux PostgREST -------------------------------------------------------------------------------

function json(body, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** `colonne=opérateur.valeur` : eq, in, is (null), comme PostgREST. */
function matchesFilter(row, column, filter) {
  const dot = filter.indexOf(".");
  const operator = filter.slice(0, dot);
  const value = filter.slice(dot + 1);
  const actual = row[column];
  if (operator === "is") return value === "null" ? actual == null : String(actual) === value;
  if (actual == null) return false;
  if (operator === "eq") return String(actual) === value;
  if (operator === "in") return value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, "")).includes(String(actual));
  throw new Error(`Filtre non géré : ${column}=${filter}`);
}

function matches(row, params) {
  for (const [key, filter] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    if (key === "or") {
      const conditions = filter.replace(/^\(|\)$/g, "").split(",");
      const any = conditions.some((condition) => {
        const dot = condition.indexOf(".");
        return matchesFilter(row, condition.slice(0, dot), condition.slice(dot + 1));
      });
      if (!any) return false;
    } else if (!matchesFilter(row, key, filter)) {
      return false;
    }
  }
  return true;
}

/**
 * `app_events_in_range` simplifiée : commence dans la plage, ou dure 13 h ou plus et a commencé avant
 * sans être fini (migration 20261019210000). Les dates sont l'heure de Paris étiquetée UTC.
 */
function inRange(event, start, end) {
  const date = Date.parse(event.date);
  const s = Date.parse(`${start}Z`);
  const e = Date.parse(`${end}Z`);
  if (date >= s && date < e) return true;
  const endDate = event.end_date ? Date.parse(event.end_date) : null;
  return date < s && endDate !== null && endDate > s && endDate - date >= 13 * 3600 * 1000;
}

function createFakePostgrest(tables) {
  const db = structuredClone(tables);
  let counter = 0;
  const rpcRanges = [];
  const rpcFollows = [];

  async function fakeFetch(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== SUPABASE_URL || !url.pathname.startsWith("/rest/v1/")) {
      throw new Error(`Appel réseau inattendu : ${request.method} ${request.url}`);
    }
    const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.text();
    const payload = text ? JSON.parse(text) : undefined;
    const single = (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const columns = url.searchParams.get("select");
    const project = (row) =>
      !columns || columns === "*"
        ? { ...row }
        : Object.fromEntries(columns.split(",").map((column) => [column.trim(), row[column.trim()] ?? null]));
    const respond = (rows) => (single ? json(project(rows[0])) : json(rows.map(project)));

    const name = url.pathname.replace("/rest/v1/", "");
    // follows_digest() : les lignes que la fonction SQL rendrait (sa règle est testée en SQL,
    // supabase/tests/follows_digest.test.sql).
    if (name === "rpc/follows_digest") {
      rpcFollows.push(payload.at_time);
      return respond(db.follows_digest_rows);
    }
    if (name === "rpc/app_events_in_range") {
      rpcRanges.push([payload.range_start, payload.range_end]);
      const rows = db.events
        .filter((event) => inRange(event, payload.range_start, payload.range_end))
        .filter((event) => matches(event, url.searchParams))
        // La colonne calculée app_on_tout (règle de « Tout ») : pas retiré de l'accueil.
        .map((event) => ({ ...event, app_on_tout: !event.hide_from_home }))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      return respond(rows);
    }
    // app_digest_for_me() : ce que la règle de « Pour toi » rendrait (testée en SQL,
    // supabase/tests/pour_toi_digests.test.sql) : les paires (personne, événement) de la plage, et une ligne
    // sans événement pour qui a des goûts sans rien dedans.
    if (name === "rpc/app_digest_for_me") {
      const rows = db.for_me.recipients.flatMap((user) => {
        const mine = db.for_me.pairs
          .filter(([who, id]) => who === user && db.events.some(
            (event) => event.id === id && inRange(event, payload.range_start, payload.range_end),
          ))
          .map(([, id]) => ({ user_id: user, event_id: id }));
        return mine.length > 0 ? mine : [{ user_id: user, event_id: null }];
      });
      return respond(rows);
    }
    // app_event_series() : les séries à venir (règle testée en SQL, supabase/tests/app_event_series.test.sql).
    if (name === "rpc/app_event_series") {
      return respond(db.series);
    }

    const rows = (db[name] ??= []);
    switch (request.method) {
      case "GET":
        return respond(rows.filter((row) => matches(row, url.searchParams)));
      case "POST": {
        const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
          id: `${name}-${++counter}`,
          created_at: new Date().toISOString(),
          ...row,
        }));
        rows.push(...inserted);
        return respond(inserted);
      }
      case "DELETE":
        db[name] = rows.filter((row) => !matches(row, url.searchParams));
        return json(undefined, 204);
      default:
        return json({ message: `Méthode non gérée : ${request.method}` }, 405);
    }
  }

  return { db, rpcRanges, rpcFollows, fetch: fakeFetch };
}

// --- Données ----------------------------------------------------------------------------------------

const token = (letter) => letter.repeat(64);
const event = (id, title, date, category, extra = {}) => ({
  id,
  title,
  date: `${date}+00:00`,
  end_date: null,
  category,
  is_full: false,
  hide_from_home: false,
  ...extra,
});

const followRow = (user, eventId, title, date, type, targetId, name) => ({
  user_id: user,
  event_id: eventId,
  event_title: title,
  event_date: `${date}+00:00`,
  target_type: type,
  target_id: targetId,
  target_name: name,
});

const tables = {
  notification_settings: [{ id: "reglages", is_active: true }],
  categories: [
    { id: "c-concert", name: "Concert" },
    { id: "c-theatre", name: "Theatre" },
    { id: "c-expo", name: "Expo" },
    { id: "c-danse", name: "Danse" },
  ],
  events: [
    // Mercredi 21 octobre 2026.
    event("e1", "Concert de Luiza", "2026-10-21T20:30:00", "c-concert"),
    event("e2", "Jazz au 108", "2026-10-21T21:00:00", "Concert"), // catégorie par son nom
    event("e3", "Visite de l'expo", "2026-10-21T14:00:00", "c-expo"),
    event("e4", "Grande expo", "2026-09-01T10:00:00", "c-concert", { end_date: "2026-12-31T18:00:00+00:00" }),
    event("e5", "Complet", "2026-10-21T20:00:00", "c-concert", { is_full: true }),
    event("e6", "Retiré de l'accueil", "2026-10-21T19:00:00", "c-concert", { hide_from_home: true }),
    // Semaine du lundi 26 octobre.
    event("e8", "Concert du mardi", "2026-10-27T20:00:00", "c-concert"),
    event("e9", "Théâtre du vendredi", "2026-10-30T20:30:00", "c-theatre"),
    event("e10", "La semaine d'après", "2026-11-02T20:00:00", "c-concert"),
    // Trois dates d'un même spectacle : une série (app_event_series).
    event("e11", "Le Dîner de Condé", "2026-10-28T20:30:00", "c-theatre"),
    event("e12", "Le Dîner de Condé", "2026-10-29T20:30:00", "c-theatre"),
    event("e13", "Le Dîner de Condé", "2026-10-31T20:30:00", "c-theatre"),
  ],
  series: [
    { event_id: "e11", series_id: "e11" },
    { event_id: "e12", series_id: "e11" },
    { event_id: "e13", series_id: "e11" },
  ],
  // « Pour toi » : qui a des goûts, et ce que app_digest_for_me retient pour lui (« pourtoi » : le concert et le
  // retiré de l'accueil, que sa page montre ; « pourtoi-rien » : rien ; « monique » : le Dîner de Condé).
  for_me: {
    recipients: ["pourtoi", "pourtoi-rien", "monique"],
    pairs: [
      ["pourtoi", "e1"],
      ["pourtoi", "e6"],
      ["monique", "e11"],
      ["monique", "e12"],
      ["monique", "e13"],
    ],
  },
  user_notification_preferences: [
    { user_id: "concert", is_enabled: true, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "expo", is_enabled: true, frequency: "daily", category_ids: ["c-expo"] },
    { user_id: "danse", is_enabled: true, frequency: "daily", category_ids: ["c-danse"] },
    { user_id: "sans-jeton", is_enabled: true, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "coupe", is_enabled: false, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "hebdo", is_enabled: true, frequency: "weekly", category_ids: ["c-concert", "c-theatre"] },
    { user_id: "suivis-coupes", is_enabled: true, frequency: "never", category_ids: [], follows_enabled: false },
    // Des goûts : ses catégories ne comptent plus.
    { user_id: "pourtoi", is_enabled: true, frequency: "daily", category_ids: ["c-expo"] },
    { user_id: "pourtoi-rien", is_enabled: true, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "monique", is_enabled: true, frequency: "weekly", category_ids: ["c-concert"] },
  ],
  user_notification_categories: [],
  user_push_tokens: [
    { user_id: "concert", token: token("a"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "expo", token: token("b"), platform: "android", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "danse", token: token("c"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "coupe", token: token("d"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "hebdo", token: token("e"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "pourtoi", token: token("f"), platform: "android", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "pourtoi-rien", token: token("g"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "monique", token: token("h"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
  ],
  notification_logs: [],
  // Ce que follows_digest() rendrait le 21 octobre (lignes triées par utilisateur, puis date).
  follows_digest_rows: [
    followRow("concert", "e1", "Concert de Luiza", "2026-11-07T20:30:00", "location", "l-astrolabe", "L’Astrolabe"),
    followRow("concert", "e2", "Jazz au 108", "2026-11-10T21:00:00", "location", "l-astrolabe", "L’Astrolabe"),
    followRow("hebdo", "e8", "Concert du mardi", "2026-11-17T20:00:00", "artist", "a-luiza", "Luiza"),
    followRow("hebdo", "e9", "Théâtre du vendredi", "2026-11-20T20:30:00", "organizer", "o-grosso", "Grossomodo"),
    followRow("hebdo", "e10", "La semaine d'après", "2026-11-23T20:00:00", "organizer", "o-grosso", "Grossomodo"),
    followRow("suivis-coupes", "e1", "Concert de Luiza", "2026-11-07T20:30:00", "location", "l-astrolabe", "L’Astrolabe"),
    followRow("coupe", "e1", "Concert de Luiza", "2026-11-07T20:30:00", "location", "l-astrolabe", "L’Astrolabe"),
    followRow("sans-preferences", "e1", "Concert de Luiza", "2026-11-07T20:30:00", "location", "l-astrolabe", "L’Astrolabe"),
  ],
};

let backend;
let sent;

beforeEach(() => {
  backend = createFakePostgrest(tables);
  globalThis.fetch = backend.fetch;
  sent = [];
  mock.method(notifications, "sendNotificationToUser", async (userId, payload) => {
    sent.push({ userId, ...payload });
    return { success: true, sent: 1, failed: 0, errors: [] };
  });
});

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
});

const cronRequest = () => ({ headers: new Headers({ authorization: "Bearer secret-de-test" }) });

test("chaque matin : ce soir dans ses catégories, sinon la journée, sinon rien", async () => {
  // Mercredi 21 octobre 2026, 10 h à Paris.
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T08:00:00Z") });

  const response = await daily.GET(cronRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.notificationsSent, 3);
  assert.deepEqual(backend.rpcRanges, [
    ["2026-10-21T18:00:00", "2026-10-22T06:00:00"],
    ["2026-10-21T00:00:00", "2026-10-22T00:00:00"],
  ]);

  const byUser = Object.fromEntries(sent.map((message) => [message.userId, message]));
  assert.deepEqual(Object.keys(byUser).sort(), ["concert", "expo", "pourtoi"]);

  // Ce soir : pas l'exposition commencée en septembre, ni le complet, ni le retiré de l'accueil.
  assert.equal(byUser.concert.title, "2 événements ce soir");
  assert.equal(byUser.concert.body, "Concert de Luiza et Jazz au 108");
  assert.deepEqual(byUser.concert.data, {
    type: "daily_events",
    date: "2026-10-21",
    period: "tonight",
    categories: ["c-concert"],
    event_ids: ["e1", "e2"],
    events_count: 2,
  });

  // Rien ce soir dans ses catégories : la journée.
  assert.equal(byUser.expo.title, "1 événement aujourd’hui");
  assert.equal(byUser.expo.body, "Visite de l'expo");
  assert.equal(byUser.expo.data.period, "today");

  // Un message par utilisateur et par jour : le cron relancé n'envoie rien de plus.
  const again = await (await daily.GET(cronRequest())).json();
  assert.equal(again.notificationsSent, 0);
  assert.equal(again.notificationsSkipped, 3);
  assert.equal(sent.length, 3);
});

test("chaque matin, « Pour toi » : ce qui est pour toi, le toucher ouvre « Pour toi »", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T08:00:00Z") });

  const body = await (await daily.GET(cronRequest())).json();
  const byUser = Object.fromEntries(sent.map((message) => [message.userId, message]));

  // Comme sa page : le retiré de l'accueil aussi ; pas le complet ; ses catégories (Expo) ne comptent plus.
  assert.equal(byUser.pourtoi.title, "2 événements ce soir pour toi");
  assert.equal(byUser.pourtoi.body, "Retiré de l'accueil et Concert de Luiza");
  assert.deepEqual(byUser.pourtoi.data, {
    type: "daily_events",
    date: "2026-10-21",
    period: "tonight",
    categories: [],
    event_ids: ["e6", "e1"],
    events_count: 2,
    for_me: true,
  });
  // Des goûts, rien ce jour-là : pas de message, et pas le résumé de ses catégories (Concert) à la place.
  assert.equal(byUser["pourtoi-rien"], undefined);
  assert.equal(body.debug.usersForMe, 2);
});

test("le lundi : la semaine, du lundi au dimanche", async () => {
  // Lundi 26 octobre 2026, 9 h à Paris (heure d'hiver).
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-26T08:00:00Z") });

  const body = await (await weekly.GET(cronRequest())).json();

  assert.equal(body.notificationsSent, 2);
  assert.deepEqual(backend.rpcRanges, [["2026-10-26T00:00:00", "2026-11-02T00:00:00"]]);
  const byUser = Object.fromEntries(sent.map((message) => [message.userId, message]));
  assert.deepEqual(Object.keys(byUser).sort(), ["hebdo", "monique"]);
  // Les trois dates du Dîner de Condé : une carte, comptée une fois.
  assert.equal(byUser.hebdo.title, "3 événements cette semaine");
  assert.equal(byUser.hebdo.body, "Concert du mardi, Le Dîner de Condé (3 dates) et 1 autre");
  assert.deepEqual(byUser.hebdo.data, {
    type: "weekly_summary",
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    period: "week",
    categories: ["c-concert", "c-theatre"],
    event_ids: ["e8", "e11", "e12", "e9", "e13"],
    events_count: 5,
  });
  // Monique (des goûts) : plus « Le Dîner de Condé, Le Dîner de Condé et 1 autre ».
  assert.equal(byUser.monique.title, "1 événement cette semaine pour toi");
  assert.equal(byUser.monique.body, "Le Dîner de Condé (3 dates)");
  assert.equal(byUser.monique.data.for_me, true);
  assert.deepEqual(byUser.monique.data.categories, []);
});

test("le résumé de la semaine ne part que le lundi", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T08:00:00Z") });

  const body = await (await weekly.GET(cronRequest())).json();

  assert.equal(body.notificationsSent, 0);
  assert.equal(sent.length, 0);
  assert.deepEqual(backend.rpcRanges, []);
});

test("sans le secret du cron : 401, rien n'est lu", async () => {
  const response = await daily.GET({ headers: new Headers({ authorization: "Bearer autre" }) });
  assert.equal(response.status, 401);
  assert.deepEqual(backend.rpcRanges, []);
});

test("les suivis : un message par personne qui a du nouveau, au plus un par jour", async () => {
  // Mercredi 21 octobre 2026, 10 h à Paris.
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T08:00:00Z") });

  const response = await follows.GET(cronRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(backend.rpcFollows, ["2026-10-21T08:00:00.000Z"]);
  // « suivis-coupes » (follows_enabled), « coupe » (notifications coupées), « sans-preferences ».
  assert.equal(body.usersWithNews, 5);
  assert.equal(body.skippedPreferences, 3);
  assert.equal(body.notificationsSent, 2);

  const byUser = Object.fromEntries(sent.map((message) => [message.userId, message]));
  assert.deepEqual(Object.keys(byUser).sort(), ["concert", "hebdo"]);

  // Une seule cible : son nom, et le toucher ouvre sa page.
  assert.equal(byUser.concert.title, "2 nouveaux événements chez L’Astrolabe");
  assert.equal(byUser.concert.body, "Concert de Luiza et Jazz au 108");
  assert.deepEqual(byUser.concert.data, {
    type: "follows_digest",
    date: "2026-10-21",
    event_ids: ["e1", "e2"],
    events_count: 2,
    follows_count: 1,
    target_type: "location",
    target_id: "l-astrolabe",
  });

  // Plusieurs : « tes suivis », et l'onglet Favoris.
  assert.equal(byUser.hebdo.title, "3 nouveaux événements chez tes suivis");
  assert.equal(byUser.hebdo.body, "Concert du mardi, Théâtre du vendredi et 1 autre");
  assert.deepEqual(byUser.hebdo.data, {
    type: "follows_digest",
    date: "2026-10-21",
    event_ids: ["e8", "e9", "e10"],
    events_count: 3,
    follows_count: 2,
  });

  // Le log garde l'instant du calcul : le message suivant reprend de là.
  assert.deepEqual(
    backend.db.notification_logs.map((log) => [log.user_id, log.flow_type, log.delivery_key, log.covered_until]),
    [
      ["concert", "follows_digest", "follows_digest:2026-10-21:concert", "2026-10-21T08:00:00.000Z"],
      ["hebdo", "follows_digest", "follows_digest:2026-10-21:hebdo", "2026-10-21T08:00:00.000Z"],
    ],
  );

  // Relancé le même jour : rien de plus.
  const again = await (await follows.GET(cronRequest())).json();
  assert.equal(again.notificationsSent, 0);
  assert.equal(again.notificationsSkipped, 2);
  assert.equal(sent.length, 2);
});

test("les suivis : rien de nouveau, ou notifications coupées pour tous, pas de message", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-21T08:00:00Z") });

  backend.db.follows_digest_rows = [];
  const quiet = await (await follows.GET(cronRequest())).json();
  assert.equal(quiet.notificationsSent, 0);
  assert.equal(quiet.message, "Rien de nouveau chez les suivis");

  backend.db.notification_settings[0].is_active = false;
  const off = await (await follows.GET(cronRequest())).json();
  assert.equal(off.message, "Notifications globales désactivées");
  // Coupées : la fonction n'est même pas appelée.
  assert.equal(backend.rpcFollows.length, 1);
  assert.equal(sent.length, 0);
});

test("les suivis, sans le secret du cron : 401, rien n'est lu", async () => {
  const response = await follows.GET({ headers: new Headers({ authorization: "Bearer autre" }) });
  assert.equal(response.status, 401);
  assert.deepEqual(backend.rpcFollows, []);
});
