"use client";

import * as React from "react";
import { Check, EyeOff, Layers, MapPin, Star } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import type { AdminEvent } from "./types";

export type EventCardProps = {
  event: AdminEvent;
  onClick: () => void;
  onQuickApprove?: () => Promise<void>;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  compact?: boolean;
  showDateHeader?: boolean;
};

function getStatusDot(status: AdminEvent["status"]) {
  if (status === "approved") return "bg-success";
  if (status === "pending") return "bg-warning";
  return "bg-destructive";
}

function getStatusLabel(status: AdminEvent["status"]) {
  if (status === "approved") return "Validé";
  if (status === "pending") return "En attente";
  return "Refusé";
}

export function EventCard({
  event,
  onClick,
  onQuickApprove,
  onContextMenu,
  compact = false,
  showDateHeader = false,
}: EventCardProps) {
  const dt = React.useMemo(() => parseDateWithoutTimezone(event.date), [event.date]);
  const endDt = React.useMemo(
    () => parseDateWithoutTimezone(event.end_date),
    [event.end_date],
  );
  const timeLabel = React.useMemo(() => {
    try {
      return dt ? format(dt, "HH:mm") : "";
    } catch {
      return "";
    }
  }, [dt]);
  const dateHeaderLabel = React.useMemo(() => {
    try {
      if (!dt) return "";
      if (endDt && !isSameDay(dt, endDt)) {
        return `${format(dt, "EEE d MMM", { locale: fr })} → ${format(
          endDt,
          "EEE d MMM",
          { locale: fr },
        )}`;
      }
      return format(dt, "EEE d MMM", { locale: fr });
    } catch {
      return "";
    }
  }, [dt, endDt]);

  const locationName = event.location?.name || event.event_organizers?.[0]?.location?.name || null;
  const linkedMajorEventTitle = event.major_event_events?.[0]?.major_event?.title || null;

  const isPending = event.status === "pending";
  const isRejected = event.status === "rejected";

  const hasImage = Boolean(event.image_url);
  const hasMeta = Boolean((!showDateHeader && timeLabel) || locationName);
  const hasFlags = event.show_on_app === false || Boolean(event.is_featured) || Boolean(linkedMajorEventTitle);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        event.stopPropagation();
        onContextMenu(event);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "@container/event group relative w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-card text-left shadow-xs outline-none transition-[border-color,box-shadow] duration-150",
        "hover:border-foreground/20 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/40",
        isPending && "border-l-2 border-l-warning",
        isRejected && "opacity-60",
      )}
    >
      <div className={cn("flex items-start gap-2.5", compact ? "px-2 py-1.5" : "p-2.5")}>
        {hasImage && !compact ? (
          <div
            className="hidden size-11 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center @[15rem]/event:block"
            style={{ backgroundImage: `url(${event.image_url})` }}
            aria-hidden="true"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {showDateHeader && dateHeaderLabel ? (
            <div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-muted-foreground">
              <span className="capitalize">{dateHeaderLabel}</span>
              {timeLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{timeLabel}</span>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-start gap-1.5">
            <span
              className={cn("mt-[0.4rem] size-1.5 shrink-0 rounded-full", getStatusDot(event.status))}
              title={getStatusLabel(event.status)}
              aria-label={getStatusLabel(event.status)}
            />
            <div
              className={cn(
                "line-clamp-2 font-medium leading-snug text-foreground",
                compact ? "text-xs" : "text-[13px]",
              )}
            >
              {event.title || "(Sans titre)"}
            </div>
          </div>

          {hasMeta ? (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 pl-3 text-xs text-muted-foreground">
              {!showDateHeader && timeLabel ? (
                <span className="shrink-0 tabular-nums">{timeLabel}</span>
              ) : null}
              {locationName ? (
                <>
                  {!showDateHeader && timeLabel ? <span aria-hidden>·</span> : null}
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="size-3 shrink-0 opacity-70" />
                    <span className="truncate">{locationName}</span>
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          {hasFlags && !compact ? (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-3">
              {event.show_on_app === false ? (
                <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                  <EyeOff className="size-2.5" />
                  Hors app
                </span>
              ) : null}
              {event.is_featured ? (
                <span className="inline-flex items-center gap-1 rounded border border-border px-1 py-px text-[10px] font-medium text-foreground">
                  <Star className="size-2.5 fill-current" />
                  À la une
                </span>
              ) : null}
              {linkedMajorEventTitle ? (
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-border px-1 py-px text-[10px] font-medium text-muted-foreground">
                  <Layers className="size-2.5 shrink-0" />
                  <span className="truncate">{linkedMajorEventTitle}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {isPending && onQuickApprove ? (
          <button
            type="button"
            className={cn(
              "z-10 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background text-success shadow-xs outline-none transition-[color,background-color,border-color,opacity]",
              "hover:border-success/40 hover:bg-success/10 focus-visible:ring-[3px] focus-visible:ring-ring/40 max-md:size-8",
              compact
                ? "absolute right-1 top-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                : "relative",
            )}
            title="Approuver"
            aria-label="Approuver l'événement"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void onQuickApprove();
            }}
          >
            <Check className="size-3.5" strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
