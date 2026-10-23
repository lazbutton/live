/*
 * Radio : les routes du back-office (`app/api/admin/radio/`) n'ouvrent la clé service role qu'à un admin,
 * reconnu par app_metadata.role (isAdminUser, lib/auth.ts), jamais par user_metadata.role, que
 * l'utilisateur écrit lui-même (updateUser), session invitée comprise — cf. migration 20261023150000.
 * Les vrais handlers, avec un faux client de session (getUser) et la lecture/écriture simulées.
 *   node --test lib/radio/admin.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

// Lues au chargement de lib/supabase/client.ts (createBrowserClient, importé par lib/auth.ts).
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const server = await jiti.import(path.join(root, "lib/supabase/server.ts"));
const service = await jiti.import(path.join(root, "lib/supabase/service.ts"));
const radioAdmin = await jiti.import(path.join(root, "lib/radio/admin.ts"));
const radioRoute = await jiti.import(path.join(root, "app/api/admin/radio/route.ts"));
const showRoute = await jiti.import(path.join(root, "app/api/admin/radio/shows/[id]/route.ts"));

for (const method of ["log", "info", "warn", "error"]) mock.method(console, method, () => {});

// L'utilisateur de la session (cookies) que rend getUser() à la route.
let sessionUser = null;
mock.method(server, "createClient", async () => ({
  auth: {
    getUser: async () =>
      sessionUser
        ? { data: { user: sessionUser }, error: null }
        : { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } },
  },
}));

const SERVICE = { serviceRole: true };
const SHOW_ID = "5b0c7f9e-2a4d-4c1e-9f3a-7d2e8b6a1c40";
const PAYLOAD = { stations: [], shows: [], organizers: [], lastImportAt: null };
const SHOW = { id: SHOW_ID, family: "parole", organizerId: null };
const createService = mock.method(service, "createServiceClient", () => SERVICE);
const load = mock.method(radioAdmin, "loadAdminRadio", async () => PAYLOAD);
const update = mock.method(radioAdmin, "updateAdminRadioShow", async () => SHOW);

beforeEach(() => {
  for (const spy of [createService, load, update]) spy.mock.resetCalls();
});

const user = (id, extra) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});
const admin = user("admin-1", { email: "admin@example.test", app_metadata: { provider: "email", role: "admin" } });
// supabase.auth.updateUser({ data: { role: "admin" } }) avec la seule clé publique.
const selfMadeAdmin = user("user-1", { email: "membre@example.test", user_metadata: { role: "admin" } });
const guestSelfMadeAdmin = user("anon-1", {
  is_anonymous: true,
  app_metadata: { provider: "anonymous" },
  user_metadata: { role: "admin" },
});

const getRadio = () => radioRoute.GET();
const patchShow = (body) =>
  showRoute.PATCH(
    new Request(`http://admin.test/api/admin/radio/shows/${SHOW_ID}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: SHOW_ID }) },
  );

const routes = [
  ["GET /api/admin/radio", getRadio],
  ["PATCH /api/admin/radio/shows/[id]", () => patchShow({ family: "parole" })],
];

for (const [name, call] of routes) {
  test(`${name} : non connecté → 401, sans clé service`, async () => {
    sessionUser = null;
    assert.equal((await call()).status, 401);
    assert.equal(createService.mock.callCount(), 0);
  });

  test(`${name} : role dans user_metadata seulement → 403, sans clé service`, async () => {
    sessionUser = selfMadeAdmin;
    assert.equal((await call()).status, 403);
    assert.equal(createService.mock.callCount(), 0);
    assert.equal(load.mock.callCount() + update.mock.callCount(), 0);
  });

  test(`${name} : session invitée qui s'est donné user_metadata.role → 403, sans clé service`, async () => {
    sessionUser = guestSelfMadeAdmin;
    assert.equal((await call()).status, 403);
    assert.equal(createService.mock.callCount(), 0);
    assert.equal(load.mock.callCount() + update.mock.callCount(), 0);
  });
}

test("GET /api/admin/radio : admin (app_metadata.role) → 200, lu par la clé service", async () => {
  sessionUser = admin;
  const response = await getRadio();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), PAYLOAD);
  assert.equal(load.mock.callCount(), 1);
  assert.equal(load.mock.calls[0].arguments[0], SERVICE);
});

test("PATCH /api/admin/radio/shows/[id] : admin (app_metadata.role) → 200, écrit par la clé service", async () => {
  sessionUser = admin;
  const response = await patchShow({ family: "parole" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { show: SHOW });
  assert.equal(update.mock.callCount(), 1);
  const [client, id, changes] = update.mock.calls[0].arguments;
  assert.equal(client, SERVICE);
  assert.equal(id, SHOW_ID);
  assert.deepEqual(changes, { family: "parole" });
});
