import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSiteUrl } from "@/lib/metadata";
import { buildEventPath } from "@/lib/mobile-app-links";
import { createAnonClient } from "@/lib/api/v1/supabase";
import { resolveDateWindow } from "./service";
import type { RadioCampusEvent, RadioCampusResponse } from "./schemas";

export const RADIO_CAMPUS_SLUG = "radio-campus";
export const RADIO_CAMPUS_NAME = "Radio Campus Orléans";
export const RADIO_CAMPUS_ORGANIZER_ID =
  process.env.RADIO_CAMPUS_ORGANIZER_ID?.trim() ||
  "9d6d803d-4a7e-4118-beba-1744a1159b99";

const DAYS_AHEAD = 90;
const LIMIT = 40;

const SLIM_SELECT = [
  "id",
  "title",
  "date",
  "end_date",
  "image_url",
  "address",
  "external_url",
  "external_url_label",
  "locations(name)",
  "event_organizers!inner(organizer_id, location_id)",
].join(", ");

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
    return value[0] as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function endDatePlusDays(days: number) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString().slice(0, 10);
}

function mapSlimEvent(row: Record<string, unknown>): RadioCampusEvent | null {
  const id = asString(row.id);
  const title = asString(row.title);
  const date = asString(row.date);
  if (!id || !title || !date) return null;

  const location = asRecord(row.locations ?? row.location);

  return {
    id,
    title,
    date,
    endDate: asString(row.end_date),
    imageUrl: asString(row.image_url),
    address: asString(row.address),
    locationName: asString(location?.name),
    externalUrl: asString(row.external_url),
    externalUrlLabel: asString(row.external_url_label),
    url: `${getSiteUrl()}${buildEventPath(id)}`,
  };
}

export async function listRadioCampusEvents(
  supabase: SupabaseClient,
): Promise<RadioCampusResponse> {
  const { start, endExclusive } = resolveDateWindow({
    endDate: endDatePlusDays(DAYS_AHEAD),
  });
  const startIso = start.toISOString();
  const endIso = endExclusive.toISOString();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("events")
    .select(SLIM_SELECT)
    .eq("status", "approved")
    .eq("archived", false)
    .or(
      `organizer_id.eq.${RADIO_CAMPUS_ORGANIZER_ID},location_id.eq.${RADIO_CAMPUS_ORGANIZER_ID}`,
      { referencedTable: "event_organizers" },
    )
    .or(
      `and(date.gte.${startIso},date.lt.${endIso}),and(date.lt.${startIso},end_date.gte.${nowIso})`,
    )
    .order("date", { ascending: true })
    .order("id", { ascending: true })
    .limit(LIMIT);

  if (error) {
    throw error;
  }

  const events = (Array.isArray(data) ? data : [])
    .map((row) =>
      row && typeof row === "object"
        ? mapSlimEvent(row as Record<string, unknown>)
        : null,
    )
    .filter((event): event is RadioCampusEvent => Boolean(event));

  return {
    partner: {
      slug: RADIO_CAMPUS_SLUG,
      name: RADIO_CAMPUS_NAME,
    },
    generatedAt: nowIso,
    data: events,
  };
}

export const getCachedRadioCampusFeed = unstable_cache(
  async () => listRadioCampusEvents(createAnonClient()),
  ["api-v1-radio-campus", RADIO_CAMPUS_ORGANIZER_ID],
  { revalidate: 60 },
);
