import type { SupabaseClient } from "@supabase/supabase-js";

import { mapEventSubmission, mapPublicEvent } from "./mapper";
import type {
  EventListQuery,
  EventSubmission,
  FeaturedEventsQuery,
  PublicEvent,
} from "./schemas";

const EVENT_COLUMNS = [
  "id",
  "title",
  "description",
  "date",
  "end_date",
  "end_time",
  "status",
  "image_url",
  "price",
  "price_min",
  "price_max",
  "is_pay_what_you_want",
  "category",
  "location_id",
  "room_id",
  "city_id",
  "created_at",
  "updated_at",
  "address",
  "capacity",
  "door_opening_time",
  "external_url",
  "external_url_label",
  "latitude",
  "longitude",
  "tag_ids",
  "is_full",
  "is_featured",
  "hide_from_home",
  "community_submission",
  "community_attribution_opt_in",
  "community_contributor_label",
  "instagram_url",
  "facebook_url",
].join(", ");

function buildSelect(view: "summary" | "full") {
  if (view === "summary") {
    return `${EVENT_COLUMNS},
      cities(id, label),
      locations(id, name, image_url, latitude, longitude, city_id, cities(id, label)),
      rooms(name),
      event_organizers(
        organizers(id, name, icon_url, logo_url, instagram_url, facebook_url),
        locations(id, name, is_organizer, image_url)
      ),
      event_artists(
        artist:artists(id, name, slug, artist_type_label, origin_city, image_url),
        role_label,
        sort_index
      )`;
  }

  return `${EVENT_COLUMNS},
    cities(id, label),
    locations(id, name, address, image_url, latitude, longitude, city_id, cities(id, label)),
    rooms(id, name, location_id),
    event_organizers(
      organizers(id, name, icon_url, logo_url, instagram_url, facebook_url),
      locations(id, name, address, image_url, latitude, longitude, is_organizer)
    ),
    event_artists(
      artist:artists(id, name, slug, artist_type_label, origin_city, tag_ids, short_description, image_url, website_url, instagram_url, soundcloud_url, deezer_url),
      role_label,
      sort_index
    )`;
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseBoundary(value: string | undefined, kind: "start" | "end") {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = new Date(`${value}T00:00:00.000Z`);
    return kind === "start" ? start : addUtcDays(start, 1);
  }
  return new Date(value);
}

export function resolveDateWindow(input: {
  startDate?: string;
  endDate?: string;
}) {
  const start =
    parseBoundary(input.startDate, "start") ?? startOfUtcDay(new Date());
  const endExclusive =
    parseBoundary(input.endDate, "end") ?? addUtcDays(startOfUtcDay(start), 14);
  return { start, endExclusive };
}

function escapeIlike(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function uniqueIds(ids?: string[], id?: string): string[] {
  const values = [...(ids ?? []), id].filter(
    (value): value is string => Boolean(value),
  );
  return [...new Set(values)];
}

export function encodeEventCursor(date: string, id: string) {
  return Buffer.from(`${date}|${id}`, "utf8").toString("base64url");
}

export function decodeEventCursor(cursor: string) {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = raw.lastIndexOf("|");
    if (separator <= 0) return null;
    const date = raw.slice(0, separator);
    const id = raw.slice(separator + 1);
    if (!date || !id) return null;
    return { date, id };
  } catch {
    return null;
  }
}

type Cursor = { date: string; id: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPublicFilters(
  query: any,
  options: {
    cityIds: string[];
    locationIds: string[];
    eventIds?: string[] | null;
    category?: string;
    tagId?: string;
    search?: string;
    featured?: boolean;
    isFull?: boolean;
    hideFromHome?: boolean;
  },
) {
  let next = query.eq("status", "approved").eq("archived", false);

  if (options.cityIds.length === 1) {
    next = next.eq("city_id", options.cityIds[0]);
  } else if (options.cityIds.length > 1) {
    next = next.in("city_id", options.cityIds);
  }

  if (options.locationIds.length === 1) {
    next = next.eq("location_id", options.locationIds[0]);
  } else if (options.locationIds.length > 1) {
    next = next.in("location_id", options.locationIds);
  }

  if (options.eventIds && options.eventIds.length > 0) {
    next = next.in("id", options.eventIds);
  }

  if (options.category) {
    next = next.eq("category", options.category);
  }

  if (options.tagId) {
    next = next.contains("tag_ids", [options.tagId]);
  }

  if (options.search) {
    next = next.ilike("title", `%${escapeIlike(options.search)}%`);
  }

  if (options.featured !== undefined) {
    next = next.eq("is_featured", options.featured);
  }

  if (options.isFull !== undefined) {
    next = next.eq("is_full", options.isFull);
  }

  if (options.hideFromHome !== undefined) {
    next = next.eq("hide_from_home", options.hideFromHome);
  }

  return next;
}

function applyDateWindow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  options: {
    start: Date;
    endExclusive: Date;
    includeOngoing: boolean;
    nowIso: string;
  },
) {
  const startIso = options.start.toISOString();
  const endIso = options.endExclusive.toISOString();

  if (!options.includeOngoing) {
    return query.gte("date", startIso).lt("date", endIso);
  }

  return query.or(
    `and(date.gte.${startIso},date.lt.${endIso}),and(date.lt.${startIso},end_date.gte.${options.nowIso})`,
  );
}

function applyCursor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  cursor: Cursor | null,
  sort: "date_asc" | "date_desc",
) {
  if (!cursor) return query;

  if (sort === "date_desc") {
    return query.or(
      `date.lt.${cursor.date},and(date.eq.${cursor.date},id.lt.${cursor.id})`,
    );
  }

  return query.or(
    `date.gt.${cursor.date},and(date.eq.${cursor.date},id.gt.${cursor.id})`,
  );
}

async function resolveOrganizerEventIds(
  supabase: SupabaseClient,
  organizerIds: string[],
): Promise<string[] | null> {
  if (organizerIds.length === 0) {
    return null;
  }

  const inList = organizerIds.join(",");
  const { data, error } = await supabase
    .from("event_organizers")
    .select("event_id")
    .or(`organizer_id.in.(${inList}),location_id.in.(${inList})`);

  if (error) {
    throw error;
  }

  return [
    ...new Set(
      (Array.isArray(data) ? data : [])
        .map((row) =>
          row && typeof row === "object"
            ? String((row as { event_id?: unknown }).event_id ?? "")
            : "",
        )
        .filter(Boolean),
    ),
  ];
}

function emptyPage(limit: number) {
  return {
    data: [] as PublicEvent[],
    pagination: {
      limit,
      nextCursor: null as string | null,
      hasMore: false,
    },
  };
}

function mapRows(rows: unknown[]): PublicEvent[] {
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map(mapPublicEvent)
    .filter((event) => event.id && event.date);
}

export async function listPublicEvents(
  supabase: SupabaseClient,
  query: EventListQuery,
): Promise<{ data: PublicEvent[]; pagination: { limit: number; nextCursor: string | null; hasMore: boolean } }> {
  const view = query.view ?? "summary";
  const sort = query.sort ?? "date_asc";
  const limit = query.limit ?? 50;
  const includeOngoing = query.includeOngoing ?? true;
  const { start, endExclusive } = resolveDateWindow(query);
  const cursor = query.cursor ? decodeEventCursor(query.cursor) : null;
  if (query.cursor && !cursor) {
    throw new Error("INVALID_CURSOR");
  }

  const organizerIds = uniqueIds(query.organizerIds, query.organizerId);
  const locationIds = uniqueIds(query.locationIds, query.locationId);
  const eventIds = await resolveOrganizerEventIds(supabase, organizerIds);
  if (eventIds && eventIds.length === 0) {
    return emptyPage(limit);
  }

  let builder = applyPublicFilters(
    supabase.from("events").select(buildSelect(view)),
    {
      cityIds: uniqueIds(query.cityIds, query.cityId),
      locationIds,
      eventIds,
      category: query.category,
      tagId: query.tagId,
      search: query.search,
      featured: query.featured,
      isFull: query.isFull,
      hideFromHome: query.hideFromHome,
    },
  );

  builder = applyDateWindow(builder, {
    start,
    endExclusive,
    includeOngoing: includeOngoing && !cursor,
    nowIso: new Date().toISOString(),
  });

  builder = applyCursor(builder, cursor, sort);
  builder = builder.order("date", { ascending: sort === "date_asc" }).order("id", {
    ascending: sort === "date_asc",
  });

  const { data, error } = await builder.limit(limit + 1);
  if (error) {
    throw error;
  }

  const mapped = mapRows(Array.isArray(data) ? data : []);
  const hasMore = mapped.length > limit;
  const page = mapped.slice(0, limit);
  const last = page[page.length - 1];

  return {
    data: page,
    pagination: {
      limit,
      nextCursor:
        hasMore && last ? encodeEventCursor(last.date, last.id) : null,
      hasMore,
    },
  };
}

export async function listFeaturedEvents(
  supabase: SupabaseClient,
  query: FeaturedEventsQuery,
): Promise<PublicEvent[]> {
  const view = query.view ?? "summary";
  const limit = query.limit ?? 8;
  const today = startOfUtcDay(new Date()).toISOString();
  const nowIso = new Date().toISOString();
  const organizerIds = uniqueIds(query.organizerIds, query.organizerId);
  const locationIds = uniqueIds(query.locationIds, query.locationId);
  const eventIds = await resolveOrganizerEventIds(supabase, organizerIds);
  if (eventIds && eventIds.length === 0) {
    return [];
  }

  let builder = applyPublicFilters(
    supabase.from("events").select(buildSelect(view)),
    {
      cityIds: uniqueIds(query.cityIds, query.cityId),
      locationIds,
      eventIds,
      featured: true,
    },
  );

  builder = builder.or(
    `date.gte.${today},and(date.lt.${today},end_date.gte.${nowIso})`,
  );

  const { data, error } = await builder
    .order("date", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit * 2);

  if (error) {
    throw error;
  }

  return mapRows(Array.isArray(data) ? data : []).slice(0, limit);
}

export async function getPublicEventById(
  supabase: SupabaseClient,
  id: string,
): Promise<PublicEvent | null> {
  const { data, error } = await supabase
    .from("events")
    .select(buildSelect("full"))
    .eq("id", id)
    .eq("status", "approved")
    .eq("archived", false)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || typeof data !== "object") return null;
  return mapPublicEvent(data as unknown as Record<string, unknown>);
}

export async function listUserEventSubmissions(
  supabase: SupabaseClient,
  userId: string,
  options: { status?: string; limit: number },
): Promise<EventSubmission[]> {
  let builder = supabase
    .from("user_requests")
    .select(
      "id, request_type, status, event_data, location_id, location_name, source_url, converted_event_id, contributor_display_name, community_attribution_opt_in, moderation_reason, contributor_message, allow_user_resubmission, requested_at, reviewed_at, created_at",
    )
    .eq("requested_by", userId)
    .in("request_type", ["event_creation", "event_from_url"])
    .order("requested_at", { ascending: false })
    .limit(options.limit);

  if (options.status && options.status !== "all") {
    builder = builder.eq("status", options.status);
  }

  const { data, error } = await builder;
  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : []).map((row) =>
    mapEventSubmission(row as Record<string, unknown>),
  );
}

