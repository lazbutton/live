"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CircleCheckBig,
  Copy,
  ExternalLink,
  Focus,
  Inbox,
  PencilLine,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntakeEmptyState } from "./intake-empty-state";
import type {
  EventOpportunity,
  EventSource,
  IntakeDuplicateCandidate,
  OpportunityQueueFilter,
  OpportunityStatus,
} from "./intake-types";
import {
  formatDateTime,
  getOpportunityMissingSummary,
  getOpportunityStatusLabel,
  intakeUi,
  scoreTone,
} from "./intake-utils";

const filterLabels: Record<OpportunityQueueFilter, string> = {
  active: "A traiter",
  ready: "A creer",
  needs_info: "A finaliser",
  all: "Tous",
};

const sectionDropStatus: Partial<Record<string, OpportunityStatus>> = {
  ready: "ready_to_create",
  decision: "needs_info",
  other: "spotted",
};

export function OpportunityQueue(props: {
  opportunities: EventOpportunity[];
  filter: OpportunityQueueFilter;
  counts: { active: number; ready: number; needsInfo: number };
  activeSource?: EventSource | null;
  activeSourceProgress?: {
    total: number;
    open: number;
    ready: number;
    needsInfo: number;
    duplicate: number;
    completed: number;
    progressPercent: number;
  } | null;
  activeSourceExistingEvents?: Array<{
    id: string;
    title: string;
    date: string | null;
    locationName: string | null;
  }>;
  onEditExistingEvent?: (eventId: string) => void;
  onFilterChange: (filter: OpportunityQueueFilter) => void;
  sourceById: Map<string, EventSource>;
  duplicateByOpportunityId: Map<string, IntakeDuplicateCandidate>;
  onCopyOpportunity: (opportunity: EventOpportunity) => void;
  onCreateEvent: (opportunity: EventOpportunity) => void;
  onEditOpportunity: (opportunity: EventOpportunity) => void;
  onArchiveOpportunity: (
    opportunity: EventOpportunity,
    status: Extract<OpportunityStatus, "archived" | "out_of_scope">,
  ) => void;
  onMarkDuplicate: (
    opportunity: EventOpportunity,
    duplicate?: IntakeDuplicateCandidate | null,
  ) => void;
  onStatusChange: (opportunity: EventOpportunity, status: OpportunityStatus) => void;
}) {
  const [focusActiveSource, setFocusActiveSource] = React.useState(false);
  const closedStatuses = new Set<OpportunityStatus>([
    "archived",
    "created",
    "duplicate",
    "out_of_scope",
    "published",
  ]);
  const activeSourceId = props.activeSource?.id ?? null;

  React.useEffect(() => {
    if (activeSourceId) {
      setFocusActiveSource(true);
    }
  }, [activeSourceId]);
  const visibleOpportunitiesRaw =
    focusActiveSource && activeSourceId
      ? props.opportunities.filter(
          (opportunity) => opportunity.source_id === activeSourceId,
        )
      : props.opportunities;
  const visibleOpportunities = React.useMemo(() => {
    const byId = new Map<string, EventOpportunity>();
    for (const opportunity of visibleOpportunitiesRaw) {
      byId.set(opportunity.id, opportunity);
    }
    return Array.from(byId.values());
  }, [visibleOpportunitiesRaw]);

  const activeSourceItems = activeSourceId
    ? visibleOpportunities.filter(
        (opportunity) =>
          opportunity.source_id === activeSourceId &&
          !closedStatuses.has(opportunity.status),
      )
    : [];
  const showActiveSourceSection = Boolean(activeSourceId && !focusActiveSource);
  const hasManyExistingEvents =
    (props.activeSourceExistingEvents?.length ?? 0) > 4;

  const duplicateItems = visibleOpportunities.filter((opportunity) => {
    if (closedStatuses.has(opportunity.status)) return false;
    if (!props.duplicateByOpportunityId.get(opportunity.id)) return false;
    if (!focusActiveSource && opportunity.source_id === activeSourceId) return false;
    return true;
  });
  const readyItems = visibleOpportunities.filter((opportunity) => {
    if (opportunity.status !== "ready_to_create") return false;
    if (props.duplicateByOpportunityId.get(opportunity.id)) return false;
    if (!focusActiveSource && opportunity.source_id === activeSourceId) return false;
    return true;
  });
  const needsDecisionItems = visibleOpportunities.filter((opportunity) => {
    if (!["spotted", "needs_info", "recheck"].includes(opportunity.status)) return false;
    if (props.duplicateByOpportunityId.get(opportunity.id)) return false;
    if (!focusActiveSource && opportunity.source_id === activeSourceId) return false;
    return true;
  });
  const otherItems = visibleOpportunities.filter((opportunity) => {
    if (!focusActiveSource && opportunity.source_id === activeSourceId) return false;
    return (
      !duplicateItems.includes(opportunity) &&
      !readyItems.includes(opportunity) &&
      !needsDecisionItems.includes(opportunity)
    );
  });

  const sections = [
    ...(showActiveSourceSection
      ? [{
          id: "active-source",
          step: "0",
          title: "Source active",
          tone: "border-primary/20 bg-primary/[0.03]",
          items: activeSourceItems,
        }]
      : []),
    {
      id: "ready",
      step: "1",
      title: "A creer",
      tone: "border-emerald-500/30 bg-emerald-500/[0.04]",
      items: readyItems,
    },
    {
      id: "decision",
      step: "2",
      title: "A finaliser",
      tone: "border-indigo-500/25 bg-indigo-500/[0.04]",
      items: needsDecisionItems,
    },
    {
      id: "duplicates",
      step: "3",
      title: "Doublons",
      tone: "border-amber-500/30 bg-amber-500/[0.04]",
      items: duplicateItems,
    },
    {
      id: "other",
      title: "Autres",
      tone: "border-border bg-muted/10",
      items: otherItems,
    },
  ].filter((section) => section.items.length > 0);

  return (
    <Card className={`${intakeUi.panelCard} xl:h-[calc(100dvh-12.75rem)]`}>
      <CardHeader className={intakeUi.panelHeader}>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className={intakeUi.panelTitle}>Pipeline</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <Badge variant="outline" className={intakeUi.compactBadge}>{props.counts.active}</Badge>
              <Badge variant="outline" className={intakeUi.compactBadge}>{props.counts.ready}</Badge>
              <Badge variant="outline" className={intakeUi.compactBadge}>{props.counts.needsInfo}</Badge>
            </div>
          </div>

          {props.activeSource ? (
            <div className="rounded-md border border-primary/25 bg-primary/5 px-2 py-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">
                    {props.activeSource.name}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {props.activeSourceProgress ? (
                    <Badge variant="secondary" className={intakeUi.compactBadge}>
                      {props.activeSourceProgress.open}/{props.activeSourceProgress.total}
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant={focusActiveSource ? "secondary" : "outline"}
                    className={intakeUi.controlButton}
                    onClick={() => setFocusActiveSource((current) => !current)}
                  >
                    {focusActiveSource ? (
                      <>
                        <Target className="h-3 w-3" />
                        Focus
                      </>
                    ) : (
                      <>
                        <Focus className="h-3 w-3" />
                        Focus
                      </>
                    )}
                  </Button>
                </div>
              </div>
              {props.activeSourceExistingEvents && props.activeSourceExistingEvents.length > 0 ? (
                <div className="mt-2 rounded-md border border-border/60 bg-background/80 p-1.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Evenements deja existants
                  </div>
                  <div
                    className={`space-y-1 ${
                      hasManyExistingEvents ? "max-h-44 overflow-y-auto pr-1" : ""
                    }`}
                  >
                    {props.activeSourceExistingEvents.map((existingEvent) => (
                      <div
                        key={existingEvent.id}
                        className="flex items-center justify-between gap-2 rounded-sm border border-border/50 bg-muted/20 px-1.5 py-1"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-foreground">
                            {existingEvent.title}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {formatDateTime(existingEvent.date)}
                            {existingEvent.locationName ? ` · ${existingEvent.locationName}` : ""}
                          </div>
                        </div>
                        {props.onEditExistingEvent ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={intakeUi.controlButton}
                            onClick={() => props.onEditExistingEvent?.(existingEvent.id)}
                          >
                            <PencilLine className="h-3 w-3" />
                            Editer
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1">
            {(Object.keys(filterLabels) as OpportunityQueueFilter[]).map((filter) => (
              <Button
                key={filter}
                type="button"
                size="sm"
                variant={props.filter === filter ? "secondary" : "ghost"}
                className={intakeUi.controlButton}
                onClick={() => props.onFilterChange(filter)}
              >
                {filterLabels[filter]}
                {filter === "active"
                  ? ` (${props.counts.active})`
                  : filter === "ready"
                    ? ` (${props.counts.ready})`
                    : filter === "needs_info"
                      ? ` (${props.counts.needsInfo})`
                      : ""}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className={`${intakeUi.panelBody} space-y-1.5`}>
        {visibleOpportunities.length === 0 ? (
          <IntakeEmptyState
            icon={Inbox}
            title={
              focusActiveSource
                ? "Aucune opportunite sur la source active"
                : "Aucune opportunite visible"
            }
            description={focusActiveSource ? "Desactive le focus pour revoir tout le pipeline." : "Aucun element."}
          />
        ) : (
          sections.map((section) => (
            <div
              key={section.id}
              className={`${intakeUi.sectionCard} space-y-1 ${section.tone}`}
              onDragOver={(event) => {
                if (sectionDropStatus[section.id]) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                const nextStatus = sectionDropStatus[section.id];
                if (!nextStatus) return;

                event.preventDefault();
                const opportunityId = event.dataTransfer.getData("text/plain");
                const opportunity = visibleOpportunities.find(
                  (item) => item.id === opportunityId,
                );
                if (opportunity && opportunity.status !== nextStatus) {
                  props.onStatusChange(opportunity, nextStatus);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Badge variant="secondary" className="h-4 min-w-4 justify-center rounded-full p-0 text-[9px]">
                      {section.step}
                    </Badge>
                    {section.title}
                  </div>
                </div>
                <Badge variant="secondary" className={intakeUi.compactBadge}>
                  {section.items.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {section.items
                  .slice()
                  .sort((left, right) => {
                    const leftDate = left.detected_date ? new Date(left.detected_date).getTime() : Number.POSITIVE_INFINITY;
                    const rightDate = right.detected_date ? new Date(right.detected_date).getTime() : Number.POSITIVE_INFINITY;
                    if (leftDate !== rightDate) return leftDate - rightDate;
                    return right.priority_score - left.priority_score;
                  })
                  .map((opportunity) => (
                    <OpportunityQueueRow
                      key={opportunity.id}
                      opportunity={opportunity}
                      source={
                        opportunity.source_id
                          ? props.sourceById.get(opportunity.source_id)
                          : undefined
                      }
                      duplicate={props.duplicateByOpportunityId.get(opportunity.id)}
                      onCopy={() => props.onCopyOpportunity(opportunity)}
                      onCreateEvent={() => props.onCreateEvent(opportunity)}
                      onEdit={() => props.onEditOpportunity(opportunity)}
                      onArchive={(status) =>
                        props.onArchiveOpportunity(opportunity, status)
                      }
                      onMarkDuplicate={(duplicate) =>
                        props.onMarkDuplicate(opportunity, duplicate)
                      }
                      onStatusChange={(status) =>
                        props.onStatusChange(opportunity, status)
                      }
                      isActiveSourceItem={Boolean(
                        activeSourceId && opportunity.source_id === activeSourceId,
                      )}
                    />
                  ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function OpportunityQueueRow(props: {
  opportunity: EventOpportunity;
  source?: EventSource;
  duplicate?: IntakeDuplicateCandidate;
  onCopy: () => void;
  onCreateEvent: () => void;
  onEdit: () => void;
  onArchive: (
    status: Extract<OpportunityStatus, "archived" | "out_of_scope">,
  ) => void;
  onMarkDuplicate: (duplicate?: IntakeDuplicateCandidate | null) => void;
  onStatusChange: (status: OpportunityStatus) => void;
  isActiveSourceItem?: boolean;
}) {
  const ready = props.opportunity.status === "ready_to_create";
  const closed = [
    "archived",
    "created",
    "duplicate",
    "out_of_scope",
    "published",
  ].includes(props.opportunity.status);

  const primaryAction =
    props.duplicate && !closed
      ? {
          label: "Valider doublon",
          onClick: () => props.onMarkDuplicate(props.duplicate),
          icon: AlertTriangle,
          variant: "outline" as const,
          className: "border-amber-500/40 text-amber-600",
        }
      : ready
        ? {
            label: "Creer event",
            onClick: props.onCreateEvent,
            icon: CircleCheckBig,
            variant: "default" as const,
            className: "",
          }
        : {
            label: "Envoyer a creation",
            onClick: () => props.onStatusChange("ready_to_create"),
            icon: ArrowRight,
            variant: "secondary" as const,
            className: "",
          };
  const PrimaryIcon = primaryAction.icon;

  return (
    <div
      draggable={!closed}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", props.opportunity.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-md border bg-background p-1.5 ${
        props.isActiveSourceItem
          ? "border-primary/40 bg-primary/[0.05] shadow-sm"
          : ready
            ? "border-emerald-500/30 bg-emerald-500/[0.03]"
            : "border-border"
      } ${!closed ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-[13px] font-semibold leading-snug">
            {props.opportunity.raw_title}
          </h3>
          {!closed ? (
            <Button
              type="button"
              size="sm"
              variant={primaryAction.variant}
              className={`${intakeUi.controlButton} gap-1 ${primaryAction.className}`}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
              <PrimaryIcon className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
            <Badge
              variant={ready ? "default" : "secondary"}
              className={intakeUi.compactBadge}
            >
              {getOpportunityStatusLabel(props.opportunity.status)}
            </Badge>
            <Badge
              variant="outline"
              className={`${intakeUi.compactBadge} ${scoreTone(props.opportunity.priority_score)}`}
            >
              P{props.opportunity.priority_score}
            </Badge>
          </div>
        <div className="space-y-0">
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {props.opportunity.detected_location || "Lieu inconnu"} ·{" "}
            {formatDateTime(props.opportunity.detected_date)}
          </p>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {getOpportunityMissingSummary(props.opportunity)}
          </p>
          {props.duplicate ? (
            <p className="line-clamp-1 text-xs font-medium text-amber-600">
              Proche de: {props.duplicate.title}
              {props.duplicate.date ? ` · ${formatDateTime(props.duplicate.date)}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={`${intakeUi.controlButton} gap-1`}
            onClick={props.onEdit}
          >
            <PencilLine className="h-3.5 w-3.5" />
            Editer
          </Button>
          {props.opportunity.source_url ? (
            <Button asChild type="button" size="sm" variant="ghost" className={`${intakeUi.controlButton} gap-1`}>
              <a href={props.opportunity.source_url} rel="noreferrer" target="_blank">
                <ExternalLink className="h-3.5 w-3.5" />
                Ouvrir
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={`${intakeUi.controlButton} gap-1`}
            onClick={props.onCopy}
          >
            <Copy className="h-3.5 w-3.5" />
            Copier
          </Button>
          {!closed ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`${intakeUi.controlButton} text-amber-600 hover:text-amber-700`}
                onClick={() => props.onArchive("out_of_scope")}
              >
                Hors scope
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`${intakeUi.controlButton} text-muted-foreground`}
                onClick={() => props.onArchive("archived")}
              >
                Archiver
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
