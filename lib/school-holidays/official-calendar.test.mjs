/*
 * Vacances scolaires (lib/school-holidays/official-calendar.ts) et leur cron, contre un faux jeu
 * officiel (lignes recopiées de l'export du 2026-10-19) et un faux Supabase, sans réseau.
 *   node --test lib/school-holidays/official-calendar.test.mjs
 */
import assert from "node:assert/strict";
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

const calendar = await jiti.import(path.join(root, "lib/school-holidays/official-calendar.ts"));
const cron = await jiti.import(path.join(root, "app/api/cron/school-holidays/route.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  delete process.env.CRON_SECRET;
});

const record = (description, start_date, end_date, annee_scolaire, population = "-", location = "Orléans-Tours") => ({
  description,
  population,
  start_date,
  end_date,
  location,
  zones: "Zone B",
  annee_scolaire,
});

// Lignes de l'export (timezone=Europe/Paris), telles quelles.
const RECORDS = [
  record("Vacances de Printemps", "2025-04-05T00:00:00+02:00", "2025-04-22T00:00:00+02:00", "2024-2025"),
  record("Pont de l'Ascension", "2026-05-14T00:00:00+02:00", "2026-05-18T00:00:00+02:00", "2025-2026"),
  record("Vacances de la Toussaint", "2026-10-17T00:00:00+02:00", "2026-11-02T00:00:00+01:00", "2026-2027"),
  record("Vacances de Noël", "2026-12-19T00:00:00+01:00", "2027-01-04T00:00:00+01:00", "2026-2027"),
  record("Pont de l'Ascension", "2027-05-07T00:00:00+02:00", "2027-05-07T00:00:00+02:00", "2026-2027"),
  record("Vacances d'Été", "2027-07-03T00:00:00+02:00", "2027-09-02T00:00:00+02:00", "2026-2027", "Élèves"),
  record("Vacances d'Été", "2027-07-03T00:00:00+02:00", "2027-09-01T00:00:00+02:00", "2026-2027", "Enseignants"),
  record("Début des Vacances d'Été", "2028-07-04T00:00:00+02:00", "2028-07-04T00:00:00+02:00", "2027-2028"),
];

const byName = (rows) => Object.fromEntries(rows.map((row) => [`${row.school_year} ${row.name}`, row]));

test("bornes : jours de vacances compris, la reprise exclue", () => {
  const { rows, skipped } = calendar.toSchoolHolidayRows(RECORDS);
  const periods = byName(rows);

  // Onisep : fin des cours le samedi 17 octobre 2026, reprise le lundi 2 novembre.
  assert.deepEqual(periods["2026-2027 Vacances de la Toussaint"], {
    academy: "Orléans-Tours",
    zone: "Zone B",
    school_year: "2026-2027",
    name: "Vacances de la Toussaint",
    first_day: "2026-10-17",
    last_day: "2026-11-01",
    source_start_date: "2026-10-17T00:00:00+02:00",
    source_end_date: "2026-11-02T00:00:00+01:00",
  });
  assert.equal(periods["2026-2027 Vacances de Noël"].last_day, "2027-01-03");
  // Reprise un mardi (lundi de Pâques férié) : le lundi est en vacances.
  assert.deepEqual(
    [periods["2024-2025 Vacances de Printemps"].first_day, periods["2024-2025 Vacances de Printemps"].last_day],
    ["2025-04-05", "2025-04-21"],
  );
  // Pont du jeudi au dimanche ; pont d'un seul jour (mêmes bornes dans le jeu).
  assert.deepEqual(
    [periods["2025-2026 Pont de l'Ascension"].first_day, periods["2025-2026 Pont de l'Ascension"].last_day],
    ["2026-05-14", "2026-05-17"],
  );
  assert.deepEqual(
    [periods["2026-2027 Pont de l'Ascension"].first_day, periods["2026-2027 Pont de l'Ascension"].last_day],
    ["2027-05-07", "2027-05-07"],
  );
  // Été : la ligne des élèves, pas celle des enseignants.
  assert.equal(periods["2026-2027 Vacances d'Été"].last_day, "2027-09-01");
  assert.equal(rows.length, 6);
  assert.deepEqual(skipped, [
    { name: "Début des Vacances d'Été", school_year: "2027-2028", reason: "fin pas encore connue" },
  ]);
});

test("bornes : les mêmes depuis des dates en UTC (sans le paramètre timezone)", () => {
  const { rows } = calendar.toSchoolHolidayRows([
    record("Vacances de la Toussaint", "2026-10-16T22:00:00+00:00", "2026-11-01T23:00:00+00:00", "2026-2027"),
    record("Vacances de Noël", "2026-12-18T23:00:00Z", "2027-01-03T23:00:00Z", "2026-2027"),
    record("Vacances d'Hiver", "2027-02-20", "2027-03-08", "2026-2027"),
  ]);
  assert.deepEqual(
    rows.map((row) => [row.name, row.first_day, row.last_day]),
    [
      ["Vacances de la Toussaint", "2026-10-17", "2026-11-01"],
      ["Vacances de Noël", "2026-12-19", "2027-01-03"],
      ["Vacances d'Hiver", "2027-02-20", "2027-03-07"],
    ],
  );
});

test("lignes écartées : autre académie, dates illisibles, doublon, reprise avant la fin des cours", () => {
  const { rows, skipped } = calendar.toSchoolHolidayRows([
    record("Vacances de la Toussaint", "2026-10-17T00:00:00+02:00", "2026-11-02T00:00:00+01:00", "2026-2027", "-", "Paris"),
    record("Vacances de Noël", "2026-12-19T00:00:00+01:00", null, "2026-2027"),
    record("Vacances d'Hiver", "2027-02-20T00:00:00", "2027-03-08T00:00:00", "2026-2027"),
    record("Vacances de Printemps", "2027-04-17T00:00:00+02:00", "2027-05-03T00:00:00+02:00", "2026-2027"),
    record("Vacances de Printemps", "2027-04-17T00:00:00+02:00", "2027-05-03T00:00:00+02:00", "2026-2027", "Élèves"),
    record("Vacances de Noël", "2027-12-18T00:00:00+01:00", "2027-12-01T00:00:00+01:00", "2027-2028"),
    record("", "2027-12-18T00:00:00+01:00", "2028-01-03T00:00:00+01:00", "2027-2028"),
  ]);
  assert.deepEqual(rows.map((row) => row.name), ["Vacances de Printemps"]);
  assert.deepEqual(
    skipped.map((entry) => entry.reason),
    [
      "date manquante ou illisible",
      "date manquante ou illisible",
      "période en double",
      "reprise avant la fin des cours",
      "nom ou année scolaire manquant",
    ],
  );
});

test("adresse de l'export : académie, tri, heure de Paris", () => {
  const url = new URL(calendar.officialCalendarUrl());
  assert.equal(url.origin + url.pathname,
    "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/exports/json");
  assert.equal(url.searchParams.get("where"), 'location="Orléans-Tours"');
  assert.equal(url.searchParams.get("order_by"), "start_date");
  assert.equal(url.searchParams.get("timezone"), "Europe/Paris");
});

/** Faux Supabase : table school_holidays en mémoire (upsert, select avec eq, delete avec in). */
function fakeSupabase(initialRows = []) {
  const table = structuredClone(initialRows);
  const requests = [];
  let nextId = table.length + 1;

  async function handle(request) {
    const url = new URL(request.url);
    const params = url.searchParams;
    requests.push(`${request.method} ${url.pathname}?${params.toString()}`);
    if (request.method === "POST") {
      const keys = params.get("on_conflict").split(",");
      for (const row of JSON.parse(await request.text())) {
        const existing = table.find((candidate) => keys.every((key) => candidate[key] === row[key]));
        if (existing) Object.assign(existing, row);
        else table.push({ id: `id-${nextId++}`, ...row });
      }
      return new Response(null, { status: 201 });
    }
    const filters = [...params].filter(([key]) => key !== "select");
    const matching = (row) =>
      filters.every(([column, filter]) => {
        if (filter.startsWith("eq.")) return String(row[column]) === filter.slice(3);
        if (filter.startsWith("in.(")) return filter.slice(4, -1).split(",").map((v) => v.replace(/"/g, "")).includes(String(row[column]));
        throw new Error(`Filtre non géré : ${column}=${filter}`);
      });
    if (request.method === "GET") {
      const columns = params.get("select").split(",");
      return Response.json(table.filter(matching).map((row) => Object.fromEntries(columns.map((c) => [c, row[c]]))));
    }
    if (request.method === "DELETE") {
      for (const row of table.filter(matching)) table.splice(table.indexOf(row), 1);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Méthode non gérée : ${request.method}`);
  }

  return { table, requests, handle };
}

/** fetch du test : le faux jeu officiel et le faux Supabase. */
function fakeFetch({ supabase, official = () => Response.json(RECORDS) }) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.origin}${url.pathname}`);
    if (url.hostname === "data.education.gouv.fr") return official(request);
    if (url.origin === SUPABASE_URL && url.pathname === "/rest/v1/school_holidays") return supabase.handle(request);
    throw new Error(`Appel réseau inattendu : ${request.method} ${request.url}`);
  };
  return { calls, fetchImpl };
}

const client = (fetchImpl) =>
  createClient(SUPABASE_URL, "service-key", { auth: { persistSession: false }, global: { fetch: fetchImpl } });

test("chargement : périodes écrites, périodes retirées du jeu supprimées, autres académies intactes", async () => {
  const supabase = fakeSupabase([
    { id: "old-1", academy: "Orléans-Tours", school_year: "2026-2027", name: "Vacances de la Toussaint", first_day: "2026-10-18", last_day: "2026-11-02" },
    { id: "old-2", academy: "Orléans-Tours", school_year: "2026-2027", name: "Vacances de Carnaval", first_day: "2027-02-01", last_day: "2027-02-02" },
    { id: "other", academy: "Paris", school_year: "2026-2027", name: "Vacances de Carnaval", first_day: "2027-02-01", last_day: "2027-02-02" },
  ]);
  const { fetchImpl } = fakeFetch({ supabase });

  const report = await calendar.syncSchoolHolidays(client(fetchImpl), { fetchImpl });

  assert.deepEqual(report, {
    fetched: 8,
    saved: 6,
    removed: 1,
    skipped: [{ name: "Début des Vacances d'Été", school_year: "2027-2028", reason: "fin pas encore connue" }],
  });
  const toussaint = supabase.table.find((row) => row.name === "Vacances de la Toussaint");
  assert.equal(toussaint.id, "old-1");
  assert.deepEqual([toussaint.first_day, toussaint.last_day], ["2026-10-17", "2026-11-01"]);
  assert.equal(supabase.table.some((row) => row.id === "old-2"), false);
  assert.equal(supabase.table.some((row) => row.id === "other"), true);
  assert.equal(supabase.table.length, 7);
  assert.match(supabase.requests[0], /^POST \/rest\/v1\/school_holidays\?.*on_conflict=academy%2Cschool_year%2Cname/);
});

test("chargement : jeu vide ou en erreur, la table ne change pas", async () => {
  for (const official of [() => Response.json([]), () => new Response("indisponible", { status: 503 }), () => Response.json({})]) {
    const supabase = fakeSupabase([{ id: "keep", academy: "Orléans-Tours", school_year: "2026-2027", name: "Vacances de Noël" }]);
    const { fetchImpl } = fakeFetch({ supabase, official });
    await assert.rejects(calendar.syncSchoolHolidays(client(fetchImpl), { fetchImpl }), /Calendrier scolaire officiel/);
    assert.deepEqual(supabase.requests, []);
    assert.equal(supabase.table.length, 1);
  }
});

test("cron : secret exigé, puis chargement avec la clé service role", async () => {
  const supabase = fakeSupabase();
  const { calls, fetchImpl } = fakeFetch({ supabase });
  globalThis.fetch = fetchImpl;
  const call = (authorization) =>
    cron.GET(new NextRequest("http://localhost/api/cron/school-holidays", authorization ? { headers: { authorization } } : {}));

  assert.equal((await call()).status, 401);
  process.env.CRON_SECRET = "s3cret";
  assert.equal((await call("Bearer autre")).status, 401);
  assert.deepEqual(calls, []);

  const response = await call("Bearer s3cret");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.saved, 6);
  assert.equal(supabase.table.length, 6);

  globalThis.fetch = async () => new Response("indisponible", { status: 503 });
  const failed = await call("Bearer s3cret");
  assert.equal(failed.status, 500);
  assert.match((await failed.json()).error, /HTTP 503/);
});
