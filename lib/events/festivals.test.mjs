/*
 * Festivals (lib/events/festivals.ts) : catégorie, nom reconnu dans un texte, dates couvertes, alertes et
 * suggestions du programme, rattachement à l'import (lib/events/import-prefill.ts). Les règles en base
 * (rattachement, lieux, zone) : supabase/tests/festivals.test.sql.
 *   node --test lib/events/festivals.test.mjs
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
const festivals = await jiti.import(path.join(root, "lib/events/festivals.ts"));

const categories = [
  { id: "ef10b471-b9d8-4db2-9f02-c49717233d82", name: "Festival" },
  { id: "c0000000-0000-4000-8000-000000000001", name: "Concert" },
];

// Fulgurances Électroniques #2, comme en prod : du jeudi 19 novembre 21:00 au dimanche 22, 04:45.
const fulgurances = {
  id: "5ea7aee5-1173-47e8-b20c-f1b09b22f4ff",
  title: "Fulgurances Électroniques #2",
  date: "2026-11-19T21:00:00+00:00",
  end_date: "2026-11-22T04:45:00+00:00",
};

test("catégorie Festival : par son id ou par son nom", () => {
  assert.equal(festivals.isFestivalCategory("ef10b471-b9d8-4db2-9f02-c49717233d82", categories), true);
  assert.equal(festivals.isFestivalCategory("Festival", categories), true);
  assert.equal(festivals.isFestivalCategory(" FESTIVAL ", []), true);
  assert.equal(festivals.isFestivalCategory("c0000000-0000-4000-8000-000000000001", categories), false);
  assert.equal(festivals.isFestivalCategory("Festival de cinéma", categories), false);
  assert.equal(festivals.isFestivalCategory("", categories), false);
  assert.equal(festivals.festivalCategoryId(categories), "ef10b471-b9d8-4db2-9f02-c49717233d82");
  assert.equal(festivals.festivalCategoryId([]), null);
});

test("texte normalisé comme app_search_normalize", () => {
  assert.equal(festivals.normalizeFestivalText("Fulgurances Électroniques – Micro"), "fulgurances electroniques micro");
  assert.equal(festivals.normalizeFestivalText("Théâtre d’Orléans"), "theatre d orleans");
  assert.equal(festivals.normalizeFestivalText("Œuvres  CHŒUR !"), "oeuvres choeur");
  assert.equal(festivals.normalizeFestivalText(null), "");
});

test("nom d'un festival : sans « festival », numéro d'édition ni article en tête", () => {
  assert.equal(festivals.festivalNameKey("Fulgurances Électroniques #2"), "fulgurances electroniques");
  assert.equal(festivals.festivalNameKey("Festival des Bouts du Monde"), "bouts du monde");
  assert.equal(festivals.festivalNameKey("3e édition du Festival des Bouts du Monde"), "bouts du monde");
  assert.equal(festivals.festivalNameKey("Les Musicales d'Automne 2026"), "musicales d automne");
  assert.equal(festivals.festivalNameKey("Festival À toutes vapeurs – 2ème édition"), "a toutes vapeurs");
  assert.equal(festivals.festivalNameKey("Festival 2026"), "");
});

test("un texte nomme le festival : ses mots, entiers et dans l'ordre", () => {
  const key = festivals.festivalNameKey(fulgurances.title);
  assert.equal(festivals.textNamesFestival("Fulgurances Électroniques – Micro", key), true);
  assert.equal(festivals.textNamesFestival("Dans le cadre de FULGURANCES ÉLECTRONIQUES, soirée Infra.", key), true);
  assert.equal(festivals.textNamesFestival("Fulgurances", key), false);
  assert.equal(festivals.textNamesFestival("Électroniques fulgurances", key), false);
  assert.equal(festivals.textNamesFestival("Fulgurances électroniquesss", key), false);
  // « Festival de Cannes » dans le texte d'un film ne nomme pas les Bouts du Monde ; un nom trop court, rien.
  assert.equal(festivals.textNamesFestival("Primé au Festival de Cannes", "bouts du monde"), false);
  assert.equal(festivals.textNamesFestival("Le festival du MO", festivals.festivalNameKey("Festival du MO")), false);
});

test("dates couvertes : du premier jour à 0 h jusqu'à la fin", () => {
  assert.equal(festivals.festivalCovers(fulgurances, "2026-11-19T18:00"), true);
  assert.equal(festivals.festivalCovers(fulgurances, "2026-11-19T00:00:00+00:00"), true);
  assert.equal(festivals.festivalCovers(fulgurances, "2026-11-22T02:00:00+00:00"), true);
  assert.equal(festivals.festivalCovers(fulgurances, "2026-11-22T04:45"), true);
  assert.equal(festivals.festivalCovers(fulgurances, "2026-11-22T05:00"), false);
  assert.equal(festivals.festivalCovers(fulgurances, "2026-11-18T23:59"), false);
  // Sans fin : son premier jour.
  const unJour = { date: "2026-11-13T20:00:00+00:00", end_date: null };
  assert.equal(festivals.festivalCovers(unJour, "2026-11-13T10:00"), true);
  assert.equal(festivals.festivalCovers(unJour, "2026-11-14T10:00"), false);
  assert.equal(festivals.festivalCovers(unJour, ""), false);
});

test("jours affichés : une nuit avant 6 h compte pour la veille", () => {
  const now = new Date(2026, 9, 23);
  assert.equal(festivals.formatFestivalDates(fulgurances, now), "19 – 21 nov.");
  assert.equal(festivals.formatFestivalDates({ date: "2026-10-30T20:00", end_date: "2026-11-02T18:00" }, now), "30 oct. – 2 nov.");
  assert.equal(festivals.formatFestivalDates({ date: "2026-11-13T20:00", end_date: null }, now), "13 nov.");
  assert.equal(festivals.formatFestivalDates({ date: "2026-11-13T20:00", end_date: "2026-11-14T02:00" }, now), "13 nov.");
  assert.equal(festivals.formatFestivalDates({ date: "2027-01-13T20:00", end_date: "2027-01-15T23:00" }, now), "13 – 15 janv. 2027");
  assert.equal(festivals.formatFestivalDates({ date: "", end_date: null }, now), "");
});

test("fiche de festival : la catégorie Festival sur plus d'un jour", () => {
  const fiche = (date, end_date, category = "Festival") => festivals.festivalFiche({ date, end_date, category }, categories);
  assert.equal(festivals.festivalFiche({ ...fulgurances, category: "ef10b471-b9d8-4db2-9f02-c49717233d82" }, categories), true);
  assert.equal(fiche("2026-10-17T17:00", "2026-10-18T17:20"), true);
  // Des séances rangées en Festival, comme en prod : un film, une nuit de cabaret (la nuit compte pour la veille).
  assert.equal(fiche("2026-09-29T18:00:00+00:00", "2026-09-29T19:35:00+00:00"), false);
  assert.equal(fiche("2026-11-14T20:00:00+00:00", "2026-11-15T02:00:00+00:00"), false);
  // Sans fin connue, on ne sait pas ; une autre catégorie, un événement.
  assert.equal(fiche("2026-11-19T21:00", null), null);
  assert.equal(fiche("2026-11-19T21:00", "2026-11-22T04:45", "Concert"), false);
});

test("alertes du programme : sans lieu, sans fin, hors des dates", () => {
  const micro = { date: "2026-11-19T21:00:00+00:00", end_date: "2026-11-20T00:45:00+00:00", location_id: "l1" };
  assert.deepEqual(festivals.programmeWarnings(micro, fulgurances), []);
  assert.deepEqual(festivals.programmeWarnings({ ...micro, location_id: null, end_date: null }, fulgurances), [
    "Sans lieu",
    "Sans fin",
  ]);
  assert.deepEqual(festivals.programmeWarnings({ ...micro, date: "2026-11-25T20:00:00+00:00", end_date: null }, fulgurances), [
    "Sans fin",
    "Hors des dates du festival",
  ]);
  // Commence dedans, finit après.
  assert.deepEqual(
    festivals.programmeWarnings({ ...micro, date: "2026-11-21T23:00", end_date: "2026-11-22T06:00" }, fulgurances),
    ["Hors des dates du festival"],
  );
});

test("suggestions : dans ses dates, qui le nomment, pas déjà rattachées", () => {
  const candidates = [
    { id: "infra", title: "Fulgurances Électroniques – Infra", date: "2026-11-20T18:00:00+00:00", festival_id: null },
    { id: "micro", title: "Fulgurances Électroniques – Micro", date: "2026-11-19T21:00:00+00:00", festival_id: null },
    {
      id: "texte",
      title: "Soirée au Dropkick",
      description: "Une soirée du festival Fulgurances Électroniques.",
      date: "2026-11-21T21:00:00+00:00",
      festival_id: null,
    },
    { id: "avant", title: "Fulgurances Électroniques – Teaser", date: "2026-11-12T21:00:00+00:00", festival_id: null },
    { id: "autre", title: "Concert au 108", date: "2026-11-20T20:00:00+00:00", festival_id: null },
    { id: "deja", title: "Fulgurances Électroniques – Gamma", date: "2026-11-21T22:00:00+00:00", festival_id: fulgurances.id },
    { id: "ailleurs", title: "Fulgurances Électroniques – Ultra", date: "2026-11-21T20:00:00+00:00", festival_id: "x" },
    { id: fulgurances.id, title: fulgurances.title, date: fulgurances.date, festival_id: null },
  ];
  assert.deepEqual(
    festivals.suggestProgramme(fulgurances, candidates, ["deja"]).map((event) => event.id),
    ["micro", "infra", "texte"],
  );
  // Gamma, déjà dans le programme enregistré mais retiré du formulaire : proposé à nouveau.
  assert.deepEqual(
    festivals.suggestProgramme(fulgurances, candidates, []).map((event) => event.id),
    ["micro", "infra", "texte", "deja"],
  );
  // Un festival qui a son propre programme n'est pas proposé.
  const avecProgramme = [
    ...candidates,
    { id: "fils", title: "Bal", date: "2026-11-20T20:00:00+00:00", festival_id: "infra" },
  ];
  assert.deepEqual(
    festivals.suggestProgramme(fulgurances, avecProgramme, ["deja"]).map((event) => event.id),
    ["micro", "texte"],
  );
  // Un festival sans nom reconnaissable ne suggère rien.
  assert.deepEqual(festivals.suggestProgramme({ ...fulgurances, title: "Festival 2026" }, candidates), []);
});

test("date murale pour filtrer events.date ; erreurs des règles en français", () => {
  assert.equal(festivals.toDatabaseWallClock(new Date(2026, 10, 19, 0, 0)), "2026-11-19T00:00:00.000Z");
  assert.equal(festivals.toDatabaseWallClock(new Date(2026, 10, 22, 4, 45)), "2026-11-22T04:45:00.000Z");
  assert.match(
    festivals.describeFestivalError({ code: "23514", message: "Un festival n'est pas dans un festival : …" }),
    /ne peut pas faire partie/,
  );
  assert.match(
    festivals.describeFestivalError({
      code: "23514",
      message: 'new row for relation "events" violates check constraint "events_festival_id_not_self"',
    }),
    /ne peut pas faire partie/,
  );
  assert.equal(festivals.describeFestivalError({ code: "23514", message: "price_check" }), null);
  assert.equal(festivals.describeFestivalError(null), null);
});

test("import : le festival que l'événement nomme, à ses dates", () => {
  const bouts = { id: "bouts", title: "Festival des Bouts du Monde", date: "2026-11-13T18:00:00+00:00", end_date: "2026-11-14T23:00:00+00:00" };
  const known = [fulgurances, bouts];
  const find = (event) => known.find((festival) => festival.id === event?.id)?.id ?? null;

  // Par le nom relevé (IA, create_event), sans numéro d'édition ni « festival ».
  const byName = festivals.findFestivalForImport(known, { festivalName: "Fulgurances Électroniques", date: "2026-11-21T20:00" });
  assert.equal(find(byName.festival), fulgurances.id);
  assert.equal(
    find(festivals.findFestivalForImport(known, { festivalName: "festival des bouts du monde 2026", date: "2026-11-13T20:00" }).festival),
    "bouts",
  );
  // Par le titre qui le nomme.
  assert.equal(
    find(festivals.findFestivalForImport(known, { title: "Fulgurances Électroniques – Ultra", date: "2026-11-21T20:00" }).festival),
    fulgurances.id,
  );
  // Un nom d'un seul mot ne suffit pas, même au début du nom d'un festival.
  assert.equal(festivals.findFestivalForImport(known, { festivalName: "Fulgurances", date: "2026-11-21T20:00" }).festival, null);
  // « Festival de Cannes » dans un texte : aucun festival de ce nom.
  const cannes = festivals.findFestivalForImport(known, { festivalName: "Festival de Cannes", title: "Open Your Wild", date: "2026-11-13T20:00" });
  assert.deepEqual(cannes, { festival: null, outOfDates: null });
  // Le bon nom, d'autres dates : pas de rattachement, signalé.
  const late = festivals.findFestivalForImport(known, { festivalName: "Fulgurances Électroniques", date: "2026-12-05T20:00" });
  assert.equal(late.festival, null);
  assert.equal(find(late.outOfDates), fulgurances.id);
});

test("import : rattaché, festival absent, lieux d'un festival", async () => {
  const { buildEventFormPrefillFromImport } = await jiti.import(path.join(root, "lib/events/import-prefill.ts"));
  const locations = [
    { id: "dropkick", name: "Dropkick", address: "37 place du Châtelet, 45000 Orléans", capacity: null, latitude: null, longitude: null },
    { id: "108", name: "Le 108", address: "108 rue de Bourgogne, 45000 Orléans", capacity: null, latitude: null, longitude: null },
    { id: "astrolabe", name: "L'Astrolabe", address: "1 rue Alexandre-Avisse, 45000 Orléans", capacity: null, latitude: null, longitude: null },
  ];
  const base = { categories, locations, organizers: [], festivals: [fulgurances] };

  const ultra = await buildEventFormPrefillFromImport({
    ...base,
    data: { title: "Fulgurances Électroniques – Ultra", date: "2026-11-21T20:00:00", category: "Concert", location: "Le 108" },
  });
  assert.equal(ultra.prefill.form.festival_id, fulgurances.id);
  assert.equal(ultra.festival.attached.id, fulgurances.id);
  assert.match(ultra.warnings.find((warning) => warning.field === "festival").message, /^Rattaché au festival « Fulgurances Électroniques #2 »/);

  const vapeurs = await buildEventFormPrefillFromImport({
    ...base,
    data: { title: "Cabaret d'impro", festival_name: "À toutes vapeurs", date: "2026-11-06T20:30:00", category: "Spectacle" },
  });
  assert.equal(vapeurs.prefill.form.festival_id, "");
  assert.equal(vapeurs.festival.unknownName, "À toutes vapeurs");
  assert.equal(
    vapeurs.warnings.find((warning) => warning.field === "festival").message,
    "Fait partie d'un festival qui n'est pas dans l'app : À toutes vapeurs.",
  );

  // Une séance rangée en Festival, sur un seul jour : un événement comme un autre, rattaché.
  const seance = await buildEventFormPrefillFromImport({
    ...base,
    data: {
      title: "Projection au 108",
      festival_name: "Fulgurances Électroniques",
      date: "2026-11-20T18:00:00",
      end_date: "2026-11-20T19:35:00",
      category: "Festival",
      festival_venues: ["Dropkick"],
    },
  });
  assert.equal(seance.prefill.form.festival_id, fulgurances.id);
  assert.equal(seance.prefill.festivalLocationIds, undefined);

  // Le festival lui-même : jamais rattaché à un festival ; ses lieux, dans l'ordre de son texte.
  const festival = await buildEventFormPrefillFromImport({
    ...base,
    festivals: [],
    data: {
      title: "Fulgurances Électroniques #2",
      date: "2026-11-19T21:00:00",
      end_date: "2026-11-22T04:45:00",
      category: "Festival",
      location: "Le 108",
      festival_venues: ["le Dropkick", "le 108", "l'Astrolabe", "La Belle Étoile"],
    },
  });
  assert.equal(festival.prefill.form.festival_id, "");
  assert.deepEqual(festival.prefill.festivalLocationIds, ["dropkick", "108", "astrolabe"]);
  assert.equal(festival.prefill.form.location_id, "dropkick");
  assert.deepEqual(festival.festival.unmatchedVenues, ["La Belle Étoile"]);
  assert.equal(
    festival.warnings.find((warning) => warning.field === "festival_venues").message,
    "Lieu du festival sans fiche : La Belle Étoile. Crée-le depuis « Lieux du festival ».",
  );
  // Le lieu de la page, absent de la liste du texte, vient en tête.
  const elsewhere = await buildEventFormPrefillFromImport({
    ...base,
    festivals: [],
    data: { title: "Festival X", date: "2026-11-19T21:00:00", category: "Festival", location: "L'Astrolabe", festival_venues: ["Dropkick"] },
  });
  assert.deepEqual(elsewhere.prefill.festivalLocationIds, ["astrolabe", "dropkick"]);
});
