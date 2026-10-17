/*
 * create_event en simulation (rien n'est écrit) sur une base factice : affiche Instagram reprise,
 * exposition déjà ouverte, date douteuse, date retirée du titre, séance passée ignorée.
 *   node --test lib/agent/collecte.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { createAgentEventFromInput } = await jiti.import(path.join(root, "lib/agent/events.ts"));
const { parisToday } = await jiti.import(path.join(root, "lib/scraping/dates.ts"));

const TABLES = {
  locations: [{ id: "le-108", name: "Le 108", address: "108 rue de Bourgogne, 45000 Orléans", latitude: 47.9, longitude: 1.91 }],
  organizers: [],
  artists: [],
  tags: [],
  categories: [
    { id: "concert", name: "Concert" },
    { id: "exposition", name: "Exposition" },
    { id: "atelier", name: "Atelier" },
  ],
  intake_sources_view: [
    {
      id: "source-108",
      name: "Le 108",
      url: "https://www.instagram.com/le108orleans/",
      status: "active",
      organizer_id: null,
      organizer_location_id: "le-108",
      scan_frequency_days: 7,
    },
  ],
  organizer_agenda_scraping_configs: [],
  events: [],
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

const context = () => ({ supabase, dryRun: true });

/** Jour à `offset` jours d'aujourd'hui (heure de Paris), au format AAAA-MM-JJ. */
function day(offset) {
  const date = new Date(`${parisToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
const ddmm = (isoDay) => `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}`;

const create = (event) =>
  createAgentEventFromInput(context(), {
    sourceId: "source-108",
    sourceUrl: event.source_url ?? "https://www.instagram.com/p/Dd9VqNgDaxE/?igsh=MTBhM2E4YjJ6dGk2aw==",
    event,
    createMissingArtists: false,
  });

test("post Instagram sans lien d'image : l'affiche du post est reprise, l'événement est publié", async () => {
  const result = await create({ title: "Jam session", start: `${day(10)}T20:30`, location: "Le 108", category: "Concert" });
  assert.equal(result.status, "published", result.reason);
  assert.equal(result.missing, undefined);
  assert.equal(result.location, "Le 108");
});

test("exposition déjà ouverte : ajoutée tant qu'elle n'est pas finie", async () => {
  const open = await create({
    title: "Faire paysage ensemble",
    start: day(-20),
    end: day(20),
    location: "Le 108",
    category: "Exposition",
    image_url: "https://exemple.fr/affiche-expo.jpg",
  });
  assert.notEqual(open.reason, "Déjà passé");
  assert.equal(open.occurrences, 1);
  const finished = await create({ title: "Expo finie", start: day(-20), end: day(-1), location: "Le 108", category: "Exposition" });
  assert.equal(finished.status, "skipped");
  assert.equal(finished.reason, "Déjà passé");
});

test("séance passée ignorée, séances à venir gardées", async () => {
  const result = await create({
    title: "Plateau stand-up",
    start: `${day(-7)}T20:30`,
    additional_dates: [{ start: `${day(7)}T20:30` }, { start: `${day(14)}T20:30` }],
    location: "Le 108",
    category: "Concert",
  });
  assert.equal(result.occurrences, 2);
  assert.equal(result.start, `${day(7)}T20:30`);
});

test("titre qui annonce un autre jour : rien n'est créé, date à vérifier", async () => {
  const start = day(30);
  const result = await create({ title: `Atelier teinture végétale - dim. ${ddmm(day(31))}`, start: `${start}T14:00`, location: "Le 108", category: "Atelier" });
  assert.equal(result.status, "to_check");
  assert.match(result.reason, /Date à vérifier/);
});

test("date collée au titre : retirée", async () => {
  const start = day(12);
  const result = await create({ title: `Atelier broderie - ${ddmm(start)}`, start: `${start}T14:00`, location: "Le 108", category: "Atelier" });
  assert.equal(result.title, "Atelier broderie");
  assert.notEqual(result.status, "to_check");
});
