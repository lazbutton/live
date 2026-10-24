/*
 * Qui a envoyé une demande, dans la file du back-office (lib/admin-requests-core.ts) : son nom public,
 * sinon l'e-mail de son compte (get_user_emails, lu par lib/admin-requests.ts), sinon son id. Le nom
 * public que la fiche affiche, jamais une adresse e-mail, est testé en SQL :
 * supabase/tests/community_attribution.test.sql.
 *   node --test lib/admin-requests-core.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });
const { buildAdminRequestItem, getRequestContributorLabel } = await jiti.import(
  path.join(root, "lib/admin-requests-core.ts"),
);

const request = (fields = {}) => ({
  id: "req-1",
  request_type: "event_creation",
  status: "pending",
  requested_at: "2026-10-24T08:00:00Z",
  requested_by: "00000000-0000-4000-8000-000000000001",
  event_data: { title: "Soirée jazz", date: "2026-11-10T20:00:00" },
  ...fields,
});

test("une demande avec un nom : le nom", () => {
  const item = buildAdminRequestItem(
    request({ contributor_display_name: "Camille Martin", community_attribution_opt_in: true }),
    "camille@example.org",
  );
  assert.equal(item.contributorDisplayName, "Camille Martin");
  assert.equal(item.requesterEmail, "camille@example.org");
  assert.equal(getRequestContributorLabel(item), "Camille Martin");
});

test("une demande sans nom (Apple en natif, code par e-mail) : l'e-mail du compte, pour l'admin", () => {
  const item = buildAdminRequestItem(
    request({ contributor_display_name: null, community_attribution_opt_in: true }),
    " membre@example.org ",
  );
  assert.equal(item.contributorDisplayName, null);
  assert.equal(item.requesterEmail, "membre@example.org");
  assert.equal(getRequestContributorLabel(item), "membre@example.org");
});

test("sans e-mail lu : l'id du compte, sinon « Contributeur inconnu »", () => {
  assert.equal(
    getRequestContributorLabel(buildAdminRequestItem(request())),
    "00000000-0000-4000-8000-000000000001",
  );
  assert.equal(
    getRequestContributorLabel(buildAdminRequestItem(request({ requested_by: null }))),
    "Contributeur inconnu",
  );
});
