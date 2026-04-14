import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTION_EVENT_SCHEMA } from "@/lib/notion/schema";
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
  getLocationLinkByLiveId,
  getOrganizerLinkByLiveId,
} from "@/lib/notion/mappers/references";
import type {
  NotionEventLinkRow,
  NotionPage,
  NotionPagePropertyValue,
} from "@/lib/notion/types";
import { computeSyncHash } from "@/lib/notion/utils";

type RawEventOrganizerRow = {
  organizer_id: string | null;
  location_id: string | null;
  organizers?: { id?: string | null; name?: string | null } | null;
  locations?: { id?: string | null; name?: string | null } | null;
};

type RawEventRow = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  status: "pending" | "approved" | "rejected";
  category: string | null;
  price: number | null;
  presale_price: number | null;
  subscriber_price: number | null;
  address: string | null;
  capacity: number | null;
  door_opening_time: string | null;
  external_url: string | null;
  external_url_label: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  scraping_url: string | null;
  image_url: string | null;
  location_id: string | null;
  room_id: string | null;
  tag_ids: string[] | null;
  archived: boolean;
  is_full: boolean | null;
  is_featured: boolean | null;
  updated_at: string | null;
  locations?: { name?: string | null } | null;
  event_organizers?: RawEventOrganizerRow[] | null;
};

function normalizeTagIds(raw: string[] | null | undefined) {
  return (raw ?? []).filter(Boolean);
}

async function resolveOrganizerRelationPageIds(
  supabase: SupabaseClient,
  rows: RawEventOrganizerRow[] | null | undefined
) {
  const notionPageIds: string[] = [];
  const labels: string[] = [];

  for (const row of rows ?? []) {
    const organizerId = row.organizer_id?.trim() || null;
    const locationId = row.location_id?.trim() || null;
    const ownerKind = locationId ? "location" : "organizer";
    const ownerId = locationId ?? organizerId;
    if (!ownerId) continue;

    const link = await getOrganizerLinkByLiveId(supabase, ownerKind, ownerId);
    if (link?.notion_page_id) {
      notionPageIds.push(link.notion_page_id);
    }

    const label =
      row.organizers?.name?.trim() ||
      row.locations?.name?.trim() ||
      ownerId;
    if (label) {
      labels.push(label);
    }
  }

  return {
    relationPageIds: [...new Set(notionPageIds)],
    organizerSummary: [...new Set(labels)].join(", ") || null,
  };
}

export async function getEventLinkByLiveId(
  supabase: SupabaseClient,
  eventId: string
) {
  const { data, error } = await supabase
    .from("notion_event_links")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionEventLinkRow | null;
}

export async function getEventLinkByNotionPageId(
  supabase: SupabaseClient,
  notionPageId: string
) {
  const { data, error } = await supabase
    .from("notion_event_links")
    .select("*")
    .eq("notion_page_id", notionPageId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionEventLinkRow | null;
}

export async function fetchEventById(
  supabase: SupabaseClient,
  eventId: string
) {
  const { data, error } = await supabase
    .from("events")
    .select(
      [
        "id",
        "title",
        "description",
        "date",
        "end_date",
        "status",
        "category",
        "price",
        "presale_price",
        "subscriber_price",
        "address",
        "capacity",
        "door_opening_time",
        "external_url",
        "external_url_label",
        "instagram_url",
        "facebook_url",
        "scraping_url",
        "image_url",
        "location_id",
        "room_id",
        "tag_ids",
        "archived",
        "is_full",
        "is_featured",
        "updated_at",
        "locations(name)",
        "event_organizers(organizer_id,location_id,organizers(id,name),locations(id,name))",
      ].join(",")
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RawEventRow | null;
}

export async function mapEventToNotionProperties(
  supabase: SupabaseClient,
  event: RawEventRow
) {
  const schema = NOTION_EVENT_SCHEMA.propertyNames;
  const locationLink = await getLocationLinkByLiveId(supabase, event.location_id);
  const organizerMapping = await resolveOrganizerRelationPageIds(
    supabase,
    event.event_organizers
  );
  const locationLabel = event.locations?.name?.trim() || null;
  const tagIds = normalizeTagIds(event.tag_ids);
  const sourceUpdatedAt = event.updated_at ?? new Date().toISOString();

  const payloadForHash = {
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    end_date: event.end_date,
    status: event.status,
    category: event.category,
    price: event.price,
    presale_price: event.presale_price,
    subscriber_price: event.subscriber_price,
    address: event.address,
    capacity: event.capacity,
    door_opening_time: event.door_opening_time,
    external_url: event.external_url,
    external_url_label: event.external_url_label,
    instagram_url: event.instagram_url,
    facebook_url: event.facebook_url,
    scraping_url: event.scraping_url,
    image_url: event.image_url,
    location_id: event.location_id,
    room_id: event.room_id,
    tag_ids: tagIds,
    archived: event.archived,
    is_full: Boolean(event.is_full),
    is_featured: Boolean(event.is_featured),
    organizer_summary: organizerMapping.organizerSummary,
    location_label: locationLabel,
    updated_at: sourceUpdatedAt,
  };

  return {
    [schema.title]: buildTitleProperty(event.title),
    [schema.status]: buildRichTextProperty(event.status),
    [schema.date]: buildDateProperty({ start: event.date, end: event.end_date }),
    [schema.endDate]: buildDateProperty(
      event.end_date ? { start: event.end_date } : null
    ),
    [schema.category]: buildRichTextProperty(event.category),
    [schema.price]: buildNumberProperty(event.price),
    [schema.presalePrice]: buildNumberProperty(event.presale_price),
    [schema.subscriberPrice]: buildNumberProperty(event.subscriber_price),
    [schema.isFull]: buildCheckboxProperty(event.is_full),
    [schema.isFeatured]: buildCheckboxProperty(event.is_featured),
    [schema.archived]: buildCheckboxProperty(event.archived),
    [schema.locationRelation]: buildRelationProperty(
      locationLink?.notion_page_id ? [locationLink.notion_page_id] : []
    ),
    [schema.organizerRelations]: buildRelationProperty(
      organizerMapping.relationPageIds
    ),
    [schema.organizerSummary]: buildRichTextProperty(
      organizerMapping.organizerSummary
    ),
    [schema.roomId]: buildRichTextProperty(event.room_id),
    [schema.externalUrl]: buildUrlProperty(event.external_url),
    [schema.externalUrlLabel]: buildRichTextProperty(event.external_url_label),
    [schema.scrapingUrl]: buildUrlProperty(event.scraping_url),
    [schema.instagramUrl]: buildUrlProperty(event.instagram_url),
    [schema.facebookUrl]: buildUrlProperty(event.facebook_url),
    [schema.imageUrl]: buildUrlProperty(event.image_url),
    [schema.address]: buildRichTextProperty(event.address ?? locationLabel),
    [schema.description]: buildRichTextProperty(event.description),
    [schema.doorOpeningTime]: buildRichTextProperty(event.door_opening_time),
    [schema.capacity]: buildNumberProperty(event.capacity),
    [schema.tagIds]: buildRichTextProperty(tagIds.join(",")),
    [schema.eventId]: buildRichTextProperty(event.id),
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

function extractExplicitStatus(property: NotionPagePropertyValue | undefined) {
  if (!property) return null;
  if (property.type === "status") {
    return property.status?.name?.trim() || null;
  }
  if (property.type === "select") {
    return property.select?.name?.trim() || null;
  }
  return null;
}

export async function mapNotionEventPageToLive(
  supabase: SupabaseClient,
  page: NotionPage
) {
  const schema = NOTION_EVENT_SCHEMA.propertyNames;
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

  const organizerRefs: Array<{
    ownerId: string;
    ownerKind: "organizer" | "location";
  }> = [];
  for (const notionPageId of organizerRelationIds) {
    const { data, error } = await supabase
      .from("notion_organizer_links")
      .select("owner_kind, owner_id")
      .eq("notion_page_id", notionPageId)
      .maybeSingle();
    if (error) throw error;
    const ownerId = data?.owner_id?.toString().trim();
    const ownerKind =
      data?.owner_kind?.toString() === "location" ? "location" : "organizer";
    if (ownerId) {
      organizerRefs.push({
        ownerId,
        ownerKind,
      });
    }
  }

  const statusProperty = page.properties?.[schema.status];
  const explicitStatus =
    extractExplicitStatus(statusProperty) ?? getRichTextValue(page, schema.status);
  const dateValue = getDateValue(page, schema.date);
  const endDateValue = getDateValue(page, schema.endDate);
  const sourceUpdatedAt = getDateStartOrStringValue(page, schema.sourceUpdatedAt);

  return {
    liveEventId: getRichTextValue(page, schema.eventId),
    syncHash: getRichTextValue(page, schema.syncHash),
    sourceUpdatedAt,
    updates: {
      title: getStringValue(page, schema.title),
      description: getRichTextValue(page, schema.description),
      date: dateValue?.start ?? null,
      end_date: dateValue?.end ?? endDateValue?.start ?? null,
      status:
        explicitStatus &&
        ["pending", "approved", "rejected"].includes(explicitStatus.toLowerCase())
          ? explicitStatus.toLowerCase()
          : null,
      category: getRichTextValue(page, schema.category),
      price: getNumberValue(page, schema.price),
      presale_price: getNumberValue(page, schema.presalePrice),
      subscriber_price: getNumberValue(page, schema.subscriberPrice),
      address: getRichTextValue(page, schema.address),
      capacity: getNumberValue(page, schema.capacity),
      door_opening_time: getRichTextValue(page, schema.doorOpeningTime),
      external_url: getStringValue(page, schema.externalUrl),
      external_url_label: getRichTextValue(page, schema.externalUrlLabel),
      instagram_url: getStringValue(page, schema.instagramUrl),
      facebook_url: getStringValue(page, schema.facebookUrl),
      scraping_url: getStringValue(page, schema.scrapingUrl),
      image_url: getStringValue(page, schema.imageUrl),
      location_id: resolvedLocationId,
      room_id: getRichTextValue(page, schema.roomId),
      is_full: getCheckboxValue(page, schema.isFull),
      is_featured: getCheckboxValue(page, schema.isFeatured),
      archived: getCheckboxValue(page, schema.archived),
      tag_ids: getRichTextValue(page, schema.tagIds)
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
    organizerRefs: organizerRefs.filter(
      (value, index, array) =>
        array.findIndex(
          (entry) =>
            entry.ownerId === value.ownerId &&
            entry.ownerKind === value.ownerKind
        ) === index
    ),
  };
}
