/*
 * Tarif des formulaires d'événement (lib/events/price-mode.ts) et libellé du prix d'un événement lu en
 * base (formatGenericPriceLabel, lib/events/price-utils.ts, d'après events.price_kind).
 * La règle du genre de prix elle-même est testée en SQL : supabase/tests/price_kind.test.sql.
 *   node --test lib/events/price-mode.test.mjs
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
const mode = await jiti.import(path.join(root, "lib/events/price-mode.ts"));
const { formatGenericPriceLabel } = await jiti.import(path.join(root, "lib/events/price-utils.ts"));

const fields = (price_min = "", price_max = "", is_pay_what_you_want = false) => ({
  price_min,
  price_max,
  is_pay_what_you_want,
});

test("libellé d'un événement lu en base : le genre vient de price_kind", () => {
  assert.equal(formatGenericPriceLabel({ price_kind: "free", price: 0, price_min: 0 }), "Gratuit");
  assert.equal(formatGenericPriceLabel({ price_kind: "unknown", price: null }), null);
  assert.equal(formatGenericPriceLabel({ price_kind: "pay_what_you_want", price: 12 }), "Prix libre");
  assert.equal(formatGenericPriceLabel({ price_kind: "paid", price: 12, price_min: 12 }), "12€");
  assert.equal(formatGenericPriceLabel({ price_kind: "paid", price_min: "8", price_max: "12" }), "8 à 12€");
  assert.equal(formatGenericPriceLabel({ price_kind: "paid", price_min: 0, price_max: 5 }), "0 à 5€");
  assert.equal(formatGenericPriceLabel({ price_kind: "paid", price_min: 8.5 }, { suffix: " EUR" }), "8,5 EUR");
  assert.equal(formatGenericPriceLabel({ price_kind: "paid", price_max: 10 }), "10€");
  // Prix non renseigné : plus jamais « Gratuit ».
  assert.equal(formatGenericPriceLabel({ price_kind: "unknown" }, { emptyLabel: "—" }), "—");
  // price_kind non sélectionné : traité comme non renseigné, même avec un montant.
  assert.equal(formatGenericPriceLabel({ price: 0, price_min: 0 }), null);
  assert.equal(formatGenericPriceLabel({ price: 12 }), null);
});

test("choix lu depuis un événement : un prix de 0 reste Gratuit", () => {
  assert.deepEqual(mode.priceFieldsFromEvent({ price: 0, price_min: null }), fields("0"));
  assert.equal(mode.derivePriceMode(mode.priceFieldsFromEvent({ price: 0 })), "free");
  assert.deepEqual(mode.priceFieldsFromEvent({ price: 8, price_min: 8, price_max: 12 }), fields("8", "12"));
  assert.deepEqual(mode.priceFieldsFromEvent({ price: null, is_pay_what_you_want: true }), fields("", "", true));
  assert.equal(mode.derivePriceMode(mode.priceFieldsFromEvent({ price: null })), "unknown");
});

test("choix affiché pour des champs", () => {
  assert.equal(mode.derivePriceMode(fields()), "unknown");
  assert.equal(mode.derivePriceMode(fields("0")), "free");
  assert.equal(mode.derivePriceMode(fields("0", "0")), "free");
  assert.equal(mode.derivePriceMode(fields("0", "5")), "paid");
  assert.equal(mode.derivePriceMode(fields("12")), "paid");
  assert.equal(mode.derivePriceMode(fields("12", "", true)), "pwyw");
});

test("changer de choix", () => {
  const paid = fields("12", "15");
  assert.deepEqual(mode.applyPriceMode(paid, "free"), fields("0"));
  assert.deepEqual(mode.applyPriceMode(paid, "unknown"), fields());
  assert.deepEqual(mode.applyPriceMode(paid, "pwyw"), fields("", "", true));
  assert.deepEqual(mode.applyPriceMode(paid, "paid"), paid);
  assert.deepEqual(mode.applyPriceMode(fields("0"), "paid"), fields());
  // Les autres champs du formulaire sont gardés.
  assert.deepEqual(mode.applyPriceMode({ ...paid, title: "Concert" }, "free"), { ...fields("0"), title: "Concert" });
});

test("erreurs de saisie d'un tarif payant", () => {
  assert.equal(mode.priceFieldsError(fields("", "12"), "paid"), "Renseigne le prix avant le maximum.");
  assert.equal(mode.priceFieldsError(fields("15", "12"), "paid"), "Le maximum doit être supérieur au prix.");
  assert.equal(mode.priceFieldsError(fields("8", "12"), "paid"), null);
  assert.equal(mode.priceFieldsError(fields("", "12"), "free"), null);
  assert.equal(mode.priceFieldsError(fields("15", "12", true), "paid"), null);
});

test("colonnes enregistrées pour chaque choix", () => {
  const columns = (f) => mode.priceColumnsFromFields(f);
  assert.deepEqual(columns(fields()), { price: null, price_min: null, price_max: null, is_pay_what_you_want: false });
  assert.deepEqual(columns(fields("0")), { price: 0, price_min: 0, price_max: null, is_pay_what_you_want: false });
  assert.deepEqual(columns(fields("8", "12")), { price: 8, price_min: 8, price_max: 12, is_pay_what_you_want: false });
  assert.deepEqual(columns(fields("12", "8")), { price: 12, price_min: 12, price_max: null, is_pay_what_you_want: false });
  assert.deepEqual(columns(fields("12", "", true)), {
    price: null,
    price_min: null,
    price_max: null,
    is_pay_what_you_want: true,
  });
});

test("aperçu du tarif en cours de saisie", () => {
  assert.equal(mode.formatPriceFieldsLabel(fields(), "unknown"), null);
  assert.equal(mode.formatPriceFieldsLabel(fields("0"), "free"), "Gratuit");
  assert.equal(mode.formatPriceFieldsLabel(fields("8", "12"), "paid", { suffix: " EUR" }), "8 à 12 EUR");
  assert.equal(mode.formatPriceFieldsLabel(fields(), "paid"), null);
  assert.equal(mode.formatPriceFieldsLabel(fields("", "", true), "pwyw"), "Prix libre");
  assert.deepEqual(
    mode.PRICE_MODE_ITEMS.map((item) => [item.value, mode.priceKindForMode(item.value)]),
    [
      ["unknown", "unknown"],
      ["free", "free"],
      ["paid", "paid"],
      ["pwyw", "pay_what_you_want"],
    ],
  );
});
