"use client";

import * as React from "react";

import { Calendar, CheckCircle2, Image as ImageIcon, MapPin, Tag, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

type EventFormOverviewCardProps = {
  title?: string;
  categoryLabel?: string;
  startDate?: string;
  endDate?: string;
  locationLabel?: string;
  organizerLabels?: string[];
  tagsCount?: number;
  priceLabel?: string;
  hasImage?: boolean;
  missingRequired: string[];
  className?: string;
};

function formatRange(startDate?: string, endDate?: string) {
  if (!startDate) return "A completer";
  const startLabel = formatDateWithoutTimezone(startDate, "EEE d MMM - HH:mm");
  if (!endDate) return startLabel;
  const endLabel = formatDateWithoutTimezone(endDate, "EEE d MMM - HH:mm");
  return `${startLabel} -> ${endLabel}`;
}

function compactList(items: string[], limit = 2) {
  if (items.length <= limit) return items.join(", ");
  return `${items.slice(0, limit).join(", ")} +${items.length - limit}`;
}

export function EventFormOverviewCard({
  title,
  categoryLabel,
  startDate,
  endDate,
  locationLabel,
  organizerLabels = [],
  tagsCount = 0,
  priceLabel,
  hasImage = false,
  missingRequired,
  className,
}: EventFormOverviewCardProps) {
  const isReady = missingRequired.length === 0;

  return (
    <Card className={cn("p-4 md:p-5", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isReady ? "default" : "secondary"} className={cn(isReady && "bg-emerald-600 hover:bg-emerald-600")}>
              {isReady ? "Pret a enregistrer" : `${missingRequired.length} element${missingRequired.length > 1 ? "s" : ""} a completer`}
            </Badge>
            {hasImage ? (
              <Badge variant="outline" className="gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                Image ok
              </Badge>
            ) : null}
            {tagsCount > 0 ? (
              <Badge variant="outline" className="gap-1">
                <Tag className="h-3.5 w-3.5" />
                {tagsCount} tag{tagsCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
            {priceLabel ? <Badge variant="outline">{priceLabel}</Badge> : null}
          </div>

          <div>
            <div className="text-sm text-muted-foreground">Vue d'ensemble</div>
            <div className="text-lg font-semibold">{title?.trim() || "Titre a completer"}</div>
          </div>

          {!isReady ? (
            <div className="flex flex-wrap gap-2">
              {missingRequired.map((item) => (
                <Badge key={item} variant="secondary">
                  {item}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Date
          </div>
          <div className="mt-1 text-sm font-medium">{formatRange(startDate, endDate)}</div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Lieu
          </div>
          <div className="mt-1 text-sm font-medium">{locationLabel || "Non selectionne"}</div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Tag className="h-3.5 w-3.5" />
            Categorie
          </div>
          <div className="mt-1 text-sm font-medium">{categoryLabel || "Non selectionnee"}</div>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Organisateurs
          </div>
          <div className="mt-1 text-sm font-medium">
            {organizerLabels.length > 0 ? compactList(organizerLabels) : "Non selectionne"}
          </div>
        </div>
      </div>

      {isReady ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          Les champs essentiels sont remplis.
        </div>
      ) : null}
    </Card>
  );
}
