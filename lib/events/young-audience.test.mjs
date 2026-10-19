/*
 * Jeune public : mentions, âges et tags qui désignent un événement pour enfants ou familles.
 *   node --test lib/events/young-audience.test.mjs
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
const { youngAudienceCue, isYoungAudience } = await jiti.import(path.join(root, "lib/events/young-audience.ts"));

test("jeune public : mention, âge d'enfant, tranche d'âge, tag", () => {
  assert.equal(youngAudienceCue({ title: "Séance cinéma pour les touts petits" }), "les touts petits");
  assert.equal(youngAudienceCue({ title: "Boum d'Halloween" }), "boum");
  assert.equal(youngAudienceCue({ title: "A vos contes - 1h de contes en famille un dimanche par mois !" }), "en famille");
  assert.equal(youngAudienceCue({ title: "Réveil livres de 0 à 3 ans" }), "de 0 à 3 ans");
  assert.equal(youngAudienceCue({ title: "Réveil livres de 18 mois à 3 ans" }), "de 18 mois à 3 ans");
  assert.equal(youngAudienceCue({ title: "Stage 11-15 ans : Le Palace maudit" }), "11 15 ans");
  assert.equal(youngAudienceCue({ title: "Petit cube", description: "Spectacle de marionnettes, dès 2 ans." }), "dès 2 ans");
  assert.equal(youngAudienceCue({ title: "Bulle", description: "À partir de 18 mois." }), "à partir de 18 mois");
  assert.equal(youngAudienceCue({ title: "Le magicien des couleurs", description: "Un conte musical jeune public." }), "jeune public");
  assert.equal(youngAudienceCue({ title: "Histoires pour les enfants" }), "pour les enfants");
  assert.equal(youngAudienceCue({ title: "Lectures", description: "Un atelier parent-enfant autour des albums." }), "parent enfant");
  assert.equal(youngAudienceCue({ title: "Atelier / FLUX", description: "Tarif duo à 14 € pour un adulte et un enfant." }), "un adulte et un enfant");
  assert.equal(youngAudienceCue({ title: "Galaxie provisoire", description: "Une invitation à embarquer à hauteur d’enfant." }), "a hauteur d enfant");
  // Socoop écrit l'âge en capitales, sans accent.
  assert.equal(youngAudienceCue({ title: "Le vertige de l'envers", description: "Cirque TOUT PUBLIC DES 3 ANS • 30 MIN" }), "public des 3 ans");
  // Un atelier « dès 8 ans » est un atelier d'enfants.
  assert.equal(
    youngAudienceCue({ title: "Crée ton jeu vidéo", description: "Initiation à la programmation dès 8 ans.", category: "Atelier" }),
    "dès 8 ans",
  );
  assert.equal(youngAudienceCue({ title: "Stage d'écriture", description: "Pour les 9 ans et plus : à partir de 9 ans." }), "à partir de 9 ans");
  assert.equal(youngAudienceCue({ title: "Kimera", tags: ["Théâtre", "Jeune Public"] }), "jeune public");
  assert.equal(youngAudienceCue({ title: "Atelier sérigraphie", tags: ["Enfants"] }), "enfants");
});

test("pas jeune public : tout public dès 12 ans, anniversaire, tout petit lieu, adultes", () => {
  const not = (input) => assert.equal(isYoungAudience(input), false, JSON.stringify(input));
  not({ title: "Le Misanthrope", description: "Tout public dès 12 ans." });
  not({ title: "Plonger", description: "Spectacle de cirque, à partir de 8 ans." });
  not({ title: "Paralleles45 fête ses 50 ans" });
  // « des 5 ans » sans accent : l'anniversaire d'un collectif, pas un âge.
  not({ title: "Soirée des 5 ans du collectif" });
  not({ title: "Concert", description: "Dans un tout petit bar du centre-ville, à prix tout petits." });
  not({ title: "Exposition d'art solidaire au profit de la recherche sur les cancers des enfants" });
  not({ title: "Afterwork 18-25 ans" });
  not({ title: "Festival des Bouts du Monde", description: "Venez en famille découvrir les films du festival." });
  not({ title: "Concert de Lum", tags: ["Rock", "Live"] });
  // « Bébé éléphant », chanson de Dick Annegarn ; ateliers pour les enfants en marge d'une soirée.
  not({ title: "Chansons agricoles - Dick Annegarn", description: "De l'immortel Bruxelles au fantasque Bébé éléphant." });
  not({ title: "LA PETITE SCENE #1", description: "Chanson, stand-up, ateliers artistiques pour les enfants : il y en aura pour tous les goûts." });
  // Atelier ouvert à tous les publics dès 11 ans ; atelier d'adultes.
  not({ title: "Atelier La Clé des sons", description: "Il s'adresse à tous les publics à partir de 11 ans.", category: "Atelier" });
  not({ title: "Atelier souplesse", description: "Cet atelier tout public est accessible à partir de 15 ans.", category: "Atelier" });
  not({ title: "Kimera", description: "Théâtre de geste TOUT PUBLIC DES 7 ANS • 55 MIN" });
});
