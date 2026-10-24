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

test("genres nommés par une source : rapprochés par nom ou phrase, sans accents ni casse ; le reste signalé", () => {
  const result = details.matchGenreIds(["théâtre", "L'HUMOUR", "Humour", "Polka", 3, ""], GENRES, "spectacle");
  assert.deepEqual(result.ids, ["the", "hum"]);
  assert.deepEqual(result.unmatched, ["L'HUMOUR", "Polka"]);
  assert.deepEqual(details.matchGenreIds(["humour"], GENRES, "spectacle").ids, ["hum"]);
  // Un genre retiré des listes n'est plus repris ; celui d'une autre catégorie non plus.
  assert.deepEqual(details.matchGenreIds(["Impro", "Jazz"], GENRES, "spectacle").unmatched, ["Impro", "Jazz"]);
  assert.deepEqual(details.matchGenreIds(undefined, GENRES, "spectacle"), { ids: [], unmatched: [] });
});

test("pour qui, âge, réservation lus : seulement des valeurs des listes", () => {
  assert.deepEqual(details.readEventDetails({ audience: "family", min_age: 3, booking: "reservation" }), {
    audience: "family",
    minAge: 3,
    booking: "reservation",
  });
  assert.deepEqual(details.readEventDetails({ audience: "kids", min_age: 40, booking: "Billetterie" }), {
    audience: null,
    minAge: null,
    booking: null,
  });
});

test("colonnes d'un préremplissage d'import : « lus, à confirmer » s'il y en a", () => {
  assert.deepEqual(
    details.detailsColumnsFromPrefill({
      form: { audience: "all", min_age: "6", booking: "none" },
      genreIds: ["hum"],
      detailsToConfirm: true,
    }),
    { genre_ids: ["hum"], audience: "all", min_age: 6, booking: "none", details_to_confirm: true },
  );
  assert.deepEqual(details.detailsColumnsFromPrefill({ form: { audience: "", min_age: "", booking: "" } }), {
    genre_ids: [],
    audience: null,
    min_age: null,
    booking: null,
    details_to_confirm: false,
  });
});
