import * as cheerio from "cheerio";

import { fetchHtml, FetchHtmlError } from "./fetch-html";
import { countDateMentions, findDateInText, parisToday } from "./dates";
import { fetchSocoopShows, readSocoopAgenda, socoopShowToAgendaEvent } from "./socoop";
import { decodeHtmlText, extractStructuredEvents, type CheerioDocument, type StructuredEvent } from "./structured-event";

/*
 * Découverte des événements d'une page d'agenda :
 *   - billetterie Socoop : API publique de la page (agenda dessiné en JavaScript) ;
 *   - données structurées (liste d'événements JSON-LD) quand le site en publie ;
 *   - sinon liens ciblés par le sélecteur configuré ;
 *   - sinon détection automatique du groupe de liens qui ressemble à des fiches d'événement
 *     (hors menus, en-tête et pied de page), liens vers une billetterie en ligne compris.
 * Si la page ne donne rien d'exploitable (lien mort, page d'accueil), le lien « Agenda » du site
 * est suivi. Chaque lien reçoit un titre et une date indicatifs (texte de la carte, URL).
 * `assessAgendaDiscovery` dit quand le résultat n'est pas exploitable (page bloquée, agenda en
 * texte seul…) : il faut alors lire la page autrement, pas conclure qu'elle est vide.
 */

export type DiscoveredAgendaEvent = {
  url: string;
  title?: string;
  /** Annoncé comme annulé sur l'agenda. */
  cancelled?: boolean;
  /** Date indicative (heure murale de Paris), pour écarter les événements passés. */
  date?: string;
  image_url?: string;
  /** Données complètes quand l'agenda publie des données structurées. */
  structured?: StructuredEvent;
};

export type AgendaDiscoveryOptions = {
  agendaUrl: string;
  eventLinkSelector?: string | null;
  eventLinkAttribute?: string | null;
  nextPageSelector?: string | null;
  nextPageAttribute?: string | null;
  maxPages?: number | null;
  maxEvents?: number;
  /** Première page déjà téléchargée. */
  prefetched?: { html: string; finalUrl: string };
};

export type AgendaDiscoveryResult = {
  events: DiscoveredAgendaEvent[];
  method: "socoop" | "facebook" | "structured" | "selector" | "auto";
  pagesVisited: number;
  errors: string[];
  /** Page d'agenda trouvée sur le site quand l'adresse donnée ne menait à rien (à enregistrer). */
  agendaUrl?: string;
  /** Dates écrites dans le contenu de la première page lue (agenda en texte seul). */
  textDates?: number;
  /** Code HTTP de la première page qui n'a pas pu être lue (403, 429…). */
  failedStatus?: number;
};

const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igsh|igshid|_ga|ref|ref_src)$/i;
const FILE_EXTENSION = /\.(pdf|jpe?g|png|gif|webp|svg|avif|zip|ics|docx?|xlsx?|pptx?|mp3|mp4|mov)$/i;
const NOISE_SEGMENT =
  /^(panier|cart|basket|checkout|commande|wishlist|favoris|login|connexion|signin|sign-in|logout|deconnexion|compte|mon-compte|my-account|account|newsletter|contact|nous-contacter|mentions-legales|legal|cgv|cgu|conditions(-generales)?(-de-vente)?|privacy|confidentialite|politique-de-confidentialite|cookies|plan-du-site|sitemap|recherche|search|faq|presse|press|recrutement|emploi|jobs|carte-cadeau|cartes-cadeaux|bon-cadeau|gift-?cards?|cheque-cadeau|tag|tags|categorie|categories|category|author|auteur|feed|wp-json|wp-admin|wp-login\.php|page)$/i;
const NOISE_ANYWHERE = /(carte-cadeau|cartes-cadeaux|bon-cadeau|gift-?card|newsletter|abonnement|adhesion|adhérer|mentions-legales)/i;
const EVENT_HINT = /(event|evenement|évènement|événement|agenda|programm|spectacle|concert|atelier|show|seance|séance|film|expo|soiree|soirée|festival|billet|ticket|reservation|manifestation|sortie|cours|stage|conference|rencontre)/i;
/** Textes de bouton qui ne sont pas des titres. */
const CALL_TO_ACTION =
  /^(r[ée]server|r[ée]servation|billetterie|billets?|tickets?|acheter|achat|voir|voir plus|en savoir plus|plus d['’]infos?|d[ée]tails?|d[ée]couvrir|lire la suite|inscription|s['’]inscrire|je r[ée]serve|infos?|complet)\s*[›»→>!.…]*$/i;
/** « Annulé », « ANNULÉ », « annulée »… (sans \b, inopérant après une lettre accentuée). */
const CANCELLED = /(^|[^a-zà-ÿ])(annul[ée]e?s?|cancel{1,2}ed)(?![a-zà-ÿ])/i;
const FIXED_LAST_SEGMENTS = new Set(["register", "inscription", "billets", "tickets", "billetterie", "details", "detail", "info", "infos", "reservation"]);
/**
 * Billetteries en ligne : un agenda qui renvoie chaque concert vers sa billetterie (bouton
 * « Billetterie » sous le texte) y donne la fiche de l'événement.
 */
const TICKETING_HOST =
  /(^|\.)(billetweb\.fr|helloasso\.com|shotgun\.live|weezevent\.com|yurplan\.com|festik\.net|dice\.fm|eventbrite\.(fr|com)|mapado\.com|fnacspectacles\.com|ticketmaster\.fr|seetickets\.com|billetreduc\.com)$/i;
/** Pages de ces billetteries qui ne sont pas des événements (dons, adhésions, boutique, fichiers). */
const TICKETING_NOISE = /\/(formulaires?|collectes?|dons?|boutiques?|paiements?|adhesions?|memberships?|files|bo)(\/|$)/i;

function isTicketingEventUrl(url: URL) {
  return TICKETING_HOST.test(url.hostname) && !TICKETING_NOISE.test(url.pathname);
}

/** URL comparable : sans fragment ni paramètres de suivi. */
export function canonicalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = new URL(raw.trim(), base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Clé de comparaison souple (protocole, « www. », slash final ignorés). */
export function urlMatchKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const canonical = canonicalizeUrl(raw);
  if (!canonical) return null;
  return canonical
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/\/(\?|$)/, "$1")
    .toLowerCase();
}

/**
 * Clés de rapprochement d'une URL : complète, plus le seul chemin quand il est assez
 * précis (un lien de billetterie partagé avec ou sans paramètres reste reconnu).
 */
export function urlMatchKeys(raw: string | null | undefined): string[] {
  const full = urlMatchKey(raw);
  if (!full) return [];
  const [pathKey] = full.split("?");
  const lastSegment = pathKey.split("/").filter(Boolean).pop() || "";
  const specific = pathKey.includes("/") && lastSegment.length >= 8 && !/\.(php|aspx?|html?)$/i.test(lastSegment);
  return specific && pathKey !== full ? [full, pathKey] : [full];
}

/** Vrai si l'URL correspond à une clé connue (voir `loadKnownEventUrlKeys`). */
export function isKnownUrl(url: string, knownKeys: Set<string>) {
  return urlMatchKeys(url).some((key) => knownKeys.has(key));
}

function isNoiseUrl(url: URL, agendaUrl: URL) {
  if (url.toString() === agendaUrl.toString()) return true;
  if (FILE_EXTENSION.test(url.pathname)) return true;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return true;
  if (segments.some((segment) => NOISE_SEGMENT.test(decodeURIComponent(segment)))) return true;
  return NOISE_ANYWHERE.test(url.pathname);
}

/** Forme d'URL : segments variables remplacés par « * » (ex. `evenement/*`). */
function urlShape(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean);
  const shape = segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    if (isLast && FIXED_LAST_SEGMENTS.has(segment.toLowerCase())) return segment.toLowerCase();
    if (isLast || /\d/.test(segment) || segment.length > 24 || segment.split("-").length >= 3) return "*";
    return segment.toLowerCase();
  });
  const params = Array.from(url.searchParams.keys()).sort().join(",");
  return `${url.hostname}/${shape.join("/")}${params ? `?${params}` : ""}`;
}

/** Forme d'adresse d'une fiche d'événement : mots d'agenda (« evenement/* ») ou billetterie en ligne. */
function isEventShape(shape: string) {
  return EVENT_HINT.test(shape) || TICKETING_HOST.test(shape.split(/[/?]/)[0]);
}

type LinkCandidate = { url: string; element: any };

/** Titre lisible tiré du dernier segment de l'URL (« the-thing-de-john-carpenter »). */
function slugTitle(pageUrl: string, href: string | undefined) {
  if (!href) return undefined;
  try {
    const segments = new URL(href, pageUrl).pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(segments[segments.length - 1] || "")
      .replace(/\.(html?|php)$/i, "")
      .replace(/^\d+-/, "");
    if (!slug || !/[a-z]/i.test(slug)) return undefined;
    const words = slug.replace(/[-_]+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return undefined;
  }
}

/**
 * Texte visible d'un nœud, sans les styles et scripts embarqués (pages Wix, Elementor…),
 * blocs séparés par une espace (« Soirée jazz » + « vendredi 6 novembre » ne se collent pas).
 */
function visibleText(node: ReturnType<CheerioDocument>) {
  const copy = node.clone();
  copy.find("style, script, noscript, svg").remove();
  copy.find("br").replaceWith(" ");
  copy.find("p, div, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, time, span").append(" ");
  return copy.text();
}

const compact = (value: string) => value.replace(/\s+/g, " ").trim();

/** Séparateur entre deux blocs d'une page à plat (« *** », trait horizontal). */
function isSeparator(node: ReturnType<CheerioDocument>) {
  if (node.is("hr")) return true;
  const text = visibleText(node).replace(/\s+/g, "");
  return text.length >= 3 && /^[*•·~_=–—-]+$/.test(text);
}

/** Titre le plus en vue d'un bloc : premier intertitre non vide du plus haut niveau. */
function prominentHeading($: CheerioDocument, block: ReturnType<CheerioDocument>) {
  for (const level of ["h1", "h2", "h3", "h4", "h5"]) {
    const heading = block
      .find(level)
      .toArray()
      .map((node: any) => decodeHtmlText(visibleText($(node))))
      .find((value: string) => value.length > 2 && !CALL_TO_ACTION.test(value) && !/^[*•·~_=–—-]+$/.test(value));
    if (heading) return heading;
  }
  return "";
}

/**
 * Texte et image de la « carte » qui contient un lien (titre, date, visuel). La carte s'arrête
 * avant le bloc qui contient le lien d'un autre événement du groupe (`groupUrls`). Page à plat
 * (titre, visuel et date en blocs frères, puis le bouton « Billetterie ») : la carte est faite
 * des blocs qui précèdent le lien, jusqu'au séparateur ou à l'événement précédent.
 */
function readCard($: CheerioDocument, link: LinkCandidate, pageUrl: string, groupUrls: Set<string>) {
  const { element } = link;
  const holdsOtherEvent = (node: ReturnType<CheerioDocument>) =>
    node
      .find("a[href]")
      .toArray()
      .some((anchor: any) => {
        const url = canonicalizeUrl($(anchor).attr("href") || "", pageUrl);
        return Boolean(url && url !== link.url && groupUrls.has(url));
      });

  let card = $(element);
  let flat = false;
  for (let depth = 0; depth < 4; depth += 1) {
    const text = compact(visibleText(card));
    if (text.length >= 25 || card.find("img").length) break;
    const parent = card.parent();
    if (!parent.length || parent.is("body")) break;
    if (holdsOtherEvent(parent)) {
      flat = true;
      break;
    }
    card = parent;
  }

  if (flat) {
    const nodes: any[] = [card.get(0)];
    let sibling = card.prev();
    while (sibling.length && nodes.length <= 12 && !isSeparator(sibling) && !holdsOtherEvent(sibling)) {
      nodes.unshift(sibling.get(0));
      sibling = sibling.prev();
    }
    // Copie des blocs dans un conteneur, pour y chercher titres et images comme dans une carte.
    const block = $("<div></div>");
    for (const node of nodes) block.append($(node).clone());
    card = block;
  }

  const heading = flat
    ? prominentHeading($, card)
    : visibleText(card.find("h1, h2, h3, h4, h5, .title, [class*='title'], [class*='titre'], strong").first());
  const anchorText = visibleText($(element));
  // Page à plat : le visuel le plus proche du lien est celui de l'événement.
  const image = flat ? card.find("img").last() : card.find("img").first();
  const rawTitle = [heading, anchorText, image.attr("alt"), slugTitle(pageUrl, $(element).attr("href"))]
    .map((value) => (value ? decodeHtmlText(value) : ""))
    .find((value) => value.length > 2 && !CALL_TO_ACTION.test(value));
  const imageSrc = image.attr("src") || image.attr("data-src") || image.attr("data-lazy-src");
  let imageUrl: string | undefined;
  try {
    imageUrl = imageSrc && !imageSrc.startsWith("data:") ? new URL(imageSrc, pageUrl).toString() : undefined;
  } catch {
    imageUrl = undefined;
  }
  const text = compact(visibleText(card));
  return {
    title: rawTitle ? rawTitle.slice(0, 140) : undefined,
    // Page à plat : la fin du bloc, au plus près du lien (date, lieu).
    text: flat ? text.slice(-400) : text.slice(0, 400),
    imageUrl,
  };
}

function collectSelectorLinks($: CheerioDocument, pageUrl: string, selector: string, attribute: string) {
  const links: LinkCandidate[] = [];
  $(selector).each((_index: number, element: any) => {
    const target = $(element).is("a") ? $(element) : $(element).find("a").first();
    const raw = (target.attr(attribute) || $(element).attr(attribute) || "").trim();
    const url = raw ? canonicalizeUrl(raw, pageUrl) : null;
    if (url) links.push({ url, element: target.get(0) || element });
  });
  return links;
}

/**
 * Menus, en-tête et pied de page du site : leurs liens mènent aux rubriques, pas aux événements.
 * Un <header> dans un <article> (titre d'une fiche WordPress) fait partie du contenu.
 */
function inSiteChrome($: CheerioDocument, element: any) {
  if ($(element).closest("nav, [role='navigation'], .menu, .navbar, #menu").length > 0) return true;
  const block = $(element).closest("header, footer, [role='banner'], [role='contentinfo']");
  return block.length > 0 && block.closest("article, main, [role='main']").length === 0;
}

/**
 * Choisit le groupe de liens le plus probable (même forme d'URL, mots d'agenda) : liens internes,
 * ou pages d'une billetterie en ligne.
 */
function autoDetectLinks($: CheerioDocument, pageUrl: string) {
  const page = new URL(pageUrl);
  const groups = new Map<string, LinkCandidate[]>();
  $("a[href]").each((_index: number, element: any) => {
    if (inSiteChrome($, element)) return;
    const url = canonicalizeUrl($(element).attr("href") || "", pageUrl);
    if (!url) return;
    const parsed = new URL(url);
    const sameSite = parsed.hostname.replace(/^www\./, "") === page.hostname.replace(/^www\./, "");
    if (!sameSite && !isTicketingEventUrl(parsed)) return;
    if (isNoiseUrl(parsed, page)) return;
    const shape = urlShape(parsed);
    const group = groups.get(shape) || [];
    group.push({ url, element });
    groups.set(shape, group);
  });

  let best: { score: number; links: LinkCandidate[] } | null = null;
  for (const [shape, links] of groups) {
    const unique = new Set(links.map((link) => link.url)).size;
    // Un seul lien suffit quand sa forme désigne une fiche d'événement (« /event-details/* »),
    // mais tout groupe de plusieurs liens passe avant.
    if (unique < 2 && !isEventShape(shape)) continue;
    const hint = isEventShape(shape) ? 2.5 : 1;
    const depthBonus = shape.split("/").length > 2 ? 1.2 : 1;
    const score = unique < 2 ? 0.5 : unique * hint * depthBonus;
    if (!best || score > best.score) best = { score, links };
  }
  return best?.links ?? [];
}

function nextPageUrl($: CheerioDocument, pageUrl: string, selector?: string | null, attribute?: string | null) {
  const attr = (attribute || "href").trim() || "href";
  const raw = selector
    ? $(selector).first().attr(attr)
    : $("a[rel='next'], link[rel='next'], .pagination .next a, a.next, .nav-next a").first().attr("href");
  return raw ? canonicalizeUrl(raw, pageUrl) : null;
}

/** Intitulé d'un lien vers l'agenda du site (« Agenda », « Programmation », « Nos événements »…). */
const AGENDA_LINK_TEXT =
  /^(l['’]\s*)?(agenda|programmation|programme|(la |notre |nos )?(programmation|[ée]v[éè]nements?|events?|concerts?|spectacles?|expositions?|dates)|calendrier|[àa] venir|prochainement|en ce moment|billetterie|saison(\s+\d{4}.*)?|line[- ]?up)\s*[›»→>]*$/i;
const AGENDA_LINK_PATH = /(^|[/_-])(agenda|programmation|programme|evenements?|events?|concerts?|spectacles?|calendrier|billetterie|saison|expositions?|en-ce-moment|a-venir)([/_.-]|$)/i;

/** Lien « Agenda » le plus probable d'une page (souvent dans le menu), hors page courante. */
export function findAgendaLink($: CheerioDocument, pageUrl: string): string | null {
  const page = new URL(pageUrl);
  const domain = page.hostname.replace(/^www\./, "").split(".").slice(-2).join(".");
  let best: { url: string; score: number } | null = null;
  $("a[href]").each((_index: number, element: any) => {
    const url = canonicalizeUrl($(element).attr("href") || "", pageUrl);
    if (!url || urlMatchKey(url) === urlMatchKey(pageUrl)) return;
    const parsed = new URL(url);
    // Même site, sous-domaines compris (« billetterie.lastrolabe.org » depuis « lastrolabe.org »).
    if (!parsed.hostname.replace(/^www\./, "").endsWith(domain)) return;
    if (FILE_EXTENSION.test(parsed.pathname) || NOISE_ANYWHERE.test(parsed.pathname)) return;
    const text = decodeHtmlText($(element).text() || $(element).attr("title") || "");
    const textMatch = AGENDA_LINK_TEXT.test(text);
    const pathMatch = AGENDA_LINK_PATH.test(decodeURIComponent(parsed.pathname));
    if (!textMatch && !pathMatch) return;
    const score = (textMatch ? 3 : 0) + (pathMatch ? 2 : 0) + (inSiteChrome($, element) ? 1 : 0);
    if (!best || score > best.score) best = { url, score };
  });
  return (best as { url: string } | null)?.url ?? null;
}

type ScannedAgenda = {
  result: AgendaDiscoveryResult;
  /** Première page lue, pour y chercher le lien « Agenda » sans la retélécharger. */
  firstPage?: { html: string; finalUrl: string };
};

/** Dates connues, critère de qualité d'une découverte (les liens sans date sont souvent du bruit). */
function datedCount(result: AgendaDiscoveryResult) {
  return result.events.filter((event) => event.date).length;
}

/** Liens dont l'adresse désigne une fiche d'événement (« /evenement/kidiboum/ », billetterie). */
function eventShapedCount(result: AgendaDiscoveryResult) {
  return result.events.filter((event) => isEventShape(urlShape(new URL(event.url)))).length;
}

/** Rien d'exploitable : lien mort, rien trouvé, ou détection automatique sans aucune date. */
function needsAgendaLink(result: AgendaDiscoveryResult) {
  if (result.method === "socoop" || result.method === "facebook" || result.method === "structured") return false;
  if (result.events.length === 0) return true;
  return result.method === "auto" && datedCount(result) < 2;
}

export async function discoverAgendaEvents(options: AgendaDiscoveryOptions): Promise<AgendaDiscoveryResult> {
  const { result: first, firstPage } = await scanAgendaPages(options);
  if (!needsAgendaLink(first)) return first;

  // Page d'accueil ou adresse périmée : on suit le lien « Agenda » du site (depuis l'accueil si la page est morte).
  let agendaUrl: string | null = null;
  try {
    const home = firstPage ?? (await fetchHtml(new URL(options.agendaUrl).origin));
    agendaUrl = findAgendaLink(cheerio.load(home.html), home.finalUrl);
  } catch {
    agendaUrl = null;
  }
  if (!agendaUrl) return first;
  const { result: second } = await scanAgendaPages({
    ...options,
    agendaUrl,
    // Le sélecteur configuré visait l'ancienne page : détection automatique sur la nouvelle.
    eventLinkSelector: first.events.length === 0 ? null : options.eventLinkSelector,
    prefetched: undefined,
  });
  // Une page d'accueil dont aucun lien ne ressemble à une fiche d'événement n'est pas l'agenda :
  // à dates égales, la page « Agenda » l'emporte si ses liens, eux, y ressemblent.
  const fromHomePage = new URL(firstPage?.finalUrl || options.agendaUrl).pathname.replace(/\/+$/, "") === "";
  const homeWithoutEvents =
    fromHomePage && eventShapedCount(first) === 0 && eventShapedCount(second) > 0 && datedCount(second) >= datedCount(first);
  const better =
    second.method === "socoop" ||
    second.method === "structured" ||
    datedCount(second) > datedCount(first) ||
    (second.events.length > 0 && (first.events.length === 0 || homeWithoutEvents));
  if (better) return { ...second, agendaUrl, pagesVisited: first.pagesVisited + second.pagesVisited };
  // Adresse morte : la page « Agenda » du site reste une piste à donner, même illisible ici.
  return first.events.length === 0 && first.errors.length > 0 ? { ...first, agendaUrl } : first;
}

async function scanAgendaPages(options: AgendaDiscoveryOptions): Promise<ScannedAgenda> {
  const maxPages = Math.max(1, Math.min(20, Number(options.maxPages || 5)));
  const maxEvents = Math.max(1, options.maxEvents ?? 120);
  const selector = options.eventLinkSelector?.trim() || null;
  const attribute = options.eventLinkAttribute?.trim() || "href";
  const found = new Map<string, DiscoveredAgendaEvent>();
  const errors: string[] = [];
  const visited = new Set<string>();
  let method: AgendaDiscoveryResult["method"] = selector ? "selector" : "auto";
  let currentUrl: string | null = canonicalizeUrl(options.agendaUrl);
  let pagesVisited = 0;
  let firstPage: ScannedAgenda["firstPage"];
  let textDates: number | undefined;
  let failedStatus: number | undefined;
  const referenceDate = new Date();

  while (currentUrl && pagesVisited < maxPages && found.size < maxEvents) {
    if (visited.has(currentUrl)) break;
    visited.add(currentUrl);

    let page: { html: string; finalUrl: string };
    try {
      page = pagesVisited === 0 && options.prefetched ? options.prefetched : await fetchHtml(currentUrl);
    } catch (error) {
      if (error instanceof FetchHtmlError) failedStatus ??= error.status;
      errors.push(`${currentUrl} : ${error instanceof FetchHtmlError ? error.message : "page inaccessible"}`);
      break;
    }
    pagesVisited += 1;
    firstPage ??= page;
    const $ = cheerio.load(page.html);
    textDates ??= countPageDates($);

    // 0. Billetterie Socoop : l'agenda vient de l'API publique de la page, qui n'a aucun lien.
    const socoop = pagesVisited === 1 ? readSocoopAgenda($, page.finalUrl) : null;
    if (socoop) {
      try {
        for (const show of await fetchSocoopShows(socoop, { maxShows: maxEvents })) {
          const event = socoopShowToAgendaEvent(show, socoop.origin);
          const key = event ? urlMatchKey(event.url) : null;
          if (event && key && !found.has(key)) found.set(key, event);
        }
        method = "socoop";
      } catch (error) {
        errors.push(`${currentUrl} : ${error instanceof Error ? error.message : "agenda de la billetterie illisible"}`);
      }
      break;
    }

    // 1. Liste d'événements en données structurées (ceux qui ont leur propre page).
    const pageKey = urlMatchKey(page.finalUrl);
    const structured = extractStructuredEvents($, page.finalUrl).filter((event) => {
      const key = event.url ? urlMatchKey(event.url) : null;
      return key && key !== pageKey;
    });
    if (structured.length >= 2) {
      method = "structured";
      for (const event of structured) {
        const url = canonicalizeUrl(event.url || "", page.finalUrl);
        if (!url || found.has(urlMatchKey(url) as string)) continue;
        found.set(urlMatchKey(url) as string, {
          url,
          title: event.title,
          date: event.date,
          image_url: event.image_url,
          structured: event,
        });
      }
    }

    // 2. Liens (sélecteur configuré ou détection automatique).
    const links = selector ? collectSelectorLinks($, page.finalUrl, selector, attribute) : autoDetectLinks($, page.finalUrl);
    const agenda = new URL(page.finalUrl);
    const groupUrls = new Set(links.map((link) => link.url));
    for (const link of links) {
      const parsed = new URL(link.url);
      if (isNoiseUrl(parsed, agenda)) continue;
      const key = urlMatchKey(link.url) as string;
      if (found.has(key)) continue;
      const card = readCard($, link, page.finalUrl, groupUrls);
      const path = decodeURIComponent(parsed.pathname);
      // Date de la carte, sinon de l'adresse (« /ateliers/p/atelier-crochet-sam-17/10 »,
      // « /samedi-31-octobre-2026-cafe-reparation/ »).
      const dateHint =
        findDateInText(card.text, referenceDate) ||
        findDateInText(path, referenceDate) ||
        findDateInText(path.replace(/[-_]+/g, " "), referenceDate);
      found.set(key, {
        url: link.url,
        title: card.title,
        date: dateHint?.value,
        image_url: card.imageUrl,
        cancelled: CANCELLED.test(card.title || "") || undefined,
      });
      if (found.size >= maxEvents) break;
    }

    currentUrl = nextPageUrl($, page.finalUrl, options.nextPageSelector, options.nextPageAttribute);
  }

  let events = Array.from(found.values());
  // Détection automatique : si presque tout est daté, les liens sans date sont du bruit
  // (page « Billetterie », abonnement…).
  if (method === "auto") {
    const dated = events.filter((event) => event.date).length;
    if (dated >= 3 && dated / events.length >= 0.6) events = events.filter((event) => event.date);
  }
  return { result: { events, method, pagesVisited, errors, textDates, failedStatus }, firstPage };
}

/** Dates écrites dans le contenu de la page (hors menus, en-tête et pied de page du site). */
function countPageDates($: CheerioDocument) {
  const body = $("body").clone();
  body.find("nav, [role='navigation']").remove();
  body.find("header, footer, [role='banner'], [role='contentinfo']").each((_index: number, node: any) => {
    if ($(node).closest("article, main, [role='main']").length === 0) $(node).remove();
  });
  return countDateMentions(visibleText(body));
}

export type AgendaUnreadableReason = "blocked" | "unreachable" | "text_only" | "empty" | "not_events";

export type AgendaUnreadable = { reason: AgendaUnreadableReason; message: string };

/** Pages qui refusent les robots : protection anti-robots, quota de requêtes. */
const BLOCKED_STATUSES = new Set([401, 403, 429]);

/**
 * Découverte inexploitable : page bloquée ou morte, agenda sans aucun lien vers une fiche
 * (dates en texte seul, page dessinée en JavaScript), ou seulement des liens qui ne sont pas
 * des événements (« Accueil », « Youtube »). La page doit alors être lue autrement : un résultat
 * vide ne veut pas dire qu'elle n'annonce rien.
 */
export function assessAgendaDiscovery(result: AgendaDiscoveryResult): AgendaUnreadable | null {
  if (result.events.length === 0) {
    const status = result.failedStatus;
    if (status && BLOCKED_STATUSES.has(status)) {
      return {
        reason: "blocked",
        message:
          status === 429
            ? "Le site limite la lecture automatique (erreur 429, trop de requêtes)."
            : `Le site refuse la lecture automatique (erreur ${status}).`,
      };
    }
    if (result.errors.length > 0) return { reason: "unreachable", message: `Page illisible : ${result.errors[0]}` };
    if (result.method === "facebook") {
      return { reason: "empty", message: "Aucun événement à venir lisible sans connexion sur cette page Facebook." };
    }
    if ((result.textDates ?? 0) >= 2) {
      return {
        reason: "text_only",
        message: `Aucun lien vers une fiche d'événement, mais ${result.textDates} dates sont écrites dans la page : agenda en texte seul.`,
      };
    }
    return { reason: "empty", message: "Aucun événement ni date lisible : agenda vide, ou affiché en JavaScript." };
  }
  const distinctDates = new Set(result.events.map((event) => event.date?.slice(0, 10)).filter(Boolean)).size;
  if (result.method === "auto" && eventShapedCount(result) === 0 && distinctDates < 2) {
    const titles = [...new Set(result.events.map((event) => event.title).filter(Boolean))].slice(0, 3);
    return {
      reason: "not_events",
      message: `Les liens trouvés ne ressemblent pas à des fiches d'événement${titles.length ? ` (${titles.map((title) => `« ${title} »`).join(", ")})` : ""}.`,
    };
  }
  return null;
}

/** Écarte les événements dont la date indicative est passée. */
export function isPastAgendaEvent(event: Pick<DiscoveredAgendaEvent, "date">, today: string = parisToday()) {
  return Boolean(event.date && event.date.slice(0, 10) < today);
}

/**
 * URL déjà connues : événements existants et demandes « depuis une URL ».
 * Une seule requête par table, comparée en mémoire.
 */
export async function loadKnownEventUrlKeys(supabase: any) {
  const keys = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    for (const key of urlMatchKeys(value)) keys.add(key);
  };
  const [eventsResult, requestsResult] = await Promise.all([
    supabase.from("events").select("scraping_url, external_url, instagram_url, facebook_url"),
    supabase
      .from("user_requests")
      .select("source_url, scraping_url:event_data->>scraping_url, external_url:event_data->>external_url")
      .eq("request_type", "event_from_url"),
  ]);
  for (const row of (eventsResult?.data || []) as any[]) {
    add(row.scraping_url);
    add(row.external_url);
    add(row.instagram_url);
    add(row.facebook_url);
  }
  for (const row of (requestsResult?.data || []) as any[]) {
    add(row.source_url);
    add(row.scraping_url);
    add(row.external_url);
  }
  return keys;
}
