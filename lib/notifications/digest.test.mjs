/*
 * Résumés poussés (U9, « Pour toi ») : plages, événements d'un utilisateur, cartes des séries, message et
 * données lues par l'app.
 *   node --test lib/notifications/digest.test.mjs
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
const {
  categoryIdOf,
  categoryIdsOf,
  dayRange,
  digestBody,
  digestCards,
  digestData,
  digestTitle,
  planDailyDigest,
  shortTitle,
  startsIn,
  tonightRange,
  weekRange,
} = await jiti.import(path.join(root, "lib/notifications/digest.ts"));

const categories = [
  { id: "c-concert", name: "Concert" },
  { id: "c-theatre", name: "Theatre" },
  { id: "c-expo", name: "Expo" },
];

/** Dates comme la base les rend : l'heure de Paris étiquetée UTC. */
const event = (id, title, date, category) => ({ id, title, date: `${date}+00:00`, category });

test("plages en heure de Paris : ce soir de 18 h à 6 h, la journée, la semaine du lundi", () => {
  const wednesday = { year: 2026, month: 10, day: 21 };
  assert.deepEqual(tonightRange(wednesday), { start: "2026-10-21T18:00:00", end: "2026-10-22T06:00:00" });
  assert.deepEqual(dayRange(wednesday), { start: "2026-10-21T00:00:00", end: "2026-10-22T00:00:00" });
  assert.deepEqual(weekRange({ year: 2026, month: 10, day: 26 }), {
    start: "2026-10-26T00:00:00",
    end: "2026-11-02T00:00:00",
  });
  // Fin de mois et changement d'heure (25 octobre) : des jours de calendrier, pas des durées.
  assert.deepEqual(tonightRange({ year: 2026, month: 10, day: 31 }), {
    start: "2026-10-31T18:00:00",
    end: "2026-11-01T06:00:00",
  });
});

test("compte ce qui commence dans la plage, pas ce qui la traverse (expositions)", () => {
  const tonight = tonightRange({ year: 2026, month: 10, day: 21 });
  assert.equal(startsIn(event("a", "Concert", "2026-10-21T20:30:00"), tonight), true);
  assert.equal(startsIn(event("b", "Après minuit", "2026-10-22T01:00:00"), tonight), true);
  assert.equal(startsIn(event("c", "Expo depuis septembre", "2026-09-01T10:00:00"), tonight), false);
  assert.equal(startsIn(event("d", "Goûter", "2026-10-21T16:00:00"), tonight), false);
  assert.equal(startsIn(event("e", "Le lendemain", "2026-10-22T06:00:00"), tonight), false);
});

test("catégorie d'un événement : son id, ou son nom pour les lignes anciennes", () => {
  assert.equal(categoryIdOf("c-concert", categories), "c-concert");
  assert.equal(categoryIdOf(" theatre ", categories), "c-theatre");
  assert.equal(categoryIdOf("Inconnue", categories), null);
  assert.equal(categoryIdOf(null, categories), null);
  assert.deepEqual(
    categoryIdsOf(
      [
        event("1", "A", "2026-10-21T20:00:00", "Theatre"),
        event("2", "B", "2026-10-21T21:00:00", "c-concert"),
        event("3", "C", "2026-10-21T22:00:00", "c-theatre"),
        event("4", "D", "2026-10-21T23:00:00", "Inconnue"),
      ],
      categories,
    ),
    ["c-theatre", "c-concert"],
  );
});

test("le résumé du matin : ce soir d'abord, sinon la journée, sinon rien", () => {
  const tonight = [
    event("1", "Luiza", "2026-10-21T20:30:00", "c-concert"),
    event("2", "Dédoublée", "2026-10-21T20:00:00", "Theatre"),
  ];
  const today = [event("3", "Visite", "2026-10-21T14:00:00", "c-expo"), ...tonight];

  const inCategories = (ids) => (e) => ids.includes(categoryIdOf(e.category, categories));
  const evening = planDailyDigest(tonight, today, inCategories(["c-concert", "c-theatre"]));
  assert.equal(evening.period, "tonight");
  assert.deepEqual(evening.events.map((e) => e.id), ["1", "2"]);

  const daytime = planDailyDigest(tonight, today, inCategories(["c-expo"]));
  assert.equal(daytime.period, "today");
  assert.deepEqual(daytime.events.map((e) => e.id), ["3"]);

  // « Pour toi » : ce que app_digest_for_me a retenu pour lui.
  const mine = new Set(["3"]);
  assert.deepEqual(planDailyDigest(tonight, today, (e) => mine.has(e.id)).events.map((e) => e.id), ["3"]);

  assert.equal(planDailyDigest(tonight, today, inCategories(["autre"])), null);
  assert.equal(planDailyDigest([], [], () => true), null);
});

test("titre : le nombre, le moment, et « pour toi » pour qui a des goûts", () => {
  assert.equal(digestTitle(3, "tonight"), "3 événements ce soir");
  assert.equal(digestTitle(1, "tonight"), "1 événement ce soir");
  assert.equal(digestTitle(2, "today"), "2 événements aujourd’hui");
  assert.equal(digestTitle(12, "week"), "12 événements cette semaine");
  assert.equal(digestTitle(3, "tonight", true), "3 événements ce soir pour toi");
  assert.equal(digestTitle(7, "week", true), "7 événements cette semaine pour toi");
});

test("une carte par série, à sa première date, comme l'accueil", () => {
  const seriesOf = new Map([
    ["d1", "s-conde"],
    ["d2", "s-conde"],
    ["d3", "s-conde"],
    ["d4", "s-conde"],
  ]);
  const week = [
    event("d1", "Le Dîner de Condé", "2026-10-29T20:30:00", "c-theatre"),
    event("x", "Danse", "2026-10-30T20:00:00", "c-theatre"),
    event("d2", "Le Dîner de Condé", "2026-10-30T20:30:00", "c-theatre"),
    event("d3", "Le Dîner de Condé", "2026-10-31T20:30:00", "c-theatre"),
    event("d4", "Le Dîner de Condé", "2026-11-01T16:00:00", "c-theatre"),
  ];
  assert.deepEqual(digestCards(week, seriesOf), [
    { title: "Le Dîner de Condé", dates: 4 },
    { title: "Danse", dates: 1 },
  ]);
  assert.deepEqual(digestCards(week, new Map()).length, 5);
});

test("corps : les deux premières cartes, puis le reste ; une série dit ses dates", () => {
  const card = (title, dates = 1) => ({ title, dates });
  assert.equal(digestBody([card("Luiza")]), "Luiza");
  assert.equal(digestBody([card("Luiza"), card("Dédoublée")]), "Luiza et Dédoublée");
  assert.equal(digestBody([card("Luiza"), card("Dédoublée"), card("Plonger")]), "Luiza, Dédoublée et 1 autre");
  assert.equal(
    digestBody([card("Luiza"), card("Dédoublée"), card("Plonger"), card("Jazz")]),
    "Luiza, Dédoublée et 2 autres",
  );
  // Monique, la semaine du 26 octobre : plus « Le Dîner de Condé, Le Dîner de Condé et 2 autres ».
  assert.equal(digestBody([card("Le Dîner de Condé", 4)]), "Le Dîner de Condé (4 dates)");
});

test("un titre trop long est coupé au dernier mot entier", () => {
  assert.equal(shortTitle("  Concert   de   Luiza "), "Concert de Luiza");
  assert.equal(
    shortTitle("Plonger | SARAH DEVAUX, COMPAGNIE MENTEUSES - Mercredi 21/10/2026"),
    "Plonger | SARAH DEVAUX, COMPAGNIE…",
  );
  assert.ok(shortTitle("x".repeat(80)).length <= 41);
});

test("données lues par l'app : période, jour, catégories, au plus 10 ids", () => {
  const ids = Array.from({ length: 14 }, (_, i) => `e${i}`);
  assert.deepEqual(
    digestData({ period: "tonight", date: "2026-10-21", categoryIds: ["c-concert"], eventIds: ids.slice(0, 3) }),
    {
      type: "daily_events",
      date: "2026-10-21",
      period: "tonight",
      categories: ["c-concert"],
      event_ids: ["e0", "e1", "e2"],
      events_count: 3,
    },
  );
  const weekly = digestData({
    period: "week",
    date: "2026-10-26",
    endDate: "2026-11-01",
    categoryIds: ["c-concert", "c-expo"],
    eventIds: ids,
  });
  assert.equal(weekly.type, "weekly_summary");
  assert.equal(weekly.start_date, "2026-10-26");
  assert.equal(weekly.end_date, "2026-11-01");
  assert.equal(weekly.period, "week");
  assert.equal(weekly.event_ids.length, 10);
  assert.equal(weekly.events_count, 14);
  assert.equal("for_me" in weekly, false);
});

test("données de « Pour toi » : for_me, sans catégorie", () => {
  assert.deepEqual(
    digestData({ period: "week", date: "2026-10-26", endDate: "2026-11-01", categoryIds: [], eventIds: ["e1"], forMe: true }),
    {
      type: "weekly_summary",
      start_date: "2026-10-26",
      end_date: "2026-11-01",
      period: "week",
      categories: [],
      event_ids: ["e1"],
      events_count: 1,
      for_me: true,
    },
  );
});
