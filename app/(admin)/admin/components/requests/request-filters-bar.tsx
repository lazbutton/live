"use client";

import * as React from "react";
import { RefreshCw, Search } from "lucide-react";

import type {
  AdminRequestLane,
  AdminRequestPeriodFilter,
  AdminRequestTypeFilter,
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
import { LaneCountPill } from "./request-ui";

export function RequestFiltersBar({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  periodFilter,
  onPeriodFilterChange,
  activeLane,
  onLaneChange,
  counts,
  actionableCount,
  refreshing,
  onRefresh,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  typeFilter: AdminRequestTypeFilter;
  onTypeFilterChange: (value: AdminRequestTypeFilter) => void;
  periodFilter: AdminRequestPeriodFilter;
  onPeriodFilterChange: (value: AdminRequestPeriodFilter) => void;
  activeLane: AdminRequestLane;
  onLaneChange: (lane: AdminRequestLane) => void;
  counts: Record<AdminRequestLane, number>;
  actionableCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const hasActiveFilters =
    searchQuery.trim().length > 0 || typeFilter !== "all" || periodFilter !== "all";

  const primaryLanes: AdminRequestLane[] = ["ready", "to_process", "from_url"];
  const secondaryLanes: AdminRequestLane[] = ["blocked", "processed"];

  return (
    <div className="sticky top-14 z-10 border-b border-border/60 bg-background/95 pb-3 pt-1 backdrop-blur md:top-16">
      <div className="space-y-2 rounded-xl border border-border/70 bg-background/90 px-3 py-3 shadow-sm">
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
            onValueChange={(value) => onTypeFilterChange(value as AdminRequestTypeFilter)}
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
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {primaryLanes.map((lane) => (
            <button key={lane} type="button" onClick={() => onLaneChange(lane)}>
              <LaneCountPill lane={lane} count={counts[lane]} active={lane === activeLane} />
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-border/70" />
          {secondaryLanes.map((lane) => (
            <button key={lane} type="button" onClick={() => onLaneChange(lane)}>
              <LaneCountPill
                lane={lane}
                count={counts[lane]}
                active={lane === activeLane}
                subtle
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
