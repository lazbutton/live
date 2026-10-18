"use client";

import * as React from "react";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarPlus,
  Check,
  Copy,
  EyeOff,
  ImageOff,
  Pencil,
  Star,
  Ticket,
  Undo2,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { RowActionsMenu, SelectAllCheckbox } from "../directory/directory";
import type { AdminEvent, CategoryOption } from "./types";

const PAGE_SIZE = 120;

const STATUS_META: Record<AdminEvent["status"], { label: string; className: string; dot: string }> = {
  approved: { label: "Validé", className: "text-success", dot: "bg-success" },
  pending: { label: "En attente", className: "text-warning", dot: "bg-warning" },
  rejected: { label: "Refusé", className: "text-destructive", dot: "bg-destructive" },
};

type DayGroup = { key: string; date: Date | null; events: AdminEvent[] };

function dayLabel(date: Date | null) {
  if (!date) return "Date inconnue";
  if (isToday(date)) return "Aujourd’hui";
  if (isTomorrow(date)) return "Demain";
  if (isYesterday(date)) return "Hier";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? "EEEE d MMMM" : "EEEE d MMMM yyyy", { locale: fr });
}

function resolveCategoryLabel(raw: string | null | undefined, categories: CategoryOption[]) {
  const value = String(raw ?? "").trim();
  if (!value || value.toLowerCase() === "null") return null;
  const upper = value.toUpperCase();
  const match = categories.find(
    (category) => category.id.trim().toUpperCase() === upper || category.name.trim().toUpperCase() === upper,
  );
  return match?.name ?? value;
}

export type EventsTableProps = {
  events: AdminEvent[];
  categories: CategoryOption[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onOpen: (event: AdminEvent) => void;
  onQuickApprove: (eventId: string) => Promise<void>;
  onDuplicate: (event: AdminEvent) => void;
  onEditArtists: (event: AdminEvent) => void;
  onToggleFeatured: (event: AdminEvent) => Promise<void>;
  onToggleFull: (event: AdminEvent) => Promise<void>;
  /** Événements créés par l'agent : ceux qui sont publiés peuvent être dépubliés. */
  agentEventIds?: ReadonlySet<string>;
  onUnpublishAgentEvent?: (event: AdminEvent) => Promise<void>;
  onCreateAtDate: (date: Date) => void;
};

/** Liste dense des événements, groupée par jour, avec sélection multiple. */
export function EventsTable({
  events,
  categories,
  selectedIds,
  onSelectedIdsChange,
  onOpen,
  onQuickApprove,
  onDuplicate,
  onEditArtists,
  onToggleFeatured,
  onToggleFull,
  agentEventIds,
  onUnpublishAgentEvent,
  onCreateAtDate,
}: EventsTableProps) {
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  const [approvingIds, setApprovingIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [events]);

  const visibleEvents = React.useMemo(() => events.slice(0, visibleCount), [events, visibleCount]);

  const groups = React.useMemo<DayGroup[]>(() => {
    const result: DayGroup[] = [];
    for (const event of visibleEvents) {
      const date = parseDateWithoutTimezone(event.date);
      const key = date ? format(date, "yyyy-MM-dd") : "unknown";
      const last = result[result.length - 1];
      if (last && last.key === key) {
        last.events.push(event);
      } else {
        result.push({ key, date, events: [event] });
      }
    }
    return result;
  }, [visibleEvents]);

  const visibleIds = React.useMemo(() => visibleEvents.map((event) => event.id), [visibleEvents]);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;

  function toggleOne(eventId: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(eventId);
    else next.delete(eventId);
    onSelectedIdsChange(next);
  }

  function toggleAll(checked: boolean) {
    const next = new Set(selectedIds);
    for (const id of visibleIds) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onSelectedIdsChange(next);
  }

  async function approve(eventId: string) {
    setApprovingIds((current) => new Set(current).add(eventId));
    try {
      await onQuickApprove(eventId);
    } finally {
      setApprovingIds((current) => {
        const next = new Set(current);
        next.delete(eventId);
        return next;
      });
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs">
      {/* En-tête de colonnes */}
      <div className="flex items-center gap-3 rounded-t-xl border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span className="hidden sm:flex">
          <SelectAllCheckbox total={visibleIds.length} selected={selectedVisibleCount} onToggle={toggleAll} />
        </span>
        <span className="hidden w-14 shrink-0 sm:block">Heure</span>
        <span className="min-w-0 flex-1">Événement</span>
        <span className="hidden w-32 shrink-0 lg:block">Catégorie</span>
        <span className="hidden w-28 shrink-0 sm:block">Statut</span>
        <span className="shrink-0 sm:w-20">
          <span className="sr-only">Actions</span>
        </span>
      </div>

      {groups.map((group, groupIndex) => {
        const pendingInGroup = group.events.filter((event) => event.status === "pending").length;
        return (
          <section key={group.key} aria-label={dayLabel(group.date)}>
            <div
              className={cn(
                "sticky top-12 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-3 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/80",
                groupIndex === groups.length - 1 && group.events.length === 0 && "rounded-b-xl",
              )}
            >
              <span className="text-xs font-semibold first-letter:uppercase">{dayLabel(group.date)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {group.events.length} événement{group.events.length > 1 ? "s" : ""}
                {pendingInGroup > 0 ? ` · ${pendingInGroup} en attente` : ""}
              </span>
              {group.date ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  onClick={() => onCreateAtDate(group.date as Date)}
                  title="Ajouter un événement ce jour"
                  aria-label={`Ajouter un événement le ${dayLabel(group.date)}`}
                >
                  <CalendarPlus />
                </Button>
              ) : null}
            </div>

            {group.events.map((event, eventIndex) => {
              const date = parseDateWithoutTimezone(event.date);
              const endDate = parseDateWithoutTimezone(event.end_date);
              const multiDay = Boolean(date && endDate && format(date, "yyyyMMdd") !== format(endDate, "yyyyMMdd"));
              const status = STATUS_META[event.status] ?? STATUS_META.pending;
              const selected = selectedIds.has(event.id);
              const locationName =
                event.location?.name || event.event_organizers?.[0]?.location?.name || null;
              const organizerNames = (event.event_organizers ?? [])
                .map((entry) => entry.organizer?.name || null)
                .filter(Boolean) as string[];
              const categoryLabel = resolveCategoryLabel(event.category, categories);
              const isLastRow = groupIndex === groups.length - 1 && eventIndex === group.events.length - 1;

              return (
                <div
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(event)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === "Enter") {
                      keyEvent.preventDefault();
                      onOpen(event);
                    }
                  }}
                  className={cn(
                    "group flex cursor-pointer items-center gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50",
                    !isLastRow && "border-b border-border",
                    isLastRow && visibleEvents.length >= events.length && "rounded-b-xl",
                    selected && "bg-accent/60 hover:bg-accent/70",
                    event.status === "rejected" && "opacity-60",
                  )}
                >
                  <div onClick={(clickEvent) => clickEvent.stopPropagation()} className="hidden sm:flex">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => toggleOne(event.id, checked === true)}
                      aria-label={`Sélectionner ${event.title || "l'événement"}`}
                    />
                  </div>

                  <span className="hidden w-14 shrink-0 text-sm tabular-nums text-muted-foreground sm:block">
                    {date ? format(date, "HH:mm") : "—"}
                  </span>

                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {event.image_url ? (
                      <span
                        className="size-10 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center"
                        style={{ backgroundImage: `url(${event.image_url})` }}
                        aria-hidden
                      />
                    ) : (
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
                        title="Sans image"
                      >
                        <ImageOff className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("size-1.5 shrink-0 rounded-full sm:hidden", status.dot)} />
                        <p className="truncate text-sm font-medium">{event.title || "(Sans titre)"}</p>
                        {event.is_featured ? (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-current text-foreground" aria-label="À la une" />
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="tabular-nums sm:hidden">{date ? format(date, "HH:mm") : "—"} · </span>
                        {[
                          locationName,
                          organizerNames.length > 0 ? organizerNames.join(", ") : null,
                          multiDay && endDate ? `jusqu’au ${format(endDate, "d MMM", { locale: fr })}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Lieu non renseigné"}
                      </p>
                    </div>
                  </div>

                  <span className="hidden w-32 shrink-0 truncate text-xs text-muted-foreground lg:block">
                    {categoryLabel || <span className="text-warning">Sans catégorie</span>}
                  </span>

                  <div className="hidden w-28 shrink-0 flex-col gap-0.5 sm:flex">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", status.className)}>
                      <span className={cn("size-1.5 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                    {event.show_on_app === false || event.is_full ? (
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {event.show_on_app === false ? (
                          <span className="inline-flex items-center gap-1">
                            <EyeOff className="h-3 w-3" />
                            Hors app
                          </span>
                        ) : null}
                        {event.is_full ? (
                          <span className="inline-flex items-center gap-1">
                            <Ticket className="h-3 w-3" />
                            Complet
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className="flex shrink-0 items-center justify-end gap-0.5 sm:w-20"
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                  >
                    {event.status === "pending" ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-success hover:bg-success/10 hover:text-success"
                        onClick={() => void approve(event.id)}
                        disabled={approvingIds.has(event.id)}
                        title="Approuver"
                        aria-label={`Approuver ${event.title || "l'événement"}`}
                      >
                        <Check />
                      </Button>
                    ) : null}
                    <RowActionsMenu label={`Actions pour ${event.title || "l'événement"}`}>
                      <DropdownMenuItem onSelect={() => onOpen(event)}>
                        <Pencil />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onDuplicate(event)}>
                        <Copy />
                        Dupliquer
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onEditArtists(event)}>
                        <Users />
                        Artistes
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void onToggleFeatured(event)}>
                        <Star />
                        {event.is_featured ? "Retirer de la une" : "Mettre à la une"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void onToggleFull(event)}>
                        <Ticket />
                        {event.is_full ? "Rouvrir la billetterie" : "Marquer complet"}
                      </DropdownMenuItem>
                      {event.status === "pending" ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => void approve(event.id)}>
                            <Check className="text-success" />
                            Approuver
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {event.status === "approved" && onUnpublishAgentEvent && agentEventIds?.has(event.id) ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => void onUnpublishAgentEvent(event)}>
                            <Undo2 />
                            Dépublier
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </RowActionsMenu>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {visibleEvents.length < events.length ? (
        <div className="flex items-center justify-center rounded-b-xl border-t border-border p-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
            Afficher {Math.min(PAGE_SIZE, events.length - visibleEvents.length)} de plus
            <span className="text-muted-foreground">
              ({visibleEvents.length} sur {events.length})
            </span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
