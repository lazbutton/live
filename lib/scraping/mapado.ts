import * as cheerio from "cheerio";

import { parisToday, toParisWallClock } from "./dates";
import { fetchHtml } from "./fetch-html";
import { publicPriceRange } from "./prices";
import type { CheerioDocument } from "./structured-event";

/*
 * Billetteries Mapado (billetterie-sn-orleans.mapado.com, theatre-tete-noire.mapado.com,
 * ville-lachapellesaintmesmin.mapado.com…) : pages Next.js sans données schema.org, dont l'état
 * (`__NEXT_DATA__`) contient les séances et les tarifs. Un événement à plusieurs séances n'y a pas de
 * tarifs : ils ne s'affichent qu'une séance choisie, à la même adresse avec `?eventDate=<id>`.
 */

type MapadoTicketPrice = {
  name?: string | null;
  description?: string | null;
  /** En centimes. */
  facialValue?: number | null;
  /** `full_price`, `reduced`, `group`, `subscriptionMemberLoyalty`, `exempted`… */
  type?: string | null;
  visible?: boolean | null;
  isPriceDisplayed?: boolean | null;
};

type MapadoEventDate = { "@id"?: string | null; startDate?: string | null };

/**
 * Tarifs réservés par nature : abonnement et fidélité, groupe, invitation. Une exonération (`exempted`)
 * peut être la réservation d'un spectacle gratuit ; la carte d'abonné qu'elle désigne aussi n'affiche
 * pas de prix (`isPriceDisplayed: false`).
 */
const RESTRICTED_TYPES = new Set(["subscriptionMemberLoyalty", "group", "invitation"]);

export function isMapadoEventUrl(url: string) {
  try {
    const parsed = new URL(url);
    return /(^|\.)mapado\.com$/i.test(parsed.hostname) && /^\/event\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Séances (identifiant et début) et tarifs de la page ; `prices` vaut null tant qu'aucune séance n'est choisie. */
export function readMapadoTicketing($: CheerioDocument) {
  let entities: any;
  try {
    entities = JSON.parse($("script#__NEXT_DATA__").first().text() || "null")?.props?.pageProps?.entities;
  } catch {
    return null;
  }
  if (!entities || typeof entities !== "object") return null;
  const sessions = ((entities.eventDates?.["hydra:member"] || []) as MapadoEventDate[])
    .map((session) => ({ id: /\/(\d+)$/.exec(session["@id"] || "")?.[1], start: session.startDate || "" }))
    .filter((session): session is { id: string; start: string } => Boolean(session.id && session.start));
  const members = entities.ticketPrices?.["hydra:member"];
  return { sessions, prices: Array.isArray(members) ? (members as MapadoTicketPrice[]) : null };
}

/** Fourchette des tarifs ouverts au public, en euros. */
export function mapadoPriceRange(prices: MapadoTicketPrice[]) {
  return publicPriceRange(
    prices
      .filter(
        (price) =>
          typeof price.facialValue === "number" &&
          price.visible !== false &&
          price.isPriceDisplayed !== false &&
          !RESTRICTED_TYPES.has(price.type || ""),
      )
      .map((price) => ({ name: price.name, description: price.description, price: (price.facialValue as number) / 100 })),
  );
}

/**
 * Tarifs d'un événement Mapado : ceux de la page, sinon (plusieurs séances) ceux de sa première séance à
 * venir, lus sur la page de la séance.
 */
export async function readMapadoPrices($: CheerioDocument, pageUrl: string, today: string = parisToday()) {
  const ticketing = readMapadoTicketing($);
  if (!ticketing) return {};
  if (ticketing.prices) return mapadoPriceRange(ticketing.prices);
  const session =
    ticketing.sessions.find((entry) => (toParisWallClock(entry.start)?.value || "").slice(0, 10) >= today) ??
    ticketing.sessions[0];
  if (!session) return {};
  try {
    const sessionUrl = new URL(pageUrl);
    sessionUrl.searchParams.set("eventDate", session.id);
    const prices = readMapadoTicketing(cheerio.load((await fetchHtml(sessionUrl.toString())).html))?.prices;
    return prices ? mapadoPriceRange(prices) : {};
  } catch {
    return {};
  }
}
