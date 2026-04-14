import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTION_LOCATION_SCHEMA, NOTION_ORGANIZER_SCHEMA } from "@/lib/notion/schema";
import {
  buildDateProperty,
  buildRichTextProperty,
  buildTitleProperty,
  buildUrlProperty,
  getDateStartOrStringValue,
  getRichTextValue,
  getStringValue,
} from "@/lib/notion/properties";
import type {
  NotionLocationLinkRow,
  NotionOrganizerLinkRow,
  NotionPage,
  NotionOwnerKind,
} from "@/lib/notion/types";
import { computeSyncHash } from "@/lib/notion/utils";

type RawLocation = {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  cities?: { label?: string | null } | null;
  city?: { label?: string | null } | null;
  updated_at?: string | null;
};

type RawOrganizer = {
  id: string;
  name: string;
  logo_url: string | null;
  icon_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  updated_at?: string | null;
};

type RawLocationOrganizer = {
  id: string;
  name: string;
  image_url: string | null;
  website_url: string | null;
  updated_at?: string | null;
};

export async function getLocationLinkByLiveId(
  supabase: SupabaseClient,
  locationId: string | null | undefined
) {
  if (!locationId) return null;

  const { data, error } = await supabase
    .from("notion_location_links")
    .select("*")
    .eq("location_id", locationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionLocationLinkRow | null;
}

export async function getOrganizerLinkByLiveId(
  supabase: SupabaseClient,
  ownerKind: NotionOwnerKind,
  ownerId: string | null | undefined
) {
  if (!ownerId) return null;

  const { data, error } = await supabase
    .from("notion_organizer_links")
    .select("*")
    .eq("owner_kind", ownerKind)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionOrganizerLinkRow | null;
}

export async function getLocationLinkByNotionPageId(
  supabase: SupabaseClient,
  notionPageId: string
) {
  const { data, error } = await supabase
    .from("notion_location_links")
    .select("*")
    .eq("notion_page_id", notionPageId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionLocationLinkRow | null;
}

export async function getOrganizerLinkByNotionPageId(
  supabase: SupabaseClient,
  notionPageId: string
) {
  const { data, error } = await supabase
    .from("notion_organizer_links")
    .select("*")
    .eq("notion_page_id", notionPageId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotionOrganizerLinkRow | null;
}

export async function fetchLocationById(
  supabase: SupabaseClient,
  locationId: string
) {
  const { data, error } = await supabase
    .from("locations")
    .select("id,name,address,image_url,updated_at,city:cities(label)")
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as RawLocation | null;
}

export async function fetchOrganizerById(
  supabase: SupabaseClient,
  ownerKind: NotionOwnerKind,
  ownerId: string
) {
  const table = ownerKind === "location" ? "locations" : "organizers";
  const select =
    ownerKind === "location"
      ? "id,name,image_url,website_url,updated_at"
      : "id,name,logo_url,icon_url,website_url,instagram_url,facebook_url,updated_at";
  const { data, error } = await supabase.from(table).select(select).eq("id", ownerId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as RawOrganizer | RawLocationOrganizer | null;
}

export function mapLocationToNotionProperties(location: RawLocation) {
  const schema = NOTION_LOCATION_SCHEMA.propertyNames;
  const city =
    location.city?.label?.trim() ||
    location.cities?.label?.trim() ||
    null;

  return {
    [schema.title]: buildTitleProperty(location.name),
    [schema.address]: buildRichTextProperty(location.address),
    [schema.city]: buildRichTextProperty(city),
    [schema.imageUrl]: buildUrlProperty(location.image_url),
    [schema.locationId]: buildRichTextProperty(location.id),
    [schema.syncOrigin]: buildRichTextProperty("live"),
    [schema.sourceUpdatedAt]: buildDateProperty(
      location.updated_at ? { start: location.updated_at } : null
    ),
    [schema.lastSyncedAt]: buildDateProperty({
      start: new Date().toISOString(),
    }),
    [schema.syncHash]: buildRichTextProperty(
      computeSyncHash({
        id: location.id,
        name: location.name,
        address: location.address,
        city,
        image_url: location.image_url,
        updated_at: location.updated_at ?? null,
      })
    ),
  };
}

export function mapOrganizerToNotionProperties(
  ownerKind: NotionOwnerKind,
  organizer: RawOrganizer | RawLocationOrganizer
) {
  const schema = NOTION_ORGANIZER_SCHEMA.propertyNames;
  const imageUrl =
    "logo_url" in organizer
      ? organizer.logo_url || organizer.icon_url || null
      : organizer.image_url || null;
  const websiteUrl = organizer.website_url ?? null;
  const instagramUrl =
    "instagram_url" in organizer ? organizer.instagram_url : null;
  const facebookUrl =
    "facebook_url" in organizer ? organizer.facebook_url : null;

  return {
    [schema.title]: buildTitleProperty(organizer.name),
    [schema.ownerKind]: buildRichTextProperty(ownerKind),
    [schema.websiteUrl]: buildUrlProperty(websiteUrl),
    [schema.instagramUrl]: buildUrlProperty(instagramUrl),
    [schema.facebookUrl]: buildUrlProperty(facebookUrl),
    [schema.imageUrl]: buildUrlProperty(imageUrl),
    [schema.organizerId]: buildRichTextProperty(organizer.id),
    [schema.syncOrigin]: buildRichTextProperty("live"),
    [schema.sourceUpdatedAt]: buildDateProperty(
      organizer.updated_at ? { start: organizer.updated_at } : null
    ),
    [schema.lastSyncedAt]: buildDateProperty({
      start: new Date().toISOString(),
    }),
    [schema.syncHash]: buildRichTextProperty(
      computeSyncHash({
        ownerKind,
        id: organizer.id,
        name: organizer.name,
        website_url: websiteUrl,
        instagram_url: instagramUrl,
        facebook_url: facebookUrl,
        image_url: imageUrl,
        updated_at: organizer.updated_at ?? null,
      })
    ),
  };
}

export function mapNotionLocationPageToLive(page: NotionPage) {
  const schema = NOTION_LOCATION_SCHEMA.propertyNames;
  return {
    name: getStringValue(page, schema.title),
    address: getRichTextValue(page, schema.address),
    cityLabel: getRichTextValue(page, schema.city),
    imageUrl: getStringValue(page, schema.imageUrl),
    liveLocationId: getRichTextValue(page, schema.locationId),
    syncHash: getRichTextValue(page, schema.syncHash),
    sourceUpdatedAt: getDateStartOrStringValue(page, schema.sourceUpdatedAt),
  };
}

export function mapNotionOrganizerPageToLive(page: NotionPage) {
  const schema = NOTION_ORGANIZER_SCHEMA.propertyNames;
  return {
    name: getStringValue(page, schema.title),
    ownerKind:
      (getRichTextValue(page, schema.ownerKind) as NotionOwnerKind | null) ??
      "organizer",
    websiteUrl: getStringValue(page, schema.websiteUrl),
    instagramUrl: getStringValue(page, schema.instagramUrl),
    facebookUrl: getStringValue(page, schema.facebookUrl),
    imageUrl: getStringValue(page, schema.imageUrl),
    liveOrganizerId: getRichTextValue(page, schema.organizerId),
    syncHash: getRichTextValue(page, schema.syncHash),
    sourceUpdatedAt: getDateStartOrStringValue(page, schema.sourceUpdatedAt),
  };
}
