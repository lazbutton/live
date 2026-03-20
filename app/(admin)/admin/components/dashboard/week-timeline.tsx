"use client";

import * as React from "react";
import { addDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { enumerateEventDisplayDays, startOfLocalDay, toLocalDayKey } from "@/lib/events/display-days";

import type { AdminEvent } from "../events/types";
import { EventCard } from "../events/event-card";

export type WeekTimelineProps = {
  events: AdminEvent[];
  onEventClick: (event: AdminEvent) => void;
  className?: string;
};

export function WeekTimeline({ events, onEventClick, className }: WeekTimelineProps) {
  const isMobile = useIsMobile();
  const today = React.useMemo(() => startOfLocalDay(new Date()), []);
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  const eventsByDay = React.useMemo(() => {
    const map = new Map<string, AdminEvent[]>();
    for (const ev of events) {
      for (const day of enumerateEventDisplayDays(ev.date, ev.end_date)) {
        const key = toLocalDayKey(day);
        const list = map.get(key) || [];
        list.push(ev);
        map.set(key, list);
      }
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      map.set(k, list);
    }
    return map;
  }, [events]);

  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="text-sm font-semibold">Timeline • 7 jours</div>
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2">
          {days.map((day) => {
            const key = toLocalDayKey(day);
            const list = eventsByDay.get(key) || [];
            const isToday = isSameDay(day, new Date());
            return (
              <div key={key} className="min-w-full snap-start">
                <Card className="p-3">
                  <div className={cn("font-semibold", isToday && "text-primary")}>
                    {format(day, "EEE d MMM", { locale: fr })}
                  </div>
                  <div className="mt-3 space-y-2">
                    {list.length === 0 ? (
                      <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                        Aucun
                      </div>
                    ) : (
                      list.map((ev) => (
                        <EventCard
                          key={ev.id}
                          event={ev}
                          compact
                          onClick={() => onEventClick(ev)}
                        />
                      ))
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm font-semibold">Timeline • 7 jours</div>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const key = toLocalDayKey(day);
          const list = eventsByDay.get(key) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <Card key={key} className={cn("p-3 min-h-[220px]", isToday && "ring-1 ring-primary/30")}>
              <div className="flex items-baseline justify-between gap-2">
                <div className={cn("text-sm font-semibold", isToday && "text-primary")}>
                  {format(day, "EEE", { locale: fr })}
                </div>
                <div className="text-xs text-muted-foreground">{format(day, "d MMM", { locale: fr })}</div>
              </div>

              <div className="mt-3 space-y-2">
                {list.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Aucun</div>
                ) : (
                  list.map((ev) => (
                    <EventCard key={ev.id} event={ev} compact onClick={() => onEventClick(ev)} />
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

