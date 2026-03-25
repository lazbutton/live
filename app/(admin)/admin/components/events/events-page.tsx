"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toDatetimeLocal } from "@/lib/date-utils";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

import type { AdminEvent, ArtistOption, CategoryOption, LocationData, OrganizerOption, TagOption } from "./types";
import { EventFiltersBar } from "./event-filters-bar";
import { EventsCalendar } from "./events-calendar";
import { EventArtistsQuickDialog } from "./event-artists-quick-dialog";
import { EventFormSheet, type EventFormPrefill } from "./event-form-sheet";
import { EventImportDialog, type ScrapedEventPayload } from "./event-import-dialog";
import { FacebookEventImportDialog } from "./facebook-event-import-dialog";

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesEventSearch(event: AdminEvent, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const title = event.title?.toLowerCase() || "";
  const description = event.description?.toLowerCase() || "";
  const category = event.category?.toLowerCase() || "";
  const location = event.location?.name?.toLowerCase() || "";
  const majorEvent = event.major_event_events?.[0]?.major_event?.title?.toLowerCase() || "";

  return (
    title.includes(query) ||
    description.includes(query) ||
    category.includes(query) ||
    location.includes(query) ||
    majorEvent.includes(query)
  );
}

function isEventLongerThan24Hours(event: Pick<AdminEvent, "date" | "end_date">) {
  if (!event.end_date) return false;

  const start = new Date(event.date);
  const end = new Date(event.end_date);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }

  return end.getTime() - start.getTime() > 24 * 60 * 60 * 1000;
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
  const [filterStatus, setFilterStatus] = React.useState<"all" | "pending" | "approved">("all");
  const [hideLongEvents, setHideLongEvents] = React.useState(false);

  const [selectedEvent, setSelectedEvent] = React.useState<AdminEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [artistsDialogEvent, setArtistsDialogEvent] = React.useState<AdminEvent | null>(null);
  const [isArtistsDialogOpen, setIsArtistsDialogOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);
  const [isFacebookImportOpen, setIsFacebookImportOpen] = React.useState(false);
  const [defaultDate, setDefaultDate] = React.useState<Date | undefined>(undefined);
  const [prefill, setPrefill] = React.useState<EventFormPrefill | undefined>(undefined);

  const loadCategories = React.useCallback(async () => {
    const { data, error } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");
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
      ...((organizersData || []) as any[]).map((o) => ({ ...o, type: "organizer" as const })),
      ...((locationsData || []) as any[]).map((l) => ({ ...l, type: "location" as const })),
    ];
    setOrganizers(all);
  }, []);

  const loadTags = React.useCallback(async () => {
    const { data, error } = await supabase.from("tags").select("id, name").order("name");
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
      .select("id, name, address, capacity, latitude, longitude, city_id, city:cities(id, label)");
    if (error) throw error;
    const normalizedLocations = ((data || []) as any[]).map((location) => ({
      ...location,
      city: Array.isArray(location.city) ? (location.city[0] ?? null) : (location.city ?? null),
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
      await Promise.all([loadEvents(), loadLocations(), loadOrganizers(), loadArtists(), loadTags(), loadCategories()]);
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
  }, [loadArtists, loadCategories, loadEvents, loadLocations, loadOrganizers, loadTags]);

  const resolveCategoryId = React.useCallback(
    (rawCategory?: string | null) => {
      const raw = (rawCategory || "").trim();
      if (!raw) return categories[0]?.id || "";

      const byId = categories.find((category) => category.id === raw);
      if (byId) return byId.id;

      const normalizedRaw = normalizeSearchValue(raw);
      const byName = categories.find((category) => normalizeSearchValue(category.name) === normalizedRaw);
      return byName?.id || categories[0]?.id || "";
    },
    [categories],
  );

  const resolveLocationFromScrapedData = React.useCallback(
    (locationName?: string | null, address?: string | null) => {
      const candidates = [locationName, address]
        .flatMap((value) => {
          const raw = (value || "").trim();
          if (!raw) return [];
          return [raw, raw.split(",")[0], raw.split(" - ")[0], raw.split(" • ")[0]].map((entry) => entry.trim());
        })
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

      for (const candidate of candidates) {
        const normalizedCandidate = normalizeSearchValue(candidate);
        const byName = locations.find((location) => normalizeSearchValue(location.name) === normalizedCandidate);
        if (byName) return byName;
      }

      for (const candidate of candidates) {
        const normalizedCandidate = normalizeSearchValue(candidate);
        const byPartialName = locations.find((location) => {
          const normalizedName = normalizeSearchValue(location.name);
          return normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName);
        });
        if (byPartialName) return byPartialName;
      }

      if (address) {
        const normalizedAddress = normalizeSearchValue(address);
        const byAddress = locations.find((location) => {
          const locationAddress = normalizeSearchValue(location.address || "");
          return (
            locationAddress.length > 0 &&
            (locationAddress.includes(normalizedAddress) || normalizedAddress.includes(locationAddress))
          );
        });
        if (byAddress) return byAddress;
      }

      return null;
    },
    [locations],
  );

  const resolveOrganizerFromName = React.useCallback(
    (organizerName?: string | null) => {
      const raw = (organizerName || "").trim();
      if (!raw) return null;

      const candidates = [raw, raw.split(",")[0], raw.split(" / ")[0], raw.split(" - ")[0]]
        .map((value) => value.trim())
        .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

      for (const candidate of candidates) {
        const normalizedCandidate = normalizeSearchValue(candidate);
        const exact = organizers.find((organizer) => normalizeSearchValue(organizer.name) === normalizedCandidate);
        if (exact) return exact;
      }

      for (const candidate of candidates) {
        const normalizedCandidate = normalizeSearchValue(candidate);
        const partial = organizers.find((organizer) => {
          const normalizedName = normalizeSearchValue(organizer.name);
          return normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName);
        });
        if (partial) return partial;
      }

      return null;
    },
    [organizers],
  );

  const findOrCreateTagIds = React.useCallback(
    async (rawTagNames: string[]) => {
      if (!Array.isArray(rawTagNames) || rawTagNames.length === 0) return [];

      const normalizedNames = rawTagNames
        .map((tag) => tag.trim())
        .filter((tag, index, array) => Boolean(tag) && array.indexOf(tag) === index);

      const resolvedIds: string[] = [];
      let shouldReloadTags = false;

      for (const tagName of normalizedNames) {
        const existingLocal = tags.find((tag) => normalizeSearchValue(tag.name) === normalizeSearchValue(tagName));
        if (existingLocal) {
          resolvedIds.push(existingLocal.id);
          continue;
        }

        const { data: existingRemote } = await supabase
          .from("tags")
          .select("id, name")
          .ilike("name", tagName)
          .maybeSingle();

        if (existingRemote?.id) {
          resolvedIds.push(existingRemote.id);
          continue;
        }

        const { data: createdTag, error } = await supabase
          .from("tags")
          .insert([{ name: tagName }])
          .select("id")
          .single();

        if (!error && createdTag?.id) {
          resolvedIds.push(createdTag.id);
          shouldReloadTags = true;
        }
      }

      if (shouldReloadTags) {
        await loadTags();
      }

      return [...new Set(resolvedIds)];
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
    if (statusParam === "pending" || statusParam === "approved" || statusParam === "all") {
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

    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return filtered;
  }, [events, filterStatus, hideLongEvents, searchQuery]);

  const pendingCount = React.useMemo(() => {
    // count pending with current search, independent of status toggle
    let base = [...events];
    if (searchQuery.trim()) {
      base = base.filter((ev) => matchesEventSearch(ev, searchQuery));
    }
    if (hideLongEvents) {
      base = base.filter((ev) => !isEventLongerThan24Hours(ev));
    }
    return base.filter((ev) => ev.status === "pending").length;
  }, [events, hideLongEvents, searchQuery]);

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
      const { data: before } = await supabase.from("events").select("title, status").eq("id", eventId).single();

      const { error } = await supabase.from("events").update({ status: "approved" }).eq("id", eventId);
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
      const { error } = await supabase.from("events").update({ status: "approved" }).in("id", eventIds);
      if (error) throw error;
      toast({ title: `${eventIds.length} événement${eventIds.length > 1 ? "s" : ""} approuvé${eventIds.length > 1 ? "s" : ""}`, variant: "success" });
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
      const { error: deleteError } = await supabase.from("event_artists").delete().eq("event_id", event.id);
      if (deleteError) throw deleteError;

      if (artistIds.length > 0) {
        const entries = artistIds.map((artistId, index) => ({
          event_id: event.id,
          artist_id: artistId,
          sort_index: index,
          role_label: null,
        }));

        const { error: insertError } = await supabase.from("event_artists").insert(entries);
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
      const { error } = await supabase.from("events").update({ is_full: nextIsFull }).eq("id", event.id);
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
      const { error } = await supabase.from("events").update({ is_featured: nextIsFeatured }).eq("id", event.id);
      if (error) throw error;

      toast({
        title: nextIsFeatured ? "Événement mis à la une" : "Événement retiré de la une",
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
    const d = payload.data || {};
    const rawTags = d.tags as unknown;
    const scrapedTags = Array.isArray(rawTags)
      ? rawTags.map((tag) => tag.toString().trim()).filter(Boolean)
      : [];
    const tagIds = await findOrCreateTagIds(scrapedTags);

    const matchedLocation =
      (typeof d.location_id === "string" ? locations.find((location) => location.id === d.location_id) || null : null) ||
      resolveLocationFromScrapedData(d.location, d.address);

    const resolvedLocationId =
      (typeof d.location_id === "string" && d.location_id) ||
      matchedLocation?.id ||
      (payload.owner?.type === "location" ? payload.owner.id : "");

    const organizerIds: string[] = [];
    const pushOrganizerId = (value?: string | null) => {
      if (value && !organizerIds.includes(value)) {
        organizerIds.push(value);
      }
    };

    if (payload.owner) {
      pushOrganizerId(payload.owner.id);
    }
    if (typeof d.organizer_id === "string") {
      pushOrganizerId(d.organizer_id);
    }
    if (typeof d.location_organizer_id === "string") {
      pushOrganizerId(d.location_organizer_id);
    }

    const matchedOrganizer = resolveOrganizerFromName(d.organizer);
    if (matchedOrganizer) {
      pushOrganizerId(matchedOrganizer.id);
    }

    const pre: EventFormPrefill = {
      form: {
        title: (d.title || "").toString(),
        description: (d.description || "").toString(),
        date: d.date ? toDatetimeLocal(String(d.date)) : "",
        end_date: d.end_date ? toDatetimeLocal(String(d.end_date)) : "",
        category: resolveCategoryId(typeof d.category === "string" ? d.category : ""),
        price: d.price != null ? String(d.price) : "",
        presale_price: d.presale_price != null ? String(d.presale_price) : "",
        subscriber_price: d.subscriber_price != null ? String(d.subscriber_price) : "",
        capacity:
          d.capacity != null
            ? String(d.capacity)
            : matchedLocation?.capacity != null
              ? String(matchedLocation.capacity)
              : "",
        is_full: Boolean(d.is_full),
        location_id: resolvedLocationId,
        room_id: "",
        door_opening_time: (d.door_opening_time || "").toString(),
        external_url: (d.external_url || payload.sourceUrl || "").toString(),
        external_url_label: (d.external_url_label || "").toString(),
        scraping_url: payload.sourceUrl,
        instagram_url:
          typeof d.instagram_url === "string" ? d.instagram_url : "",
        facebook_url:
          typeof d.facebook_url === "string" ? d.facebook_url : "",
        image_url: (d.image_url || "").toString(),
        status: "pending",
      },
      organizerIds,
      tagIds,
    };

    setPrefill(pre);
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
        onImportFromUrlClick={() => setIsImportOpen(true)}
        onImportFromFacebookClick={() => setIsFacebookImportOpen(true)}
      />

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

      <FacebookEventImportDialog
        open={isFacebookImportOpen}
        onOpenChange={setIsFacebookImportOpen}
        organizers={organizers}
        onImported={handleImported}
      />
    </div>
  );
}

