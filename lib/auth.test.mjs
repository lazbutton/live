/*
 * checkIsAdmin() et isAdminUser() ne reconnaissent l'admin que par app_metadata.role (écrit par le
 * service), jamais par user_metadata.role (modifiable par l'utilisateur via updateUser) — cf. migration
 * 20261023150000. Garde-fou : aucun code ne relit le rôle dans user_metadata.
 *   node --test lib/auth.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Lues au chargement de lib/supabase/client.ts (createBrowserClient).
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55421";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { checkIsAdmin, isAdminUser } = await jiti.import(path.join(root, "lib/auth.ts"));

// Faux client : getUser() renvoie l'utilisateur fourni.
const clientFor = (user) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } });

test("admin via app_metadata.role → true", async () => {
  const client = clientFor({ id: "u1", app_metadata: { role: "admin" }, user_metadata: {} });
  assert.equal(await checkIsAdmin(client), true);
});

test("role seulement dans user_metadata (modifiable par l'utilisateur) → false", async () => {
  const client = clientFor({ id: "u2", app_metadata: { provider: "email" }, user_metadata: { role: "admin" } });
  assert.equal(await checkIsAdmin(client), false);
});

test("compte ordinaire → false", async () => {
  const client = clientFor({ id: "u3", app_metadata: { provider: "email" }, user_metadata: {} });
  assert.equal(await checkIsAdmin(client), false);
});

test("session anonyme qui s'est donné user_metadata.role=admin → false", async () => {
  const client = clientFor({ id: "anon", is_anonymous: true, app_metadata: { provider: "anonymous" }, user_metadata: { role: "admin" } });
  assert.equal(await checkIsAdmin(client), false);
});

test("non connecté → false", async () => {
  assert.equal(await checkIsAdmin(clientFor(null)), false);
});

test("isAdminUser, pour une route qui a déjà l'utilisateur : la même règle", () => {
  assert.equal(isAdminUser({ id: "u1", app_metadata: { role: "admin" }, user_metadata: {} }), true);
  assert.equal(isAdminUser({ id: "u2", app_metadata: { provider: "email" }, user_metadata: { role: "admin" } }), false);
  assert.equal(isAdminUser({ id: "u3", user_metadata: { role: "admin" } }), false);
  assert.equal(isAdminUser(null), false);
  assert.equal(isAdminUser(undefined), false);
});

// La PR #53 (Radio), fusionnée à côté de la #54, avait réintroduit deux lectures de user_metadata.role
// (app/api/admin/radio/). Les migrations d'avant 20261023150000 et les tests (qui décrivent l'attaque)
// ne comptent pas.
test("aucun code ne lit le rôle dans user_metadata (ni raw_user_meta_data)", () => {
  const reads = [
    /user_metadata\s*\??\.\s*role\b/,
    /user_metadata\s*(?:\?\.)?\s*\[\s*["'`]role["'`]\s*\]/,
    /raw_user_meta_data\s*->>?\s*'role'/,
    /'user_metadata'\s*\)?\s*->>?\s*'role'/,
  ];
  const files = ["middleware.ts"];
  for (const dir of ["app", "components", "hooks", "lib", "scripts", "store", "utils", "supabase/functions"]) {
    for (const file of fs.readdirSync(path.join(root, dir), { recursive: true })) {
      if (/\.(?:[cm]?[jt]sx?|sql)$/.test(file) && !file.includes(".test.")) files.push(path.join(dir, file));
    }
  }
  for (const file of fs.readdirSync(path.join(root, "supabase/migrations"))) {
    if (/^\d{14}_.*\.sql$/.test(file) && file.slice(0, 14) > "20261023150000") files.push(path.join("supabase/migrations", file));
  }
  const offenders = files.filter((file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    return reads.some((read) => read.test(source));
  });
  assert.ok(files.length > 300, `${files.length} fichiers lus seulement`);
  assert.deepEqual(offenders, []);
});
