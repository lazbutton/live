/*
 * Les crons des résumés (daily-events, weekly-summary) exécutés pour de vrai contre un faux PostgREST
 * en mémoire, branché sur `globalThis.fetch` : qui reçoit quoi, avec quelles données. L'envoi (APNs,
 * FCM) est remplacé par un espion : rien ne sort.
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
    if (name === "rpc/app_events_in_range") {
      rpcRanges.push([payload.range_start, payload.range_end]);
      const rows = db.events
        .filter((event) => inRange(event, payload.range_start, payload.range_end))
        .filter((event) => matches(event, url.searchParams))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      return respond(rows);
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

  return { db, rpcRanges, fetch: fakeFetch };
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
  ],
  user_notification_preferences: [
    { user_id: "concert", is_enabled: true, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "expo", is_enabled: true, frequency: "daily", category_ids: ["c-expo"] },
    { user_id: "danse", is_enabled: true, frequency: "daily", category_ids: ["c-danse"] },
    { user_id: "sans-jeton", is_enabled: true, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "coupe", is_enabled: false, frequency: "daily", category_ids: ["c-concert"] },
    { user_id: "hebdo", is_enabled: true, frequency: "weekly", category_ids: ["c-concert", "c-theatre"] },
  ],
  user_notification_categories: [],
  user_push_tokens: [
    { user_id: "concert", token: token("a"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "expo", token: token("b"), platform: "android", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "danse", token: token("c"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "coupe", token: token("d"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
    { user_id: "hebdo", token: token("e"), platform: "ios", updated_at: "2026-10-20T10:00:00Z" },
  ],
  notification_logs: [],
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
  assert.equal(body.notificationsSent, 2);
  assert.deepEqual(backend.rpcRanges, [
    ["2026-10-21T18:00:00", "2026-10-22T06:00:00"],
    ["2026-10-21T00:00:00", "2026-10-22T00:00:00"],
  ]);

  const byUser = Object.fromEntries(sent.map((message) => [message.userId, message]));
  assert.deepEqual(Object.keys(byUser).sort(), ["concert", "expo"]);

  // Ce soir : pas l'exposition commencée en septembre, ni le complet, ni le retiré de l'accueil.
  assert.equal(byUser.concert.title, "2 événements ce soir dans tes catégories");
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
  assert.equal(byUser.expo.title, "1 événement aujourd’hui dans tes catégories");
  assert.equal(byUser.expo.body, "Visite de l'expo");
  assert.equal(byUser.expo.data.period, "today");

  // Un message par utilisateur et par jour : le cron relancé n'envoie rien de plus.
  const again = await (await daily.GET(cronRequest())).json();
  assert.equal(again.notificationsSent, 0);
  assert.equal(again.notificationsSkipped, 2);
  assert.equal(sent.length, 2);
});

test("le lundi : la semaine, du lundi au dimanche", async () => {
  // Lundi 26 octobre 2026, 9 h à Paris (heure d'hiver).
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-26T08:00:00Z") });

  const body = await (await weekly.GET(cronRequest())).json();

  assert.equal(body.notificationsSent, 1);
  assert.deepEqual(backend.rpcRanges, [["2026-10-26T00:00:00", "2026-11-02T00:00:00"]]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].userId, "hebdo");
  assert.equal(sent[0].title, "2 événements cette semaine dans tes catégories");
  assert.equal(sent[0].body, "Concert du mardi et Théâtre du vendredi");
  assert.deepEqual(sent[0].data, {
    type: "weekly_summary",
    start_date: "2026-10-26",
    end_date: "2026-11-01",
    period: "week",
    categories: ["c-concert", "c-theatre"],
    event_ids: ["e8", "e9"],
    events_count: 2,
  });
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
