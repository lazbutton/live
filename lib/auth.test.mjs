/*
 * checkIsAdmin() ne reconnaît l'admin que par app_metadata.role (écrit par le service), jamais par
 * user_metadata.role (modifiable par l'utilisateur via updateUser) — cf. migration 20261023150000.
 *   node --test lib/auth.test.mjs
 */
import assert from "node:assert/strict";
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
const { checkIsAdmin } = await jiti.import(path.join(root, "lib/auth.ts"));

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
