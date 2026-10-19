/*
 * Agenda On sort ! de bout en bout, en simulation (rien n'est écrit) : scan_agenda puis import_urls
 * sur une base factice et l'échantillon de l'API enregistré le 18/10/2026
 * (lib/scraping/fixtures/on-sort-api.json). Horloge arrêtée au soir de l'enregistrement.
 *   node --test lib/agent/on-sort.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { AGENT_TOOLS } = await jiti.import(path.join(root, "lib/agent/tools.ts"));

const fixture = JSON.parse(fs.readFileSync(path.join(root, "lib/scraping/fixtures/on-sort-api.json"), "utf8"));
const ON_SORT = "https://sortir.orleans-metropole.fr";
const page = (uid) => {
  const event = fixture.list.events.find((entry) => entry.uid === uid);
  return `${ON_SORT}/evenement/${uid}/${event.slug}`;
};

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-18T21:00:00+02:00") });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** API On sort ! simulée : la liste du mois sur une page, les fiches de l'échantillon. */
function serveOnSort(list = fixture.list) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin !== ON_SORT || url.pathname !== "/api/events") return new Response("introuvable", { status: 404 });
    const uid = url.searchParams.get("uids[]");
    if (uid) return Response.json({ success: true, event: fixture.events[uid] });
    return Response.json(url.searchParams.get("offset") === "0" ? list : { total: list.total, events: [] });
  };
}

const TABLES = {
  locations: [
    { id: "theatre", name: "Théâtre d'Orléans", address: "Boulevard Pierre Ségelle 45000 Orléans", latitude: 47.9, longitude: 1.91, is_organizer: true },
    { id: "frac", name: "Frac Centre-Val de Loire", address: "88 Rue du Colombier 45000 Orléans", latitude: 47.9, longitude: 1.9, is_organizer: true },
    { id: "zigo", name: "Zigotastiques – le QG", address: "Passage Bannier Joseph Lucet 45000 Orléans", latitude: 47.9, longitude: 1.9, is_organizer: true },
    // Lieu sans adresse précise : ne doit pas attraper toutes les adresses d'Orléans.
    { id: "secret", name: "Adresse Secrète", address: "Orléans", latitude: null, longitude: null, is_organizer: false },
  ],
  organizers: [],
  artists: [],
  tags: [{ id: "jazz", name: "Jazz" }],
  categories: ["Concert", "Spectacle", "Expo", "Cinema", "Rencontre", "Festival", "Danse", "DJ Set", "Atelier"].map((name) => ({
    id: name.toLowerCase(),
    name,
    is_active: true,
  })),
  intake_sources_view: [
    {
      id: "source-onsort",
      name: "On sort ! (Orléans Métropole)",
      url: ON_SORT,
      status: "active",
      organizer_id: null,
      organizer_location_id: null,
      scan_frequency_days: 7,
    },
  ],
  organizer_agenda_scraping_configs: [],
  user_requests: [],
  events: [
    // Importé lors d'un passage précédent : même page.
    { id: "ev-louise", title: "Louise & Michel", date: "2026-11-05T20:30:00+00:00", end_date: null, scraping_url: page(10401699) },
    // Importé depuis l'agenda de la compagnie, titre écrit autrement.
    {
      id: "ev-garde",
      title: "En Garde à Vue (Cie des Elles et des Ils)",
      date: "2026-11-06T20:30:00+00:00",
      end_date: null,
      scraping_url: "https://www.ciedesellesetdesils.fr/en-garde-a-vue",
    },
    // Exposition en cours, importée depuis le site du Frac.
    {
      id: "ev-circus",
      title: "Circus",
      date: "2026-09-19T10:00:00+00:00",
      end_date: "2027-03-07T19:00:00+00:00",
      scraping_url: "https://www.frac-centre.fr/circus",
    },
    // Lu sur l'Instagram du lieu, sous un autre titre, un quart d'heure plus tôt (la base note l'heure de Paris en UTC).
    {
      id: "ev-zigo",
      title: "Stand-up au QG",
      date: "2026-10-23T20:30:00+00:00",
      end_date: null,
      location_id: "zigo",
      archived: false,
      instagram_url: "https://www.instagram.com/p/ZIGO/",
    },
  ],
};

/** Valeur comparable : date (instant) ou texte. */
const comparable = (value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : value);

/**
 * Client Supabase factice : chaque table renvoie ses lignes filtrées par eq, neq, gte, lte, in et is
 * (une colonne absente vaut null ; or, order et select sont ignorés). Toute écriture fait échouer le test.
 */
const supabase = {
  from(table) {
    const filters = [];
    let single = false;
    const run = () => {
      const rows = (TABLES[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
      return { data: single ? rows[0] ?? null : rows, error: null, count: rows.length };
    };
    const value = (row, column) => (column in row ? row[column] : null);
    const query = new Proxy(
      {},
      {
        get(_target, property) {
          if (["insert", "update", "upsert", "delete"].includes(property)) throw new Error(`écriture interdite (${table})`);
          if (property === "then") return (resolve, reject) => Promise.resolve(run()).then(resolve, reject);
          if (property === "eq") return (column, expected) => (filters.push((row) => value(row, column) === expected), query);
          if (property === "neq") return (column, expected) => (filters.push((row) => value(row, column) !== expected), query);
          if (property === "is") return (column, expected) => (filters.push((row) => value(row, column) === expected), query);
          if (property === "in") return (column, list) => (filters.push((row) => list.includes(value(row, column))), query);
          if (property === "gte") {
            return (column, bound) => (filters.push((row) => value(row, column) !== null && comparable(value(row, column)) >= comparable(bound)), query);
          }
          if (property === "lte") {
            return (column, bound) => (filters.push((row) => value(row, column) !== null && comparable(value(row, column)) <= comparable(bound)), query);
          }
          if (property === "single" || property === "maybeSingle") return () => ((single = true), query);
          return () => query;
        },
      },
    );
    return query;
  },
  storage: {
    from() {
      throw new Error("stockage interdit en simulation");
    },
  },
};

const run = (name, args) => AGENT_TOOLS.find((tool) => tool.name === name).run({ supabase, dryRun: true }, args);

test("scan_agenda sur On sort ! : scène locale seulement, déjà importés et doublons hors de to_import", async () => {
  serveOnSort();
  const scan = await run("scan_agenda", { url: ON_SORT });

  assert.equal(scan.method, "onsort");
  assert.deepEqual(scan.counts, { found: 6, excluded: 28, known: 1, duplicates: 3, past: 0, cancelled: 0, to_import: 2 });
  assert.equal(scan.excluded["programmation d'une institution (mairie, médiathèque, musée, tourisme, scène nationale)"], 6);
  assert.equal(scan.excluded["jeune public"], 6);
  // Par date : CHUT ! le 7 novembre, le festival le 13.
  assert.deepEqual(scan.to_import, [page(83483449), page(54042028)]);

  const event = (uid) => scan.events.find((entry) => entry.url === page(uid));
  assert.equal(event(10401699).known, true);
  // Lieu et organisateur annoncés, pour trier la scène locale.
  assert.equal(event(83483449).venue, "Auditorium de la Médiathèque Gambetta - Marcel Reggui");
  assert.equal(event(83483449).organizer, "Association DEFI");
  // Même titre le même jour, ou pendant l'exposition déjà importée.
  assert.deepEqual(event(94596231).duplicate_of, {
    id: "ev-garde",
    title: "En Garde à Vue (Cie des Elles et des Ils)",
    date: "2026-11-06T20:30:00+00:00",
    reason: "Même titre le même jour",
  });
  assert.equal(event(32843872).duplicate_of.id, "ev-circus");
  // Même lieu, un quart d'heure d'écart, autre titre.
  assert.deepEqual(event(76658298).duplicate_of, {
    id: "ev-zigo",
    title: "Stand-up au QG",
    date: "2026-10-23T20:30:00+00:00",
    reason: "Même lieu, à deux heures près",
  });
});

test("scan_agenda sur On sort ! : un événement publié deux fois dans l'agenda n'est importé qu'une fois", async () => {
  const chut = fixture.list.events.find((entry) => entry.uid === 83483449);
  const copy = { ...chut, uid: 99, slug: "chut-concert-spectacle", title: { fr: "CHUT ! (concert-spectacle)" } };
  serveOnSort({ total: 2, events: [chut, copy] });
  const scan = await run("scan_agenda", { url: ON_SORT });
  assert.deepEqual(scan.to_import, [page(83483449)]);
  assert.deepEqual(scan.events.find((entry) => entry.url.includes("/99/")).duplicate_of, {
    url: page(83483449),
    title: "CHUT !",
    date: "2026-11-07T19:00:00",
    reason: "Même lieu, même heure dans l'agenda (plateau ?)",
  });
});

test("import_urls en simulation : lieu, catégorie, affiche et séances ; publié si complet, sinon en attente", async () => {
  serveOnSort();
  const output = await run("import_urls", {
    urls: [page(27309952), page(41566173), page(42586898), page(68322993), page(32843872)],
    source_id: "source-onsort",
    create_missing_artists: true,
  });
  const result = (uid) => output.results.find((entry) => entry.url === page(uid));
  assert.equal(output.dry_run, true);

  // Heure, lieu, catégorie et affiche : publié directement (source suivie).
  const youn = result(27309952);
  assert.equal(youn.status, "published", youn.reason);
  assert.equal(youn.location, "Théâtre d'Orléans");
  assert.equal(youn.category, "Concert");
  assert.equal(youn.start, "2026-11-17T20:00");
  assert.equal(youn.missing, undefined);
  assert.equal(youn.young_audience, undefined);

  // Dix séances, une fiche chacune.
  const enchanteurs = result(41566173);
  assert.equal(enchanteurs.status, "published", enchanteurs.reason);
  assert.equal(enchanteurs.occurrences, 10);
  assert.equal(enchanteurs.category, "Spectacle");

  // Lieu absent d'OutLive : en attente, lieu annoncé gardé avec son adresse pour la validation.
  const luminiscence = result(42586898);
  assert.equal(luminiscence.status, "pending");
  assert.deepEqual(luminiscence.missing, ["lieu"]);
  assert.equal(luminiscence.location_unmatched, "Cathédrale Sainte-Croix d'Orléans");
  assert.equal(luminiscence.announced_venue, "Cathédrale Sainte-Croix d'Orléans, Place Sainte-Croix, 45000 Orléans");

  // « 1 rue Dupanloup, 45000 Orléans » ne désigne pas « Adresse Secrète ».
  const ory = result(68322993);
  assert.equal(ory.location, null);
  assert.equal(ory.location_unmatched, "Hôtel Dupanloup");
  assert.equal(ory.category, "Rencontre");

  // Exposition déjà importée depuis le site du Frac, même titre.
  const circus = result(32843872);
  assert.equal(circus.status, "duplicate");
  assert.equal(circus.duplicate_of.id, "ev-circus");
});

test("import_urls : une page On sort ! au même lieu qu'un événement à deux heures près est un doublon", async () => {
  serveOnSort();
  const nearby = {
    id: "ev-sn-jazz",
    title: "Soirée jazz de la Scène nationale",
    date: "2026-11-17T19:30:00+00:00",
    end_date: null,
    location_id: "theatre",
    archived: false,
  };
  TABLES.events.push(nearby);
  try {
    const output = await run("import_urls", { urls: [page(27309952)], source_id: "source-onsort" });
    assert.equal(output.results[0].status, "duplicate");
    assert.equal(output.results[0].duplicate_of.id, "ev-sn-jazz");
    assert.equal(output.results[0].reason, "Même lieu, à deux heures près");
  } finally {
    TABLES.events.splice(TABLES.events.indexOf(nearby), 1);
  }
});

test("create_event en simulation : jeune public repéré (âge, mention, boum) ou donné par l'agent", async () => {
  const create = (event) => run("create_event", { start: "2026-11-21T15:00", location: "Théâtre d'Orléans", category: "Spectacle", ...event });

  assert.equal((await create({ title: "Contes à croquer", description: "Un spectacle jeune public dès 3 ans." })).young_audience, true);
  assert.equal((await create({ title: "Boum d'Halloween" })).young_audience, true);
  assert.equal((await create({ title: "Atelier masques", is_young_audience: true })).young_audience, true);
  // Tout public dès 12 ans : pas un événement jeune public.
  assert.equal((await create({ title: "Le Misanthrope", description: "Tout public dès 12 ans." })).young_audience, undefined);
});
