import type { SupabaseClient } from "@supabase/supabase-js";

export type PotentialDuplicateEvent = {
  id: string;
  title: string | null;
  date: string;
  end_date: string | null;
  status: string | null;
  matchKind: "exact" | "overlap";
};

type FetchPotentialDuplicateEventsArgs = {
  supabase: SupabaseClient;
  locationId: string | null | undefined;
  startValue: string | null | undefined;
  endValue?: string | null | undefined;
  excludeEventId?: string | null | undefined;
};

type CandidateEventRow = {
  id: string;
  title: string | null;
  date: string;
  end_date: string | null;
  status: string | null;
};

function parseDateValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function normalizeEventWindow(
  startValue: string | null | undefined,
  endValue?: string | null | undefined,
) {
  const start = parseDateValue(startValue);
  if (!start) return null;

  const rawEnd = parseDateValue(endValue);
  const end =
    rawEnd && rawEnd.getTime() >= start.getTime() ? rawEnd : new Date(start);

  return {
    start,
    end,
  };
}

export function hasTimeOverlap(
  left: { start: Date; end: Date },
  right: { start: Date; end: Date },
) {
  return (
    left.start.getTime() <= right.end.getTime() &&
    right.start.getTime() <= left.end.getTime()
  );
}

function getMatchKind(
  candidate: { start: Date; end: Date },
  target: { start: Date; end: Date },
): "exact" | "overlap" {
  return candidate.start.getTime() === target.start.getTime() &&
      candidate.end.getTime() === target.end.getTime()
    ? "exact"
    : "overlap";
}

export async function fetchPotentialDuplicateEvents({
  supabase,
  locationId,
  startValue,
  endValue,
  excludeEventId,
}: FetchPotentialDuplicateEventsArgs): Promise<PotentialDuplicateEvent[]> {
  const normalizedLocationId = locationId?.trim();
  const targetWindow = normalizeEventWindow(startValue, endValue);

  if (!normalizedLocationId || normalizedLocationId === "none" || !targetWindow) {
    return [];
  }

  let query = supabase
    .from("events")
    .select("id, title, date, end_date, status")
    .eq("location_id", normalizedLocationId)
    .eq("archived", false)
    .lte("date", targetWindow.end.toISOString())
    .or(
      `end_date.gte.${targetWindow.start.toISOString()},and(end_date.is.null,date.gte.${targetWindow.start.toISOString()})`,
    )
    .order("date", { ascending: true });

  if (excludeEventId) {
    query = query.neq("id", excludeEventId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data || []) as CandidateEventRow[])
    .map((candidate) => {
      const candidateWindow = normalizeEventWindow(
        candidate.date,
        candidate.end_date,
      );
      if (!candidateWindow || !hasTimeOverlap(candidateWindow, targetWindow)) {
        return null;
      }

      return {
        ...candidate,
        matchKind: getMatchKind(candidateWindow, targetWindow),
      } satisfies PotentialDuplicateEvent;
    })
    .filter((candidate): candidate is PotentialDuplicateEvent => Boolean(candidate));
}
