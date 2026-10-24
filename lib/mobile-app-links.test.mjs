/*
 * Les liens d'app : `public/.well-known/apple-app-site-association` (liens universels d'iOS) et
 * `assetlinks.json` (App Links d'Android). Une page publique que l'app sait ouvrir (un événement, un
 * lieu, un organisateur, un artiste : `DeepLinkService` de l'app) s'ouvre dans l'app quand elle est
 * installée. Sur iOS, ses chemins sont ici, et valent pour toutes les versions installées : un chemin
 * s'ajoute avec la version de l'app qui le sait ouvrir. Sur Android, ils sont dans le manifeste de l'app.
 *   node --test lib/mobile-app-links.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const links = await jiti.import(path.join(root, "lib/mobile-app-links.ts"));

function wellKnown(name) {
  return JSON.parse(readFileSync(path.join(root, "public/.well-known", name), "utf8"));
}

/** Un des motifs d'`apple-app-site-association` couvre `pathname` (`*` : n'importe quelle suite). */
function covers(patterns, pathname) {
  return patterns.some((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(pathname);
  });
}

test("iOS : l'app d'OutLive ouvre ses pages publiques, celle d'un artiste comprise", () => {
  const { applinks } = wellKnown("apple-app-site-association");
  const [details] = applinks.details;
  assert.equal(details.appID, `${links.IOS_TEAM_ID}.${links.IOS_BUNDLE_ID}`);

  for (const page of [
    links.buildEventPath("4f8f2a4e-2b1c-4d3e-9a5b-6c7d8e9f0a1b"),
    links.buildLocationPath("d2779ede-abb8-4e21-bb17-6507f7b46b9d", "L'Astrolabe"),
    links.buildOrganizerPath("3c1f5a2e-9b7d-4e6a-8f21-0d4c6b9e7a13", "Grossomodo Improvisation"),
    // Le lien que partage la page d'un artiste dans l'app.
    links.buildArtistPath("chica-super"),
  ]) {
    assert.ok(covers(details.paths, page), page);
  }

  // « Ouvrir dans l'app » (/open/…) ouvre l'app lui-même (son schéma) : la 1.0.6 de l'App Store ne
  // sait pas lire ces chemins, qui resteraient sur « Lien non pris en charge ».
  assert.ok(!covers(details.paths, links.buildArtistOpenPath("5d0c7a1e-2f3b-4c8d-9e6f-0a1b2c3d4e5f")));
  assert.ok(!covers(details.paths, links.buildEventOpenPath("4f8f2a4e-2b1c-4d3e-9a5b-6c7d8e9f0a1b")));
});

test("Android : le paquet de l'app et l'empreinte de sa clé de publication", () => {
  const [statement] = wellKnown("assetlinks.json");
  assert.deepEqual(statement.relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(statement.target.namespace, "android_app");
  assert.equal(statement.target.package_name, links.ANDROID_PACKAGE_NAME);
  assert.ok(statement.target.sha256_cert_fingerprints.includes(links.ANDROID_RELEASE_SHA256_FINGERPRINT));
});
