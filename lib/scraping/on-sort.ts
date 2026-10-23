import { normalizeName } from "@/lib/events/import-prefill";
import { isYoungAudience } from "@/lib/events/young-audience";

import type { AgendaDiscoveryResult, DiscoveredAgendaEvent } from "./agenda";
import { parisToday, toParisWallClock } from "./dates";
import { SCRAPER_USER_AGENT } from "./fetch-html";
import { publicAmountsInText } from "./prices";
import type { ScrapedEventData, ScrapeEventPageResult } from "./scrape-event-page";
import { decodeHtmlText } from "./structured-event";

/*
 * « On sort ! », l'agenda des sorties d'Orléans Métropole (sortir.orleans-metropole.fr), publié sur
 * OpenAgenda (openagenda.com/orleans-metropole) sous Licence Ouverte 2.0. Le site est une application
 * JavaScript aux pages vides : on lit l'API JSON publique qu'elle appelle elle-même.
 *   - liste : /api/events?from=AAAA-MM-JJ&to=AAAA-MM-JJ&offset=0&limit=300 → { total, events }
 *     (300 par page au plus ; prochaine date, lieu, catégories et affiche, sans le détail des séances) ;
 *   - fiche : /api/events?uids[]=<uid>&longDescriptionFormat=HTML → { event } avec toutes les séances,
 *     les tarifs (texte libre) et la billetterie.
 * Une seule source pour des dizaines d'organisateurs de la métropole : seuls les domaines suivis par
 * OutLive sont gardés (concerts, spectacles, expositions, cinéma, rencontres, festivals).
 */

type Translated = Record<string, string | null | undefined>;
type OnSortTiming = { begin?: string | null; end?: string | null };

export type OnSortEvent = {
  uid: number;
  slug?: string | null;
  /** Champs traduits (`{ fr: "…" }`) ; l'API renvoie `[]` quand ils sont vides. */
  title?: Translated | null;
  description?: Translated | [] | null;
  longDescription?: Translated | [] | null;
  conditions?: Translated | [] | null;
  keywords?: Record<string, string[] | null> | [] | null;
  image?: { base?: string | null; filename?: string | null; variants?: Array<{ filename?: string | null; type?: string | null }> } | null;
  location?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  organizatorName?: string | null;
  /** Agenda qui a versé l'événement dans On sort ! (agenda collaboratif, médiathèques, mairie…). */
  originAgenda?: { uid?: number | null; title?: string | null } | null;
  registration?: Array<{ type?: string | null; value?: string | null }> | null;
  /** Toutes les séances : seulement dans la fiche détaillée. */
  timings?: OnSortTiming[] | null;
  firstTiming?: OnSortTiming | null;
  nextTiming?: OnSortTiming | null;
  lastTiming?: OnSortTiming | null;
  /** 1 programmé, 2 reprogrammé, 3 déplacé en ligne, 4 reporté, 5 complet, 6 annulé. */
  status?: number | null;
  /** 1 sur place, 2 en ligne, 3 les deux. */
  attendanceMode?: number | null;
  "categorie-principale"?: number[] | null;
  /** Sous-catégories, rangées par catégorie : `musique: [50, 54]`, `spectacle: [63]`… */
  [field: string]: unknown;
};

const ON_SORT_HOST = "sortir.orleans-metropole.fr";
export const ON_SORT_ORIGIN = `https://${ON_SORT_HOST}`;
const API_URL = `${ON_SORT_ORIGIN}/api/events`;
/** Taille de page maximale acceptée par l'API (au-delà, elle répond par une erreur 500). */
const PAGE_SIZE = 300;
/** Fenêtre lue à chaque passage : environ 340 événements par mois, dont la moitié hors domaines suivis. */
export const ON_SORT_SCAN_DAYS = 31;
/** Au-delà, un spectacle joué tous les jours devient une seule fiche (début et fin), comme une exposition. */
const MAX_SESSIONS = 12;

/** Catégories principales de l'agenda (réglages publics : /api/settings). */
const CATEGORY = {
  visite: 1,
  rencontre: 2,
  exposition: 3,
  fete: 4,
  musique: 5,
  cinema: 6,
  spectacle: 7,
  sport: 8,
  atelier: 9,
  jeunePublic: 10,
} as const;

const USEFUL_CATEGORIES: number[] = [
  CATEGORY.rencontre,
  CATEGORY.exposition,
  CATEGORY.musique,
  CATEGORY.cinema,
  CATEGORY.spectacle,
];

/** Sous-catégories reprises comme tags (seuls les tags existants sont rattachés). */
const SUBCATEGORY_FIELDS = ["conference-rencontre-debat", "exposition", "musique", "projection-cinema", "spectacle"];
const SUBCATEGORY_LABELS: Record<number, string> = {
  18: "Colloque",
  19: "Table ronde",
  24: "Dédicace",
  25: "Rendez-vous littéraire",
  26: "Débat",
  27: "Lecture",
  29: "Photographie",
  30: "Art contemporain",
  31: "Beaux-arts",
  32: "Histoire",
  33: "Architecture",
  34: "Design",
  35: "Sciences",
  36: "Street art",
  37: "Arts numériques",
  49: "Acoustique",
  50: "Jazz",
  51: "Rock",
  52: "Hip-hop",
  53: "Électro",
  54: "Musiques du monde",
  55: "Classique",
  56: "Chanson",
  57: "Expérimental",
  58: "Variété",
  59: "Court-métrage",
  60: "Avant-première",
  61: "Documentaire",
  62: "Plein air",
  63: "Théâtre",
  64: "Humour",
  65: "Danse",
  66: "Cirque",
  67: "Performance",
  68: "Conte",
  69: "Poésie",
  70: "Spectacle musical",
};
/** Théâtre, humour, danse, cirque, performance, conte, poésie : un spectacle plutôt qu'un concert. */
const STAGED_SHOW_TYPES = new Set([63, 64, 65, 66, 67, 68, 69]);
const DANCE = 65;

/** Raisons d'exclusion, comptées dans le compte rendu du scan. */
export const ON_SORT_EXCLUDED = {
  online: "en ligne",
  sport: "sport",
  workshop: "atelier, stage ou cours",
  health: "santé, bien-être ou démarches",
  market: "fête, salon ou marché",
  recurring: "rendez-vous récurrent ou saison",
  visit: "visite ou balade",
  youth: "jeune public",
  institution: "programmation d'une institution (mairie, médiathèque, musée, tourisme, scène nationale)",
  closed: "lieu fermé au public (EHPAD, maison de retraite)",
  talk: "conférence, débat ou dédicace",
  classical: "musique classique, harmonie ou concours",
  pastime: "loisirs (thé dansant, loto, collections)",
  tribute: "tribute ou reprises",
  heritage: "exposition d'histoire, de sciences ou de patrimoine",
  longExhibition: "exposition au long cours",
  other: "hors domaines suivis",
  over: "déjà terminé",
} as const;

// Motifs appliqués aux textes normalisés (minuscules, sans accents ni ponctuation).
const WORKSHOP_TITLE =
  /^(ateliers?|stages?|cours|formations?|initiations?|workshops?|master ?class|club|cycles? de formation)\b|\bateliers? de conversation\b/;
const HEALTH_OR_ADMIN =
  /\b(don (du|de) sang|depistage|vaccination|rdv sante|rendez vous de la sante|bien ?etre|relaxation|sophrologie|meditation|yoga|hypnose|automassages?|gestion du stress|bain sonore|voyage sonore|sonotherapie|naturopathie|reiki|developpement personnel|demarches? administratives?|france services|permanences?|soutien numerique|aide numerique|numerique seniors|impots|recrutement|job dating|forum de l emploi|reunion (publique|d information))\b/;
const MARKET_TITLE = /^(salons?|bourses?|vide greniers?|vide jardins?|brocantes?|braderies?|marches?|foires?|troc)\b/;
const RECURRING_TITLE =
  /\b((tous|toutes) les (lundis|mardis|mercredis|jeudis|vendredis|samedis|dimanches|jours|semaines|mois|week ends?)|chaque (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|mois)|hebdomadaires?)\b/;
const SEASON = /\bsaison\b/;
const FESTIVAL = /\bfestival\b/;
const DJ = /\bdj\b|\bdj set\b|\bdjset\b/;
const MUSIC_WORDS =
  /\b(concerts?|chansons?|recital|duo|trio|quartet|quatuor|quintet|orchestre|choeurs?|chorale|fanfare|jazz|blues|rock|rap|folk|piano)\b/;

/*
 * OutLive cherche la scène locale et indépendante : artistes, compagnies, collectifs, associations, MJC,
 * petits lieux. On sort ! y ajoute la programmation des institutions (mairies, médiathèques, musées,
 * office de tourisme, Scène nationale…), reconnue à son organisateur ou à l'agenda qui l'a versée :
 * leurs grandes salles sont suivies par ailleurs et le reste sort du cadre d'OutLive.
 */
const INSTITUTION =
  /\b((ville|mairie|commune) d(e)?|mediatheques?|bibliotheques?|musees?|museum|mobe|universite|archives|archeologi\w*|drac|patrimoine|tourisme|departement|conseil (departemental|regional)|scene nationale|cado|centre national de creation)\b/;
/** Résidences de personnes âgées : un concert y est donné pour les résidents. */
const CLOSED_VENUE = /\b(ehpad|maison de retraite|residence (seniors?|autonomie))\b/;
/** Agenda d'une commune versé dans On sort ! (« Agenda de Chécy »), à part l'agenda collaboratif des sorties. */
const TOWN_AGENDA = /^agenda (de|d) (?!sorties)/;
/** Orchestres, harmonies, conservatoire, concours de piano : musique classique ou institutionnelle. */
const CLASSICAL =
  /\b(orchestres?|symphoni\w*|philharmoni\w*|harmonie|conservatoire|musique municipale|concours international|recitals?|matinees? du piano|chorales?|musique classique)\b/;
/** Sous-catégorie musicale « Classique ». */
const CLASSICAL_MUSIC = 55;
const PASTIME = /\b(thes? dansants?|loto|bourse aux|lego|bricks|maquettes?|modelisme|collectionneurs?|numismati\w*|philateli\w*)\b/;
const TRIBUTE = /\b(tribute|cover band|reprises? de)\b/;
/** Expositions d'histoire ou de sciences : du patrimoine plutôt que des artistes. */
const HERITAGE_THEMES = new Set([32, 35]);
/** Au-delà, une exposition est un décor de la ville plus qu'un rendez-vous (expo photo en plein air d'une saison). */
const LONG_EXHIBITION_DAYS = 180;

/* ------------------------------------------------------------------ */
/* Adresses                                                            */
/* ------------------------------------------------------------------ */

function parseUrl(raw: string) {
  try {
    const url = new URL(raw);
    return { host: url.hostname.replace(/^www\./, "").toLowerCase(), path: decodeURIComponent(url.pathname) };
  } catch {
    return null;
  }
}

/**
 * Identifiant d'un événement On sort ! d'après son adresse : page du site
 * (`/evenement/92216658/balade-…`) ou de l'agenda OpenAgenda (`/orleans-metropole/events/92216658_balade-…`).
 */
export function onSortEventUid(url: string): number | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const match =
    parsed.host === ON_SORT_HOST
      ? /^\/evenement\/(\d+)(?:\/|$)/.exec(parsed.path)
      : parsed.host === "openagenda.com"
        ? /^\/(?:[a-z]{2}\/)?orleans-metropole\/events\/(\d+)_/.exec(parsed.path)
        : null;
  return match ? Number(match[1]) : null;
}

/** Agenda On sort ! : le site (hors page d'un événement) ou l'agenda « orleans-metropole » d'OpenAgenda. */
export function isOnSortAgendaUrl(url: string) {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.host === ON_SORT_HOST) return onSortEventUid(url) === null;
  return parsed.host === "openagenda.com" && /^\/(?:[a-z]{2}\/)?orleans-metropole\/?$/.test(parsed.path);
}

/** Page publique de l'événement sur On sort ! (celle qu'import_urls sait relire). */
export function onSortEventUrl(event: Pick<OnSortEvent, "uid" | "slug">) {
  return `${ON_SORT_ORIGIN}/evenement/${event.uid}/${encodeURIComponent(event.slug || "evenement")}`;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function fetchApi(params: URLSearchParams) {
  const response = await fetch(`${API_URL}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": SCRAPER_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`L'API On sort ! répond avec une erreur ${response.status}.`);
  return (await response.json()) as { total?: number; events?: unknown; event?: unknown };
}

/** Événements ayant une séance entre deux jours (AAAA-MM-JJ), par pages de 300. */
export async function fetchOnSortEvents({ from, to, maxEvents = 1500 }: { from: string; to: string; maxEvents?: number }) {
  const events: OnSortEvent[] = [];
  let requests = 0;
  for (let offset = 0; offset < maxEvents; offset += PAGE_SIZE) {
    const json = await fetchApi(new URLSearchParams({ from, to, offset: String(offset), limit: String(PAGE_SIZE) }));
    requests += 1;
    const page = Array.isArray(json.events) ? (json.events as OnSortEvent[]) : [];
    events.push(...page);
    if (page.length < PAGE_SIZE || (typeof json.total === "number" && events.length >= json.total)) break;
  }
  return { events, requests };
}

/** Fiche complète d'un événement (toutes les séances, tarifs, billetterie), ou null s'il n'existe plus. */
export async function fetchOnSortEvent(uid: number): Promise<OnSortEvent | null> {
  const json = await fetchApi(new URLSearchParams({ "uids[]": String(uid), longDescriptionFormat: "HTML" }));
  const event = json.event as OnSortEvent | undefined;
  return event && typeof event === "object" && event.uid ? event : null;
}

/* ------------------------------------------------------------------ */
/* Lecture d'un événement                                              */
/* ------------------------------------------------------------------ */

/** Texte français d'un champ traduit. */
function french(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const text = record.fr ?? Object.values(record).find((entry) => typeof entry === "string");
  return typeof text === "string" ? text : "";
}

function clean(value: unknown) {
  return typeof value === "string" ? decodeHtmlText(value) : "";
}

function categoriesOf(event: OnSortEvent): number[] {
  return Array.isArray(event["categorie-principale"]) ? event["categorie-principale"].filter(Number.isInteger) : [];
}

function subcategoriesOf(event: OnSortEvent, field: string): number[] {
  const value = event[field];
  return Array.isArray(value) ? value.filter((entry): entry is number => Number.isInteger(entry)) : [];
}

/** Mots-clés, y compris ceux saisis d'un bloc (« culture; spectacle ; danse »). */
function keywordsOf(event: OnSortEvent): string[] {
  const raw = event.keywords && !Array.isArray(event.keywords) ? event.keywords.fr : null;
  return (Array.isArray(raw) ? raw : [])
    .flatMap((keyword) => String(keyword).split(/[;,]/))
    .map((keyword) => keyword.replace(/^#/, "").trim())
    .filter(Boolean);
}

function spanInDays(event: OnSortEvent) {
  const start = Date.parse(event.firstTiming?.begin || "");
  const end = Date.parse(event.lastTiming?.end || event.lastTiming?.begin || "");
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : (end - start) / 86_400_000;
}

/**
 * Plus d'un jour (heure de Paris) de la première séance à la fin de la dernière, une nuit qui finit avant 6 h
 * comptant pour la veille (la règle de l'app, « Ce soir » de 18 h à 6 h) : un festival s'étend sur plusieurs
 * jours, pas une soirée qui finit à 2 h. Les séances de l'agenda portent l'heure de Paris et son décalage.
 */
function spansSeveralDays(event: OnSortEvent) {
  const begin = event.firstTiming?.begin || "";
  const end = event.lastTiming?.end || event.lastTiming?.begin || "";
  const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  if (!localDateTime.test(begin) || !localDateTime.test(end)) return false;
  const lastDay = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  if (end.slice(11, 16) < "06:00") lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  return lastDay.toISOString().slice(0, 10) > begin.slice(0, 10);
}

function isCancelled(event: OnSortEvent) {
  // Annulé, ou reporté sans nouvelle date.
  return event.status === 6 || event.status === 4;
}

/** Affiche : la plus grande variante publiée. */
export function onSortImageUrl(event: OnSortEvent) {
  const image = event.image;
  if (!image?.base || !image.filename) return undefined;
  const full = image.variants?.find((variant) => variant?.type === "full" && variant.filename);
  return `${image.base}${full?.filename || image.filename}`;
}

/** « La Passerelle - Inavouable » → « Inavouable » : le lieu a sa fiche. */
function withoutVenue(title: string, venue: string) {
  const target = normalizeName(venue);
  if (!target) return title;
  const prefix = /^(.+?)\s*[-–—:|]\s+(.+)$/.exec(title);
  if (prefix && normalizeName(prefix[1]) === target) return prefix[2].trim();
  const suffix = /^(.+)\s+[-–—|]\s+(.+?)$/.exec(title);
  if (suffix && normalizeName(suffix[2]) === target) return suffix[1].trim();
  return title;
}

/** Titre propre : sans emoji, ni mention de saison, ni type d'événement ou lieu en préfixe. */
export function cleanOnSortTitle(event: OnSortEvent) {
  const raw = clean(french(event.title).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " "));
  const title = withoutVenue(
    raw
      // « CHARLOTTE BOISSELIER - SAISON CULTURELLE 26/27 », « Saison culturelle : La Fabrique »
      .replace(/\s*[-–—_|:]\s*saison(\s+culturelle)?\s+\d{2,4}\s*[/-]\s*\d{2,4}\s*$/i, "")
      .replace(/^saison culturelle\s*:\s*/i, "")
      // « Exposition : George Sand… », « Concert - Le Seigneur des Anneaux » : la catégorie le dit déjà.
      .replace(/^(exposition|expo|concert|spectacle|projection|conf[ée]rence)\s*[:–—-]\s+/i, "")
      .trim(),
    clean(event.location?.name),
  );
  return title || raw;
}

/**
 * Catégorie OutLive : festival d'après le titre, pour le festival entier seulement (plus d'un jour : une soirée
 * d'un festival garde sa catégorie, ../live/docs/FESTIVALS.md, § 4) ; puis concert, spectacle, exposition,
 * cinéma, rencontre ; atelier pour une fiche importée à la main. Musique et spectacle cochés ensemble :
 * spectacle pour du théâtre, de la danse, du cirque…, concert si le titre ou les mots-clés le disent, sinon
 * l'ordre choisi par l'organisateur (« Luminiscence » : cinéma, spectacle, musique).
 */
export function onSortCategory(event: OnSortEvent): string | undefined {
  const categories = categoriesOf(event);
  const has = (id: number) => categories.includes(id);
  const title = normalizeName(french(event.title));
  const text = `${title} ${normalizeName(keywordsOf(event).join(" "))}`;
  const useful = USEFUL_CATEGORIES.some(has);
  if ((FESTIVAL.test(title) || (!useful && has(CATEGORY.fete) && FESTIVAL.test(text))) && spansSeveralDays(event)) {
    return "Festival";
  }

  const showTypes = subcategoriesOf(event, "spectacle");
  const staged = showTypes.some((id) => STAGED_SHOW_TYPES.has(id));
  const concert =
    has(CATEGORY.musique) &&
    (!has(CATEGORY.spectacle) ||
      (!staged &&
        (MUSIC_WORDS.test(text) || categories.indexOf(CATEGORY.musique) < categories.indexOf(CATEGORY.spectacle))));
  if (concert) return DJ.test(text) ? "DJ Set" : "Concert";
  if (has(CATEGORY.spectacle)) return showTypes.length > 0 && showTypes.every((id) => id === DANCE) ? "Danse" : "Spectacle";
  if (has(CATEGORY.exposition)) return "Expo";
  if (has(CATEGORY.cinema)) return "Cinéma";
  if (has(CATEGORY.rencontre)) return "Rencontre";
  if (has(CATEGORY.atelier)) return "Atelier";
  return undefined;
}

export type OnSortVerdict = { keep: true; category: string } | { keep: false; reason: string };

/** Jeune public : catégorie de l'agenda, ou « dès 3 ans », « en famille »… dans le titre, le résumé ou les mots-clés. */
function isOnSortYoungAudience(event: OnSortEvent) {
  return (
    categoriesOf(event).includes(CATEGORY.jeunePublic) ||
    isYoungAudience({ title: french(event.title), description: french(event.description), tags: keywordsOf(event) })
  );
}

/**
 * Ce qui a sa place dans OutLive, la scène locale et indépendante : concerts, DJ sets, spectacles, danse,
 * expositions, cinéma et festivals. Sont écartés le sport, les ateliers, stages et cours, la santé et les
 * démarches, les salons et marchés, les rendez-vous permanents et annonces de saison, le jeune public,
 * la programmation des institutions, les loisirs (thé dansant, loto, collections), les visites guidées,
 * les conférences et dédicaces, la musique classique, les tributes et les expositions de patrimoine.
 */
export function classifyOnSortEvent(event: OnSortEvent): OnSortVerdict {
  const categories = categoriesOf(event);
  const has = (id: number) => categories.includes(id);
  const title = normalizeName(french(event.title));
  const keywords = normalizeName(keywordsOf(event).join(" "));
  const organizer = normalizeName(clean(event.organizatorName));
  const origin = normalizeName(clean(event.originAgenda?.title));
  const reject = (reason: string): OnSortVerdict => ({ keep: false, reason });

  if (event.attendanceMode === 2 || event.status === 3) return reject(ON_SORT_EXCLUDED.online);
  if (has(CATEGORY.sport)) return reject(ON_SORT_EXCLUDED.sport);
  if (has(CATEGORY.atelier) || WORKSHOP_TITLE.test(title)) return reject(ON_SORT_EXCLUDED.workshop);
  if (HEALTH_OR_ADMIN.test(`${title} ${keywords}`)) return reject(ON_SORT_EXCLUDED.health);
  if (MARKET_TITLE.test(title)) return reject(ON_SORT_EXCLUDED.market);
  // « Afterwork tous les vendredis » jusqu'en 2035, « Saison culturelle 26/27 » : pas un événement.
  const span = spanInDays(event);
  if (RECURRING_TITLE.test(title) || span > 366 || (SEASON.test(title) && span > 31)) {
    return reject(ON_SORT_EXCLUDED.recurring);
  }

  const category = onSortCategory(event);
  const useful = USEFUL_CATEGORIES.filter(has);
  if (useful.length === 0 && category !== "Festival") {
    if (has(CATEGORY.visite)) return reject(ON_SORT_EXCLUDED.visit);
    if (has(CATEGORY.fete)) return reject(ON_SORT_EXCLUDED.market);
    if (has(CATEGORY.jeunePublic)) return reject(ON_SORT_EXCLUDED.youth);
    return reject(ON_SORT_EXCLUDED.other);
  }
  // Visite commentée d'une exposition ou d'un musée, sans spectacle ni concert.
  if (has(CATEGORY.visite) && !has(CATEGORY.musique) && !has(CATEGORY.cinema) && !has(CATEGORY.spectacle)) {
    return reject(ON_SORT_EXCLUDED.visit);
  }
  if (!category) return reject(ON_SORT_EXCLUDED.other);

  // Dans les domaines suivis, ce qui sort de la scène locale et indépendante.
  if (isOnSortYoungAudience(event)) return reject(ON_SORT_EXCLUDED.youth);
  if (INSTITUTION.test(organizer) || INSTITUTION.test(origin) || TOWN_AGENDA.test(origin)) {
    return reject(ON_SORT_EXCLUDED.institution);
  }
  if (PASTIME.test(`${title} ${keywords} ${organizer}`)) return reject(ON_SORT_EXCLUDED.pastime);
  if (CLOSED_VENUE.test(normalizeName(clean(event.location?.name)))) return reject(ON_SORT_EXCLUDED.closed);
  // La catégorie Rencontre d'OutLive reste nourrie par les lieux suivis (bord de scène, apéro-lecture…).
  if (category === "Rencontre") return reject(ON_SORT_EXCLUDED.talk);
  const music = subcategoriesOf(event, "musique");
  const classicalOnly = music.length > 0 && music.every((id) => id === CLASSICAL_MUSIC);
  if (has(CATEGORY.musique) && (classicalOnly || CLASSICAL.test(`${title} ${organizer} ${keywords}`))) {
    return reject(ON_SORT_EXCLUDED.classical);
  }
  if (TRIBUTE.test(title)) return reject(ON_SORT_EXCLUDED.tribute);
  if (category === "Expo") {
    const themes = subcategoriesOf(event, "exposition");
    if (themes.length > 0 && themes.every((id) => HERITAGE_THEMES.has(id))) return reject(ON_SORT_EXCLUDED.heritage);
    if (span > LONG_EXHIBITION_DAYS) return reject(ON_SORT_EXCLUDED.longExhibition);
  }
  return { keep: true, category };
}

/* ------------------------------------------------------------------ */
/* Agenda (scan_agenda)                                                */
/* ------------------------------------------------------------------ */

/**
 * Événement de la liste → entrée d'agenda : page On sort ! de l'événement, sa prochaine date, son affiche,
 * son lieu et son organisateur (doublons repérés au lieu, tri de la scène locale par l'agent).
 */
export function onSortEventToAgendaEvent(event: OnSortEvent): DiscoveredAgendaEvent {
  const next = toParisWallClock(event.nextTiming?.begin || event.firstTiming?.begin);
  return {
    url: onSortEventUrl(event),
    title: cleanOnSortTitle(event) || undefined,
    date: next?.value,
    image_url: onSortImageUrl(event),
    cancelled: isCancelled(event) || undefined,
    venue: clean(event.location?.name) || undefined,
    address: addressOf(event.location),
    organizer: clean(event.organizatorName) || undefined,
  };
}

function addDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Événements à venir des domaines suivis, sur les `days` prochains jours, par date. */
export async function discoverOnSortAgenda({
  days = ON_SORT_SCAN_DAYS,
  maxEvents = 200,
  today = parisToday(),
}: { days?: number; maxEvents?: number; today?: string } = {}): Promise<AgendaDiscoveryResult> {
  let fetched: Awaited<ReturnType<typeof fetchOnSortEvents>>;
  try {
    fetched = await fetchOnSortEvents({ from: today, to: addDays(today, days) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agenda illisible";
    return { events: [], method: "onsort", pagesVisited: 1, errors: [`${ON_SORT_ORIGIN} : ${message}`] };
  }

  const excluded: Record<string, number> = {};
  const kept = new Map<number, DiscoveredAgendaEvent>();
  for (const event of fetched.events) {
    if (!event?.uid || kept.has(event.uid)) continue;
    // Sans prochaine séance : la dernière s'est terminée plus tôt dans la journée.
    const verdict = event.nextTiming ? classifyOnSortEvent(event) : { keep: false as const, reason: ON_SORT_EXCLUDED.over };
    if (verdict.keep) kept.set(event.uid, onSortEventToAgendaEvent(event));
    else excluded[verdict.reason] = (excluded[verdict.reason] || 0) + 1;
  }
  const events = [...kept.values()].sort((left, right) => (left.date || "").localeCompare(right.date || ""));
  if (events.length > maxEvents) excluded[`au-delà des ${maxEvents} premiers (passage suivant)`] = events.length - maxEvents;
  return {
    events: events.slice(0, maxEvents),
    method: "onsort",
    pagesVisited: fetched.requests,
    errors: [],
    excluded,
  };
}

/* ------------------------------------------------------------------ */
/* Fiche (import_urls, import depuis une URL dans l'admin)             */
/* ------------------------------------------------------------------ */

type Slot = { date: string; end_date?: string; timeKnown: boolean };

function slotOf(timing: OnSortTiming | null | undefined): Slot | null {
  const start = toParisWallClock(timing?.begin);
  if (!start) return null;
  const end = toParisWallClock(timing?.end);
  // Séance « journée entière » (00:00) : l'heure n'est pas connue.
  return { date: start.value, end_date: end && end.value > start.value ? end.value : undefined, timeKnown: start.value.slice(11, 16) !== "00:00" };
}

/**
 * Dates de la fiche : une par séance à venir (les autres en `occurrences`), sauf pour une exposition
 * ou un spectacle donné plus de 12 fois, qui tient en une seule fiche du premier au dernier jour.
 */
export function onSortSessions(
  event: OnSortEvent,
  today: string = parisToday(),
): Pick<ScrapedEventData, "date" | "end_date" | "time_known" | "occurrences"> {
  const timings = event.timings?.length ? event.timings : [event.firstTiming, event.lastTiming];
  const slots = timings
    .map(slotOf)
    .filter((slot): slot is Slot => Boolean(slot))
    .sort((left, right) => left.date.localeCompare(right.date))
    .filter((slot, index, all) => index === 0 || all[index - 1].date !== slot.date);
  if (slots.length === 0) return {};

  const categories = categoriesOf(event);
  const exhibition =
    categories.includes(CATEGORY.exposition) && !categories.includes(CATEGORY.musique) && !categories.includes(CATEGORY.spectacle);
  const upcoming = slots.filter((slot) => (slot.end_date || slot.date).slice(0, 10) >= today);
  if (exhibition || upcoming.length > MAX_SESSIONS) {
    const first = slots[0];
    const last = slots[slots.length - 1];
    return { date: first.date, end_date: last.end_date || last.date, time_known: first.timeKnown };
  }
  const sessions = upcoming.length > 0 ? upcoming : slots.slice(-1);
  return {
    date: sessions[0].date,
    end_date: sessions[0].end_date,
    time_known: sessions[0].timeKnown,
    occurrences: sessions.length > 1 ? sessions.slice(1).map(({ date, end_date }) => ({ date, end_date })) : undefined,
  };
}

/**
 * Tarifs écrits en clair : « Tarifs de 5€ à 25€ », « de 12 à 36 euros », « Entrée libre »,
 * « Participation libre » ; « gratuit » dans les mots-clés vaut entrée gratuite. Les tarifs réservés
 * (« 15€ avec la Carte », « Abonnés : 6€ ») ne comptent pas.
 */
export function readOnSortPrice(
  conditions: string,
  keywords: string[] = [],
): Pick<ScrapedEventData, "price_min" | "price_max" | "is_pay_what_you_want"> {
  const text = normalizeName(conditions);
  if (/\b(prix libre|participation libre|libre participation|au chapeau)\b/.test(text)) {
    return { is_pay_what_you_want: true };
  }
  const amounts = publicAmountsInText(conditions);
  if (amounts.length > 0) {
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return max > min ? { price_min: min, price_max: max } : { price_min: min };
  }
  const free = /\b(gratuit|gratuite|entree libre|acces libre|entree gratuite)\b/;
  if (free.test(text) || keywords.some((keyword) => free.test(normalizeName(keyword)))) return { price_min: 0 };
  return {};
}

function addressOf(location: OnSortEvent["location"]) {
  const address = clean(location?.address);
  const city = clean(location?.city);
  const postalCity = [clean(location?.postalCode), city].filter(Boolean).join(" ");
  if (!address) return postalCity || undefined;
  return city && !normalizeName(address).includes(normalizeName(city)) ? `${address}, ${postalCity}` : address;
}

function tagsOf(event: OnSortEvent) {
  const labels = SUBCATEGORY_FIELDS.flatMap((field) => subcategoriesOf(event, field).map((id) => SUBCATEGORY_LABELS[id]));
  const tags = [...labels, ...keywordsOf(event)].filter((tag): tag is string => Boolean(tag) && tag.length >= 2 && tag.length <= 30);
  const unique = [...new Map(tags.map((tag) => [normalizeName(tag), tag])).values()].slice(0, 12);
  return unique.length ? unique : undefined;
}

/** Fiche On sort ! → données d'import communes (lieu, organisateur, catégorie, affiche, séances, tarifs). */
export function onSortEventToScrapedData(event: OnSortEvent, today: string = parisToday()): ScrapedEventData {
  const ticketUrl = (event.registration || [])
    .filter((entry) => entry?.type === "link")
    .map((entry) => (entry.value || "").trim())
    .find((value) => /^https?:\/\//i.test(value));
  const price = readOnSortPrice(french(event.conditions), keywordsOf(event));
  const description = decodeHtmlText(french(event.longDescription) || french(event.description), { multiline: true });

  const data: ScrapedEventData = {
    title: cleanOnSortTitle(event) || undefined,
    description: description || undefined,
    ...onSortSessions(event, today),
    location: clean(event.location?.name) || undefined,
    address: addressOf(event.location),
    image_url: onSortImageUrl(event),
    external_url: ticketUrl || onSortEventUrl(event),
    external_url_label: ticketUrl ? "Billetterie" : "Voir sur On sort !",
    organizer: clean(event.organizatorName) || undefined,
    category: onSortCategory(event),
    tags: tagsOf(event),
    ...price,
    price: price.price_min !== undefined ? String(price.price_min) : undefined,
    is_full: event.status === 5 || undefined,
    is_cancelled: isCancelled(event) || undefined,
    // Fiche importée à la main depuis l'admin : le scan, lui, écarte le jeune public.
    is_young_audience: isOnSortYoungAudience(event) || undefined,
  };
  for (const key of Object.keys(data) as Array<keyof ScrapedEventData>) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

/** Lecture d'une page d'événement On sort ! (vide sans JavaScript) par l'API. */
export async function scrapeOnSortEvent(url: string): Promise<ScrapeEventPageResult> {
  const startedAt = Date.now();
  const uid = onSortEventUid(url);
  if (!uid) return { ok: false, error: "Adresse d'événement On sort ! invalide", status: 400 };
  let event: OnSortEvent | null;
  try {
    event = await fetchOnSortEvent(uid);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "API On sort ! inaccessible", status: 502 };
  }
  if (!event) return { ok: false, error: "Événement introuvable sur On sort ! (retiré de l'agenda ?)", status: 404 };
  return {
    ok: true,
    data: onSortEventToScrapedData(event),
    metadata: {
      scraped: true,
      url,
      final_url: onSortEventUrl(event),
      method: "structured",
      ai_processed: false,
      duration_ms: Date.now() - startedAt,
    },
  };
}
