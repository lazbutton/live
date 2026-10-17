/*
 * Liens collés ou partagés depuis l'écran mobile /ajout.
 *   node --test lib/collecte/quick-links.test.mjs
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

const { extractFirstUrl, guessNameFromLink, normalizeQuickLink } = await jiti.import(
  path.join(root, "lib/collecte/quick-links.ts"),
);

test("compte Instagram partagé depuis l'application", () => {
  const link = normalizeQuickLink("https://www.instagram.com/Java_Pop_Orleans?igsh=MXN6ZDZhZ2Y2N251cA==");
  assert.deepEqual(link, {
    url: "https://www.instagram.com/java_pop_orleans/",
    kind: "instagram",
    handle: "java_pop_orleans",
    label: "@java_pop_orleans",
    isPost: false,
  });
  assert.equal(guessNameFromLink(link), "Java Pop");
});

test("@identifiant et lien sans protocole", () => {
  assert.equal(normalizeQuickLink("@mimi._.styc")?.url, "https://www.instagram.com/mimi._.styc/");
  assert.equal(normalizeQuickLink("instagram.com/chafouin_orleans/")?.handle, "chafouin_orleans");
  assert.equal(normalizeQuickLink("le108.org/agenda/")?.url, "https://le108.org/agenda/");
});

test("une publication n'est pas un compte", () => {
  const post = normalizeQuickLink("https://www.instagram.com/p/DWjA7z7ly6L/?igsh=abc");
  assert.equal(post?.isPost, true);
  assert.equal(post?.handle, "");
  assert.equal(guessNameFromLink(post), "");
  assert.equal(normalizeQuickLink("https://www.facebook.com/events/1587247966531378/")?.isPost, true);
});

test("page Facebook, avec ou sans paramètres", () => {
  const page = normalizeQuickLink("https://m.facebook.com/ledropkickbarorleans/events?locale=fr_FR");
  assert.equal(page?.url, "https://www.facebook.com/ledropkickbarorleans");
  assert.equal(page?.kind, "facebook");
  assert.equal(page?.label, "facebook.com/ledropkickbarorleans");
  assert.equal(normalizeQuickLink("https://www.facebook.com/profile.php?id=1000&mibextid=x")?.url, "https://www.facebook.com/profile.php?id=1000");
});

test("site : les paramètres de suivi sont retirés, le reste est gardé", () => {
  assert.equal(normalizeQuickLink("https://www.Le108.org/?utm_source=ig")?.url, "https://www.le108.org");
  assert.equal(normalizeQuickLink("https://www.billetweb.fr/multi_event.php?multi=9360&fbclid=x")?.url, "https://www.billetweb.fr/multi_event.php?multi=9360");
  assert.equal(guessNameFromLink(normalizeQuickLink("https://le108.org")), "");
});

test("texte partagé contenant un lien", () => {
  assert.equal(extractFirstUrl("Regarde ce compte : https://www.instagram.com/highkollektiv). Top"), "https://www.instagram.com/highkollektiv");
  assert.equal(normalizeQuickLink("Regarde https://www.instagram.com/highkollektiv?igsh=1")?.handle, "highkollektiv");
});

test("saisie qui n'est pas un lien", () => {
  assert.equal(normalizeQuickLink("Le Chafouin"), null);
  assert.equal(normalizeQuickLink(""), null);
  assert.equal(normalizeQuickLink("javascript:alert(1)"), null);
});
