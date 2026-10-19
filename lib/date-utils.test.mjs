/*
 * Dates d'événement reçues par l'API (`parseEventDateInput`) : `events.date` contient l'heure de
 * Paris étiquetée UTC (20:30 saisi = `20:30:00+00`). Une date sans fuseau envoyée par l'app est
 * cette heure, quel que soit le fuseau du serveur ; une date avec `Z` ou un décalage est un instant.
 *   node --test lib/date-utils.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), { alias: { "@/": `${root}/` }, interopDefault: true });

const { fromDatetimeLocal, parseEventDateInput } = await jiti.import(path.join(root, "lib/date-utils.ts"));

const initialTimeZone = process.env.TZ;
after(() => {
  if (initialTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = initialTimeZone;
});

/** Fuseau du serveur : Vercel (UTC), un Mac à Orléans, un fuseau sans rapport. */
const SERVER_TIME_ZONES = ["UTC", "Europe/Paris", "America/New_York"];

function inEachTimeZone(check) {
  for (const timeZone of SERVER_TIME_ZONES) {
    process.env.TZ = timeZone;
    check(timeZone);
  }
}

const iso = (value) => parseEventDateInput(value)?.toISOString() ?? null;

test("sans fuseau : heure de Paris enregistrée telle quelle, été comme hiver", () => {
  const cases = {
    // `DateTime.toIso8601String()` d'un `DateTime` local, ce qu'envoie l'app.
    "2026-07-14T20:30:00.000": "2026-07-14T20:30:00.000Z", // heure d'été (UTC+2)
    "2026-12-31T20:30:00.000": "2026-12-31T20:30:00.000Z", // heure d'hiver (UTC+1)
    "2026-10-24T20:30:00.000": "2026-10-24T20:30:00.000Z", // veille du passage à l'heure d'hiver
    "2026-10-24T20:30": "2026-10-24T20:30:00.000Z",
    "2026-10-24T20:30:00": "2026-10-24T20:30:00.000Z",
    "2026-10-24 20:30:00": "2026-10-24T20:30:00.000Z",
    " 2026-10-24T20:30:00.000 ": "2026-10-24T20:30:00.000Z",
    // Heures absente (29/03) et doublée (25/10) à Paris : pas de décalage non plus.
    "2026-03-29T02:30:00.000": "2026-03-29T02:30:00.000Z",
    "2026-10-25T02:30:00.000": "2026-10-25T02:30:00.000Z",
    // Jour seul : déjà lu en UTC par `new Date()`.
    "2026-10-24": "2026-10-24T00:00:00.000Z",
  };
  inEachTimeZone((timeZone) => {
    for (const [input, expected] of Object.entries(cases)) {
      assert.equal(iso(input), expected, `${input} (TZ=${timeZone})`);
    }
  });
});

test("même heure que le formulaire du back-office (fromDatetimeLocal)", () => {
  inEachTimeZone((timeZone) => {
    for (const local of ["2026-07-14T20:30", "2026-12-31T09:05"]) {
      assert.equal(iso(`${local}:00.000`), fromDatetimeLocal(local), `${local} (TZ=${timeZone})`);
    }
  });
});

test("avec Z ou un décalage : instant gardé tel quel", () => {
  const cases = {
    // Date laissée inchangée dans l'app : la valeur lue en base, renvoyée en UTC.
    "2026-10-24T18:30:00.000Z": "2026-10-24T18:30:00.000Z",
    "2026-12-31T20:30:00.000Z": "2026-12-31T20:30:00.000Z",
    "2026-07-14T20:30:00+02:00": "2026-07-14T18:30:00.000Z",
    "2026-12-31T20:30:00+01:00": "2026-12-31T19:30:00.000Z",
    "2026-10-24T18:30:00+00:00": "2026-10-24T18:30:00.000Z",
  };
  inEachTimeZone((timeZone) => {
    for (const [input, expected] of Object.entries(cases)) {
      assert.equal(iso(input), expected, `${input} (TZ=${timeZone})`);
    }
  });
});

test("en UTC (Vercel), même résultat qu'avant (`new Date()`)", () => {
  process.env.TZ = "UTC";
  for (const input of [
    "2026-07-14T20:30:00.000",
    "2026-12-31T20:30:00.000",
    "2026-10-24T20:30",
    "2026-10-24T18:30:00.000Z",
    "2026-07-14T20:30:00+02:00",
    "2026-10-24",
  ]) {
    assert.equal(iso(input), new Date(input).toISOString(), input);
  }
});

test("date invalide : null", () => {
  inEachTimeZone(() => {
    for (const input of ["", "  ", "demain soir", "2026-13-01T20:30:00", "2026-10-24T25:00:00", "24/10/2026 20:30"]) {
      assert.equal(parseEventDateInput(input), null, JSON.stringify(input));
    }
  });
});
