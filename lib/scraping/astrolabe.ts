import * as cheerio from "cheerio";

import { normalizeName } from "@/lib/events/import-prefill";

import { fetchHtml } from "./fetch-html";
import { decodeHtmlText, type CheerioDocument } from "./structured-event";

/*
 * Billetterie de L'Astrolabe (billetterie.lastrolabe.org, Socoop) : le startDate de ses données
 * structurées est l'ouverture des portes. Le début n'est écrit que sur la page du spectacle de
 * lastrolabe.org (« OUVERTURE DES PORTES À 20H, DÉBUT DE LA 1ÈRE PARTIE À 20H30 »), que la billetterie
 * ne relie pas : on la trouve dans les spectacles à venir de l'accueil du site (même jour, titre voisin).
 */

const ASTROLABE_SITE = "https://www.lastrolabe.org/";

export function isAstrolabeTicketingUrl(url: string) {
  try {
    return new URL(url).hostname === "billetterie.lastrolabe.org";
  } catch {
    return false;
  }
}

/** Mots qui ne distinguent pas deux spectacles (« + 1ÈRE PARTIE », articles). */
const COMMON_WORDS = new Set(["1ere", "1re", "partie", "premiere", "le", "la", "les", "de", "du", "des", "et", "en", "un", "une", "au", "aux"]);

function words(value: string) {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((word) => word.length > 1 && !COMMON_WORDS.has(word)),
  );
}

/** Mots communs aux deux titres, rapportés à l'ensemble (« RAZORLIGHT + 1ÈRE PARTIE » = « RAZORLIGHT »). */
function titleSimilarity(left: string, right: string) {
  const [a, b] = [words(left), words(right)];
  const common = [...a].filter((word) => b.has(word)).length;
  return common / Math.max(1, new Set([...a, ...b]).size);
}

/**
 * Page lastrolabe.org d'un spectacle de la billetterie, d'après les cartes de l'accueil (« 19.11.2026 -
 * 20H00 », « RAZORLIGHT + 1ÈRE PARTIE ») : même jour, et le titre le plus proche s'il y en a plusieurs.
 */
export function findAstrolabeProgramUrl($: CheerioDocument, show: { title?: string; date: string }): string | null {
  const [year, month, day] = show.date.slice(0, 10).split("-").map(Number);
  const candidates: Array<{ url: string; title: string }> = [];
  $("a[href*='/agenda/']").each((_index: number, element: any) => {
    const card = $(element);
    const match = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(card.text());
    if (!match || Number(match[1]) !== day || Number(match[2]) !== month || Number(match[3]) !== year) return;
    try {
      const url = new URL(card.attr("href") || "", ASTROLABE_SITE).toString();
      candidates.push({ url, title: decodeHtmlText(card.find("p").last().text() || card.text()) });
    } catch {
      // Lien illisible : carte ignorée.
    }
  });
  const scored = candidates
    .map((candidate) => ({ ...candidate, score: titleSimilarity(candidate.title, show.title || "") }))
    .sort((left, right) => right.score - left.score);
  const [best, second] = scored;
  return best && best.score > 0 && (!second || best.score > second.score) ? best.url : null;
}

/** Texte de la page lastrolabe.org d'un spectacle (résumé de partage et présentation), ou null. */
export async function readAstrolabeProgramText(show: { title?: string; date: string }): Promise<string | null> {
  try {
    const home = await fetchHtml(ASTROLABE_SITE);
    const url = findAstrolabeProgramUrl(cheerio.load(home.html), show);
    if (!url) return null;
    const $ = cheerio.load((await fetchHtml(url)).html);
    const description = $(".description-program-wrapper").first();
    return [
      $("meta[property='og:description']").attr("content"),
      description.length ? decodeHtmlText(description.html() || "", { multiline: true }) : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    // Site injoignable : l'heure de la billetterie reste, l'ouverture des portes n'est pas devinée.
    return null;
  }
}
