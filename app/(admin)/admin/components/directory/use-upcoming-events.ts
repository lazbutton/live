"use client";

import * as React from "react";
import { format } from "date-fns";

import { supabase } from "@/lib/supabase/client";
import { parseDateWithoutTimezone } from "@/lib/date-utils";

export type UpcomingEventStats = {
  /** Nombre d'événements à venir (validés ou en attente). */
  count: number;
  /** Date du prochain événement. */
  next: Date | null;
};

type UpcomingKind = "location" | "organizer" | "artist";

type EmbeddedEvent = { date: string | null } | null;

/**
 * Événements à venir par fiche (lieu, organisateur ou artiste), pour les
 * colonnes « À venir » des annuaires. Les lieux-organisateurs sont indexés
 * par leur identifiant de lieu.
 */
export function useUpcomingEventStats(kind: UpcomingKind, reloadKey?: unknown) {
  const [stats, setStats] = React.useState<Map<string, UpcomingEventStats> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const today = format(new Date(), "yyyy-MM-dd");

    async function load() {
      const links = new Map<string, Map<string, string>>();
      const link = (entityId: string | null | undefined, eventId: string, date: string | null | undefined) => {
        if (!entityId || !date) return;
        const events = links.get(entityId) ?? new Map<string, string>();
        events.set(eventId, date);
        links.set(entityId, events);
      };

      if (kind === "artist") {
        const { data, error } = await supabase
          .from("event_artists")
          .select("artist_id, event_id, events!inner(date)")
          .gte("events.date", today)
          .neq("events.status", "rejected")
          .limit(5000);
        if (error) throw error;
        for (const row of (data || []) as unknown as Array<{ artist_id: string; event_id: string; events: EmbeddedEvent }>) {
          link(row.artist_id, row.event_id, row.events?.date);
        }
      } else {
        const [organizersResult, directResult] = await Promise.all([
          supabase
            .from("event_organizers")
            .select("organizer_id, location_id, event_id, events!inner(date)")
            .gte("events.date", today)
            .neq("events.status", "rejected")
            .limit(5000),
          kind === "location"
            ? supabase
                .from("events")
                .select("id, date, location_id")
                .gte("date", today)
                .neq("status", "rejected")
                .not("location_id", "is", null)
                .limit(5000)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (organizersResult.error) throw organizersResult.error;
        if (directResult.error) throw directResult.error;
        for (const row of (organizersResult.data || []) as unknown as Array<{
          organizer_id: string | null;
          location_id: string | null;
          event_id: string;
          events: EmbeddedEvent;
        }>) {
          if (kind === "organizer") link(row.organizer_id, row.event_id, row.events?.date);
          link(row.location_id, row.event_id, row.events?.date);
        }
        for (const row of (directResult.data || []) as Array<{ id: string; date: string; location_id: string | null }>) {
          link(row.location_id, row.id, row.date);
        }
      }

      const result = new Map<string, UpcomingEventStats>();
      for (const [entityId, events] of links) {
        let next: Date | null = null;
        for (const date of events.values()) {
          const parsed = parseDateWithoutTimezone(date);
          if (parsed && (!next || parsed < next)) next = parsed;
        }
        result.set(entityId, { count: events.size, next });
      }
      return result;
    }

    load()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((error) => {
        console.error("Événements à venir indisponibles:", error);
        if (!cancelled) setStats(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [kind, reloadKey]);

  return stats;
}
