"use client";

import * as React from "react";
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import { enumerateEventDisplayDays, startOfLocalDay, toLocalDayKey } from "@/lib/events/display-days";

import type { AdminEvent } from "./types";
import { EventCard } from "./event-card";
import { EventContextMenu } from "./event-context-menu";

export type EventsCalendarProps = {
  events: AdminEvent[];
  onEventClick: (event: AdminEvent) => void;
  onCreateAtDate: (date: Date) => void;
  onQuickApprove: (eventId: string) => Promise<void>;
  onBulkApprove: (eventIds: string[]) => Promise<void>;
  onOpenArtistsDialog: (event: AdminEvent) => void;
  onToggleFull: (event: AdminEvent) => Promise<void>;
  onToggleFeatured: (event: AdminEvent) => Promise<void>;
  /** Événements créés par l'agent : ceux qui sont publiés peuvent être dépubliés. */
  agentEventIds?: ReadonlySet<string>;
  onUnpublishAgentEvent?: (event: AdminEvent) => Promise<void>;
  initialAnchor?: Date;
  initialView?: "week" | "month";
};

export function EventsCalendar({
  events,
  onEventClick,
  onCreateAtDate,
  onQuickApprove,
  onBulkApprove,
  onOpenArtistsDialog,
  onToggleFull,
  onToggleFeatured,
  agentEventIds,
  onUnpublishAgentEvent,
  initialAnchor,
  initialView,
}: EventsCalendarProps) {

  const [view, setView] = React.useState<"week" | "month">("week");
  const [anchor, setAnchor] = React.useState<Date>(() => startOfLocalDay(new Date()));
  const [contextMenu, setContextMenu] = React.useState<{
    event: AdminEvent;
    x: number;
    y: number;
  } | null>(null);

  React.useEffect(() => {
    if (initialView) {
      setView(initialView);
    }
  }, [initialView]);

  React.useEffect(() => {
    if (!initialAnchor) return;
    setAnchor(startOfLocalDay(initialAnchor));
  }, [initialAnchor]);

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
      list.sort(
        (a, b) =>
          (parseDateWithoutTimezone(a.date)?.getTime() ?? 0) -
          (parseDateWithoutTimezone(b.date)?.getTime() ?? 0),
      );
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
  }, [anchor, view]);

  const titleLabel = React.useMemo(() => {
    if (view === "week") {
      const end = addDays(weekStart, 6);
      const sameMonth = weekStart.getMonth() === end.getMonth();
      return sameMonth
        ? `${format(weekStart, "d", { locale: fr })} – ${format(end, "d MMM yyyy", { locale: fr })}`
        : `${format(weekStart, "d MMM", { locale: fr })} – ${format(end, "d MMM yyyy", { locale: fr })}`;
    }
    return format(monthStart, "MMMM yyyy", { locale: fr });
  }, [monthStart, view, weekStart]);

  return (
    <Card className="@container/calendar overflow-hidden">
      {/* Barre d'outils */}
      <div className="flex flex-col gap-3 border-b border-border px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={view === "week" ? "Semaine précédente" : "Mois précédent"}
              onClick={() => setAnchor((d) => (view === "week" ? subWeeks(d, 1) : subMonths(d, 1)))}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={view === "week" ? "Semaine suivante" : "Mois suivant"}
              onClick={() => setAnchor((d) => (view === "week" ? addWeeks(d, 1) : addMonths(d, 1)))}
            >
              <ChevronRight />
            </Button>
          </div>
          <h2 className="text-[15px] font-semibold tracking-tight first-letter:uppercase">{titleLabel}</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-1"
            onClick={() => setAnchor(startOfLocalDay(new Date()))}
          >
            Aujourd’hui
          </Button>
        </div>

        <SegmentedControl
          aria-label="Période"
          className="self-start md:self-auto"
          size="sm"
          value={view}
          onValueChange={setView}
          items={[
            { value: "week", label: "Semaine" },
            { value: "month", label: "Mois" },
          ]}
        />
      </div>

      {pendingVisibleIds.length > 0 ? (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-warning/[0.06] px-3 py-2 md:px-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="size-1.5 rounded-full bg-warning" />
            <span>
              <span className="font-semibold tabular-nums">{pendingVisibleIds.length}</span> événement
              {pendingVisibleIds.length > 1 ? "s" : ""} en attente sur cette période
            </span>
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="bg-background"
            onClick={() => void handleBulkApprove()}
            disabled={bulkApproving}
          >
            {bulkApproving ? <Loader2 className="animate-spin" /> : <Check className="text-success" />}
            Tout approuver
          </Button>
        </div>
      ) : null}

      {/* Semaine : liste agenda si le conteneur est étroit, grille 7 colonnes sinon */}
      {view === "week" ? (
        <>
          <div className="divide-y divide-border @4xl/calendar:hidden">
            {weekDays.map((day) => {
              const key = toLocalDayKey(day);
              const list = eventsByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div key={key} className={cn("flex items-start gap-2.5 px-2.5 py-2.5 md:gap-3 md:px-4", isToday && "bg-muted/30")}>
                  <div className="w-10 shrink-0 @lg/calendar:w-20 @lg/calendar:pt-1">
                    <DayLabel day={day} isToday={isToday} stackOnNarrow />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {list.length === 0 ? (
                      <div className="py-1.5 text-sm text-muted-foreground/70">Aucun événement</div>
                    ) : (
                      list.map((ev) => (
                        <EventCard
                          key={`${key}-${ev.id}`}
                          event={ev}
                          onClick={() => onEventClick(ev)}
                          onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev.id) : undefined}
                          onContextMenu={(mouseEvent) => openContextMenu(mouseEvent, ev)}
                        />
                      ))
                    )}
                  </div>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => onCreateAtDate(day)}
                    title="Créer un événement ce jour"
                    aria-label={`Créer un événement le ${format(day, "d MMMM", { locale: fr })}`}
                  >
                    <Plus />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="hidden grid-cols-7 divide-x divide-border @4xl/calendar:grid">
            {weekDays.map((day) => {
              const key = toLocalDayKey(day);
              const list = eventsByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div key={key} className={cn("group/day min-h-[420px] min-w-0", isToday && "bg-muted/30")}>
                  <div className="flex items-center justify-between gap-1 px-2.5 pb-2 pt-2.5">
                    <DayLabel day={day} isToday={isToday} />
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/day:opacity-100"
                      onClick={() => onCreateAtDate(day)}
                      title="Créer un événement ce jour"
                      aria-label={`Créer un événement le ${format(day, "d MMMM", { locale: fr })}`}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <div className="space-y-1.5 px-2 pb-3">
                    {list.map((ev) => (
                      <EventCard
                        key={`${key}-${ev.id}`}
                        event={ev}
                        onClick={() => onEventClick(ev)}
                        onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev.id) : undefined}
                        onContextMenu={(mouseEvent) => openContextMenu(mouseEvent, ev)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Mois */}
      {view === "month" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div
                key={d}
                className="border-b border-border px-2.5 py-2 text-xs font-medium text-muted-foreground [&:not(:nth-child(7n))]:border-r"
              >
                {d}
              </div>
            ))}
            {monthGridDays.map((day, index) => {
              const key = toLocalDayKey(day);
              const list = eventsByDay.get(key) || [];
              const inMonth = isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());
              const isLastColumn = (index + 1) % 7 === 0;
              const isLastRow = index >= monthGridDays.length - 7;

              return (
                <div
                  key={key}
                  className={cn(
                    "group/day flex min-h-[112px] min-w-0 flex-col gap-1 p-1.5",
                    !isLastColumn && "border-r border-border",
                    !isLastRow && "border-b border-border",
                    !inMonth && "bg-muted/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-1 px-0.5">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday
                          ? "bg-foreground font-semibold text-background"
                          : inMonth
                            ? "font-medium text-foreground"
                            : "text-muted-foreground/60",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="size-6 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/day:opacity-100"
                      onClick={() => onCreateAtDate(day)}
                      title="Créer un événement ce jour"
                      aria-label={`Créer un événement le ${format(day, "d MMMM", { locale: fr })}`}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((ev) => (
                      <EventCard
                        key={`${key}-${ev.id}`}
                        event={ev}
                        compact
                        onClick={() => onEventClick(ev)}
                        onQuickApprove={ev.status === "pending" ? () => onQuickApprove(ev.id) : undefined}
                        onContextMenu={(mouseEvent) => openContextMenu(mouseEvent, ev)}
                      />
                    ))}
                    {list.length > 3 ? (
                      <button
                        type="button"
                        className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setAnchor(startOfLocalDay(day));
                          setView("week");
                        }}
                      >
                        +{list.length - 3} autre{list.length - 3 > 1 ? "s" : ""}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {contextMenu != null ? (
        <EventContextMenu
          open
          event={contextMenu.event}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={onEventClick}
          onEditArtists={onOpenArtistsDialog}
          onToggleFull={onToggleFull}
          onToggleFeatured={onToggleFeatured}
          onQuickApprove={(event) => onQuickApprove(event.id)}
          onUnpublish={agentEventIds?.has(contextMenu.event.id) ? onUnpublishAgentEvent : undefined}
        />
      ) : null}
    </Card>
  );
}

function DayLabel({
  day,
  isToday,
  stackOnNarrow = false,
}: {
  day: Date;
  isToday: boolean;
  /** Numéro au-dessus du jour quand le calendrier est étroit (liste mobile). */
  stackOnNarrow?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5",
        stackOnNarrow && "flex-col gap-0.5 @lg/calendar:flex-row @lg/calendar:gap-1.5",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
          isToday ? "bg-foreground text-background" : "text-foreground",
        )}
      >
        {format(day, "d", { locale: fr })}
      </span>
      <span className={cn("truncate text-xs font-medium capitalize", isToday ? "text-foreground" : "text-muted-foreground")}>
        {format(day, "EEE", { locale: fr })}
      </span>
    </div>
  );
}
