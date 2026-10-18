"use client";

import * as React from "react";
import { Keyboard, RefreshCw, Search } from "lucide-react";

import type {
  AdminRequestLane,
  AdminRequestPeriodFilter,
  AdminRequestQueueFilter,
  AdminRequestTypeFilter,
  AdminRequestWorkspaceTab,
} from "@/lib/admin-requests";
import { getRequestTypeLabel } from "@/lib/admin-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type QueueStat = {
  id: AdminRequestQueueFilter;
  label: string;
  count: number;
  hint: string;
};

type RequestTab = {
  id: AdminRequestWorkspaceTab;
  label: string;
  count: number;
};

export function RequestFiltersBar({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  periodFilter,
  onPeriodFilterChange,
  activeTab,
  onTabChange,
  queueFilter,
  onQueueFilterChange,
  counts,
  actionableCount,
  refreshing,
  onRefresh,
  onShowShortcuts,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  typeFilter: AdminRequestTypeFilter;
  onTypeFilterChange: (value: AdminRequestTypeFilter) => void;
  periodFilter: AdminRequestPeriodFilter;
  onPeriodFilterChange: (value: AdminRequestPeriodFilter) => void;
  activeTab: AdminRequestWorkspaceTab;
  onTabChange: (tab: AdminRequestWorkspaceTab) => void;
  queueFilter: AdminRequestQueueFilter;
  onQueueFilterChange: (value: AdminRequestQueueFilter) => void;
  counts: Record<AdminRequestLane, number>;
  actionableCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onShowShortcuts: () => void;
}) {
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    typeFilter !== "all" ||
    periodFilter !== "all" ||
    queueFilter !== "all";

  const queueStats: QueueStat[] = [
    {
      id: "all",
      label: "Actionnables",
      count: actionableCount,
      hint: "Toutes les demandes à traiter",
    },
    {
      id: "ready",
      label: "Prêtes",
      count: counts.ready,
      hint: "Conversion rapide",
    },
    {
      id: "to_complete",
      label: "À compléter",
      count: counts.to_process,
      hint: "Infos manquantes",
    },
    {
      id: "from_url",
      label: "Depuis URL",
      count: counts.from_url,
      hint: "Source à relire",
    },
  ];

  const tabs: RequestTab[] = [
    { id: "queue", label: "À traiter", count: actionableCount },
    { id: "blocked", label: "Bloquées", count: counts.blocked },
    { id: "processed", label: "Traitées", count: counts.processed },
  ];

  return (
    <div className="sticky top-12 z-20 -mx-4 bg-background/90 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-3 rounded-xl border border-border bg-card px-3 py-3 shadow-xs">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {queueStats.map((stat) => {
            const active = activeTab === "queue" && queueFilter === stat.id;

            return (
              <button
                key={stat.id}
                type="button"
                aria-pressed={active}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left outline-none transition-[border-color,background-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  active
                    ? "border-foreground/40 bg-background shadow-xs dark:bg-input/30"
                    : "border-border bg-muted/30 hover:bg-muted/60",
                )}
                onClick={() => {
                  onTabChange("queue");
                  onQueueFilterChange(stat.id);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
                    {stat.label}
                  </span>
                  <span className="text-lg font-semibold tracking-tight tabular-nums">
                    {stat.count}
                  </span>
                </div>
                <div className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">
                  {stat.hint}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            aria-label="Vue"
            size="sm"
            value={activeTab}
            onValueChange={onTabChange}
            items={tabs.map((tab) => ({ value: tab.id, label: tab.label, count: tab.count }))}
          />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={onShowShortcuts}
            >
              <Keyboard />
              <span className="hidden sm:inline">Raccourcis</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn(refreshing && "animate-spin")} />
              Rafraîchir
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 md:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Rechercher une demande…"
              className="pl-9"
            />
          </div>

          <div className="flex gap-2 md:shrink-0">
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                onTypeFilterChange(value as AdminRequestTypeFilter)
              }
            >
              <SelectTrigger className="flex-1 md:w-44 md:flex-none" aria-label="Type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="event_creation">
                  {getRequestTypeLabel("event_creation")}
                </SelectItem>
                <SelectItem value="event_from_url">
                  {getRequestTypeLabel("event_from_url")}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={periodFilter}
              onValueChange={(value) =>
                onPeriodFilterChange(value as AdminRequestPeriodFilter)
              }
            >
              <SelectTrigger className="flex-1 md:w-40 md:flex-none" aria-label="Période">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les dates</SelectItem>
                <SelectItem value="24h">24h</SelectItem>
                <SelectItem value="7d">7 jours</SelectItem>
                <SelectItem value="30d">30 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground md:self-auto"
              onClick={() => {
                onSearchChange("");
                onTypeFilterChange("all");
                onPeriodFilterChange("all");
                onQueueFilterChange("all");
              }}
            >
              Réinitialiser
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
