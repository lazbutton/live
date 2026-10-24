"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  ExternalLink,
  Loader2,
  RotateCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectSearchable } from "@/components/ui/select-searchable";
import type { EventGenreOption } from "@/lib/events/event-details";
import type { FestivalCandidate } from "@/lib/events/festivals";
import type { ImportedEventPayload } from "@/lib/events/imported-event-payload";

import { createPendingEventFromPrefill } from "./event-batch-import";
import { buildEventFormPrefillFromImport, resolveTagIdsForImport } from "./event-import-utils";
import type { ArtistOption, CategoryOption, LocationData, OrganizerOption, TagOption } from "./types";

export type AgendaImportReferences = {
  locations: LocationData[];
  organizers: OrganizerOption[];
  artists: ArtistOption[];
  tags: TagOption[];
  categories: CategoryOption[];
  festivals: FestivalCandidate[];
  genres: EventGenreOption[];
};

type PreviewEvent = {
  url: string;
  title: string | null;
  date: string | null;
  image_url: string | null;
  known: boolean;
  past: boolean;
  cancelled: boolean;
};

type RowState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "created"; missing: string[]; count: number }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; message: string };

const CONCURRENCY = 2;

function formatPreviewDate(value: string | null) {
  const date = parseDateWithoutTimezone(value);
  if (!date) return null;
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  return {
    day: format(date, "EEE d MMM", { locale: fr }).replace(/\./g, ""),
    time: hasTime ? format(date, "HH:mm") : null,
  };
}

/** Repère une URL de programmation (liste d'événements) plutôt qu'une fiche. */
export function looksLikeAgendaUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    if (/multi_event|calendar|calendrier/.test(path + parsed.search)) return true;
    const last = path.split("/").pop() || "";
    return /^(agenda|programmation|programme|prog|evenements|événements|events|spectacles|concerts|ateliers|saison(-\d{4}-\d{4})?|billetterie|calendrier|planning)$/.test(
      decodeURIComponent(last),
    ) || (path === "" && /billetterie|mapado|billetweb|helloasso|weezevent/.test(parsed.hostname));
  } catch {
    return false;
  }
}

export function AgendaImportPanel({
  url,
  ownerOptions,
  ownerId,
  onOwnerChange,
  owners,
  loadReferences,
  onBack,
  onImportAsSingle,
  onImported,
  onFinished,
  onClose,
  title = "Importer un agenda",
  reviewAction,
}: {
  url: string;
  ownerOptions: Array<{ value: string; label: string }>;
  ownerId: string;
  onOwnerChange: (value: string) => void;
  owners: OrganizerOption[];
  loadReferences: () => Promise<AgendaImportReferences>;
  /** Retour à l'étape précédente (bouton masqué si absent). */
  onBack?: () => void;
  /** Bascule vers l'import de la page comme un seul événement. */
  onImportAsSingle: () => void;
  onImported: (createdCount: number) => void;
  /** Appelé à la fin de chaque import, même sans création. */
  onFinished?: (createdCount: number) => void;
  onClose: () => void;
  title?: string;
  /** Action secondaire (ex. « Marquer comme revue » depuis la Collecte). */
  reviewAction?: { label: string; onClick: () => void };
}) {
  const router = useRouter();
  const [events, setEvents] = React.useState<PreviewEvent[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [rows, setRows] = React.useState<Record<string, RowState>>({});
  const [phase, setPhase] = React.useState<"preview" | "importing" | "done">("preview");
  const [reloadKey, setReloadKey] = React.useState(0);
  const owner = owners.find((entry) => entry.id === ownerId);
  // Lu au moment de la requête : changer de propriétaire ne relance pas la lecture.
  const ownerRef = React.useRef(owner);
  ownerRef.current = owner;
  const onOwnerChangeRef = React.useRef(onOwnerChange);
  onOwnerChangeRef.current = onOwnerChange;
  const hostname = React.useMemo(() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }, [url]);

  React.useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setLoadError(null);
    void (async () => {
      try {
        const currentOwner = ownerRef.current;
        const response = await fetch("/api/events/scrape-agenda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            organizer_id: currentOwner?.type === "organizer" ? currentOwner.id : undefined,
            location_id: currentOwner?.type === "location" ? currentOwner.id : undefined,
          }),
        });
        const json = (await response.json().catch(() => ({}))) as {
          events?: PreviewEvent[];
          suggestedOwnerId?: string | null;
          error?: string;
        };
        if (!response.ok) throw new Error(json.error || "La page n'a pas pu être lue.");
        if (cancelled) return;
        const list = json.events || [];
        setEvents(list);
        setSelected(new Set(list.filter((event) => !event.known && !event.past && !event.cancelled).map((event) => event.url)));
        setRows({});
        setPhase("preview");
        if (!currentOwner && json.suggestedOwnerId) onOwnerChangeRef.current(json.suggestedOwnerId);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "La page n'a pas pu être lue.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, reloadKey]);

  const counts = React.useMemo(() => {
    const list = events || [];
    return {
      total: list.length,
      known: list.filter((event) => event.known).length,
      past: list.filter((event) => event.past).length,
      importable: list.filter((event) => !event.known && !event.past).length,
    };
  }, [events]);

  const states = Object.values(rows);
  const doneCount = states.filter((state) => state.kind !== "idle" && state.kind !== "working").length;
  const createdCount = states.reduce((sum, state) => sum + (state.kind === "created" ? state.count : 0), 0);
  const skippedCount = states.filter((state) => state.kind === "skipped").length;
  const errorCount = states.filter((state) => state.kind === "error").length;
  const selectedList = (events || []).filter((event) => selected.has(event.url));

  function toggle(urlToToggle: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(urlToToggle);
      else next.delete(urlToToggle);
      return next;
    });
  }

  async function runImport() {
    if (selectedList.length === 0) return;
    setPhase("importing");
    setRows(Object.fromEntries(selectedList.map((event) => [event.url, { kind: "idle" } as RowState])));
    let references: AgendaImportReferences;
    try {
      references = await loadReferences();
    } catch {
      setPhase("preview");
      setLoadError("Les lieux et catégories n'ont pas pu être chargés. Réessaie.");
      return;
    }
    const today = format(new Date(), "yyyy-MM-dd");
    const setRow = (key: string, state: RowState) => setRows((current) => ({ ...current, [key]: state }));
    let created = 0;

    const importOne = async (event: PreviewEvent) => {
      setRow(event.url, { kind: "working" });
      try {
        const response = await fetch("/api/events/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: event.url,
            organizer_id: owner?.type === "organizer" ? owner.id : undefined,
            location_id: owner?.type === "location" ? owner.id : undefined,
          }),
        });
        const json = (await response.json().catch(() => ({}))) as { data?: ImportedEventPayload; error?: string };
        if (!response.ok || !json.data) throw new Error(json.error || "Page illisible");
        if (json.data.is_cancelled === true) {
          setRow(event.url, { kind: "skipped", reason: "Annulé" });
          return;
        }
        const { prefill } = await buildEventFormPrefillFromImport({
          data: json.data,
          sourceUrl: event.url,
          owner,
          categories: references.categories,
          locations: references.locations,
          organizers: references.organizers,
          artists: references.artists,
          festivals: references.festivals,
          genres: references.genres,
          findOrCreateTagIds: (rawTagNames) => resolveTagIdsForImport({ rawTagNames, tags: references.tags }),
          defaultStatus: "pending",
        });
        if (prefill.form?.date && prefill.form.date.slice(0, 10) < today) {
          setRow(event.url, { kind: "skipped", reason: "Déjà passé" });
          return;
        }
        const outcome = await createPendingEventFromPrefill({
          prefill,
          locations: references.locations,
          organizers: references.organizers,
          sourceLabel: hostname,
        });
        if (outcome.status === "skipped") {
          setRow(event.url, { kind: "skipped", reason: outcome.reason });
        } else {
          created += outcome.count;
          setRow(event.url, { kind: "created", missing: outcome.missing, count: outcome.count });
        }
      } catch (error) {
        setRow(event.url, { kind: "error", message: error instanceof Error ? error.message : "Erreur inconnue" });
      }
    };

    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, selectedList.length) }, async () => {
        while (cursor < selectedList.length) {
          const event = selectedList[cursor];
          cursor += 1;
          await importOne(event);
        }
      }),
    );
    setPhase("done");
    if (created > 0) onImported(created);
    onFinished?.(created);
  }

  const busy = phase === "importing";
  const allSelectable = (events || []).filter((event) => !event.known);
  const allChecked = allSelectable.length > 0 && allSelectable.every((event) => selected.has(event.url));

  return (
    <div className="flex max-h-[min(78vh,720px)] flex-col">
      <div className="space-y-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 pr-8">
          {onBack ? (
            <Button type="button" variant="ghost" size="icon-sm" className="-ml-1.5 text-muted-foreground" onClick={onBack} disabled={busy} aria-label="Retour">
              <ArrowLeft />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight">{title}</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex max-w-full items-center gap-1 text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <span className="truncate">{hostname}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>
        <SelectSearchable
          options={ownerOptions}
          value={ownerId}
          onValueChange={onOwnerChange}
          placeholder="Lieu ou organisateur de cet agenda (recommandé)"
          searchPlaceholder="Rechercher un lieu ou un organisateur…"
          disabled={busy || phase === "done"}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError ? (
          <div className="space-y-3 p-5">
            <div className="flex items-start gap-2 text-sm">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Agenda illisible</p>
                <p className="text-muted-foreground">{loadError}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                <RotateCw />
                Réessayer
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onImportAsSingle}>
                Importer comme un seul événement
              </Button>
              {reviewAction ? (
                <Button type="button" size="sm" variant="ghost" onClick={reviewAction.onClick}>
                  <Check />
                  {reviewAction.label}
                </Button>
              ) : null}
            </div>
          </div>
        ) : events === null ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture de l’agenda…
          </div>
        ) : events.length === 0 ? (
          <div className="space-y-3 p-5 text-sm">
            <p className="font-medium">Aucun événement repéré sur cette page.</p>
            <p className="text-muted-foreground">
              Si c’est la fiche d’un seul événement, importe-la directement. Pour un agenda difficile à lire,
              configure ses sélecteurs dans le scraping du lieu ou de l’organisateur.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onImportAsSingle}>
                Importer comme un seul événement
              </Button>
              {reviewAction ? (
                <Button type="button" size="sm" variant="ghost" onClick={reviewAction.onClick}>
                  <Check />
                  {reviewAction.label}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-5 py-2 text-xs text-muted-foreground backdrop-blur">
              <Checkbox
                checked={allChecked ? true : selected.size > 0 ? "indeterminate" : false}
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? new Set(allSelectable.map((event) => event.url)) : new Set())
                }
                disabled={busy || phase === "done"}
                aria-label="Tout sélectionner"
              />
              <span className="flex-1">
                {counts.total} événement{counts.total > 1 ? "s" : ""}
                {counts.known ? ` · ${counts.known} déjà importé${counts.known > 1 ? "s" : ""}` : ""}
                {counts.past ? ` · ${counts.past} passé${counts.past > 1 ? "s" : ""}` : ""}
              </span>
              <span className="tabular-nums">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
            </div>
            <ul className="divide-y divide-border">
              {events.map((event) => {
                const date = formatPreviewDate(event.date);
                const row = rows[event.url];
                const disabled = event.known || busy || phase === "done";
                return (
                  <li key={event.url}>
                    <label
                      className={cn(
                        "flex items-center gap-3 px-5 py-2.5",
                        disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/40",
                        (event.known || event.past || event.cancelled) && !row && "opacity-60",
                      )}
                    >
                      <Checkbox
                        checked={selected.has(event.url)}
                        onCheckedChange={(checked) => toggle(event.url, checked === true)}
                        disabled={disabled}
                        aria-label={`Importer ${event.title || event.url}`}
                      />
                      <div className="w-[4.5rem] shrink-0 leading-tight">
                        {date ? (
                          <>
                            <p className="text-xs font-medium first-letter:uppercase">{date.day}</p>
                            <p className="text-[11px] tabular-nums text-muted-foreground">{date.time || "Heure ?"}</p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">Date ?</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{event.title || event.url}</p>
                        {row?.kind === "created" && row.missing.length ? (
                          <p className="truncate text-xs text-warning">À compléter : {row.missing.join(", ")}</p>
                        ) : row?.kind === "skipped" ? (
                          <p className="truncate text-xs text-muted-foreground">{row.reason}</p>
                        ) : row?.kind === "error" ? (
                          <p className="truncate text-xs text-destructive">{row.message}</p>
                        ) : event.known ? (
                          <p className="text-xs text-muted-foreground">Déjà importé</p>
                        ) : event.cancelled ? (
                          <p className="text-xs text-muted-foreground">Annoncé annulé</p>
                        ) : event.past ? (
                          <p className="text-xs text-muted-foreground">Déjà passé</p>
                        ) : null}
                      </div>
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {row?.kind === "working" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : row?.kind === "created" ? (
                          <CircleCheck className="h-4 w-4 text-success" />
                        ) : row?.kind === "skipped" ? (
                          <CircleMinus className="h-4 w-4 text-muted-foreground" />
                        ) : row?.kind === "error" ? (
                          <CircleAlert className="h-4 w-4 text-destructive" />
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {events && events.length > 0 && !loadError ? (
        <div className="space-y-3 border-t border-border px-5 py-3">
          {phase === "preview" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Chaque page est lue puis créée « en attente » : tu valides ensuite depuis Événements.
              </p>
              <div className="flex items-center gap-2">
                {reviewAction ? (
                  <Button type="button" variant="ghost" onClick={reviewAction.onClick}>
                    {reviewAction.label}
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void runImport()} disabled={selected.size === 0}>
                  <Check />
                  Importer {selected.size} événement{selected.size > 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-300"
                  style={{ width: `${selectedList.length ? Math.round((doneCount / selectedList.length) * 100) : 0}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {phase === "importing" ? (
                    <span className="text-muted-foreground">
                      Import {doneCount}/{selectedList.length}…
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">
                        {createdCount} événement{createdCount > 1 ? "s" : ""} créé{createdCount > 1 ? "s" : ""} en attente
                      </span>
                      <span className="text-muted-foreground">
                        {skippedCount ? ` · ${skippedCount} ignoré${skippedCount > 1 ? "s" : ""}` : ""}
                        {errorCount ? ` · ${errorCount} erreur${errorCount > 1 ? "s" : ""}` : ""}
                      </span>
                    </>
                  )}
                </p>
                {phase === "done" ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={onClose}>
                      Fermer
                    </Button>
                    {createdCount > 0 ? (
                      <Button
                        type="button"
                        onClick={() => {
                          onClose();
                          router.push("/admin/events?status=pending");
                        }}
                      >
                        Relire les événements
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
