"use client";

import * as React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Radio, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import type { AdminRadioPayload, AdminRadioShow } from "@/lib/radio/admin";
import { cn } from "@/lib/utils";
import {
  ManagementEmptyState,
  ManagementHero,
  ManagementPill,
  ManagementSectionLabel,
  ManagementStat,
  ManagementStatGrid,
} from "../management-page-primitives";

/*
 * Radio (Radio Campus dans OutLive) : les émissions importées chaque heure du site de la radio
 * (lib/radio/import.ts). Ici, leur famille (musique ou parole) et le collectif qui les fait ; l'import
 * ne les touche plus. L'interrupteur de la station s'affiche, il ne se change pas ici : il reste à faux
 * jusqu'à l'accord écrit de la radio (../live/docs/RADIO_CAMPUS.md, § 5).
 */

const WEEKDAYS = ["", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

function slotsLabel(show: AdminRadioShow) {
  if (!show.slots.length) return "Sans créneau";
  return show.slots
    .map((slot) => `${WEEKDAYS[slot.weekday] ?? "?"} ${slot.start} – ${slot.end === "24:00" ? "00:00" : slot.end}`)
    .join(", ");
}

/** Une date à l'heure de Paris étiquetée UTC, lue sans conversion. */
function parisDateLabel(value: string | null) {
  if (!value) return "Aucun";
  return format(new Date(value.slice(0, 19)), "EEE d MMM yyyy", { locale: fr });
}

type Filter = "active" | "all";

export function RadioShowsManagement() {
  const [data, setData] = React.useState<AdminRadioPayload | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("active");
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/radio", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Lecture impossible");
      setData(body as AdminRadioPayload);
    } catch (error) {
      console.error("Radio indisponible:", error);
      toast({ title: "Chargement impossible", description: "Les émissions n'ont pas pu être lues. Réessaie.", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runImport = async () => {
    setImporting(true);
    try {
      const response = await fetch("/api/admin/crons/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/api/cron/radio-import" }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Import impossible");
      const report = body.result?.result?.stations?.[0];
      toast({
        title: "Import terminé",
        description: report
          ? `${report.showsCreated} émission(s) créée(s), ${report.showsUpdated} modifiée(s), ${report.episodesCreated} épisode(s) ajouté(s)${report.errors.length ? `, ${report.errors.length} erreur(s)` : ""}.`
          : "Rien à importer.",
      });
      await load();
    } catch (error) {
      toast({
        title: "Import impossible",
        description: error instanceof Error ? error.message : "Réessaie plus tard.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const update = async (show: AdminRadioShow, change: { family?: AdminRadioShow["family"]; organizerId?: string | null }) => {
    const previous = data;
    setSaving(show.id);
    setData((current) =>
      current
        ? {
            ...current,
            shows: current.shows.map((candidate) =>
              candidate.id === show.id
                ? {
                    ...candidate,
                    ...(change.family !== undefined ? { family: change.family } : {}),
                    ...(change.organizerId !== undefined ? { organizerId: change.organizerId } : {}),
                  }
                : candidate,
            ),
          }
        : current,
    );
    try {
      const response = await fetch(`/api/admin/radio/shows/${show.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Modification impossible");
    } catch (error) {
      setData(previous);
      toast({
        title: `${show.name} : non enregistré`,
        description: error instanceof Error ? error.message : "Réessaie.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const organizerOptions = React.useMemo(
    () => [{ value: "", label: "Aucun collectif" }, ...(data?.organizers ?? []).map((o) => ({ value: o.id, label: o.name }))],
    [data?.organizers],
  );

  const shows = data?.shows ?? [];
  const active = shows.filter((show) => show.active);
  const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
  const visible = (filter === "active" ? active : shows).filter(
    (show) => !normalizedQuery || show.name.toLocaleLowerCase("fr-FR").includes(normalizedQuery),
  );
  const station = data?.stations[0] ?? null;

  return (
    <div className="space-y-6">
      <ManagementHero
        title="Radio"
        description="Les émissions de la radio, importées chaque heure de son site (grille, styles, podcasts). Choisis ici leur famille et le collectif qui les fait : l'import ne les change plus. Une émission active a un épisode depuis 45 jours ; seules les actives paraissent dans l'app."
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void runImport()} disabled={importing}>
              <Download className={cn(importing && "animate-pulse")} />
              {importing ? "Import…" : "Importer maintenant"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && "animate-spin")} />
              Actualiser
            </Button>
          </div>
        }
      />

      {data === null ? (
        <div className="space-y-3">
          <Skeleton className="h-[88px] w-full rounded-xl" />
          <Skeleton className="h-[320px] w-full rounded-xl" />
        </div>
      ) : !station ? (
        <ManagementEmptyState
          icon={<Radio />}
          title="Aucune station"
          description="La station Radio Campus Orléans est créée par la migration 20261023140000_create_radio_tables.sql, si son organisateur existe."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {station.name} · {station.frequency}
              </div>
              <div className="text-xs text-muted-foreground">
                {station.enabled
                  ? "Visible dans l'app : le direct, les émissions et les épisodes."
                  : "Invisible dans l'app tant qu'elle est désactivée. Elle s'active en base (radio_stations.enabled), après l'accord écrit de la radio ; pas ici."}
              </div>
            </div>
            <ManagementPill tone={station.enabled ? "positive" : "warning"}>
              {station.enabled ? "Activée" : "Désactivée"}
            </ManagementPill>
          </div>

          <ManagementStatGrid>
            <ManagementStat label="Émissions actives" value={active.length} hint={`${shows.length} sur le site`} />
            <ManagementStat label="Musique" value={active.filter((show) => show.family === "musique").length} hint="parmi les actives" />
            <ManagementStat label="Parole" value={active.filter((show) => show.family === "parole").length} hint="parmi les actives" />
            <ManagementStat
              label="Dernier import"
              value={data.lastImportAt ? format(new Date(data.lastImportAt), "HH:mm", { locale: fr }) : "Jamais"}
              hint={data.lastImportAt ? format(new Date(data.lastImportAt), "EEEE d MMMM", { locale: fr }) : "Importer maintenant"}
            />
          </ManagementStatGrid>

          <ManagementSectionLabel>Émissions</ManagementSectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Filter>
              aria-label="Émissions affichées"
              value={filter}
              onValueChange={setFilter}
              items={[
                { value: "active", label: "Actives", count: active.length },
                { value: "all", label: "Toutes", count: shows.length },
              ]}
            />
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher une émission" className="pl-8" />
            </div>
          </div>

          {visible.length === 0 ? (
            <ManagementEmptyState
              icon={<Radio />}
              title={shows.length ? "Aucune émission ici" : "Pas encore d'émissions"}
              description={shows.length ? "Change le filtre ou la recherche." : "Lance un import : les émissions arrivent du site de la radio."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Émission</TableHead>
                  <TableHead>Créneaux</TableHead>
                  <TableHead>Dernier épisode</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead className="min-w-[220px]">Collectif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((show) => (
                  <TableRow key={show.id} className={cn(!show.active && "text-muted-foreground")}>
                    <TableCell className="max-w-[280px]">
                      <a href={show.pageUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {show.name}
                      </a>
                      <div className="truncate text-xs text-muted-foreground">{show.style ?? "Sans style"}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{slotsLabel(show)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      <span className="capitalize">{parisDateLabel(show.lastEpisodeAt)}</span>
                      <div className="text-xs text-muted-foreground">
                        {show.episodesCount} épisode{show.episodesCount > 1 ? "s" : ""}
                        {show.active ? "" : " · inactive"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <SegmentedControl<AdminRadioShow["family"]>
                        size="sm"
                        aria-label={`Famille de ${show.name}`}
                        value={show.family}
                        onValueChange={(family) => family !== show.family && void update(show, { family })}
                        items={[
                          { value: "musique", label: "Musique" },
                          { value: "parole", label: "Parole" },
                        ]}
                      />
                    </TableCell>
                    <TableCell>
                      <SelectSearchable
                        options={organizerOptions}
                        value={show.organizerId ?? ""}
                        onValueChange={(value) => {
                          const organizerId = value || null;
                          if (organizerId !== show.organizerId) void update(show, { organizerId });
                        }}
                        placeholder="Aucun collectif"
                        searchPlaceholder="Chercher un organisateur"
                        disabled={saving === show.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}
