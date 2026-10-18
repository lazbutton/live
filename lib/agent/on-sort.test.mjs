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
function serveOnSort() {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin !== ON_SORT || url.pathname !== "/api/events") return new Response("introuvable", { status: 404 });
    const uid = url.searchParams.get("uids[]");
    if (uid) return Response.json({ success: true, event: fixture.events[uid] });
    return Response.json(url.searchParams.get("offset") === "0" ? fixture.list : { total: fixture.list.total, events: [] });
  };
}

const TABLES = {
  locations: [
    { id: "theatre", name: "Théâtre d'Orléans", address: "Boulevard Pierre Ségelle 45000 Orléans", latitude: 47.9, longitude: 1.91 },
    { id: "frac", name: "Frac Centre-Val de Loire", address: "88 Rue du Colombier 45000 Orléans", latitude: 47.9, longitude: 1.9 },
    // Lieu sans adresse précise : ne doit pas attraper toutes les adresses d'Orléans.
    { id: "secret", name: "Adresse Secrète", address: "Orléans", latitude: null, longitude: null },
  ],
  organizers: [],
  artists: [],
  tags: [{ id: "jazz", name: "Jazz" }],
  categories: ["Concert", "Spectacle", "Expo", "Cinema", "Rencontre", "Festival", "Danse", "DJ Set", "Atelier"].map((name) => ({
    id: name.toLowerCase(),
    name,
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
    { id: "ev-arco", title: "ARCO", date: "2026-10-28T15:30:00+00:00", end_date: null, scraping_url: page(83901647) },
    // Importé depuis le site du théâtre, titre écrit autrement.
    {
      id: "ev-plonger",
      title: "Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES",
      date: "2026-10-20T20:30:00+00:00",
      end_date: null,
      scraping_url: "https://scenenationale-orleans.fr/plonger",
    },
    // Exposition en cours, importée depuis le site du Frac.
    {
      id: "ev-circus",
      title: "Circus",
      date: "2026-09-19T10:00:00+00:00",
      end_date: "2027-03-07T19:00:00+00:00",
      scraping_url: "https://www.frac-centre.fr/circus",
    },
  ],
};

/** Client Supabase factice : chaque table renvoie ses lignes ; toute écriture fait échouer le test. */
const supabase = {
  from(table) {
    const query = new Proxy(
      {},
      {
        get(_target, property) {
          if (["insert", "update", "upsert", "delete"].includes(property)) throw new Error(`écriture interdite (${table})`);
          if (property === "then") {
            return (resolve, reject) => Promise.resolve({ data: TABLES[table] ?? [], error: null, count: 0 }).then(resolve, reject);
          }
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

test("scan_agenda sur On sort ! : domaines suivis seulement, déjà importés et doublons hors de to_import", async () => {
  serveOnSort();
  const scan = await run("scan_agenda", { url: ON_SORT });

  assert.equal(scan.method, "onsort");
  assert.deepEqual(scan.counts, { found: 11, excluded: 11, known: 1, duplicates: 3, past: 0, cancelled: 0, to_import: 7 });
  assert.equal(scan.excluded["atelier, stage ou cours"], 1);
  // Par date : du 19 octobre au 17 novembre.
  assert.deepEqual(scan.to_import, [
    page(68322993),
    page(42586898),
    page(28552054),
    page(92018354),
    page(41566173),
    page(54042028),
    page(27309952),
  ]);

  const event = (uid) => scan.events.find((entry) => entry.url === page(uid));
  assert.equal(event(83901647).known, true);
  // Même titre le même jour qu'un événement existant, ou pendant l'exposition déjà importée.
  assert.equal(event(24728440).duplicate_of.id, "ev-plonger");
  assert.equal(event(32843872).duplicate_of.id, "ev-circus");
  // Publié deux fois dans l'agenda (par le festival et par la salle) : la seconde fiche est écartée.
  assert.deepEqual(event(44676497).duplicate_of, {
    url: page(54042028),
    title: "Festival des Bouts du Monde",
    date: "2026-11-13T20:30:00",
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

  // Dix séances, une fiche chacune.
  const enchanteurs = result(41566173);
  assert.equal(enchanteurs.status, "published", enchanteurs.reason);
  assert.equal(enchanteurs.occurrences, 10);
  assert.equal(enchanteurs.category, "Spectacle");

  // Lieu absent d'OutLive : en attente, lieu à créer.
  const luminiscence = result(42586898);
  assert.equal(luminiscence.status, "pending");
  assert.deepEqual(luminiscence.missing, ["lieu"]);
  assert.equal(luminiscence.location_unmatched, "Cathédrale Sainte-Croix d'Orléans");

  // « 1 rue Dupanloup, 45000 Orléans » ne désigne pas « Adresse Secrète ».
  const ory = result(68322993);
  assert.equal(ory.location, null);
  assert.equal(ory.location_unmatched, "Hôtel Dupanloup");
  assert.equal(ory.category, "Rencontre");

  // Exposition déjà importée depuis le site du Frac : même lieu, même ouverture.
  const circus = result(32843872);
  assert.equal(circus.status, "duplicate");
  assert.equal(circus.duplicate_of.id, "ev-circus");
});
