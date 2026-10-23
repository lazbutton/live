/*
 * Radio : petites règles de texte partagées par l'import et la route « ce qui passe ».
 */
import * as cheerio from "cheerio";

import { getZonedDateParts } from "@/lib/cron-timezone";

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Texte comparable : sans accents, casse ni ponctuation, comme `app_search_normalize` en SQL
 * (« LA MERIDIENNE – RADIO CAMPUS TOURS » → « la meridienne radio campus tours ») ; les lettres d'autres
 * écritures restent (« خنخنة »).
 */
export function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Espaces (insécables comprises) ramenées à une seule, aux deux bouts retirées. */
export function collapseSpaces(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s ]+/g, " ").trim();
}

/** Première lettre en capitale, le reste tel quel (« groove du monde » → « Groove du monde »). */
export function capitalizeFirst(value: string): string {
  return value.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("fr-FR"));
}

/**
 * Un instant (vrai UTC) écrit à l'heure de Paris étiquetée UTC, comme `events.date` :
 * « Thu, 22 Oct 2026 20:00:01 +0000 » → « 2026-10-22T22:00:01+00:00 ».
 */
export function toParisLabelledUtc(date: Date): string {
  const p = getZonedDateParts(date, "Europe/Paris");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+00:00`;
}

/** Les champs d'une date à l'heure de Paris étiquetée UTC, sans conversion. */
export function parisLabelledParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? 0),
  };
}

/** Une date à l'heure de Paris étiquetée UTC, sous la forme rendue par la base (`…T19:00:00+00:00`). */
export function formatParisLabelled(value: string): string {
  const p = parisLabelledParts(value);
  if (!p) return value;
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+00:00`;
}

const BLOCK_TAGS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, pre, tr";

/**
 * Le texte d'un morceau de HTML, sans balises : un paragraphe par bloc, séparés par une ligne vide ;
 * un retour à la ligne pour `<br>`. Images, figures, scripts et styles ne comptent pas.
 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  const $ = cheerio.load(`<div id="radio-root">${html}</div>`);
  const root = $("#radio-root");
  root.find("script, style, noscript, figure, img, svg, iframe").remove();
  root.find("br").replaceWith("\n");
  root.find(BLOCK_TAGS).each((_, element) => {
    $(element).prepend("\n\n").append("\n\n");
  });
  const paragraphs = root
    .text()
    .replace(/ /g, " ")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split("\n")
        .map((line) => collapseSpaces(line))
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
  return paragraphs.length ? paragraphs.join("\n\n") : null;
}
