/*
 * Genre, pour qui et réservation : valeurs, libellés, âges, genres d'une catégorie.
 *   node --test lib/events/event-details.test.mjs
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
const details = await jiti.import(path.join(root, "lib/events/event-details.ts"));

const genre = (id, category_id, name, display_order, is_active = true) => ({
  id,
  category_id,
  name,
  phrase: name.toLowerCase(),
  display_order,
  is_active,
});
const GENRES = [
  genre("hum", "spectacle", "Humour", 2),
  genre("the", "spectacle", "Théâtre", 1),
  genre("imp", "spectacle", "Impro", 3, false),
  genre("jaz", "concert", "Jazz", 2),
];

test("valeurs et libellés, les mêmes que l'app", () => {
  assert.deepEqual(details.EVENT_AUDIENCES.map((audience) => audience.label), ["Tout public", "En famille", "Ados", "Adultes"]);
  assert.deepEqual(details.EVENT_BOOKINGS.map((booking) => booking.label), [
    "Sans réservation",
    "Sur réservation",
    "Billetterie en ligne",
  ]);
  assert.equal(details.isEventAudience("family"), true);
  assert.equal(details.isEventAudience("kids"), false);
  assert.equal(details.isEventBooking("online"), true);
  assert.equal(details.isEventBooking(""), false);
  assert.equal(details.audienceLabel("teens"), "Ados");
  assert.equal(details.bookingLabel("none"), "Sans réservation");
  assert.equal(details.bookingLabel(null), null);
});

test("âge minimum : un entier de 1 à 18", () => {
  assert.equal(details.toMinAge("6"), 6);
  assert.equal(details.toMinAge(12), 12);
  assert.equal(details.toMinAge(" 3 "), 3);
  assert.equal(details.toMinAge("0"), null);
  assert.equal(details.toMinAge("19"), null);
  assert.equal(details.toMinAge("6.5"), null);
  assert.equal(details.toMinAge(""), null);
  assert.equal(details.toMinAge(null), null);
  assert.equal(details.minAgeLabel(6), "Dès 6 ans");
  assert.equal(details.minAgeLabel(1), "Dès 1 an");
  assert.equal(details.minAgeLabel(null), null);
});

test("genres d'une catégorie : les actifs, plus ceux déjà portés, dans l'ordre de la liste", () => {
  assert.deepEqual(details.genresOfCategory(GENRES, "spectacle").map((genre) => genre.name), ["Théâtre", "Humour"]);
  assert.deepEqual(details.genresOfCategory(GENRES, "spectacle", ["imp"]).map((genre) => genre.name), [
    "Théâtre",
    "Humour",
    "Impro",
  ]);
  assert.deepEqual(details.genresOfCategory(GENRES, ""), []);
  assert.deepEqual(details.genreIdsForCategory(["jaz", "hum", "hum", "imp"], GENRES, "spectacle"), ["hum", "imp"]);
  assert.deepEqual(details.genreIdsForCategory(["hum"], GENRES, "concert"), []);
});
