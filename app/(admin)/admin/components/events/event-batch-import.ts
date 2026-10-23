"use client";

import { supabase } from "@/lib/supabase/client";
import { fromDatetimeLocal } from "@/lib/date-utils";
import { compressImage } from "@/lib/image-compression";
import { fetchRemoteImageBlob } from "@/lib/events/remote-image";
import { toNullablePrice } from "@/lib/events/price-utils";
import { fetchPotentialDuplicateEvents } from "@/lib/events/potential-duplicates";
import { logAdminAction } from "@/lib/admin-audit-log";

import type { EventFormPrefill, LocationData, OrganizerOption } from "./types";

/*
 * Création directe d'un événement « en attente » à partir d'un import
 * (agenda importé en lot). Reprend les règles d'enregistrement du formulaire :
 * affiche copiée dans le stockage, organisateurs, artistes, séances supplémentaires.
 */

export type BatchCreateOutcome =
  | { status: "created"; eventId: string; count: number; missing: string[] }
  | { status: "skipped"; reason: string };

/** Copie une affiche distante dans le stockage ; garde l'URL d'origine en cas d'échec. */
async function copyImageToStorage(url: string): Promise<string> {
  if (/\/storage\/v1\/object\/public\/event-images\//.test(url)) return url;
  try {
    const blob = await fetchRemoteImageBlob(url);
    const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
    const file = await compressImage(new File([blob], `import-${Date.now()}.${ext}`, { type }), 2);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop() || ext}`;
    const { data, error } = await supabase.storage
      .from("event-images")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return supabase.storage.from("event-images").getPublicUrl(data.path).data.publicUrl;
  } catch (error) {
    console.error("Copie de l'affiche impossible, URL d'origine conservée:", error);
    return url;
  }
}

function trimOrNull(value: string | undefined | null) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

export async function createPendingEventFromPrefill({
  prefill,
  locations,
  organizers,
  sourceLabel,
}: {
  prefill: EventFormPrefill;
  locations: LocationData[];
  organizers: OrganizerOption[];
  /** Provenance notée dans le journal d'audit (ex. nom de l'agenda). */
  sourceLabel: string;
}): Promise<BatchCreateOutcome> {
  const form = prefill.form || {};
  const title = (form.title || "").trim();
  if (!title) return { status: "skipped", reason: "Titre introuvable" };
  if (!form.date) return { status: "skipped", reason: "Date introuvable" };

  // Même lieu, même horaire : déjà dans l'agenda.
  if (form.location_id) {
    const duplicates = await fetchPotentialDuplicateEvents({
      supabase,
      locationId: form.location_id,
      startValue: form.date,
      endValue: form.end_date || form.date,
    }).catch(() => []);
    if (duplicates.some((duplicate) => duplicate.matchKind === "exact")) {
      return { status: "skipped", reason: "Déjà dans l’agenda au même horaire" };
    }
  }

  const location = form.location_id ? locations.find((entry) => entry.id === form.location_id) || null : null;
  const isPayWhatYouWant = Boolean(form.is_pay_what_you_want);
  const priceMin = toNullablePrice(form.price_min);
  const priceMax = toNullablePrice(form.price_max);
  const imageUrl = form.image_url ? await copyImageToStorage(form.image_url) : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const baseData = {
    title,
    description: trimOrNull(form.description),
    end_date: null as string | null,
    category: (form.category || "").trim(),
    price: isPayWhatYouWant ? null : priceMin,
    price_min: isPayWhatYouWant ? null : priceMin,
    price_max:
      isPayWhatYouWant || priceMax === null || priceMin === null || priceMax <= priceMin ? null : priceMax,
    is_pay_what_you_want: isPayWhatYouWant,
    capacity: form.capacity ? Number.parseInt(form.capacity, 10) || null : null,
    is_full: Boolean(form.is_full),
    location_id: form.location_id || null,
    room_id: null,
    door_opening_time: trimOrNull(form.door_opening_time),
    external_url: trimOrNull(form.external_url),
    external_url_label: trimOrNull(form.external_url_label),
    instagram_url: trimOrNull(form.instagram_url),
    facebook_url: trimOrNull(form.facebook_url),
    scraping_url: trimOrNull(form.scraping_url),
    image_url: imageUrl,
    status: "pending",
    is_featured: false,
    hide_from_home: false,
    tag_ids: prefill.tagIds || [],
    address: location?.address || null,
    latitude: location?.latitude || null,
    longitude: location?.longitude || null,
    created_by: user?.id || null,
  };

  // Une séance qui a son propre lien de billetterie le garde (deuxième séance du jour à Fleury).
  const slots = [
    { date: form.date, end_date: form.end_date || "", external_url: baseData.external_url },
    ...(prefill.additionalDates || []).map((slot) => ({
      date: slot.date,
      end_date: slot.end_date || "",
      external_url: trimOrNull(slot.external_url) || baseData.external_url,
    })),
  ].filter((slot, index, all) => slot.date && all.findIndex((other) => other.date === slot.date) === index);

  const organizerEntries = (eventId: string) =>
    (prefill.organizerIds || []).map((id) =>
      organizers.find((organizer) => organizer.id === id)?.type === "location"
        ? { event_id: eventId, location_id: id, organizer_id: null }
        : { event_id: eventId, organizer_id: id, location_id: null },
    );
  const artistEntries = (eventId: string) =>
    (prefill.artistIds || []).map((artistId, index) => ({
      event_id: eventId,
      artist_id: artistId,
      sort_index: index,
      role_label: null,
    }));

  let firstEventId = "";
  for (const slot of slots) {
    const { data: created, error } = await supabase
      .from("events")
      .insert([
        {
          ...baseData,
          date: fromDatetimeLocal(slot.date) || slot.date,
          end_date: slot.end_date ? fromDatetimeLocal(slot.end_date) || null : null,
          external_url: slot.external_url,
        },
      ])
      .select("id")
      .single();
    if (error) throw error;
    firstEventId = firstEventId || created.id;

    const organizersToLink = organizerEntries(created.id);
    if (organizersToLink.length) {
      const { error: organizerError } = await supabase.from("event_organizers").insert(organizersToLink);
      if (organizerError) throw organizerError;
    }
    const artistsToLink = artistEntries(created.id);
    if (artistsToLink.length) {
      const { error: artistError } = await supabase.from("event_artists").insert(artistsToLink);
      if (artistError) throw artistError;
    }
  }

  await logAdminAction({
    action: "event.create",
    entityType: "event",
    entityId: firstEventId,
    entityLabel: title,
    metadata: { status: "pending", source: "agenda_import", origin: sourceLabel, occurrences: slots.length },
  });

  const missing = [
    !baseData.category ? "catégorie" : null,
    !baseData.location_id ? "lieu" : null,
    !baseData.image_url ? "affiche" : null,
  ].filter((value): value is string => Boolean(value));

  return { status: "created", eventId: firstEventId, count: slots.length, missing };
}
