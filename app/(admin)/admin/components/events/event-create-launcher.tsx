"use client";

import * as React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertCircle,
  CalendarRange,
  Copy,
  CornerDownLeft,
  ImagePlus,
  Link2,
  Loader2,
  MapPin,
  PenLine,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import { isInstagramPostUrl } from "@/lib/instagram/post-url";
import type {
  ImportedEventPayload,
  ImportedEventWarning,
} from "@/lib/events/imported-event-payload";

import type { AdminEvent, OrganizerOption } from "./types";
import { AgendaImportPanel, looksLikeAgendaUrl, type AgendaImportReferences } from "./event-agenda-import";

export type EventCreateLauncherResult =
  | { kind: "manual"; title?: string; externalUrl?: string }
  | {
      kind: "import";
      sourceLabel: string;
      sourceUrl?: string;
      owner?: OrganizerOption;
      data: ImportedEventPayload;
      warnings: ImportedEventWarning[];
      /** Méthode de lecture (données structurées, IA…). */
      method?: string;
    }
  | { kind: "duplicate"; event: AdminEvent };

type UrlKind = "facebook" | "instagram" | "image" | "web";

type DetectedUrl = { url: string; kind: UrlKind; label: string };

type BusyState = { kind: "url" | "image"; label: string } | null;

type LauncherError = { message: string; url?: string; retry: () => void } | null;

const IMAGE_PATH_PATTERN = /\.(jpe?g|png|webp|gif|avif|heic)$/i;

function detectUrl(value: string): DetectedUrl | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (!parsed.hostname.includes(".")) return null;
    const url = parsed.toString();
    if (isFacebookEventUrl(url)) return { url, kind: "facebook", label: "Événement Facebook" };
    if (isInstagramPostUrl(url)) return { url, kind: "instagram", label: "Post Instagram" };
    if (IMAGE_PATH_PATTERN.test(parsed.pathname)) return { url, kind: "image", label: "Image" };
    return { url, kind: "web", label: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

function formatEventDate(value?: string | null) {
  const date = parseDateWithoutTimezone(value ?? null);
  if (!date) return null;
  return format(date, "EEE d MMM yyyy · HH:mm", { locale: fr });
}

const DUPLICATE_SELECT = `
  *,
  location:locations(id, name),
  event_organizers:event_organizers(
    organizer:organizers(id, name),
    location:locations(id, name)
  ),
  event_artists:event_artists(
    artist_id,
    role_label,
    sort_index,
    artist:artists(id, name, slug, image_url, origin_city)
  ),
  major_event_events(
    major_event_id,
    major_event:major_events(id, title, slug)
  )
`;

export type EventCreateLauncherSeed = {
  /** Identifiant unique : chaque nouvelle graine relance le traitement. */
  id: number;
  text?: string;
  file?: File;
};

export function EventCreateLauncher({
  open,
  onOpenChange,
  organizers,
  contextDate,
  seed,
  initialOwnerId,
  onResult,
  loadReferences,
  onAgendaImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizers: OrganizerOption[];
  contextDate?: Date;
  /** Lien ou affiche collé hors du lanceur : traité dès l'ouverture. */
  seed?: EventCreateLauncherSeed | null;
  /** Lieu ou organisateur présélectionné à l'ouverture. */
  initialOwnerId?: string;
  onResult: (result: EventCreateLauncherResult) => void | Promise<void>;
  /** Référentiels (lieux, catégories, artistes…) pour l'import d'un agenda. */
  loadReferences?: () => Promise<AgendaImportReferences>;
  /** Appelé après la création d'événements depuis un agenda. */
  onAgendaImported?: (createdCount: number) => void;
}) {
  const isMobile = useIsMobile();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [value, setValue] = React.useState("");
  const [ownerId, setOwnerId] = React.useState("");
  const [busy, setBusy] = React.useState<BusyState>(null);
  const [error, setError] = React.useState<LauncherError>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [showDuplicate, setShowDuplicate] = React.useState(false);
  const [duplicateQuery, setDuplicateQuery] = React.useState("");
  const [duplicateResults, setDuplicateResults] = React.useState<AdminEvent[]>([]);
  const [duplicateLoading, setDuplicateLoading] = React.useState(false);
  /** Page d'agenda en cours d'import (mode liste). */
  const [agendaUrl, setAgendaUrl] = React.useState<string | null>(null);

  const detected = React.useMemo(() => detectUrl(value), [value]);
  const trimmedValue = value.trim();

  const ownerOptions = React.useMemo(
    () => [
      { value: "", label: "Aucun lieu ni organisateur" },
      ...organizers.map((organizer) => ({
        value: organizer.id,
        label: `${organizer.name}${organizer.type === "location" ? " (lieu)" : ""}`,
      })),
    ],
    [organizers],
  );

  React.useEffect(() => {
    if (open) {
      setOwnerId(initialOwnerId || "");
      const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(timer);
    }
    setValue("");
    setOwnerId("");
    setBusy(null);
    setError(null);
    setIsDragging(false);
    setShowDuplicate(false);
    setDuplicateQuery("");
    setDuplicateResults([]);
    setAgendaUrl(null);
    return undefined;
  }, [open, initialOwnerId]);

  // Recherche des événements à dupliquer (titre), les derniers ajoutés d'abord.
  React.useEffect(() => {
    if (!open || !showDuplicate) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDuplicateLoading(true);
      try {
        let query = supabase
          .from("events")
          .select(DUPLICATE_SELECT)
          .order("created_at", { ascending: false })
          .limit(8);
        const search = duplicateQuery.trim();
        if (search.length >= 2) {
          query = query.ilike("title", `%${search.replace(/[%_]/g, "\\$&")}%`);
        }
        const { data, error: queryError } = await query;
        if (queryError) throw queryError;
        // TODO(types): major_event_events est une relation 1-1 (event_id unique) : le type généré est un objet, AdminEvent attend un tableau.
        if (!cancelled) setDuplicateResults((data || []) as unknown as AdminEvent[]);
      } catch (queryError) {
        console.error("Recherche duplication impossible:", queryError);
        if (!cancelled) setDuplicateResults([]);
      } finally {
        if (!cancelled) setDuplicateLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [duplicateQuery, open, showDuplicate]);

  const selectedOwner = organizers.find((organizer) => organizer.id === ownerId);

  async function finish(result: EventCreateLauncherResult) {
    await onResult(result);
  }

  async function importFromUrl(target: DetectedUrl, owner: OrganizerOption | undefined = selectedOwner) {
    if (target.kind === "image") {
      await analyzeImage({ imageUrl: target.url });
      return;
    }

    setError(null);
    setBusy({
      kind: "url",
      label: target.kind === "web" ? `Lecture de ${target.label}…` : `Import ${target.label.toLowerCase()}…`,
    });
    try {
      const endpoint = target.kind === "facebook" ? "/api/facebook/events/scrape" : "/api/events/scrape";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: target.url,
          organizer_id: owner?.type === "organizer" ? owner.id : undefined,
          location_id: owner?.type === "location" ? owner.id : undefined,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: ImportedEventPayload;
        warnings?: ImportedEventWarning[];
        metadata?: { method?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json?.error || "La page n'a pas pu être analysée.");
      }
      await finish({
        kind: "import",
        sourceLabel: target.label,
        sourceUrl: target.url,
        owner,
        data: json.data || {},
        warnings: json.warnings || [],
        method: json.metadata?.method,
      });
    } catch (importError) {
      setError({
        message:
          importError instanceof Error ? importError.message : "La page n'a pas pu être analysée.",
        url: target.url,
        retry: () => void importFromUrl(target, owner),
      });
    } finally {
      setBusy(null);
    }
  }

  async function analyzeImage(source: { file?: File; imageUrl?: string }) {
    setError(null);
    setBusy({ kind: "image", label: "Lecture de l'affiche…" });
    try {
      const payload = new FormData();
      if (source.file) payload.append("image", source.file);
      if (source.imageUrl) payload.append("imageUrl", source.imageUrl);
      const response = await fetch("/api/events/extract-from-image", {
        method: "POST",
        body: payload,
      });
      const json = (await response.json().catch(() => ({}))) as {
        data?: ImportedEventPayload;
        warnings?: ImportedEventWarning[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json?.error || "L'affiche n'a pas pu être analysée.");
      }
      await finish({
        kind: "import",
        sourceLabel: "Affiche",
        data: json.data || {},
        warnings: json.warnings || [],
        method: "ai",
      });
    } catch (analysisError) {
      setError({
        message:
          analysisError instanceof Error ? analysisError.message : "L'affiche n'a pas pu être analysée.",
        retry: () => void analyzeImage(source),
      });
    } finally {
      setBusy(null);
    }
  }

  const canImportAgenda = Boolean(loadReferences && detected?.kind === "web");
  const agendaByDefault = canImportAgenda && detected ? looksLikeAgendaUrl(detected.url) : false;

  function submitMainInput() {
    if (busy) return;
    if (detected && agendaByDefault) {
      setAgendaUrl(detected.url);
      return;
    }
    if (detected) {
      void importFromUrl(detected);
      return;
    }
    void finish({ kind: "manual", title: trimmedValue || undefined });
  }

  function handleFiles(files: FileList | File[] | null | undefined) {
    const file = Array.from(files ?? []).find((entry) => entry.type.startsWith("image/"));
    if (!file) return false;
    void analyzeImage({ file });
    return true;
  }

  // Traite un lien ou une affiche collé ailleurs dans l'admin (une seule fois par graine).
  const processedSeedRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!open || !seed || processedSeedRef.current === seed.id) return;
    processedSeedRef.current = seed.id;
    if (seed.file) {
      void analyzeImage({ file: seed.file });
      return;
    }
    if (seed.text) {
      setValue(seed.text);
      const target = detectUrl(seed.text);
      // Le propriétaire présélectionné n'est pas encore dans l'état à ce rendu.
      const seedOwner = initialOwnerId ? organizers.find((organizer) => organizer.id === initialOwnerId) : undefined;
      if (target) void importFromUrl(target, seedOwner);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement à l'arrivée d'une nouvelle graine
  }, [open, seed]);

  const dateContextLabel = contextDate
    ? format(contextDate, "EEEE d MMMM", { locale: fr })
    : null;

  if (agendaUrl && loadReferences) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">Importer un agenda</DialogTitle>
          <DialogDescription className="sr-only">
            Liste des événements trouvés sur la page, à importer en attente de validation.
          </DialogDescription>
          <AgendaImportPanel
            url={agendaUrl}
            ownerOptions={ownerOptions}
            ownerId={ownerId}
            onOwnerChange={setOwnerId}
            owners={organizers}
            loadReferences={loadReferences}
            onBack={() => setAgendaUrl(null)}
            onImportAsSingle={() => {
              const target = detectUrl(agendaUrl);
              setAgendaUrl(null);
              if (target) void importFromUrl(target);
            }}
            onImported={(count) => onAgendaImported?.(count)}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        onPaste={(event) => {
          if (busy) return;
          if (handleFiles(event.clipboardData?.files)) {
            event.preventDefault();
          }
        }}
        onDragOver={(event) => {
          if (busy) return;
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!busy) handleFiles(event.dataTransfer?.files);
        }}
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Nouvel événement</DialogTitle>
          <DialogDescription className="text-[13px]">
            {dateContextLabel ? (
              <>
                Pour le <span className="font-medium text-foreground">{dateContextLabel}</span>. Colle un
                lien, dépose une affiche ou tape un titre.
              </>
            ) : (
              "Colle un lien, dépose une affiche ou tape simplement un titre."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative space-y-4 px-5 py-5">
          {/* Champ principal : lien à importer ou titre à saisir */}
          <div className="space-y-2">
            <div className="relative">
              {detected ? (
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
              ) : (
                <PenLine className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <input
                ref={inputRef}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitMainInput();
                  }
                }}
                disabled={Boolean(busy)}
                placeholder="Colle un lien ou tape le titre de l'événement…"
                aria-label="Lien à importer ou titre de l'événement"
                className="h-12 w-full rounded-lg border border-input bg-background pl-10 pr-28 text-[15px] shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-60 dark:bg-input/25"
              />
              <Button
                type="button"
                size="sm"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                onClick={submitMainInput}
                disabled={Boolean(busy)}
              >
                {agendaByDefault ? "Lister" : detected ? "Importer" : trimmedValue ? "Créer" : "Saisir"}
                <CornerDownLeft className="opacity-60" />
              </Button>
            </div>

            <div className="flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {detected ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-medium text-foreground">
                    <Link2 className="h-3 w-3" />
                    {detected.label}
                  </span>
                  <span>
                    {detected.kind === "image"
                      ? "L'image sera analysée pour pré-remplir la fiche."
                      : agendaByDefault
                        ? "Page d'agenda : les événements seront listés pour un import groupé."
                        : "La page sera analysée pour pré-remplir la fiche."}
                  </span>
                  {canImportAgenda && detected ? (
                    <button
                      type="button"
                      onClick={() => (agendaByDefault ? void importFromUrl(detected) : setAgendaUrl(detected.url))}
                      disabled={Boolean(busy)}
                      className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {agendaByDefault ? (
                        "Importer comme un seul événement"
                      ) : (
                        <>
                          <CalendarRange className="h-3 w-3" />
                          C'est un agenda ? Lister ses événements
                        </>
                      )}
                    </button>
                  ) : null}
                </>
              ) : trimmedValue ? (
                <span>
                  Entrée pour créer « <span className="text-foreground">{trimmedValue}</span> » et compléter la fiche.
                </span>
              ) : (
                <span>Billetweb, événement Facebook, post Instagram, site d'un lieu…</span>
              )}
            </div>

            {detected && detected.kind !== "image" ? (
              <div className="space-y-1.5 pt-1">
                <SelectSearchable
                  options={ownerOptions}
                  value={ownerId}
                  onValueChange={setOwnerId}
                  placeholder="Lieu ou organisateur de la page (facultatif)"
                  searchPlaceholder="Rechercher un lieu ou un organisateur…"
                  disabled={Boolean(busy)}
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  Ses réglages de scraping améliorent l'import.
                </p>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="space-y-3 rounded-lg border border-destructive/25 bg-destructive/[0.06] p-3">
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">Import impossible</p>
                  <p className="text-muted-foreground">{error.message}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="bg-background" onClick={error.retry}>
                  Réessayer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void finish({ kind: "manual", externalUrl: error.url })}
                >
                  Continuer en saisie manuelle
                </Button>
              </div>
            </div>
          ) : null}

          {/* Affiche : dépôt, collage ou sélection de fichier */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(busy)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60",
              isDragging
                ? "border-foreground/50 bg-muted"
                : "border-border hover:border-foreground/30 hover:bg-muted/50",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
              <ImagePlus className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {isDragging
                  ? "Dépose l'affiche ici"
                  : isMobile
                    ? "Photographier une affiche"
                    : "Créer depuis une affiche"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {isMobile
                  ? "Ou choisis une image : titre, date et lieu sont extraits."
                  : "Glisse-la ici, colle-la (⌘V) ou choisis un fichier : titre, date et lieu sont extraits."}
              </span>
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
          />

          {/* Duplication d'un événement existant */}
          {showDuplicate ? (
            <div className="space-y-2 rounded-lg border border-border">
              <div className="relative border-b border-border">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={duplicateQuery}
                  onChange={(event) => setDuplicateQuery(event.target.value)}
                  placeholder="Rechercher l'événement à dupliquer…"
                  className="h-10 w-full rounded-t-lg bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="max-h-56 overflow-y-auto px-1 pb-1">
                {duplicateLoading && duplicateResults.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Recherche…
                  </div>
                ) : duplicateResults.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">Aucun événement trouvé.</div>
                ) : (
                  duplicateResults.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => void finish({ kind: "duplicate", event })}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                    >
                      <span
                        className="size-8 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center"
                        style={event.image_url ? { backgroundImage: `url(${event.image_url})` } : undefined}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{event.title || "(Sans titre)"}</span>
                        <span className="block truncate text-xs capitalize text-muted-foreground">
                          {[formatEventDate(event.date), event.location?.name].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void finish({ kind: "manual" })}
              disabled={Boolean(busy)}
            >
              <PenLine />
              Saisie manuelle
            </Button>
            <Button
              type="button"
              variant={showDuplicate ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowDuplicate((current) => !current)}
              disabled={Boolean(busy)}
            >
              <Copy />
              Dupliquer un événement
            </Button>
            <p className="hidden w-full pt-1 text-xs text-muted-foreground md:block">
              Astuce : sur l'agenda, <kbd className="rounded border border-border px-1 font-mono text-[10px]">⌘V</kbd>{" "}
              avec un lien ou une affiche lance l'import directement, et{" "}
              <kbd className="rounded border border-border px-1 font-mono text-[10px]">N</kbd> ouvre cette fenêtre
              depuis n'importe quelle page.
            </p>
          </div>

          {busy ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90 text-center backdrop-blur-[2px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{busy.label}</p>
                <p className="text-xs text-muted-foreground">
                  {busy.kind === "image"
                    ? "L'IA lit l'affiche, ça prend quelques secondes."
                    : "Récupération du titre, de la date, du lieu et de l'image."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
