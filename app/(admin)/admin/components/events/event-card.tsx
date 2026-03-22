"use client";

import * as React from "react";
import { CheckCircle2, MapPin, Star } from "lucide-react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import type { AdminEvent } from "./types";

export type EventCardProps = {
  event: AdminEvent;
  onClick: () => void;
  onQuickApprove?: () => Promise<void>;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  compact?: boolean;
};

function hashToIndex(input: string, modulo: number) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return modulo === 0 ? 0 : h % modulo;
}

function getFallbackBg(category: string) {
  const palette = [
    "bg-indigo-500/15",
    "bg-sky-500/15",
    "bg-emerald-500/15",
    "bg-amber-500/15",
    "bg-rose-500/15",
    "bg-violet-500/15",
    "bg-teal-500/15",
  ];
  return palette[hashToIndex(category || "event", palette.length)];
}

function getStatusDot(status: AdminEvent["status"]) {
  if (status === "approved") return "bg-emerald-500";
  if (status === "pending") return "bg-amber-500";
  return "bg-red-500";
}

export function EventCard({
  event,
  onClick,
  onQuickApprove,
  onContextMenu,
  compact = false,
}: EventCardProps) {
  const dt = React.useMemo(() => new Date(event.date), [event.date]);
  const timeLabel = React.useMemo(() => {
    try {
      return format(dt, "HH:mm");
    } catch {
      return "";
    }
  }, [dt]);

  const locationName = event.location?.name || event.event_organizers?.[0]?.location?.name || null;
  const linkedMajorEventTitle = event.major_event_events?.[0]?.major_event?.title || null;

  const isPending = event.status === "pending";
  const isRejected = event.status === "rejected";

  const hasImage = Boolean(event.image_url);

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
        "group relative w-full text-left rounded-xl border bg-card overflow-hidden transition-all duration-200",
        "hover:shadow-md hover:scale-[1.01] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        isPending && "border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 border-l-4 border-l-amber-500",
        isRejected && "opacity-60",
      )}
    >
      {/* background */}
      <div
        className={cn(
          "absolute inset-0",
          hasImage ? "bg-center bg-cover" : getFallbackBg(event.category),
        )}
        style={hasImage ? { backgroundImage: `url(${event.image_url})` } : undefined}
        aria-hidden="true"
      />
      {/* overlay for readability when image */}
      {hasImage ? (
        <div
          className={cn(
            "absolute inset-0",
            "bg-gradient-to-t from-black/55 via-black/20 to-black/10",
          )}
          aria-hidden="true"
        />
      ) : null}

      <div className={cn("relative p-3", compact ? "py-2" : "py-3")}>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-1 h-2 w-2 rounded-full shrink-0",
              getStatusDot(event.status),
              hasImage && "ring-2 ring-black/20",
            )}
            aria-hidden="true"
          />

          <div className="min-w-0 flex-1">
            <div className={cn("flex items-start justify-between gap-2")}>
              <div className="min-w-0">
                <div
                  className={cn(
                    "font-semibold leading-snug line-clamp-2",
                    hasImage ? "text-white" : "text-foreground",
                    compact ? "text-sm" : "text-[15px]",
                  )}
                >
                  {event.title || "(Sans titre)"}
                </div>
                {event.is_featured ? (
                  <div
                    className={cn(
                      "mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      hasImage
                        ? "border-white/20 bg-black/25 text-white"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    <Star className="h-3 w-3" />
                    A la une
                  </div>
                ) : null}
                {linkedMajorEventTitle ? (
                  <div
                    className={cn(
                      "mt-2 inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                      hasImage
                        ? "border-white/20 bg-black/25 text-white"
                        : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    )}
                  >
                    <span className="truncate">Multi-événements · {linkedMajorEventTitle}</span>
                  </div>
                ) : null}
                <div
                  className={cn(
                    "mt-2 flex items-center gap-2 text-xs",
                    hasImage ? "text-white/80" : "text-muted-foreground",
                  )}
                >
                  {timeLabel ? <span className="tabular-nums">{timeLabel}</span> : null}
                  {locationName ? (
                    <>
                      <span className="opacity-60">•</span>
                      <span className="min-w-0 truncate inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 opacity-80" />
                        <span className="truncate">{locationName}</span>
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {isPending && onQuickApprove ? (
            <button
              type="button"
              className={cn(
                "relative z-10 shrink-0 rounded-full p-2",
                "bg-emerald-600 text-white shadow-sm",
                "hover:bg-emerald-700 active:scale-95 transition",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
              title="Approuver"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void onQuickApprove();
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

