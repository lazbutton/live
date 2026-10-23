/*
 * Page « Audience de l'app » (U41) : compteurs par jour et comparaison sur 7 jours.
 *   node --test lib/audience/app-audience.test.mjs
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

const { APP_AUDIENCE_METRICS, audienceByDay, audienceTrends, formatTrend, shiftDay } = await jiti.import(
  path.join(root, "lib/audience/app-audience.ts"),
);

test("shiftDay : jours, mois et années, sans fuseau", () => {
  assert.equal(shiftDay("2026-10-21", -1), "2026-10-20");
  assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDay("2027-01-01", -1), "2026-12-31");
  assert.equal(shiftDay("2026-03-29", 1), "2026-03-30");
});

test("audienceByDay : hier d'abord, zéros sans ligne, aujourd'hui exclu", () => {
  const days = audienceByDay(
    [
      { day: "2026-10-20", metric: "event_opened", count: 12 },
      { day: "2026-10-20", metric: "event_liked", count: 3 },
      { day: "2026-10-20", metric: "radio_live_play", count: 4 },
      { day: "2026-10-20", metric: "festival_opened", count: 2 },
      { day: "2026-10-18", metric: "search_no_result", count: 2 },
      { day: "2026-10-21", metric: "event_opened", count: 99 },
      { day: "2026-10-10", metric: "event_opened", count: 7 },
      { day: "2026-10-20", metric: "inconnu", count: 5 },
    ],
    "2026-10-21",
    3,
  );
  assert.deepEqual(
    days.map((day) => day.day),
    ["2026-10-20", "2026-10-19", "2026-10-18"],
  );
  assert.deepEqual(days[0].counts, {
    event_opened: 12,
    festival_opened: 2,
    ticket_tapped: 0,
    search_no_result: 0,
    when_sheet_used: 0,
    event_liked: 3,
    radio_live_play: 4,
    radio_episode_play: 0,
  });
  assert.equal(days[1].counts.event_opened, 0);
  assert.equal(days[2].counts.search_no_result, 2);
});

test("audienceTrends : 7 derniers jours finis contre les 7 d'avant", () => {
  const rows = [
    { day: "2026-10-20", metric: "event_opened", count: 10 },
    { day: "2026-10-14", metric: "event_opened", count: 5 },
    { day: "2026-10-13", metric: "event_opened", count: 4 },
    { day: "2026-10-07", metric: "event_opened", count: 6 },
    { day: "2026-10-06", metric: "event_opened", count: 100 },
  ];
  const [opened, ...others] = audienceTrends(rows, "2026-10-21");
  assert.deepEqual(opened, { metric: "event_opened", label: "Fiches ouvertes", lastWeek: 15, weekBefore: 10 });
  assert.equal(others.length, APP_AUDIENCE_METRICS.length - 1);
  assert.ok(others.every((trend) => trend.lastWeek === 0 && trend.weekBefore === 0));
});

test("compteurs : les mêmes dans la page et dans les deux listes de chaque migration", async () => {
  // La Radio (20261023142000) et les festivals (20261023180000) rendent la même liste : appliquées dans
  // n'importe quel ordre en prod, la seconde ne retire rien à la première.
  const { readFile } = await import("node:fs/promises");
  const keys = APP_AUDIENCE_METRICS.map((metric) => metric.key).sort().join(" ");
  for (const file of ["20261023142000_add_radio_audience_metrics.sql", "20261023180000_add_festival_audience_metric.sql"]) {
    const sql = await readFile(path.join(root, "supabase/migrations", file), "utf8");
    const blocks = [/metric IN \(([\s\S]*?)\)\);/, /e\.key IN \(([\s\S]*?)\n\s*\)/].map((pattern) => pattern.exec(sql)?.[1] ?? "");
    const lists = blocks.map((block) => [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort().join(" "));
    assert.deepEqual(lists, [keys, keys], file);
  }
});

test("formatTrend : hausse, baisse, égalité, rien à comparer", () => {
  assert.equal(formatTrend({ lastWeek: 15, weekBefore: 10 }), "+50 %");
  assert.equal(formatTrend({ lastWeek: 6, weekBefore: 10 }), "−40 %");
  assert.equal(formatTrend({ lastWeek: 10, weekBefore: 10 }), "=");
  assert.equal(formatTrend({ lastWeek: 4, weekBefore: 0 }), null);
});
