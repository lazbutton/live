/*
 * Mesure d'audience de l'app (U41) : compteurs quotidiens sans identité, écrits par l'app via
 * `app_audience_add` (migrations 20261021013000, 20261023142000 pour la radio, 20261023180000 pour les
 * festivals) et lus ici pour la page « Audience de l'app ».
 * Chaque téléphone envoie les totaux d'un jour au plus tôt le lendemain : les derniers jours se
 * complètent encore quelques jours.
 */

/** Les compteurs, dans l'ordre des colonnes ; mêmes clés que la table et que l'app. */
export const APP_AUDIENCE_METRICS = [
  { key: "event_opened", label: "Fiches ouvertes" },
  // La page d'un festival (la fiche d'un festival qui a un programme) : elle compte aussi dans event_opened.
  { key: "festival_opened", label: "Festivals ouverts" },
  { key: "ticket_tapped", label: "Billetterie touchée" },
  { key: "search_no_result", label: "Recherches sans résultat" },
  { key: "when_sheet_used", label: "« Quand ? » utilisé" },
  { key: "event_liked", label: "Cœurs" },
  { key: "radio_live_play", label: "Direct écouté" },
  { key: "radio_episode_play", label: "Épisode écouté" },
] as const;

export type AppAudienceMetric = (typeof APP_AUDIENCE_METRICS)[number]["key"];

/** Une ligne de `app_audience_counts`. */
export type AppAudienceRow = {
  day: string;
  metric: string;
  count: number;
};

export type AppAudienceDay = {
  /** `YYYY-MM-DD`. */
  day: string;
  counts: Record<AppAudienceMetric, number>;
};

export type AppAudienceTrend = {
  metric: AppAudienceMetric;
  label: string;
  /** Les 7 jours jusqu'à hier compris. */
  lastWeek: number;
  /** Les 7 jours d'avant. */
  weekBefore: number;
};

const METRIC_KEYS = new Set<string>(APP_AUDIENCE_METRICS.map((metric) => metric.key));

function emptyCounts(): Record<AppAudienceMetric, number> {
  return Object.fromEntries(APP_AUDIENCE_METRICS.map((metric) => [metric.key, 0])) as Record<
    AppAudienceMetric,
    number
  >;
}

/** `day` (`YYYY-MM-DD`) décalé de `days` jours, sans fuseau. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Les `days` jours qui précèdent `today` (hier d'abord), chacun avec ses compteurs (0 sans ligne).
 * Aujourd'hui n'y est pas : l'app n'envoie que des journées finies.
 */
export function audienceByDay(rows: AppAudienceRow[], today: string, days: number): AppAudienceDay[] {
  const byDay = new Map<string, Record<AppAudienceMetric, number>>();
  for (let offset = 1; offset <= days; offset += 1) {
    byDay.set(shiftDay(today, -offset), emptyCounts());
  }
  for (const row of rows) {
    const counts = byDay.get(row.day);
    if (!counts || !METRIC_KEYS.has(row.metric)) continue;
    counts[row.metric as AppAudienceMetric] += Number(row.count) || 0;
  }
  return [...byDay.entries()].map(([day, counts]) => ({ day, counts }));
}

/** Pour chaque compteur : les 7 derniers jours finis et les 7 d'avant. */
export function audienceTrends(rows: AppAudienceRow[], today: string): AppAudienceTrend[] {
  const days = audienceByDay(rows, today, 14);
  return APP_AUDIENCE_METRICS.map(({ key, label }) => ({
    metric: key,
    label,
    lastWeek: days.slice(0, 7).reduce((sum, day) => sum + day.counts[key], 0),
    weekBefore: days.slice(7).reduce((sum, day) => sum + day.counts[key], 0),
  }));
}

/** « +12 % », « −40 % », « = » ; `null` sans semaine d'avant pour comparer. */
export function formatTrend(trend: Pick<AppAudienceTrend, "lastWeek" | "weekBefore">): string | null {
  if (trend.weekBefore === 0) return null;
  const change = Math.round(((trend.lastWeek - trend.weekBefore) / trend.weekBefore) * 100);
  if (change === 0) return "=";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)} %`;
}
