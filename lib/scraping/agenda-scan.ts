import type { SupabaseClient } from "@supabase/supabase-js";

import { getSourceKind } from "@/lib/collecte/source-kind";
import { listFacebookPageEvents } from "@/lib/facebook/page-events";

import { parisToday } from "./dates";
import {
  assessAgendaDiscovery,
  discoverAgendaEvents,
  isKnownUrl,
  isPastAgendaEvent,
  loadKnownEventUrlKeys,
  urlMatchKey,
  type AgendaDiscoveryResult,
  type AgendaUnreadable,
} from "./agenda";
import { discoverOnSortAgenda, isOnSortAgendaUrl } from "./on-sort";

/** Billetteries et agendas partagés : un même domaine pour de nombreux organisateurs. */
const SHARED_HOSTS =
  /(billetweb|mapado|weezevent|helloasso|shotgun|eventbrite|yurplan|festik|dice\.fm|fnacspectacles|ticketmaster|seetickets|facebook|instagram|sortir\.orleans-metropole|openagenda)\./i;

export type AgendaScanEvent = {
  url: string;
  title: string | null;
  date: string | null;
  image_url: string | null;
  known: boolean;
  past: boolean;
  cancelled: boolean;
  /** Agenda partagé (On sort !) : lieu, adresse et organisateur annoncés. */
  venue?: string;
  address?: string;
  organizer?: string;
};

export type AgendaScanResult = {
  events: AgendaScanEvent[];
  suggestedOwnerId: string | null;
  method: string;
  pagesVisited: number;
  errors: string[];
  usedConfig: boolean;
  /** Page d'agenda trouvée sur le site quand l'adresse scannée ne menait à rien. */
  agendaUrl?: string;
  /** Rien d'exploitable (page bloquée, agenda en texte seul…) : la page est à lire autrement. */
  unreadable?: AgendaUnreadable;
  /** Événements écartés car hors des domaines suivis, par raison (On sort !). */
  excluded?: Record<string, number>;
};

/** Page Facebook : événements à venir lisibles sans connexion, au format d'un agenda. */
async function discoverFacebookPage(url: string): Promise<AgendaDiscoveryResult> {
  try {
    return { events: await listFacebookPageEvents(url), method: "facebook", pagesVisited: 1, errors: [] };
  } catch (error) {
    const message =
      error instanceof Error && /no event data/i.test(error.message)
        ? "aucun événement à venir lisible sans connexion (page sans événement ou réservée aux membres : voir dans le navigateur)"
        : error instanceof Error
          ? error.message
          : "page illisible";
    return { events: [], method: "facebook", pagesVisited: 1, errors: [`${url} : ${message}`] };
  }
}

/**
 * Aperçu d'une page d'agenda : événements détectés, avec ceux déjà importés, passés
 * ou annulés signalés. Aucune écriture.
 */
export async function scanAgendaPage(
  supabase: SupabaseClient,
  { url, organizerId, locationId }: { url: string; organizerId?: string | null; locationId?: string | null },
): Promise<AgendaScanResult> {
  const pageKey = urlMatchKey(url);
  const host = new URL(url).hostname.replace(/^www\./, "");

  // Réglages de scraping de cette page : ceux du propriétaire choisi, sinon tout
  // agenda configuré à la même adresse (qui désigne aussi son lieu ou organisateur).
  const { data: configs } = await supabase
    .from("organizer_agenda_scraping_configs")
    .select(
      "organizer_id, location_id, agenda_url, event_link_selector, event_link_attribute, next_page_selector, next_page_attribute, max_pages",
    );
  const sameUrl = (configs || []).filter((row: any) => urlMatchKey(row.agenda_url) === pageKey);
  const config: Record<string, any> | null =
    sameUrl.find(
      (row: any) => (organizerId && row.organizer_id === organizerId) || (locationId && row.location_id === locationId),
    ) ||
    sameUrl[0] ||
    null;

  // Lieu ou organisateur probable : agenda configuré, sinon site web au même domaine
  // (hors billetteries partagées entre plusieurs structures).
  let suggestedOwnerId: string | null = config?.location_id || config?.organizer_id || null;
  if (!suggestedOwnerId && !SHARED_HOSTS.test(host)) {
    const [organizersResult, locationsResult] = await Promise.all([
      supabase.from("organizers").select("id, website_url, scraping_example_url"),
      supabase.from("locations").select("id, website_url, scraping_example_url").eq("is_organizer", true),
    ]);
    const sameHost = (value: unknown) => {
      if (typeof value !== "string" || !value) return false;
      try {
        return new URL(value).hostname.replace(/^www\./, "") === host;
      } catch {
        return false;
      }
    };
    const match = [...(locationsResult.data || []), ...(organizersResult.data || [])].find(
      (row: any) => sameHost(row.website_url) || sameHost(row.scraping_example_url),
    );
    suggestedOwnerId = match?.id || null;
  }

  const [discovery, knownKeys] = await Promise.all([
    getSourceKind(url) === "facebook"
      ? discoverFacebookPage(url)
      : isOnSortAgendaUrl(url)
        ? discoverOnSortAgenda()
        : discoverAgendaEvents({
            agendaUrl: url,
            eventLinkSelector: config?.event_link_selector,
            eventLinkAttribute: config?.event_link_attribute,
            nextPageSelector: config?.next_page_selector,
            nextPageAttribute: config?.next_page_attribute,
            maxPages: Math.min(Number(config?.max_pages || 3), 5),
            maxEvents: 100,
          }),
    loadKnownEventUrlKeys(supabase),
  ]);

  const today = parisToday();
  const events = discovery.events
    .map((event) => ({
      url: event.url,
      title: event.title || null,
      date: event.date || null,
      image_url: event.image_url || null,
      known: isKnownUrl(event.url, knownKeys),
      past: isPastAgendaEvent(event, today),
      cancelled: Boolean(event.cancelled),
      ...(event.venue ? { venue: event.venue } : {}),
      ...(event.address ? { address: event.address } : {}),
      ...(event.organizer ? { organizer: event.organizer } : {}),
    }))
    .sort((left, right) => {
      if (left.past !== right.past) return left.past ? 1 : -1;
      if (left.date && right.date) return left.date.localeCompare(right.date);
      return left.date ? -1 : right.date ? 1 : 0;
    });

  return {
    events,
    suggestedOwnerId,
    method: discovery.method,
    pagesVisited: discovery.pagesVisited,
    errors: discovery.errors,
    usedConfig: Boolean(config),
    agendaUrl: discovery.agendaUrl,
    unreadable: assessAgendaDiscovery(discovery) ?? undefined,
    excluded: discovery.excluded,
  };
}
