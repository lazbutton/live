"use client";

import * as React from "react";
import { CircleAlert, Loader2, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/date-utils";
import { compressImage } from "@/lib/image-compression";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { EventFormOverviewCard } from "@/components/events/event-form-overview-card";

import { EventImageUpload } from "./event-image-upload";
import type {
  AdminEvent,
  ArtistOption,
  CategoryOption,
  EventFormData,
  EventStatus,
  LocationData,
  OrganizerOption,
  RoomOption,
  TagOption,
} from "./types";

type MajorEventOption = {
  id: string;
  title: string;
  slug: string;
  city_name: string | null;
  start_at: string;
  status: string;
};

type QuickLocationFormState = {
  name: string;
  address: string;
  capacity: string;
  is_organizer: boolean;
};

type QuickOrganizerFormState = {
  name: string;
  instagram_url: string;
  facebook_url: string;
};

type QuickArtistFormState = {
  name: string;
  artist_type_label: string;
  short_description: string;
  instagram_url: string;
  website_url: string;
};

export type EventFormPrefill = Partial<{
  form: Partial<EventFormData>;
  organizerIds: string[];
  artistIds: string[];
  tagIds: string[];
}>;

export type EventFormSheetProps = {
  event: AdminEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: LocationData[];
  organizers: OrganizerOption[];
  artists: ArtistOption[];
  tags: TagOption[];
  categories: CategoryOption[];
  defaultDate?: Date;
  prefill?: EventFormPrefill;
  onTagCreated?: () => void;
  onSaved?: (eventId: string) => void;
  onDeleted?: (eventId: string) => void;
};

function toDatetimeLocalFromLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${da}T${h}:${mi}`;
}

function isBeforeToday(dateValue: string) {
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed.getTime() < today.getTime();
}

function emptyForm(): EventFormData {
  return {
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price: "",
    presale_price: "",
    subscriber_price: "",
    capacity: "",
    is_full: false,
    location_id: "",
    room_id: "",
    door_opening_time: "",
    external_url: "",
    external_url_label: "",
    instagram_url: "",
    facebook_url: "",
    scraping_url: "",
    image_url: "",
    status: "pending",
    is_featured: false,
    major_event_id: "",
  };
}

function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: EventStatus;
  onChange: (s: EventStatus) => void;
  disabled?: boolean;
}) {
  const items: Array<{ value: EventStatus; label: string; dot: string }> = [
    { value: "pending", label: "Pending", dot: "bg-amber-500" },
    { value: "approved", label: "Approved", dot: "bg-emerald-500" },
    { value: "rejected", label: "Rejected", dot: "bg-red-500" },
  ];

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
            disabled={disabled}
            className={cn("h-10 gap-2", !active && "bg-background")}
            onClick={() => onChange(it.value)}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", it.dot)} />
            {it.label}
          </Button>
        );
      })}
    </div>
  );
}

export function EventFormSheet({
  event,
  open,
  onOpenChange,
  locations,
  organizers,
  artists,
  tags,
  categories,
  defaultDate,
  prefill,
  onTagCreated,
  onSaved,
  onDeleted,
}: EventFormSheetProps) {
  const isMobile = useIsMobile();
  const { showConfirm, AlertDialogComponent } = useAlertDialog();

  const [formData, setFormData] = React.useState<EventFormData>(() => emptyForm());
  const [selectedOrganizerIds, setSelectedOrganizerIds] = React.useState<string[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = React.useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = React.useState<string[]>([]);
  const [createdLocations, setCreatedLocations] = React.useState<LocationData[]>([]);
  const [createdOrganizers, setCreatedOrganizers] = React.useState<OrganizerOption[]>([]);
  const [createdArtists, setCreatedArtists] = React.useState<ArtistOption[]>([]);

  const [isCreateLocationDialogOpen, setIsCreateLocationDialogOpen] = React.useState(false);
  const [isCreateOrganizerDialogOpen, setIsCreateOrganizerDialogOpen] = React.useState(false);
  const [isCreateArtistDialogOpen, setIsCreateArtistDialogOpen] = React.useState(false);
  const [isCreatingLocation, setIsCreatingLocation] = React.useState(false);
  const [isCreatingOrganizer, setIsCreatingOrganizer] = React.useState(false);
  const [isCreatingArtist, setIsCreatingArtist] = React.useState(false);
  const [quickLocationForm, setQuickLocationForm] = React.useState<QuickLocationFormState>({
    name: "",
    address: "",
    capacity: "",
    is_organizer: false,
  });
  const [quickOrganizerForm, setQuickOrganizerForm] = React.useState<QuickOrganizerFormState>({
    name: "",
    instagram_url: "",
    facebook_url: "",
  });
  const [quickArtistForm, setQuickArtistForm] = React.useState<QuickArtistFormState>({
    name: "",
    artist_type_label: "",
    short_description: "",
    instagram_url: "",
    website_url: "",
  });

  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = React.useState(false);
  const [majorEvents, setMajorEvents] = React.useState<MajorEventOption[]>([]);
  const [loadingMajorEvents, setLoadingMajorEvents] = React.useState(false);

  const [showEndDate, setShowEndDate] = React.useState(false);

  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(event?.image_url || null);
  const [imageWasCleared, setImageWasCleared] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const isEdit = Boolean(event && event.id);
  const showPastEventWarning = !isEdit && isBeforeToday(formData.date);

  // init/reset when opening or event changes
  React.useEffect(() => {
    if (!open) return;

    setSaving(false);
    setDeleting(false);
    setRooms([]);
    setLoadingRooms(false);
    setImageFile(null);
    setImageWasCleared(false);

    if (event) {
      setFormData({
        title: event.title || "",
        description: event.description || "",
        date: toDatetimeLocal(event.date),
        end_date: event.end_date ? toDatetimeLocal(event.end_date) : "",
        category: event.category || "",
        price: event.price != null ? String(event.price) : "",
        presale_price: event.presale_price != null ? String(event.presale_price) : "",
        subscriber_price: event.subscriber_price != null ? String(event.subscriber_price) : "",
        capacity: event.capacity != null ? String(event.capacity) : "",
        is_full: Boolean(event.is_full),
        location_id: event.location_id || "",
        room_id: event.room_id || "",
        door_opening_time: event.door_opening_time || "",
        external_url: event.external_url || "",
        external_url_label: event.external_url_label || "",
        instagram_url: event.instagram_url || "",
        facebook_url: event.facebook_url || "",
        scraping_url: event.scraping_url || "",
        image_url: event.image_url || "",
        status: event.status || "pending",
        is_featured: Boolean(event.is_featured),
        major_event_id: event.major_event_events?.[0]?.major_event_id || "",
      });

      const orgIds =
        event.event_organizers
          ?.map((eo) => eo.organizer?.id || eo.location?.id || null)
          .filter((id): id is string => Boolean(id)) || [];
      setSelectedOrganizerIds(orgIds);

      const artistIds =
        [...(event.event_artists || [])]
          .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
          .map((ea) => ea.artist?.id || null)
          .filter((id): id is string => Boolean(id)) || [];
      setSelectedArtistIds(artistIds);

      setSelectedTagIds(event.tag_ids || []);
      setImagePreview(event.image_url || null);
      setShowEndDate(Boolean(event.end_date));
      return;
    }

    const base = emptyForm();
    const defaultDt = (() => {
      if (!defaultDate) return "";
      const d = new Date(defaultDate);
      if (Number.isNaN(d.getTime())) return "";
      if (d.getHours() === 0 && d.getMinutes() === 0) {
        d.setHours(20, 0, 0, 0);
      }
      return toDatetimeLocalFromLocalDate(d);
    })();

    const merged: EventFormData = {
      ...base,
      ...(prefill?.form || {}),
      date: (prefill?.form?.date ?? base.date) || defaultDt,
    } as EventFormData;

    setFormData(merged);
    setSelectedOrganizerIds(prefill?.organizerIds || []);
    setSelectedArtistIds(prefill?.artistIds || []);
    setSelectedTagIds(prefill?.tagIds || []);
    setImagePreview(merged.image_url ? merged.image_url : null);
    setShowEndDate(Boolean(merged.end_date));
  }, [defaultDate, event, open, prefill]);

  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadMajorEvents() {
      setLoadingMajorEvents(true);
      try {
        const { data, error } = await supabase
          .from("major_events")
          .select("id, title, slug, city_name, start_at, status")
          .order("start_at", { ascending: false });

        if (error) throw error;
        if (!cancelled) {
          setMajorEvents((data || []) as MajorEventOption[]);
        }
      } catch (e) {
        console.error("Erreur major events:", e);
        if (!cancelled) {
          setMajorEvents([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingMajorEvents(false);
        }
      }
    }

    void loadMajorEvents();

    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || !event?.id) return;
    const currentEventId = event.id;

    let cancelled = false;

    async function loadCurrentMajorEventLink() {
      try {
        const { data, error } = await supabase
          .from("major_event_events")
          .select("major_event_id")
          .eq("event_id", currentEventId)
          .maybeSingle();

        if (error) throw error;
        if (!cancelled) {
          setFormData((previous) => ({
            ...previous,
            major_event_id: data?.major_event_id || "",
          }));
        }
      } catch (e) {
        console.error("Erreur liaison major_event_events:", e);
      }
    }

    void loadCurrentMajorEventLink();

    return () => {
      cancelled = true;
    };
  }, [open, event?.id]);

  // load rooms when location changes
  React.useEffect(() => {
    const locationId = formData.location_id;
    if (!open) return;
    if (!locationId) {
      setRooms([]);
      setFormData((prev) => ({ ...prev, room_id: "" }));
      return;
    }

    let cancelled = false;
    async function load() {
      setLoadingRooms(true);
      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("id, name")
          .eq("location_id", locationId)
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setRooms((data || []) as RoomOption[]);
        }
      } catch (e) {
        console.error("Erreur rooms:", e);
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoadingRooms(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [formData.location_id, open]);

  // auto-fill capacity from location (only if empty)
  React.useEffect(() => {
    if (!open) return;
    if (!formData.location_id) return;
    if (formData.capacity) return;
    const loc = [...createdLocations, ...locations].find((l) => l.id === formData.location_id);
    if (loc?.capacity != null) {
      setFormData((prev) => ({ ...prev, capacity: String(loc.capacity ?? "") }));
    }
  }, [createdLocations, formData.location_id, locations, formData.capacity, open]);

  const availableLocations = React.useMemo(() => {
    const map = new Map<string, LocationData>();
    [...locations, ...createdLocations].forEach((location) => {
      map.set(location.id, location);
    });
    return Array.from(map.values());
  }, [createdLocations, locations]);

  const availableOrganizers = React.useMemo(() => {
    const map = new Map<string, OrganizerOption>();
    [...organizers, ...createdOrganizers].forEach((organizer) => {
      map.set(organizer.id, organizer);
    });
    return Array.from(map.values());
  }, [createdOrganizers, organizers]);

  const availableArtists = React.useMemo(() => {
    const map = new Map<string, ArtistOption>();
    [...artists, ...createdArtists].forEach((artist) => {
      map.set(artist.id, artist);
    });
    return Array.from(map.values());
  }, [artists, createdArtists]);

  function openCreateLocationDialog(prefillName = "") {
    setQuickLocationForm({
      name: prefillName,
      address: "",
      capacity: "",
      is_organizer: false,
    });
    setIsCreateLocationDialogOpen(true);
  }

  function openCreateOrganizerDialog(prefillName = "") {
    setQuickOrganizerForm({
      name: prefillName,
      instagram_url: "",
      facebook_url: "",
    });
    setIsCreateOrganizerDialogOpen(true);
  }

  function openCreateArtistDialog(prefillName = "") {
    setQuickArtistForm({
      name: prefillName,
      artist_type_label: "",
      short_description: "",
      instagram_url: "",
      website_url: "",
    });
    setIsCreateArtistDialogOpen(true);
  }

  function handleLocationSelection(locationId: string) {
    if (locationId) {
      const selectedLocation = availableLocations.find((location) => location.id === locationId);
      if (selectedLocation) {
        setFormData((prev) => ({
          ...prev,
          location_id: locationId,
          room_id: "",
          capacity:
            selectedLocation.capacity != null
              ? String(selectedLocation.capacity)
              : prev.capacity,
        }));
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      location_id: locationId,
      room_id: "",
    }));
  }

  function handleOrganizerChange(newIds: string[]) {
    setSelectedOrganizerIds(newIds);

    // UX: si un organisateur est sélectionné, pré-remplir les réseaux sociaux (sans écraser si déjà rempli)
    if (newIds.length > 0) {
      const first = availableOrganizers.find((o) => o.id === newIds[0]);
      if (first) {
        setFormData((prev) => ({
          ...prev,
          instagram_url: prev.instagram_url || first.instagram_url || "",
          facebook_url: prev.facebook_url || first.facebook_url || "",
          ...(first.type === "location" ? { location_id: first.id, room_id: "" } : null),
        }));
      }
    }
  }

  async function handleQuickLocationCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quickLocationForm.name.trim()) {
      toast({ title: "Nom requis", description: "Renseigne le nom du lieu.", variant: "destructive" });
      return;
    }

    try {
      setIsCreatingLocation(true);
      const { data, error } = await supabase
        .from("locations")
        .insert([
          {
            name: quickLocationForm.name.trim(),
            address: quickLocationForm.address.trim() || null,
            capacity: quickLocationForm.capacity.trim()
              ? parseInt(quickLocationForm.capacity, 10)
              : null,
            is_organizer: quickLocationForm.is_organizer,
          },
        ])
        .select("id, name, address, capacity, latitude, longitude")
        .single();

      if (error) throw error;

      const createdLocation = data as LocationData;
      setCreatedLocations((prev) => [...prev, createdLocation]);
      if (quickLocationForm.is_organizer) {
        setCreatedOrganizers((prev) => [
          ...prev,
          {
            id: createdLocation.id,
            name: createdLocation.name,
            instagram_url: null,
            facebook_url: null,
            type: "location",
          },
        ]);
      }
      handleLocationSelection(createdLocation.id);
      setIsCreateLocationDialogOpen(false);
      toast({ title: "Lieu créé", variant: "success" });
    } catch (e: any) {
      console.error("Erreur création lieu:", e);
      toast({
        title: "Création lieu impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingLocation(false);
    }
  }

  async function handleQuickOrganizerCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quickOrganizerForm.name.trim()) {
      toast({ title: "Nom requis", description: "Renseigne le nom de l'organisateur.", variant: "destructive" });
      return;
    }

    try {
      setIsCreatingOrganizer(true);
      const { data, error } = await supabase
        .from("organizers")
        .insert([
          {
            name: quickOrganizerForm.name.trim(),
            instagram_url: quickOrganizerForm.instagram_url.trim() || null,
            facebook_url: quickOrganizerForm.facebook_url.trim() || null,
          },
        ])
        .select("id, name, instagram_url, facebook_url")
        .single();

      if (error) throw error;

      const createdOrganizer = { ...(data as Omit<OrganizerOption, "type">), type: "organizer" as const };
      setCreatedOrganizers((prev) => [...prev, createdOrganizer]);
      handleOrganizerChange(Array.from(new Set([...selectedOrganizerIds, createdOrganizer.id])));
      setIsCreateOrganizerDialogOpen(false);
      toast({ title: "Organisateur créé", variant: "success" });
    } catch (e: any) {
      console.error("Erreur création organisateur:", e);
      toast({
        title: "Création organisateur impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingOrganizer(false);
    }
  }

  async function handleQuickArtistCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quickArtistForm.name.trim()) {
      toast({ title: "Nom requis", description: "Renseigne le nom de l'artiste.", variant: "destructive" });
      return;
    }

    try {
      setIsCreatingArtist(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("artists")
        .insert([
          {
            name: quickArtistForm.name.trim(),
            artist_type_label: quickArtistForm.artist_type_label.trim() || null,
            short_description: quickArtistForm.short_description.trim() || null,
            instagram_url: quickArtistForm.instagram_url.trim() || null,
            website_url: quickArtistForm.website_url.trim() || null,
            created_by: user?.id || null,
          },
        ])
        .select("id, name, slug, image_url")
        .single();

      if (error) throw error;

      const createdArtist = data as ArtistOption;
      setCreatedArtists((prev) => [...prev, createdArtist]);
      setSelectedArtistIds((prev) => Array.from(new Set([...prev, createdArtist.id])));
      setIsCreateArtistDialogOpen(false);
      toast({ title: "Artiste créé", variant: "success" });
    } catch (e: any) {
      console.error("Erreur création artiste:", e);
      toast({
        title: "Création artiste impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingArtist(false);
    }
  }

  async function handleCreateTag(name: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.from("tags").insert([{ name: name.trim() }]).select("id").single();
      if (error) throw error;
      onTagCreated?.();
      toast({ title: "Tag créé", description: name, variant: "success" });
      return data?.id ?? null;
    } catch (e: any) {
      console.error("Erreur création tag:", e);
      toast({
        title: "Création tag impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
      return null;
    }
  }

  async function uploadImageIfNeeded(): Promise<string | null> {
    if (!imageFile) return null;
    try {
      const compressedFile = await compressImage(imageFile, 2);
      const fileExt = compressedFile.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { data, error } = await supabase.storage.from("event-images").upload(fileName, compressedFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(data.path);

      return publicUrl;
    } catch (e: any) {
      console.error("Erreur upload image:", e);
      toast({
        title: "Upload image impossible",
        description: e?.message || "Vérifie le bucket `event-images`.",
        variant: "destructive",
      });
      return null;
    }
  }

  function normalizeUuid(value: string) {
    if (!value || value === "none") return null;
    return value;
  }

  function normalizeNullable(value: string) {
    return value.trim() ? value.trim() : null;
  }

  async function syncMajorEventLink(savedEventId: string, nextMajorEventId: string) {
    const normalizedMajorEventId = nextMajorEventId.trim();

    const { data: existingLinks, error: existingError } = await supabase
      .from("major_event_events")
      .select("major_event_id")
      .eq("event_id", savedEventId);

    if (existingError) throw existingError;

    const currentMajorEventId = existingLinks?.[0]?.major_event_id || "";

    if (!normalizedMajorEventId) {
      if (currentMajorEventId) {
        const { error: deleteError } = await supabase
          .from("major_event_events")
          .delete()
          .eq("event_id", savedEventId);

        if (deleteError) throw deleteError;
      }
      return;
    }

    if (currentMajorEventId === normalizedMajorEventId) {
      return;
    }

    if (currentMajorEventId) {
      const { error: deleteError } = await supabase
        .from("major_event_events")
        .delete()
        .eq("event_id", savedEventId);

      if (deleteError) throw deleteError;
    }

    const { data: lastLink, error: sortError } = await supabase
      .from("major_event_events")
      .select("sort_index")
      .eq("major_event_id", normalizedMajorEventId)
      .order("sort_index", { ascending: false })
      .limit(1);

    if (sortError) throw sortError;

    const nextSortIndex = (lastLink?.[0]?.sort_index ?? -1) + 1;

    const { error: insertError } = await supabase.from("major_event_events").insert({
      major_event_id: normalizedMajorEventId,
      event_id: savedEventId,
      sort_index: nextSortIndex,
      is_featured: false,
    });

    if (insertError) throw insertError;
  }

  async function save({ forceApproved }: { forceApproved: boolean }) {
    if (saving) return;

    if (!formData.title.trim()) {
      toast({ title: "Titre requis", description: "Renseigne un titre.", variant: "destructive" });
      return;
    }
    if (!formData.date) {
      toast({ title: "Date requise", description: "Choisis une date de début.", variant: "destructive" });
      return;
    }
    if (!formData.category.trim()) {
      toast({ title: "Catégorie requise", description: "Choisis une catégorie.", variant: "destructive" });
      return;
    }

    if (formData.end_date && formData.date) {
      const startIso = fromDatetimeLocal(formData.date);
      const endIso = fromDatetimeLocal(formData.end_date);
      if (startIso && endIso) {
        const start = new Date(startIso);
        const end = new Date(endIso);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
          toast({
            title: "Date de fin invalide",
            description: "La date de fin ne peut pas être antérieure à la date de début.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    setSaving(true);
    try {
      const uploadedUrl = await uploadImageIfNeeded();
      if (imageFile && !uploadedUrl) {
        setSaving(false);
        return;
      }

      const selectedLocation =
        formData.location_id && formData.location_id !== "none"
          ? availableLocations.find((l) => l.id === formData.location_id) || null
          : null;

      const statusToSave: EventStatus = forceApproved ? "approved" : formData.status;

      const baseData: any = {
        title: formData.title.trim(),
        description: normalizeNullable(formData.description || ""),
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? fromDatetimeLocal(formData.end_date) || null : null,
        category: formData.category,
        price: formData.price ? parseFloat(formData.price) : null,
        presale_price: formData.presale_price ? parseFloat(formData.presale_price) : null,
        subscriber_price: formData.subscriber_price ? parseFloat(formData.subscriber_price) : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        is_full: Boolean(formData.is_full),
        location_id: normalizeUuid(formData.location_id),
        room_id: normalizeUuid(formData.room_id),
        door_opening_time: normalizeNullable(formData.door_opening_time),
        external_url: normalizeNullable(formData.external_url),
        external_url_label: normalizeNullable(formData.external_url_label),
        instagram_url: normalizeNullable(formData.instagram_url),
        facebook_url: normalizeNullable(formData.facebook_url),
        scraping_url: normalizeNullable(formData.scraping_url),
        status: statusToSave,
        is_featured: Boolean(formData.is_featured),
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : [],
        address: selectedLocation?.address || null,
        latitude: selectedLocation?.latitude || null,
        longitude: selectedLocation?.longitude || null,
      };

      // image url precedence: uploaded file > url field > cleared > keep existing
      const nextImageUrl = (() => {
        if (uploadedUrl) return uploadedUrl;
        if (formData.image_url.trim()) return formData.image_url.trim();
        if (imageWasCleared) return null;
        return event?.image_url || null;
      })();
      baseData.image_url = nextImageUrl;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;

      let savedEventId: string;

      if (isEdit && event) {
        const { error } = await supabase.from("events").update(baseData).eq("id", event.id);
        if (error) throw error;
        savedEventId = event.id;
      } else {
        const { data: newEvent, error } = await supabase
          .from("events")
          .insert([{ ...baseData, created_by: userId }])
          .select("id")
          .single();
        if (error) throw error;
        savedEventId = newEvent.id;
      }

      // organizers: delete + insert (keeps constraint exactly-one)
      await supabase.from("event_organizers").delete().eq("event_id", savedEventId);

      if (selectedOrganizerIds.length > 0) {
        const organizerEntries = selectedOrganizerIds.map((id) => {
          const org = availableOrganizers.find((o) => o.id === id);
          return org?.type === "location"
            ? { event_id: savedEventId, location_id: id, organizer_id: null }
            : { event_id: savedEventId, organizer_id: id, location_id: null };
        });

        const { error: orgError } = await supabase.from("event_organizers").insert(organizerEntries);
        if (orgError) throw orgError;
      }

      await supabase.from("event_artists").delete().eq("event_id", savedEventId);

      if (selectedArtistIds.length > 0) {
        const artistEntries = selectedArtistIds.map((artistId, index) => ({
          event_id: savedEventId,
          artist_id: artistId,
          sort_index: index,
          role_label: null,
        }));

        const { error: artistError } = await supabase.from("event_artists").insert(artistEntries);
        if (artistError) throw artistError;
      }

      await syncMajorEventLink(savedEventId, formData.major_event_id);

      toast({ title: "Événement enregistré", variant: "success" });
      onOpenChange(false);
      onSaved?.(savedEventId);
    } catch (e: any) {
      console.error("Erreur save event:", e);
      toast({
        title: "Enregistrement impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!event) return;
    showConfirm({
      title: "Supprimer l’événement ?",
      description: "Cette action est irréversible.",
      variant: "destructive",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const { error } = await supabase.from("events").delete().eq("id", event.id);
          if (error) throw error;
          toast({ title: "Événement supprimé", variant: "success" });
          onOpenChange(false);
          onDeleted?.(event.id);
        } catch (e: any) {
          console.error("Erreur delete:", e);
          toast({
            title: "Suppression impossible",
            description: e?.message || "Une erreur est survenue.",
            variant: "destructive",
          });
        } finally {
          setDeleting(false);
        }
      },
    });
  }

  const locationOptions = React.useMemo(
    () => [
      { value: "", label: "Aucun lieu" },
      ...availableLocations.map((location) => ({
        value: location.id,
        label: location.city?.label
            ? `${location.name} • ${location.city.label}`
            : location.name,
      })),
    ],
    [availableLocations],
  );

  const categoryOptions = React.useMemo(() => categories, [categories]);
  const organizerOptions = React.useMemo(
    () =>
      availableOrganizers.map((o) => ({
        value: o.id,
        label: `${o.name}${o.type === "location" ? " (Lieu)" : ""}`,
      })),
    [availableOrganizers],
  );
  const artistOptions = React.useMemo(
    () =>
      availableArtists.map((artist) => ({
        value: artist.id,
        label: artist.name,
      })),
    [availableArtists],
  );
  const tagOptions = React.useMemo(() => tags.map((t) => ({ value: t.id, label: t.name })), [tags]);
  const majorEventOptions = React.useMemo(
    () => [
      { value: "", label: "Aucun Multi-événements" },
      ...majorEvents.map((majorEvent) => ({
        value: majorEvent.id,
        label: `${majorEvent.title}${majorEvent.city_name ? ` • ${majorEvent.city_name}` : ""}`,
      })),
    ],
    [majorEvents],
  );

  const side = isMobile ? "bottom" : "right";
  const selectedLocation = availableLocations.find((location) => location.id === formData.location_id) || null;
  const selectedLocationLabel = selectedLocation?.name;
  const selectedCategoryLabel = categories.find((category) => category.id === formData.category)?.name;
  const selectedMajorEvent = majorEvents.find((majorEvent) => majorEvent.id === formData.major_event_id) || null;
  const selectedOrganizerLabels = selectedOrganizerIds
    .map((id) => availableOrganizers.find((organizer) => organizer.id === id)?.name)
    .filter((value): value is string => Boolean(value));
  const selectedArtistLabels = selectedArtistIds
    .map((id) => availableArtists.find((artist) => artist.id === id)?.name)
    .filter((value): value is string => Boolean(value));
  const missingRequired = [
    !formData.title.trim() ? "Titre" : null,
    !formData.date ? "Date" : null,
    !formData.category ? "Categorie" : null,
  ].filter((value): value is string => Boolean(value));
  const priceSummary = formData.price.trim() ? `${formData.price.trim()} EUR` : undefined;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={side as any}
          className={cn(
            isMobile
              ? "h-[100dvh] p-0"
              : "w-full sm:w-[760px] lg:w-[920px] max-w-[100vw] p-0",
          )}
        >
          <div className="flex h-full flex-col">
            <div className="px-5 pt-5 pb-4 border-b">
              <SheetHeader className="space-y-1">
                <SheetTitle>{isEdit ? "Modifier l’événement" : "Créer un événement"}</SheetTitle>
                <SheetDescription>
                  {isEdit ? "Modifie les informations, puis enregistre." : "Crée un événement en quelques champs, le reste est optionnel."}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-auto px-5 py-5">
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save({ forceApproved: false });
                }}
              >
                <EventFormOverviewCard
                  title={formData.title}
                  categoryLabel={selectedCategoryLabel}
                  startDate={formData.date}
                  endDate={formData.end_date}
                  locationLabel={selectedLocationLabel}
                  majorEventLabel={selectedMajorEvent?.title}
                  organizerLabels={selectedOrganizerLabels}
                  artistLabels={selectedArtistLabels}
                  tagsCount={selectedTagIds.length}
                  priceLabel={priceSummary}
                  hasImage={Boolean(imagePreview || formData.image_url.trim())}
                  isFeatured={formData.is_featured}
                  missingRequired={missingRequired}
                />

                {/* Champs principaux */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-title">Titre</Label>
                    <Input
                      id="event-title"
                      value={formData.title}
                      onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Nom de l’événement"
                      required
                      className="h-11"
                      disabled={saving || deleting}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Date de début</Label>
                      <DateTimePicker
                        value={formData.date}
                        onChange={(v) => setFormData((p) => ({ ...p, date: v }))}
                        placeholder="Choisir une date"
                        required
                        disabled={saving || deleting}
                      />
                      {showPastEventWarning ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            Cette date est antérieure à aujourd&apos;hui. L&apos;événement sera ajouté comme un événement déjà passé.
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Date de fin</Label>
                        {!showEndDate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setShowEndDate(true)}
                            disabled={saving || deleting}
                          >
                            Ajouter
                          </Button>
                        ) : null}
                      </div>
                      {showEndDate ? (
                        <DateTimePicker
                          value={formData.end_date}
                          onChange={(v) => setFormData((p) => ({ ...p, end_date: v }))}
                          placeholder="Optionnel"
                          disabled={saving || deleting}
                          allowClear
                        />
                      ) : (
                        <div className="h-11 rounded-md border bg-muted/20" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Lieu</Label>
                    <SelectSearchable
                      options={locationOptions}
                      value={formData.location_id}
                      onValueChange={(v) => handleLocationSelection(v)}
                      placeholder="Sélectionner un lieu"
                      searchPlaceholder="Rechercher un lieu..."
                      emptyActionLabel="Ajouter un lieu"
                      onEmptyAction={openCreateLocationDialog}
                    />
                    {selectedLocation?.city?.label ? (
                      <p className="text-xs text-muted-foreground">
                        Ville détectée : {selectedLocation.city.label}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Catégorie</Label>
                    <Select
                      value={formData.category || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "none" ? "" : v }))}
                      disabled={saving || deleting}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Choisir une catégorie" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choisir…</SelectItem>
                        {categoryOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Multi-événements</Label>
                    <SelectSearchable
                      options={majorEventOptions}
                      value={formData.major_event_id}
                      onValueChange={(value) =>
                        setFormData((previous) => ({
                          ...previous,
                          major_event_id: value,
                        }))
                      }
                      placeholder={
                        loadingMajorEvents
                          ? "Chargement des Multi-événements..."
                          : "Rattacher à un Multi-événements"
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Raccourci principal pour lier cet événement à une programmation commune.
                      {selectedMajorEvent != null
                        ? ` Actuellement : ${selectedMajorEvent.title}.`
                        : ""}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Image</Label>
                    <EventImageUpload
                      currentImageUrl={imagePreview}
                      onImageChange={(file, preview) => {
                        setImageFile(file);
                        setImagePreview(preview);
                        if (file) {
                          setImageWasCleared(false);
                          setFormData((p) => ({ ...p, image_url: "" }));
                        } else if (!preview) {
                          setImageWasCleared(true);
                          setFormData((p) => ({ ...p, image_url: "" }));
                        }
                      }}
                      onUrlChange={(url) => {
                        setFormData((p) => ({ ...p, image_url: url }));
                        setImagePreview(url || null);
                        if (url) {
                          setImageWasCleared(false);
                          setImageFile(null);
                        }
                      }}
                      disabled={saving || deleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Statut</Label>
                    <StatusPicker
                      value={formData.status}
                      onChange={(s) => setFormData((p) => ({ ...p, status: s }))}
                      disabled={saving || deleting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Mise en avant</Label>
                    <div className="flex items-center justify-between rounded-lg border px-4 h-11">
                      <span className="text-sm text-muted-foreground">Afficher dans les surfaces “A la une”</span>
                      <Switch
                        checked={formData.is_featured}
                        onCheckedChange={(v) => setFormData((p) => ({ ...p, is_featured: v }))}
                        disabled={saving || deleting}
                      />
                    </div>
                  </div>
                </div>

                {/* Détails complémentaires */}
                <Card className="p-4">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold">Détails complémentaires</div>
                    <div className="text-xs text-muted-foreground">
                      Description, tags, organisateurs, prix, liens, salle et paramètres complémentaires.
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={formData.description}
                        onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Détails, lineup, infos utiles…"
                        disabled={saving || deleting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <MultiSelectCreatable
                        options={tagOptions}
                        selected={selectedTagIds}
                        onChange={setSelectedTagIds}
                        onCreate={handleCreateTag}
                        placeholder="Ajouter des tags"
                        disabled={saving || deleting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Organisateurs</Label>
                      <MultiSelect
                        options={organizerOptions}
                        selected={selectedOrganizerIds}
                        onChange={handleOrganizerChange}
                        placeholder="Sélectionner…"
                        disabled={saving || deleting}
                        emptyActionLabel="Ajouter un organisateur"
                        onEmptyAction={openCreateOrganizerDialog}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Artistes / collaborateurs</Label>
                      <MultiSelect
                        options={artistOptions}
                        selected={selectedArtistIds}
                        onChange={setSelectedArtistIds}
                        placeholder="Selectionner..."
                        disabled={saving || deleting}
                        emptyActionLabel="Ajouter un artiste"
                        onEmptyAction={openCreateArtistDialog}
                      />
                      <p className="text-xs text-muted-foreground">
                        Cette liste alimente la section publique "Artistes" dans la fiche evenement.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Prix</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={formData.price}
                          onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Prévente</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={formData.presale_price}
                          onChange={(e) => setFormData((p) => ({ ...p, presale_price: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Abonné</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={formData.subscriber_price}
                          onChange={(e) => setFormData((p) => ({ ...p, subscriber_price: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Capacité</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={formData.capacity}
                          onChange={(e) => setFormData((p) => ({ ...p, capacity: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Complet</Label>
                        <div className="flex items-center justify-between rounded-lg border px-4 h-11">
                          <span className="text-sm text-muted-foreground">Sold out</span>
                          <Switch
                            checked={formData.is_full}
                            onCheckedChange={(v) => setFormData((p) => ({ ...p, is_full: v }))}
                            disabled={saving || deleting}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>URL externe</Label>
                        <Input
                          type="url"
                          value={formData.external_url}
                          onChange={(e) => setFormData((p) => ({ ...p, external_url: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Label URL</Label>
                        <Input
                          value={formData.external_url_label}
                          onChange={(e) => setFormData((p) => ({ ...p, external_url_label: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Instagram</Label>
                        <Input
                          type="url"
                          value={formData.instagram_url}
                          onChange={(e) => setFormData((p) => ({ ...p, instagram_url: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Facebook</Label>
                        <Input
                          type="url"
                          value={formData.facebook_url}
                          onChange={(e) => setFormData((p) => ({ ...p, facebook_url: e.target.value }))}
                          disabled={saving || deleting}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Salle</Label>
                        <Select
                          value={formData.room_id || "none"}
                          onValueChange={(v) => setFormData((p) => ({ ...p, room_id: v === "none" ? "" : v }))}
                          disabled={saving || deleting || !formData.location_id || loadingRooms}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder={loadingRooms ? "Chargement..." : "Optionnel"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Aucune</SelectItem>
                            {rooms.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Heure ouverture portes</Label>
                        <Input
                          type="time"
                          step={60}
                          value={formData.door_opening_time}
                          onChange={(e) => setFormData((p) => ({ ...p, door_opening_time: e.target.value }))}
                          disabled={saving || deleting}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>URL scraping</Label>
                      <Input
                        type="url"
                        value={formData.scraping_url}
                        onChange={(e) => setFormData((p) => ({ ...p, scraping_url: e.target.value }))}
                        disabled={saving || deleting}
                        className="h-11"
                      />
                    </div>
                  </div>
                </Card>
              </form>
            </div>

            {/* actions sticky */}
            <div className={cn("border-t bg-background p-4", isMobile && "pb-[calc(1rem+env(safe-area-inset-bottom))]")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                {isEdit ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="gap-2"
                    onClick={() => void confirmDelete()}
                    disabled={saving || deleting}
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Supprimer
                  </Button>
                ) : (
                  <div />
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={saving || deleting}
                  >
                    Fermer
                  </Button>
                  <Button type="button" onClick={() => void save({ forceApproved: false })} disabled={saving || deleting}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Enregistrer
                  </Button>
                  <Button
                    type="button"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void save({ forceApproved: true })}
                    disabled={saving || deleting}
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Enregistrer & Approuver
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={isCreateLocationDialogOpen} onOpenChange={setIsCreateLocationDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un lieu</DialogTitle>
            <DialogDescription>
              Crée un lieu sans quitter le formulaire d&apos;événement.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleQuickLocationCreate}>
            <div className="space-y-2">
              <Label htmlFor="quick-event-location-name">Nom</Label>
              <Input
                id="quick-event-location-name"
                value={quickLocationForm.name}
                onChange={(event) =>
                  setQuickLocationForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Nom du lieu"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-location-address">Adresse</Label>
              <Input
                id="quick-event-location-address"
                value={quickLocationForm.address}
                onChange={(event) =>
                  setQuickLocationForm((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Adresse du lieu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-location-capacity">Capacité</Label>
              <Input
                id="quick-event-location-capacity"
                type="number"
                min="0"
                value={quickLocationForm.capacity}
                onChange={(event) =>
                  setQuickLocationForm((prev) => ({ ...prev, capacity: event.target.value }))
                }
                placeholder="Optionnel"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Utilisable aussi comme organisateur</p>
                <p className="text-xs text-muted-foreground">
                  Le lieu apparaîtra également dans les organisateurs.
                </p>
              </div>
              <Switch
                checked={quickLocationForm.is_organizer}
                onCheckedChange={(checked) =>
                  setQuickLocationForm((prev) => ({ ...prev, is_organizer: checked }))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateLocationDialogOpen(false)}
                disabled={isCreatingLocation}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isCreatingLocation}>
                {isCreatingLocation ? "Création..." : "Créer le lieu"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOrganizerDialogOpen} onOpenChange={setIsCreateOrganizerDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un organisateur</DialogTitle>
            <DialogDescription>
              Crée un organisateur sans quitter le formulaire d&apos;événement.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleQuickOrganizerCreate}>
            <div className="space-y-2">
              <Label htmlFor="quick-event-organizer-name">Nom</Label>
              <Input
                id="quick-event-organizer-name"
                value={quickOrganizerForm.name}
                onChange={(event) =>
                  setQuickOrganizerForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Nom de l'organisateur"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-organizer-instagram">Instagram</Label>
              <Input
                id="quick-event-organizer-instagram"
                type="url"
                value={quickOrganizerForm.instagram_url}
                onChange={(event) =>
                  setQuickOrganizerForm((prev) => ({
                    ...prev,
                    instagram_url: event.target.value,
                  }))
                }
                placeholder="https://instagram.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-organizer-facebook">Facebook</Label>
              <Input
                id="quick-event-organizer-facebook"
                type="url"
                value={quickOrganizerForm.facebook_url}
                onChange={(event) =>
                  setQuickOrganizerForm((prev) => ({
                    ...prev,
                    facebook_url: event.target.value,
                  }))
                }
                placeholder="https://facebook.com/..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOrganizerDialogOpen(false)}
                disabled={isCreatingOrganizer}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isCreatingOrganizer}>
                {isCreatingOrganizer ? "Création..." : "Créer l'organisateur"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateArtistDialogOpen} onOpenChange={setIsCreateArtistDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un artiste</DialogTitle>
            <DialogDescription>
              Crée un artiste ou collaborateur sans quitter le formulaire d&apos;événement.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleQuickArtistCreate}>
            <div className="space-y-2">
              <Label htmlFor="quick-event-artist-name">Nom</Label>
              <Input
                id="quick-event-artist-name"
                value={quickArtistForm.name}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Nom de scène / collaborateur"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-artist-type">Type / dénomination</Label>
              <Input
                id="quick-event-artist-type"
                value={quickArtistForm.artist_type_label}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    artist_type_label: event.target.value,
                  }))
                }
                placeholder="DJ, Groupe, Plasticien..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-artist-description">Description courte</Label>
              <Textarea
                id="quick-event-artist-description"
                value={quickArtistForm.short_description}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    short_description: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Quelques lignes de présentation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-artist-instagram">Instagram</Label>
              <Input
                id="quick-event-artist-instagram"
                type="url"
                value={quickArtistForm.instagram_url}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    instagram_url: event.target.value,
                  }))
                }
                placeholder="https://instagram.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-event-artist-website">Site web</Label>
              <Input
                id="quick-event-artist-website"
                type="url"
                value={quickArtistForm.website_url}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    website_url: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateArtistDialogOpen(false)}
                disabled={isCreatingArtist}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isCreatingArtist}>
                {isCreatingArtist ? "Création..." : "Créer l'artiste"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialogComponent />
    </>
  );
}

