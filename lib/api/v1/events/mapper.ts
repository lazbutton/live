import type { EventSubmission, PublicEvent } from "./schemas";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
    return value[0] as JsonRecord;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInteger(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function mapCity(value: unknown): PublicEvent["city"] {
  const row = asRecord(value);
  if (!row) return null;
  return {
    id: asString(row.id),
    label: asString(row.label),
  };
}

function mapLocation(value: unknown): PublicEvent["location"] {
  const row = asRecord(value);
  if (!row) return null;
  const nestedCity = row.cities ?? row.city;
  return {
    id: asString(row.id),
    name: asString(row.name),
    address: asString(row.address),
    imageUrl: asString(row.image_url),
    latitude: asNumber(row.latitude),
    longitude: asNumber(row.longitude),
    cityId: asString(row.city_id),
    city: mapCity(nestedCity),
  };
}

function mapRoom(value: unknown): PublicEvent["room"] {
  const row = asRecord(value);
  if (!row) return null;
  return {
    id: asString(row.id),
    name: asString(row.name),
    locationId: asString(row.location_id),
  };
}

function mapOrganizers(value: unknown): PublicEvent["organizers"] {
  if (!Array.isArray(value)) return [];

  const organizers: PublicEvent["organizers"] = [];

  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;

    const organizer = asRecord(row.organizers ?? row.organizer);
    if (organizer) {
      const name = asString(organizer.name);
      if (!name) continue;
      organizers.push({
        id: asString(organizer.id),
        name,
        kind: "organizer",
        iconUrl: asString(organizer.icon_url),
        logoUrl: asString(organizer.logo_url),
        instagramUrl: asString(organizer.instagram_url),
        facebookUrl: asString(organizer.facebook_url),
      });
      continue;
    }

    const location = asRecord(row.locations ?? row.location);
    if (location && asBoolean(location.is_organizer, true)) {
      const name = asString(location.name);
      if (!name) continue;
      organizers.push({
        id: asString(location.id),
        name,
        kind: "location",
        iconUrl: asString(location.image_url),
        logoUrl: asString(location.image_url),
        instagramUrl: null,
        facebookUrl: null,
      });
    }
  }

  return organizers;
}

function mapArtists(value: unknown): PublicEvent["artists"] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const artist = asRecord(row.artist ?? row.artists);
    if (!artist) return [];
    const id = asString(artist.id);
    const name = asString(artist.name);
    if (!id || !name) return [];

    return [
      {
        id,
        name,
        slug: asString(artist.slug),
        imageUrl: asString(artist.image_url),
        artistTypeLabel: asString(artist.artist_type_label),
        originCity: asString(artist.origin_city),
        roleLabel: asString(row.role_label),
        sortIndex: asInteger(row.sort_index),
        shortDescription: asString(artist.short_description),
        websiteUrl: asString(artist.website_url),
        instagramUrl: asString(artist.instagram_url),
        soundcloudUrl: asString(artist.soundcloud_url),
        deezerUrl: asString(artist.deezer_url),
        tagIds: asStringArray(artist.tag_ids),
      },
    ];
  });
}

export function mapPublicEvent(row: JsonRecord): PublicEvent {
  const location = mapLocation(row.locations ?? row.location);
  const cityFromEvent = mapCity(row.cities ?? row.city);
  const city = location?.city ?? cityFromEvent;
  const cityId = location?.cityId ?? asString(row.city_id) ?? city?.id ?? null;

  return {
    id: asString(row.id) ?? "",
    title: asString(row.title) ?? "",
    description: asString(row.description),
    date: asString(row.date) ?? "",
    endDate: asString(row.end_date),
    endTime: asString(row.end_time),
    doorOpeningTime: asString(row.door_opening_time),
    category: asString(row.category),
    imageUrl: asString(row.image_url),
    price: asNumber(row.price),
    priceMin: asNumber(row.price_min) ?? asNumber(row.price),
    priceMax: asNumber(row.price_max),
    isPayWhatYouWant: asBoolean(row.is_pay_what_you_want),
    address: asString(row.address) ?? location?.address ?? null,
    latitude: asNumber(row.latitude) ?? location?.latitude ?? null,
    longitude: asNumber(row.longitude) ?? location?.longitude ?? null,
    capacity: asInteger(row.capacity),
    isFull: asBoolean(row.is_full),
    isFeatured: asBoolean(row.is_featured),
    hideFromHome: asBoolean(row.hide_from_home),
    cityId,
    city,
    locationId: asString(row.location_id) ?? location?.id ?? null,
    location,
    room: mapRoom(row.rooms ?? row.room),
    tagIds: asStringArray(row.tag_ids),
    externalUrl: asString(row.external_url),
    externalUrlLabel: asString(row.external_url_label),
    instagramUrl: asString(row.instagram_url),
    facebookUrl: asString(row.facebook_url),
    organizers: mapOrganizers(row.event_organizers),
    artists: mapArtists(row.event_artists),
    communitySubmission: asBoolean(row.community_submission),
    communityAttributionOptIn: asBoolean(row.community_attribution_opt_in),
    communityContributorLabel: asString(row.community_contributor_label),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function mapEventSubmission(row: JsonRecord): EventSubmission {
  const eventData =
    row.event_data && typeof row.event_data === "object"
      ? (row.event_data as Record<string, unknown>)
      : null;

  const requestType =
    row.request_type === "event_from_url" ? "event_from_url" : "event_creation";

  const statusValue = asString(row.status);
  const status =
    statusValue === "approved" ||
    statusValue === "rejected" ||
    statusValue === "converted"
      ? statusValue
      : "pending";

  return {
    id: asString(row.id) ?? "",
    requestType,
    status,
    title: asString(eventData?.title) ?? asString(row.location_name),
    eventData,
    locationId: asString(row.location_id),
    locationName: asString(row.location_name),
    sourceUrl: asString(row.source_url),
    convertedEventId: asString(row.converted_event_id),
    contributorDisplayName: asString(row.contributor_display_name),
    communityAttributionOptIn: asBoolean(row.community_attribution_opt_in),
    moderationReason: asString(row.moderation_reason),
    contributorMessage: asString(row.contributor_message),
    allowUserResubmission: asBoolean(row.allow_user_resubmission),
    requestedAt: asString(row.requested_at),
    reviewedAt: asString(row.reviewed_at),
    createdAt: asString(row.created_at),
  };
}

export function toEventDataPayload(body: {
  title: string;
  description?: string | null;
  date: string;
  locationId?: string | null;
  locationName?: string | null;
  imageUrl?: string | null;
  category: string;
  price?: number | null;
  address?: string | null;
  capacity?: number | null;
  doorOpeningTime?: string | null;
  endTime?: string | null;
  endDate?: string | null;
  tagIds?: string[];
  tags?: string[];
  externalUrl?: string | null;
  organizerNames?: string[];
}): Record<string, unknown> {
  return {
    request_type: "event_creation",
    title: body.title,
    description: body.description ?? null,
    date: body.date,
    location_id: body.locationId ?? null,
    location_name: body.locationName ?? null,
    image_url: body.imageUrl ?? null,
    category: body.category,
    price: body.price ?? null,
    address: body.address ?? null,
    capacity: body.capacity ?? null,
    door_opening_time: body.doorOpeningTime ?? null,
    end_time: body.endTime ?? null,
    end_date: body.endDate ?? null,
    tag_ids: body.tagIds?.length ? body.tagIds : null,
    tags: body.tags?.length ? body.tags : null,
    external_url: body.externalUrl ?? null,
    organizer_names: body.organizerNames ?? [],
  };
}
