"use client";

import * as React from "react";

import {
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EventFormOverviewCardProps = {
  title?: string;
  categoryLabel?: string;
  startDate?: string;
  endDate?: string;
  locationLabel?: string;
  majorEventLabel?: string;
  organizerLabels?: string[];
  artistLabels?: string[];
  tagsCount?: number;
  priceLabel?: string;
  hasImage?: boolean;
  isFeatured?: boolean;
  missingRequired: string[];
  className?: string;
};

export function EventFormOverviewCard({
  title,
  tagsCount = 0,
  priceLabel,
  hasImage = false,
  isFeatured = false,
  missingRequired,
  className,
}: EventFormOverviewCardProps) {
  const isReady = missingRequired.length === 0;

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-background/95 p-4 shadow-sm md:p-5",
        className,
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={isReady ? "default" : "secondary"}
            className={cn(
              "rounded-full px-3 py-1",
              isReady && "bg-emerald-600 hover:bg-emerald-600",
            )}
          >
            {isReady ? "Prêt" : `${missingRequired.length} à compléter`}
          </Badge>
          {priceLabel ? (
            <Badge variant="outline" className="rounded-full">
              {priceLabel}
            </Badge>
          ) : null}
          {hasImage ? (
            <Badge variant="outline" className="gap-1 rounded-full">
              <ImageIcon className="h-3.5 w-3.5" />
              Image
            </Badge>
          ) : null}
          {isFeatured ? (
            <Badge
              variant="outline"
              className="rounded-full border-primary/20 bg-primary/10 text-primary"
            >
              À la une
            </Badge>
          ) : null}
          {tagsCount > 0 ? (
            <Badge variant="outline" className="rounded-full">
              {tagsCount} tag{tagsCount > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-1">
          <div className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">
            {title?.trim() || "Titre à compléter"}
          </div>
          {!isReady ? (
            <div className="text-sm text-muted-foreground">
              Manque : {missingRequired.join(", ")}
            </div>
          ) : null}
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
