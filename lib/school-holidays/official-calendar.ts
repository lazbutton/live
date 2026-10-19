/*
 * Vacances scolaires de l'académie d'Orléans-Tours (zone B), lues dans le calendrier scolaire
 * officiel (data.education.gouv.fr, jeu `fr-en-calendrier-scolaire`) et rangées dans
 * public.school_holidays, que l'app lit pour son calendrier « Quand ? ». Appelé chaque semaine par
 * le cron GET /api/cron/school-holidays (vercel.json). Contrat pour l'app : docs/API_APP.md.
 *
 * Bornes : le jeu donne le jour de fin des cours (start_date) et celui de la reprise (end_date), à
 * minuit heure de Paris : « 2026-10-17T00:00:00+02:00 » → « 2026-11-02T00:00:00+01:00 » pour la
 * Toussaint 2026 (Onisep : fin des cours le samedi 17 octobre, reprise le lundi 2 novembre). La
 * table garde les jours de vacances, bornes comprises : du 17 octobre au 1er novembre. Une période
 * d'un jour a la même date aux deux bornes (pont de l'Ascension 2027 : vendredi 7 mai) : ce jour-là.
 * Lire la date en UTC (« 2026-10-16T22:00:00+00:00 », sans le paramètre timezone) décalerait le
 * premier jour d'un jour : les dates sont toujours ramenées à Paris.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { parisToday } from "@/lib/scraping/dates";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export const SCHOOL_HOLIDAYS_ACADEMY = "Orléans-Tours";

const DATASET_EXPORT_URL =
  "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/exports/json";
const FETCH_TIMEOUT_MS = 20_000;

/** Une ligne du jeu officiel (champs de l'export JSON). */
export type OfficialCalendarRecord = {
  description?: string | null;
  population?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  zones?: string | null;
  annee_scolaire?: string | null;
};

/** Une période de public.school_holidays (sans id ni dates de suivi). */
export type SchoolHolidayRow = {
  academy: string;
  zone: string;
  school_year: string;
  name: string;
  first_day: string;
  last_day: string;
  source_start_date: string;
  source_end_date: string;
};

export type SkippedRecord = { name: string | null; school_year: string | null; reason: string };

export type SchoolHolidaysSyncReport = {
  /** Lignes reçues du jeu officiel pour l'académie. */
  fetched: number;
  /** Périodes écrites (insérées ou mises à jour). */
  saved: number;
  /** Périodes de l'académie retirées du jeu officiel, supprimées de la table. */
  removed: number;
  skipped: SkippedRecord[];
};

const clean = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

/** Adresse de l'export JSON du jeu officiel pour une académie, dates à l'heure de Paris. */
export function officialCalendarUrl(academy = SCHOOL_HOLIDAYS_ACADEMY) {
  const url = new URL(DATASET_EXPORT_URL);
  url.searchParams.set("where", `location="${academy.replace(/"/g, '\\"')}"`);
  url.searchParams.set("order_by", "start_date");
  url.searchParams.set("timezone", "Europe/Paris");
  return url.toString();
}

/** Jour (AAAA-MM-JJ) à Paris d'une date du jeu (avec son décalage, ou déjà un jour) ; null sinon. */
function parisDay(value: string | null | undefined) {
  const trimmed = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (!/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : parisToday(date);
}

/** Veille d'un jour AAAA-MM-JJ. */
function previousDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}

/**
 * Périodes de vacances des élèves de [academy] : sans les lignes « Enseignants », ni « Début des
 * Vacances d'Été » (fin pas encore connue), ni les lignes incomplètes ou en double (signalées).
 */
export function toSchoolHolidayRows(records: OfficialCalendarRecord[], academy = SCHOOL_HOLIDAYS_ACADEMY) {
  const rows: SchoolHolidayRow[] = [];
  const skipped: SkippedRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (clean(record.location) !== academy) continue;
    const name = clean(record.description);
    const schoolYear = clean(record.annee_scolaire);
    const population = clean(record.population);
    const skip = (reason: string) => skipped.push({ name: name || null, school_year: schoolYear || null, reason });

    if (population.toLowerCase() === "enseignants") continue;
    if (!name || !schoolYear) {
      skip("nom ou année scolaire manquant");
      continue;
    }
    if (/^début des /i.test(name)) {
      skip("fin pas encore connue");
      continue;
    }
    const firstDay = parisDay(record.start_date);
    const resumeDay = parisDay(record.end_date);
    if (!firstDay || !resumeDay) {
      skip("date manquante ou illisible");
      continue;
    }
    if (resumeDay < firstDay) {
      skip("reprise avant la fin des cours");
      continue;
    }
    const key = `${schoolYear}|${name}`;
    if (seen.has(key)) {
      skip("période en double");
      continue;
    }
    seen.add(key);
    rows.push({
      academy,
      zone: clean(record.zones),
      school_year: schoolYear,
      name,
      first_day: firstDay,
      // La reprise n'est pas un jour de vacances, sauf pour une période d'un jour (mêmes bornes).
      last_day: resumeDay === firstDay ? firstDay : previousDay(resumeDay),
      source_start_date: clean(record.start_date),
      source_end_date: clean(record.end_date),
    });
  }

  return { rows, skipped };
}

/** Lignes du jeu officiel pour [academy] (export JSON, sans pagination). */
export async function fetchOfficialCalendar(fetchImpl: typeof fetch = fetch, academy = SCHOOL_HOLIDAYS_ACADEMY) {
  const response = await fetchImpl(officialCalendarUrl(academy), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Calendrier scolaire officiel : HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new Error("Calendrier scolaire officiel : réponse inattendue (tableau attendu)");
  }
  return body as OfficialCalendarRecord[];
}

/**
 * Recharge les vacances de [academy] : écrit les périodes du jeu officiel (insérées ou mises à jour
 * selon académie, année scolaire et nom) et supprime celles qu'il ne contient plus. Un jeu vide ou
 * illisible ne modifie rien.
 */
export async function syncSchoolHolidays(
  supabase: Client,
  { fetchImpl = fetch, academy = SCHOOL_HOLIDAYS_ACADEMY }: { fetchImpl?: typeof fetch; academy?: string } = {},
): Promise<SchoolHolidaysSyncReport> {
  const records = await fetchOfficialCalendar(fetchImpl, academy);
  const { rows, skipped } = toSchoolHolidayRows(records, academy);
  if (rows.length === 0) {
    throw new Error(`Calendrier scolaire officiel sans période pour ${academy} : table inchangée`);
  }

  const { error: saveError } = await supabase
    .from("school_holidays")
    .upsert(rows, { onConflict: "academy,school_year,name" });
  if (saveError) throw new Error(`Écriture des vacances scolaires : ${saveError.message}`);

  const { data: existing, error: readError } = await supabase
    .from("school_holidays")
    .select("id, school_year, name")
    .eq("academy", academy);
  if (readError) throw new Error(`Lecture des vacances scolaires : ${readError.message}`);

  const kept = new Set(rows.map((row) => `${row.school_year}|${row.name}`));
  const removedIds = (existing ?? [])
    .filter((row) => !kept.has(`${row.school_year}|${row.name}`))
    .map((row) => row.id);
  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase.from("school_holidays").delete().in("id", removedIds);
    if (deleteError) throw new Error(`Suppression des vacances scolaires retirées : ${deleteError.message}`);
  }

  return {
    fetched: records.filter((record) => clean(record.location) === academy).length,
    saved: rows.length,
    removed: removedIds.length,
    skipped,
  };
}
