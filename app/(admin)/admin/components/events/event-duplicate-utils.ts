import { toDatetimeLocal } from "@/lib/date-utils";
import { parseAgendaTypes } from "@/lib/events/agenda-types";
import { deriveGenericPriceRange } from "@/lib/events/price-utils";

import type { AdminEvent, EventFormPrefill } from "./types";

/**
 * Pré-remplit le formulaire de création à partir d'un événement existant
 * (duplication). Le nouvel événement repart en attente et hors « à la une ».
 */
export function buildEventFormPrefillFromEvent(event: AdminEvent): EventFormPrefill {
  const prices = deriveGenericPriceRange(event);

  const organizerIds =
    event.event_organizers
      ?.map((entry) => entry.organizer?.id || entry.location?.id || null)
      .filter((id): id is string => Boolean(id)) ?? [];

  const artistIds =
    [...(event.event_artists ?? [])]
      .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
      .map((entry) => entry.artist?.id || null)
      .filter((id): id is string => Boolean(id)) ?? [];

  return {
    form: {
      title: event.title || "",
      description: event.description || "",
      date: toDatetimeLocal(event.date),
      end_date: event.end_date ? toDatetimeLocal(event.end_date) : "",
      category: event.category || "",
      price_min: prices.priceMin != null ? String(prices.priceMin) : "",
      price_max: prices.priceMax != null ? String(prices.priceMax) : "",
      is_pay_what_you_want: Boolean(event.is_pay_what_you_want),
      capacity: event.capacity != null ? String(event.capacity) : "",
      is_full: false,
      location_id: event.location_id || "",
      room_id: event.room_id || "",
      door_opening_time: event.door_opening_time || "",
      external_url: event.external_url || "",
      external_url_label: event.external_url_label || "",
      instagram_url: event.instagram_url || "",
      facebook_url: event.facebook_url || "",
      scraping_url: event.scraping_url || "",
      image_url: event.image_url || "",
      status: "pending",
      is_featured: false,
      hide_from_home: Boolean(event.hide_from_home),
      show_on_app: event.show_on_app !== false,
      agenda_types: parseAgendaTypes(event.agenda_types),
      major_event_id: event.major_event_events?.[0]?.major_event_id || "",
    },
    organizerIds,
    artistIds,
    tagIds: event.tag_ids ?? [],
  };
}
