"use client";

import { Clock, Plus, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EventSource, IntakeMetrics } from "./intake-types";
import { intakeUi } from "./intake-utils";

export function IntakeToolbar(props: {
  metrics: IntakeMetrics;
  nextSource?: EventSource | null;
  activeSource?: EventSource | null;
  onOpenSourceCreation: () => void;
}) {
  const focusSource = props.activeSource ?? props.nextSource ?? null;

  return (
    <div className="sticky top-14 z-10 border-b border-border/50 bg-background/95 pb-2 pt-1 backdrop-blur md:top-16">
      <div className="rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary" className={`${intakeUi.compactBadge} gap-1`}>
                <Clock className="h-3 w-3" />
                {props.metrics.dueSources} a scanner
              </Badge>
              {props.metrics.lateSources > 0 ? (
                <Badge variant="outline" className={`${intakeUi.compactBadge} border-destructive/40 text-destructive`}>
                  {props.metrics.lateSources} retard
                </Badge>
              ) : null}
              <Badge variant="outline" className={intakeUi.compactBadge}>{props.metrics.ready} prets</Badge>
              <Badge variant="outline" className={intakeUi.compactBadge}>{props.metrics.activeOpportunities} en cours</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
            {focusSource ? (
              <Badge variant="outline" className={`${intakeUi.compactBadge} gap-1`}>
                <Sparkles className="h-3 w-3" />
                {props.activeSource ? "En traitement" : "A prendre"}
              </Badge>
            ) : null}
            <Button type="button" size="sm" variant="outline" className={`${intakeUi.controlButton} gap-1.5`} onClick={props.onOpenSourceCreation}>
              <Plus className="h-3.5 w-3.5" />
              Source
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
