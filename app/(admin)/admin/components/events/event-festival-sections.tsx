"use client";

/**
 * Festivals dans le formulaire d'un événement (../live/docs/fonctionnalites/festivals.md, « Données et code ») : les
 * lieux d'un festival, son programme (avec les suggestions), et le festival dont un événement fait partie. Rien
 * n'est écrit ici : le formulaire enregistre tout avec la fiche.
 */

import * as React from "react";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowDown, ArrowUp, Loader2, MapPin, Plus, Search, Sparkles, TriangleAlert, X } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import {
  festivalCovers,
  festivalSpan,
  formatFestivalDates,
  programmeWarnings,
  suggestProgramme,
  toDatabaseWallClock,
} from "@/lib/events/festivals";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectSearchable } from "@/components/ui/select-searchable";

import type { LocationData } from "./types";

/** Un événement du programme d'un festival, tel que le formulaire l'affiche. */
export type FestivalProgrammeEvent = {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  status: string | null;
  location_id: string | null;
  location_name: string | null;
  /** Le festival enregistré en base pour cet événement. */
  festival_id: string | null;
};

/** Un festival qu'un événement peut rejoindre : une fiche de la catégorie Festival. */
export type FestivalOption = {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  status: string | null;
  festival_id: string | null;
};

export const PROGRAMME_EVENT_SELECT =
  "id, title, date, end_date, status, location_id, festival_id, location:locations(name)";

/** Une ligne lue avec `PROGRAMME_EVENT_SELECT`. */
export type ProgrammeEventRow = Omit<FestivalProgrammeEvent, "location_name"> & {
  description?: string | null;
  location?: { name: string | null } | Array<{ name: string | null }> | null;
};

export function toProgrammeEvent(row: ProgrammeEventRow): FestivalProgrammeEvent {
  const location = Array.isArray(row.location) ? row.location[0] : row.location;
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    end_date: row.end_date,
    status: row.status,
    location_id: row.location_id,
    location_name: location?.name ?? null,
    festival_id: row.festival_id,
  };
}

function byDate(left: { date: string; id: string }, right: { date: string; id: string }) {
  return left.date.localeCompare(right.date) || left.id.localeCompare(right.id);
}

function formatProgrammeDate(value: string) {
  const date = parseDateWithoutTimezone(value);
  return date ? format(date, "EEE d MMM · HH:mm", { locale: fr }) : "";
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  rejected: "Refusé",
  draft: "Brouillon",
};

/* ------------------------------------------------------------------ */
/* Lieux du festival                                                   */
/* ------------------------------------------------------------------ */

function locationWarnings(location: LocationData) {
  const warnings: string[] = [];
  if (!location.address) warnings.push("Sans adresse");
  if (location.latitude == null || location.longitude == null) warnings.push("Sans coordonnées");
  return warnings;
}

/** Les lieux d'un festival, dans l'ordre : recherche, ajout, ordre, retrait. Le premier est le lieu de la fiche. */
export function FestivalLocationsField({
  locations,
  value,
  onChange,
  onCreateLocation,
  disabled,
}: {
  locations: LocationData[];
  value: string[];
  onChange: (next: string[]) => void;
  onCreateLocation: (name: string) => void;
  disabled?: boolean;
}) {
  const byId = React.useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const options = React.useMemo(
    () =>
      locations
        .filter((location) => !value.includes(location.id))
        .map((location) => ({
          value: location.id,
          label: location.city?.label ? `${location.name} · ${location.city.label}` : location.name,
        })),
    [locations, value],
  );

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {value.map((locationId, index) => {
            const location = byId.get(locationId);
            const name = location?.name ?? "Lieu introuvable";
            const warnings = location ? locationWarnings(location) : [];
            return (
              <li key={locationId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{name}</span>
                    {index === 0 ? <Badge variant="muted">Lieu de la fiche</Badge> : null}
                    {warnings.map((warning) => (
                      <Badge key={warning} variant="warning">
                        {warning}
                      </Badge>
                    ))}
                  </div>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {[location?.address, location?.city?.label].filter(Boolean).join(" · ") || "Adresse non renseignée"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                    aria-label={`Monter ${name}`}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === value.length - 1}
                    aria-label={`Descendre ${name}`}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => onChange(value.filter((id) => id !== locationId))}
                    disabled={disabled}
                    aria-label={`Retirer ${name}`}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <SelectSearchable
        options={options}
        value=""
        onValueChange={(locationId) => {
          if (locationId && !value.includes(locationId)) onChange([...value, locationId]);
        }}
        placeholder={value.length > 0 ? "Ajouter un autre lieu" : "Ajouter un lieu"}
        searchPlaceholder="Rechercher un lieu…"
        emptyActionLabel="Créer un lieu"
        onEmptyAction={onCreateLocation}
        disabled={disabled}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

/** Une ligne d'événement : titre, date, lieu, statut, et ce qui la complète (alertes, bouton). */
function ProgrammeRow({
  event,
  badges,
  action,
}: {
  event: FestivalProgrammeEvent;
  badges?: React.ReactNode;
  action: React.ReactNode;
}) {
  const statusLabel = event.status ? STATUS_LABELS[event.status] : undefined;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{event.title || "Sans titre"}</span>
          {statusLabel ? <Badge variant={event.status === "pending" ? "warning" : "muted"}>{statusLabel}</Badge> : null}
          {badges}
        </div>
        <p className="truncate text-xs text-muted-foreground first-letter:uppercase">
          {[formatProgrammeDate(event.date), event.location_name].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

/**
 * Le programme d'un festival : ses événements et leurs alertes, les suggestions (les événements à ses dates qui le
 * nomment), et une recherche autour de ses dates.
 */
export function FestivalProgrammeSection({
  festival,
  festivals,
  value,
  onChange,
  loading,
  disabled,
}: {
  /** Le festival tel que le formulaire le montre (dates au format datetime-local). */
  festival: { id: string | null; title: string; date: string; end_date: string };
  /** Les festivals connus, pour nommer celui d'un événement déjà rattaché ailleurs. */
  festivals: FestivalOption[];
  value: FestivalProgrammeEvent[];
  onChange: (next: FestivalProgrammeEvent[]) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [candidates, setCandidates] = React.useState<Array<FestivalProgrammeEvent & { description: string | null }>>([]);
  const [loadingCandidates, setLoadingCandidates] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<FestivalProgrammeEvent[]>([]);
  const [searching, setSearching] = React.useState(false);

  const festivalDates = { date: festival.date, end_date: festival.end_date || null };
  const span = festivalSpan(festivalDates);
  const spanStart = span ? toDatabaseWallClock(span.start) : null;
  const spanEnd = span ? toDatabaseWallClock(span.end) : null;
  // La recherche : un mois avant et après ses dates.
  const searchStart = span ? toDatabaseWallClock(addDays(span.start, -30)) : null;
  const searchEnd = span ? toDatabaseWallClock(addDays(span.end, 30)) : null;

  // Les événements à ses dates, pour les suggestions.
  React.useEffect(() => {
    if (!spanStart || !spanEnd) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingCandidates(true);
      try {
        const { data, error } = await supabase
          .from("events")
          .select(`${PROGRAMME_EVENT_SELECT}, description`)
          .eq("archived", false)
          .gte("date", spanStart)
          .lte("date", spanEnd)
          .order("date", { ascending: true })
          .limit(300);
        if (error) throw error;
        if (!cancelled) {
          setCandidates(
            ((data || []) as unknown as ProgrammeEventRow[]).map((row) => ({
              ...toProgrammeEvent(row),
              description: row.description ?? null,
            })),
          );
        }
      } catch (error) {
        console.error("Suggestions du programme :", error);
        if (!cancelled) setCandidates([]);
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [spanStart, spanEnd]);

  // Recherche par titre, autour de ses dates.
  const trimmedQuery = query.trim();
  React.useEffect(() => {
    if (trimmedQuery.length < 2 || !searchStart || !searchEnd) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const pattern = `%${trimmedQuery.replace(/[%_\\]/g, (character) => `\\${character}`)}%`;
        const { data, error } = await supabase
          .from("events")
          .select(PROGRAMME_EVENT_SELECT)
          .eq("archived", false)
          .ilike("title", pattern)
          .gte("date", searchStart)
          .lte("date", searchEnd)
          .order("date", { ascending: true })
          .limit(20);
        if (error) throw error;
        if (!cancelled) setResults(((data || []) as unknown as ProgrammeEventRow[]).map(toProgrammeEvent));
      } catch (error) {
        console.error("Recherche d'événements du programme :", error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, searchStart, searchEnd]);

  const programmeIds = React.useMemo(() => value.map((event) => event.id), [value]);
  const suggestions = React.useMemo(
    () =>
      suggestProgramme(
        { id: festival.id, title: festival.title, date: festival.date, end_date: festival.end_date || null },
        candidates,
        programmeIds,
      ),
    [candidates, festival.id, festival.title, festival.date, festival.end_date, programmeIds],
  );
  // Pour « Dans … » : le festival d'un événement rattaché ailleurs.
  const festivalTitles = React.useMemo(
    () => new Map(festivals.map((entry) => [entry.id, entry.title])),
    [festivals],
  );

  function add(event: FestivalProgrammeEvent) {
    if (programmeIds.includes(event.id)) return;
    onChange([...value, event].sort(byDate));
  }

  function remove(eventId: string) {
    onChange(value.filter((event) => event.id !== eventId));
  }

  const visibleResults = results.filter((event) => event.id !== festival.id);

  return (
    <div className="space-y-5">
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du programme…
        </p>
      ) : value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-[13px] text-muted-foreground">
          Aucun événement dans le programme. Ajoute-les depuis les suggestions ou la recherche ; l’app les montrera dans
          la carte et la page du festival.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {value.map((event) => (
            <ProgrammeRow
              key={event.id}
              event={event}
              badges={programmeWarnings(event, festivalDates).map((warning) => (
                <Badge key={warning} variant="warning">
                  {warning}
                </Badge>
              ))}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={() => remove(event.id)}
                  disabled={disabled}
                  aria-label={`Retirer ${event.title} du programme`}
                >
                  <X />
                </Button>
              }
            />
          ))}
        </ul>
      )}

      {suggestions.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Suggestions
            <span className="font-normal text-muted-foreground">· à ses dates, et le nomment</span>
          </p>
          <ul className="divide-y divide-border rounded-lg border border-dashed border-border">
            {suggestions.map((event) => (
              <ProgrammeRow
                key={event.id}
                event={event}
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => add(event)} disabled={disabled}>
                    <Plus />
                    Ajouter
                  </Button>
                }
              />
            ))}
          </ul>
        </div>
      ) : loadingCandidates ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Recherche de suggestions…
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(changeEvent) => setQuery(changeEvent.target.value)}
            placeholder={span ? "Rechercher un événement à ajouter…" : "Choisis d’abord les dates du festival"}
            aria-label="Rechercher un événement à ajouter au programme"
            disabled={disabled || !span}
            className="pl-8"
          />
          {searching ? (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        {trimmedQuery.length >= 2 && !searching ? (
          visibleResults.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun événement de ce titre à un mois de ses dates.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {visibleResults.map((event) => {
                const inProgramme = programmeIds.includes(event.id);
                const elsewhere = !inProgramme && event.festival_id && event.festival_id !== festival.id;
                return (
                  <ProgrammeRow
                    key={event.id}
                    event={event}
                    badges={
                      elsewhere ? (
                        <Badge variant="muted">
                          Dans {festivalTitles.get(event.festival_id ?? "") ?? "un autre festival"}
                        </Badge>
                      ) : null
                    }
                    action={
                      inProgramme ? (
                        <span className="text-xs text-muted-foreground">Au programme</span>
                      ) : (
                        <Button type="button" variant="outline" size="sm" onClick={() => add(event)} disabled={disabled}>
                          <Plus />
                          {elsewhere ? "Déplacer ici" : "Ajouter"}
                        </Button>
                      )
                    }
                  />
                );
              })}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fait partie du festival                                             */
/* ------------------------------------------------------------------ */

/**
 * Le festival dont l'événement fait partie : seulement ceux dont les dates couvrent la sienne (et qui ne sont pas
 * eux-mêmes dans un festival). Le festival déjà choisi reste proposé, avec une alerte s'il ne la couvre plus.
 */
export function FestivalPicker({
  festivals,
  eventId,
  eventDate,
  value,
  onChange,
  loading,
  disabled,
}: {
  festivals: FestivalOption[];
  eventId: string | null;
  eventDate: string;
  value: string;
  onChange: (festivalId: string) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const selected = festivals.find((festival) => festival.id === value) ?? null;
  const options = React.useMemo(() => {
    const covering = festivals.filter(
      (festival) =>
        festival.id !== eventId &&
        !festival.festival_id &&
        (festival.id === value || festivalCovers(festival, eventDate)),
    );
    return [
      ...(value ? [{ value: "", label: "Aucun" }] : []),
      ...covering.map((festival) => ({
        value: festival.id,
        label: [
          festival.title,
          formatFestivalDates(festival),
          festival.status === "pending" ? "en attente" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    ];
  }, [eventDate, eventId, festivals, value]);

  const outOfDates = Boolean(selected && eventDate && !festivalCovers(selected, eventDate));
  const hint = !eventDate
    ? "Choisis d’abord la date : seuls les festivals qui la couvrent sont proposés."
    : options.length === 0
      ? "Aucun festival à cette date."
      : "Les festivals dont les dates couvrent celle de l’événement.";

  return (
    <div className="space-y-2">
      <SelectSearchable
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder={loading ? "Chargement…" : "Aucun"}
        searchPlaceholder="Rechercher un festival…"
        disabled={disabled}
      />
      {value && !selected && !loading ? (
        <p className="text-xs text-muted-foreground">Festival introuvable dans la liste (archivé ?).</p>
      ) : outOfDates ? (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Hors des dates du festival ({selected ? formatFestivalDates(selected) : ""}).
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
