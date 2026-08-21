"use client";

import * as React from "react";
import { Building2, CheckCircle2, Search, UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IntakeEmptyState } from "./intake-empty-state";
import type { EventSource, SourceQueueFilter } from "./intake-types";
import {
  formatDateOnly,
  getEntityImageUrl,
  getEntityInitials,
  getPriorityLabel,
  getSourcePrimaryEntity,
  getSourceStatusLabel,
  intakeUi,
  isSourceDue,
  isSourceLate,
} from "./intake-utils";

const filterLabels: Record<SourceQueueFilter, string> = {
  due: "A traiter",
  priority: "P0/P1",
  late: "Retard",
  active: "Actives",
  all: "Toutes",
};

export function SourceQueue(props: {
  sources: EventSource[];
  activeSourceId: string | null;
  sourceFilter: SourceQueueFilter;
  recentlyScannedSourceIds: string[];
  onFilterChange: (filter: SourceQueueFilter) => void;
  onSelectSource: (source: EventSource) => void;
  onOpenSource?: (source: EventSource) => void;
  onEditSource?: (source: EventSource) => void;
  onEditLinkedEntity?: (source: EventSource) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [contextMenu, setContextMenu] = React.useState<{
    source: EventSource;
    x: number;
    y: number;
  } | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSources = React.useMemo(() => {
    if (!normalizedQuery) return props.sources;
    return props.sources.filter((source) => {
      const primaryEntity = getSourcePrimaryEntity(source);
      return [
        source.name,
        source.url,
        source.city_hint,
        source.category_hint,
        primaryEntity?.entity.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [normalizedQuery, props.sources]);

  const sections = React.useMemo(() => {
    return [
      {
        id: "owner",
        title: "Synchronisees",
        items: visibleSources.filter((source) => source.source_scope === "owner"),
      },
      {
        id: "global",
        title: "Globales",
        items: visibleSources.filter((source) => source.source_scope === "global"),
      },
    ].filter((section) => section.items.length > 0);
  }, [visibleSources]);
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;

  React.useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-intake-source-context-menu='true']")) return;
      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleCopyUrl = React.useCallback(async (source: EventSource) => {
    if (!source.url) return;
    await navigator.clipboard.writeText(source.url);
  }, []);

  return (
    <Card className={`${intakeUi.panelCard} xl:h-[calc(100dvh-12.75rem)]`}>
      <CardHeader className={intakeUi.panelHeader}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className={intakeUi.panelTitle}>Navigation sources</CardTitle>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className={`${intakeUi.controlButton} pl-7 text-sm`}
              placeholder="Rechercher source, lieu, ville..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(filterLabels) as SourceQueueFilter[]).map((filter) => {
              const active = props.sourceFilter === filter;
              return (
                <Button
                  key={filter}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  className={`${intakeUi.controlButton} ${
                    active
                      ? "border border-primary bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40"
                      : "border border-transparent hover:border-primary/30"
                  }`}
                  onClick={() => props.onFilterChange(filter)}
                >
                  {filterLabels[filter]}
                </Button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className={`${intakeUi.panelBody} space-y-3`}>
        {visibleSources.length === 0 ? (
          <IntakeEmptyState
            icon={CheckCircle2}
            title="Aucune source dans cette vue"
            description="Aucun resultat."
          />
        ) : (
          sections.map((section) => (
            <div key={section.id} className={`${intakeUi.sectionCard} space-y-1.5`}>
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </div>

              <div className="space-y-1">
                {section.items.map((source) => (
                  <SourceQueueRow
                    key={source.id}
                    source={source}
                    active={props.activeSourceId === source.id}
                    recentlyScanned={props.recentlyScannedSourceIds.includes(source.id)}
                    onSelectSource={() => props.onSelectSource(source)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({
                        source,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {contextMenu ? (
        <div
          data-intake-source-context-menu="true"
          className="fixed z-50 min-w-[220px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            left: `${Math.max(8, Math.min(contextMenu.x, viewportWidth - 240))}px`,
            top: `${Math.max(8, Math.min(contextMenu.y, viewportHeight - 260))}px`,
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              props.onSelectSource(contextMenu.source);
              setContextMenu(null);
            }}
          >
            Ouvrir dans le cockpit
          </button>
          {props.onOpenSource ? (
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                props.onOpenSource?.(contextMenu.source);
                setContextMenu(null);
              }}
            >
              Ouvrir la source
            </button>
          ) : null}
          {props.onEditSource ? (
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                props.onEditSource?.(contextMenu.source);
                setContextMenu(null);
              }}
            >
              Editer la source
            </button>
          ) : null}
          {props.onEditLinkedEntity &&
          (contextMenu.source.organizer_id || contextMenu.source.organizer_location_id) ? (
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                props.onEditLinkedEntity?.(contextMenu.source);
                setContextMenu(null);
              }}
            >
              {contextMenu.source.organizer_id ? "Editer organisateur" : "Editer lieu organisateur"}
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              void handleCopyUrl(contextMenu.source);
              setContextMenu(null);
            }}
          >
            Copier l'URL
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function getSourceWorkState(args: {
  source: EventSource;
  active: boolean;
  recentlyScanned: boolean;
  needsLink: boolean;
  late: boolean;
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
      helper: "Lier avant scan",
    };
  }

  if (args.active) {
    return {
      label: "En cours",
      tone: "border-primary/50 text-primary",
      helper: "Dans le cockpit",
    };
  }

  if (args.recentlyScanned) {
    return {
      label: "Scannee",
      tone: "border-emerald-500/40 text-emerald-600",
      helper: "Recente",
    };
  }

  if (args.late) {
    return {
      label: "En retard",
      tone: "border-destructive/40 text-destructive",
      helper: "Prioritaire",
    };
  }

  if (isSourceDue(args.source)) {
    return {
      label: "A scanner",
      tone: "border-primary/40 text-primary",
      helper: "Maintenant",
    };
  }

  return {
    label: "Planifiee",
    tone: "border-border text-muted-foreground",
    helper: "Plus tard",
  };
}

function SourceQueueRow(props: {
  source: EventSource;
  active: boolean;
  recentlyScanned: boolean;
  onSelectSource: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const primaryEntity = getSourcePrimaryEntity(props.source);
  const primaryImageUrl = getEntityImageUrl(primaryEntity?.entity);
  const late = isSourceLate(props.source);
  const needsLink = props.source.source_scope !== "global" && !primaryEntity;
  const workState = getSourceWorkState({
    source: props.source,
    active: props.active,
    recentlyScanned: props.recentlyScanned,
    needsLink,
    late,
  });
  const activationLabel = `Charger le cockpit ${props.source.name}`;

  function handleCardActivation() {
    props.onSelectSource();
  }

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    handleCardActivation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={activationLabel}
      aria-disabled={false}
      onClick={handleCardActivation}
      onKeyDown={handleCardKeyDown}
      onContextMenu={props.onContextMenu}
      className={`cursor-pointer rounded-xl border px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
        props.active
          ? "border-primary bg-primary/10 shadow-sm"
          : props.recentlyScanned
            ? "border-emerald-500/40 bg-emerald-500/5"
            : needsLink
              ? "border-amber-500/30 bg-amber-500/5"
              : props.source.status !== "active"
                ? "border-muted-foreground/20 bg-muted/15 opacity-80"
                : late
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border bg-background"
      } hover:border-primary/40 hover:bg-muted/20`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Avatar className="mt-0.5 h-8 w-8 rounded-lg border border-border">
            {primaryImageUrl ? <AvatarImage src={primaryImageUrl} alt={props.source.name} /> : null}
            <AvatarFallback className="rounded-lg text-[10px] font-semibold text-muted-foreground">
              {primaryEntity ? getEntityInitials(primaryEntity.entity.name) : "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {props.source.name}
                {props.source.city_hint ? ` - ${props.source.city_hint}` : ""}
              </h3>
              <Badge
                variant={props.source.priority === "p0" ? "destructive" : "secondary"}
                className={intakeUi.compactBadge}
              >
                {getPriorityLabel(props.source.priority)}
              </Badge>
              <Badge variant="outline" className={`${intakeUi.compactBadge} ${workState.tone}`}>
                {workState.label}
              </Badge>
              <Badge variant="outline" className={intakeUi.compactBadge}>
                {props.source.source_scope === "owner" ? "Sync" : "Globale"}
              </Badge>
            </div>
            <div className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 leading-tight ${intakeUi.subtleMeta}`}>
              <span>{formatDateOnly(props.source.next_scan_at)}</span>
              {primaryEntity ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  {props.source.organizer || props.source.organizer_location ? (
                    <UserRound className="h-3 w-3" />
                  ) : (
                    <Building2 className="h-3 w-3" />
                  )}
                  <span className="max-w-[180px] truncate">{primaryEntity.entity.name}</span>
                </span>
              ) : props.source.source_scope === "global" ? (
                <span>Source globale</span>
              ) : (
                <span className="font-medium text-amber-600">A lier</span>
              )}
            </div>
          </div>
        </div>

        {props.active ? (
          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
            Actif
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
