/*
 * Une citation prouve-t-elle la valeur lue ? Cas relevés à l'essai à blanc de la reprise des fiches (2026-10-24).
 *   node --test lib/scraping/detail-quotes.test.mjs
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
const { quoteSupports } = await jiti.import(path.join(root, "lib/scraping/detail-quotes.ts"));

test("âge : un nombre d'ans (ou de mois) égal à la valeur, jamais une heure", () => {
  assert.equal(quoteSupports("min_age", 6, "TOUT PUBLIC DÈS 6 ANS"), true);
  assert.equal(quoteSupports("min_age", 15, "Public : + de 15 ans"), true);
  assert.equal(quoteSupports("min_age", 2, "A partir de 18 mois – Durée : 25 min"), true);
  assert.equal(quoteSupports("min_age", 1, "A partir de 6 mois – Durée : 25 min"), true);
  assert.equal(quoteSupports("min_age", 18, "Réservé aux majeurs"), true);
  // Zigo Comedy Club : « Dès 18h30 : venez dîner », une heure.
  assert.equal(quoteSupports("min_age", 18, "Dès 18h30 : venez dîner ou boire un verre"), false);
  assert.equal(quoteSupports("min_age", 8, "À partir de 7 ans"), false);
});

test("pour qui : les mots du public, pas l'âge des personnages", () => {
  assert.equal(quoteSupports("audience", "all", "Atelier tout public."), true);
  assert.equal(quoteSupports("audience", "all", "L'atelier est ouvert à toutes et tous, sans expérience préalable"), true);
  assert.equal(quoteSupports("audience", "family", "Lumineuse traversée au cœur des émotions, pour petits et grands !"), true);
  assert.equal(quoteSupports("audience", "family", "Une odyssée musicale à hauteur d’enfant."), true);
  assert.equal(quoteSupports("audience", "teens", "Stage 11-15 ans"), true);
  assert.equal(quoteSupports("audience", "teens", "Pour les ados"), true);
  // « Noircisse ! » : deux personnages de 10 ans.
  assert.equal(quoteSupports("audience", "teens", "Chaque été, June et Hiver, 10 ans, se retrouvent au bord de l’océan."), false);
  // Un âge minimum seul n'est pas un public.
  assert.equal(quoteSupports("audience", "teens", "Public : + de 15 ans"), false);
  assert.equal(quoteSupports("audience", "family", "A partir de 7 ans."), false);
  assert.equal(quoteSupports("audience", "adults", "Ateliers découverte ouverts aux adultes"), true);
});

test("réservation : les mots qui la disent", () => {
  assert.equal(quoteSupports("booking", "none", "Pour cette première partie pas de réservation."), true);
  assert.equal(quoteSupports("booking", "none", "Entrée libre sans réservation"), true);
  // « Entrée libre » ne dit pas s'il faut réserver.
  assert.equal(quoteSupports("booking", "none", "Entrée libre – Dans la limite des places disponibles."), false);
  assert.equal(quoteSupports("booking", "reservation", "Gratuit, sur réservation"), true);
  assert.equal(quoteSupports("booking", "reservation", "Inscription au 06 20 94 40 32"), true);
  assert.equal(quoteSupports("booking", "online", "Billetterie officielle"), true);
  assert.equal(quoteSupports("booking", "online", "Sélectionnez votre séance"), true);
  assert.equal(quoteSupports("booking", "online", "Venez nombreux !"), false);
});
