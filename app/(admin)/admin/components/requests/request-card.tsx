"use client";

import * as React from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ExternalLink,
  Loader2,
  MapPin,
  SquarePen,
  ThumbsDown,
  Wand2,
} from "lucide-react";

import type { AdminRequestItem } from "@/lib/admin-requests";
import { safeDomainFromUrl } from "@/lib/admin-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEventDate, ReasonBadge, StatusBadge } from "./request-ui";

function getCardTone(item: AdminRequestItem) {
  if (item.status !== "pending") {
    return "border-border/70 bg-card/80";
  }

  switch (item.lane) {
    case "ready":
      return "border-emerald-500/20 bg-emerald-500/[0.04]";
    case "to_process":
      return "border-amber-500/20 bg-amber-500/[0.045]";
    case "from_url":
      return "border-sky-500/20 bg-sky-500/[0.045]";
    case "blocked":
      return "border-rose-500/20 bg-rose-500/[0.045]";
    case "processed":
      return "border-border/70 bg-card/80";
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
  onReject,
  onOpenUrl,
}: {
  item: AdminRequestItem;
  active: boolean;
  processingId: string | null;
  onOpen: (item: AdminRequestItem) => void;
  onConvert: (item: AdminRequestItem) => void;
  onEdit: (item: AdminRequestItem) => void;
  onReject: (item: AdminRequestItem) => void;
  onOpenUrl: (url: string) => void;
}) {
  const isProcessing = processingId === item.id;
  const signal = getPrimarySignal(item);
  const contributor = item.requestedBy || item.contributorDisplayName || "Contributeur inconnu";
  const sourceDomain = item.sourceUrl ? safeDomainFromUrl(item.sourceUrl) : null;
  const canConvert = item.status === "pending" && item.isFastConvertible;
  const canEdit = item.status === "pending";

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 shadow-sm transition-all",
        getCardTone(item),
        active && "ring-2 ring-primary/25",
      )}
    >
      <button type="button" className="block w-full text-left" onClick={() => onOpen(item)}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <Badge variant="outline" className="text-[11px]">
            {signal}
          </Badge>
          {item.moderationReason ? <ReasonBadge reason={item.moderationReason} /> : null}
        </div>

        <div className="mt-2 space-y-1">
          <div className="line-clamp-2 text-sm font-semibold leading-5">{item.title}</div>
          <div className="text-xs text-muted-foreground">
            {contributor}
            {sourceDomain ? ` • ${sourceDomain}` : ""}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatEventDate(item.eventDate)}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{item.locationSummary || "Lieu non renseigné"}</span>
          </span>
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canConvert ? (
          <Button
            type="button"
            size="sm"
            disabled={isProcessing}
            onClick={() => onConvert(item)}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Convertir
          </Button>
        ) : null}

        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant={canConvert ? "outline" : "default"}
            onClick={() => onEdit(item)}
          >
            <SquarePen className="mr-2 h-4 w-4" />
            Compléter
          </Button>
        ) : null}

        {item.status === "pending" ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onReject(item)}>
            <ThumbsDown className="mr-2 h-4 w-4" />
            Rejeter
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(item)}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Voir
          </Button>
        )}

        {item.sourceUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto"
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
