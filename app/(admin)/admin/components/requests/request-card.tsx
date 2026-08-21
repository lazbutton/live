"use client";

import * as React from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  SquarePen,
  ThumbsDown,
  Wand2,
} from "lucide-react";

import type { AdminRequestItem } from "@/lib/admin-requests";
import { formatRequestAgeShort, safeDomainFromUrl } from "@/lib/admin-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatRelativeEventDate,
  formatRequestDateTime,
  getMissingFieldShortLabel,
  ReasonBadge,
  StatusBadge,
} from "./request-ui";

function getCardTone(item: AdminRequestItem) {
  if (item.status !== "pending") {
    return "border-border/70 bg-card/80 hover:bg-card";
  }

  switch (item.lane) {
    case "ready":
      return "border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07]";
    case "to_process":
      return "border-amber-500/20 bg-amber-500/[0.045] hover:bg-amber-500/[0.075]";
    case "from_url":
      return "border-sky-500/20 bg-sky-500/[0.045] hover:bg-sky-500/[0.075]";
    case "blocked":
      return "border-rose-500/20 bg-rose-500/[0.045] hover:bg-rose-500/[0.075]";
    case "processed":
      return "border-border/70 bg-card/80 hover:bg-card";
  }
}

function getCardAccent(item: AdminRequestItem) {
  if (item.status !== "pending") return "bg-muted-foreground/30";

  switch (item.lane) {
    case "ready":
      return "bg-emerald-500";
    case "to_process":
      return "bg-amber-500";
    case "from_url":
      return "bg-sky-500";
    case "blocked":
      return "bg-rose-500";
    case "processed":
      return "bg-muted-foreground/30";
  }
}

function getPrimarySignal(item: AdminRequestItem) {
  if (item.status === "converted") return "Convertie";
  if (item.status === "rejected") return "Rejetée";
  if (item.status === "approved") return "Déjà validée";

  if (item.missingFields.length > 0) {
    return `${item.missingFields.length} champ${item.missingFields.length > 1 ? "s" : ""} à compléter`;
  }

  switch (item.lane) {
    case "ready":
      return "Prête à convertir";
    case "to_process":
      return "À compléter";
    case "from_url":
      return "Source à relire";
    case "blocked":
      return "À trancher";
    case "processed":
      return "Historique";
  }
}

export function RequestCard({
  item,
  active,
  processingId,
  onOpen,
  onConvert,
  onEdit,
  onRequestChanges,
  onReject,
  onOpenUrl,
}: {
  item: AdminRequestItem;
  active: boolean;
  processingId: string | null;
  onOpen: (item: AdminRequestItem) => void;
  onConvert: (item: AdminRequestItem) => void;
  onEdit: (item: AdminRequestItem) => void;
  onRequestChanges: (item: AdminRequestItem) => void;
  onReject: (item: AdminRequestItem) => void;
  onOpenUrl: (url: string) => void;
}) {
  const isProcessing = processingId === item.id;
  const signal = getPrimarySignal(item);
  const contributor =
    item.contributorDisplayName || item.requestedBy || "Contributeur inconnu";
  const sourceDomain = item.sourceUrl
    ? safeDomainFromUrl(item.sourceUrl)
    : null;
  const canConvert = item.status === "pending" && item.isFastConvertible;
  const canEdit = item.status === "pending";
  const canRequestChanges = item.status === "pending" && !canConvert;
  const requestedAtLabel = formatRequestDateTime(item.requestedAt);
  const requestedAge = formatRequestAgeShort(item.requestedAt);
  const visibleMissingFields = item.missingFields.slice(0, 4);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3 pl-4 shadow-sm transition-all",
        getCardTone(item),
        active && "ring-2 ring-primary/30",
      )}
    >
      <div
        className={cn("absolute inset-y-0 left-0 w-1.5", getCardAccent(item))}
      />

      <button
        type="button"
        className="block w-full text-left"
        onClick={() => onOpen(item)}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <Badge variant="outline" className="text-[11px]">
              {signal}
            </Badge>
            {item.moderationReason ? (
              <ReasonBadge reason={item.moderationReason} />
            ) : null}
          </div>
          {item.requestedAt ? (
            <span
              className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              title={requestedAtLabel}
            >
              {requestedAtLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="line-clamp-2 text-[15px] font-semibold leading-5">
            {item.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{contributor}</span>
            {sourceDomain ? (
              <>
                <span className="text-muted-foreground/50">•</span>
                <span className="truncate">{sourceDomain}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Demandée {requestedAtLabel}
              {requestedAge ? ` • ${requestedAge}` : ""}
            </span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">
              Événement {formatRelativeEventDate(item.eventDate)}
            </span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {item.locationSummary || "Lieu non renseigné"}
            </span>
          </span>
        </div>

        {visibleMissingFields.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visibleMissingFields.map((field) => (
              <Badge
                key={field}
                variant="secondary"
                className="px-2 py-0 text-[10px]"
              >
                {getMissingFieldShortLabel(field)}
              </Badge>
            ))}
            {item.missingFields.length > visibleMissingFields.length ? (
              <Badge
                variant="outline"
                className="px-2 py-0 text-[10px] text-muted-foreground"
              >
                +{item.missingFields.length - visibleMissingFields.length}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-3">
        {canConvert ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={isProcessing}
            onClick={() => onConvert(item)}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Convertir
            <kbd className="ml-2 rounded bg-primary-foreground/20 px-1 text-[10px]">
              C
            </kbd>
          </Button>
        ) : null}

        {canEdit && !canConvert ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            variant="default"
            onClick={() => onEdit(item)}
          >
            <SquarePen className="mr-2 h-4 w-4" />
            Compléter
            <kbd className="ml-2 rounded bg-primary-foreground/20 px-1 text-[10px]">
              E
            </kbd>
          </Button>
        ) : null}

        {canRequestChanges ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => onRequestChanges(item)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Corriger
          </Button>
        ) : null}

        {item.status === "pending" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => onReject(item)}
          >
            <ThumbsDown className="mr-2 h-4 w-4" />
            Refuser
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => onOpen(item)}
          >
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Voir
          </Button>
        )}

        {item.sourceUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-8"
            onClick={() => onOpenUrl(item.sourceUrl as string)}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Source
          </Button>
        ) : null}
      </div>
    </div>
  );
}
