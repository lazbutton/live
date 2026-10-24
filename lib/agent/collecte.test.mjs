/*
 * create_event en simulation (rien n'est écrit) sur une base factice : affiche Instagram reprise,
 * exposition déjà ouverte, date douteuse, date retirée du titre, séance passée ignorée ; scan_agenda
 * sur un agenda illisible et événements lus à la main sur la page d'agenda.
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
const { AGENT_TOOLS } = await jiti.import(path.join(root, "lib/agent/tools.ts"));
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
  event_genres: [
    { id: "g-jazz", category_id: "concert", name: "Jazz", phrase: "le jazz", display_order: 2, is_active: true },
    { id: "g-rock", category_id: "concert", name: "Rock", phrase: "le rock", display_order: 1, is_active: true },
    { id: "g-cuisine", category_id: "atelier", name: "Cuisine", phrase: "la cuisine", display_order: 3, is_active: true },
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
    {
      id: "source-fabrika",
      name: "Fabrika Pulsion",
      url: "https://fabrikapulsion.fr/agenda/",
      status: "active",
      organizer_id: "fabrika",
      organizer_location_id: null,
      scan_frequency_days: 14,
    },
  ],
  organizer_agenda_scraping_configs: [],
  events: [],
};

/**
 * Client Supabase factice : chaque table renvoie ses lignes, seules les bornes `gte` / `lte` sont
 * appliquées (« même titre le même jour »), `neq` (les festivals refusés), et un `or` fait seulement
 * d'égalités (`category.eq.…`, `category.ilike.festival` : les festivals) ; toute écriture fait échouer le test.
 */
const supabase = {
  from(table) {
    const filters = [];
    const query = new Proxy(
      {},
      {
        get(_target, property) {
          if (["insert", "update", "upsert", "delete"].includes(property)) throw new Error(`écriture interdite (${table})`);
          if (property === "then") {
            const rows = (TABLES[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
            return (resolve, reject) => Promise.resolve({ data: rows, error: null, count: 0 }).then(resolve, reject);
          }
          if (property === "or") {
            return (expression) => {
              const terms = expression.split(",").map((term) => /^(\w+)\.(eq|ilike)\.(.+)$/.exec(term));
              if (terms.every(Boolean)) {
                filters.push((row) =>
                  terms.some(([, column, operator, value]) =>
                    operator === "eq"
                      ? String(row[column] ?? "") === value
                      : String(row[column] ?? "").toLowerCase() === value.toLowerCase(),
                  ),
                );
              }
              return query;
            };
          }
          if (property === "neq") {
            return (column, value) => {
              filters.push((row) => String(row[column] ?? "") !== String(value));
              return query;
            };
          }
          if (property === "gte" || property === "lte") {
            return (column, value) => {
              filters.push((row) =>
                row[column] == null || (property === "gte" ? String(row[column]) >= value : String(row[column]) <= value),
              );
              return query;
            };
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

test("genre, pour qui, réservation : ce que le texte dit, dans les listes (« lus, à confirmer »)", async () => {
  const start = day(18);
  const read = await create({
    title: "Trio de jazz",
    start: `${start}T20:30`,
    location: "Le 108",
    category: "Concert",
    genres: ["jazz", "Polka", "Cuisine"],
    audience: "all",
    min_age: 6,
    booking: "online",
  });
  assert.deepEqual(read.genres, ["Jazz"]);
  // Hors de la liste de la catégorie : signalés, pas repris.
  assert.deepEqual(read.genres_unmatched, ["Polka", "Cuisine"]);
  assert.equal(read.audience, "Tout public");
  assert.equal(read.min_age, 6);
  assert.equal(read.booking, "Billetterie en ligne");
  // Connue, audience dit le jeune public à sa place (la base le recalcule).
  assert.equal(read.young_audience, undefined);

  const silent = await create({ title: "Jam du jeudi", start: `${start}T21:00`, location: "Le 108", category: "Concert" });
  for (const key of ["genres", "genres_unmatched", "audience", "min_age", "booking"]) assert.equal(silent[key], undefined, key);
});

test("titre en capitales, lieu répété, guillemets : nettoyés à l'import (lib/collecte/event-text.ts)", async () => {
  const start = day(15);
  const concert = await create({ title: "ALCEST + 1ERE PARTIE au 108", start: `${start}T20:30`, location: "Le 108", category: "Concert" });
  assert.equal(concert.title, "Alcest + 1re partie");
  const show = await create({ title: 'Rosa Bursztein dans "Dédoublée"', start: `${start}T18:45`, location: "Le 108", category: "Spectacle" });
  assert.equal(show.title, "Rosa Bursztein dans « Dédoublée »");
});

/* ------------------------------------------------------------------ */
/* Agendas que scan_agenda ne sait pas lire (passage du 18/10/2026)     */
/* ------------------------------------------------------------------ */

const FABRIKA_AGENDA = "https://fabrikapulsion.fr/agenda/";

/** Remplace `fetch` le temps d'un test : chaque adresse connue renvoie sa page, le reste une 404. */
async function withPages(pages, run) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    const html = Object.entries(pages).find(([prefix]) => url.startsWith(prefix))?.[1];
    const response = new Response(html ?? "introuvable", { status: html ? 200 : 404, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("scan_agenda : agenda illisible signalé, rien à importer d'office, page à lire soi-même", async () => {
  const scanAgenda = AGENT_TOOLS.find((tool) => tool.name === "scan_agenda");
  const fabrika = `<html><body><main>
    <h3>2027</h3>
    <h3>28 février</h3><h2>Boulevard du Duel – 20h30</h2><p>Les Fabricoles – La Fabrique Meung-sur-Loire</p>
    <h3>17 juillet</h3><h2>Boulevard du Duel</h2><p>La Bamboche – Olivet</p>
  </main></body></html>`;
  const textOnly = await withPages({ [FABRIKA_AGENDA]: fabrika }, () => scanAgenda.run(context(), { source_id: "source-fabrika" }));
  assert.equal(textOnly.unreadable.reason, "text_only");
  assert.deepEqual(textOnly.to_import, []);
  assert.match(textOnly.unreadable.next_step, /https:\/\/fabrikapulsion\.fr\/agenda\//);
  assert.match(textOnly.unreadable.next_step, /create_event avec source_id et source_url/);

  // Liens qui ne sont pas des événements : listés pour information, mais pas à importer.
  const home = `<html><body><main>
    <h1>Accueil</h1>
    <p><a href="/qui-sommes-nous/">Qui sommes-nous ?</a> <a href="/youtube/">Youtube</a> <a href="/dsc06040-001/">Photo</a></p>
  </main></body></html>`;
  const notEvents = await withPages({ "https://dubluesoswing.fr/": home }, () =>
    scanAgenda.run(context(), { url: "https://dubluesoswing.fr/" }),
  );
  assert.equal(notEvents.unreadable.reason, "not_events");
  assert.ok(notEvents.counts.found > 0);
  assert.deepEqual(notEvents.to_import, []);
});

test("événements lus sur la page d'agenda : le même spectacle à une autre date n'est pas un doublon de la page", async () => {
  TABLES.events.push({
    id: "duel-meung",
    title: "Boulevard du Duel",
    date: `${day(40)}T19:30:00.000Z`,
    scraping_url: FABRIKA_AGENDA,
    external_url: null,
    instagram_url: null,
    facebook_url: null,
  });
  const read = (sourceUrl, start) =>
    createAgentEventFromInput(context(), {
      sourceId: "source-fabrika",
      sourceUrl,
      event: { title: "Boulevard du Duel", start, location: "La Bamboche", category: "Spectacle" },
      createMissingArtists: false,
    });
  try {
    const otherDate = await read(FABRIKA_AGENDA, `${day(60)}T20:30`);
    assert.notEqual(otherDate.status, "duplicate", otherDate.reason);
    // Le même jour, c'est bien le même événement.
    const sameDay = await read(FABRIKA_AGENDA, `${day(40)}T20:30`);
    assert.equal(sameDay.status, "duplicate");
    assert.equal(sameDay.reason, "Même titre le même jour");
    // Page propre à l'événement : même page et même titre suffisent, comme avant.
    TABLES.events[0].scraping_url = "https://fabrikapulsion.fr/boulevard-du-duel/";
    const eventPage = await read("https://fabrikapulsion.fr/boulevard-du-duel/", `${day(60)}T20:30`);
    assert.equal(eventPage.status, "duplicate");
    assert.equal(eventPage.reason, "Page déjà importée");
  } finally {
    TABLES.events.length = 0;
  }
});

test("festival : rattaché au festival qu'il nomme, sans en être pris pour un doublon ; festival absent signalé", async () => {
  TABLES.categories.push({ id: "festival", name: "Festival" });
  // Le festival commence avec sa première soirée, au même lieu, à la même heure, sous un titre proche.
  TABLES.events.push({
    id: "fulgurances",
    title: "Fulgurances Électroniques #2",
    date: `${day(20)}T21:00:00.000Z`,
    end_date: `${day(23)}T04:45:00.000Z`,
    category: "festival",
    location_id: "le-108",
    festival_id: null,
    scraping_url: null,
    external_url: null,
    instagram_url: null,
    facebook_url: null,
  });
  try {
    const micro = await create({
      title: "Fulgurances Électroniques – Micro",
      start: `${day(20)}T21:00`,
      location: "Le 108",
      category: "Concert",
      festival: "Fulgurances Électroniques",
    });
    assert.notEqual(micro.status, "duplicate", micro.reason);
    assert.equal(micro.festival, "Fulgurances Électroniques #2");
    // Par le titre seul, sans nom relevé.
    const ultra = await create({ title: "Fulgurances Électroniques – Ultra", start: `${day(22)}T20:00`, location: "Le 108", category: "Concert" });
    assert.equal(ultra.festival, "Fulgurances Électroniques #2");
    // Un festival qui n'est pas dans l'app : signalé, rien de rattaché.
    const impro = await create({
      title: "Cabaret d'impro",
      start: `${day(25)}T20:30`,
      location: "Le 108",
      category: "Concert",
      festival: "À toutes vapeurs",
    });
    assert.equal(impro.festival, undefined);
    assert.equal(impro.festival_unknown, "À toutes vapeurs");
    // Le festival importé une seconde fois : son doublon.
    const again = await create({ title: "Fulgurances Électroniques #2", start: `${day(20)}T21:00`, location: "Le 108", category: "Festival" });
    assert.equal(again.status, "duplicate");
    // Une séance rangée en Festival, sur un seul jour (les Bouts du Monde en prod) : ni un festival où rattacher
    // les autres films, ni à l'abri des doublons.
    TABLES.events.push({
      id: "bouts-du-monde",
      title: "Festival des Bouts du Monde",
      date: `${day(30)}T20:30:00.000Z`,
      end_date: `${day(30)}T21:50:00.000Z`,
      category: "festival",
      location_id: "le-108",
      festival_id: null,
      scraping_url: null,
      external_url: null,
      instagram_url: null,
      facebook_url: null,
    });
    const film = await create({
      title: "Open Your Wild",
      start: `${day(30)}T18:00`,
      location: "Le 108",
      category: "Concert",
      festival: "Festival des Bouts du Monde",
    });
    assert.equal(film.festival, undefined);
    assert.equal(film.festival_unknown, "Festival des Bouts du Monde");
    const seance = await create({ title: "Festival des Bouts du Monde", start: `${day(30)}T20:30`, location: "Le 108", category: "Concert" });
    assert.equal(seance.status, "duplicate");
    assert.equal(seance.duplicate_of?.id, "bouts-du-monde");
    // Un festival refusé par l'équipe : pas de rattachement, mais toujours son doublon.
    TABLES.events.push({
      id: "refuse",
      title: "Festival Hors Saison",
      date: `${day(50)}T18:00:00.000Z`,
      end_date: `${day(52)}T23:00:00.000Z`,
      category: "festival",
      status: "rejected",
      location_id: "le-108",
      festival_id: null,
      scraping_url: null,
      external_url: null,
      instagram_url: null,
      facebook_url: null,
    });
    const refused = await create({
      title: "Festival Hors Saison",
      start: `${day(50)}T18:00`,
      end: `${day(52)}T23:00`,
      location: "Le 108",
      category: "Festival",
    });
    assert.equal(refused.status, "duplicate");
    assert.equal(refused.duplicate_of?.id, "refuse");
    // Un autre festival : ses lieux, reconnus dans son texte ; ceux sans fiche signalés.
    const other = await create({
      title: "Festival des Bouts du Monde",
      start: `${day(40)}T18:00`,
      end: `${day(41)}T23:00`,
      location: "Le 108",
      category: "Festival",
      festival_venues: ["le 108", "La Passerelle"],
    });
    assert.notEqual(other.status, "duplicate", other.reason);
    assert.deepEqual(other.festival_venues, ["Le 108"]);
    assert.deepEqual(other.festival_venues_unmatched, ["La Passerelle"]);
  } finally {
    TABLES.events.length = 0;
    TABLES.categories.pop();
  }
});
