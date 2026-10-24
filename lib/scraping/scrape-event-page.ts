import * as cheerio from "cheerio";
import OpenAI from "openai";

import { AI_MODEL_FULL, AI_MODEL_LIGHT, generationParams } from "@/lib/ai/openai-models";
import { splitArtistNames } from "@/lib/events/artist-names";
import { isEventAudience, isEventBooking, toMinAge, type EventAudience, type EventBooking } from "@/lib/events/event-details";

import { fetchHtml, FetchHtmlError } from "./fetch-html";
import { isAstrolabeTicketingUrl, readAstrolabeProgramText } from "./astrolabe";
import { isBilletwebUrl, readBilletwebDetails } from "./billetweb";
import { checkDateAgainstText, findDoorsAndStart, parisToday, toParisWallClock } from "./dates";
import { isMapadoEventUrl, readMapadoPrices } from "./mapado";
import { onSortEventUid, scrapeOnSortEvent } from "./on-sort";
import {
  dateOptionsForPage,
  decodeHtmlText,
  extractEmbeddedDates,
  extractStructuredEvents,
  type CheerioDocument,
  type StructuredEvent,
} from "./structured-event";

/*
 * Lecture d'une page d'événement, par ordre de fiabilité :
 *   1. sélecteurs CSS configurés pour la source ;
 *   2. données structurées schema.org (JSON-LD, microdata), et billetteries lues à part : tarifs de
 *      Mapado (état de la page, ou page de la séance) et de Billetweb (boutique), début écrit sur la page
 *      de L'Astrolabe quand sa billetterie donne l'ouverture des portes ;
 *   3. IA, seulement pour ce qui manque (modèle léger si l'essentiel est déjà connu) ;
 *   4. métadonnées Open Graph.
 * Les dates sont rendues en heure murale de Paris (`YYYY-MM-DDTHH:mm:00`).
 * Les fiches de l'agenda On sort ! sont lues directement par son API (voir on-sort.ts).
 */

export interface ScrapedEventData {
  title?: string;
  description?: string;
  date?: string;
  end_date?: string;
  /** Autres dates du même événement (plusieurs séances), avec le lien de billetterie de chacune s'il est connu. */
  occurrences?: Array<{ date: string; end_date?: string; external_url?: string }>;
  /** Faux quand seule la date est connue, pas l'heure. */
  time_known?: boolean;
  price?: string;
  price_min?: number;
  price_max?: number;
  is_pay_what_you_want?: boolean;
  presale_price?: string;
  subscriber_price?: string;
  location?: string;
  address?: string;
  image_url?: string;
  external_url?: string;
  external_url_label?: string;
  organizer?: string;
  artists?: string[];
  category?: string;
  tags?: string[];
  /** Festival dont l'événement fait partie, quand la page le dit. */
  festival_name?: string;
  /** Page d'un festival entier : les lieux qu'elle nomme. */
  festival_venues?: string[];
  capacity?: string;
  door_opening_time?: string;
  is_full?: boolean;
  is_cancelled?: boolean;
  /** Jeune public annoncé par la source (catégorie de l'agenda). */
  is_young_audience?: boolean;
  /**
   * Genres, pour qui, âge minimum et réservation, quand la page les dit (../live/docs/chantiers/pour-toi.md, « Des
   * fiches plus riches ») : les genres par leur nom dans la liste de la catégorie (event_genres), le reste dans les
   * listes fermées de lib/events/event-details.ts. Rien n'est deviné.
   */
  genres?: string[];
  audience?: EventAudience;
  min_age?: number;
  booking?: EventBooking;
  /** Date douteuse (page qui se contredit) : à faire vérifier avant toute publication. */
  date_warning?: string;
  /** Correction appliquée à la date lue (année déduite du jour de la semaine). */
  date_note?: string;
}

export type ScrapeMethod = "structured" | "structured+ai" | "ai" | "basic";

export type ScrapeEventPageResult =
  | {
      ok: true;
      data: ScrapedEventData;
      metadata: {
        scraped: true;
        url: string;
        final_url: string;
        method: ScrapeMethod;
        ai_processed: boolean;
        ai_model?: string;
        structured_source?: StructuredEvent["source"];
        duration_ms: number;
      };
    }
  | { ok: false; error: string; status: number };

export interface ScrapeEventPageArgs {
  url: string;
  organizer_id?: string | null;
  location_id?: string | null;
  /** Client Supabase (serveur ou service) : configurations de scraping et catégories. */
  supabase: any;
  /** HTML déjà récupéré (évite un second téléchargement). */
  prefetched?: { html: string; finalUrl: string };
  /** Désactive l'IA (tests, cron économe). */
  disableAI?: boolean;
  /**
   * Ce que l'appelant sait déjà de l'événement (la reprise des fiches en base) : le titre et la date en repli, la
   * catégorie à la place de celle de la page ; donnés à l'IA comme « déjà connu ».
   */
  known?: { title?: string; date?: string; category?: string };
}


/* ------------------------------------------------------------------ */
/* Configuration de la source                                          */
/* ------------------------------------------------------------------ */

type SourceConfig = {
  cssData: Partial<Record<keyof ScrapedEventData, string>>;
  aiHints: Record<string, string>;
  /** Champs que l'IA peut remplir (null : tous). */
  aiFields: Set<string> | null;
  categories: string[];
  /** Genres actifs de chaque catégorie, par nom de catégorie, dans l'ordre de la liste. */
  genresByCategory: Record<string, string[]>;
};

/** Corrige les sélecteurs saisis sous forme d'attribut (`class="a b"`, `data-x="y"`). */
function normalizeConfiguredSelector(raw: string) {
  const selector = raw.trim();
  if (/^[.#[:]/.test(selector) || !selector.includes("=") || selector.includes("[")) return selector;
  const equalIndex = selector.indexOf("=");
  const attrName = selector.slice(0, equalIndex).trim();
  const quoted = /^(["'])(.*)\1$/.exec(selector.slice(equalIndex + 1).trim());
  if (!quoted) return `[${selector}]`;
  const attrValue = quoted[2];
  if (attrName === "class" || attrName === "className") {
    return attrValue
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => (/[[\]()]/.test(name) ? `[class*="${name}"]` : `.${name.replace(/([.#:])/g, "\\$1")}`))
      .join("");
  }
  if (attrName === "id") return `#${attrValue.replace(/([[\](){}.#:,_])/g, "\\$1")}`;
  return `[${attrName}="${attrValue.replace(/"/g, '\\"')}"]`;
}

async function loadSourceConfig($: CheerioDocument, args: ScrapeEventPageArgs): Promise<SourceConfig> {
  const config: SourceConfig = { cssData: {}, aiHints: {}, aiFields: null, categories: [], genresByCategory: {} };
  const { supabase, organizer_id, location_id } = args;

  const [cssResult, aiResult, categoriesResult, genresResult] = await Promise.all([
    organizer_id || location_id
      ? (organizer_id
          ? supabase.from("organizer_scraping_configs").select("*").eq("organizer_id", organizer_id)
          : supabase.from("organizer_scraping_configs").select("*").eq("location_id", location_id)
        ).then((result: any) => result, () => ({ data: null }))
      : Promise.resolve({ data: null }),
    organizer_id || location_id
      ? (organizer_id
          ? supabase.from("organizer_ai_fields").select("field_name, enabled, ai_hint").eq("organizer_id", organizer_id).is("location_id", null)
          : supabase.from("organizer_ai_fields").select("field_name, enabled, ai_hint").eq("location_id", location_id).is("organizer_id", null)
        ).then((result: any) => result, () => ({ data: null }))
      : Promise.resolve({ data: null }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .then((result: any) => result, () => ({ data: null })),
    // Sans la table (migration pas encore appliquée), la lecture marche sans genres.
    supabase
      .from("event_genres")
      .select("category_id, name, display_order")
      .eq("is_active", true)
      .then((result: any) => result, () => ({ data: null })),
  ]);

  for (const row of (cssResult?.data || []) as any[]) {
    try {
      const elements = $(normalizeConfiguredSelector(row.css_selector || ""));
      if (elements.length === 0) continue;
      let value: string | null | undefined;
      // Description lue en texte : son HTML, décodé plus bas bloc par bloc (`text()` colle les paragraphes).
      const descriptionHtml = row.event_field === "description" && !row.text_prefix?.trim();
      if (!row.attribute || row.attribute === "textContent") {
        value = descriptionHtml ? elements.first().html() : elements.first().text().trim();
      }
      else if (row.attribute === "innerHTML") value = elements.first().html();
      else value = elements.first().attr(row.attribute);
      if (!value) continue;
      if (row.text_prefix?.trim()) {
        const index = value.toLowerCase().indexOf(row.text_prefix.trim().toLowerCase());
        if (index === -1) continue;
        value = value.slice(index + row.text_prefix.trim().length).trim();
      }
      if (row.transform_function === "price") value = /[\d.,]+/.exec(value)?.[0]?.replace(",", ".") || value;
      if (value) config.cssData[row.event_field as keyof ScrapedEventData] = value;
    } catch {
      // Un sélecteur invalide n'empêche pas le reste.
    }
  }

  const aiRows = (aiResult?.data || []) as Array<{ field_name: string; enabled: boolean; ai_hint: string | null }>;
  if (aiRows.length > 0) {
    config.aiFields = new Set(aiRows.filter((row) => row.enabled).map((row) => row.field_name));
    for (const row of aiRows) if (row.ai_hint) config.aiHints[row.field_name] = row.ai_hint;
  }
  const categories = (categoriesResult?.data || []) as Array<{ id: string; name: string }>;
  config.categories = categories.map((row) => row.name);
  const genres = ((genresResult?.data || []) as Array<{ category_id: string; name: string; display_order: number }>)
    .slice()
    .sort((left, right) => left.display_order - right.display_order);
  for (const genre of genres) {
    const category = categories.find((row) => row.id === genre.category_id)?.name;
    if (category) (config.genresByCategory[category] ||= []).push(genre.name);
  }
  return config;
}

/* ------------------------------------------------------------------ */
/* Lecture de la page                                                  */
/* ------------------------------------------------------------------ */

function readMeta($: CheerioDocument) {
  const meta: Record<string, string> = {};
  $("meta[property], meta[name]").each((_index: number, element: any) => {
    const key = ($(element).attr("property") || $(element).attr("name") || "").toLowerCase();
    const content = $(element).attr("content");
    if (key && content && !meta[key]) meta[key] = content;
  });
  return meta;
}

const TITLE_NOISE = /^(billetterie|billets?|tickets?|r[ée]servation|r[ée]server|accueil|home|agenda)\b|billetterie officielle|^billetweb$|^weezevent$|^helloasso$|^shotgun$|^mapado$/i;

/** Retire « Billetterie : », le nom du site et les suffixes de billetterie d'un titre. */
function cleanTitle(raw: string | undefined, siteNames: string[]) {
  if (!raw) return undefined;
  let title = decodeHtmlText(raw).replace(/^(billetterie|billets?|tickets?)\s*[:–-]\s*/i, "");
  const normalizedSites = siteNames.map((name) => name.toLowerCase()).filter(Boolean);
  for (let guard = 0; guard < 4; guard += 1) {
    const match = /^(.*\S)\s+[|–—-]\s+([^|–—]+)$/.exec(title);
    if (!match) break;
    const suffix = match[2].trim().toLowerCase();
    const isSite = normalizedSites.some((site) => suffix === site || site.includes(suffix) || suffix.includes(site));
    if (!isSite && !TITLE_NOISE.test(suffix)) break;
    title = match[1].trim();
  }
  return title || undefined;
}

function mainText($: CheerioDocument, maxLength: number) {
  const $copy = cheerio.load($.html());
  $copy(
    "script, style, noscript, svg, iframe, form, nav, aside, [role='navigation'], [aria-hidden='true'], .cookie, .cookies, .cookie-banner, #cookie-banner, .gdpr, .newsletter",
  ).remove();
  // En-tête et pied de page du site, mais pas ceux d'un article (titre et date de la fiche).
  $copy("header, footer")
    .filter((_index: number, element: any) => $copy(element).closest("article, main").length === 0)
    .remove();
  // Un bloc par ligne : « mercredi 7 octobre » et « 18h » ne se collent pas en « octobre18h ».
  $copy("br").replaceWith("\n");
  $copy("p, div, li, h1, h2, h3, h4, h5, h6, tr, td, th, dt, dd, section, article, header, footer, time").append("\n");
  let best = "";
  for (const selector of ["main", "article", "[role='main']", "#content", ".content", ".event", ".event-details", ".entry-content"]) {
    const text = $copy(selector).first().text();
    if (text.length > best.length) best = text;
  }
  if (best.trim().length < 300) best = $copy("body").text();
  return best.replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength);
}

function absolute(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/**
 * Visuel principal d'une page sans image de partage (WordPress sans og:image, par exemple) :
 * image mise en avant, sinon la plus grande image du contenu, hors logos, icônes et décors.
 */
function mainImage($: CheerioDocument, pageUrl: string) {
  const declared = $("link[rel='image_src']").attr("href") || $("meta[itemprop='image']").attr("content");
  if (declared) return absolute(declared, pageUrl);
  let best: { src: string; score: number } | undefined;
  $("img").each((_index: number, element: any) => {
    const $img = $(element);
    const chrome = $img.closest("header, footer, nav, aside, [role='banner'], [role='contentinfo']");
    if (chrome.length && chrome.closest("article, main").length === 0) return;
    const src =
      $img.attr("src") || $img.attr("data-src") || $img.attr("data-lazy-src") || ($img.attr("srcset") || "").trim().split(/\s+/)[0];
    if (!src || src.startsWith("data:") || /\.svg(\?|$)/i.test(src) || /(logo|icon|avatar|sprite|placeholder|spinner|emoji)/i.test(src)) {
      return;
    }
    const width = Number($img.attr("width")) || 0;
    const height = Number($img.attr("height")) || 0;
    if ((width && width < 200) || (height && height < 200)) return;
    const featured = $img.is("[fetchpriority='high'], .wp-post-image, .attachment-large, .attachment-full");
    const score = (width * height || 10_000) * (featured ? 4 : 1);
    if (!best || score > best.score) best = { src, score };
  });
  return best ? absolute(best.src, pageUrl) : undefined;
}

/** « Drache Nationale - Théâtre de la Tête Noire » → « Drache Nationale » : le lieu a sa fiche. */
function withoutLocationSuffix(title: string | undefined, location: string | undefined) {
  if (!title || !location) return title;
  const match = /^(.*\S)\s+[-–—|]\s+([^-–—|]+)$/.exec(title);
  const comparable = (value: string) =>
    value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return match && comparable(match[2]) === comparable(location) ? match[1].trim() : title;
}

function sameUrl(a?: string, b?: string) {
  if (!a || !b) return false;
  const normalize = (value: string) => value.replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  return normalize(a) === normalize(b);
}

/** Événement principal de la page parmi les données structurées. */
function pickPrimaryEvent(events: StructuredEvent[], pageUrl: string) {
  if (events.length === 0) return undefined;
  const today = parisToday();
  return (
    events.find((event) => sameUrl(event.url, pageUrl)) ||
    events.find((event) => event.date && event.date.slice(0, 10) >= today) ||
    events[0]
  );
}

/* ------------------------------------------------------------------ */
/* IA                                                                  */
/* ------------------------------------------------------------------ */

const NULLABLE_STRING = { type: ["string", "null"] };

const FULL_FIELDS: Record<string, unknown> = {
  title: NULLABLE_STRING,
  description: NULLABLE_STRING,
  date: { type: ["string", "null"], description: "Début, heure de Paris, format YYYY-MM-DDTHH:mm" },
  end_date: { type: ["string", "null"], description: "Fin, heure de Paris, format YYYY-MM-DDTHH:mm" },
  other_dates: {
    type: "array",
    description: "Autres séances du même événement",
    items: {
      type: "object",
      additionalProperties: false,
      properties: { date: { type: "string" }, end_date: NULLABLE_STRING },
      required: ["date", "end_date"],
    },
  },
  location: NULLABLE_STRING,
  address: NULLABLE_STRING,
  organizer: NULLABLE_STRING,
  artists: { type: "array", items: { type: "string" } },
  category: NULLABLE_STRING,
  tags: { type: "array", items: { type: "string" } },
  price_min: { type: ["number", "null"] },
  price_max: { type: ["number", "null"] },
  is_free: { type: ["boolean", "null"] },
  is_pay_what_you_want: { type: ["boolean", "null"] },
  is_full: { type: ["boolean", "null"] },
  is_cancelled: { type: ["boolean", "null"] },
  door_opening_time: { type: ["string", "null"], description: "HH:mm" },
  capacity: { type: ["integer", "null"] },
  image_url: NULLABLE_STRING,
  festival: NULLABLE_STRING,
  festival_venues: { type: "array", items: { type: "string" } },
  genres: { type: "array", items: { type: "string" } },
  audience: { type: ["string", "null"], description: "all | family | teens | adults" },
  min_age: { type: ["integer", "null"] },
  booking: { type: ["string", "null"], description: "none | reservation | online" },
};

/** Champs réglables par source dans « Champs IA » (organizer_ai_fields). */
const LEGACY_AI_FIELDS = new Set([
  "title",
  "description",
  "date",
  "end_date",
  "price",
  "location",
  "address",
  "image_url",
  "organizer",
  "category",
  "tags",
  "capacity",
  "door_opening_time",
  "is_full",
]);

const COMPLEMENT_FIELDS = [
  "description",
  "category",
  "tags",
  "artists",
  "festival",
  "festival_venues",
  "door_opening_time",
  "price_min",
  "price_max",
  "is_free",
  "is_pay_what_you_want",
  "genres",
  "audience",
  "min_age",
  "booking",
];

const FIELD_GUIDANCE: Record<string, string> = {
  title: "titre exact de l'événement, sans le nom du lieu ni de la billetterie",
  description: "présentation fidèle (3 à 6 phrases), sans inventer",
  date: "date et heure de début (heure du spectacle, pas l'ouverture des portes)",
  end_date: "fin si indiquée ou déductible d'une durée explicite",
  other_dates: "autres séances du même événement",
  location: "nom du lieu",
  address: "adresse postale",
  organizer: "structure organisatrice",
  artists: "artistes musicaux programmés : musiciens, chanteurs, groupes, DJ (noms seuls) ; ni compagnie, ni comédien, ni danseur, ni intervenant",
  category: "catégorie",
  tags: "3 à 5 mots-clés courts en minuscules (style, public, thème)",
  price_min:
    "tarif le plus bas ouvert à tous, en euros (réduit, prévente, sur place, enfant) ; jamais un tarif réservé (abonnés, adhérents, carte du lieu, groupes, scolaires, CE, élèves du conservatoire)",
  price_max: "tarif le plus haut ouvert à tous, en euros, si différent",
  is_free: "gratuit / entrée libre",
  is_pay_what_you_want: "prix libre / participation libre",
  is_full: "complet / sold out",
  is_cancelled: "annulé",
  door_opening_time: "ouverture des portes",
  capacity: "jauge",
  image_url: "image principale",
  festival:
    "nom du festival dont l'événement fait partie, seulement si la page le dit (« dans le cadre du festival X », titre « Festival X – soirée Y »), sans numéro d'édition ni année ; null pour la page d'un festival entier, ou quand un festival est seulement cité (un prix reçu à Cannes)",
  festival_venues:
    "page d'un festival entier seulement : les lieux où il se tient, tels qu'écrits, un par élément ; sinon liste vide",
  genres: "genres de l'événement, seulement parmi ceux de sa catégorie (liste plus bas), écrits tels quels",
  audience:
    "pour qui, seulement si la page le dit : « all » (tout public, même avec un âge minimum), « family » (jeune public, en famille, pour les enfants), « teens » (ados, ou une tranche d'âge qui finit avant 18 ans), « adults » (public adulte, interdit ou déconseillé aux mineurs)",
  min_age:
    "âge minimum annoncé, en années : « dès 6 ans » 6, « à partir de 18 mois » 2, « déconseillé aux moins de 12 ans » 12 ; null sans âge écrit",
  booking:
    "réservation, seulement si la page le dit : « none » (sans réservation, places sur place sans réserver), « reservation » (sur réservation ou inscription : téléphone, e-mail, formulaire), « online » (billets vendus en ligne : lien ou bouton de billetterie)",
};

async function extractWithAI(args: {
  mode: "full" | "complement";
  url: string;
  context: string;
  known: Partial<ScrapedEventData>;
  config: SourceConfig;
  /** Champs ajoutés au complément (ex. titre peu lisible). */
  extraFields?: string[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseFields = args.mode === "full" ? Object.keys(FULL_FIELDS) : [...(args.extraFields || []), ...COMPLEMENT_FIELDS];
  const fieldNames = baseFields.filter((field) => {
    if (!args.config.aiFields) return true;
    const configKey =
      field.startsWith("price") || field === "is_free" || field === "is_pay_what_you_want"
        ? "price"
        : field === "other_dates"
          ? "date"
          : field;
    // Les champs absents des réglages historiques (artistes, annulation…) restent toujours permis.
    return !LEGACY_AI_FIELDS.has(configKey) || args.config.aiFields.has(configKey);
  });
  if (fieldNames.length === 0) return null;

  const properties = Object.fromEntries(fieldNames.map((field) => [field, FULL_FIELDS[field]]));
  const today = parisToday();
  const categoryRule = args.config.categories.length
    ? `- « category » : choisis exactement une valeur parmi ${args.config.categories.join(", ")} (ou null).`
    : "";
  const genreLists = Object.entries(args.config.genresByCategory);
  const genreRule =
    fieldNames.includes("genres") && genreLists.length
      ? `- « genres » : ceux de la catégorie de l'événement, parmi ${genreLists
          .map(([category, names]) => `${category} (${names.join(", ")})`)
          .join(" ; ")} ; liste vide si la page ne permet pas de le dire ou si sa catégorie n'en a pas.`
      : "";
  const hints = Object.entries(args.config.aiHints)
    .map(([field, hint]) => `- ${field} : ${hint}`)
    .join("\n");

  const prompt = `Extrais les informations de l'événement décrit par cette page web.

Champs attendus :
${fieldNames.map((field) => `- ${field} : ${FIELD_GUIDANCE[field] || field}`).join("\n")}

Règles :
- N'invente rien : null (ou liste vide) si l'information n'est pas sur la page.
- Dates en heure locale de Paris, format YYYY-MM-DDTHH:mm, sans fuseau. Nous sommes le ${today}.
  Sans année explicite, prends l'année où le jour de la semaine écrit correspond (« mercredi 7 octobre »),
  sinon la prochaine occurrence ; un événement déjà passé garde sa date passée.
${categoryRule}
${genreRule}
${hints ? `Consignes propres à cette source :\n${hints}` : ""}
${Object.keys(args.known).length ? `Déjà connu (ne pas contredire) : ${JSON.stringify(args.known)}` : ""}

Page : ${args.url}
${args.context}`;

  const model = args.mode === "full" ? AI_MODEL_FULL : AI_MODEL_LIGHT;
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    ...generationParams(model, { temperature: 0.1, maxTokens: args.mode === "full" ? 1800 : 700 }),
    messages: [
      {
        role: "system",
        content: "Tu extrais des informations d'événements culturels depuis des pages web françaises, avec exactitude et sans invention.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "event_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties,
          required: fieldNames,
        },
      },
    },
  });

  try {
    return { model, data: JSON.parse(completion.choices[0]?.message?.content || "{}") as Record<string, any> };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                      */
/* ------------------------------------------------------------------ */

function cleanList(values: unknown, max: number) {
  if (!Array.isArray(values)) return undefined;
  const cleaned = Array.from(
    new Set(values.map((value) => (typeof value === "string" ? decodeHtmlText(value) : "")).filter((value) => value.length > 1 && value.length < 80)),
  ).slice(0, max);
  return cleaned.length ? cleaned : undefined;
}

/** Titre recopié d'une URL (« atelier-crochet-sam-17/10 ») : à remplacer si possible. */
function looksLikeSlug(title: string) {
  return !/\s/.test(title) && /[-_/]/.test(title);
}

function firstDefined<T>(...values: Array<T | null | undefined>) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? undefined;
}

/** Billetteries dont les tarifs (et la description) ne sont pas dans les données structurées de la page. */
async function readTicketingDetails(
  $: CheerioDocument,
  pageUrl: string,
): Promise<{ description?: string; min?: number; max?: number }> {
  if (isMapadoEventUrl(pageUrl)) return readMapadoPrices($, pageUrl);
  if (isBilletwebUrl(pageUrl)) return readBilletwebDetails($, pageUrl);
  return {};
}

/** Même jour à l'heure `time` (`HH:mm`), le lendemain pour un début après minuit (portes à 23h, début à 0h30). */
function atTime(date: string, time: string) {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (time < date.slice(11, 16) && time < "06:00") day.setUTCDate(day.getUTCDate() + 1);
  return `${day.toISOString().slice(0, 10)}T${time}:00`;
}

/**
 * Heure lue = ouverture des portes (la page le dit, ou la source donne l'ouverture pour le début, comme la
 * billetterie de L'Astrolabe, dont le début écrit l'emporte toujours) : le début écrit sur la page
 * (« OUVERTURE DES PORTES À 15H, DÉBUT À 15H30 ») la remplace et l'ouverture va dans door_opening_time.
 */
function applyDoorsAndStart(data: ScrapedEventData, written: { doors?: string; start?: string }, doorsAsStart: boolean) {
  if (!data.date) return;
  const time = data.date.slice(11, 16);
  const doors = written.doors ?? (doorsAsStart ? time : undefined);
  if (written.start && written.start !== time && (doors === time || doorsAsStart)) {
    const start = written.start;
    const doorsAt = doors ? `${data.date.slice(0, 11)}${doors}:00` : undefined;
    data.date = atTime(data.date, start);
    if (data.end_date && data.end_date <= data.date) delete data.end_date;
    data.occurrences = data.occurrences?.map((occurrence) =>
      occurrence.date.slice(11, 16) === time ? { ...occurrence, date: atTime(occurrence.date, start) } : occurrence,
    );
    // L'ouverture précède le début (une billetterie en retard sur le site ne la met pas après).
    if (doors && doorsAt && doorsAt < data.date) data.door_opening_time = doors;
    else delete data.door_opening_time;
  } else if (!data.door_opening_time && written.doors && written.doors < time) {
    data.door_opening_time = written.doors;
  }
}

export async function scrapeEventPage(args: ScrapeEventPageArgs): Promise<ScrapeEventPageResult> {
  const startedAt = Date.now();
  try {
    new URL(args.url);
  } catch {
    return { ok: false, error: "URL invalide", status: 400 };
  }

  // Agenda On sort ! (Orléans Métropole) : pages vides sans JavaScript, la fiche vient de l'API publique.
  if (onSortEventUid(args.url)) return scrapeOnSortEvent(args.url);

  let page: { html: string; finalUrl: string };
  try {
    page = args.prefetched ?? (await fetchHtml(args.url));
  } catch (error) {
    const status = error instanceof FetchHtmlError ? error.status : 502;
    return { ok: false, error: error instanceof Error ? error.message : "Page inaccessible", status };
  }

  const $ = cheerio.load(page.html);
  const meta = readMeta($);
  const siteNames = [meta["og:site_name"], meta["application-name"], new URL(page.finalUrl).hostname.replace(/^www\./, "").split(".")[0]]
    .filter(Boolean) as string[];
  const structuredEvents = extractStructuredEvents($, page.finalUrl);
  const primary = pickPrimaryEvent(structuredEvents, page.finalUrl);
  const config = await loadSourceConfig($, args);
  const css = config.cssData;

  // Le nom structuré est parfois celui du lieu ou de l'organisateur : on l'écarte alors.
  const genericNames = [...siteNames, primary?.location, primary?.organizer]
    .filter(Boolean)
    .map((value) => (value as string).toLowerCase());
  const structuredTitle =
    primary?.title && !genericNames.includes(primary.title.toLowerCase()) ? primary.title : undefined;

  // Les sélecteurs lisent souvent un attribut technique (`datetime`), en UTC sur les pages Odoo.
  const pageDateOptions = dateOptionsForPage($);
  const cssStart = toParisWallClock(css.date, undefined, pageDateOptions);
  const cssEnd = toParisWallClock(css.end_date, undefined, pageDateOptions);
  // Autres séances : chacune garde son lien (Fleury : deux séances le même jour, `?session=335` et `?session=336`).
  const otherStructured = structuredEvents
    .filter((event) => event !== primary && event.date && primary?.title && event.title === primary.title)
    .map((event) => ({ date: event.date as string, end_date: event.end_date, external_url: event.ticket_url || event.url }));
  // Mapado et Billetweb : tarifs ouverts au public lus à part (page de la séance, boutique).
  const ticketing = await readTicketingDetails($, page.finalUrl);
  const ticketingMax = ticketing.min !== undefined && ticketing.max !== undefined && ticketing.max > ticketing.min ? ticketing.max : undefined;

  const data: ScrapedEventData = {
    title: firstDefined(
      css.title ? decodeHtmlText(css.title) : undefined,
      structuredTitle,
      cleanTitle(meta["og:title"], siteNames),
      cleanTitle($("h1").first().text(), siteNames),
      cleanTitle($("title").first().text(), siteNames),
    ),
    description: firstDefined(
      css.description ? decodeHtmlText(css.description, { multiline: true }) : undefined,
      ticketing.description,
      primary?.description,
    ),
    date: cssStart?.value ?? primary?.date,
    end_date: cssEnd?.value ?? primary?.end_date,
    time_known: cssStart ? cssStart.timeKnown : primary?.time_known,
    occurrences: otherStructured.length ? otherStructured : undefined,
    location: firstDefined(css.location, primary?.location),
    address: firstDefined(css.address, primary?.address),
    image_url: firstDefined(
      absolute(css.image_url, page.finalUrl),
      primary?.image_url,
      absolute(meta["og:image"] || meta["og:image:url"] || meta["twitter:image"], page.finalUrl),
      mainImage($, page.finalUrl),
    ),
    external_url: primary?.ticket_url || page.finalUrl,
    organizer: firstDefined(css.organizer, primary?.organizer),
    artists: primary?.artists,
    price_min:
      css.price !== undefined && Number.isFinite(Number(css.price)) ? Number(css.price) : (ticketing.min ?? primary?.price_min),
    price_max: ticketing.min !== undefined ? ticketingMax : primary?.price_max,
    is_full: primary?.is_full,
    is_cancelled: primary?.is_cancelled,
    door_opening_time: css.door_opening_time,
    capacity: css.capacity,
    category: css.category,
  };
  if (primary?.is_free) data.price_min = 0;
  if (args.known?.title && !data.title) data.title = args.known.title;
  if (args.known?.date && !data.date) {
    data.date = args.known.date;
    data.time_known = true;
  }
  if (args.known?.category) data.category = args.known.category;

  const weakTitle = !data.title || looksLikeSlug(data.title);
  const hasEssentials = Boolean(data.title && !weakTitle && data.date);
  const missingComplement =
    !data.description ||
    !data.category ||
    !data.artists?.length ||
    data.price_min === undefined ||
    !data.genres?.length ||
    !data.audience ||
    !data.booking;
  let method: ScrapeMethod = primary ? "structured" : "basic";
  let aiModel: string | undefined;

  if (!args.disableAI && (!hasEssentials || missingComplement)) {
    const fullMode = !hasEssentials;
    const embeddedDates = extractEmbeddedDates($);
    const context = [
      `Titre de la page : ${$("title").first().text().trim()}`,
      meta["og:title"] ? `Titre de partage : ${meta["og:title"]}` : "",
      meta["og:description"] || meta.description ? `Résumé : ${meta["og:description"] || meta.description}` : "",
      embeddedDates.length ? `Dates présentes dans les données techniques : ${embeddedDates.join(", ")}` : "",
      `Contenu :\n${mainText($, fullMode ? 12_000 : 6_000)}`,
    ]
      .filter(Boolean)
      .join("\n");
    const known = Object.fromEntries(
      Object.entries({
        title: weakTitle ? undefined : data.title,
        date: data.date,
        location: data.location,
        category: data.category,
        price_min: data.price_min,
      }).filter(([, value]) => value !== undefined),
    );

    try {
      const ai = await extractWithAI({
        mode: fullMode ? "full" : "complement",
        url: page.finalUrl,
        context,
        known,
        config,
        extraFields: weakTitle ? ["title"] : undefined,
      });
      if (ai) {
        aiModel = ai.model;
        method = primary ? "structured+ai" : "ai";
        const extracted = ai.data;
        const aiStart = toParisWallClock(extracted.date);
        const aiEnd = toParisWallClock(extracted.end_date);
        if ((weakTitle || !data.title) && extracted.title) data.title = decodeHtmlText(extracted.title);
        data.description = data.description || extracted.description || undefined;
        if (!data.date && aiStart) {
          data.date = aiStart.value;
          data.time_known = aiStart.timeKnown;
        }
        if (!data.end_date && aiEnd && (!data.date || aiEnd.value > data.date)) data.end_date = aiEnd.value;
        if (!data.occurrences && Array.isArray(extracted.other_dates)) {
          const occurrences = extracted.other_dates
            .map((entry: any) => ({ start: toParisWallClock(entry?.date), end: toParisWallClock(entry?.end_date) }))
            .filter((entry: any) => entry.start && entry.start.value !== data.date)
            .map((entry: any) => ({ date: entry.start.value, end_date: entry.end?.value }));
          if (occurrences.length) data.occurrences = occurrences.slice(0, 20);
        }
        data.location = data.location || extracted.location || undefined;
        data.address = data.address || extracted.address || undefined;
        data.organizer = data.organizer || extracted.organizer || undefined;
        data.artists = data.artists?.length ? data.artists : cleanList(extracted.artists, 20);
        data.festival_name = data.festival_name || (typeof extracted.festival === "string" ? decodeHtmlText(extracted.festival) : "") || undefined;
        data.festival_venues = data.festival_venues?.length ? data.festival_venues : cleanList(extracted.festival_venues, 10);
        data.category = data.category || extracted.category || undefined;
        data.tags = cleanList(extracted.tags, 6)?.map((tag) => tag.toLowerCase());
        data.genres = data.genres?.length ? data.genres : cleanList(extracted.genres, 4);
        if (!data.audience && isEventAudience(extracted.audience)) data.audience = extracted.audience;
        if (data.min_age === undefined) data.min_age = toMinAge(extracted.min_age) ?? undefined;
        if (!data.booking && isEventBooking(extracted.booking)) data.booking = extracted.booking;
        if (data.price_min === undefined) {
          if (extracted.is_free) data.price_min = 0;
          else if (typeof extracted.price_min === "number") data.price_min = extracted.price_min;
        }
        if (data.price_max === undefined && typeof extracted.price_max === "number" && extracted.price_max !== data.price_min) {
          data.price_max = extracted.price_max;
        }
        if (extracted.is_pay_what_you_want) data.is_pay_what_you_want = true;
        data.is_full = data.is_full ?? (extracted.is_full || undefined);
        data.is_cancelled = data.is_cancelled ?? (extracted.is_cancelled || undefined);
        if (!data.door_opening_time && /^\d{1,2}:\d{2}$/.test(extracted.door_opening_time || "")) {
          data.door_opening_time = extracted.door_opening_time.padStart(5, "0");
        }
        if (!data.capacity && Number.isInteger(extracted.capacity)) data.capacity = String(extracted.capacity);
        data.image_url = data.image_url || absolute(extracted.image_url, page.finalUrl);
      }
    } catch (error) {
      console.error("Extraction IA impossible:", error);
    }
  }

  // Résumé de partage en dernier recours pour la description.
  if (!data.description) {
    const summary = meta["og:description"] || meta.description;
    if (summary) data.description = decodeHtmlText(summary, { multiline: true });
  }
  data.title = withoutLocationSuffix(data.title, data.location);
  const pageText = data.date ? mainText($, 12_000) : "";

  // Ouverture des portes lue pour le début : la billetterie de L'Astrolabe la donne toujours, son début
  // n'est écrit que dans sa présentation, sinon sur la page du spectacle de lastrolabe.org.
  if (data.date && data.time_known !== false) {
    const doorsAsStart = isAstrolabeTicketingUrl(page.finalUrl);
    let written = findDoorsAndStart([primary?.description, meta["og:description"], pageText]);
    if (doorsAsStart && !written.start) {
      written = findDoorsAndStart([await readAstrolabeProgramText({ title: data.title, date: data.date })]);
    }
    applyDoorsAndStart(data, written, doorsAsStart);
  }

  // Date confrontée aux jours de semaine écrits sur la page : « mercredi 7 octobre » fixe l'année
  // (2026 et non 2027) ; « dimanche 11 novembre 2026 » (un mercredi) rend la date douteuse.
  if (data.date) {
    const pageTexts = [data.title, meta["og:title"], meta["og:description"], pageText];
    const check = checkDateAgainstText(data.date, pageTexts);
    if (check.corrected) {
      const [wrongYear, rightYear] = [data.date.slice(0, 4), check.value.slice(0, 4)];
      data.date_note = `Année corrigée d'après le jour de la semaine écrit sur la page (${wrongYear} → ${rightYear}).`;
      data.date = check.value;
      if (data.end_date?.startsWith(wrongYear)) data.end_date = `${rightYear}${data.end_date.slice(4)}`;
    } else if (check.warning) {
      data.date_warning = check.warning;
    }
    data.occurrences = data.occurrences?.map((occurrence) => {
      const fixed = checkDateAgainstText(occurrence.date, pageTexts);
      return fixed.corrected ? { ...occurrence, date: fixed.value } : occurrence;
    });
  }
  if (data.price_min !== undefined) data.price = String(data.price_min);
  // Une ouverture des portes identique au début n'apporte rien (souvent déduite à tort).
  if (data.door_opening_time && data.date?.slice(11, 16) === data.door_opening_time) delete data.door_opening_time;
  // Plateaux « A + B » et mentions « 1ère partie » (« RAZORLIGHT + 1ÈRE PARTIE ») : un nom par artiste.
  const artists = splitArtistNames(data.artists);
  data.artists = artists.length ? artists : undefined;

  for (const key of Object.keys(data) as Array<keyof ScrapedEventData>) {
    if (data[key] === undefined || data[key] === null || data[key] === "") delete data[key];
  }

  return {
    ok: true,
    data,
    metadata: {
      scraped: true,
      url: args.url,
      final_url: page.finalUrl,
      method,
      ai_processed: Boolean(aiModel),
      ai_model: aiModel,
      structured_source: primary?.source,
      duration_ms: Date.now() - startedAt,
    },
  };
}
