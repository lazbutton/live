"use client";

import * as React from "react";
import { addDays, format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { enumerateEventDisplayDays, startOfLocalDay, toLocalDayKey } from "@/lib/events/display-days";

import type { AdminEvent } from "../events/types";
import { EventCard } from "../events/event-card";
import { EventContextMenu } from "../events/event-context-menu";

export type WeekTimelineProps = {
  events: AdminEvent[];
  onEventClick: (event: AdminEvent) => void;
  onOpenArtistsDialog: (event: AdminEvent) => void;
  onToggleFull: (event: AdminEvent) => Promise<void>;
  onToggleFeatured: (event: AdminEvent) => Promise<void>;
  onQuickApprove: (event: AdminEvent) => Promise<void>;
  className?: string;
};

function DayHeading({ day }: { day: Date }) {
  const isToday = isSameDay(day, new Date());
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
          isToday ? "bg-foreground text-background" : "text-foreground",
        )}
      >
        {format(day, "d", { locale: fr })}
      </span>
      <span className={cn("text-xs font-medium capitalize", isToday ? "text-foreground" : "text-muted-foreground")}>
        {isToday ? "Aujourd'hui" : format(day, "EEEE", { locale: fr })}
      </span>
    </div>
  );
}

export function WeekTimeline({
  events,
  onEventClick,
  onOpenArtistsDialog,
  onToggleFull,
  onToggleFeatured,
  onQuickApprove,
  className,
}: WeekTimelineProps) {
  const today = React.useMemo(() => startOfLocalDay(new Date()), []);
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);
  const [contextMenu, setContextMenu] = React.useState<{
    event: AdminEvent;
    x: number;
    y: number;
  } | null>(null);

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

  const openContextMenu = React.useCallback(
    (mouseEvent: React.MouseEvent<HTMLDivElement>, event: AdminEvent) => {
      const menuWidth = 252;
      const menuHeight = event.status === "pending" ? 274 : 232;
      const viewportPadding = 12;

      const nextX = Math.max(
        viewportPadding,
        Math.min(mouseEvent.clientX, window.innerWidth - menuWidth - viewportPadding),
      );
      const nextY = Math.max(
        viewportPadding,
        Math.min(mouseEvent.clientY, window.innerHeight - menuHeight - viewportPadding),
      );

      setContextMenu({
        event,
        x: nextX,
        y: nextY,
      });
    },
    [],
  );

  React.useEffect(() => {
    setContextMenu(null);
  }, [events]);

  const totalCount = events.length;

  const header = (
    <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
      <div className="space-y-1">
        <CardTitle>7 prochains jours</CardTitle>
        <CardDescription>
          {totalCount === 0
            ? "Aucun événement programmé."
            : `${totalCount} événement${totalCount > 1 ? "s" : ""} programmé${totalCount > 1 ? "s" : ""}.`}
        </CardDescription>
      </div>
    </CardHeader>
  );

  return (
    <Card className={cn("@container/timeline overflow-hidden", className)}>
      {header}

      {/* Conteneur étroit : liste jour par jour */}
      <div className="divide-y divide-border @4xl/timeline:hidden">
        {days.map((day) => {
          const key = toLocalDayKey(day);
          const list = eventsByDay.get(key) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div key={key} className={cn("flex items-start gap-3 px-4 py-2.5", isToday && "bg-muted/30")}>
              <div className="w-28 shrink-0 pt-0.5">
                <DayHeading day={day} />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {list.length === 0 ? (
                  <div className="py-1 text-sm text-muted-foreground/70">Rien de prévu</div>
                ) : (
                  list.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      onClick={() => onEventClick(ev)}
                      onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev) : undefined}
                      onContextMenu={(mouseEvent) => openContextMenu(mouseEvent, ev)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Conteneur large : grille 7 colonnes */}
      <div className="hidden grid-cols-7 divide-x divide-border @4xl/timeline:grid">
        {days.map((day) => {
          const key = toLocalDayKey(day);
          const list = eventsByDay.get(key) || [];
          const isToday = isSameDay(day, new Date());

          return (
            <div key={key} className={cn("min-h-[220px] min-w-0 space-y-3 p-3", isToday && "bg-muted/30")}>
              <DayHeading day={day} />
              <div className="space-y-1.5">
                {list.length === 0 ? (
                  <div className="px-1 text-xs text-muted-foreground/70">—</div>
                ) : (
                  list.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      compact
                      onClick={() => onEventClick(ev)}
                      onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev) : undefined}
                      onContextMenu={(mouseEvent) => openContextMenu(mouseEvent, ev)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {contextMenu ? (
        <EventContextMenu
          event={contextMenu.event}
          x={contextMenu.x}
          y={contextMenu.y}
          open
          onClose={() => setContextMenu(null)}
          onEdit={onEventClick}
          onEditArtists={onOpenArtistsDialog}
          onToggleFull={onToggleFull}
          onToggleFeatured={onToggleFeatured}
          onQuickApprove={onQuickApprove}
        />
      ) : null}
    </Card>
  );
}
