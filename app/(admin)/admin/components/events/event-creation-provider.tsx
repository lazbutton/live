"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import type { EventGenreOption } from "@/lib/events/event-details";
import { fetchFestivalCandidates, type FestivalCandidate } from "@/lib/events/festivals";
import type { ImportedEventPayload, ImportedEventWarning } from "@/lib/events/imported-event-payload";

import type {
  ArtistOption,
  CategoryOption,
  EventFormPrefill,
  LocationData,
  OrganizerOption,
  TagOption,
} from "./types";
import { EventFormSheet } from "./event-form-sheet";
import {
  EventCreateLauncher,
  type EventCreateLauncherResult,
  type EventCreateLauncherSeed,
} from "./event-create-launcher";
import {
  buildEventFormPrefillFromImport,
  resolveTagIdsForImport,
} from "./event-import-utils";
import { buildEventFormPrefillFromEvent } from "./event-duplicate-utils";

/** Événement global émis après chaque création, pour rafraîchir les vues. */
export const ADMIN_EVENTS_CHANGED = "admin:events-changed";

export function notifyAdminEventsChanged(eventId?: string) {
  window.dispatchEvent(new CustomEvent(ADMIN_EVENTS_CHANGED, { detail: { eventId } }));
}

/** Abonne une vue aux créations/modifications d'événements faites ailleurs. */
export function useAdminEventsChanged(callback: () => void) {
  const callbackRef = React.useRef(callback);

  React.useEffect(() => {
    callbackRef.current = callback;
  });

  React.useEffect(() => {
    const handler = () => callbackRef.current();
    window.addEventListener(ADMIN_EVENTS_CHANGED, handler);
    return () => window.removeEventListener(ADMIN_EVENTS_CHANGED, handler);
  }, []);
}

type EventCreationOptions = {
  /** Date pré-sélectionnée (ex. clic sur un jour du calendrier). */
  date?: Date;
  /** Ouvre directement le formulaire pré-rempli, sans passer par le lanceur. */
  prefill?: EventFormPrefill;
  /** Provenance affichée dans le formulaire (« Pré-rempli depuis … »). */
  sourceLabel?: string;
  /** Lien à importer dès l'ouverture du lanceur. */
  importUrl?: string;
  /** Lieu ou organisateur présélectionné dans le lanceur (ex. depuis la Collecte). */
  ownerId?: string;
  /**
   * Données déjà extraites (demande scrapée…) : rapprochées des lieux, catégories,
   * artistes et tags existants avant d'ouvrir le formulaire.
   */
  importData?: { data: ImportedEventPayload; sourceUrl?: string; sourceLabel: string };
  /** Appelé après le premier enregistrement (ex. marquer une demande convertie). */
  onSaved?: (eventId: string) => void | Promise<void>;
};

type EventCreationContextValue = {
  openEventCreation: (options?: EventCreationOptions) => void;
  /** Lieux, organisateurs, artistes, tags et catégories (chargés une fois, partagés). */
  loadReferences: () => Promise<ReferenceData>;
};

const EventCreationContext = React.createContext<EventCreationContextValue | null>(null);

export function useEventCreation() {
  const context = React.useContext(EventCreationContext);
  if (!context) {
    throw new Error("useEventCreation doit être utilisé dans EventCreationProvider.");
  }
  return context;
}

type ReferenceData = {
  locations: LocationData[];
  organizers: OrganizerOption[];
  artists: ArtistOption[];
  tags: TagOption[];
  categories: CategoryOption[];
  /** Festivals que l'import peut retenir (`fetchFestivalCandidates`). */
  festivals: FestivalCandidate[];
  /** Genres (event_genres) : ceux que la page nomme sont repris. */
  genres: EventGenreOption[];
};

const EMPTY_REFERENCES: ReferenceData = {
  locations: [],
  organizers: [],
  artists: [],
  tags: [],
  categories: [],
  festivals: [],
  genres: [],
};

async function fetchTags() {
  const { data, error } = await supabase.from("tags").select("id, name").order("name");
  if (error) throw error;
  return (data || []) as TagOption[];
}

async function fetchReferenceData(): Promise<ReferenceData> {
  const [locationsRes, organizersRes, organizerLocationsRes, artistsRes, tags, categoriesRes] =
    await Promise.all([
      supabase
        .from("locations")
        .select("id, name, address, capacity, latitude, longitude, city_id, city:cities(id, label)"),
      supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name"),
      supabase
        .from("locations")
        .select("id, name, instagram_url, facebook_url")
        .eq("is_organizer", true)
        .order("name"),
      supabase.from("artists").select("id, name, slug, image_url, origin_city").order("name"),
      fetchTags(),
      supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    ]);

  for (const result of [locationsRes, organizersRes, organizerLocationsRes, artistsRes, categoriesRes]) {
    if (result.error) throw result.error;
  }

  const locations = ((locationsRes.data || []) as any[]).map((location) => ({
    ...location,
    city: Array.isArray(location.city) ? (location.city[0] ?? null) : (location.city ?? null),
  })) as LocationData[];

  const organizers: OrganizerOption[] = [
    ...((organizersRes.data || []) as any[]).map((organizer) => ({
      ...organizer,
      type: "organizer" as const,
    })),
    ...((organizerLocationsRes.data || []) as any[]).map((location) => ({
      ...location,
      type: "location" as const,
    })),
  ];

  const categories = (categoriesRes.data || []) as CategoryOption[];
  // Sans les genres (migration pas encore appliquée), l'import marche sans eux.
  const genres = await supabase
    .from("event_genres")
    .select("id, category_id, name, phrase, display_order, is_active")
    .then(({ data, error }) => {
      if (error) console.warn("Genres indisponibles pour l'import:", error);
      return (data || []) as EventGenreOption[];
    });
  // Sans les festivals (migration pas encore appliquée, erreur passagère), l'import marche sans rattachement.
  const festivals = await fetchFestivalCandidates(supabase, categories).catch((error) => {
    console.warn("Festivals indisponibles pour l'import:", error);
    return [] as FestivalCandidate[];
  });

  return {
    locations,
    organizers,
    artists: (artistsRes.data || []) as ArtistOption[],
    tags,
    categories,
    festivals,
    genres,
  };
}

/** Libellés de provenance insérés dans « Pré-rempli depuis … ». */
const NOTICE_SOURCE_LABELS: Record<string, string> = {
  "Événement Facebook": "un événement Facebook",
  "Post Instagram": "un post Instagram",
  Image: "une image",
  Affiche: "une affiche",
};

function toLocalDayString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Place une copie au jour choisi en gardant l'heure (et la durée) d'origine. */
function moveFormDatesToDay(
  form: NonNullable<EventFormPrefill["form"]>,
  day: Date,
): NonNullable<EventFormPrefill["form"]> {
  const start = form.date || "";
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(start);
  if (!match) return form;

  const targetDay = toLocalDayString(day);
  const next = { ...form, date: `${targetDay}T${match[2]}` };

  const endMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(form.end_date || "");
  if (endMatch) {
    const offsetDays = Math.round(
      (new Date(`${endMatch[1]}T00:00:00`).getTime() - new Date(`${match[1]}T00:00:00`).getTime()) /
        86_400_000,
    );
    const endDay = new Date(`${targetDay}T00:00:00`);
    endDay.setDate(endDay.getDate() + offsetDays);
    next.end_date = `${toLocalDayString(endDay)}T${endMatch[2]}`;
  }
  return next;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Pages où un lien ou une affiche collé (⌘V hors champ) lance la création. */
const PASTE_TO_CREATE_PATHS = ["/admin/dashboard", "/admin/events", "/admin/intake"];

function looksLikeUrl(text: string) {
  return /^(https?:\/\/|www\.)\S+$/i.test(text.trim());
}

export function EventCreationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [references, setReferences] = React.useState<ReferenceData>(EMPTY_REFERENCES);
  const [launcherSeed, setLauncherSeed] = React.useState<EventCreateLauncherSeed | null>(null);
  const [launcherOwnerId, setLauncherOwnerId] = React.useState<string | undefined>(undefined);
  // Rappel propre à la création en cours (ex. conversion d'une demande).
  const sessionOnSavedRef = React.useRef<EventCreationOptions["onSaved"]>(undefined);
  const referencesPromiseRef = React.useRef<Promise<ReferenceData> | null>(null);

  const [launcherOpen, setLauncherOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [contextDate, setContextDate] = React.useState<Date | undefined>(undefined);
  const [prefill, setPrefill] = React.useState<EventFormPrefill | undefined>(undefined);
  const [importNotice, setImportNotice] = React.useState<{
    sourceLabel: string;
    warnings: ImportedEventWarning[];
    method?: string;
  } | null>(null);

  const ensureReferences = React.useCallback(() => {
    if (!referencesPromiseRef.current) {
      referencesPromiseRef.current = fetchReferenceData()
        .then((data) => {
          setReferences(data);
          return data;
        })
        .catch((error) => {
          referencesPromiseRef.current = null;
          throw error;
        });
    }
    return referencesPromiseRef.current;
  }, []);

  const reloadTags = React.useCallback(async () => {
    const tags = await fetchTags();
    setReferences((current) => ({ ...current, tags }));
    return tags;
  }, []);

  const openSheet = React.useCallback(
    async (nextPrefill: EventFormPrefill | undefined, notice: typeof importNotice = null) => {
      try {
        await ensureReferences();
      } catch (error) {
        console.error("Référentiels indisponibles:", error);
        toast({
          title: "Formulaire indisponible",
          description: "Les lieux et catégories n'ont pas pu être chargés. Réessaie.",
          variant: "destructive",
        });
        return;
      }
      setPrefill(nextPrefill);
      setImportNotice(notice);
      setLauncherOpen(false);
      setSheetOpen(true);
    },
    [ensureReferences],
  );

  /** Rapproche des données importées des référentiels puis ouvre le formulaire pré-rempli. */
  const openImported = React.useCallback(
    async (args: {
      data: ImportedEventPayload;
      sourceUrl?: string;
      owner?: OrganizerOption;
      sourceLabel: string;
      warnings?: ImportedEventWarning[];
      method?: string;
    }) => {
      let refs: ReferenceData;
      try {
        refs = await ensureReferences();
      } catch (error) {
        console.error("Référentiels indisponibles:", error);
        toast({
          title: "Formulaire indisponible",
          description: "Les lieux et catégories n'ont pas pu être chargés. Réessaie.",
          variant: "destructive",
        });
        return;
      }
      const { prefill: importedPrefill, warnings } = await buildEventFormPrefillFromImport({
        data: args.data,
        sourceUrl: args.sourceUrl,
        owner: args.owner,
        categories: refs.categories,
        locations: refs.locations,
        organizers: refs.organizers,
        artists: refs.artists,
        festivals: refs.festivals,
        genres: refs.genres,
        // Seuls les tags existants sont repris : les suggestions de l'IA ne créent rien.
        findOrCreateTagIds: (rawTagNames: string[]) => resolveTagIdsForImport({ rawTagNames, tags: refs.tags }),
        defaultStatus: "pending",
      });
      await openSheet(importedPrefill, {
        sourceLabel: NOTICE_SOURCE_LABELS[args.sourceLabel] ?? args.sourceLabel,
        warnings: [...(args.warnings || []), ...warnings],
        method: args.method,
      });
    },
    [ensureReferences, openSheet],
  );

  const openEventCreation = React.useCallback(
    (options?: EventCreationOptions) => {
      sessionOnSavedRef.current = options?.onSaved;
      setLauncherOwnerId(options?.ownerId);
      setLauncherSeed(options?.importUrl ? { id: Date.now(), text: options.importUrl } : null);
      setContextDate(options?.date);
      void ensureReferences().catch(() => undefined);
      if (options?.importData) {
        setLauncherOpen(false);
        void openImported({
          data: options.importData.data,
          sourceUrl: options.importData.sourceUrl,
          sourceLabel: options.importData.sourceLabel,
          method: typeof options.importData.data.scrape_method === "string" ? options.importData.data.scrape_method : undefined,
        });
        return;
      }
      if (options?.prefill) {
        void openSheet(
          options.prefill,
          options.sourceLabel ? { sourceLabel: options.sourceLabel, warnings: [] } : null,
        );
        return;
      }
      setSheetOpen(false);
      setLauncherOpen(true);
    },
    [ensureReferences, openImported, openSheet],
  );

  const handleLauncherResult = React.useCallback(
    async (result: EventCreateLauncherResult) => {
      if (result.kind === "manual") {
        const form: NonNullable<EventFormPrefill["form"]> = {};
        if (result.title) form.title = result.title;
        if (result.externalUrl) {
          form.external_url = result.externalUrl;
          form.scraping_url = result.externalUrl;
        }
        await openSheet(Object.keys(form).length ? { form } : undefined);
        return;
      }

      if (result.kind === "duplicate") {
        const duplicatePrefill = buildEventFormPrefillFromEvent(result.event);
        if (contextDate && duplicatePrefill.form) {
          duplicatePrefill.form = moveFormDatesToDay(duplicatePrefill.form, contextDate);
        }
        await openSheet(duplicatePrefill, {
          sourceLabel: `une copie de « ${result.event.title || "Sans titre"} »`,
          warnings: [],
        });
        return;
      }

      await openImported({
        data: result.data,
        sourceUrl: result.sourceUrl,
        owner: result.owner,
        sourceLabel: result.sourceLabel,
        warnings: result.warnings,
        method: result.method,
      });
    },
    [contextDate, openImported, openSheet],
  );

  // Raccourci clavier « N » : nouvel événement depuis n'importe quelle page.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "n") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
        return;
      }
      event.preventDefault();
      openEventCreation();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openEventCreation]);

  // ⌘V hors d'un champ sur l'agenda ou le tableau de bord : lien ou affiche → lanceur.
  React.useEffect(() => {
    if (!pathname || !PASTE_TO_CREATE_PATHS.some((path) => pathname.startsWith(path))) return;

    function handlePaste(event: ClipboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
        return;
      }
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) =>
        entry.type.startsWith("image/"),
      );
      const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (!file && !looksLikeUrl(text)) return;

      event.preventDefault();
      sessionOnSavedRef.current = undefined;
      setContextDate(undefined);
      void ensureReferences().catch(() => undefined);
      setLauncherSeed({ id: Date.now(), file, text: file ? undefined : text });
      setSheetOpen(false);
      setLauncherOpen(true);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [ensureReferences, pathname]);

  const contextValue = React.useMemo(
    () => ({ openEventCreation, loadReferences: ensureReferences }),
    [ensureReferences, openEventCreation],
  );

  return (
    <EventCreationContext.Provider value={contextValue}>
      {children}

      <EventCreateLauncher
        open={launcherOpen}
        onOpenChange={(next) => {
          setLauncherOpen(next);
          if (!next) sessionOnSavedRef.current = undefined;
        }}
        organizers={references.organizers}
        contextDate={contextDate}
        seed={launcherSeed}
        initialOwnerId={launcherOwnerId}
        onResult={handleLauncherResult}
        loadReferences={ensureReferences}
        onAgendaImported={() => notifyAdminEventsChanged()}
      />

      <EventFormSheet
        event={null}
        open={sheetOpen}
        onOpenChange={(next) => {
          setSheetOpen(next);
          if (!next) {
            setPrefill(undefined);
            setImportNotice(null);
            // Le formulaire ferme avant d'appeler onSaved : on attend un tick
            // pour ne pas perdre le rappel de session lors d'un enregistrement.
            window.setTimeout(() => {
              sessionOnSavedRef.current = undefined;
            }, 0);
          }
        }}
        locations={references.locations}
        organizers={references.organizers}
        artists={references.artists}
        tags={references.tags}
        categories={references.categories}
        defaultDate={contextDate}
        prefill={prefill}
        importNotice={importNotice}
        allowCreateAnother
        onTagCreated={() => void reloadTags()}
        onSaved={(eventId) => {
          // Le rappel de session ne s'applique qu'au premier événement enregistré.
          const sessionOnSaved = sessionOnSavedRef.current;
          sessionOnSavedRef.current = undefined;
          void Promise.resolve(sessionOnSaved?.(eventId)).finally(() =>
            notifyAdminEventsChanged(eventId),
          );
        }}
      />
    </EventCreationContext.Provider>
  );
}
