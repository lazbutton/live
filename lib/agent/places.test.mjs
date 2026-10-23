/*
 * Lieux, salles et organisateurs créés par l'agent (upsert_location, upsert_organizer, `room` de create_event),
 * sur les cas de la relecture du 2026-10-23 : L'Improviste Bar (119 rue de Bourgogne), le Théâtre Gérard-Philipe
 * (rangé jusque-là à « Adresse Secrète »), La Cave Végétale (rue Jean Hupeau), le Musée des Beaux-Arts
 * (« 1 rue Fernand Rabier », sans ville), FabriCode et Atelier Empreinte au 108, Art-Thérapie (sans lien), les
 * salles du Théâtre d'Orléans, du 108, de L'Alliage et de L'Astrolabe.
 * Base factice en mémoire, triggers réduits à ce que l'outil lit en retour (les vrais sont vérifiés par
 * supabase/tests/agent_places.test.sql) ; Base Adresse Nationale servie par ses réponses enregistrées le
 * 2026-10-23 (lib/agent/fixtures/ban-geocodage.json).
 *   node --test lib/agent/places.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { addressQuery, geocodeAddress } = await jiti.import(path.join(root, "lib/agent/geocode.ts"));
const { findOrCreateLocation, findOrCreateRoom, roomCore } = await jiti.import(path.join(root, "lib/agent/locations.ts"));
const { findOrCreateOrganizer } = await jiti.import(path.join(root, "lib/agent/organizers.ts"));
const { isUndisclosedPlace, nameProximity, normalizePlaceLinks } = await jiti.import(path.join(root, "lib/agent/places.ts"));
const { createAgentEventFromInput } = await jiti.import(path.join(root, "lib/agent/events.ts"));
const { AGENT_TOOLS } = await jiti.import(path.join(root, "lib/agent/tools.ts"));
const { fromDatetimeLocal } = await jiti.import(path.join(root, "lib/date-utils.ts"));
const { parisToday } = await jiti.import(path.join(root, "lib/scraping/dates.ts"));

const BAN = JSON.parse(fs.readFileSync(path.join(root, "lib/agent/fixtures/ban-geocodage.json"), "utf8"));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Base Adresse Nationale simulée : les requêtes enregistrées, une erreur 503 si `down`. Renvoie les requêtes reçues. */
function serveBan({ down = false } = {}) {
  const queries = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname !== "data.geopf.fr") throw new Error(`réseau interdit : ${url}`);
    const query = url.searchParams.get("q");
    queries.push(query);
    if (down) return new Response("indisponible", { status: 503 });
    if (!BAN[query]) throw new Error(`requête BAN non enregistrée : ${query}`);
    return Response.json(BAN[query]);
  };
  return queries;
}

const ORLEANS = { id: "orleans", label: "Orléans" };

/** Lieux et salles d'OutLive avant la relecture (extraits ; liens d'exemple). */
const PLACES = {
  locations: [
    {
      id: "le-108",
      name: "Le 108",
      address: "108 Rue de Bourgogne 45000 Orléans",
      latitude: 47.900536,
      longitude: 1.913759,
      city: ORLEANS,
      is_organizer: true,
      website_url: "https://le108.org/",
    },
    {
      id: "theatre",
      name: "Théâtre d'Orléans",
      address: "Boulevard Pierre Ségelle 45000 Orléans",
      latitude: 47.9055,
      longitude: 1.9135,
      city: ORLEANS,
      is_organizer: true,
    },
    { id: "alliage", name: "L'Alliage", address: "1 Rue Michel Roques 45160 Olivet", city: { id: "olivet", label: "Olivet" } },
    { id: "astrolabe", name: "L'Astrolabe", address: "1 Rue Alexandre Avisse 45000 Orléans", city: ORLEANS, is_organizer: true },
    // Lieu sans adresse précise, comme en prod.
    { id: "secret", name: "Adresse Secrète", address: "Orléans", city: ORLEANS, is_organizer: false },
    { id: "mba", name: "Musée des Beaux-Arts", address: "Orléans", city: ORLEANS },
    { id: "fetes-ingre", name: "Salle des fêtes", address: "Rue de la Mairie 45140 Ingré", city: { id: "ingre", label: "Ingré" } },
  ],
  rooms: [
    { id: "touchard", name: "Salle Touchard", location_id: "theatre" },
    { id: "barrault", name: "Salle Barrault", location_id: "theatre" },
    { id: "vitez", name: "Salle Vitez", location_id: "theatre" },
  ],
  organizers: [
    {
      id: "fabricode",
      name: "FabriCode",
      website_url: "https://fabricode.art/",
      instagram_url: null,
      facebook_url: null,
    },
    {
      id: "zigotastiques",
      name: "Les Zigotastiques",
      website_url: null,
      instagram_url: "https://www.instagram.com/zigotastiques_exemple/",
      facebook_url: null,
    },
  ],
  artists: [],
  tags: [],
  categories: ["Concert", "Spectacle", "Atelier", "Danse"].map((name) => ({ id: name.toLowerCase(), name, is_active: true })),
  intake_sources_view: [],
  organizer_agenda_scraping_configs: [],
  event_sources: [],
  events: [],
  admin_audit_log: [],
};

const comparable = (value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : value);

/**
 * Base factice en mémoire : lectures filtrées (eq, neq, is, in, gte, lte ; select, or et order ignorés), insertions
 * et mises à jour notées dans `writes`. Triggers simulés : ville tirée du code postal de l'adresse
 * (sync_location_city), source active et à revoir pour un organisateur ou un lieu-organisateur qui a un lien.
 */
function fakeBase(tables = PLACES) {
  const db = structuredClone(tables);
  const writes = [];
  let counter = 0;
  const value = (row, column) => (column in row ? row[column] : null);
  const afterInsert = (table, row) => {
    if (table === "locations") {
      const label = /\b\d{5}\s+(.+)$/.exec(row.address || "")?.[1];
      row.city = label ? { id: label.toLowerCase(), label } : null;
    }
    const url = row.website_url || row.instagram_url || row.facebook_url;
    if (url && (table === "organizers" || (table === "locations" && row.is_organizer))) {
      db.event_sources.push({
        id: `source-${row.id}`,
        url,
        status: "active",
        notes: null,
        organizer_id: table === "organizers" ? row.id : null,
        organizer_location_id: table === "locations" ? row.id : null,
      });
    }
  };
  const supabase = {
    from(table) {
      const filters = [];
      let mode = "select";
      let payload = null;
      let single = false;
      let maybe = false;
      const run = () => {
        const rows = (db[table] ??= []);
        if (mode === "insert") {
          const inserted = payload.map((values) => ({ id: `${table}-${++counter}`, ...values }));
          // Lignes telles qu'envoyées, avant les triggers.
          writes.push({ table, method: "insert", rows: structuredClone(inserted) });
          for (const row of inserted) {
            rows.push(row);
            afterInsert(table, row);
          }
          return { data: single ? inserted[0] : inserted, error: null };
        }
        const matched = rows.filter((row) => filters.every((keep) => keep(row)));
        if (mode === "update") {
          for (const row of matched) Object.assign(row, payload);
          writes.push({ table, method: "update", values: payload, ids: matched.map((row) => row.id) });
          return { data: null, error: null };
        }
        if (single) return { data: matched[0] ?? null, error: matched.length || maybe ? null : { message: "Aucune ligne" } };
        return { data: matched, error: null, count: matched.length };
      };
      const filter = (keep) => (filters.push(keep), query);
      const query = {
        select: () => query,
        eq: (column, expected) => filter((row) => value(row, column) === expected),
        neq: (column, expected) => filter((row) => value(row, column) !== expected),
        is: (column, expected) => filter((row) => value(row, column) === expected),
        in: (column, list) => filter((row) => list.includes(value(row, column))),
        gte: (column, bound) => filter((row) => value(row, column) !== null && comparable(value(row, column)) >= comparable(bound)),
        lte: (column, bound) => filter((row) => value(row, column) !== null && comparable(value(row, column)) <= comparable(bound)),
        or: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        insert: (values) => ((mode = "insert"), (payload = Array.isArray(values) ? values : [values]), query),
        update: (values) => ((mode = "update"), (payload = values), query),
        upsert: () => {
          throw new Error(`upsert non prévu (${table})`);
        },
        delete: () => {
          throw new Error(`suppression interdite (${table})`);
        },
        single: () => ((single = true), query),
        maybeSingle: () => ((single = true), (maybe = true), query),
        then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
      };
      return query;
    },
    storage: {
      from() {
        throw new Error("stockage interdit");
      },
    },
  };
  return { db, writes, ctx: ({ dryRun = false } = {}) => ({ supabase, dryRun }) };
}

const inserts = (writes, table) => writes.filter((write) => write.method === "insert" && write.table === table);

/* ------------------------------------------------------------------ */
/* Base Adresse Nationale                                              */
/* ------------------------------------------------------------------ */

test("BAN : adresse retrouvée sans le nom du lieu en tête, libellé et coordonnées repris", async () => {
  assert.equal(addressQuery("L'Improviste Bar, 119 rue de Bourgogne, 45000 Orléans"), "119 rue de Bourgogne, 45000 Orléans");
  assert.equal(addressQuery("Théâtre Gérard-Philipe, place Sainte-Beuve, 45100 Orléans"), "place Sainte-Beuve, 45100 Orléans");
  assert.equal(addressQuery("La Cave Végétale, rue Jean Hupeau, 45000 Orléans"), "rue Jean Hupeau, 45000 Orléans");
  assert.equal(addressQuery("4 rue du Colombier, St Jean de Braye"), "4 rue du Colombier, Saint Jean de Braye");

  serveBan();
  const improviste = await geocodeAddress("L'Improviste Bar, 119 rue de Bourgogne, 45000 Orléans");
  assert.equal(improviste.ok, true, improviste.reason);
  assert.deepEqual(
    { ...improviste.address, score: undefined },
    {
      label: "119 Rue de Bourgogne 45000 Orléans",
      latitude: 47.900413,
      longitude: 1.913223,
      housenumber: "119",
      street: "Rue de Bourgogne",
      postcode: "45000",
      city: "Orléans",
      type: "housenumber",
      score: undefined,
    },
  );
  // Une voie sans numéro suffit (La Cave Végétale) ; écrite « 45000 », la place Sainte-Beuve est au 45100.
  assert.equal((await geocodeAddress("rue Jean Hupeau, 45000 Orléans")).address.type, "street");
  assert.equal((await geocodeAddress("place Sainte-Beuve, 45100 Orléans")).address.label, "Place Sainte-Beuve 45100 Orléans");
});

test("BAN : une ville seule, une adresse sans ville ou incertaine ne donnent pas de lieu", async () => {
  serveBan();
  const reason = async (address) => {
    const result = await geocodeAddress(address);
    assert.equal(result.ok, false, `${address} : ${result.address?.label}`);
    return result.reason;
  };
  assert.match(await reason("Orléans"), /une ville/);
  assert.match(await reason("Centre-ville, Orléans"), /une ville/);
  assert.match(await reason("Salle des fêtes, Saran"), /une ville/);
  // Le Musée des Beaux-Arts annoncé « 1 rue Fernand Rabier » : la BAN propose Orléans, mais rien ne le dit.
  assert.match(await reason("1 rue Fernand Rabier"), /ajoute le code postal et la ville/);
  // Voie inconnue : la BAN propose une autre allée d'Olivet (score 0,53).
  assert.match(await reason("Allée Pierre Chevallier, 45160 Olivet"), /incertaine.*Allée Pierre de Ronsard/);

  serveBan({ down: true });
  await assert.rejects(geocodeAddress("119 rue de Bourgogne, 45000 Orléans"), /Base Adresse Nationale injoignable/);
});

/* ------------------------------------------------------------------ */
/* Lieux                                                               */
/* ------------------------------------------------------------------ */

test("upsert_location : L'Improviste Bar créé avec l'adresse et la position de la BAN", async () => {
  serveBan();
  const base = fakeBase();
  const result = await findOrCreateLocation(base.ctx(), {
    name: "L'Improviste Bar",
    address: "119 rue de Bourgogne, 45000 Orléans",
    instagram_url: "@improviste_exemple",
  });
  assert.equal(result.status, "created", result.reason);
  assert.equal(result.address, "119 Rue de Bourgogne 45000 Orléans");
  assert.equal(result.city, "Orléans");
  assert.equal(result.source, undefined);

  const [{ rows }] = inserts(base.writes, "locations");
  assert.deepEqual(rows[0], {
    id: result.id,
    name: "L'Improviste Bar",
    address: "119 Rue de Bourgogne 45000 Orléans",
    latitude: 47.900413,
    longitude: 1.913223,
    website_url: null,
    instagram_url: "https://www.instagram.com/improviste_exemple/",
    facebook_url: null,
    short_description: null,
    capacity: null,
    is_organizer: false,
  });
  // Pas lieu-organisateur : pas de source de collecte.
  assert.deepEqual(base.db.event_sources, []);
  const [log] = inserts(base.writes, "admin_audit_log")[0].rows;
  assert.equal(log.action, "location.create");
  assert.equal(log.entity_label, "L'Improviste Bar");

  // Rappelé : la fiche existe, rien de plus n'est créé.
  const again = await findOrCreateLocation(base.ctx(), { name: "L’improviste bar", address: "119 rue de Bourgogne, 45000 Orléans" });
  assert.equal(again.status, "exists");
  assert.equal(again.id, result.id);
  assert.equal(inserts(base.writes, "locations").length, 1);
});

test("upsert_location : jamais « Adresse Secrète » ; le Théâtre Gérard-Philipe créé place Sainte-Beuve", async () => {
  const queries = serveBan();
  const base = fakeBase();
  for (const [name, address] of [
    ["Adresse Secrète", "Orléans"],
    ["Match d'impro", "Lieu communiqué après réservation"],
    ["Soirée surprise", "Adresse secrète (Orléans)"],
    ["En ligne", "Zoom"],
  ]) {
    const refused = await findOrCreateLocation(base.ctx(), { name, address });
    assert.equal(refused.status, "refused", name);
    assert.match(refused.reason, /Adresse secrète/);
  }
  assert.deepEqual(queries, [], "aucune adresse tue n'est envoyée à la BAN");

  const theatre = await findOrCreateLocation(base.ctx(), {
    name: "Théâtre Gérard-Philipe",
    address: "Théâtre Gérard-Philipe, place Sainte-Beuve, 45100 Orléans",
  });
  assert.equal(theatre.status, "created", theatre.reason);
  // Le code postal dans l'adresse donne la ville (jamais « place sainte beuve orleans »).
  assert.equal(theatre.address, "Place Sainte-Beuve 45100 Orléans");
  assert.equal(theatre.city, "Orléans");
  assert.deepEqual(queries, ["place Sainte-Beuve, 45100 Orléans"]);
});

test("upsert_location : adresse absente, vague ou sans ville, nom de ville : refusé, rien n'est créé", async () => {
  serveBan();
  const base = fakeBase();
  const refused = async (input, pattern) => {
    const result = await findOrCreateLocation(base.ctx(), input);
    assert.equal(result.status, "refused", `${input.name} : ${result.matched_by}`);
    assert.match(result.reason, pattern);
  };
  await refused({ name: "La Cave Végétale" }, /Adresse manquante/);
  await refused({ name: "La Cave Végétale", address: "Orléans" }, /une ville/);
  await refused({ name: "Musée des Beaux-Arts d'Orléans", address: "1 rue Fernand Rabier" }, /code postal et la ville/);
  await refused({ name: "Saran", address: "Place de la Liberté, 45770 Saran" }, /nom de la ville/);
  assert.deepEqual(inserts(base.writes, "locations"), []);

  // BAN injoignable : rien n'est créé, une fiche existante reste retrouvée.
  serveBan({ down: true });
  await refused({ name: "La Cave Végétale", address: "rue Jean Hupeau, 45000 Orléans" }, /injoignable/);
  const known = await findOrCreateLocation(base.ctx(), { name: "Le 108", address: "108 rue de Bourgogne, 45000 Orléans" });
  assert.equal(known.status, "exists");
  // … mais pas celle d'une autre ville que celle écrite (la salle des fêtes d'Ingré n'est pas celle de Saran).
  await refused({ name: "Salle des fêtes", address: "Place de la Liberté, 45770 Saran" }, /injoignable/);
});

test("upsert_location : doublons écartés (même nom, même adresse, nom proche, salle connue, nom composé)", async () => {
  serveBan();
  const base = fakeBase();
  const exists = async (input) => {
    const result = await findOrCreateLocation(base.ctx(), input);
    assert.equal(result.status, "exists", `${input.name} : ${result.reason}`);
    return result;
  };

  // Même nom, écrit autrement (article, tiret, accents, casse).
  assert.equal((await exists({ name: "THEATRE D'ORLEANS" })).id, "theatre");
  // Atelier Empreinte, au 108 : même adresse que Le 108.
  const empreinte = await exists({ name: "Atelier Empreinte", address: "108 rue de Bourgogne, 45000 Orléans" });
  assert.equal(empreinte.id, "le-108");
  assert.match(empreinte.matched_by, /même adresse/);
  // Nom proche dans la même ville.
  const mba = await exists({ name: "Musée des Beaux-Arts d'Orléans", address: "1 rue Fernand Rabier, 45000 Orléans" });
  assert.equal(mba.id, "mba");
  assert.equal(mba.matched_by, "nom proche");
  // Une salle n'est pas un lieu : « Salle Vitez » est au Théâtre d'Orléans, « salle C14 » au 108.
  assert.deepEqual(
    { id: (await exists({ name: "Salle Vitez", address: "Boulevard Pierre Ségelle, 45000 Orléans" })).id, room: "Salle Vitez" },
    { id: "theatre", room: "Salle Vitez" },
  );
  const c14 = await exists({ name: "Le 108 – salle C14" });
  assert.deepEqual([c14.id, c14.room], ["le-108", "Salle C14"]);

  assert.deepEqual(inserts(base.writes, "locations"), []);
});

test("upsert_location : un homonyme dans une autre ville, un nom proche à un autre numéro ne sont pas des doublons", async () => {
  serveBan();
  const base = fakeBase();
  const result = await findOrCreateLocation(base.ctx(), { name: "Salle des fêtes", address: "Place de la Liberté, 45770 Saran" });
  assert.equal(result.status, "created", result.reason);
  assert.equal(result.city, "Saran");
  assert.deepEqual(result.homonyms, [{ id: "fetes-ingre", name: "Salle des fêtes", city: "Ingré" }]);

  // Voisin imaginaire au nom proche : à un autre numéro de la rue, c'est un autre lieu ; sans numéro connu, un doublon.
  const neighbour = { id: "voisin", name: "L'Improviste", address: "7 Rue de Bourgogne 45000 Orléans", city: ORLEANS };
  const create = (address) =>
    findOrCreateLocation(fakeBase({ ...PLACES, locations: [...PLACES.locations, { ...neighbour, address }] }).ctx(), {
      name: "L'Improviste Bar",
      address: "119 rue de Bourgogne, 45000 Orléans",
    });
  assert.equal((await create(neighbour.address)).status, "created");
  const same = await create("Rue de Bourgogne 45000 Orléans");
  assert.deepEqual([same.status, same.id, same.matched_by], ["exists", "voisin", "nom proche"]);
});

test("upsert_location : la source d'un lieu-organisateur créé reste en pause, sauf follow", async () => {
  serveBan();
  const base = fakeBase();
  const cave = await findOrCreateLocation(base.ctx(), {
    name: "La Cave Végétale",
    address: "La Cave Végétale, rue Jean Hupeau, 45000 Orléans",
    instagram_url: "https://www.instagram.com/cave_vegetale_exemple/?igsh=abc",
    is_organizer: true,
  });
  assert.equal(cave.status, "created", cave.reason);
  assert.deepEqual(cave.source, { id: `source-${cave.id}`, url: "https://www.instagram.com/cave_vegetale_exemple/", status: "paused" });
  const [source] = base.db.event_sources;
  assert.equal(source.status, "paused");
  assert.match(source.notes, /\[agent\] Fiche créée par la collecte/);

  const followed = await findOrCreateLocation(base.ctx(), {
    name: "Les Frangins",
    address: "14 rue du Grenier à Sel, 45000 Orléans",
    website_url: "https://lesfrangins.example/",
    is_organizer: true,
    follow: true,
  });
  assert.equal(followed.source.status, "active");
});

test("upsert_location en simulation : rien n'est écrit", async () => {
  serveBan();
  const base = fakeBase();
  const result = await findOrCreateLocation(base.ctx({ dryRun: true }), {
    name: "L'Improviste Bar",
    address: "119 rue de Bourgogne, 45000 Orléans",
  });
  assert.deepEqual([result.status, result.id, result.address, result.dry_run], ["created", null, "119 Rue de Bourgogne 45000 Orléans", true]);
  assert.deepEqual(base.writes, []);
});

/* ------------------------------------------------------------------ */
/* Organisateurs                                                       */
/* ------------------------------------------------------------------ */

test("liens publics : rangés à leur place, publications et pages d'événement écartées", () => {
  assert.deepEqual(
    normalizePlaceLinks({
      website_url: "https://www.instagram.com/orlins.exemple/",
      facebook_url: "facebook.com/zigotastiques.exemple?ref=bookmarks",
    }).links,
    {
      website_url: null,
      instagram_url: "https://www.instagram.com/orlins.exemple/",
      facebook_url: "https://www.facebook.com/zigotastiques.exemple/",
    },
  );
  assert.deepEqual(normalizePlaceLinks({ instagram_url: "orlins.exemple" }).links.instagram_url, "https://www.instagram.com/orlins.exemple/");
  const { links, invalid } = normalizePlaceLinks({
    instagram_url: "https://www.instagram.com/p/DPq9tKwjXyz/",
    facebook_url: "https://www.facebook.com/events/969703442080560/",
    website_url: "https://fabricode.art/?utm_source=ig#stages",
  });
  assert.deepEqual(links, { website_url: "https://fabricode.art/", instagram_url: null, facebook_url: null });
  assert.equal(invalid.length, 2);
});

test("upsert_organizer : créé avec son lien, source en pause ; sans lien, refusé (Art-Thérapie)", async () => {
  const base = fakeBase({ ...PLACES, organizers: [] });
  const fabricode = await findOrCreateOrganizer(base.ctx(), { name: "FabriCode", website_url: "https://fabricode.art/" });
  assert.equal(fabricode.status, "created", fabricode.reason);
  assert.deepEqual(fabricode.links, { website_url: "https://fabricode.art/", instagram_url: null, facebook_url: null });
  assert.equal(fabricode.source.status, "paused");
  assert.equal(base.db.event_sources[0].status, "paused");
  const [log] = inserts(base.writes, "admin_audit_log")[0].rows;
  assert.deepEqual([log.action, log.entity_label, log.metadata.source_status], ["organizer.create", "FabriCode", "paused"]);

  const therapy = await findOrCreateOrganizer(base.ctx(), { name: "Art-Thérapie (Cécile Caillibotte)" });
  assert.equal(therapy.status, "refused");
  assert.match(therapy.reason, /Lien manquant/);
  assert.equal(inserts(base.writes, "organizers").length, 1);
});

test("upsert_organizer : doublons écartés (même lien, même nom, lieu qui organise), homonyme aux liens distincts créé", async () => {
  const base = fakeBase({
    ...PLACES,
    locations: [
      ...PLACES.locations,
      { id: "improviste", name: "L'Improviste Bar", address: "119 Rue de Bourgogne 45000 Orléans", city: ORLEANS, is_organizer: false },
    ],
  });
  const exists = async (input) => {
    const result = await findOrCreateOrganizer(base.ctx(), input);
    assert.equal(result.status, "exists", `${input.name} : ${result.reason}`);
    return result;
  };
  // Même site, autre nom ; même compte Instagram, autre nom.
  assert.deepEqual(
    (({ id, matched_by }) => ({ id, matched_by }))(await exists({ name: "Fabri Code", website_url: "fabricode.art/stages" })),
    { id: "fabricode", matched_by: "même site" },
  );
  assert.equal((await exists({ name: "Zigo", instagram_url: "@zigotastiques_exemple" })).matched_by, "même compte Instagram");
  // Même nom sans lien ; nom proche.
  assert.equal((await exists({ name: "Fabricode" })).id, "fabricode");
  assert.equal((await exists({ name: "Zigotastiques" })).id, "zigotastiques");
  // Le bar organise lui-même : c'est un lieu, pas un organisateur.
  const bar = await exists({ name: "L'improviste bar" });
  assert.deepEqual([bar.id, bar.type], ["improviste", "location"]);
  assert.match(bar.reason, /C'est un lieu/);
  // Nom proche mais liens tous différents : deux structures.
  const other = await findOrCreateOrganizer(base.ctx(), { name: "Zigotastiques Kids", instagram_url: "@zigokids_exemple" });
  assert.equal(other.status, "created", other.reason);
});

/* ------------------------------------------------------------------ */
/* Salles                                                              */
/* ------------------------------------------------------------------ */

/** Jour à `offset` jours d'aujourd'hui (heure de Paris), au format AAAA-MM-JJ. */
function day(offset) {
  const date = new Date(`${parisToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

const createEvent = (base, event) =>
  createAgentEventFromInput(base.ctx({ dryRun: true }), { event: { category: "Spectacle", ...event }, createMissingArtists: false });

test("salles : celle annoncée avec le lieu est rattachée, celle qui manque est créée (Théâtre d'Orléans, 108, Alliage, Astrolabe)", async () => {
  const base = fakeBase();
  const start = `${day(30)}T20:30`;
  const room = async (event) => {
    const result = await createEvent(base, { start, ...event });
    assert.notEqual(result.status, "duplicate", result.reason);
    return [result.location, result.room, result.room_created ?? false];
  };
  assert.deepEqual(await room({ title: "Le Pas du Monde", location: "Théâtre d'Orléans - Salle Touchard" }), [
    "Théâtre d'Orléans",
    "Salle Touchard",
    false,
  ]);
  // Demandée : retrouvée sans « salle », créée sinon ; « Plateau Barrault » n'est pas « Salle Barrault ».
  assert.deepEqual(await room({ title: "Fora", location: "Théâtre d'Orléans", room: "Vitez" }), ["Théâtre d'Orléans", "Salle Vitez", false]);
  assert.deepEqual(await room({ title: "Loto3000", location: "Théâtre d'Orléans", room: "Plateau Barrault" }), [
    "Théâtre d'Orléans",
    "Plateau Barrault",
    true,
  ]);
  // Annoncées avec le lieu : salle C14 du 108, salle Yvremont de L'Alliage, Grande salle de L'Astrolabe.
  assert.deepEqual(await room({ title: "Crée ton jeu vidéo", location: "Le 108 – salle C14" }), ["Le 108", "Salle C14", true]);
  assert.deepEqual(await room({ title: "Cabaret d'impro", location: "L'Alliage (salle Yvremont)" }), ["L'Alliage", "Salle Yvremont", true]);
  assert.deepEqual(await room({ title: "Johnny Jane", location: "L'Astrolabe – Grande salle", category: "Concert" }), [
    "L'Astrolabe",
    "Grande salle",
    true,
  ]);
  // Sans salle annoncée, ou un morceau qui n'en est pas une (ville).
  assert.deepEqual(await room({ title: "Brad Mehldau", location: "Théâtre d'Orléans" }), ["Théâtre d'Orléans", undefined, false]);
  assert.deepEqual(await room({ title: "Kid Francescoli", location: "L'Astrolabe, Orléans", category: "Concert" }), [
    "L'Astrolabe",
    undefined,
    false,
  ]);
  // Salle sans lieu connu : ignorée.
  const lost = await createEvent(base, { title: "Soirée", start, location: "Lieu inconnu", room: "Salle 2" });
  assert.equal(lost.room_unmatched, "Salle 2");
  assert.equal(lost.room, undefined);
  assert.equal(roomCore("La salle Pierre-Aimé Touchard"), "pierre aime touchard");
});

test("salles : la salle est créée une fois et rattachée à la séance (hors simulation)", async () => {
  const base = fakeBase();
  const result = await createAgentEventFromInput(base.ctx(), {
    event: { title: "Cabaret d'impro", start: `${day(20)}T19:00`, location: "L'Alliage (salle Yvremont)", category: "Spectacle" },
    createMissingArtists: false,
  });
  assert.equal(result.room_created, true);
  const [room] = inserts(base.writes, "rooms")[0].rows;
  assert.deepEqual([room.location_id, room.name], ["alliage", "Salle Yvremont"]);
  assert.equal(inserts(base.writes, "events")[0].rows[0].room_id, room.id);
  assert.ok(inserts(base.writes, "admin_audit_log").some(({ rows }) => rows[0].action === "room.create"));

  const again = await createAgentEventFromInput(base.ctx(), {
    event: { title: "Loto 3000", start: `${day(40)}T20:00`, location: "L'Alliage – Salle Yvremont", category: "Spectacle" },
    createMissingArtists: false,
  });
  assert.deepEqual([again.room, again.room_created], ["Salle Yvremont", undefined]);
  assert.equal(inserts(base.writes, "rooms").length, 1);

  // Deux pages lues en même temps par import_urls (trois à la fois) : la même salle n'est créée qu'une fois.
  const ctx = base.ctx();
  const theatre = { id: "theatre", name: "Théâtre d'Orléans" };
  const [first, second] = await Promise.all([
    findOrCreateRoom(ctx, theatre, "Plateau Barrault"),
    findOrCreateRoom(ctx, theatre, "plateau Barrault"),
  ]);
  assert.deepEqual([first.created, second.created, first.id === second.id], [true, false, true]);
  assert.equal(inserts(base.writes, "rooms").length, 2);
});

test("doublons : deux spectacles à la même heure dans deux salles du Théâtre d'Orléans n'en sont pas", async () => {
  // Le 13/05/2027 à 20 h 30 : « Magnificat + Le Sacre du printemps » salle Touchard, « Faire la Marguerite » plateau Vitez.
  const date = day(60);
  const base = fakeBase({
    ...PLACES,
    events: [
      {
        id: "magnificat",
        title: "Magnificat + Le Sacre du printemps",
        date: fromDatetimeLocal(`${date}T20:30`),
        end_date: null,
        location_id: "theatre",
        room_id: "touchard",
        archived: false,
        status: "approved",
      },
    ],
  });
  const marguerite = await createEvent(base, {
    title: "Faire la Marguerite",
    start: `${date}T20:30`,
    location: "Théâtre d'Orléans",
    room: "Plateau Vitez",
  });
  assert.notEqual(marguerite.status, "duplicate", marguerite.reason);
  assert.equal(marguerite.room, "Plateau Vitez");
  // Même salle, ou salle inconnue : le même créneau au même lieu reste un doublon.
  for (const room of ["Salle Touchard", undefined]) {
    const same = await createEvent(base, { title: "Autre soirée", start: `${date}T20:30`, location: "Théâtre d'Orléans", room });
    assert.equal(same.status, "duplicate", room);
    assert.equal(same.reason, "Même lieu, même horaire");
  }
});

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

test("outils : upsert_location et upsert_organizer exposés ; salle et lieu imposé dans create_event et import_urls", async () => {
  const tool = (name) => AGENT_TOOLS.find((entry) => entry.name === name);
  assert.ok(tool("upsert_location") && tool("upsert_organizer"));
  assert.equal(tool("upsert_location").input.safeParse({ name: "L'Improviste Bar" }).data.follow, false);
  assert.ok(tool("create_event").input.safeParse({ title: "Fora", start: "2026-10-23T19:30", room: "Salle Vitez" }).data.room);
  assert.equal(tool("import_urls").input.safeParse({ urls: ["https://exemple.fr/e"], location_id: "x", room: "Salle 1" }).success, true);

  const base = fakeBase();
  const theatre = await tool("search").run(base.ctx(), { type: "location", query: "theatre d'orleans", limit: 5 });
  assert.deepEqual(theatre.results[0].rooms, ["Salle Touchard", "Salle Barrault", "Salle Vitez"]);
  await assert.rejects(
    tool("import_urls").run(base.ctx({ dryRun: true }), { urls: ["https://exemple.fr/e"], location_id: "inconnu" }),
    /Lieu introuvable/,
  );
});

test("recent_activity : lieux, salles et organisateurs créés, avec l'état de leur source", async () => {
  const now = new Date().toISOString();
  const row = (action, entity_label, metadata) => ({ action, entity_id: `${action}-id`, entity_label, metadata, created_at: now, actor_email: "Agent Claude" });
  const base = fakeBase({
    ...PLACES,
    admin_audit_log: [
      row("location.create", "L'Improviste Bar", { address: "119 Rue de Bourgogne 45000 Orléans", source_status: null }),
      row("room.create", "Plateau Barrault", { location: "Théâtre d'Orléans" }),
      row("organizer.create", "FabriCode", { source_status: "paused" }),
    ],
  });
  const activity = await AGENT_TOOLS.find((entry) => entry.name === "recent_activity").run(base.ctx(), { hours: 3 });
  assert.deepEqual(activity.locations_created, [
    { id: "location.create-id", name: "L'Improviste Bar", address: "119 Rue de Bourgogne 45000 Orléans", source: undefined },
  ]);
  assert.deepEqual(activity.rooms_created, [{ id: "room.create-id", name: "Plateau Barrault", location: "Théâtre d'Orléans" }]);
  assert.deepEqual(activity.organizers_created, [{ id: "organizer.create-id", name: "FabriCode", source: "paused" }]);
  assert.equal(activity.sources_path, "/admin/intake");
});

test("noms : lieux tus, noms proches", () => {
  for (const value of ["Adresse Secrète", "Adresse secrète (Orléans)", "Lieu tenu secret", "Lieu à confirmer", "Lieu communiqué aux inscrits", "En ligne"]) {
    assert.equal(isUndisclosedPlace(value), true, value);
  }
  for (const value of ["Le Secret", "La Cave Végétale", "Théâtre Gérard-Philipe"]) assert.equal(isUndisclosedPlace(value), false, value);

  assert.equal(nameProximity("Théâtre Gérard Philipe", "Théâtre Gérard-Philipe"), "same");
  assert.equal(nameProximity("Orlin's Comedy", "Orlins Comedy"), "same");
  assert.equal(nameProximity("L'Improviste", "L'Improviste Bar"), "close");
  // Lieu d'On sort ! et fiche de la Socoop.
  assert.equal(nameProximity("La Passerelle", "Centre culturel La Passerelle"), "close");
  assert.equal(nameProximity("Orlin's Comedy", "Orlins Comedy Club"), "close");
  assert.equal(nameProximity("L'Improvist Bar", "L'Improviste Bar"), "close");
  assert.equal(nameProximity("La Cave", "La Cave Végétale"), null);
  assert.equal(nameProximity("Le Bar", "Le Bar du Coin"), null);
  assert.equal(nameProximity("Salle Barrault", "Plateau Barrault"), null);
});
