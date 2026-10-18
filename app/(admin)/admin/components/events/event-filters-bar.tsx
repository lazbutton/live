"use client";

import * as React from "react";
import { CalendarDays, List as ListIcon, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SelectSearchable } from "@/components/ui/select-searchable";
import type { CategoryOption, LocationData } from "./types";

export type EventFiltersBarProps = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterStatus: "all" | "pending" | "approved";
  onFilterStatusChange: (s: "all" | "pending" | "approved") => void;
  filterCategory: "all" | "__none__" | string;
  onFilterCategoryChange: (value: "all" | "__none__" | string) => void;
  categories: CategoryOption[];
  hideLongEvents: boolean;
  onHideLongEventsChange: (value: boolean) => void;
  filterAppVisibility: "all" | "app" | "off_app";
  onFilterAppVisibilityChange: (value: "all" | "app" | "off_app") => void;
  filterLocation: string;
  onFilterLocationChange: (value: string) => void;
  locations: LocationData[];
  agentEventsOnly: boolean;
  onAgentEventsOnlyChange: (value: boolean) => void;
  pendingCount: number;
  viewMode: "calendar" | "list";
  onViewModeChange: (mode: "calendar" | "list") => void;
  onResetFilters: () => void;
  className?: string;
};

export function EventFiltersBar({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  filterCategory,
  onFilterCategoryChange,
  categories,
  hideLongEvents,
  onHideLongEventsChange,
  filterAppVisibility,
  onFilterAppVisibilityChange,
  filterLocation,
  onFilterLocationChange,
  locations,
  agentEventsOnly,
  onAgentEventsOnlyChange,
  pendingCount,
  viewMode,
  onViewModeChange,
  onResetFilters,
  className,
}: EventFiltersBarProps) {
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterStatus !== "all" ||
    filterCategory !== "all" ||
    hideLongEvents ||
    filterAppVisibility !== "all" ||
    filterLocation !== "all" ||
    agentEventsOnly;
  const secondaryFilterCount =
    (filterLocation !== "all" ? 1 : 0) +
    (filterCategory !== "all" ? 1 : 0) +
    (filterAppVisibility !== "all" ? 1 : 0) +
    (hideLongEvents ? 1 : 0) +
    (agentEventsOnly ? 1 : 0);
  // Sur mobile, les filtres secondaires sont repliés derrière « Filtres ».
  const [showSecondaryFilters, setShowSecondaryFilters] = React.useState(false);
  const locationOptions = React.useMemo(
    () => [
      { value: "all", label: "Tous les lieux" },
      ...[...locations]
        .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
        .map((location) => ({ value: location.id, label: location.name })),
    ],
    [locations],
  );

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un événement…"
            className="pl-9"
          />
        </div>
        <SegmentedControl
          aria-label="Affichage"
          className="ml-auto"
          value={viewMode}
          onValueChange={onViewModeChange}
          items={[
            { value: "list", label: <span className="max-sm:sr-only">Liste</span>, icon: <ListIcon />, title: "Liste" },
            { value: "calendar", label: <span className="max-sm:sr-only">Agenda</span>, icon: <CalendarDays />, title: "Agenda" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          aria-label="Statut"
          value={filterStatus}
          onValueChange={onFilterStatusChange}
          items={[
            { value: "all", label: "Tous" },
            { value: "pending", label: "En attente", count: pendingCount },
            { value: "approved", label: "Approuvés" },
          ]}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="md:hidden"
          aria-expanded={showSecondaryFilters}
          onClick={() => setShowSecondaryFilters((current) => !current)}
        >
          <SlidersHorizontal />
          Filtres
          {secondaryFilterCount > 0 ? (
            <span className="rounded bg-muted px-1 text-[11px] tabular-nums">{secondaryFilterCount}</span>
          ) : null}
        </Button>

        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            !showSecondaryFilters && "max-md:hidden",
          )}
        >
        <SelectSearchable
          options={locationOptions}
          value={filterLocation}
          onValueChange={(value) => onFilterLocationChange(value || "all")}
          placeholder="Tous les lieux"
          searchPlaceholder="Rechercher un lieu…"
          className="w-auto min-w-[150px] max-w-[220px]"
        />

        <Select
          value={filterCategory}
          onValueChange={(value) =>
            onFilterCategoryChange(value as "all" | "__none__" | string)
          }
        >
          <SelectTrigger className="w-auto min-w-[150px]" aria-label="Catégorie">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            <SelectItem value="__none__">Sans catégorie</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterAppVisibility}
          onValueChange={(value) =>
            onFilterAppVisibilityChange(value as "all" | "app" | "off_app")
          }
        >
          <SelectTrigger className="w-auto min-w-[140px]" aria-label="Visibilité">
            <SelectValue placeholder="Visibilité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes visibilités</SelectItem>
            <SelectItem value="app">Dans l’app</SelectItem>
            <SelectItem value="off_app">Hors app</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 shadow-xs max-md:h-10 dark:bg-input/25">
          <Switch
            id="agent-events-only"
            checked={agentEventsOnly}
            onCheckedChange={onAgentEventsOnlyChange}
          />
          <Label htmlFor="agent-events-only" className="cursor-pointer whitespace-nowrap text-[13px] font-normal">
            Créés par l’agent
          </Label>
        </div>

        <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 shadow-xs max-md:h-10 dark:bg-input/25">
          <Switch
            id="hide-long-events"
            checked={hideLongEvents}
            onCheckedChange={onHideLongEventsChange}
          />
          <Label htmlFor="hide-long-events" className="cursor-pointer whitespace-nowrap text-[13px] font-normal">
            Masquer &gt; 24h
          </Label>
        </div>
        </div>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onResetFilters}
          >
            <X />
            Réinitialiser
          </Button>
        ) : null}
      </div>

    </div>
  );
}
