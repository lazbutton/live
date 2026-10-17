import { parisToday } from "./dates";
import {
  discoverAgendaEvents,
  isKnownUrl,
  isPastAgendaEvent,
  loadKnownEventUrlKeys,
  urlMatchKeys,
  type DiscoveredAgendaEvent,
} from "./agenda";
import { scrapeEventPage } from "./scrape-event-page";

/*
 * Scan des agendas configurés (organizer_agenda_scraping_configs) :
 * découverte des liens, tri des liens déjà connus / passés / annulés, lecture
 * des nouveautés et création d'une demande « depuis une URL » par événement.
 * Partagé par le cron et le bouton « Lancer » de la configuration de scraping.
 */

export type AgendaConfigRow = {
  id: string;
  organizer_id: string | null;
  location_id: string | null;
  agenda_url: string;
  event_link_selector: string | null;
  event_link_attribute: string | null;
  next_page_selector: string | null;
  next_page_attribute: string | null;
  max_pages: number | null;
};

export const AGENDA_CONFIG_COLUMNS =
  "id, organizer_id, location_id, agenda_url, event_link_selector, event_link_attribute, next_page_selector, next_page_attribute, max_pages";

export type AgendaPipelineEvent =
  | { type: "config_start"; label: string; url: string }
  | { type: "urls_discovered"; count: number; total: number; method: string; label: string }
  | { type: "url_skipped"; url: string; reason: "known" | "past" | "cancelled" }
  | { type: "request_created"; url: string; count: number; title: string }
  | { type: "request_enriched"; url: string; title: string }
  | { type: "error"; error: string };

export type AgendaPipelineSummary = {
  configs: number;
  discovered: number;
  created: number;
  skippedKnown: number;
  skippedPast: number;
  skippedCancelled: number;
  errors: number;
  errorDetails: string[];
  /** Vrai si le budget de temps a arrêté le scan avant la fin. */
  truncated: boolean;
};

type RunOptions = {
  supabase: any;
  configs: AgendaConfigRow[];
  /** Nombre maximum de nouveaux événements lus par source. */
  maxNewPerConfig?: number;
  /** Nombre maximum de nouveaux événements lus au total. */
  maxNewTotal?: number;
  /** Heure limite (ms epoch) : au-delà, le scan s'arrête proprement. */
  deadline?: number;
  /** Lectures simultanées. */
  concurrency?: number;
  /** Découverte seule, sans lecture ni écriture. */
  dryRun?: boolean;
  onEvent?: (event: AgendaPipelineEvent) => void;
};

async function loadOwnerLabels(supabase: any, configs: AgendaConfigRow[]) {
  const locationIds = configs.map((cfg) => cfg.location_id).filter(Boolean);
  const organizerIds = configs.map((cfg) => cfg.organizer_id).filter(Boolean);
  const [locations, organizers] = await Promise.all([
    locationIds.length
      ? supabase.from("locations").select("id, name, is_organizer").in("id", locationIds)
      : Promise.resolve({ data: [] }),
    organizerIds.length ? supabase.from("organizers").select("id, name").in("id", organizerIds) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map<string, { name: string; is_organizer?: boolean }>();
  for (const row of [...(locations.data || []), ...(organizers.data || [])]) byId.set(row.id, row);
  return byId;
}

export async function runAgendaScraping(options: RunOptions): Promise<AgendaPipelineSummary> {
  const { supabase, configs, onEvent } = options;
  const maxNewPerConfig = options.maxNewPerConfig ?? 25;
  const maxNewTotal = options.maxNewTotal ?? 60;
  const concurrency = Math.max(1, Math.min(4, options.concurrency ?? 3));
  const summary: AgendaPipelineSummary = {
    configs: configs.length,
    discovered: 0,
    created: 0,
    skippedKnown: 0,
    skippedPast: 0,
    skippedCancelled: 0,
    errors: 0,
    errorDetails: [],
    truncated: false,
  };

  const knownKeys = await loadKnownEventUrlKeys(supabase);
  const owners = await loadOwnerLabels(supabase, configs);
  const today = parisToday();
  const outOfTime = () => Boolean(options.deadline && Date.now() > options.deadline);
  let processedTotal = 0;

  const recordError = (message: string) => {
    summary.errors += 1;
    summary.errorDetails.push(message);
    onEvent?.({ type: "error", error: message });
  };

  for (const cfg of configs) {
    if (outOfTime() || processedTotal >= maxNewTotal) {
      summary.truncated = true;
      break;
    }
    const owner = owners.get((cfg.location_id || cfg.organizer_id) as string);
    const label = owner?.name || (cfg.organizer_id ? `organisateur ${cfg.organizer_id}` : `lieu ${cfg.location_id}`);
    onEvent?.({ type: "config_start", label, url: cfg.agenda_url });

    let discovered: DiscoveredAgendaEvent[] = [];
    try {
      const result = await discoverAgendaEvents({
        agendaUrl: cfg.agenda_url,
        eventLinkSelector: cfg.event_link_selector,
        eventLinkAttribute: cfg.event_link_attribute,
        nextPageSelector: cfg.next_page_selector,
        nextPageAttribute: cfg.next_page_attribute,
        maxPages: cfg.max_pages,
      });
      for (const error of result.errors) recordError(`${label} : ${error}`);
      discovered = result.events;
      summary.discovered += discovered.length;
      onEvent?.({ type: "urls_discovered", count: discovered.length, total: summary.discovered, method: result.method, label });
    } catch (error) {
      recordError(`${label} : ${error instanceof Error ? error.message : "agenda illisible"}`);
      continue;
    }

    // Tri sans coût : déjà connus, passés ou annulés selon l'agenda.
    const candidates: DiscoveredAgendaEvent[] = [];
    for (const event of discovered) {
      if (isKnownUrl(event.url, knownKeys)) {
        summary.skippedKnown += 1;
        onEvent?.({ type: "url_skipped", url: event.url, reason: "known" });
      } else if (isPastAgendaEvent(event, today)) {
        summary.skippedPast += 1;
        onEvent?.({ type: "url_skipped", url: event.url, reason: "past" });
      } else if (event.cancelled) {
        summary.skippedCancelled += 1;
        onEvent?.({ type: "url_skipped", url: event.url, reason: "cancelled" });
      } else {
        candidates.push(event);
      }
    }
    if (options.dryRun) continue;

    const queue = candidates.slice(0, Math.max(0, Math.min(maxNewPerConfig, maxNewTotal - processedTotal)));
    if (candidates.length > queue.length) summary.truncated = true;
    processedTotal += queue.length;

    const processOne = async (event: DiscoveredAgendaEvent) => {
      if (outOfTime()) {
        summary.truncated = true;
        return;
      }
      const scraped = await scrapeEventPage({
        url: event.url,
        organizer_id: cfg.organizer_id,
        location_id: cfg.location_id,
        supabase,
      });
      if (!scraped.ok) {
        recordError(`${label} : ${event.url} — ${scraped.error}`);
        return;
      }
      const data = scraped.data;
      if (data.date && data.date.slice(0, 10) < today) {
        summary.skippedPast += 1;
        onEvent?.({ type: "url_skipped", url: event.url, reason: "past" });
        return;
      }
      if (data.is_cancelled) {
        summary.skippedCancelled += 1;
        onEvent?.({ type: "url_skipped", url: event.url, reason: "cancelled" });
        return;
      }

      const eventData: Record<string, unknown> = {
        ...data,
        scraping_url: event.url,
        scrape_method: scraped.metadata.method,
      };
      if (cfg.organizer_id) eventData.organizer_id = cfg.organizer_id;
      if (cfg.location_id) {
        eventData.location_id = cfg.location_id;
        if (owner?.is_organizer) eventData.location_organizer_id = cfg.location_id;
      }

      const { error } = await supabase.from("user_requests").insert([
        {
          request_type: "event_from_url",
          status: "pending",
          source_url: event.url,
          location_id: cfg.location_id || null,
          location_name: cfg.location_id ? owner?.name || null : null,
          requested_by: null,
          event_data: eventData,
        },
      ]);
      if (error) {
        recordError(`${label} : ${event.url} — ${error.message}`);
        return;
      }
      for (const key of urlMatchKeys(event.url)) knownKeys.add(key);
      summary.created += 1;
      const title = data.title || event.title || "Nouvel événement";
      onEvent?.({ type: "request_created", url: event.url, count: summary.created, title });
      onEvent?.({ type: "request_enriched", url: event.url, title });
    };

    // Petit pool de lectures simultanées.
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (cursor < queue.length) {
          const event = queue[cursor];
          cursor += 1;
          try {
            await processOne(event);
          } catch (error) {
            recordError(`${label} : ${event.url} — ${error instanceof Error ? error.message : "erreur inconnue"}`);
          }
        }
      }),
    );
  }

  return summary;
}
