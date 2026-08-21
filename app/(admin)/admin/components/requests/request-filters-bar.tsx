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
    <div className="sticky top-14 z-10 border-b border-border/60 bg-background/95 pb-3 pt-1 backdrop-blur md:top-16">
      <div className="space-y-3 rounded-xl border border-border/70 bg-background/90 px-3 py-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {queueStats.map((stat) => {
            const active = activeTab === "queue" && queueFilter === stat.id;

            return (
              <button
                key={stat.id}
                type="button"
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10"
                    : "border-border/70 bg-card/60 hover:bg-accent/50",
                )}
                onClick={() => {
                  onTabChange("queue");
                  onQueueFilterChange(stat.id);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </span>
                  <span className="text-xl font-semibold tracking-tight">
                    {stat.count}
                  </span>
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {stat.hint}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                activeTab === tab.id
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0 text-[11px] text-muted-foreground">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_160px_150px_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Rechercher une demande"
              className="h-9 pl-9"
            />
          </div>

          <Select
            value={typeFilter}
            onValueChange={(value) =>
              onTypeFilterChange(value as AdminRequestTypeFilter)
            }
          >
            <SelectTrigger className="h-9">
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
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les dates</SelectItem>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7 jours</SelectItem>
              <SelectItem value="30d">30 jours</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center justify-center rounded-md border border-border/70 px-3 text-xs font-medium text-muted-foreground">
            {actionableCount} actionnable{actionableCount > 1 ? "s" : ""}
          </div>

          <div className="flex items-center justify-end gap-2">
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-2.5"
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9"
              onClick={onRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Rafraîchir
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 px-2.5"
              onClick={onShowShortcuts}
            >
              <Keyboard className="mr-2 h-4 w-4" />
              Raccourcis
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
