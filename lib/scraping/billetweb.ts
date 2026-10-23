import * as cheerio from "cheerio";

import { fetchHtml } from "./fetch-html";
import { publicPriceRange, type Tariff } from "./prices";
import { decodeHtmlText, type CheerioDocument } from "./structured-event";

/*
 * Billetweb (www.billetweb.fr) : les tarifs ne sont pas dans la page de l'événement mais dans sa boutique,
 * une iframe `shop.php?event=…` chargée par la page ; la description de ses données structurées a perdu
 * ses retours à la ligne, celle de la page (`#description`) garde ses paragraphes.
 */

export function isBilletwebUrl(url: string) {
  try {
    return /(^|\.)billetweb\.fr$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Adresse de la boutique de l'événement (`shop.php?event=…`), hors lien « billet non reçu ». */
export function billetwebShopUrl($: CheerioDocument, pageUrl: string): string | null {
  const raw =
    $(".shop_frame[data-src*='shop.php']").first().attr("data-src") ||
    $("a[href*='shop.php?event=']")
      .filter((_index: number, element: any) => !/[?&]lost=/.test($(element).attr("href") || ""))
      .first()
      .attr("href");
  if (!raw) return null;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return null;
  }
}

/** Tarifs de la boutique : nom, conditions et prix de chaque ligne (« Moins de 26 ans », 15 €). */
export function readBilletwebShopTariffs($: CheerioDocument): Tariff[] {
  const tariffs: Tariff[] = [];
  $("tr.shop_step1_ticket").each((_index: number, element: any) => {
    const row = $(element);
    const raw = row.find("input[id^='price_']").first().attr("value") ?? row.find(".shop_step1_price_value").first().text();
    const price = Number(String(raw).replace(",", ".").trim());
    if (!Number.isFinite(price)) return;
    tariffs.push({
      name: decodeHtmlText(row.attr("data-name") || row.find(".shop_step1_name_text").first().text()),
      description: decodeHtmlText(row.find(".shop_step1_description").first().text()),
      price,
    });
  });
  return tariffs;
}

/** Description de la page, paragraphes gardés. */
export function readBilletwebDescription($: CheerioDocument): string | undefined {
  const html = $("#description").first().html();
  return html ? decodeHtmlText(html, { multiline: true }) || undefined : undefined;
}

/** Description et tarifs ouverts au public d'une page d'événement Billetweb (boutique lue à part). */
export async function readBilletwebDetails($: CheerioDocument, pageUrl: string) {
  const description = readBilletwebDescription($);
  const shopUrl = billetwebShopUrl($, pageUrl);
  if (!shopUrl) return { description };
  try {
    const shop = cheerio.load((await fetchHtml(shopUrl)).html);
    return { description, ...publicPriceRange(readBilletwebShopTariffs(shop)) };
  } catch {
    // Boutique injoignable : prix inconnu.
    return { description };
  }
}
