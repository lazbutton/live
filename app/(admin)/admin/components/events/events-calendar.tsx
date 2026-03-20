"use client";

import * as React from "react";
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { enumerateEventDisplayDays, startOfLocalDay, toLocalDayKey } from "@/lib/events/display-days";

import type { AdminEvent } from "./types";
import { EventCard } from "./event-card";

export type EventsCalendarProps = {
  events: AdminEvent[];
  onEventClick: (event: AdminEvent) => void;
  onCreateAtDate: (date: Date) => void;
  onQuickApprove: (eventId: string) => Promise<void>;
  onBulkApprove: (eventIds: string[]) => Promise<void>;
};

export function EventsCalendar({ events, onEventClick, onCreateAtDate, onQuickApprove, onBulkApprove }: EventsCalendarProps) {
  const isMobile = useIsMobile();

  const [view, setView] = React.useState<"week" | "month">("month");
  const [anchor, setAnchor] = React.useState<Date>(() => startOfLocalDay(new Date()));

  const weekStart = React.useMemo(
    () => startOfWeek(anchor, { weekStartsOn: 1 }), // lundi
    [anchor],
  );
  const weekDays = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const monthStart = React.useMemo(() => startOfMonth(anchor), [anchor]);
  const monthGridStart = React.useMemo(
    () => startOfWeek(monthStart, { weekStartsOn: 1 }),
    [monthStart],
  );
  const monthGridDays = React.useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i)), [monthGridStart]);

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
    // tri interne par heure
    for (const [key, list] of map.entries()) {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      map.set(key, list);
    }
    return map;
  }, [events]);

  const visibleRangeEventIds = React.useMemo(() => {
    const days = view === "week" ? weekDays : monthGridDays;
    const ids = new Set<string>();
    for (const day of days) {
      const list = eventsByDay.get(toLocalDayKey(day)) || [];
      for (const ev of list) ids.add(ev.id);
    }
    return Array.from(ids);
  }, [eventsByDay, monthGridDays, view, weekDays]);

  const pendingVisibleIds = React.useMemo(() => {
    const pending = [];
    for (const ev of events) {
      if (ev.status !== "pending") continue;
      if (visibleRangeEventIds.includes(ev.id)) pending.push(ev.id);
    }
    return pending;
  }, [events, visibleRangeEventIds]);

  const [bulkApproving, setBulkApproving] = React.useState(false);

  async function handleBulkApprove() {
    if (bulkApproving) return;
    if (pendingVisibleIds.length === 0) return;
    setBulkApproving(true);
    try {
      await onBulkApprove(pendingVisibleIds);
    } finally {
      setBulkApproving(false);
    }
  }

  const titleLabel = React.useMemo(() => {
    if (view === "week") {
      const end = addDays(weekStart, 6);
      return `${format(weekStart, "d MMM", { locale: fr })} → ${format(end, "d MMM", { locale: fr })}`;
    }
    return format(monthStart, "MMMM yyyy", { locale: fr });
  }, [monthStart, view, weekStart]);

  return (
    <div className="space-y-4">
      <Card className="p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <div className="font-semibold">{titleLabel}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "week" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setView("week")}
              >
                Semaine
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "month" ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setView("month")}
              >
                <LayoutGrid className="h-4 w-4 mr-1.5" />
                Mois
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAnchor((d) => (view === "week" ? subWeeks(d, 1) : subMonths(d, 1)))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAnchor(startOfLocalDay(new Date()))}
              >
                Aujourd’hui
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAnchor((d) => (view === "week" ? addWeeks(d, 1) : addMonths(d, 1)))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {pendingVisibleIds.length > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2">
            <div className="text-sm">
              <span className="font-semibold">{pendingVisibleIds.length}</span> événement{pendingVisibleIds.length > 1 ? "s" : ""} en attente
            </div>
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => void handleBulkApprove()}
              disabled={bulkApproving}
            >
              {bulkApproving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Tout approuver
            </Button>
          </div>
        ) : null}
      </Card>

      {/* Week */}
      {view === "week" ? (
        isMobile ? (
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2">
            {weekDays.map((day) => {
              const key = toLocalDayKey(day);
              const list = eventsByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div key={key} className="min-w-full snap-start">
                  <Card className="p-3">
                    <div className={cn("flex items-center justify-between gap-2 pb-3", isToday && "text-primary")}>
                      <div className="font-semibold">
                        {format(day, "EEE d MMM", { locale: fr })}
                      </div>
                      <Button type="button" size="sm" onClick={() => onCreateAtDate(day)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Créer
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {list.length === 0 ? (
                        <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                          Aucun événement
                        </div>
                      ) : (
                        list.map((ev) => (
                          <EventCard
                            key={`${key}-${ev.id}`}
                            event={ev}
                            compact={false}
                            onClick={() => onEventClick(ev)}
                            onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev.id) : undefined}
                          />
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const key = toLocalDayKey(day);
              const list = eventsByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <Card key={key} className={cn("p-3 min-h-[240px]", isToday && "ring-1 ring-primary/30")}>
                  <div className="flex items-start justify-between gap-2 pb-3">
                    <div className="min-w-0">
                      <div className={cn("text-sm font-semibold truncate", isToday && "text-primary")}>
                        {format(day, "EEE", { locale: fr })}
                      </div>
                      <div className="text-xs text-muted-foreground">{format(day, "d MMM", { locale: fr })}</div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      onClick={() => onCreateAtDate(day)}
                      title="Créer"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {list.map((ev) => (
                      <EventCard
                        key={`${key}-${ev.id}`}
                        event={ev}
                        onClick={() => onEventClick(ev)}
                        onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev.id) : undefined}
                      />
                    ))}
                    {list.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">Aucun</div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {/* Month */}
      {view === "month" ? (
        <div className="grid grid-cols-7 gap-2">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="text-xs font-semibold text-muted-foreground px-1">
              {d}
            </div>
          ))}
          {monthGridDays.map((day) => {
            const key = toLocalDayKey(day);
            const list = eventsByDay.get(key) || [];
            const inMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg border bg-card p-2 min-h-[96px] flex flex-col gap-2",
                  !inMonth && "opacity-50",
                  isToday && "ring-1 ring-primary/30",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className={cn("text-xs font-semibold", isToday && "text-primary")}>{format(day, "d")}</div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => onCreateAtDate(day)}
                    title="Créer"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {list.slice(0, 3).map((ev) => (
                    <EventCard
                      key={`${key}-${ev.id}`}
                      event={ev}
                      compact
                      onClick={() => onEventClick(ev)}
                      onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev.id) : undefined}
                    />
                  ))}
                  {list.length > 3 ? (
                    <div className="text-[11px] text-muted-foreground">+{list.length - 3}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

