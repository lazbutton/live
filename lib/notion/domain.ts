import type { SupabaseClient } from "@supabase/supabase-js";
import {
  approveMobileEvent,
  quickEditMobileEvent,
  rejectMobileAdminRequest,
  toggleMobileEventFeatured,
  toggleMobileEventFull,
} from "@/lib/admin-mobile";
import {
  fetchEventById,
  getEventLinkByLiveId,
  mapEventToNotionProperties,
} from "@/lib/notion/mappers/events";
import {
  fetchRequestById,
  getRequestLinkByLiveId,
  mapRequestToNotionProperties,
} from "@/lib/notion/mappers/requests";
import {
  fetchLocationById,
  fetchOrganizerById,
  getLocationLinkByLiveId,
  getOrganizerLinkByLiveId,
  mapLocationToNotionProperties,
  mapOrganizerToNotionProperties,
} from "@/lib/notion/mappers/references";
import type {
  NotionEntityKind,
  NotionOwnerKind,
  NotionSyncDirection,
} from "@/lib/notion/types";
import { computeSyncHash } from "@/lib/notion/utils";
import { getNotionSyncConfig } from "@/lib/notion/config";
import { enqueueSyncJob } from "@/lib/notion/queue";
import type { Client } from "@notionhq/client";

type NotionPagePropertiesRequest = NonNullable<
  Parameters<Client["pages"]["create"]>[0]["properties"]
>;

type ApplyEventSyncInput = {
  liveEventId: string | null;
  updates: Record<string, unknown>;
  organizerRefs?: Array<{
    ownerId: string;
    ownerKind: "organizer" | "location";
  }>;
  action?: string | null;
};

type ApplyRequestSyncInput = {
  liveRequestId: string | null;
  requestType?: string | null;
  updates: {
    status?: string | null;
    lane?: string | null;
    source_url?: string | null;
    location_id?: string | null;
    event_data?: Record<string, unknown>;
    moderation_reason?: string | null;
    contributor_message?: string | null;
    internal_notes?: string | null;
    allow_user_resubmission?: boolean;
    converted_event_id?: string | null;
  };
  action?: string | null;
};

function normalizeString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeUuidList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "oui"].includes(value.trim().toLowerCase());
  }
  return false;
}

function readSyncHashFromProperties(
  properties: Record<string, unknown>,
  propertyName: string
) {
  const property = properties[propertyName] as
    | { rich_text?: Array<{ text?: { content?: string } }> }
    | undefined;
  const value = property?.rich_text?.[0]?.text?.content?.trim();
  return value || null;
}

async function resolveReviewedByUserId(supabase: SupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.id) {
    return userData.user.id;
  }

  const config = getNotionSyncConfig();
  if (config.syncActorUserId) {
    return config.syncActorUserId;
  }

  throw new Error(
    "Aucun utilisateur admin disponible pour attribuer reviewed_by. Configure NOTION_SYNC_ACTOR_USER_ID."
  );
}

function validateEventDataForConversion(eventData: Record<string, unknown>) {
  const title = normalizeString(eventData.title);
  const date = normalizeDate(eventData.date);
  const category = normalizeString(eventData.category);

  if (!title || title.length < 3) {
    throw new Error("Le titre est requis pour convertir la demande");
  }
  if (!date) {
    throw new Error("La date est requise pour convertir la demande");
  }
  if (!category) {
    throw new Error("La catégorie est requise pour convertir la demande");
  }

  return {
    title,
    date,
    category,
  };
}

async function convertRequestToEventWithService(
  supabase: SupabaseClient,
  requestId: string,
  reviewedBy: string
) {
  const request = await fetchRequestById(supabase, requestId);
  if (!request) {
    throw new Error("Demande introuvable");
  }
  if (request.status !== "pending") {
    throw new Error("La demande doit être pending pour être convertie");
  }

  const eventData = request.event_data ?? {};
  const required = validateEventDataForConversion(eventData);

  const insertPayload = {
    title: required.title,
    description: normalizeString(eventData.description),
    date: required.date,
    end_date: normalizeDate(eventData.end_date),
    location_id:
      normalizeString(eventData.location_id) ?? normalizeString(request.location_id),
    image_url: normalizeString(eventData.image_url),
    category: required.category,
    price: normalizeNumber(eventData.price),
    presale_price: normalizeNumber(eventData.presale_price),
    subscriber_price: normalizeNumber(eventData.subscriber_price),
    address: normalizeString(eventData.address),
    capacity: normalizeNumber(eventData.capacity),
    door_opening_time: normalizeString(eventData.door_opening_time),
    external_url: normalizeString(eventData.external_url) ?? normalizeString(request.source_url),
    external_url_label: normalizeString(eventData.external_url_label),
    instagram_url: normalizeString(eventData.instagram_url),
    facebook_url: normalizeString(eventData.facebook_url),
    scraping_url: normalizeString(eventData.scraping_url) ?? normalizeString(request.source_url),
    created_by: request.requested_by ?? null,
    status: "pending",
    community_submission: true,
    community_attribution_opt_in: request.community_attribution_opt_in === true,
    community_contributor_label:
      request.community_attribution_opt_in === true
        ? normalizeString(request.contributor_display_name)
        : null,
  };

  const { data: createdEvent, error: insertError } = await supabase
    .from("events")
    .insert(insertPayload)
    .select("id")
    .single();
  if (insertError) throw insertError;

  const organizerId = normalizeString(eventData.organizer_id);
  if (organizerId) {
    const { error: organizerError } = await supabase
      .from("event_organizers")
      .insert({
        event_id: createdEvent.id,
        organizer_id: organizerId,
        location_id: null,
      });
    if (organizerError) throw organizerError;
  }

  const { error: updateError } = await supabase
    .from("user_requests")
    .update({
      status: "converted",
      converted_event_id: createdEvent.id,
      converted_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      internal_notes: [normalizeString(request.internal_notes), `Converti en événement ID: ${createdEvent.id}`]
        .filter(Boolean)
        .join("\n"),
      notes: [normalizeString(request.notes), `Converti en événement ID: ${createdEvent.id}`]
        .filter(Boolean)
        .join("\n"),
    })
    .eq("id", requestId);
  if (updateError) throw updateError;

  return createdEvent.id as string;
}

function buildEventPatch(updates: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};

  const stringFields = [
    "title",
    "description",
    "category",
    "address",
    "door_opening_time",
    "external_url",
    "external_url_label",
    "instagram_url",
    "facebook_url",
    "scraping_url",
    "image_url",
    "room_id",
  ];

  for (const key of stringFields) {
    if (!(key in updates)) continue;
    patch[key] = normalizeString(updates[key]);
  }

  if ("date" in updates) {
    patch.date = normalizeDate(updates.date);
  }
  if ("end_date" in updates) {
    patch.end_date = normalizeDate(updates.end_date);
  }
  if ("price" in updates) {
    patch.price = normalizeNumber(updates.price);
  }
  if ("presale_price" in updates) {
    patch.presale_price = normalizeNumber(updates.presale_price);
  }
  if ("subscriber_price" in updates) {
    patch.subscriber_price = normalizeNumber(updates.subscriber_price);
  }
  if ("capacity" in updates) {
    patch.capacity = normalizeNumber(updates.capacity);
  }
  if ("location_id" in updates) {
    patch.location_id = normalizeString(updates.location_id);
  }
  if ("is_full" in updates) {
    patch.is_full = normalizeBoolean(updates.is_full);
  }
  if ("is_featured" in updates) {
    patch.is_featured = normalizeBoolean(updates.is_featured);
  }
  if ("archived" in updates) {
    patch.archived = normalizeBoolean(updates.archived);
  }
  if ("status" in updates) {
    const status = normalizeString(updates.status);
    patch.status =
      status && ["pending", "approved", "rejected"].includes(status)
        ? status
        : null;
  }
  if ("tag_ids" in updates) {
    patch.tag_ids = normalizeUuidList(updates.tag_ids);
  }

  Object.keys(patch).forEach((key) => {
    if (patch[key] === undefined) {
      delete patch[key];
    }
  });

  return patch;
}

function buildRequestPatch(updates: ApplyRequestSyncInput["updates"]) {
  const eventData = updates.event_data ?? {};

  return {
    status: normalizeString(updates.status),
    source_url: normalizeString(updates.source_url),
    location_id: normalizeString(updates.location_id),
    event_data: {
      title: normalizeString(eventData.title),
      description: normalizeString(eventData.description),
      date: normalizeDate(eventData.date),
      end_date: normalizeDate(eventData.end_date),
      category: normalizeString(eventData.category),
      location_id: normalizeString(eventData.location_id) ?? normalizeString(updates.location_id),
      organizer_id: normalizeString(eventData.organizer_id),
      organizer_names: normalizeUuidList(eventData.organizer_names),
      address: normalizeString(eventData.address),
      price: normalizeNumber(eventData.price),
      presale_price: normalizeNumber(eventData.presale_price),
      subscriber_price: normalizeNumber(eventData.subscriber_price),
      capacity: normalizeNumber(eventData.capacity),
      door_opening_time: normalizeString(eventData.door_opening_time),
      image_url: normalizeString(eventData.image_url),
      external_url: normalizeString(eventData.external_url),
      external_url_label: normalizeString(eventData.external_url_label),
      scraping_url: normalizeString(eventData.scraping_url),
      instagram_url: normalizeString(eventData.instagram_url),
      facebook_url: normalizeString(eventData.facebook_url),
      tag_ids: normalizeUuidList(eventData.tag_ids),
    },
    moderation_reason: normalizeString(updates.moderation_reason),
    contributor_message: normalizeString(updates.contributor_message),
    internal_notes: normalizeString(updates.internal_notes),
    allow_user_resubmission: updates.allow_user_resubmission === true,
    converted_event_id: normalizeString(updates.converted_event_id),
  };
}

export async function exportEntityToNotionPayload(
  supabase: SupabaseClient,
  entityKind: NotionEntityKind,
  entityId: string
): Promise<{
  entityKind: NotionEntityKind;
  entityId: string;
  notionPageId: string | null;
  liveUpdatedAt: string | null;
  notionLastEditedAt: string | null;
  syncHash: string | null;
  properties: NotionPagePropertiesRequest;
} | null> {
  switch (entityKind) {
    case "event": {
      const event = await fetchEventById(supabase, entityId);
      if (!event) return null;
      const link = await getEventLinkByLiveId(supabase, entityId);
      const properties = await mapEventToNotionProperties(supabase, event);
      return {
        entityKind,
        entityId,
        notionPageId: link?.notion_page_id ?? null,
        liveUpdatedAt: event.updated_at ?? null,
        notionLastEditedAt: link?.notion_last_edited_at ?? null,
        syncHash: readSyncHashFromProperties(properties, "Sync hash"),
        properties,
      };
    }
    case "request": {
      const request = await fetchRequestById(supabase, entityId);
      if (!request) return null;
      const link = await getRequestLinkByLiveId(supabase, entityId);
      const properties = await mapRequestToNotionProperties(supabase, request);
      return {
        entityKind,
        entityId,
        notionPageId: link?.notion_page_id ?? null,
        liveUpdatedAt: request.updated_at ?? null,
        notionLastEditedAt: link?.notion_last_edited_at ?? null,
        syncHash: readSyncHashFromProperties(properties, "Sync hash"),
        properties,
      };
    }
    case "location": {
      const location = await fetchLocationById(supabase, entityId);
      if (!location) return null;
      const link = await getLocationLinkByLiveId(supabase, entityId);
      const properties = mapLocationToNotionProperties(location);
      return {
        entityKind,
        entityId,
        notionPageId: link?.notion_page_id ?? null,
        liveUpdatedAt: location.updated_at ?? null,
        notionLastEditedAt: link?.notion_last_edited_at ?? null,
        syncHash: readSyncHashFromProperties(properties, "Sync hash"),
        properties,
      };
    }
    case "organizer": {
      const organizer = await fetchOrganizerById(supabase, "organizer", entityId);
      if (!organizer) return null;
      const link = await getOrganizerLinkByLiveId(supabase, "organizer", entityId);
      const properties = mapOrganizerToNotionProperties("organizer", organizer);
      return {
        entityKind,
        entityId,
        notionPageId: link?.notion_page_id ?? null,
        liveUpdatedAt: organizer.updated_at ?? null,
        notionLastEditedAt: link?.notion_last_edited_at ?? null,
        syncHash: readSyncHashFromProperties(properties, "Sync hash"),
        properties,
      };
    }
    default:
      return null;
  }
}

export async function applyNotionEventToLive(
  supabase: SupabaseClient,
  input: ApplyEventSyncInput
) {
  const action = normalizeString(input.action)?.toLowerCase();
  const patch = buildEventPatch(input.updates);

  if (!input.liveEventId) {
    const insertPayload = {
      ...patch,
      created_by: null,
      status: normalizeString(patch.status) ?? "pending",
    };

    const { data, error } = await supabase
      .from("events")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) throw error;

    const eventId = data.id as string;
    await syncEventOrganizers(supabase, eventId, input.organizerRefs ?? []);
    return eventId;
  }

  const eventId = input.liveEventId;

  if (patch.title || patch.date || patch.location_id || patch.price || patch.external_url || patch.external_url_label) {
    await quickEditMobileEvent(supabase, eventId, {
      title: typeof patch.title === "string" ? patch.title : undefined,
      date: typeof patch.date === "string" ? patch.date : undefined,
      locationId:
        typeof patch.location_id === "string"
          ? patch.location_id
          : undefined,
      price:
        typeof patch.price === "number" ? patch.price : patch.price === null ? null : undefined,
      externalUrl:
        typeof patch.external_url === "string"
          ? patch.external_url
          : patch.external_url === null
            ? null
            : undefined,
      externalUrlLabel:
        typeof patch.external_url_label === "string"
          ? patch.external_url_label
          : patch.external_url_label === null
            ? null
            : undefined,
    });

    delete patch.title;
    delete patch.date;
    delete patch.location_id;
    delete patch.price;
    delete patch.external_url;
    delete patch.external_url_label;
  }

  if (patch.status === "approved" || action === "approve") {
    await approveMobileEvent(supabase, eventId);
    delete patch.status;
  }

  if ("is_featured" in patch) {
    const current = await fetchEventById(supabase, eventId);
    if (current && Boolean(current.is_featured) !== Boolean(patch.is_featured)) {
      await toggleMobileEventFeatured(supabase, eventId);
    }
    delete patch.is_featured;
  }

  if ("is_full" in patch) {
    const current = await fetchEventById(supabase, eventId);
    if (current && Boolean(current.is_full) !== Boolean(patch.is_full)) {
      await toggleMobileEventFull(supabase, eventId);
    }
    delete patch.is_full;
  }

  if (action === "delete") {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) throw error;
    return eventId;
  }

  if (action === "archive") {
    patch.archived = true;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("events").update(patch).eq("id", eventId);
    if (error) throw error;
  }

  if (input.organizerRefs) {
    await syncEventOrganizers(supabase, eventId, input.organizerRefs);
  }

  return eventId;
}

async function syncEventOrganizers(
  supabase: SupabaseClient,
  eventId: string,
  organizerRefs: Array<{
    ownerId: string;
    ownerKind: "organizer" | "location";
  }>
) {
  await supabase.from("event_organizers").delete().eq("event_id", eventId);

  if (organizerRefs.length === 0) return;

  const rows = organizerRefs.map((organizerRef) =>
    organizerRef.ownerKind === "location"
      ? {
          event_id: eventId,
          organizer_id: null,
          location_id: organizerRef.ownerId,
        }
      : {
          event_id: eventId,
          organizer_id: organizerRef.ownerId,
          location_id: null,
        }
  );
  const { error } = await supabase.from("event_organizers").insert(rows);
  if (error) throw error;
}

export async function applyNotionRequestToLive(
  supabase: SupabaseClient,
  input: ApplyRequestSyncInput
) {
  const action = normalizeString(input.action)?.toLowerCase();
  const patch = buildRequestPatch(input.updates);

  if (!input.liveRequestId) {
    const insertPayload = {
      request_type:
        input.requestType === "event_from_url" ? "event_from_url" : "event_creation",
      status: "pending",
      requested_by: null,
      location_id: patch.location_id,
      source_url: patch.source_url,
      event_data: patch.event_data,
    };

    const { data, error } = await supabase
      .from("user_requests")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  const requestId = input.liveRequestId;

  if (action === "convert" || patch.status === "converted") {
    const reviewedBy = await resolveReviewedByUserId(supabase);
    await convertRequestToEventWithService(supabase, requestId, reviewedBy);
    return requestId;
  }

  if (action === "reject" || patch.status === "rejected") {
    const reviewedBy = await resolveReviewedByUserId(supabase);
    await rejectMobileAdminRequest(supabase, requestId, {
      reviewedBy,
      internalNotes: patch.internal_notes ?? "",
      moderationReason:
        (patch.moderation_reason as
          | "duplicate"
          | "invalid_date"
          | "insufficient_info"
          | "unreliable_source"
          | "out_of_scope"
          | null) ?? "insufficient_info",
      contributorMessage: patch.contributor_message ?? "",
      allowUserResubmission: patch.allow_user_resubmission === true,
    });
    return requestId;
  }

  if (action === "delete") {
    const { error } = await supabase
      .from("user_requests")
      .delete()
      .eq("id", requestId);
    if (error) throw error;
    return requestId;
  }

  const updatePayload: Record<string, unknown> = {
    event_data: patch.event_data,
  };
  if (patch.status) updatePayload.status = patch.status;
  if (patch.source_url !== undefined) updatePayload.source_url = patch.source_url;
  if (patch.location_id !== undefined) updatePayload.location_id = patch.location_id;
  if (patch.internal_notes !== undefined)
    updatePayload.internal_notes = patch.internal_notes;
  if (patch.moderation_reason !== undefined)
    updatePayload.moderation_reason = patch.moderation_reason;
  if (patch.contributor_message !== undefined)
    updatePayload.contributor_message = patch.contributor_message;
  if (patch.allow_user_resubmission !== undefined)
    updatePayload.allow_user_resubmission = patch.allow_user_resubmission;

  const { error } = await supabase
    .from("user_requests")
    .update(updatePayload)
    .eq("id", requestId);
  if (error) throw error;

  return requestId;
}

export async function upsertEventLink(
  supabase: SupabaseClient,
  input: {
    eventId: string;
    notionPageId: string;
    notionPageUrl?: string | null;
    liveUpdatedAt?: string | null;
    notionLastEditedAt?: string | null;
    direction?: NotionSyncDirection | null;
    syncHash?: string | null;
  }
) {
  const payload = {
    event_id: input.eventId,
    notion_page_id: input.notionPageId,
    notion_page_url: input.notionPageUrl ?? null,
    live_updated_at: input.liveUpdatedAt ?? null,
    notion_last_edited_at: input.notionLastEditedAt ?? null,
    last_synced_at: new Date().toISOString(),
    last_sync_direction: input.direction ?? "to_notion",
    last_sync_hash: input.syncHash ?? null,
    deleted_at: null,
  };

  const { error } = await supabase
    .from("notion_event_links")
    .upsert(payload, { onConflict: "event_id" });
  if (error) throw error;
}

export async function upsertRequestLink(
  supabase: SupabaseClient,
  input: {
    requestId: string;
    notionPageId: string;
    notionPageUrl?: string | null;
    liveUpdatedAt?: string | null;
    notionLastEditedAt?: string | null;
    direction?: NotionSyncDirection | null;
    syncHash?: string | null;
  }
) {
  const payload = {
    request_id: input.requestId,
    notion_page_id: input.notionPageId,
    notion_page_url: input.notionPageUrl ?? null,
    live_updated_at: input.liveUpdatedAt ?? null,
    notion_last_edited_at: input.notionLastEditedAt ?? null,
    last_synced_at: new Date().toISOString(),
    last_sync_direction: input.direction ?? "to_notion",
    last_sync_hash: input.syncHash ?? null,
    deleted_at: null,
  };

  const { error } = await supabase
    .from("notion_request_links")
    .upsert(payload, { onConflict: "request_id" });
  if (error) throw error;
}

export async function upsertLocationLink(
  supabase: SupabaseClient,
  input: {
    locationId: string;
    notionPageId: string;
    notionPageUrl?: string | null;
    liveUpdatedAt?: string | null;
    notionLastEditedAt?: string | null;
    direction?: NotionSyncDirection | null;
    syncHash?: string | null;
  }
) {
  const payload = {
    location_id: input.locationId,
    notion_page_id: input.notionPageId,
    notion_page_url: input.notionPageUrl ?? null,
    live_updated_at: input.liveUpdatedAt ?? null,
    notion_last_edited_at: input.notionLastEditedAt ?? null,
    last_synced_at: new Date().toISOString(),
    last_sync_direction: input.direction ?? "to_notion",
    last_sync_hash: input.syncHash ?? null,
    deleted_at: null,
  };

  const { error } = await supabase
    .from("notion_location_links")
    .upsert(payload, { onConflict: "location_id" });
  if (error) throw error;
}

export async function upsertOrganizerLink(
  supabase: SupabaseClient,
  input: {
    ownerKind: NotionOwnerKind;
    ownerId: string;
    notionPageId: string;
    notionPageUrl?: string | null;
    liveUpdatedAt?: string | null;
    notionLastEditedAt?: string | null;
    direction?: NotionSyncDirection | null;
    syncHash?: string | null;
  }
) {
  const payload = {
    owner_kind: input.ownerKind,
    owner_id: input.ownerId,
    notion_page_id: input.notionPageId,
    notion_page_url: input.notionPageUrl ?? null,
    live_updated_at: input.liveUpdatedAt ?? null,
    notion_last_edited_at: input.notionLastEditedAt ?? null,
    last_synced_at: new Date().toISOString(),
    last_sync_direction: input.direction ?? "to_notion",
    last_sync_hash: input.syncHash ?? null,
    deleted_at: null,
  };

  const { error } = await supabase
    .from("notion_organizer_links")
    .upsert(payload, { onConflict: "owner_kind,owner_id" });
  if (error) throw error;
}

export async function triggerOutboundEntitySync(
  supabase: SupabaseClient,
  entityKind: NotionEntityKind,
  entityId: string,
  reason: string
) {
  const config = getNotionSyncConfig();
  if (
    (entityKind === "location" && !config.locationsDataSourceId) ||
    (entityKind === "organizer" && !config.organizersDataSourceId)
  ) {
    return null;
  }

  return enqueueSyncJob(
    {
      entityKind,
      entityId,
      direction: "to_notion",
      reason,
      dedupeKey: `${entityKind}:${entityId}:${reason}`,
    },
    supabase
  );
}
