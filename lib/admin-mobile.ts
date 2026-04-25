import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_REQUEST_SELECT,
  buildAdminRequestItem,
  countActionablePendingRequests,
  countRequestsByLane,
  filterAdminRequests,
  safeDomainFromUrl,
  startOfLocalDay,
  type AdminRawRequest,
  type AdminRequestItem,
  type AdminRequestLane,
} from "@/lib/admin-requests-core";
import {
  buildRequestReviewUpdate,
  type AdminRequestReviewAction,
} from "@/lib/admin-request-review";
import { createServiceClient } from "@/lib/supabase/service";

export type MobileAdminEventStatusFilter = "all" | "pending" | "approved";

export type MobileAdminEventItem = {
  id: string;
  title: string;
  date: string;
  status: "pending" | "approved" | "rejected";
  category: string | null;
  price: number | null;
  isPayWhatYouWant: boolean;
  locationId: string | null;
  locationName: string | null;
  locationSummary: string | null;
  address: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  externalUrlLabel: string | null;
  isFull: boolean;
  isFeatured: boolean;
  webPath: string;
};

export type MobileAdminSummary = {
  counts: {
    pendingEvents: number;
    todayEvents: number;
    featuredEvents: number;
    readyRequests: number;
    actionableRequests: number;
  };
  urgentEvents: MobileAdminEventItem[];
  urgentRequests: MobileAdminRequestItem[];
};

export type MobileAdminRequestItem = {
  id: string;
  title: string;
  requestType: AdminRequestItem["requestType"];
  status: AdminRequestItem["status"];
  lane: AdminRequestLane;
  requestedAt: string;
  reviewedAt: string | null;
  eventDate: string | null;
  category: string | null;
  locationSummary: string | null;
  sourceUrl: string | null;
  notes: string | null;
  internalNotes: string | null;
  moderationReason: AdminRequestItem["moderationReason"];
  contributorMessage: string | null;
  allowUserResubmission: boolean;
  missingFields: string[];
  isFastConvertible: boolean;
  isPast: boolean;
  webPath: string;
};

type RawMobileEventRow = {
  id: string;
  title: string | null;
  date: string;
  status: "pending" | "approved" | "rejected";
  category: string | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  is_pay_what_you_want: boolean | null;
  location_id: string | null;
  address: string | null;
  image_url: string | null;
  external_url: string | null;
  external_url_label: string | null;
  is_full: boolean | null;
  is_featured: boolean | null;
  locations?:
    | {
        id?: string | null;
        name?: string | null;
        address?: string | null;
        cities?: { label?: string | null } | null;
        city?: { label?: string | null } | null;
      }
    | Array<{
        id?: string | null;
        name?: string | null;
        address?: string | null;
        cities?: { label?: string | null } | null;
        city?: { label?: string | null } | null;
      }>
    | null;
};

const MOBILE_EVENT_SELECT = `
  id,
  title,
  date,
  status,
  category,
  price,
  price_min,
  price_max,
  is_pay_what_you_want,
  location_id,
  address,
  image_url,
  external_url,
  external_url_label,
  is_full,
  is_featured,
  locations(
    id,
    name,
    address,
    city:cities(label)
  )
`;

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocationRow(raw: RawMobileEventRow["locations"]) {
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw ?? null;
}

function buildEventWebPath(eventDateIso: string) {
  try {
    const start = startOfLocalDay(new Date(eventDateIso)).toISOString().slice(0, 10);
    return `/admin/events?view=agenda&start=${start}`;
  } catch {
    return "/admin/events";
  }
}

function buildRequestWebPath(item: AdminRequestItem) {
  if (item.status === "pending") {
    return `/admin/requests?request=${item.id}`;
  }
  return `/admin/requests?request=${item.id}&lane=processed`;
}

function serializeRequest(item: AdminRequestItem): MobileAdminRequestItem {
  return {
    id: item.id,
    title: item.title,
    requestType: item.requestType,
    status: item.status,
    lane: item.lane,
    requestedAt: item.requestedAt,
    reviewedAt: item.reviewedAt,
    eventDate: item.eventDate,
    category: item.category,
    locationSummary: item.locationSummary,
    sourceUrl: item.sourceUrl,
    notes: item.notes,
    internalNotes: item.internalNotes,
    moderationReason: item.moderationReason,
    contributorMessage: item.contributorMessage,
    allowUserResubmission: item.allowUserResubmission,
    missingFields: item.missingFields,
    isFastConvertible: item.isFastConvertible,
    isPast: item.isPast,
    webPath: buildRequestWebPath(item),
  };
}

function serializeEvent(row: RawMobileEventRow): MobileAdminEventItem {
  const location = normalizeLocationRow(row.locations);
  const locationName = location?.name?.trim() || null;
  const cityLabel = location?.city?.label?.trim() || location?.cities?.label?.trim() || null;
  const locationSummary = [locationName, cityLabel].filter(Boolean).join(" - ") || locationName || row.address || null;

  return {
    id: row.id,
    title: row.title?.trim() || "(sans titre)",
    date: row.date,
    status: row.status,
    category: row.category?.trim() || null,
    price: row.price_min ?? row.price,
    isPayWhatYouWant: Boolean(row.is_pay_what_you_want),
    locationId: row.location_id,
    locationName,
    locationSummary,
    address: row.address?.trim() || location?.address?.trim() || null,
    imageUrl: row.image_url?.trim() || null,
    externalUrl: row.external_url?.trim() || null,
    externalUrlLabel: row.external_url_label?.trim() || null,
    isFull: Boolean(row.is_full),
    isFeatured: Boolean(row.is_featured),
    webPath: buildEventWebPath(row.date),
  };
}

function matchesEventSearch(event: MobileAdminEventItem, rawQuery: string) {
  const query = normalizeSearchValue(rawQuery);
  if (!query) return true;

  const haystack = [
    event.title,
    event.category,
    event.locationSummary,
    event.address,
    event.externalUrl ? safeDomainFromUrl(event.externalUrl) : null,
  ]
    .filter(Boolean)
    .map((value) => normalizeSearchValue(String(value)))
    .join(" ");

  return haystack.includes(query);
}

async function fetchEventRows(
  supabase: SupabaseClient,
  {
    status = "all",
    limit = 80,
  }: {
    status?: MobileAdminEventStatusFilter;
    limit?: number;
  } = {}
) {
  let query = supabase.from("events").select(MOBILE_EVENT_SELECT).eq("archived", false);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (status !== "pending") {
    const recentBoundary = new Date();
    recentBoundary.setDate(recentBoundary.getDate() - 7);
    query = query.gte("date", recentBoundary.toISOString());
  }

  const { data, error } = await query.order("date", { ascending: true }).limit(limit);
  if (error) throw error;

  return ((data || []) as RawMobileEventRow[]).map((row) => serializeEvent(row));
}

async function getEventRowById(supabase: SupabaseClient, eventId: string) {
  const { data, error } = await supabase
    .from("events")
    .select(MOBILE_EVENT_SELECT)
    .eq("id", eventId)
    .eq("archived", false)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return serializeEvent(data as RawMobileEventRow);
}

async function fetchRequestItems(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("user_requests")
    .select(ADMIN_REQUEST_SELECT)
    .in("request_type", ["event_creation", "event_from_url"])
    .order("requested_at", { ascending: false });

  if (error) throw error;

  return (((data || []) as unknown) as AdminRawRequest[]).map((row) => buildAdminRequestItem(row));
}

async function notifyOrganizersAboutEventApproval(eventId: string, eventTitle: string) {
  try {
    const serviceClient = createServiceClient();
    const { data: eventOrganizers, error: organizersError } = await serviceClient
      .from("event_organizers")
      .select("organizer_id, location_id")
      .eq("event_id", eventId);

    if (organizersError || !eventOrganizers || eventOrganizers.length === 0) {
      return;
    }

    const organizerIds = eventOrganizers
      .map((row) => row.organizer_id || row.location_id)
      .filter(Boolean) as string[];

    if (organizerIds.length === 0) return;

    const { data: userOrganizers, error: userOrganizersError } = await serviceClient
      .from("user_organizers")
      .select("user_id")
      .in("organizer_id", organizerIds);

    if (userOrganizersError || !userOrganizers || userOrganizers.length === 0) {
      return;
    }

    const userIds = [...new Set(userOrganizers.map((row) => row.user_id).filter(Boolean))];
    if (userIds.length === 0) return;

    await serviceClient.from("organizer_notifications").insert(
      userIds.map((userId) => ({
        user_id: userId,
        event_id: eventId,
        type: "event_approved",
        title: "Événement approuvé",
        message: `Votre événement "${eventTitle}" a été approuvé et est maintenant visible sur la plateforme.`,
        read: false,
        metadata: {
          new_status: "approved",
        },
      }))
    );
  } catch (error) {
    console.error("Erreur notification organisateurs (ignorée):", error);
  }
}

export async function fetchMobileAdminSummary(supabase: SupabaseClient): Promise<MobileAdminSummary> {
  const today = startOfLocalDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    requests,
    pendingEventsCountResult,
    todayEventsCountResult,
    featuredEventsCountResult,
    pendingEvents,
    todayEvents,
  ] = await Promise.all([
    fetchRequestItems(supabase),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("archived", false).eq("status", "pending"),
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .gte("date", today.toISOString())
      .lt("date", tomorrow.toISOString()),
    supabase.from("events").select("*", { count: "exact", head: true }).eq("archived", false).eq("is_featured", true),
    fetchEventRows(supabase, { status: "pending", limit: 4 }),
    fetchEventRows(supabase, { status: "approved", limit: 12 }),
  ]);

  const laneCounts = countRequestsByLane(requests);
  const todayEventsPreview = todayEvents.filter((event) => {
    const timestamp = new Date(event.date).getTime();
    return Number.isFinite(timestamp) && timestamp >= today.getTime() && timestamp < tomorrow.getTime();
  });

  const urgentRequests = [
    ...filterAdminRequests(requests, {
      lane: "ready",
      query: "",
      typeFilter: "all",
      periodFilter: "all",
    }),
    ...filterAdminRequests(requests, {
      lane: "from_url",
      query: "",
      typeFilter: "all",
      periodFilter: "all",
    }),
    ...filterAdminRequests(requests, {
      lane: "to_process",
      query: "",
      typeFilter: "all",
      periodFilter: "all",
    }),
  ]
    .slice(0, 4)
    .map((item) => serializeRequest(item));

  const urgentEvents = [...pendingEvents, ...todayEventsPreview].slice(0, 4);

  return {
    counts: {
      pendingEvents: pendingEventsCountResult.count ?? 0,
      todayEvents: todayEventsCountResult.count ?? 0,
      featuredEvents: featuredEventsCountResult.count ?? 0,
      readyRequests: laneCounts.ready,
      actionableRequests: countActionablePendingRequests(requests),
    },
    urgentEvents,
    urgentRequests,
  };
}

export async function listMobileAdminEvents(
  supabase: SupabaseClient,
  {
    status = "all",
    search = "",
    limit = 80,
  }: {
    status?: MobileAdminEventStatusFilter;
    search?: string;
    limit?: number;
  } = {}
) {
  const events = await fetchEventRows(supabase, { status, limit });
  return events.filter((event) => matchesEventSearch(event, search));
}

export async function getMobileAdminEventById(supabase: SupabaseClient, eventId: string) {
  return getEventRowById(supabase, eventId);
}

export async function listMobileAdminRequests(
  supabase: SupabaseClient,
  {
    lane = "ready",
    search = "",
    limit = 80,
  }: {
    lane?: AdminRequestLane;
    search?: string;
    limit?: number;
  } = {}
) {
  const requests = await fetchRequestItems(supabase);
  return filterAdminRequests(requests, {
    lane,
    query: search,
    typeFilter: "all",
    periodFilter: "all",
  })
    .slice(0, limit)
    .map((item) => serializeRequest(item));
}

export async function approveMobileEvent(supabase: SupabaseClient, eventId: string) {
  const existing = await getEventRowById(supabase, eventId);
  if (!existing) {
    throw new Error("Événement introuvable");
  }

  if (existing.status !== "approved") {
    const { error } = await supabase.from("events").update({ status: "approved" }).eq("id", eventId);
    if (error) throw error;
    await notifyOrganizersAboutEventApproval(eventId, existing.title);
  }

  const updated = await getEventRowById(supabase, eventId);
  if (!updated) {
    throw new Error("Événement introuvable après approbation");
  }
  return updated;
}

export async function toggleMobileEventFull(supabase: SupabaseClient, eventId: string) {
  const existing = await getEventRowById(supabase, eventId);
  if (!existing) {
    throw new Error("Événement introuvable");
  }

  const { error } = await supabase.from("events").update({ is_full: !existing.isFull }).eq("id", eventId);
  if (error) throw error;

  const updated = await getEventRowById(supabase, eventId);
  if (!updated) {
    throw new Error("Événement introuvable après mise à jour");
  }
  return updated;
}

export async function toggleMobileEventFeatured(supabase: SupabaseClient, eventId: string) {
  const existing = await getEventRowById(supabase, eventId);
  if (!existing) {
    throw new Error("Événement introuvable");
  }

  const { error } = await supabase.from("events").update({ is_featured: !existing.isFeatured }).eq("id", eventId);
  if (error) throw error;

  const updated = await getEventRowById(supabase, eventId);
  if (!updated) {
    throw new Error("Événement introuvable après mise à jour");
  }
  return updated;
}

export async function quickEditMobileEvent(
  supabase: SupabaseClient,
  eventId: string,
  input: {
    title?: string;
    date?: string;
    locationId?: string | null;
    price?: number | null;
    isPayWhatYouWant?: boolean;
    externalUrl?: string | null;
    externalUrlLabel?: string | null;
  }
) {
  const updates: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length < 3) {
      throw new Error("Le titre doit contenir au moins 3 caractères");
    }
    updates.title = title;
  }

  if (input.date !== undefined) {
    const parsed = new Date(input.date);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Date invalide");
    }
    updates.date = parsed.toISOString();
  }

  if (input.locationId !== undefined) {
    if (input.locationId === null || input.locationId === "") {
      throw new Error("Le lieu est requis");
    }

    const { data: location, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", input.locationId)
      .maybeSingle();

    if (locationError) throw locationError;
    if (!location) {
      throw new Error("Lieu introuvable");
    }

    updates.location_id = input.locationId;
  }

  if (input.isPayWhatYouWant !== undefined) {
    updates.is_pay_what_you_want = input.isPayWhatYouWant;
    if (input.isPayWhatYouWant) {
      updates.price = null;
      updates.price_min = null;
      updates.price_max = null;
    }
  }

  if (input.price !== undefined) {
    if (input.isPayWhatYouWant === true) {
      throw new Error("Impossible de modifier le prix tant que Prix libre est activé");
    }
    if (input.price !== null) {
      if (!Number.isFinite(input.price) || input.price < 0) {
        throw new Error("Prix invalide");
      }
      updates.price = input.price;
      updates.price_min = input.price;
      updates.price_max = null;
      updates.is_pay_what_you_want = false;
    } else {
      updates.price = null;
      updates.price_min = null;
      updates.price_max = null;
    }
  }

  if (input.externalUrl !== undefined) {
    const normalized = input.externalUrl?.trim() || null;
    updates.external_url = normalized;
  }

  if (input.externalUrlLabel !== undefined) {
    const normalized = input.externalUrlLabel?.trim() || null;
    updates.external_url_label = normalized;
  }

  if (Object.keys(updates).length === 0) {
    const existing = await getEventRowById(supabase, eventId);
    if (!existing) {
      throw new Error("Événement introuvable");
    }
    return existing;
  }

  const { error } = await supabase.from("events").update(updates).eq("id", eventId);
  if (error) throw error;

  const updated = await getEventRowById(supabase, eventId);
  if (!updated) {
    throw new Error("Événement introuvable après mise à jour");
  }
  return updated;
}

export async function convertMobileAdminRequest(supabase: SupabaseClient, requestId: string) {
  const { error } = await supabase.rpc("convert_event_request_to_event", {
    request_id: requestId,
  });

  if (error) throw error;

  const requests = await fetchRequestItems(supabase);
  const converted = requests.find((item) => item.id === requestId);
  if (!converted) {
    throw new Error("Demande introuvable après conversion");
  }
  return serializeRequest(converted);
}

export async function rejectMobileAdminRequest(
  supabase: SupabaseClient,
  requestId: string,
  input: {
    reviewedBy: string;
    internalNotes: string;
    moderationReason: NonNullable<AdminRequestItem["moderationReason"]>;
    contributorMessage: string;
    allowUserResubmission?: boolean;
  }
) {
  return reviewMobileAdminRequest(supabase, requestId, {
    ...input,
    action: input.allowUserResubmission ? "request_changes" : "reject",
  });
}

export async function requestChangesMobileAdminRequest(
  supabase: SupabaseClient,
  requestId: string,
  input: {
    reviewedBy: string;
    internalNotes: string;
    moderationReason: NonNullable<AdminRequestItem["moderationReason"]>;
    contributorMessage: string;
  }
) {
  return reviewMobileAdminRequest(supabase, requestId, {
    ...input,
    action: "request_changes",
  });
}

export async function reviewMobileAdminRequest(
  supabase: SupabaseClient,
  requestId: string,
  {
    action,
    reviewedBy,
    internalNotes,
    moderationReason,
    contributorMessage,
  }: {
    action: AdminRequestReviewAction;
    reviewedBy: string;
    internalNotes: string;
    moderationReason: NonNullable<AdminRequestItem["moderationReason"]>;
    contributorMessage: string;
  }
) {
  const updates = buildRequestReviewUpdate({
    action,
    reviewedBy,
    internalNotes,
    moderationReason,
    contributorMessage,
  });

  const { error } = await supabase
    .from("user_requests")
    .update(updates)
    .eq("id", requestId);

  if (error) throw error;

  const requests = await fetchRequestItems(supabase);
  const reviewed = requests.find((item) => item.id === requestId);
  if (!reviewed) {
    throw new Error("Demande introuvable après décision");
  }
  return serializeRequest(reviewed);
}
