"use client";

import * as React from "react";
import { Download, Link2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  onImportFromUrlClick: () => void;
  onImportFromFacebookClick: () => void;
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
  onImportFromUrlClick,
  onImportFromFacebookClick,
  className,
}: EventFiltersBarProps) {
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
          <Button type="button" onClick={onCreateClick} className="h-11 gap-2 flex-1 md:flex-none">
            <Plus className="h-4 w-4" />
            Créer
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
            { value: "pending", label: <>En attente {pendingCount > 0 ? `(${pendingCount})` : ""}</> },
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
      </div>
    </div>
  );
}

