export type AdminRequestType = "event_creation" | "event_from_url";
export type AdminRequestStatus = "pending" | "approved" | "rejected" | "converted";
export type AdminRequestLane = "to_process" | "ready" | "from_url" | "blocked" | "processed";
export type AdminRequestTypeFilter = "all" | AdminRequestType;
export type AdminRequestPeriodFilter = "all" | "24h" | "7d" | "30d";

export interface AdminRequestEventData {
  title?: string | null;
  description?: string | null;
  date?: string | null;
  end_date?: string | null;
  category?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  organizer_id?: string | null;
  organizer_names?: string[] | null;
  price?: number | null;
  address?: string | null;
  capacity?: number | null;
  image_url?: string | null;
  door_opening_time?: string | null;
  external_url?: string | null;
  external_url_label?: string | null;
  scraping_url?: string | null;
  [key: string]: unknown;
}

export interface AdminRawRequest {
  id: string;
  request_type?: AdminRequestType | null;
  status: AdminRequestStatus;
  requested_at: string;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  notes?: string | null;
  event_data?: AdminRequestEventData | null;
  source_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  converted_event_id?: string | null;
  converted_at?: string | null;
}

export interface AdminRequestItem {
  id: string;
  status: AdminRequestStatus;
  requestType: AdminRequestType;
  lane: AdminRequestLane;
  sourceKind: "form" | "url";
  title: string;
  requestedAt: string;
  requestedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  convertedAt: string | null;
  convertedEventId: string | null;
  notes: string | null;
  eventDate: string | null;
  endDate: string | null;
  sourceUrl: string | null;
  category: string | null;
  locationSummary: string | null;
  organizerSummary: string | null;
  missingFields: string[];
  isFastConvertible: boolean;
  isPast: boolean;
  searchText: string;
  raw: AdminRawRequest;
}

export const ADMIN_REQUEST_SELECT = [
  "id",
  "request_type",
  "status",
  "requested_at",
  "requested_by",
  "reviewed_by",
  "reviewed_at",
  "notes",
  "event_data",
  "source_url",
  "location_id",
  "location_name",
  "converted_event_id",
  "converted_at",
].join(",");

function normalizeString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function hasMinLength(value: unknown, min: number) {
  const normalized = normalizeString(value);
  return Boolean(normalized && normalized.length >= min);
}

function toUniqueText(parts: Array<string | null>) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(part);
  }

  return values.length > 0 ? values.join(" - ") : null;
}

export function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function safeDomainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function formatRequestAgeShort(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "";

  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function getRequestTypeLabel(type: AdminRequestType) {
  return type === "event_from_url" ? "Depuis URL" : "Formulaire";
}

export function getRequestLaneLabel(lane: AdminRequestLane) {
  switch (lane) {
    case "ready":
      return "Prête";
    case "to_process":
      return "À compléter";
    case "from_url":
      return "Depuis URL";
    case "blocked":
      return "Bloquée";
    case "processed":
      return "Traitée";
  }
}

export function getRequestStatusLabel(status: AdminRequestStatus) {
  switch (status) {
    case "pending":
      return "À traiter";
    case "converted":
      return "Convertie";
    case "rejected":
      return "Rejetée";
    case "approved":
      return "Approuvée";
  }
}

export function getAdminRequestMissingFields(raw: AdminRawRequest) {
  const eventData = raw.event_data ?? {};
  const missing: string[] = [];

  if (raw.request_type === "event_from_url") {
    if (!normalizeString(raw.source_url ?? eventData.scraping_url ?? eventData.external_url)) {
      missing.push("URL source");
    }
    return missing;
  }

  if (!hasMinLength(eventData.title, 3)) missing.push("Titre");
  if (!hasMinLength(eventData.description, 10)) missing.push("Description");
  if (!normalizeString(eventData.date)) missing.push("Date");
  if (!normalizeString(eventData.category)) missing.push("Catégorie");

  const hasLocation = Boolean(
    normalizeString(eventData.location_id) ||
      normalizeString(eventData.location_name) ||
      normalizeString(raw.location_id) ||
      normalizeString(raw.location_name)
  );
  if (!hasLocation) missing.push("Lieu");

  if (!normalizeString(eventData.address)) missing.push("Adresse");

  const hasOrganizer = Boolean(normalizeString(eventData.organizer_id) || normalizeStringArray(eventData.organizer_names).length > 0);
  if (!hasOrganizer) missing.push("Organisateur");

  return missing;
}

function resolveLane(raw: AdminRawRequest, isPast: boolean, isFastConvertible: boolean): AdminRequestLane {
  if (raw.status !== "pending") return "processed";
  if (isPast) return "blocked";
  if (raw.request_type === "event_from_url") return "from_url";
  if (isFastConvertible) return "ready";
  return "to_process";
}

export function buildAdminRequestItem(raw: AdminRawRequest): AdminRequestItem {
  const requestType = raw.request_type === "event_from_url" ? "event_from_url" : "event_creation";
  const eventData = raw.event_data ?? {};
  const eventDate = normalizeString(eventData.date);
  const eventTimestamp = eventDate ? new Date(eventDate).getTime() : Number.NaN;
  const isPast = Number.isFinite(eventTimestamp) && eventTimestamp < startOfLocalDay(new Date()).getTime();
  const missingFields = getAdminRequestMissingFields({ ...raw, request_type: requestType });
  const isFastConvertible = raw.status === "pending" && requestType === "event_creation" && !isPast && missingFields.length === 0;
  const title =
    normalizeString(eventData.title) ??
    (normalizeString(raw.source_url) ? safeDomainFromUrl(raw.source_url as string) : "(sans titre)");
  const sourceUrl =
    normalizeString(raw.source_url) ??
    normalizeString(eventData.external_url) ??
    normalizeString(eventData.scraping_url);
  const locationSummary = toUniqueText([
    normalizeString(raw.location_name),
    normalizeString(eventData.location_name),
    normalizeString(eventData.address),
  ]);
  const organizerSummary =
    normalizeStringArray(eventData.organizer_names).join(", ") || normalizeString(eventData.organizer_id) || null;
  const lane = resolveLane({ ...raw, request_type: requestType }, isPast, isFastConvertible);

  return {
    id: raw.id,
    status: raw.status,
    requestType,
    lane,
    sourceKind: requestType === "event_from_url" ? "url" : "form",
    title,
    requestedAt: raw.requested_at,
    requestedBy: normalizeString(raw.requested_by) ?? null,
    reviewedAt: normalizeString(raw.reviewed_at) ?? null,
    reviewedBy: normalizeString(raw.reviewed_by) ?? null,
    convertedAt: normalizeString(raw.converted_at) ?? null,
    convertedEventId: normalizeString(raw.converted_event_id) ?? null,
    notes: normalizeString(raw.notes) ?? raw.notes ?? null,
    eventDate,
    endDate: normalizeString(eventData.end_date),
    sourceUrl,
    category: normalizeString(eventData.category),
    locationSummary,
    organizerSummary,
    missingFields,
    isFastConvertible,
    isPast,
    searchText: [
      title,
      normalizeString(eventData.description),
      sourceUrl,
      locationSummary,
      organizerSummary,
      normalizeString(eventData.category),
      normalizeString(raw.notes),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    raw: {
      ...raw,
      request_type: requestType,
      event_data: eventData,
    },
  };
}

function getTimestamp(value: string | null) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function compareNullableAsc(a: number, b: number) {
  const aValid = Number.isFinite(a);
  const bValid = Number.isFinite(b);
  if (aValid && bValid) return a - b;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

export function sortAdminRequests(items: AdminRequestItem[], lane: AdminRequestLane) {
  return [...items].sort((left, right) => {
    if (lane === "processed") {
      const leftProcessedAt = getTimestamp(left.convertedAt ?? left.reviewedAt ?? left.requestedAt);
      const rightProcessedAt = getTimestamp(right.convertedAt ?? right.reviewedAt ?? right.requestedAt);
      return rightProcessedAt - leftProcessedAt;
    }

    if (lane === "blocked") {
      const leftEvent = getTimestamp(left.eventDate);
      const rightEvent = getTimestamp(right.eventDate);
      const eventComparison = compareNullableAsc(rightEvent, leftEvent);
      if (eventComparison !== 0) return eventComparison;
      return getTimestamp(right.requestedAt) - getTimestamp(left.requestedAt);
    }

    const leftEvent = getTimestamp(left.eventDate);
    const rightEvent = getTimestamp(right.eventDate);
    const eventComparison = compareNullableAsc(leftEvent, rightEvent);
    if (eventComparison !== 0) return eventComparison;

    return getTimestamp(right.requestedAt) - getTimestamp(left.requestedAt);
  });
}

export function countRequestsByLane(items: AdminRequestItem[]) {
  return items.reduce<Record<AdminRequestLane, number>>(
    (acc, item) => {
      acc[item.lane] += 1;
      return acc;
    },
    {
      to_process: 0,
      ready: 0,
      from_url: 0,
      blocked: 0,
      processed: 0,
    }
  );
}

export function countActionablePendingRequests(items: AdminRequestItem[]) {
  return items.filter((item) => item.status === "pending" && item.lane !== "blocked").length;
}

export function filterAdminRequests(
  items: AdminRequestItem[],
  {
    lane,
    query,
    typeFilter,
    periodFilter,
  }: {
    lane: AdminRequestLane;
    query: string;
    typeFilter: AdminRequestTypeFilter;
    periodFilter: AdminRequestPeriodFilter;
  }
) {
  let next = items.filter((item) => item.lane === lane);

  if (typeFilter !== "all") {
    next = next.filter((item) => item.requestType === typeFilter);
  }

  if (periodFilter !== "all") {
    const now = Date.now();
    const delta =
      periodFilter === "24h"
        ? 24 * 60 * 60 * 1000
        : periodFilter === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;

    next = next.filter((item) => {
      const requestedAt = getTimestamp(item.requestedAt);
      return Number.isFinite(requestedAt) && now - requestedAt <= delta;
    });
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    next = next.filter((item) => item.searchText.includes(normalizedQuery));
  }

  return sortAdminRequests(next, lane);
}
