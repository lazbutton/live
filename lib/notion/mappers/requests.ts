import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTION_REQUEST_SCHEMA } from "@/lib/notion/schema";
import {
  buildCheckboxProperty,
  buildDateProperty,
  buildNumberProperty,
  buildRelationProperty,
  buildRichTextProperty,
  buildTitleProperty,
  buildUrlProperty,
  getCheckboxValue,
  getDateStartOrStringValue,
  getDateValue,
  getNumberValue,
  getRelationIds,
  getRichTextValue,
  getStringValue,
} from "@/lib/notion/properties";
import {
  buildAdminRequestItem,
  type AdminRawRequest,
} from "@/lib/admin-requests-core";
import { getLocationLinkByLiveId } from "@/lib/notion/mappers/references";
import { getOrganizerLinkByLiveId } from "@/lib/notion/mappers/references";
import type {
  NotionPage,
  NotionRequestLinkRow,
} from "@/lib/notion/types";
import { computeSyncHash } from "@/lib/notion/utils";

type RawRequestRow = AdminRawRequest;

async function resolveRequestOrganizerRelationPageIds(
  supabase: SupabaseClient,
  request: ReturnType<typeof buildAdminRequestItem>
) {
  const relationPageIds: string[] = [];

  const organizerId =
    typeof request.raw.event_data?.organizer_id === "string"
      ? request.raw.event_data.organizer_id.trim()
      : null;

  if (organizerId) {
    const organizerLink = await getOrganizerLinkByLiveId(
      supabase,
      "organizer",
      organizerId
    );
    if (organizerLink?.notion_page_id) {
      relationPageIds.push(organizerLink.notion_page_id);
    }
  }

  return [...new Set(relationPageIds)];
}

export async function getRequestLinkByLiveId(
  supabase: SupabaseClient,
  requestId: string
) {
  const { data, error } = await supabase
    .from("notion_request_links")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionRequestLinkRow | null;
}

export async function getRequestLinkByNotionPageId(
  supabase: SupabaseClient,
  notionPageId: string
) {
  const { data, error } = await supabase
    .from("notion_request_links")
    .select("*")
    .eq("notion_page_id", notionPageId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionRequestLinkRow | null;
}

export async function fetchRequestById(
  supabase: SupabaseClient,
  requestId: string
) {
  const { data, error } = await supabase
    .from("user_requests")
    .select(
      [
        "id",
        "request_type",
        "status",
        "requested_at",
        "requested_by",
        "reviewed_by",
        "reviewed_at",
        "notes",
        "internal_notes",
        "moderation_reason",
        "contributor_message",
        "allow_user_resubmission",
        "contributor_display_name",
        "community_attribution_opt_in",
        "event_data",
        "source_url",
        "location_id",
        "location_name",
        "converted_event_id",
        "converted_at",
        "updated_at",
      ].join(",")
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RawRequestRow | null;
}

export async function mapRequestToNotionProperties(
  supabase: SupabaseClient,
  rawRequest: RawRequestRow
) {
  const request = buildAdminRequestItem(rawRequest);
  const schema = NOTION_REQUEST_SCHEMA.propertyNames;
  const eventData = request.raw.event_data ?? {};
  const locationId =
    (typeof rawRequest.location_id === "string" && rawRequest.location_id.trim()) ||
    (typeof eventData.location_id === "string" && eventData.location_id.trim()) ||
    null;
  const locationLink = await getLocationLinkByLiveId(supabase, locationId);
  const organizerRelationPageIds =
    await resolveRequestOrganizerRelationPageIds(supabase, request);
  const sourceUpdatedAt = rawRequest.updated_at ?? new Date().toISOString();
  const tagIds = Array.isArray(eventData.tag_ids)
    ? eventData.tag_ids.filter(Boolean).map((value) => String(value))
    : [];

  const payloadForHash = {
    id: request.id,
    request_type: request.requestType,
    status: request.status,
    lane: request.lane,
    title: request.title,
    requested_at: request.requestedAt,
    reviewed_at: request.reviewedAt,
    event_date: request.eventDate,
    end_date: request.endDate,
    category: request.category,
    location_summary: request.locationSummary,
    organizer_summary: request.organizerSummary,
    source_url: request.sourceUrl,
    moderation_reason: request.moderationReason,
    contributor_message: request.contributorMessage,
    internal_notes: request.internalNotes,
    allow_user_resubmission: request.allowUserResubmission,
    converted_event_id: request.convertedEventId,
    event_data: eventData,
    updated_at: sourceUpdatedAt,
  };

  return {
    [schema.title]: buildTitleProperty(request.title),
    [schema.requestType]: buildRichTextProperty(request.requestType),
    [schema.status]: buildRichTextProperty(request.status),
    [schema.lane]: buildRichTextProperty(request.lane),
    [schema.eventDate]: buildDateProperty(
      request.eventDate
        ? { start: request.eventDate, end: request.endDate }
        : null
    ),
    [schema.endDate]: buildDateProperty(
      request.endDate ? { start: request.endDate } : null
    ),
    [schema.category]: buildRichTextProperty(request.category),
    [schema.locationRelation]: buildRelationProperty(
      locationLink?.notion_page_id ? [locationLink.notion_page_id] : []
    ),
    [schema.locationSummary]: buildRichTextProperty(request.locationSummary),
    [schema.organizerRelations]: buildRelationProperty(organizerRelationPageIds),
    [schema.organizerSummary]: buildRichTextProperty(request.organizerSummary),
    [schema.sourceUrl]: buildUrlProperty(request.sourceUrl),
    [schema.externalUrl]: buildUrlProperty(
      typeof eventData.external_url === "string" ? eventData.external_url : null
    ),
    [schema.externalUrlLabel]: buildRichTextProperty(
      typeof eventData.external_url_label === "string"
        ? eventData.external_url_label
        : null
    ),
    [schema.scrapingUrl]: buildUrlProperty(
      typeof eventData.scraping_url === "string"
        ? eventData.scraping_url
        : request.sourceUrl
    ),
    [schema.instagramUrl]: buildUrlProperty(
      typeof eventData.instagram_url === "string" ? eventData.instagram_url : null
    ),
    [schema.facebookUrl]: buildUrlProperty(
      typeof eventData.facebook_url === "string" ? eventData.facebook_url : null
    ),
    [schema.address]: buildRichTextProperty(
      typeof eventData.address === "string" ? eventData.address : null
    ),
    [schema.description]: buildRichTextProperty(
      typeof eventData.description === "string" ? eventData.description : null
    ),
    [schema.price]: buildNumberProperty(
      typeof eventData.price === "number" ? eventData.price : null
    ),
    [schema.presalePrice]: buildNumberProperty(
      typeof eventData.presale_price === "number"
        ? eventData.presale_price
        : null
    ),
    [schema.subscriberPrice]: buildNumberProperty(
      typeof eventData.subscriber_price === "number"
        ? eventData.subscriber_price
        : null
    ),
    [schema.capacity]: buildNumberProperty(
      typeof eventData.capacity === "number" ? eventData.capacity : null
    ),
    [schema.imageUrl]: buildUrlProperty(
      typeof eventData.image_url === "string" ? eventData.image_url : null
    ),
    [schema.tagIds]: buildRichTextProperty(tagIds.join(",")),
    [schema.moderationReason]: buildRichTextProperty(request.moderationReason),
    [schema.contributorMessage]: buildRichTextProperty(
      request.contributorMessage
    ),
    [schema.internalNotes]: buildRichTextProperty(request.internalNotes),
    [schema.allowUserResubmission]: buildCheckboxProperty(
      request.allowUserResubmission
    ),
    [schema.requestId]: buildRichTextProperty(request.id),
    [schema.convertedEventId]: buildRichTextProperty(request.convertedEventId),
    [schema.syncOrigin]: buildRichTextProperty("live"),
    [schema.sourceUpdatedAt]: buildDateProperty(
      sourceUpdatedAt ? { start: sourceUpdatedAt } : null
    ),
    [schema.lastSyncedAt]: buildDateProperty({
      start: new Date().toISOString(),
    }),
    [schema.syncHash]: buildRichTextProperty(computeSyncHash(payloadForHash)),
    [schema.lastAction]: buildRichTextProperty("sync"),
  };
}

export async function mapNotionRequestPageToLive(
  supabase: SupabaseClient,
  page: NotionPage
) {
  const schema = NOTION_REQUEST_SCHEMA.propertyNames;
  const locationRelationIds = getRelationIds(page, schema.locationRelation);
  const organizerRelationIds = getRelationIds(page, schema.organizerRelations);

  const resolvedLocationPageId = locationRelationIds[0] ?? null;
  let resolvedLocationId: string | null = null;
  if (resolvedLocationPageId) {
    const { data, error } = await supabase
      .from("notion_location_links")
      .select("location_id")
      .eq("notion_page_id", resolvedLocationPageId)
      .maybeSingle();
    if (error) throw error;
    resolvedLocationId = data?.location_id ?? null;
  }

  const organizerRefs: Array<{ ownerId: string; ownerKind: string }> = [];
  const organizerNames: string[] = [];
  for (const notionPageId of organizerRelationIds) {
    const { data, error } = await supabase
      .from("notion_organizer_links")
      .select("owner_id, owner_kind")
      .eq("notion_page_id", notionPageId)
      .maybeSingle();
    if (error) throw error;
    const ownerId = data?.owner_id?.toString().trim();
    if (!ownerId) continue;

    organizerRefs.push({
      ownerId,
      ownerKind: data?.owner_kind?.toString() || "organizer",
    });

    const table = data?.owner_kind === "location" ? "locations" : "organizers";
    const { data: ownerRow, error: ownerError } = await supabase
      .from(table)
      .select("name")
      .eq("id", ownerId)
      .maybeSingle();
    if (ownerError) throw ownerError;
    const ownerName = ownerRow?.name?.toString().trim();
    if (ownerName) organizerNames.push(ownerName);
  }

  const eventDate = getDateValue(page, schema.eventDate);
  const endDate = getDateValue(page, schema.endDate);
  const sourceUpdatedAt = getDateStartOrStringValue(page, schema.sourceUpdatedAt);

  return {
    liveRequestId: getRichTextValue(page, schema.requestId),
    syncHash: getRichTextValue(page, schema.syncHash),
    sourceUpdatedAt,
    requestType:
      getRichTextValue(page, schema.requestType) ?? "event_creation",
    action: getRichTextValue(page, schema.lastAction),
    updates: {
      status: getRichTextValue(page, schema.status),
      lane: getRichTextValue(page, schema.lane),
      source_url: getStringValue(page, schema.sourceUrl),
      location_id: resolvedLocationId,
      event_data: {
        title: getStringValue(page, schema.title),
        description: getRichTextValue(page, schema.description),
        date: eventDate?.start ?? null,
        end_date: eventDate?.end ?? endDate?.start ?? null,
        category: getRichTextValue(page, schema.category),
        location_id: resolvedLocationId,
        organizer_id:
          organizerRefs.length === 1 && organizerRefs[0].ownerKind === "organizer"
            ? organizerRefs[0].ownerId
            : null,
        organizer_names: [...new Set(organizerNames)],
        address: getRichTextValue(page, schema.address),
        price: getNumberValue(page, schema.price),
        presale_price: getNumberValue(page, schema.presalePrice),
        subscriber_price: getNumberValue(page, schema.subscriberPrice),
        capacity: getNumberValue(page, schema.capacity),
        image_url: getStringValue(page, schema.imageUrl),
        external_url: getStringValue(page, schema.externalUrl),
        external_url_label: getRichTextValue(page, schema.externalUrlLabel),
        scraping_url: getStringValue(page, schema.scrapingUrl),
        instagram_url: getStringValue(page, schema.instagramUrl),
        facebook_url: getStringValue(page, schema.facebookUrl),
        tag_ids: getRichTextValue(page, schema.tagIds)
          ?.split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      },
      moderation_reason: getRichTextValue(page, schema.moderationReason),
      contributor_message: getRichTextValue(page, schema.contributorMessage),
      internal_notes: getRichTextValue(page, schema.internalNotes),
      allow_user_resubmission: getCheckboxValue(
        page,
        schema.allowUserResubmission
      ),
      converted_event_id: getRichTextValue(page, schema.convertedEventId),
    },
  };
}
