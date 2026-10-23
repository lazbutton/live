import * as cheerio from "cheerio";

import { toParisWallClock, type ParisWallClockOptions } from "./dates";
import { publicPriceRange, type Tariff } from "./prices";

/*
 * Extraction des données structurées schema.org (JSON-LD et microdata) que
 * publient la plupart des billetteries (Billetweb, Weezevent, Shotgun…) et
 * des CMS d'agenda. Ces données sont exactes : elles passent avant l'IA.
 */

export type StructuredEvent = {
  title?: string;
  description?: string;
  /** Heure murale de Paris (`YYYY-MM-DDTHH:mm:00`). */
  date?: string;
  end_date?: string;
  time_known?: boolean;
  location?: string;
  address?: string;
  image_url?: string;
  url?: string;
  organizer?: string;
  artists?: string[];
  price_min?: number;
  price_max?: number;
  is_free?: boolean;
  is_full?: boolean;
  is_cancelled?: boolean;
  ticket_url?: string;
  source: "json-ld" | "microdata";
};

type SchemaNode = Record<string, any>;

/** Document chargé par cheerio (types compatibles avec @types/cheerio). */
export type CheerioDocument = ReturnType<typeof cheerio.load>;

const EVENT_TYPE_PATTERN = /(?:^|[/#])(?:\w*Event|Festival)$/i;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Balises de bloc : leur présence fait lire la valeur comme du HTML. */
const HTML_BLOCK = /<(?:p|br|div|li|ul|ol|h[1-6]|section|article|blockquote|tr|table)\b/i;

/**
 * Décode les entités HTML et retire les balises d'une valeur textuelle. En plusieurs lignes, du HTML
 * se lit comme dans un navigateur : retours à la ligne du source repliés en espaces (« la quête
 * ⏎ amoureuse »), un paragraphe par bloc, une ligne par élément de liste (« • ») ; un texte brut
 * garde ses lignes.
 */
export function decodeHtmlText(value: string, { multiline = false } = {}) {
  const html = multiline && HTML_BLOCK.test(value);
  const withBreaks = (html ? value.replace(/\s+/g, " ") : value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|section|article|blockquote|ul|ol|table)>/gi, "\n\n")
    .replace(/<\/(li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ");
  const text = cheerio.load(`<div id="decode">${withBreaks}</div>`)("#decode").text().replace(/\u00a0/g, " ");
  if (!multiline) return text.replace(/\s+/g, " ").trim();
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}(?=• )/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textOf(value: unknown, multiline = false): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const decoded = decodeHtmlText(value, { multiline });
  return decoded || undefined;
}

function nameOf(value: unknown): string | undefined {
  for (const entry of asArray(value as any)) {
    if (typeof entry === "string") {
      const text = textOf(entry);
      if (text) return text;
    } else if (entry && typeof entry === "object") {
      const text = textOf(entry.name) || textOf(entry.legalName);
      if (text) return text;
    }
  }
  return undefined;
}

function namesOf(value: unknown): string[] {
  const names = asArray(value as any)
    .map((entry) => (typeof entry === "string" ? textOf(entry) : textOf(entry?.name)))
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names));
}

function absoluteUrl(value: unknown, baseUrl: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim(), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function imageOf(value: unknown, baseUrl: string): string | undefined {
  for (const entry of asArray(value as any)) {
    const candidate =
      typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.url || entry.contentUrl : undefined;
    const url = absoluteUrl(candidate, baseUrl);
    if (url) return url;
  }
  return undefined;
}

function addressOf(value: unknown): string | undefined {
  for (const entry of asArray(value as any)) {
    if (typeof entry === "string") {
      const text = textOf(entry);
      if (text) return text;
    } else if (entry && typeof entry === "object") {
      const parts = [entry.streetAddress, [entry.postalCode, entry.addressLocality].filter(Boolean).join(" ")]
        .map((part) => textOf(part))
        .filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
  }
  return undefined;
}

function placeOf(value: unknown): { name?: string; address?: string } {
  for (const entry of asArray(value as any)) {
    if (typeof entry === "string") {
      const text = textOf(entry);
      if (text) return { name: text };
    } else if (entry && typeof entry === "object") {
      if (/VirtualLocation/i.test(String(entry["@type"] || ""))) continue;
      const name = textOf(entry.name);
      const address = addressOf(entry.address);
      if (name || address) return { name, address: address && address !== name ? address : undefined };
    }
  }
  return {};
}

function parsePrice(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string") return undefined;
  const match = /(\d+(?:[.,]\d{1,2})?)/.exec(value.replace(/\s/g, ""));
  if (!match) return undefined;
  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Nom d'une offre (« Prévente », « Abonné.e ») et sa catégorie, pour écarter les tarifs réservés. */
function tariffName(offer: SchemaNode) {
  return [textOf(offer.name), textOf(offer.category)].filter(Boolean).join(" ");
}

function offersOf(value: unknown, baseUrl: string) {
  const tariffs: Tariff[] = [];
  let soldOut = false;
  let anyAvailable = false;
  let ticketUrl: string | undefined;
  for (const offer of asArray(value as any)) {
    if (!offer || typeof offer !== "object") continue;
    const name = tariffName(offer);
    const description = textOf(offer.description);
    for (const key of ["price", "lowPrice", "highPrice"]) {
      const price = parsePrice(offer[key]);
      if (price !== undefined) tariffs.push({ name, description, price });
    }
    for (const nested of asArray(offer.offers)) {
      const price = parsePrice(nested?.price);
      if (price !== undefined) tariffs.push({ name: tariffName(nested) || name, description: textOf(nested?.description), price });
    }
    const availability = String(offer.availability || "");
    if (/SoldOut/i.test(availability)) soldOut = true;
    else if (availability) anyAvailable = true;
    ticketUrl = ticketUrl || absoluteUrl(offer.url, baseUrl);
  }
  // Tarifs ouverts au public : « Abonné.e » 20 € n'est pas le prix d'un concert à 25 € en prévente.
  const range = publicPriceRange(tariffs);
  return {
    priceMin: range.min,
    priceMax: range.max,
    soldOut: soldOut && !anyAvailable,
    ticketUrl,
  };
}

function isEventNode(node: SchemaNode) {
  return asArray(node["@type"]).some((type) => EVENT_TYPE_PATTERN.test(String(type)));
}

/**
 * Odoo écrit ses dates en UTC sans fuseau (`<meta itemprop="startDate" content="2026-10-21T16:45:00">`,
 * `<time datetime="2026-10-21 16:45:00">`) ; seul le texte affiché est à l'heure de Paris.
 */
export function dateOptionsForPage($: CheerioDocument): ParisWallClockOptions {
  return { naiveUtc: $('meta[name="generator"][content^="Odoo"]').length > 0 };
}

/** Convertit un nœud schema.org Event (JSON-LD ou microdata) au format commun. */
function mapSchemaEvent(
  node: SchemaNode,
  baseUrl: string,
  source: StructuredEvent["source"],
  dateOptions: ParisWallClockOptions,
): StructuredEvent | null {
  const start = toParisWallClock(Array.isArray(node.startDate) ? node.startDate[0] : node.startDate, undefined, dateOptions);
  const end = toParisWallClock(Array.isArray(node.endDate) ? node.endDate[0] : node.endDate, undefined, dateOptions);
  const place = placeOf(node.location);
  const offers = offersOf(node.offers, baseUrl);
  const status = String(node.eventStatus || "");
  const title = textOf(node.name);
  if (!title && !start) return null;

  const event: StructuredEvent = {
    title,
    description: textOf(node.description, true),
    date: start?.value,
    // Une fin identique au début n'apporte rien (souvent un artefact de CMS).
    end_date: end && start && end.value !== start.value && end.value > start.value ? end.value : undefined,
    time_known: start?.timeKnown,
    location: place.name,
    address: place.address,
    image_url: imageOf(node.image, baseUrl),
    url: absoluteUrl(node.url, baseUrl),
    organizer: nameOf(node.organizer),
    artists: namesOf(node.performer ?? node.performers),
    price_min: offers.priceMin,
    price_max: offers.priceMax !== undefined && offers.priceMax !== offers.priceMin ? offers.priceMax : undefined,
    is_free: node.isAccessibleForFree === true || node.isAccessibleForFree === "true" || offers.priceMax === 0 || undefined,
    is_full: offers.soldOut || undefined,
    is_cancelled: /EventCancelled/i.test(status) || undefined,
    ticket_url: offers.ticketUrl,
    source,
  };
  if (!event.artists?.length) delete event.artists;
  return event;
}

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      // JSON-LD mal formé fréquent : retours à la ligne bruts dans les chaînes.
      return JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return undefined;
    }
  }
}

function collectJsonLdNodes($: CheerioDocument): SchemaNode[] {
  const nodes: SchemaNode[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || !node) return;
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof node !== "object") return;
    const record = node as SchemaNode;
    nodes.push(record);
    visit(record["@graph"], depth + 1);
    for (const element of asArray(record.itemListElement)) visit(element?.item ?? element, depth + 1);
    visit(record.subEvent, depth + 1);
    visit(record.subEvents, depth + 1);
    visit(record.event, depth + 1);
    visit(record.events, depth + 1);
    visit(record.mainEntity, depth + 1);
  };

  $('script[type="application/ld+json"]').each((_index: number, element: any) => {
    visit(safeJsonParse($(element).text() || ""), 0);
  });
  return nodes;
}

/** Lit un élément microdata (itemscope) et ses propriétés, y compris imbriquées. */
function readMicrodataItem($: CheerioDocument, element: any): SchemaNode {
  const result: SchemaNode = { "@type": $(element).attr("itemtype") };
  $(element)
    .find("[itemprop]")
    .each((_index: number, propElement: any) => {
      const owner = $(propElement).parent().closest("[itemscope]").get(0);
      if (owner !== element) return;
      const $prop = $(propElement);
      let value: unknown;
      if ($prop.is("[itemscope]")) {
        value = readMicrodataItem($, propElement);
      } else if ($prop.is("meta")) {
        value = $prop.attr("content");
      } else if ($prop.is("time")) {
        value = $prop.attr("datetime") || $prop.text();
      } else if ($prop.is("a, link")) {
        value = $prop.attr("href");
      } else if ($prop.is("img, source")) {
        value = $prop.attr("src") || $prop.attr("data-src");
      } else {
        // Description : son HTML, pour garder ses paragraphes (`text()` les colle : « partagé.Informations »).
        const isDescription = ($prop.attr("itemprop") || "").split(/\s+/).includes("description");
        value = $prop.attr("content") || (isDescription ? $prop.html() : $prop.text());
      }
      for (const name of ($prop.attr("itemprop") || "").split(/\s+/).filter(Boolean)) {
        result[name] = result[name] === undefined ? value : [...asArray(result[name]), value];
      }
    });
  return result;
}

/** Tous les événements décrits par les données structurées de la page. */
export function extractStructuredEvents($: CheerioDocument, pageUrl: string): StructuredEvent[] {
  const events: StructuredEvent[] = [];
  const seen = new Set<string>();
  const dateOptions = dateOptionsForPage($);
  const push = (event: StructuredEvent | null) => {
    if (!event) return;
    const key = `${event.url || ""}|${event.date || ""}|${(event.title || "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(event);
  };

  for (const node of collectJsonLdNodes($)) {
    if (isEventNode(node)) push(mapSchemaEvent(node, pageUrl, "json-ld", dateOptions));
  }

  if (events.length === 0) {
    $("[itemscope][itemtype]").each((_index: number, element: any) => {
      if (!EVENT_TYPE_PATTERN.test(($(element).attr("itemtype") || "").trim())) return;
      if ($(element).parents("[itemscope][itemtype*='Event']").length) return;
      push(mapSchemaEvent(readMicrodataItem($, element), pageUrl, "microdata", dateOptions));
    });
  }

  return events;
}

/** Dates trouvées dans les données techniques de la page (Next.js, Nuxt…), en indice pour l'IA. */
export function extractEmbeddedDates($: CheerioDocument): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 12 || !node || typeof node !== "object" || found.size >= 12) return;
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    for (const [key, value] of Object.entries(node as SchemaNode)) {
      if (/^(startDate|start_date|startsAt|starts_at|beginDate|dateStart|dateDebut)$/i.test(key) && typeof value === "string") {
        const parsed = toParisWallClock(value);
        if (parsed) found.add(parsed.value);
      } else if (value && typeof value === "object") {
        visit(value, depth + 1);
      }
    }
  };
  $('script#__NEXT_DATA__, script[type="application/json"]').each((_index: number, element: any) => {
    visit(safeJsonParse($(element).text() || ""), 0);
  });
  return Array.from(found).sort();
}
