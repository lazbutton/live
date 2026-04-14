"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type {
  AdminEvent,
  ArtistOption,
  CategoryOption,
  EventFormPrefill,
  LocationData,
  OrganizerOption,
  TagOption,
} from "./types";
import {
  buildEventFormPrefillFromImport,
  resolveTagIdsForImport,
} from "./event-import-utils";
import { EventFiltersBar } from "./event-filters-bar";
import { EventsCalendar } from "./events-calendar";
import { EventCard } from "./event-card";
import { EventArtistsQuickDialog } from "./event-artists-quick-dialog";
import { EventFormSheet } from "./event-form-sheet";
import {
  EventImportDialog,
  type ScrapedEventPayload,
} from "./event-import-dialog";
import { EventImageImportDialog } from "./event-image-import-dialog";
import { FacebookEventImportDialog } from "./facebook-event-import-dialog";
import { parseDateWithoutTimezone } from "@/lib/date-utils";

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function isFuzzyTokenMatch(queryToken: string, candidateToken: string) {
  if (!queryToken || !candidateToken) return false;
  if (candidateToken.includes(queryToken)) {
    return true;
  }

  // Ne pas appliquer de fuzzy sur les mots trop courts (trop de faux positifs)
  if (queryToken.length < 5) return false;

  // Limiter les différences de longueur entre les tokens comparés
  if (Math.abs(candidateToken.length - queryToken.length) > 2) return false;

  // Tolérance progressive selon la longueur du mot saisi
  const maxDistance = queryToken.length >= 9 ? 2 : 1;

  // Compare token complet (plus strict que le préfixe)
  return levenshteinDistance(queryToken, candidateToken) <= maxDistance;
}

function matchesEventSearch(event: AdminEvent, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return true;

  const searchableParts = [
    event.title || "",
    event.description || "",
    event.category || "",
    event.location?.name || "",
    event.major_event_events?.[0]?.major_event?.title || "",
  ];

  const searchableText = normalizeSearchText(searchableParts.join(" "));
  if (!searchableText) return false;
  if (searchableText.includes(query)) return true;

  const queryTokens = query.split(" ").filter(Boolean);
  const candidateTokens = searchableText.split(" ").filter(Boolean);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return false;

  // Tous les tokens saisis doivent matcher au moins un token candidat (exact/fuzzy)
  return queryTokens.every((queryToken) =>
    candidateTokens.some((candidateToken) =>
      isFuzzyTokenMatch(queryToken, candidateToken),
    ),
  );
}

function isEventLongerThan24Hours(
  event: Pick<AdminEvent, "date" | "end_date">,
) {
  if (!event.end_date) return false;

  const start = parseDateWithoutTimezone(event.date);
  const end = parseDateWithoutTimezone(event.end_date);

  if (!start || !end) {
    return false;
  }

  return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
}

function getEventOrganizerIds(event: AdminEvent) {
  const rawIds =
    event.event_organizers?.flatMap((entry) => [
      entry.organizer?.id,
      entry.location?.id,
    ]) ?? [];
  return Array.from(new Set(rawIds.filter(Boolean) as string[]));
}

export function EventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(true);

  const [events, setEvents] = React.useState<AdminEvent[]>([]);
  const [locations, setLocations] = React.useState<LocationData[]>([]);
  const [organizers, setOrganizers] = React.useState<OrganizerOption[]>([]);
  const [artists, setArtists] = React.useState<ArtistOption[]>([]);
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"calendar" | "list">("calendar");
  const [selectedOrganizerIds, setSelectedOrganizerIds] = React.useState<string[]>(
    [],
  );
  const [filterStatus, setFilterStatus] = React.useState<
    "all" | "pending" | "approved"
  >("all");
  const [hideLongEvents, setHideLongEvents] = React.useState(false);

  const [selectedEvent, setSelectedEvent] = React.useState<AdminEvent | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [artistsDialogEvent, setArtistsDialogEvent] =
    React.useState<AdminEvent | null>(null);
  const [isArtistsDialogOpen, setIsArtistsDialogOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isImageImportOpen, setIsImageImportOpen] = React.useState(false);
  const [isFacebookImportOpen, setIsFacebookImportOpen] = React.useState(false);
  const [defaultDate, setDefaultDate] = React.useState<Date | undefined>(
    undefined,
  );
  const [prefill, setPrefill] = React.useState<EventFormPrefill | undefined>(
    undefined,
  );

  const loadCategories = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    setCategories((data || []) as CategoryOption[]);
  }, []);

  const loadOrganizers = React.useCallback(async () => {
    const { data: organizersData, error: orgError } = await supabase
      .from("organizers")
      .select("id, name, instagram_url, facebook_url")
      .order("name");
    if (orgError) throw orgError;

    const { data: locationsData, error: locError } = await supabase
      .from("locations")
      .select("id, name, instagram_url, facebook_url")
      .eq("is_organizer", true)
      .order("name");
    if (locError) throw locError;

    const all: OrganizerOption[] = [
      ...((organizersData || []) as any[]).map((o) => ({
        ...o,
        type: "organizer" as const,
      })),
      ...((locationsData || []) as any[]).map((l) => ({
        ...l,
        type: "location" as const,
      })),
    ];
    setOrganizers(all);
  }, []);

  const loadTags = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("tags")
      .select("id, name")
      .order("name");
    if (error) throw error;
    setTags((data || []) as TagOption[]);
  }, []);

  const loadArtists = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("artists")
      .select("id, name, slug, image_url, origin_city")
      .order("name", { ascending: true });
    if (error) throw error;
    setArtists((data || []) as ArtistOption[]);
  }, []);

  const loadLocations = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("locations")
      .select(
        "id, name, address, capacity, latitude, longitude, city_id, city:cities(id, label)",
      );
    if (error) throw error;
    const normalizedLocations = ((data || []) as any[]).map((location) => ({
      ...location,
      city: Array.isArray(location.city)
        ? (location.city[0] ?? null)
        : (location.city ?? null),
    }));
    setLocations(normalizedLocations as LocationData[]);
  }, []);

  const loadEvents = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select(
        `
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
      `,
      )
      .order("date", { ascending: true });

    if (error) throw error;
    setEvents((data || []) as AdminEvent[]);
  }, []);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadEvents(),
        loadLocations(),
        loadOrganizers(),
        loadArtists(),
        loadTags(),
        loadCategories(),
      ]);
    } catch (e) {
      console.error("Erreur chargement events:", e);
      toast({
        title: "Chargement impossible",
        description: "Vérifie ta connexion et réessaie.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    loadArtists,
    loadCategories,
    loadEvents,
    loadLocations,
    loadOrganizers,
    loadTags,
  ]);

  const findOrCreateTagIds = React.useCallback(
    async (rawTagNames: string[]) => {
      return resolveTagIdsForImport({
        rawTagNames,
        tags,
        onTagsChanged: loadTags,
      });
    },
    [loadTags, tags],
  );

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // init depuis query params (status/create/import)
  const didInitFromQuery = React.useRef(false);
  React.useEffect(() => {
    if (didInitFromQuery.current) return;
    if (!searchParams) return;
    didInitFromQuery.current = true;

    const params = new URLSearchParams(searchParams.toString());

    const statusParam = params.get("status");
    if (
      statusParam === "pending" ||
      statusParam === "approved" ||
      statusParam === "all"
    ) {
      setFilterStatus(statusParam);
    }

    const createParam = params.get("create");
    const importParam = params.get("import");
    const facebookImportParam = params.get("facebook_import");

    const shouldOpenCreate = createParam === "1";
    const shouldOpenImport = importParam === "1";
    const shouldOpenFacebookImport = facebookImportParam === "1";

    if (shouldOpenCreate) {
      openCreate();
      params.delete("create");
    }
    if (shouldOpenImport) {
      setIsImportOpen(true);
      params.delete("import");
    }
    if (shouldOpenFacebookImport) {
      setIsFacebookImportOpen(true);
      params.delete("facebook_import");
    }

    if (shouldOpenCreate || shouldOpenImport || shouldOpenFacebookImport) {
      const q = params.toString();
      router.replace(q ? `/admin/events?${q}` : "/admin/events");
    }
  }, [searchParams, router]);

  const filteredEvents = React.useMemo(() => {
    let filtered = [...events];

    if (filterStatus !== "all") {
      filtered = filtered.filter((ev) => ev.status === filterStatus);
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((ev) => matchesEventSearch(ev, searchQuery));
    }

    if (hideLongEvents) {
      filtered = filtered.filter((ev) => !isEventLongerThan24Hours(ev));
    }

    if (selectedOrganizerIds.length > 0) {
      filtered = filtered.filter((event) => {
        const organizerIds = getEventOrganizerIds(event);
        return organizerIds.some((id) => selectedOrganizerIds.includes(id));
      });
    }

    filtered.sort(
      (a, b) =>
        (parseDateWithoutTimezone(a.date)?.getTime() ?? 0) -
        (parseDateWithoutTimezone(b.date)?.getTime() ?? 0),
    );
    return filtered;
  }, [events, filterStatus, hideLongEvents, searchQuery, selectedOrganizerIds]);

  const pendingCount = React.useMemo(() => {
    // count pending with current search, independent of status toggle
    let base = [...events];
    if (searchQuery.trim()) {
      base = base.filter((ev) => matchesEventSearch(ev, searchQuery));
    }
    if (hideLongEvents) {
      base = base.filter((ev) => !isEventLongerThan24Hours(ev));
    }
    if (selectedOrganizerIds.length > 0) {
      base = base.filter((event) => {
        const organizerIds = getEventOrganizerIds(event);
        return organizerIds.some((id) => selectedOrganizerIds.includes(id));
      });
    }
    return base.filter((ev) => ev.status === "pending").length;
  }, [events, hideLongEvents, searchQuery, selectedOrganizerIds]);

  const organizerFilterOptions = React.useMemo(
    () =>
      organizers
        .map((organizer) => ({
          value: organizer.id,
          label:
            organizer.type === "location"
              ? `${organizer.name} (Lieu)`
              : organizer.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [organizers],
  );

  React.useEffect(() => {
    if (searchQuery.trim()) {
      setViewMode("list");
    }
  }, [searchQuery]);

  function resetFilters() {
    setSearchQuery("");
    setFilterStatus("all");
    setHideLongEvents(false);
    setSelectedOrganizerIds([]);
  }

  function openCreate(date?: Date) {
    setSelectedEvent(null);
    setPrefill(undefined);
    setDefaultDate(date);
    setIsFormOpen(true);
  }

  function openEditEvent(event: AdminEvent) {
    setSelectedEvent(event);
    setPrefill(undefined);
    setDefaultDate(undefined);
    setIsFormOpen(true);
  }

  function openArtistsDialog(event: AdminEvent) {
    setArtistsDialogEvent(event);
    setIsArtistsDialogOpen(true);
  }

  async function quickApprove(eventId: string) {
    try {
      // update status
      const { data: before } = await supabase
        .from("events")
        .select("title, status")
        .eq("id", eventId)
        .single();

      const { error } = await supabase
        .from("events")
        .update({ status: "approved" })
        .eq("id", eventId);
      if (error) throw error;

      // notify (best effort)
      try {
        await fetch(`/api/admin/events/${eventId}/notify-organizers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "event_approved",
            title: "Événement approuvé",
            message: `Votre événement "${before?.title || "Sans titre"}" a été approuvé et est maintenant visible sur la plateforme.`,
            metadata: { old_status: before?.status, new_status: "approved" },
          }),
        });
      } catch (e) {
        console.error("Notif approve (ignored):", e);
      }

      toast({ title: "Événement approuvé", variant: "success" });
      await loadEvents();
    } catch (e: any) {
      console.error("Erreur approve:", e);
      toast({
        title: "Approbation impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  async function bulkApprove(eventIds: string[]) {
    if (eventIds.length === 0) return;
    try {
      const { error } = await supabase
        .from("events")
        .update({ status: "approved" })
        .in("id", eventIds);
      if (error) throw error;
      toast({
        title: `${eventIds.length} événement${eventIds.length > 1 ? "s" : ""} approuvé${eventIds.length > 1 ? "s" : ""}`,
        variant: "success",
      });
      await loadEvents();
    } catch (e: any) {
      console.error("Erreur bulk approve:", e);
      toast({
        title: "Approbation en lot impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  async function saveQuickArtists(event: AdminEvent, artistIds: string[]) {
    try {
      const { error: deleteError } = await supabase
        .from("event_artists")
        .delete()
        .eq("event_id", event.id);
      if (deleteError) throw deleteError;

      if (artistIds.length > 0) {
        const entries = artistIds.map((artistId, index) => ({
          event_id: event.id,
          artist_id: artistId,
          sort_index: index,
          role_label: null,
        }));

        const { error: insertError } = await supabase
          .from("event_artists")
          .insert(entries);
        if (insertError) throw insertError;
      }

      toast({ title: "Artistes mis à jour", variant: "success" });
      await loadEvents();
      return true;
    } catch (e: any) {
      console.error("Erreur artistes event:", e);
      toast({
        title: "Mise à jour impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
      return false;
    }
  }

  async function toggleEventFull(event: AdminEvent) {
    const nextIsFull = !Boolean(event.is_full);

    try {
      const { error } = await supabase
        .from("events")
        .update({ is_full: nextIsFull })
        .eq("id", event.id);
      if (error) throw error;

      toast({
        title: nextIsFull ? "Événement marqué complet" : "Événement rouvert",
        variant: "success",
      });
      await loadEvents();
    } catch (e: any) {
      console.error("Erreur is_full:", e);
      toast({
        title: "Action impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  async function toggleEventFeatured(event: AdminEvent) {
    const nextIsFeatured = !Boolean(event.is_featured);

    try {
      const { error } = await supabase
        .from("events")
        .update({ is_featured: nextIsFeatured })
        .eq("id", event.id);
      if (error) throw error;

      toast({
        title: nextIsFeatured
          ? "Événement mis à la une"
          : "Événement retiré de la une",
        variant: "success",
      });
      await loadEvents();
    } catch (e: any) {
      console.error("Erreur is_featured:", e);
      toast({
        title: "Action impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  async function handleImported(payload: {
    sourceUrl: string;
    owner?: OrganizerOption;
    data: ScrapedEventPayload;
  }) {
    const { prefill: importedPrefill } = await buildEventFormPrefillFromImport({
      data: payload.data || {},
      sourceUrl: payload.sourceUrl,
      owner: payload.owner,
      categories,
      locations,
      organizers,
      findOrCreateTagIds,
      defaultStatus: "pending",
    });

    setPrefill(importedPrefill);
    setDefaultDate(undefined);
    setSelectedEvent(null);
    setIsFormOpen(true);
  }

  async function handleImageImported(payload: { data: ScrapedEventPayload }) {
    const { prefill: importedPrefill } = await buildEventFormPrefillFromImport({
      data: payload.data || {},
      categories,
      locations,
      organizers,
      findOrCreateTagIds,
      defaultStatus: "pending",
    });

    setPrefill(importedPrefill);
    setDefaultDate(undefined);
    setSelectedEvent(null);
    setIsFormOpen(true);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-full" />
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EventFiltersBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        hideLongEvents={hideLongEvents}
        onHideLongEventsChange={setHideLongEvents}
        pendingCount={pendingCount}
        onCreateClick={() => openCreate()}
        onImportFromImageClick={() => setIsImageImportOpen(true)}
        onImportFromUrlClick={() => setIsImportOpen(true)}
        onImportFromFacebookClick={() => setIsFacebookImportOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        organizerFilterOptions={organizerFilterOptions}
        selectedOrganizerIds={selectedOrganizerIds}
        onOrganizerFilterChange={setSelectedOrganizerIds}
        onResetFilters={resetFilters}
      />

      {viewMode === "calendar" ? (
        <EventsCalendar
          events={filteredEvents}
          onEventClick={openEditEvent}
          onCreateAtDate={(date) => openCreate(date)}
          onQuickApprove={quickApprove}
          onBulkApprove={bulkApprove}
          onOpenArtistsDialog={openArtistsDialog}
          onToggleFull={toggleEventFull}
          onToggleFeatured={toggleEventFeatured}
        />
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {filteredEvents.length} événement{filteredEvents.length > 1 ? "s" : ""}
            </div>
            {filteredEvents.some((event) => event.status === "pending") ? (
              <Button
                type="button"
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() =>
                  void bulkApprove(
                    filteredEvents
                      .filter((event) => event.status === "pending")
                      .map((event) => event.id),
                  )
                }
              >
                Tout approuver (liste)
              </Button>
            ) : null}
          </div>

          {filteredEvents.length === 0 ? (
            <div className="rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              Aucun événement trouvé pour ces filtres.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onClick={() => openEditEvent(event)}
                  onQuickApprove={
                    event.status === "pending"
                      ? () => quickApprove(event.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </Card>
      )}

      <EventFormSheet
        event={selectedEvent}
        open={isFormOpen}
        onOpenChange={(o) => {
          setIsFormOpen(o);
          if (!o) {
            setSelectedEvent(null);
            setPrefill(undefined);
            setDefaultDate(undefined);
          }
        }}
        locations={locations}
        organizers={organizers}
        artists={artists}
        tags={tags}
        categories={categories}
        defaultDate={defaultDate}
        prefill={prefill}
        onTagCreated={() => void loadTags()}
        onSaved={() => void loadEvents()}
        onDeleted={() => void loadEvents()}
      />

      <EventArtistsQuickDialog
        open={isArtistsDialogOpen}
        onOpenChange={(open) => {
          setIsArtistsDialogOpen(open);
          if (!open) {
            setArtistsDialogEvent(null);
          }
        }}
        event={artistsDialogEvent}
        artists={artists}
        onSave={saveQuickArtists}
      />

      <EventImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        organizers={organizers}
        onImported={handleImported}
      />

      <EventImageImportDialog
        open={isImageImportOpen}
        onOpenChange={setIsImageImportOpen}
        onImported={({ data }) => handleImageImported({ data })}
      />

      <FacebookEventImportDialog
        open={isFacebookImportOpen}
        onOpenChange={setIsFacebookImportOpen}
        organizers={organizers}
        onImported={handleImported}
      />
    </div>
  );
}
