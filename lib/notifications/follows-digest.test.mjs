/*
 * Notification des suivis (U8) : messages par personne, titres, corps et données lues par l'app.
 *   node --test lib/notifications/follows-digest.test.mjs
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
  followsDigestBody,
  followsDigestData,
  followsDigestDeliveryKey,
  followsDigestTitle,
  planFollowsDigests,
} = await jiti.import(path.join(root, "lib/notifications/follows-digest.ts"));

/** Une ligne de `follows_digest()` (dates : l'heure de Paris étiquetée UTC). */
const row = (user, event, title, date, type, target, name) => ({
  user_id: user,
  event_id: event,
  event_title: title,
  event_date: `${date}+00:00`,
  target_type: type,
  target_id: target,
  target_name: name,
});

const rows = [
  row("u1", "e1", "Kid Francescoli", "2026-11-13T21:30:00", "location", "l1", "L’Astrolabe"),
  row("u1", "e2", "Folie’s + 1re partie", "2026-11-14T20:30:00", "location", "l1", "L’Astrolabe"),
  row("u2", "e1", "Kid Francescoli", "2026-11-13T21:30:00", "artist", "a1", "Kid Francescoli"),
  row("u2", "e1", "Kid Francescoli", "2026-11-13T21:30:00", "location", "l1", "L’Astrolabe"),
  row("u2", "e3", "Match d’impro", "2026-11-15T20:00:00", "organizer", "o1", "Grossomodo Improvisation"),
  row("u3", "e4", "Youn Sun Nah", "2026-11-17T20:00:00", "artist", "a2", "Youn Sun Nah"),
];

test("un message par personne : chaque événement une fois, les cibles qui l'ont publié", () => {
  const plans = planFollowsDigests(rows);

  assert.deepEqual([...plans.keys()], ["u1", "u2", "u3"]);
  assert.deepEqual(plans.get("u1").events.map((event) => event.id), ["e1", "e2"]);
  assert.deepEqual(plans.get("u1").targets, [{ type: "location", id: "l1", name: "L’Astrolabe" }]);
  // e1 vient de l'artiste et du lieu suivis : une fois.
  assert.deepEqual(plans.get("u2").events.map((event) => event.id), ["e1", "e3"]);
  assert.deepEqual(
    plans.get("u2").targets.map((target) => `${target.type}:${target.id}`),
    ["artist:a1", "location:l1", "organizer:o1"],
  );
  assert.equal(planFollowsDigests([]).size, 0);
});

test("titre : la cible quand elle est seule (« avec » un artiste), sinon tes suivis", () => {
  const plans = planFollowsDigests(rows);

  assert.equal(followsDigestTitle(plans.get("u1")), "2 nouveaux événements chez L’Astrolabe");
  assert.equal(followsDigestTitle(plans.get("u2")), "2 nouveaux événements chez tes suivis");
  assert.equal(followsDigestTitle(plans.get("u3")), "1 nouvel événement avec Youn Sun Nah");

  // Nom long : coupé au dernier mot, comme les titres des résumés. Sans nom : tes suivis.
  const long = planFollowsDigests([
    row("u", "e", "Soirée", "2026-11-13T21:30:00", "organizer", "o", "Association des amis du théâtre de la ville d’Orléans"),
  ]).get("u");
  assert.equal(followsDigestTitle(long), "1 nouvel événement chez Association des amis du théâtre de la…");
  const anonymous = planFollowsDigests([row("u", "e", "Soirée", "2026-11-13T21:30:00", "location", "l", null)]).get("u");
  assert.equal(followsDigestTitle(anonymous), "1 nouvel événement chez tes suivis");
});

test("corps : les deux premiers titres, puis le reste", () => {
  const plans = planFollowsDigests([
    ...rows,
    row("u1", "e5", "Jazz au 108", "2026-11-20T21:00:00", "location", "l1", "L’Astrolabe"),
  ]);

  assert.equal(followsDigestBody(plans.get("u3")), "Youn Sun Nah");
  assert.equal(followsDigestBody(plans.get("u2")), "Kid Francescoli et Match d’impro");
  assert.equal(followsDigestBody(plans.get("u1")), "Kid Francescoli, Folie’s + 1re partie et 1 autre");
});

test("données : la page du suivi quand il est seul, sinon l'onglet Favoris ; au plus 10 ids", () => {
  const plans = planFollowsDigests(rows);

  assert.deepEqual(followsDigestData({ date: "2026-10-21", plan: plans.get("u1") }), {
    type: "follows_digest",
    date: "2026-10-21",
    event_ids: ["e1", "e2"],
    events_count: 2,
    follows_count: 1,
    target_type: "location",
    target_id: "l1",
  });
  assert.deepEqual(followsDigestData({ date: "2026-10-21", plan: plans.get("u2") }), {
    type: "follows_digest",
    date: "2026-10-21",
    event_ids: ["e1", "e3"],
    events_count: 2,
    follows_count: 3,
  });

  const many = planFollowsDigests(
    Array.from({ length: 12 }, (_, i) => row("u", `e${i}`, `Soirée ${i}`, "2026-11-13T21:30:00", "artist", "a", "Chica Super!")),
  ).get("u");
  const data = followsDigestData({ date: "2026-10-21", plan: many });
  assert.equal(data.event_ids.length, 10);
  assert.equal(data.events_count, 12);
});

test("clé de remise : un message des suivis par personne et par jour", () => {
  assert.equal(followsDigestDeliveryKey("2026-10-21", "u1"), "follows_digest:2026-10-21:u1");
});
