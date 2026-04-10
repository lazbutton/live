"use client";

import * as React from "react";
import {
  Download,
  Image as ImageIcon,
  List as ListIcon,
  Link2,
  CalendarDays,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";

export type EventFiltersBarProps = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterStatus: "all" | "pending" | "approved";
  onFilterStatusChange: (s: "all" | "pending" | "approved") => void;
  hideLongEvents: boolean;
  onHideLongEventsChange: (value: boolean) => void;
  pendingCount: number;
  onCreateClick: () => void;
  onImportFromImageClick: () => void;
  onImportFromUrlClick: () => void;
  onImportFromFacebookClick: () => void;
  viewMode: "calendar" | "list";
  onViewModeChange: (mode: "calendar" | "list") => void;
  organizerFilterOptions: Array<{ value: string; label: string }>;
  selectedOrganizerIds: string[];
  onOrganizerFilterChange: (ids: string[]) => void;
  onResetFilters: () => void;
  className?: string;
};

function ToggleRow({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: string; label: React.ReactNode }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <Button
            key={it.value}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            className={cn("h-9", !active && "bg-background")}
            onClick={() => onChange(it.value)}
          >
            {it.label}
          </Button>
        );
      })}
    </div>
  );
}

export function EventFiltersBar({
  searchQuery,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  hideLongEvents,
  onHideLongEventsChange,
  pendingCount,
  onCreateClick,
  onImportFromImageClick,
  onImportFromUrlClick,
  onImportFromFacebookClick,
  viewMode,
  onViewModeChange,
  organizerFilterOptions,
  selectedOrganizerIds,
  onOrganizerFilterChange,
  onResetFilters,
  className,
}: EventFiltersBarProps) {
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterStatus !== "all" ||
    hideLongEvents ||
    selectedOrganizerIds.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un événement..."
            className="pl-9 h-11"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={onCreateClick}
            className="h-11 gap-2 flex-1 md:flex-none"
          >
            <Plus className="h-4 w-4" />
            Créer
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onImportFromImageClick}
            className="h-11 gap-2 flex-1 md:flex-none"
          >
            <ImageIcon className="h-4 w-4" />
            Créer à partir d’une image
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onImportFromUrlClick}
            className="h-11 gap-2 flex-1 md:flex-none"
          >
            <Link2 className="h-4 w-4" />
            Créer à partir de l’URL
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onImportFromFacebookClick}
            className="h-11 gap-2 flex-1 md:flex-none"
          >
            <Download className="h-4 w-4" />
            Importer depuis Facebook
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ToggleRow
          value={filterStatus}
          onChange={(v) => onFilterStatusChange(v as any)}
          items={[
            { value: "all", label: "Tous" },
            {
              value: "pending",
              label: (
                <>En attente {pendingCount > 0 ? `(${pendingCount})` : ""}</>
              ),
            },
            { value: "approved", label: "Approuvés" },
          ]}
        />

        <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
          <Switch
            id="hide-long-events"
            checked={hideLongEvents}
            onCheckedChange={onHideLongEventsChange}
          />
          <Label htmlFor="hide-long-events" className="cursor-pointer text-sm">
            Masquer les événements &gt; 24h
          </Label>
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "calendar" ? "default" : "ghost"}
            className="h-8 px-3"
            onClick={() => onViewModeChange("calendar")}
          >
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Agenda
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "list" ? "default" : "ghost"}
            className="h-8 px-3"
            onClick={() => onViewModeChange("list")}
          >
            <ListIcon className="h-4 w-4 mr-1.5" />
            Liste
          </Button>
        </div>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3"
            onClick={onResetFilters}
          >
            Réinitialiser les filtres
          </Button>
        ) : null}
      </div>

      {viewMode === "list" ? (
        <div className="rounded-lg border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label className="text-sm">Organisateurs</Label>
            {selectedOrganizerIds.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {selectedOrganizerIds.length} sélectionné
                {selectedOrganizerIds.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <MultiSelect
            options={organizerFilterOptions}
            selected={selectedOrganizerIds}
            onChange={onOrganizerFilterChange}
            placeholder="Filtrer par organisateur..."
            searchPlaceholder="Rechercher un organisateur..."
            className="min-h-[44px]"
          />
        </div>
      ) : null}
    </div>
  );
}
