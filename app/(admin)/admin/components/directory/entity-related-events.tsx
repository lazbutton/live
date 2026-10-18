"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarX2, ChevronDown, Loader2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type RelatedEventsScope =
  | { kind: "location"; id: string }
  | { kind: "organizer"; id: string }
  | { kind: "artist"; id: string };

type RelatedEvent = {
  id: string;
  title: string | null;
  date: string;
  status: "pending" | "approved" | "rejected";
  image_url: string | null;
  location?: { name: string } | null;
};

const EVENT_FIELDS = "id, title, date, status, image_url, location:locations(name)";

async function fetchRelatedEvents(scope: RelatedEventsScope): Promise<RelatedEvent[]> {
  if (scope.kind === "location") {
    const [direct, viaOrganizers] = await Promise.all([
      supabase.from("events").select(EVENT_FIELDS).eq("location_id", scope.id).limit(500),
      supabase.from("event_organizers").select(`event:events(${EVENT_FIELDS})`).eq("location_id", scope.id).limit(500),
    ]);
    if (direct.error) throw direct.error;
    if (viaOrganizers.error) throw viaOrganizers.error;
    const merged = new Map<string, RelatedEvent>();
    for (const event of (direct.data || []) as unknown as RelatedEvent[]) merged.set(event.id, event);
    for (const row of (viaOrganizers.data || []) as unknown as Array<{ event: RelatedEvent | null }>) {
      if (row.event) merged.set(row.event.id, row.event);
    }
    return Array.from(merged.values());
  }

  const table = scope.kind === "organizer" ? "event_organizers" : "event_artists";
  const column = scope.kind === "organizer" ? "organizer_id" : "artist_id";
  const { data, error } = await supabase
    .from(table)
    .select(`event:events(${EVENT_FIELDS})`)
    .eq(column, scope.id)
    .limit(500);
  if (error) throw error;
  return ((data || []) as unknown as Array<{ event: RelatedEvent | null }>)
    .map((row) => row.event)
    .filter((event): event is RelatedEvent => Boolean(event));
}

const STATUS_STYLES: Record<RelatedEvent["status"], { label: string; dot: string }> = {
  approved: { label: "Validé", dot: "bg-success" },
  pending: { label: "En attente", dot: "bg-warning" },
  rejected: { label: "Refusé", dot: "bg-destructive" },
};

function RelatedEventRow({
  event,
  muted,
  hideLocation,
}: {
  event: RelatedEvent;
  muted?: boolean;
  hideLocation?: boolean;
}) {
  const date = parseDateWithoutTimezone(event.date);
  const dayKey = date ? format(date, "yyyy-MM-dd") : "";
  const status = STATUS_STYLES[event.status] ?? STATUS_STYLES.pending;

  return (
    <Link
      href={dayKey ? `/admin/events?view=agenda&start=${dayKey}` : "/admin/events"}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60",
        muted && "opacity-70",
      )}
    >
      <div className="flex w-11 shrink-0 flex-col items-center rounded-md border border-border bg-background py-1 leading-none">
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          {date ? format(date, "MMM", { locale: fr }).replace(".", "") : "—"}
        </span>
        <span className="mt-0.5 text-sm font-semibold tabular-nums">{date ? format(date, "d") : "?"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.title || "(Sans titre)"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            date ? format(date, "EEEE · HH:mm", { locale: fr }) : null,
            date && date.getFullYear() !== new Date().getFullYear() ? format(date, "yyyy") : null,
            hideLocation ? null : event.location?.name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", status.dot)} />
        <span className="hidden sm:inline">{status.label}</span>
      </span>
    </Link>
  );
}

/** Événements à venir et passés liés à un lieu, un organisateur ou un artiste. */
export function EntityRelatedEvents({ scope }: { scope: RelatedEventsScope }) {
  const [events, setEvents] = React.useState<RelatedEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showPast, setShowPast] = React.useState(false);

  const { kind, id } = scope;

  React.useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    fetchRelatedEvents({ kind, id } as RelatedEventsScope)
      .then((data) => {
        if (!cancelled) setEvents(data);
      })
      .catch((fetchError) => {
        console.error("Événements liés indisponibles:", fetchError);
        if (!cancelled) setError("Les événements liés n'ont pas pu être chargés.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const { upcoming, past } = React.useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const withDates = (events || []).map((event) => ({
      event,
      time: parseDateWithoutTimezone(event.date)?.getTime() ?? 0,
    }));
    return {
      upcoming: withDates
        .filter((entry) => entry.time >= startOfToday.getTime())
        .sort((a, b) => a.time - b.time)
        .map((entry) => entry.event),
      past: withDates
        .filter((entry) => entry.time < startOfToday.getTime())
        .sort((a, b) => b.time - a.time)
        .map((entry) => entry.event),
    };
  }, [events]);

  if (error) {
    return <p className="py-6 text-sm text-destructive">{error}</p>;
  }

  if (!events) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des événements…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <CalendarX2 className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Aucun événement lié</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Les événements rattachés apparaîtront ici dès leur création.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "À venir", value: upcoming.length },
          { label: "Passés", value: past.length },
          { label: "En attente", value: events.filter((event) => event.status === "pending").length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border px-3 py-2.5">
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="mt-1 text-lg font-semibold leading-none tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      <section className="space-y-1.5">
        <h3 className="px-2 text-xs font-medium text-muted-foreground">À venir</h3>
        {upcoming.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">Rien de prévu pour l’instant.</p>
        ) : (
          <div className="space-y-0.5">
            {upcoming.slice(0, 30).map((event) => (
              <RelatedEventRow key={event.id} event={event} hideLocation={kind === "location"} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowPast((current) => !current)}
          >
            <ChevronDown className={cn("transition-transform", showPast && "rotate-180")} />
            {showPast ? "Masquer" : "Afficher"} les {past.length} événement{past.length > 1 ? "s" : ""} passé
            {past.length > 1 ? "s" : ""}
          </Button>
          {showPast ? (
            <div className="space-y-0.5">
              {past.slice(0, 50).map((event) => (
                <RelatedEventRow key={event.id} event={event} muted hideLocation={kind === "location"} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
