import { cleanEventDescription, cleanEventTitle } from "@/lib/collecte/event-text";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { toDatetimeLocal } from "@/lib/date-utils";
import { logAdminAction } from "@/lib/admin-audit-log";

import type { EventFormPrefill } from "./types";

/** Pré-remplit le formulaire d'événement à partir d'une demande utilisateur. */
export function buildEventFormPrefillFromRequest(request: any): EventFormPrefill {
  const eventData = request?.event_data || {};
  const sourceUrl =
    eventData.external_url || eventData.scraping_url || request?.source_url || "";
  const priceValue =
    eventData.price ?? eventData.price_min ?? eventData.presale_price ?? null;

  const organizerIds = [
    eventData.organizer_id,
    eventData.location_organizer_id,
    request?.organizer_id,
  ].filter(Boolean) as string[];

  return {
    form: {
      // Pages lues par la collecte automatique, saisies de l'app : titre et description nettoyés.
      title: cleanEventTitle(eventData.title || eventData.name || "", {
        venues: [eventData.location, request?.location_name],
        category: typeof eventData.category === "string" ? eventData.category : null,
      }),
      description: cleanEventDescription(eventData.description) || request?.notes || "",
      date: toDatetimeLocal(eventData.date),
      end_date: toDatetimeLocal(eventData.end_date),
      category: eventData.category || "",
      location_id: eventData.location_id || request?.location_id || "",
      price_min: priceValue !== null && priceValue !== undefined ? String(priceValue) : "",
      price_max:
        eventData.price_max !== null && eventData.price_max !== undefined
          ? String(eventData.price_max)
          : "",
      is_pay_what_you_want: Boolean(eventData.is_pay_what_you_want),
      capacity:
        eventData.capacity !== null && eventData.capacity !== undefined
          ? String(eventData.capacity)
          : "",
      external_url: sourceUrl,
      external_url_label: eventData.external_url_label || "",
      scraping_url: eventData.scraping_url || request?.source_url || "",
      instagram_url: eventData.instagram_url || "",
      facebook_url: eventData.facebook_url || "",
      image_url: eventData.image_url || "",
      status: "pending",
    },
    organizerIds,
    tagIds: Array.isArray(eventData.tag_ids) ? eventData.tag_ids : [],
  };
}

/**
 * Marque une demande comme convertie après la création de son événement
 * (journal d'audit + toast). Renvoie false si la mise à jour échoue.
 */
export async function markRequestConverted(requestId: string, eventId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("user_requests")
    .update({
      status: "converted",
      converted_event_id: eventId,
      converted_at: new Date().toISOString(),
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    toast({
      title: "Demande non synchronisée",
      description: error.message,
      variant: "destructive",
    });
    return false;
  }

  await logAdminAction({
    action: "request.convert",
    entityType: "request",
    entityId: requestId,
    entityLabel: `Événement ${eventId}`,
    metadata: { created_event_id: eventId, source: "event_form_sheet" },
  });
  toast({ title: "Demande marquée convertie", variant: "success" });
  return true;
}
