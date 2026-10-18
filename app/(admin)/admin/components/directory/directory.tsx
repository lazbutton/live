"use client";

import * as React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowDown, ArrowUp, ChevronsUpDown, MoreHorizontal, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TableHead } from "@/components/ui/table";
import type { UpcomingEventStats } from "./use-upcoming-events";

/* ------------------------------------------------------------------ */
/* En-tête de page annuaire                                            */
/* ------------------------------------------------------------------ */

export function DirectoryHeader({
  title,
  meta = [],
  actions,
}: {
  title: string;
  /** Chiffres clés affichés sous le titre, séparés par « · ». */
  meta?: React.ReactNode[];
  actions?: React.ReactNode;
}) {
  const items = meta.filter((item) => item !== null && item !== undefined && item !== false);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-[1_1_18rem] space-y-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {items.length > 0 ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            {items.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 ? <span aria-hidden>·</span> : null}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segments (filtres rapides avec compteurs)                           */
/* ------------------------------------------------------------------ */

export type DirectorySegment<T extends string> = {
  value: T;
  label: string;
  count?: number;
  /** Met le compteur en avant (ex. éléments à compléter). */
  attention?: boolean;
};

export function DirectorySegments<T extends string>({
  items,
  value,
  onValueChange,
  className,
}: {
  items: Array<DirectorySegment<T>>;
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtres rapides"
      className={cn(
        "-mb-px flex items-center gap-5 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-0.5 text-sm font-medium outline-none transition-colors focus-visible:text-foreground",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {item.count != null ? (
              <span
                className={cn(
                  "rounded-md px-1.5 text-[11px] font-medium tabular-nums",
                  item.attention && item.count > 0
                    ? "bg-warning/12 text-warning"
                    : active
                      ? "bg-muted text-foreground"
                      : "bg-muted/70 text-muted-foreground",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

export function DirectorySearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
        aria-label={placeholder}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Effacer la recherche"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar d'entité (image ou initiales)                                 */
/* ------------------------------------------------------------------ */

export function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function EntityAvatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9 shrink-0 rounded-md border border-border", className)}>
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback className="rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/* ------------------------------------------------------------------ */
/* Affichage mémorisé (tableau / grille)                                */
/* ------------------------------------------------------------------ */

export type DirectoryView = "list" | "grid";

/** Vue tableau/grille mémorisée par page dans le navigateur. */
export function useDirectoryView(storageKey: string, initial: DirectoryView = "list") {
  const [view, setViewState] = React.useState<DirectoryView>(initial);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "list" || saved === "grid") setViewState(saved);
    } catch {
      // Stockage indisponible : vue par défaut.
    }
  }, [storageKey]);

  const setView = React.useCallback(
    (next: DirectoryView) => {
      setViewState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Stockage indisponible : le choix vaut pour la session uniquement.
      }
    },
    [storageKey],
  );

  return [view, setView] as const;
}

/* ------------------------------------------------------------------ */
/* Tri des colonnes                                                    */
/* ------------------------------------------------------------------ */

export type SortDirection = "asc" | "desc";

export function useSortState<K extends string>(initialKey: K, initialDirection: SortDirection = "asc") {
  const [sortKey, setSortKey] = React.useState<K>(initialKey);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(initialDirection);

  const toggleSort = React.useCallback(
    (key: K, defaultDirection: SortDirection = "asc") => {
      if (key === sortKey) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDirection(defaultDirection);
      }
    },
    [sortKey],
  );

  return { sortKey, sortDirection, toggleSort };
}

/** Date courte (« 3 oct. 2026 »), ou « — » si absente. */
export function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function compareText(a?: string | null, b?: string | null) {
  return (a || "").localeCompare(b || "", "fr", { sensitivity: "base", numeric: true });
}

export function SortableHead({
  label,
  active,
  direction,
  onSort,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3", !active && "opacity-50")} />
      </button>
    </TableHead>
  );
}

/* ------------------------------------------------------------------ */
/* Sélection multiple                                                  */
/* ------------------------------------------------------------------ */

export function SelectAllCheckbox({
  total,
  selected,
  onToggle,
}: {
  total: number;
  selected: number;
  onToggle: (checked: boolean) => void;
}) {
  const state = selected === 0 ? false : selected === total ? true : "indeterminate";
  return (
    <Checkbox
      checked={state}
      onCheckedChange={(checked) => onToggle(checked === true)}
      aria-label="Tout sélectionner"
      disabled={total === 0}
    />
  );
}

/** Barre d'actions flottante affichée quand des lignes sont sélectionnées. */
export function SelectionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6">
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-popover p-1.5 pl-3 text-popover-foreground shadow-xl animate-in fade-in-0 slide-in-from-bottom-2">
        <span className="mr-1 whitespace-nowrap text-sm font-medium tabular-nums">
          {count} sélectionné{count > 1 ? "s" : ""}
        </span>
        <div className="mx-1 h-5 w-px bg-border" />
        {children}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          onClick={onClear}
          aria-label="Annuler la sélection"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Menu d'actions de ligne                                             */
/* ------------------------------------------------------------------ */

export function RowActionsMenu({
  label = "Actions",
  children,
  align = "end",
}: {
  label?: string;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52" onClick={(event) => event.stopPropagation()}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Indicateurs de complétude                                            */
/* ------------------------------------------------------------------ */

/** Liste compacte des informations manquantes (« Sans image · Sans description »). */
export function MissingHints({ items }: { items: Array<string | false | null | undefined> }) {
  const missing = items.filter(Boolean) as string[];
  if (missing.length === 0) {
    return <span className="text-xs text-muted-foreground/70">Complet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-warning">
      <span className="size-1.5 shrink-0 rounded-full bg-warning" />
      <span className="truncate">{missing.join(" · ")}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Liens publics (site, réseaux…)                                      */
/* ------------------------------------------------------------------ */

export type EntityLink = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

/** Icônes cliquables vers les liens publics d'une fiche. */
export function EntityLinkIcons({ links, className }: { links: EntityLink[]; className?: string }) {
  if (links.length === 0) {
    return <span className="text-xs text-muted-foreground/70">Aucun lien</span>;
  }
  return (
    <div className={cn("-ml-1.5 flex items-center gap-0.5", className)}>
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            title={link.label}
            aria-label={link.label}
            onClick={(event) => event.stopPropagation()}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <Icon className="h-3.5 w-3.5" />
          </a>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Événements à venir                                                  */
/* ------------------------------------------------------------------ */

/** Nombre d'événements à venir et date du prochain (« 3 · 24 oct. »). */
export function UpcomingEventsCell({
  stats,
  loading,
}: {
  stats?: UpcomingEventStats;
  loading?: boolean;
}) {
  if (loading) return <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted align-middle" />;
  if (!stats || stats.count === 0) return <span className="text-xs text-muted-foreground/70">—</span>;
  return (
    <span className="whitespace-nowrap text-sm tabular-nums">
      {stats.count}
      {stats.next ? (
        <span className="text-xs text-muted-foreground">
          {" · "}
          {format(stats.next, "d MMM", { locale: fr })}
        </span>
      ) : null}
    </span>
  );
}

/** Conteneur de tableau bordé, cohérent sur toutes les pages annuaire. */
export function DirectoryTableCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("@container overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}>
      {children}
    </div>
  );
}
