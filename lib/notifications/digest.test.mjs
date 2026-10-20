/*
 * Résumés poussés (U9) : plages, événements d'un utilisateur, message et données lues par l'app.
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

  const evening = planDailyDigest(tonight, today, ["c-concert", "c-theatre"], categories);
  assert.equal(evening.period, "tonight");
  assert.deepEqual(evening.events.map((e) => e.id), ["1", "2"]);

  const daytime = planDailyDigest(tonight, today, ["c-expo"], categories);
  assert.equal(daytime.period, "today");
  assert.deepEqual(daytime.events.map((e) => e.id), ["3"]);

  assert.equal(planDailyDigest(tonight, today, ["autre"], categories), null);
  assert.equal(planDailyDigest([], [], ["c-concert"], categories), null);
});

test("titre : le nombre, le moment, « dans tes catégories »", () => {
  assert.equal(digestTitle(3, "tonight"), "3 événements ce soir dans tes catégories");
  assert.equal(digestTitle(1, "tonight"), "1 événement ce soir dans tes catégories");
  assert.equal(digestTitle(2, "today"), "2 événements aujourd’hui dans tes catégories");
  assert.equal(digestTitle(12, "week"), "12 événements cette semaine dans tes catégories");
});

test("corps : les deux premiers titres, puis le reste", () => {
  assert.equal(digestBody(["Luiza"]), "Luiza");
  assert.equal(digestBody(["Luiza", "Dédoublée"]), "Luiza et Dédoublée");
  assert.equal(digestBody(["Luiza", "Dédoublée", "Plonger"]), "Luiza, Dédoublée et 1 autre");
  assert.equal(digestBody(["Luiza", "Dédoublée", "Plonger", "Jazz"]), "Luiza, Dédoublée et 2 autres");
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
});
