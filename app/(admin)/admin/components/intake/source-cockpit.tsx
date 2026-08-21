"use client";

import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EventSource, SourceStatus } from "./intake-types";
import { sourceStatusOptions } from "./intake-types";
import {
  getEntityImageUrl,
  getEntityInitials,
  getPriorityLabel,
  getSourceDomainLabel,
  getSourcePrimaryEntity,
  getSourceStatusLabel,
  intakeUi,
  isSourceDue,
  isSourceLate,
} from "./intake-utils";

function getCockpitState(args: {
  source: EventSource;
  active: boolean;
  recentlyScanned: boolean;
  needsLink: boolean;
}) {
  if (args.source.status !== "active") {
    return {
      label: getSourceStatusLabel(args.source.status),
      tone: "border-muted-foreground/30 text-muted-foreground",
      helper: "Hors file active",
    };
  }

  if (args.needsLink) {
    return {
      label: "A lier",
      tone: "border-amber-500/40 text-amber-600",
      helper: "Lien requis",
    };
  }

  if (args.recentlyScanned) {
    return {
      label: "Scannee",
      tone: "border-emerald-500/40 text-emerald-600",
      helper: "Scannee recemment",
    };
  }

  if (isSourceLate(args.source)) {
    return {
      label: "En retard",
      tone: "border-destructive/40 text-destructive",
      helper: "Prioritaire",
    };
  }

  if (isSourceDue(args.source)) {
    return {
      label: args.active ? "En cours" : "A scanner",
      tone: "border-primary/50 text-primary",
      helper: args.active ? "En cours" : "Prete",
    };
  }

  return {
    label: "Planifiee",
    tone: "border-border text-muted-foreground",
    helper: "Planifiee",
  };
}

export function SourceCockpit(props: {
  activeSource?: EventSource | null;
  nextSource?: EventSource | null;
  recentlyScanned: boolean;
  suggestion?: {
    priority: string;
    scanFrequencyDays: number;
    noveltyScore: number;
    differs: boolean;
    label: string;
  } | null;
  onApplySuggestion: (source: EventSource) => void;
  onEditSource: (source: EventSource) => void;
  onOpenSource: (source: EventSource) => void;
  onMarkScanned: (source: EventSource) => void;
  onResetScan: (source: EventSource) => void;
  onDeleteSource: (source: EventSource) => void;
  onEditLinkedEntity: (source: EventSource) => void;
  onSelectNextSource: () => void;
  onStatusChange: (source: EventSource, status: SourceStatus) => void;
}) {
  const source = props.activeSource ?? props.nextSource ?? null;
  const isActiveSource = Boolean(source && props.activeSource?.id === source.id);
  const primaryEntity = source ? getSourcePrimaryEntity(source) : null;
  const primaryImageUrl = getEntityImageUrl(primaryEntity?.entity);
  const needsLink = Boolean(source && source.source_scope !== "global" && !primaryEntity);
  const state = source
    ? getCockpitState({
        source,
        active: isActiveSource,
        recentlyScanned: props.recentlyScanned,
        needsLink,
      })
    : null;
  const canWork = Boolean(source && source.status === "active" && !needsLink);

  return (
    <Card
      className={`${intakeUi.panelCard} ${
        source ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
      }`}
    >
      <CardHeader className={`${source ? "bg-primary/5 px-4 py-3" : intakeUi.panelHeader}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Source active
            </div>
            <CardTitle className={`mt-1 ${intakeUi.panelTitle}`}>
              {isActiveSource ? "Verification avant saisie" : "Source proposee"}
            </CardTitle>
          </div>
          {state ? (
            <Badge variant="outline" className={`${intakeUi.compactBadge} ${state.tone}`}>
              {state.label}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-3">
        {!source ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            Choisis une source dans la navigation pour charger le cockpit.
          </div>
        ) : (
          <>
            <div
              className={`${intakeUi.sectionCard} ${
                needsLink
                  ? "border-amber-500/30 bg-amber-500/5"
                  : source.status !== "active"
                    ? "border-muted-foreground/20 bg-muted/20"
                    : "border-primary/20 bg-background/90"
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-14 w-14 rounded-2xl border border-border">
                  {primaryImageUrl ? <AvatarImage src={primaryImageUrl} alt={source.name} /> : null}
                  <AvatarFallback className="rounded-2xl text-base font-semibold text-muted-foreground">
                    {primaryEntity ? getEntityInitials(primaryEntity.entity.name) : "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                
                  <h2 className="mt-1 text-lg font-semibold leading-tight text-foreground">
                    {source.name}
                  </h2>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={intakeUi.compactBadge}>
                      {source.source_scope === "owner" ? "Synchronisee" : "Globale"}
                    </Badge>
                    <Badge
                      variant={source.priority === "p0" ? "destructive" : "secondary"}
                      className={intakeUi.compactBadge}
                    >
                      {getPriorityLabel(source.priority)}
                    </Badge>
                    <Badge variant="outline" className={intakeUi.compactBadge}>
                      {getSourceDomainLabel(source.url)}
                    </Badge>
                    {primaryEntity ? (
                      <Badge variant="outline" className={`${intakeUi.compactBadge} max-w-full`}>
                        <span className="truncate">{primaryEntity.entity.name}</span>
                      </Badge>
                    ) : source.source_scope === "global" ? (
                      <Badge variant="outline" className={intakeUi.compactBadge}>
                        Source globale
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`${intakeUi.compactBadge} border-amber-500/40 text-amber-600`}
                      >
                        Rattachement manquant
                      </Badge>
                    )}
                    {source.city_hint ? (
                      <Badge variant="outline" className={intakeUi.compactBadge}>
                        {source.city_hint}
                      </Badge>
                    ) : null}
                    {source.category_hint ? (
                      <Badge variant="outline" className={intakeUi.compactBadge}>
                        {source.category_hint}
                      </Badge>
                    ) : null}
                  </div>

              

                
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={`${intakeUi.controlButton} gap-1.5`}
                onClick={() => props.onOpenSource(source)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ouvrir
              </Button>
              <Button
                type="button"
                size="sm"
                className={`${intakeUi.controlButton} gap-1.5`}
                disabled={!canWork}
                onClick={() => props.onMarkScanned(source)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Terminer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`${intakeUi.controlButton} gap-1.5`}
                disabled={!props.nextSource}
                onClick={props.onSelectNextSource}
              >
                Suivante
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              {props.suggestion?.differs ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={`${intakeUi.controlButton} gap-1.5`}
                  onClick={() => props.onApplySuggestion(source)}
                >
                  Appliquer reco
                </Button>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className={`${intakeUi.controlButton} gap-1.5`}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    Plus
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => props.onEditSource(source)}>
                    <PencilLine className="mr-2 h-3.5 w-3.5" />
                    Editer
                  </DropdownMenuItem>
                  {primaryEntity ? (
                    <DropdownMenuItem onClick={() => props.onEditLinkedEntity(source)}>
                      <PencilLine className="mr-2 h-3.5 w-3.5" />
                      {source.organizer_id ? "Editer organisateur" : "Editer lieu organisateur"}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => props.onResetScan(source)}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Reset scan
                  </DropdownMenuItem>
                  {source.is_editable ? (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => props.onDeleteSource(source)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Supprimer la source
                    </DropdownMenuItem>
                  ) : null}
                  {props.suggestion?.differs ? (
                    <DropdownMenuItem onClick={() => props.onApplySuggestion(source)}>
                      Appliquer reco
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  {sourceStatusOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => props.onStatusChange(source, option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                  {source.status === "active" ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => props.onStatusChange(source, "dead")}>
                        Source morte
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
