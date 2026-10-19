"use client";

import * as React from "react";
import { addDays, addHours, format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Check,
  ExternalLink,
  Facebook,
  Instagram,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { fetchRemoteImageBlob } from "@/lib/events/remote-image";
import { cn } from "@/lib/utils";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/date-utils";
import { compressImage } from "@/lib/image-compression";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import type { ImportedEventWarning } from "@/lib/events/imported-event-payload";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { deriveGenericPriceRange, toNullablePrice } from "@/lib/events/price-utils";
import {
  fetchPotentialDuplicateEvents,
  type PotentialDuplicateEvent,
} from "@/lib/events/potential-duplicates";
import { logAdminAction } from "@/lib/admin-audit-log";
import { AGENDA_TYPES, parseAgendaTypes } from "@/lib/events/agenda-types";

import { EntitySwitchRow } from "../directory/entity-sheet";
import { EventImageUpload } from "./event-image-upload";
import {
  AsideSection,
  CompletenessList,
  EventDateTimeInput,
  Field,
  FormBlock,
  PropertySwitch,
  QuickDateChips,
  TimeInput,
  describeDuration,
  parseLocalDateTime,
  toLocalDateTimeValue,
  type CompletenessItem,
} from "./event-form-fields";
import {
  QuickArtistDialog,
  QuickLocationDialog,
  QuickOrganizerDialog,
} from "./event-quick-create-dialogs";
import type {
  AdminEvent,
  ArtistOption,
  CategoryOption,
  EventFormData,
  EventFormPrefill,
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

type AdditionalTimeSlot = {
  start: string;
  end: string;
};

type PriceMode = "unknown" | "free" | "paid" | "pwyw";

type QuickCreateState = { kind: "location" | "organizer" | "artist"; name: string } | null;

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
  blockPastCreation?: boolean;
  /** Provenance d'un pré-remplissage (import, affiche, duplication) affichée en tête du formulaire. */
  importNotice?: {
    sourceLabel: string;
    warnings: ImportedEventWarning[];
    /** Méthode de lecture de la page (données structurées, IA…). */
    method?: string;
  } | null;
  /** Propose « Créer un autre ensuite » en création. */
  allowCreateAnother?: boolean;
  onTagCreated?: () => void;
  onSaved?: (eventId: string) => void;
  onDeleted?: (eventId: string) => void;
};

const CREATE_ANOTHER_STORAGE_KEY = "admin.events.createAnother";

const STATUS_META: Record<EventStatus, { label: string; dot: string; badge: "warning" | "success" | "destructive" }> = {
  pending: { label: "En attente", dot: "bg-warning", badge: "warning" },
  approved: { label: "Approuvé", dot: "bg-success", badge: "success" },
  rejected: { label: "Refusé", dot: "bg-destructive", badge: "destructive" },
};

function isBeforeToday(dateValue: string) {
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed.getTime() < today.getTime();
}

function getOpenableExternalUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
}

function emptyForm(): EventFormData {
  return {
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price_min: "",
    price_max: "",
    is_pay_what_you_want: false,
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
    hide_from_home: false,
    show_on_app: true,
    agenda_types: [],
    major_event_id: "",
  };
}

function derivePriceMode(form: EventFormData): PriceMode {
  if (form.is_pay_what_you_want) return "pwyw";
  const min = toNullablePrice(form.price_min);
  const max = toNullablePrice(form.price_max);
  if (min === null && max === null) return "unknown";
  if ((min ?? 0) <= 0 && (max === null || max <= 0)) return "free";
  return "paid";
}

/** Décale une fin pour conserver la durée quand le début change. */
function shiftEnd(previousStart: string, nextStart: string, end: string) {
  const from = parseLocalDateTime(previousStart)?.js;
  const to = parseLocalDateTime(nextStart)?.js;
  const currentEnd = parseLocalDateTime(end)?.js;
  if (!from || !to || !currentEnd) return end;
  const duration = currentEnd.getTime() - from.getTime();
  if (duration <= 0) return end;
  return toLocalDateTimeValue(new Date(to.getTime() + duration));
}

function DuplicateNotice({ duplicates }: { duplicates: PotentialDuplicateEvent[] }) {
  if (duplicates.length === 0) return null;
  return (
    <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.07] px-3.5 py-3">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-medium">Doublon possible</p>
        <p className="text-[13px] text-muted-foreground">
          {duplicates.length > 1 ? "Des événements existent" : "Un événement existe"} déjà dans ce lieu sur un créneau
          qui se chevauche.
        </p>
        <ul className="space-y-1">
          {duplicates.map((duplicate) => (
            <li key={duplicate.id}>
              <a
                href={`/admin/events?view=agenda&start=${duplicate.date.slice(0, 10)}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium underline-offset-4 hover:underline"
              >
                <span className="truncate">
                  {duplicate.matchKind === "exact" ? "Même horaire" : "Chevauchement"} ·{" "}
                  {duplicate.title?.trim() || "Sans titre"}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PriceInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        min="0"
        step="0.5"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className="pr-8 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
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
  blockPastCreation = false,
  importNotice = null,
  allowCreateAnother = false,
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
  const [quickCreate, setQuickCreate] = React.useState<QuickCreateState>(null);

  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = React.useState(false);
  const [majorEvents, setMajorEvents] = React.useState<MajorEventOption[]>([]);
  const [loadingMajorEvents, setLoadingMajorEvents] = React.useState(false);

  const [showEndDate, setShowEndDate] = React.useState(false);
  const [additionalTimeSlots, setAdditionalTimeSlots] = React.useState<AdditionalTimeSlot[]>([]);
  const [priceMode, setPriceMode] = React.useState<PriceMode>("unknown");

  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(event?.image_url || null);
  const [imageWasCleared, setImageWasCleared] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [createAnother, setCreateAnother] = React.useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = React.useState<PotentialDuplicateEvent[]>([]);

  const formScrollRef = React.useRef<HTMLDivElement | null>(null);
  const titleRef = React.useRef<HTMLTextAreaElement | null>(null);
  const titleObserverRef = React.useRef<ResizeObserver | null>(null);

  const isEdit = Boolean(event && event.id);
  const busy = saving || deleting;
  const showPastEventWarning = !isEdit && isBeforeToday(formData.date);

  /** Mise à jour déclenchée par l'utilisateur (marque la fiche comme modifiée). */
  const patchForm = React.useCallback(
    (update: Partial<EventFormData> | ((previous: EventFormData) => EventFormData)) => {
      setDirty(true);
      setFormData((previous) => (typeof update === "function" ? update(previous) : { ...previous, ...update }));
    },
    [],
  );

  // Préférence « Créer un autre ensuite », mémorisée dans le navigateur.
  React.useEffect(() => {
    try {
      setCreateAnother(window.localStorage.getItem(CREATE_ANOTHER_STORAGE_KEY) === "1");
    } catch {
      // Stockage indisponible : option désactivée par défaut.
    }
  }, []);

  function updateCreateAnother(next: boolean) {
    setCreateAnother(next);
    try {
      window.localStorage.setItem(CREATE_ANOTHER_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Stockage indisponible : le choix vaut pour la session uniquement.
    }
  }

  // Initialisation à chaque ouverture ou changement d'événement.
  React.useEffect(() => {
    if (!open) return;

    setSaving(false);
    setDeleting(false);
    setDirty(false);
    setShowErrors(false);
    setQuickCreate(null);
    setRooms([]);
    setLoadingRooms(false);
    setImageFile(null);
    setImageWasCleared(false);
    setAdditionalTimeSlots([]);

    if (event) {
      const derivedPrices = deriveGenericPriceRange(event);
      const nextForm: EventFormData = {
        title: event.title || "",
        description: event.description || "",
        date: toDatetimeLocal(event.date),
        end_date: event.end_date ? toDatetimeLocal(event.end_date) : "",
        category: event.category || "",
        price_min: derivedPrices.priceMin != null ? String(derivedPrices.priceMin) : "",
        price_max: derivedPrices.priceMax != null ? String(derivedPrices.priceMax) : "",
        is_pay_what_you_want: Boolean(event.is_pay_what_you_want),
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
        hide_from_home: Boolean(event.hide_from_home),
        show_on_app: event.show_on_app !== false,
        agenda_types: parseAgendaTypes(event.agenda_types),
        major_event_id: event.major_event_events?.major_event_id || "",
      };
      setFormData(nextForm);
      setPriceMode(derivePriceMode(nextForm));

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
      return toLocalDateTimeValue(d);
    })();

    const merged: EventFormData = {
      ...base,
      ...(prefill?.form || {}),
      date: (prefill?.form?.date ?? base.date) || defaultDt,
    } as EventFormData;

    setFormData(merged);
    setPriceMode(derivePriceMode(merged));
    setAdditionalTimeSlots(
      (prefill?.additionalDates || [])
        .filter((slot) => slot.date)
        .map((slot) => ({ start: slot.date, end: slot.end_date || "" })),
    );
    setSelectedOrganizerIds(prefill?.organizerIds || []);
    setSelectedArtistIds(prefill?.artistIds || []);
    setSelectedTagIds(prefill?.tagIds || []);
    setImagePreview(merged.image_url ? merged.image_url : null);
    setShowEndDate(Boolean(merged.end_date));
  }, [defaultDate, event, open, prefill]);

  // Doublons potentiels : même lieu, créneaux qui se chevauchent.
  React.useEffect(() => {
    if (!open) return;

    const locationId = formData.location_id.trim();
    const startValue = formData.date;
    const endValue = formData.end_date;

    if (!locationId || locationId === "none" || !startValue) {
      setDuplicateCandidates([]);
      return;
    }

    let cancelled = false;

    void fetchPotentialDuplicateEvents({
      supabase,
      locationId,
      startValue,
      endValue,
      excludeEventId: event?.id,
    })
      .then((duplicates) => {
        if (!cancelled) setDuplicateCandidates(duplicates);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Erreur lors de la vérification des doublons potentiels:", error);
          setDuplicateCandidates([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [event?.id, formData.date, formData.end_date, formData.location_id, open]);

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
        if (!cancelled) setMajorEvents((data || []) as MajorEventOption[]);
      } catch (e) {
        console.error("Erreur major events:", e);
        if (!cancelled) setMajorEvents([]);
      } finally {
        if (!cancelled) setLoadingMajorEvents(false);
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

  // Salles du lieu sélectionné.
  React.useEffect(() => {
    const locationId = formData.location_id;
    if (!open) return;
    if (!locationId) {
      setRooms([]);
      setFormData((prev) => (prev.room_id ? { ...prev, room_id: "" } : prev));
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
        if (!cancelled) setRooms((data || []) as RoomOption[]);
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

  // Capacité reprise du lieu (seulement si vide).
  React.useEffect(() => {
    if (!open) return;
    if (!formData.location_id) return;
    if (formData.capacity) return;
    const loc = [...createdLocations, ...locations].find((l) => l.id === formData.location_id);
    if (loc?.capacity != null) {
      setFormData((prev) => ({
        ...prev,
        capacity: String(loc.capacity ?? ""),
      }));
    }
  }, [createdLocations, formData.location_id, locations, formData.capacity, open]);

  // Le titre s'agrandit avec son contenu et suit la largeur disponible. L'observateur
  // est attaché à l'élément lui-même : le panneau monte son contenu après coup.
  const resizeTitle = React.useCallback(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  const attachTitle = React.useCallback(
    (element: HTMLTextAreaElement | null) => {
      titleObserverRef.current?.disconnect();
      titleObserverRef.current = null;
      titleRef.current = element;
      if (!element) return;
      let lastWidth = 0;
      const observer = new ResizeObserver(() => {
        if (element.clientWidth === lastWidth) return;
        lastWidth = element.clientWidth;
        resizeTitle();
      });
      observer.observe(element);
      titleObserverRef.current = observer;
    },
    [resizeTitle],
  );

  React.useEffect(() => {
    resizeTitle();
  }, [formData.title, resizeTitle]);

  const availableLocations = React.useMemo(() => {
    const map = new Map<string, LocationData>();
    [...locations, ...createdLocations].forEach((location) => map.set(location.id, location));
    return Array.from(map.values());
  }, [createdLocations, locations]);

  const availableOrganizers = React.useMemo(() => {
    const map = new Map<string, OrganizerOption>();
    [...organizers, ...createdOrganizers].forEach((organizer) => map.set(organizer.id, organizer));
    return Array.from(map.values());
  }, [createdOrganizers, organizers]);

  const availableArtists = React.useMemo(() => {
    const map = new Map<string, ArtistOption>();
    [...artists, ...createdArtists].forEach((artist) => map.set(artist.id, artist));
    return Array.from(map.values());
  }, [artists, createdArtists]);

  function handleLocationSelection(locationId: string) {
    setDirty(true);
    if (locationId) {
      const selected = availableLocations.find((location) => location.id === locationId);
      if (selected) {
        setFormData((prev) => ({
          ...prev,
          location_id: locationId,
          room_id: "",
          capacity: selected.capacity != null ? String(selected.capacity) : prev.capacity,
        }));
        return;
      }
    }

    setFormData((prev) => ({ ...prev, location_id: locationId, room_id: "" }));
  }

  function handleOrganizerChange(newIds: string[]) {
    setDirty(true);
    setSelectedOrganizerIds(newIds);

    // Le premier organisateur complète les réseaux sociaux (sans écraser) et,
    // s'il s'agit d'un lieu-organisateur, devient le lieu de l'événement.
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
        title: "Création du tag impossible",
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
        title: "Envoi de l’affiche impossible",
        description: e?.message || "Vérifie le bucket `event-images`.",
        variant: "destructive",
      });
      return null;
    }
  }

  function isStoredEventImageUrl(url: string) {
    if (!url) return false;
    return /\/storage\/v1\/object\/public\/event-images\//.test(url);
  }

  async function uploadImageFromUrlIfNeeded(rawUrl: string): Promise<string | null> {
    const imageUrl = rawUrl.trim();
    if (!imageUrl || isStoredEventImageUrl(imageUrl)) return imageUrl || null;

    try {
      const blob = await fetchRemoteImageBlob(imageUrl);
      const contentType = blob.type || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        throw new Error("URL invalide : la ressource n'est pas une image.");
      }

      const inferredExt = (() => {
        if (contentType.includes("png")) return "png";
        if (contentType.includes("webp")) return "webp";
        if (contentType.includes("gif")) return "gif";
        return "jpg";
      })();
      const remoteFile = new File([blob], `remote-${Date.now()}.${inferredExt}`, { type: contentType });
      const compressedFile = await compressImage(remoteFile, 2);
      const fileExt = compressedFile.name.split(".").pop() || inferredExt;
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
      console.error("Erreur upload image depuis URL:", e);
      toast({
        title: "Copie de l’affiche impossible",
        description: e?.message || "Impossible de copier l'image distante dans le stockage `event-images`.",
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
        const { error: deleteError } = await supabase.from("major_event_events").delete().eq("event_id", savedEventId);
        if (deleteError) throw deleteError;
      }
      return;
    }

    if (currentMajorEventId === normalizedMajorEventId) return;

    if (currentMajorEventId) {
      const { error: deleteError } = await supabase.from("major_event_events").delete().eq("event_id", savedEventId);
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

  function focusTitleField() {
    window.setTimeout(() => titleRef.current?.focus(), 80);
  }

  /** Prépare la saisie suivante en gardant le contexte (lieu, catégorie, organisateurs, tags, date). */
  function resetForNextEvent() {
    setFormData((previous) => ({
      ...emptyForm(),
      date: previous.date,
      location_id: previous.location_id,
      room_id: previous.room_id,
      category: previous.category,
      show_on_app: previous.show_on_app,
      agenda_types: previous.agenda_types,
      major_event_id: previous.major_event_id,
      hide_from_home: previous.hide_from_home,
    }));
    setPriceMode("unknown");
    setSelectedArtistIds([]);
    setImageFile(null);
    setImagePreview(null);
    setImageWasCleared(false);
    setAdditionalTimeSlots([]);
    setShowEndDate(false);
    setDirty(false);
    setShowErrors(false);
    formScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    focusTitleField();
  }

  // Création : le curseur va directement dans le titre.
  React.useEffect(() => {
    if (open && !isEdit) focusTitleField();
  }, [open, isEdit]);

  /* -------------------------------- Validation ------------------------------ */

  const normalizedPriceMin = toNullablePrice(formData.price_min);
  const normalizedPriceMax = toNullablePrice(formData.price_max);
  const endBeforeStart = (() => {
    const start = parseLocalDateTime(formData.date)?.js;
    const end = parseLocalDateTime(formData.end_date)?.js;
    return Boolean(start && end && end < start);
  })();
  const invalidSlotIndexes = additionalTimeSlots
    .map((slot, index) => {
      const start = parseLocalDateTime(slot.start)?.js;
      const end = parseLocalDateTime(slot.end)?.js;
      return start && end && end < start ? index : -1;
    })
    .filter((index) => index >= 0);

  const errors = {
    title: showErrors && !formData.title.trim() ? "Donne un titre à l’événement." : null,
    date:
      showErrors && !formData.date
        ? "Choisis la date de début."
        : !isEdit && blockPastCreation && isBeforeToday(formData.date)
          ? "Impossible de créer un événement déjà passé depuis la collecte."
          : null,
    endDate: endBeforeStart ? "La fin doit être après le début." : null,
    category:
      showErrors && formData.show_on_app && !formData.category.trim()
        ? "Requise pour afficher l’événement dans l’app."
        : null,
    price:
      formData.is_pay_what_you_want || priceMode !== "paid"
        ? null
        : normalizedPriceMin === null && normalizedPriceMax !== null
          ? "Renseigne le prix avant le maximum."
          : normalizedPriceMin !== null && normalizedPriceMax !== null && normalizedPriceMax < normalizedPriceMin
            ? "Le maximum doit être supérieur au prix."
            : null,
    slots: invalidSlotIndexes.length > 0 ? "Une des dates supplémentaires finit avant de commencer." : null,
  };

  const blockingIssues = [
    !formData.title.trim() ? { label: "titre", target: "event-title" } : null,
    !formData.date ? { label: "date de début", target: "event-start-date" } : null,
    !isEdit && blockPastCreation && isBeforeToday(formData.date)
      ? { label: "date passée", target: "event-start-date" }
      : null,
    endBeforeStart ? { label: "date de fin", target: "event-end-date" } : null,
    formData.show_on_app && !formData.category.trim() ? { label: "catégorie", target: "event-category" } : null,
    errors.price ? { label: "prix", target: "event-price-min" } : null,
    errors.slots ? { label: "dates supplémentaires", target: "event-when" } : null,
  ].filter((issue): issue is { label: string; target: string } => Boolean(issue));

  function jumpTo(targetId: string) {
    const element = document.getElementById(targetId);
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = element.matches("input, textarea, button")
      ? element
      : element.querySelector<HTMLElement>("input, textarea, button");
    window.setTimeout(() => focusable?.focus({ preventScroll: true }), 250);
  }

  function handleShortcutKeyDown(keyEvent: React.KeyboardEvent<HTMLDivElement>) {
    if (keyEvent.key !== "Enter" || !(keyEvent.metaKey || keyEvent.ctrlKey)) return;
    keyEvent.preventDefault();
    if (busy) return;
    void save({ forceApproved: keyEvent.shiftKey });
  }

  /* ------------------------------- Enregistrement --------------------------- */

  async function save({ forceApproved }: { forceApproved: boolean }) {
    if (saving) return;

    // Les erreurs s'affichent dans le formulaire et dans le pied ; on amène au premier point.
    if (blockingIssues.length > 0) {
      setShowErrors(true);
      jumpTo(blockingIssues[0].target);
      return;
    }

    const allSlots: AdditionalTimeSlot[] = [{ start: formData.date, end: formData.end_date || "" }, ...additionalTimeSlots]
      .map((slot) => ({ start: slot.start.trim(), end: slot.end.trim() }))
      .filter((slot) => Boolean(slot.start));

    setSaving(true);
    try {
      const uploadedUrl = await uploadImageIfNeeded();
      if (imageFile && !uploadedUrl) {
        setSaving(false);
        return;
      }
      const normalizedImageUrl = formData.image_url.trim();
      const uploadedRemoteUrl =
        !imageFile && normalizedImageUrl ? await uploadImageFromUrlIfNeeded(normalizedImageUrl) : null;
      if (!imageFile && normalizedImageUrl && !uploadedRemoteUrl) {
        setSaving(false);
        return;
      }

      const selectedLocation =
        formData.location_id && formData.location_id !== "none"
          ? availableLocations.find((l) => l.id === formData.location_id) || null
          : null;

      const statusToSave: EventStatus = forceApproved ? "approved" : formData.status;
      const isPayWhatYouWant = Boolean(formData.is_pay_what_you_want);

      const baseData: any = {
        title: formData.title.trim(),
        description: normalizeNullable(formData.description || ""),
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? fromDatetimeLocal(formData.end_date) || null : null,
        category: formData.category.trim(),
        price: isPayWhatYouWant ? null : normalizedPriceMin,
        price_min: isPayWhatYouWant ? null : normalizedPriceMin,
        price_max: isPayWhatYouWant
          ? null
          : normalizedPriceMax !== null && normalizedPriceMin !== null && normalizedPriceMax > normalizedPriceMin
            ? normalizedPriceMax
            : null,
        is_pay_what_you_want: isPayWhatYouWant,
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
        hide_from_home: Boolean(formData.hide_from_home),
        show_on_app: Boolean(formData.show_on_app),
        agenda_types: parseAgendaTypes(formData.agenda_types),
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : [],
        address: selectedLocation?.address || null,
        latitude: selectedLocation?.latitude || null,
        longitude: selectedLocation?.longitude || null,
      };

      // Priorité de l'image : fichier importé > URL > image retirée > image existante.
      const nextImageUrl = (() => {
        if (uploadedUrl) return uploadedUrl;
        if (uploadedRemoteUrl) return uploadedRemoteUrl;
        if (normalizedImageUrl) return normalizedImageUrl;
        if (imageWasCleared) return null;
        return event?.image_url || null;
      })();
      baseData.image_url = nextImageUrl;

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;

      async function syncEventRelations(savedEventId: string) {
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
      }

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

      await syncEventRelations(savedEventId);

      const additionalUniqueSlots = allSlots.slice(1).filter((slot) => {
        return !(slot.start === formData.date && (slot.end || "") === (formData.end_date || ""));
      });

      for (const slot of additionalUniqueSlots) {
        const slotData = {
          ...baseData,
          date: fromDatetimeLocal(slot.start) || slot.start,
          end_date: slot.end ? fromDatetimeLocal(slot.end) || slot.end : null,
          created_by: userId,
        };

        const { data: extraEvent, error: extraError } = await supabase
          .from("events")
          .insert([slotData])
          .select("id")
          .single();
        if (extraError) throw extraError;

        await syncEventRelations(extraEvent.id);
      }

      if (isEdit && event) {
        await removeReplacedStorageObject(supabase, {
          bucket: "event-images",
          previousUrl: event.image_url,
          nextUrl: nextImageUrl,
          references: [{ table: "events", column: "image_url" }],
        });
      }

      await logAdminAction({
        action: isEdit ? "event.update" : "event.create",
        entityType: "event",
        entityId: savedEventId,
        entityLabel: baseData.title,
        metadata: {
          status: statusToSave,
          force_approved: forceApproved,
          previous_status: event?.status ?? null,
          additional_slots: additionalUniqueSlots.length,
        },
      });

      const createdCount = 1 + additionalUniqueSlots.length;
      const savedTitle =
        statusToSave === "approved" ? (isEdit ? "Événement mis à jour" : "Événement publié") : "Événement enregistré";

      if (createAnother && allowCreateAnother && !isEdit) {
        toast({
          title: savedTitle,
          description: "Le lieu, la date et la catégorie sont gardés pour le suivant.",
          variant: "success",
        });
        resetForNextEvent();
        onSaved?.(savedEventId);
        return;
      }

      toast({
        title: savedTitle,
        description: createdCount > 1 ? `${createdCount} dates créées.` : undefined,
        variant: "success",
      });
      setDirty(false);
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

  function confirmDelete() {
    if (!event) return;
    showConfirm({
      title: "Supprimer l’événement ?",
      description: "Il disparaîtra de l’agenda et de l’app. Cette action est irréversible.",
      variant: "destructive",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const { error } = await supabase.from("events").delete().eq("id", event.id);
          if (error) throw error;
          await logAdminAction({
            action: "event.delete",
            entityType: "event",
            entityId: event.id,
            entityLabel: event.title,
          });
          toast({ title: "Événement supprimé", variant: "success" });
          setDirty(false);
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

  /** Fermeture protégée : confirmation si des modifications ne sont pas enregistrées. */
  function requestClose() {
    if (busy) return;
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    showConfirm({
      title: "Fermer sans enregistrer ?",
      description: "Les modifications apportées à cette fiche seront perdues.",
      confirmText: "Fermer sans enregistrer",
      cancelText: "Continuer la saisie",
      variant: "destructive",
      onConfirm: () => {
        setDirty(false);
        onOpenChange(false);
      },
    });
  }

  /* ------------------------------- Interactions ------------------------------ */

  function changeStart(nextStart: string) {
    patchForm((previous) => ({
      ...previous,
      date: nextStart,
      end_date: previous.end_date ? shiftEnd(previous.date, nextStart, previous.end_date) : previous.end_date,
    }));
  }

  function pickQuickDate(day: Date) {
    const time = parseLocalDateTime(formData.date)?.time ?? "20:00";
    changeStart(`${format(day, "yyyy-MM-dd")}T${time}`);
  }

  function addEndDate() {
    setShowEndDate(true);
    const start = parseLocalDateTime(formData.date)?.js;
    if (start && !formData.end_date) {
      patchForm({ end_date: toLocalDateTimeValue(addHours(start, 2)) });
    }
    window.setTimeout(() => document.getElementById("event-end-date")?.focus(), 50);
  }

  function removeEndDate() {
    setShowEndDate(false);
    patchForm({ end_date: "" });
  }

  function addTimeSlot() {
    setDirty(true);
    setAdditionalTimeSlots((previous) => {
      const reference = previous.length > 0 ? previous[previous.length - 1] : { start: formData.date, end: formData.end_date };
      const referenceStart = parseLocalDateTime(reference.start)?.js;
      if (!referenceStart) return [...previous, { start: "", end: "" }];
      const nextStart = toLocalDateTimeValue(addDays(referenceStart, 1));
      const nextEnd = reference.end ? shiftEnd(reference.start, nextStart, reference.end) : "";
      return [...previous, { start: nextStart, end: nextEnd }];
    });
  }

  function updateTimeSlot(index: number, patch: Partial<AdditionalTimeSlot>) {
    setDirty(true);
    setAdditionalTimeSlots((previous) =>
      previous.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)),
    );
  }

  function removeTimeSlot(index: number) {
    setDirty(true);
    setAdditionalTimeSlots((previous) => previous.filter((_, slotIndex) => slotIndex !== index));
  }

  function applyPriceMode(mode: PriceMode) {
    setPriceMode(mode);
    patchForm((previous) => {
      if (mode === "pwyw") return { ...previous, is_pay_what_you_want: true, price_min: "", price_max: "" };
      if (mode === "free") return { ...previous, is_pay_what_you_want: false, price_min: "0", price_max: "" };
      if (mode === "unknown") return { ...previous, is_pay_what_you_want: false, price_min: "", price_max: "" };
      const currentMin = toNullablePrice(previous.price_min);
      return {
        ...previous,
        is_pay_what_you_want: false,
        price_min: currentMin && currentMin > 0 ? previous.price_min : "",
      };
    });
    if (mode === "paid") window.setTimeout(() => document.getElementById("event-price-min")?.focus(), 50);
  }

  function toggleAgendaType(typeId: (typeof AGENDA_TYPES)[number]["id"]) {
    patchForm((previous) => ({
      ...previous,
      agenda_types: previous.agenda_types.includes(typeId)
        ? previous.agenda_types.filter((value) => value !== typeId)
        : [...previous.agenda_types, typeId],
    }));
  }

  /* --------------------------------- Options -------------------------------- */

  // L'option « aucun » n'apparaît qu'une fois une valeur choisie : sinon l'invite s'affiche.
  const hasLocation = Boolean(formData.location_id);
  const locationOptions = React.useMemo(
    () => [
      ...(hasLocation ? [{ value: "", label: "Aucun lieu" }] : []),
      ...availableLocations.map((location) => ({
        value: location.id,
        label: location.city?.label ? `${location.name} · ${location.city.label}` : location.name,
      })),
    ],
    [availableLocations, hasLocation],
  );

  const hasCategory = Boolean(formData.category);
  const categoryOptions = React.useMemo(
    () => [
      ...(hasCategory ? [{ value: "", label: "Aucune catégorie" }] : []),
      ...categories.map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories, hasCategory],
  );

  const organizerOptions = React.useMemo(
    () =>
      availableOrganizers.map((o) => ({
        value: o.id,
        label: `${o.name}${o.type === "location" ? " (lieu)" : ""}`,
      })),
    [availableOrganizers],
  );

  const artistOptions = React.useMemo(
    () =>
      availableArtists.map((artist) => ({
        value: artist.id,
        label: artist.origin_city ? `${artist.name} · ${artist.origin_city}` : artist.name,
      })),
    [availableArtists],
  );

  const tagOptions = React.useMemo(() => tags.map((t) => ({ value: t.id, label: t.name })), [tags]);

  const hasMajorEvent = Boolean(formData.major_event_id);
  const majorEventOptions = React.useMemo(
    () => [
      ...(hasMajorEvent ? [{ value: "", label: "Aucun" }] : []),
      ...majorEvents.map((majorEvent) => ({
        value: majorEvent.id,
        label: `${majorEvent.title}${majorEvent.city_name ? ` · ${majorEvent.city_name}` : ""}`,
      })),
    ],
    [majorEvents, hasMajorEvent],
  );

  /* --------------------------------- Dérivés -------------------------------- */

  const externalUrlHref = getOpenableExternalUrl(formData.external_url);
  const selectedLocation = availableLocations.find((location) => location.id === formData.location_id) || null;
  const statusMeta = STATUS_META[formData.status];
  const hasImage = Boolean(imagePreview || formData.image_url.trim());
  const durationLabel = showEndDate ? describeDuration(formData.date, formData.end_date) : null;
  const totalOccurrences = 1 + additionalTimeSlots.filter((slot) => slot.start.trim()).length;
  const startParsed = parseLocalDateTime(formData.date);

  const completeness: CompletenessItem[] = [
    { key: "title", label: "Titre", done: Boolean(formData.title.trim()), required: true, targetId: "event-title" },
    { key: "date", label: "Date et heure", done: Boolean(formData.date), required: true, targetId: "event-start-date" },
    {
      key: "category",
      label: "Catégorie",
      done: Boolean(formData.category.trim()),
      required: formData.show_on_app,
      targetId: "event-category",
    },
    {
      key: "location",
      label: "Lieu",
      done: Boolean(formData.location_id && formData.location_id !== "none"),
      targetId: "event-location",
    },
    { key: "image", label: "Affiche", done: hasImage, targetId: "event-image" },
    { key: "description", label: "Description", done: Boolean(formData.description.trim()), targetId: "event-description" },
    { key: "price", label: "Tarif", done: priceMode !== "unknown", targetId: "event-pricing" },
    { key: "organizers", label: "Organisateur", done: selectedOrganizerIds.length > 0, targetId: "event-organizers" },
  ];

  const headerSubtitle = isEdit
    ? [
        startParsed ? format(startParsed.js, "EEE d MMM yyyy · HH:mm", { locale: fr }) : null,
        selectedLocation?.name,
      ]
        .filter(Boolean)
        .join(" · ") || "Modifie puis enregistre"
    : importNotice
      ? `Pré-rempli depuis ${importNotice.sourceLabel}`
      : "Les champs marqués * sont requis";

  const primaryApproves = formData.status !== "approved";

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0",
            isMobile ? "h-[100dvh]" : "w-full sm:max-w-[100vw] md:w-[min(1120px,100vw)]",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col bg-background" onKeyDown={handleShortcutKeyDown}>
            {/* En-tête */}
            <div className="flex items-center gap-3 border-b border-border px-5 py-3 lg:px-6">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-[15px] font-semibold">
                  {isEdit ? "Modifier l’événement" : "Nouvel événement"}
                </SheetTitle>
                <SheetDescription className="truncate text-xs first-letter:uppercase">{headerSubtitle}</SheetDescription>
              </div>
              <Badge variant={statusMeta.badge} className="hidden sm:inline-flex">
                <span className={cn("size-1.5 rounded-full", statusMeta.dot)} />
                {statusMeta.label}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={requestClose}
                aria-label="Fermer"
              >
                <X />
              </Button>
            </div>

            {/* Corps : contenu à gauche, propriétés à droite */}
            <form
              noValidate
              className="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void save({ forceApproved: false });
              }}
            >
              <div ref={formScrollRef} className="min-w-0 flex-1 lg:overflow-y-auto">
                <div className="@container mx-auto max-w-3xl space-y-7 px-5 py-6 lg:px-8 lg:py-8">
                  {importNotice && !isEdit ? (
                    <div className="flex gap-2.5 rounded-lg border border-info/25 bg-info/[0.06] px-3.5 py-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">Pré-rempli depuis {importNotice.sourceLabel}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {importNotice.method === "structured"
                            ? "Informations lues dans les données de la page : titre, date et lieu sont fiables."
                            : importNotice.method === "structured+ai"
                              ? "Date et lieu lus dans les données de la page ; catégorie, artistes et tags suggérés par l’IA."
                              : importNotice.method === "ai"
                                ? "Informations extraites par l’IA : vérifie surtout la date et l’heure."
                                : "Vérifie le titre, la date et le lieu avant d’enregistrer."}
                        </p>
                        {importNotice.warnings.length > 0 ? (
                          <ul className="mt-1 space-y-1 text-[13px] text-muted-foreground">
                            {importNotice.warnings.slice(0, 5).map((warning, index) => (
                              <li key={`${warning.field}-${index}`} className="flex gap-1.5">
                                <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-warning" />
                                <span>{warning.message}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Titre */}
                  <div className="space-y-1.5">
                    <textarea
                      ref={attachTitle}
                      id="event-title"
                      rows={1}
                      value={formData.title}
                      onChange={(changeEvent) => patchForm({ title: changeEvent.target.value.replace(/\n+/g, " ") })}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === "Enter" && !keyEvent.metaKey && !keyEvent.ctrlKey) {
                          keyEvent.preventDefault();
                          document.getElementById("event-start-date")?.focus();
                        }
                      }}
                      placeholder="Titre de l’événement"
                      aria-label="Titre de l’événement"
                      aria-invalid={Boolean(errors.title) || undefined}
                      disabled={busy}
                      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-2xl font-semibold leading-tight tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 md:text-[28px]"
                    />
                    {errors.title ? (
                      <p className="text-xs font-medium text-destructive" role="alert">
                        {errors.title}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-7">
                    {/* Date et horaires */}
                    <FormBlock
                      id="event-when"
                      title="Date et horaires"
                      action={
                        durationLabel ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                            {durationLabel}
                          </span>
                        ) : null
                      }
                    >
                      <div className="grid gap-4 @lg:grid-cols-2">
                        <Field label="Début" htmlFor="event-start-date" required error={errors.date}>
                          <EventDateTimeInput
                            id="event-start-date"
                            value={formData.date}
                            onChange={changeStart}
                            invalid={Boolean(errors.date)}
                            disabled={busy}
                          />
                        </Field>
                        <Field
                          label="Fin"
                          htmlFor="event-end-date"
                          error={errors.endDate}
                          action={
                            showEndDate ? (
                              <button
                                type="button"
                                onClick={removeEndDate}
                                disabled={busy}
                                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              >
                                Retirer
                              </button>
                            ) : null
                          }
                        >
                          {showEndDate ? (
                            <EventDateTimeInput
                              id="event-end-date"
                              value={formData.end_date}
                              onChange={(value) => patchForm({ end_date: value })}
                              invalid={Boolean(errors.endDate)}
                              placeholder="Date de fin"
                              fallbackTime={startParsed ? format(addHours(startParsed.js, 2), "HH:mm") : "23:00"}
                              disabled={busy}
                            />
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={addEndDate}
                              disabled={busy}
                              className="w-full justify-start border-dashed font-normal text-muted-foreground"
                            >
                              <Plus />
                              Ajouter une fin
                            </Button>
                          )}
                        </Field>
                      </div>

                      {!isEdit ? <QuickDateChips value={formData.date} onPick={pickQuickDate} disabled={busy} /> : null}

                      {showPastEventWarning && !errors.date ? (
                        <p className="flex items-center gap-1.5 text-xs text-warning">
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                          Cette date est passée : l’événement sera enregistré comme passé.
                        </p>
                      ) : null}

                      <div className="grid gap-4 @lg:grid-cols-2">
                        <Field
                          label="Ouverture des portes"
                          htmlFor="event-doors"
                          hint="Si différente de l’heure de début."
                        >
                          <TimeInput
                            id="event-doors"
                            value={formData.door_opening_time}
                            onChange={(value) => patchForm({ door_opening_time: value })}
                            disabled={busy}
                            className="@lg:w-[7.25rem]"
                          />
                        </Field>
                      </div>

                      {additionalTimeSlots.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Autres dates</p>
                          {additionalTimeSlots.map((slot, index) => (
                            <div
                              key={index}
                              className={cn(
                                "flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5",
                                invalidSlotIndexes.includes(index) && "border-destructive/50",
                              )}
                            >
                              <span className="mt-2.5 w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                                {index + 2}
                              </span>
                              <div className="grid min-w-0 flex-1 gap-2 @2xl:grid-cols-2">
                                <EventDateTimeInput
                                  value={slot.start}
                                  onChange={(value) =>
                                    updateTimeSlot(index, {
                                      start: value,
                                      end: slot.end ? shiftEnd(slot.start, value, slot.end) : slot.end,
                                    })
                                  }
                                  disabled={busy}
                                />
                                <EventDateTimeInput
                                  value={slot.end}
                                  onChange={(value) => updateTimeSlot(index, { end: value })}
                                  placeholder="Fin (facultatif)"
                                  disabled={busy}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="mt-1 text-muted-foreground"
                                onClick={() => removeTimeSlot(index)}
                                disabled={busy}
                                aria-label={`Retirer la date ${index + 2}`}
                              >
                                <X />
                              </Button>
                            </div>
                          ))}
                          {errors.slots ? (
                            <p className="text-xs font-medium text-destructive" role="alert">
                              {errors.slots}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {totalOccurrences} événements seront enregistrés, un par date, avec les mêmes informations.
                            </p>
                          )}
                        </div>
                      ) : null}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-muted-foreground"
                        onClick={addTimeSlot}
                        disabled={busy}
                      >
                        <Plus />
                        Ajouter une autre date
                      </Button>
                    </FormBlock>

                    {/* Lieu */}
                    <FormBlock id="event-where" title="Lieu">
                      <div
                        className={cn(
                          "grid gap-4",
                          rooms.length > 0 || loadingRooms ? "@lg:grid-cols-[minmax(0,1fr)_minmax(0,13rem)]" : "",
                        )}
                      >
                        <Field
                          label="Lieu"
                          hint={
                            selectedLocation ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {[selectedLocation.address, selectedLocation.city?.label].filter(Boolean).join(" · ") ||
                                  "Adresse non renseignée"}
                              </span>
                            ) : (
                              "Introuvable ? Crée-le depuis la liste."
                            )
                          }
                        >
                          <div id="event-location">
                            <SelectSearchable
                              options={locationOptions}
                              value={formData.location_id}
                              onValueChange={handleLocationSelection}
                              placeholder="Choisir un lieu"
                              searchPlaceholder="Rechercher un lieu…"
                              emptyActionLabel="Créer un lieu"
                              onEmptyAction={(query) => setQuickCreate({ kind: "location", name: query })}
                              disabled={busy}
                            />
                          </div>
                        </Field>
                        {rooms.length > 0 || loadingRooms ? (
                          <Field label="Salle">
                            <Select
                              value={formData.room_id || "none"}
                              onValueChange={(value) => patchForm({ room_id: value === "none" ? "" : value })}
                              disabled={busy || loadingRooms}
                            >
                              <SelectTrigger aria-label="Salle">
                                <SelectValue placeholder={loadingRooms ? "Chargement…" : "Aucune"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Aucune</SelectItem>
                                {rooms.map((room) => (
                                  <SelectItem key={room.id} value={room.id}>
                                    {room.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                        ) : null}
                      </div>
                      <DuplicateNotice duplicates={duplicateCandidates} />
                    </FormBlock>

                    {/* Catégorie et tags */}
                    <FormBlock
                      id="event-classification"
                      title="Catégorie et tags"
                      description="La catégorie range l’événement dans l’app ; les tags affinent la recherche."
                    >
                      <div className="grid gap-4 @lg:grid-cols-2">
                        <Field
                          label="Catégorie"
                          required={formData.show_on_app}
                          error={errors.category}
                          hint={formData.show_on_app ? undefined : "Facultative : l’événement est masqué de l’app."}
                        >
                          <div id="event-category">
                            <SelectSearchable
                              options={categoryOptions}
                              value={formData.category}
                              onValueChange={(value) => patchForm({ category: value })}
                              placeholder="Choisir une catégorie"
                              searchPlaceholder="Rechercher une catégorie…"
                              disabled={busy}
                              className={errors.category ? "border-destructive/60" : undefined}
                            />
                          </div>
                        </Field>
                        <Field label="Tags">
                          <MultiSelectCreatable
                            options={tagOptions}
                            selected={selectedTagIds}
                            onChange={(next) => {
                              setDirty(true);
                              setSelectedTagIds(next);
                            }}
                            onCreate={handleCreateTag}
                            placeholder="Ajouter des tags"
                            createPlaceholder="Créer ou rechercher un tag…"
                            disabled={busy}
                          />
                        </Field>
                      </div>
                    </FormBlock>

                    {/* Organisateurs et artistes */}
                    <FormBlock id="event-people" title="Organisateurs et artistes">
                      <Field
                        label="Organisateurs"
                        hint="Le premier complète les réseaux sociaux vides ; un lieu-organisateur devient le lieu."
                      >
                        <div id="event-organizers">
                          <MultiSelect
                            options={organizerOptions}
                            selected={selectedOrganizerIds}
                            onChange={handleOrganizerChange}
                            placeholder="Choisir des organisateurs"
                            searchPlaceholder="Rechercher un organisateur…"
                            disabled={busy}
                            emptyActionLabel="Créer un organisateur"
                            onEmptyAction={(query) => setQuickCreate({ kind: "organizer", name: query })}
                          />
                        </div>
                      </Field>
                      <Field label="Artistes" hint="Affichés dans cet ordre sur la fiche publique.">
                        <MultiSelect
                          options={artistOptions}
                          selected={selectedArtistIds}
                          onChange={(next) => {
                            setDirty(true);
                            setSelectedArtistIds(next);
                          }}
                          placeholder="Ajouter des artistes"
                          searchPlaceholder="Rechercher un artiste…"
                          disabled={busy}
                          emptyActionLabel="Créer un artiste"
                          onEmptyAction={(query) => setQuickCreate({ kind: "artist", name: query })}
                        />
                      </Field>
                    </FormBlock>

                    {/* Description */}
                    <FormBlock
                      id="event-about"
                      title="Description"
                      action={
                        formData.description.length > 0 ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formData.description.length} caractères
                          </span>
                        ) : null
                      }
                    >
                      <Textarea
                        id="event-description"
                        value={formData.description}
                        onChange={(changeEvent) => patchForm({ description: changeEvent.target.value })}
                        placeholder="Programme, ambiance, line-up, infos pratiques…"
                        disabled={busy}
                        aria-label="Description"
                        className="min-h-[180px] resize-y leading-relaxed"
                      />
                    </FormBlock>

                    {/* Billetterie */}
                    <FormBlock id="event-pricing" title="Billetterie">
                      <Field label="Tarif">
                        <SegmentedControl
                          aria-label="Tarif"
                          value={priceMode}
                          onValueChange={applyPriceMode}
                          className="w-full @lg:w-auto [&>button]:flex-1"
                          items={[
                            { value: "unknown", label: "Non précisé" },
                            { value: "free", label: "Gratuit" },
                            { value: "paid", label: "Payant" },
                            { value: "pwyw", label: "Prix libre" },
                          ]}
                        />
                      </Field>
                      {priceMode === "paid" ? (
                        <div className="grid gap-4 @lg:grid-cols-2">
                          <Field label="Prix" htmlFor="event-price-min" error={errors.price}>
                            <PriceInput
                              id="event-price-min"
                              value={formData.price_min}
                              onChange={(value) => patchForm({ price_min: value })}
                              placeholder="12"
                              disabled={busy}
                              invalid={Boolean(errors.price)}
                            />
                          </Field>
                          <Field label="Prix maximum" htmlFor="event-price-max" hint="Pour une fourchette, ex. 8 à 12 €.">
                            <PriceInput
                              id="event-price-max"
                              value={formData.price_max}
                              onChange={(value) => patchForm({ price_max: value })}
                              placeholder="Facultatif"
                              disabled={busy}
                            />
                          </Field>
                        </div>
                      ) : null}
                      <div className="grid gap-4 @lg:grid-cols-2 @lg:items-end">
                        <Field
                          label="Capacité"
                          htmlFor="event-capacity"
                          hint={
                            selectedLocation?.capacity != null &&
                            formData.capacity === String(selectedLocation.capacity)
                              ? "Reprise du lieu."
                              : undefined
                          }
                        >
                          <Input
                            id="event-capacity"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={formData.capacity}
                            onChange={(changeEvent) => patchForm({ capacity: changeEvent.target.value })}
                            placeholder="Nombre de places"
                            disabled={busy}
                            className="tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </Field>
                        <EntitySwitchRow
                          id="event-is-full"
                          title="Complet"
                          description="Affiché à la place du tarif."
                          checked={formData.is_full}
                          onCheckedChange={(checked) => patchForm({ is_full: checked })}
                        />
                      </div>
                    </FormBlock>

                    {/* Liens */}
                    <FormBlock id="event-links" title="Liens">
                      <div className="grid gap-4 @lg:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
                        <Field
                          label="Lien externe"
                          htmlFor="event-external-url"
                          hint="Bouton sur la fiche : billetterie, page de l’événement…"
                          action={
                            externalUrlHref ? (
                              <a
                                href={externalUrlHref}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              >
                                Ouvrir
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null
                          }
                        >
                          <Input
                            id="event-external-url"
                            type="url"
                            value={formData.external_url}
                            onChange={(changeEvent) => patchForm({ external_url: changeEvent.target.value })}
                            placeholder="https://…"
                            disabled={busy}
                          />
                        </Field>
                        <Field label="Texte du bouton" htmlFor="event-external-label">
                          <Input
                            id="event-external-label"
                            value={formData.external_url_label}
                            onChange={(changeEvent) => patchForm({ external_url_label: changeEvent.target.value })}
                            placeholder="Réserver"
                            disabled={busy}
                          />
                        </Field>
                      </div>
                      <div className="grid gap-4 @lg:grid-cols-2">
                        <Field
                          label={
                            <>
                              <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                              Instagram
                            </>
                          }
                          htmlFor="event-instagram"
                        >
                          <Input
                            id="event-instagram"
                            type="url"
                            value={formData.instagram_url}
                            onChange={(changeEvent) => patchForm({ instagram_url: changeEvent.target.value })}
                            placeholder="https://instagram.com/…"
                            disabled={busy}
                          />
                        </Field>
                        <Field
                          label={
                            <>
                              <Facebook className="h-3.5 w-3.5 text-muted-foreground" />
                              Facebook
                            </>
                          }
                          htmlFor="event-facebook"
                        >
                          <Input
                            id="event-facebook"
                            type="url"
                            value={formData.facebook_url}
                            onChange={(changeEvent) => patchForm({ facebook_url: changeEvent.target.value })}
                            placeholder="https://facebook.com/…"
                            disabled={busy}
                          />
                        </Field>
                      </div>
                      <Field
                        label="URL source"
                        htmlFor="event-scraping-url"
                        hint="Page d’origine utilisée par la collecte automatique."
                      >
                        <Input
                          id="event-scraping-url"
                          type="url"
                          value={formData.scraping_url}
                          onChange={(changeEvent) => patchForm({ scraping_url: changeEvent.target.value })}
                          placeholder="https://…"
                          disabled={busy}
                        />
                      </Field>
                    </FormBlock>
                  </div>
                </div>
              </div>

              {/* Panneau de propriétés */}
              <aside className="border-border bg-muted/30 max-lg:border-t lg:w-[340px] lg:shrink-0 lg:overflow-y-auto lg:border-l">
                <AsideSection title="Affiche">
                  <div id="event-image" className="scroll-mt-6">
                    <EventImageUpload
                      currentImageUrl={imagePreview}
                      enablePaste={open && !quickCreate}
                      onImageChange={(file, preview) => {
                        setDirty(true);
                        setImageFile(file);
                        setImagePreview(preview);
                        if (file) {
                          setImageWasCleared(false);
                          setFormData((previous) => ({ ...previous, image_url: "" }));
                        } else if (!preview) {
                          setImageWasCleared(true);
                          setFormData((previous) => ({ ...previous, image_url: "" }));
                        }
                      }}
                      onUrlChange={(url) => {
                        setDirty(true);
                        setFormData((previous) => ({ ...previous, image_url: url }));
                        setImagePreview(url || null);
                        if (url) {
                          setImageWasCleared(false);
                          setImageFile(null);
                        }
                      }}
                      disabled={busy}
                    />
                  </div>
                </AsideSection>

                <AsideSection title="Complétude">
                  <CompletenessList items={completeness} onJump={(item) => jumpTo(item.targetId)} />
                </AsideSection>

                <AsideSection title="Publication">
                  <SegmentedControl
                    aria-label="Statut"
                    size="sm"
                    value={formData.status}
                    onValueChange={(status) => patchForm({ status })}
                    className="w-full [&>button]:flex-1 [&>button]:px-1.5"
                    items={(Object.keys(STATUS_META) as EventStatus[]).map((status) => ({
                      value: status,
                      label: STATUS_META[status].label,
                      icon: <span className={cn("size-1.5 rounded-full", STATUS_META[status].dot)} />,
                    }))}
                  />
                  <div className="space-y-4 pt-2">
                    <PropertySwitch
                      id="event-show-on-app"
                      label="Visible dans l’app"
                      description="Sinon, réservé au flux partenaire (Radio Campus) et absent de l’API publique."
                      checked={formData.show_on_app}
                      onCheckedChange={(checked) => patchForm({ show_on_app: checked })}
                      disabled={busy}
                    />
                    <PropertySwitch
                      id="event-featured"
                      label="À la une"
                      description="Mis en avant dans les sélections éditoriales."
                      checked={formData.is_featured}
                      onCheckedChange={(checked) => patchForm({ is_featured: checked })}
                      disabled={busy}
                    />
                    <PropertySwitch
                      id="event-hide-home"
                      label="Masquer de l’accueil"
                      description="Reste visible dans les catégories."
                      checked={formData.hide_from_home}
                      onCheckedChange={(checked) => patchForm({ hide_from_home: checked })}
                      disabled={busy}
                    />
                  </div>
                </AsideSection>

                <AsideSection title="Agenda partenaires">
                  <div className="flex flex-wrap gap-1.5">
                    {AGENDA_TYPES.map((type) => {
                      const active = formData.agenda_types.includes(type.id);
                      return (
                        <button
                          key={type.id}
                          type="button"
                          aria-pressed={active}
                          disabled={busy}
                          onClick={() => toggleAgendaType(type.id)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                          )}
                        >
                          {active ? <Check className="h-3 w-3" /> : null}
                          {type.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Labels pour les agendas partenaires, distincts des catégories de l’app.
                  </p>
                </AsideSection>

                <AsideSection title="Multi-événement">
                  <SelectSearchable
                    options={majorEventOptions}
                    value={formData.major_event_id}
                    onValueChange={(value) => patchForm({ major_event_id: value })}
                    placeholder={loadingMajorEvents ? "Chargement…" : "Rattacher à un festival…"}
                    searchPlaceholder="Rechercher…"
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">Festival ou programmation commune.</p>
                </AsideSection>

                {isEdit && event?.created_at ? (
                  <p className="px-5 pb-5 text-[11px] text-muted-foreground">
                    Créé le {format(new Date(event.created_at), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                  </p>
                ) : null}
              </aside>
            </form>

            {/* Pied */}
            <div className="flex items-center gap-2 border-t border-border bg-background px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 lg:px-6">
              {showErrors && blockingIssues.length > 0 ? (
                <button
                  type="button"
                  onClick={() => jumpTo(blockingIssues[0].target)}
                  aria-label={`À corriger : ${blockingIssues.map((issue) => issue.label).join(", ")}`}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-destructive/20"
                >
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                  <span className="tabular-nums sm:hidden">{blockingIssues.length}</span>
                  <span className="truncate max-sm:hidden">
                    {blockingIssues.length > 1 ? `${blockingIssues.length} points à corriger` : "1 point à corriger"}
                    <span className="font-normal text-destructive/80">
                      {" "}
                      · {blockingIssues.map((issue) => issue.label).join(", ")}
                    </span>
                  </span>
                </button>
              ) : isEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size={isMobile ? "icon" : "sm"}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={confirmDelete}
                  disabled={busy}
                  aria-label="Supprimer l’événement"
                >
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {isMobile ? null : "Supprimer"}
                </Button>
              ) : allowCreateAnother ? (
                <label
                  htmlFor="event-create-another"
                  className="hidden cursor-pointer items-center gap-2 text-sm text-muted-foreground sm:flex"
                >
                  <Switch
                    id="event-create-another"
                    checked={createAnother}
                    onCheckedChange={updateCreateAnother}
                    disabled={busy}
                  />
                  Créer un autre ensuite
                </label>
              ) : null}
              {showErrors && blockingIssues.length > 0 ? null : (
                <span className="hidden text-xs text-muted-foreground xl:inline">
                  <kbd className="font-sans">⌘↵</kbd> enregistrer · <kbd className="font-sans">⌘⇧↵</kbd> approuver
                </span>
              )}

              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={requestClose} disabled={busy} className="max-sm:hidden">
                  Annuler
                </Button>
                {primaryApproves ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void save({ forceApproved: false })}
                    disabled={busy}
                    title="Enregistrer sans changer le statut (⌘↵)"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    <span className="sm:hidden">Enregistrer</span>
                    <span className="max-sm:hidden">
                      {formData.status === "pending" ? "Enregistrer en attente" : "Enregistrer"}
                    </span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => void save({ forceApproved: primaryApproves })}
                  disabled={busy}
                  title={primaryApproves ? "Enregistrer et approuver (⌘⇧↵)" : "Enregistrer (⌘↵)"}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  {primaryApproves ? (
                    <>
                      <span className="sm:hidden">Approuver</span>
                      <span className="max-sm:hidden">Enregistrer et approuver</span>
                    </>
                  ) : (
                    "Enregistrer"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <QuickLocationDialog
        open={quickCreate?.kind === "location"}
        onOpenChange={(next) => (next ? undefined : setQuickCreate(null))}
        defaultName={quickCreate?.kind === "location" ? quickCreate.name : ""}
        onCreated={(location, isOrganizer) => {
          setCreatedLocations((previous) => [...previous, location]);
          if (isOrganizer) {
            setCreatedOrganizers((previous) => [
              ...previous,
              { id: location.id, name: location.name, instagram_url: null, facebook_url: null, type: "location" },
            ]);
          }
          setDirty(true);
          setFormData((previous) => ({
            ...previous,
            location_id: location.id,
            room_id: "",
            capacity: location.capacity != null ? String(location.capacity) : previous.capacity,
          }));
        }}
      />
      <QuickOrganizerDialog
        open={quickCreate?.kind === "organizer"}
        onOpenChange={(next) => (next ? undefined : setQuickCreate(null))}
        defaultName={quickCreate?.kind === "organizer" ? quickCreate.name : ""}
        onCreated={(organizer) => {
          setCreatedOrganizers((previous) => [...previous, organizer]);
          setDirty(true);
          setSelectedOrganizerIds((previous) => Array.from(new Set([...previous, organizer.id])));
          setFormData((previous) => ({
            ...previous,
            instagram_url: previous.instagram_url || organizer.instagram_url || "",
            facebook_url: previous.facebook_url || organizer.facebook_url || "",
          }));
        }}
      />
      <QuickArtistDialog
        open={quickCreate?.kind === "artist"}
        onOpenChange={(next) => (next ? undefined : setQuickCreate(null))}
        defaultName={quickCreate?.kind === "artist" ? quickCreate.name : ""}
        onCreated={(artist) => {
          setCreatedArtists((previous) => [...previous, artist]);
          setDirty(true);
          setSelectedArtistIds((previous) => Array.from(new Set([...previous, artist.id])));
        }}
      />

      <AlertDialogComponent />
    </>
  );
}
