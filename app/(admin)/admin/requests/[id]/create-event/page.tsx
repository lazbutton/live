"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "@/app/(admin)/admin/components/admin-layout";
import { buildEventFormPrefillFromImport } from "@/app/(admin)/admin/components/events/event-import-utils";
import type {
  EventFormData,
  EventFormPrefill,
} from "@/app/(admin)/admin/components/events/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AddressInput } from "@/components/ui/address-input";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  CircleAlert,
  Clock,
  Download,
  Euro,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Music,
  RotateCw,
  Save,
  ScanText,
  Sparkles,
  Tag,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { compressImage } from "@/lib/image-compression";
import {
  formatDateWithoutTimezone,
  toDatetimeLocal,
  fromDatetimeLocal,
} from "@/lib/date-utils";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { checkIsAdmin } from "@/lib/auth";
import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import {
  IMPORTED_EVENT_FIELD_LABELS,
  type ImportedEventAnalysisResult,
  type ImportedEventPayload,
  type ImportedEventWarning,
} from "@/lib/events/imported-event-payload";

function addHoursToDatetimeLocal(value: string, hoursToAdd: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return value;
  d.setHours(d.getHours() + hoursToAdd);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const ho = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}T${ho}:${mi}`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
// Import toast from sonner - using alert for now

type RequestEventFormData = Pick<
  EventFormData,
  | "title"
  | "description"
  | "date"
  | "end_date"
  | "category"
  | "price"
  | "presale_price"
  | "subscriber_price"
  | "capacity"
  | "location_id"
  | "room_id"
  | "door_opening_time"
  | "external_url"
  | "external_url_label"
  | "scraping_url"
  | "instagram_url"
  | "facebook_url"
  | "image_url"
  | "is_full"
>;

type RequestFieldPreview = {
  key: string;
  label: string;
  extractedValue: string;
  currentValue: string;
  willOverwrite: boolean;
};

function getComparableStringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "Oui" : "Non";
  }

  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function getPreviewLabel(key: string) {
  if (key === "organizerIds") return "Organisateurs";
  if (key === "tagIds") return "Tags";

  return (
    IMPORTED_EVENT_FIELD_LABELS[
      key as keyof typeof IMPORTED_EVENT_FIELD_LABELS
    ] || key
  );
}

function describeRequestFieldValue(
  key: string,
  value: unknown,
  options: {
    locations: Array<{ id: string; name: string }>;
    organizers: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string }>;
  },
) {
  if (key === "location_id") {
    return (
      options.locations.find((location) => location.id === value)?.name || ""
    );
  }

  if (key === "category") {
    return (
      options.categories.find((category) => category.id === value)?.name || ""
    );
  }

  if (key === "organizerIds") {
    if (!Array.isArray(value)) return "";
    return value
      .map(
        (id) =>
          options.organizers.find((organizer) => organizer.id === id)?.name ||
          "",
      )
      .filter(Boolean)
      .join(", ");
  }

  if (key === "tagIds") {
    if (!Array.isArray(value)) return "";
    return value
      .map((id) => options.tags.find((tag) => tag.id === id)?.name || "")
      .filter(Boolean)
      .join(", ");
  }

  return getComparableStringValue(value);
}

function buildRequestFieldPreview(args: {
  extractedData: ImportedEventPayload;
  prefill: EventFormPrefill;
  formData: RequestEventFormData;
  selectedOrganizerIds: string[];
  selectedTagIds: string[];
  locations: Array<{ id: string; name: string }>;
  organizers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}) {
  const {
    extractedData,
    prefill,
    formData,
    selectedOrganizerIds,
    selectedTagIds,
    locations,
    organizers,
    categories,
    tags,
  } = args;

  const result: RequestFieldPreview[] = [];

  const pushField = (params: {
    key: string;
    extractedValue: string;
    currentValue: string;
  }) => {
    if (!params.extractedValue) return;

    result.push({
      key: params.key,
      label: getPreviewLabel(params.key),
      extractedValue: params.extractedValue,
      currentValue: params.currentValue,
      willOverwrite:
        Boolean(params.currentValue) &&
        params.currentValue !== params.extractedValue,
    });
  };

  Object.entries(prefill.form || {}).forEach(([key, value]) => {
    if (value == null || getComparableStringValue(value) === "") return;

    let extractedValue = describeRequestFieldValue(key, value, {
      locations,
      organizers,
      categories,
      tags,
    });

    if (key === "category" && typeof extractedData.category === "string") {
      extractedValue = extractedData.category.trim() || extractedValue;
    } else if (key === "location_id") {
      extractedValue =
        (typeof extractedData.location === "string" &&
          extractedData.location.trim()) ||
        (typeof extractedData.address === "string" &&
          extractedData.address.trim()) ||
        extractedValue;
    } else if (
      key in extractedData &&
      getComparableStringValue(extractedData[key as keyof ImportedEventPayload])
    ) {
      extractedValue = getComparableStringValue(
        extractedData[key as keyof ImportedEventPayload],
      );
    }

    pushField({
      key,
      extractedValue,
      currentValue: describeRequestFieldValue(
        key,
        formData[key as keyof RequestEventFormData],
        {
          locations,
          organizers,
          categories,
          tags,
        },
      ),
    });
  });

  if ((prefill.organizerIds || []).length > 0) {
    pushField({
      key: "organizerIds",
      extractedValue:
        (typeof extractedData.organizer === "string" &&
          extractedData.organizer.trim()) ||
        describeRequestFieldValue("organizerIds", prefill.organizerIds, {
          locations,
          organizers,
          categories,
          tags,
        }),
      currentValue: describeRequestFieldValue(
        "organizerIds",
        selectedOrganizerIds,
        {
          locations,
          organizers,
          categories,
          tags,
        },
      ),
    });
  }

  if ((prefill.tagIds || []).length > 0) {
    pushField({
      key: "tagIds",
      extractedValue: Array.isArray(extractedData.tags)
        ? extractedData.tags
            .map((tag) => String(tag).trim())
            .filter(Boolean)
            .join(", ")
        : describeRequestFieldValue("tagIds", prefill.tagIds, {
            locations,
            organizers,
            categories,
            tags,
          }),
      currentValue: describeRequestFieldValue("tagIds", selectedTagIds, {
        locations,
        organizers,
        categories,
        tags,
      }),
    });
  }

  return result;
}

function mergeRequestFormWithPrefill(
  current: RequestEventFormData,
  incoming: Partial<EventFormData>,
): RequestEventFormData {
  const next: RequestEventFormData = { ...current };

  for (const [key, rawValue] of Object.entries(incoming)) {
    if (!(key in next)) continue;

    const normalizedIncoming =
      typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (normalizedIncoming === "" || normalizedIncoming == null) continue;

    const currentValue = next[key as keyof RequestEventFormData];
    const normalizedCurrent =
      typeof currentValue === "string" ? currentValue.trim() : currentValue;
    const isCurrentEmpty =
      normalizedCurrent === "" || normalizedCurrent == null;

    if (typeof normalizedIncoming === "boolean") {
      if (
        isCurrentEmpty ||
        normalizedCurrent === false ||
        normalizedCurrent !== normalizedIncoming
      ) {
        (next as Record<string, unknown>)[key] = normalizedIncoming;
      }
      continue;
    }

    if (isCurrentEmpty || normalizedCurrent !== normalizedIncoming) {
      (next as Record<string, unknown>)[key] = rawValue;
    }
  }

  return next;
}

interface UserRequest {
  id: string;
  email?: string | null;
  name?: string | null;
  requested_at: string;
  status: "pending" | "approved" | "rejected" | "converted";
  request_type?: "event_creation" | "event_from_url";
  location_id?: string | null;
  location_name?: string | null;
  source_url?: string | null;
  event_data?: {
    title?: string;
    description?: string;
    date?: string;
    end_date?: string;
    category?: string;
    location_id?: string;
    location_name?: string;
    organizer_names?: string[];
    price?: number;
    address?: string;
    capacity?: number;
    image_url?: string;
    door_opening_time?: string;
    external_url?: string;
    instagram_url?: string;
    facebook_url?: string;
    room_id?: string;
  };
  requested_by?: string | null;
  contributor_display_name?: string | null;
  community_attribution_opt_in?: boolean | null;
  internal_notes?: string | null;
  moderation_reason?: string | null;
  contributor_message?: string | null;
  allow_user_resubmission?: boolean | null;
}

type QuickLocationFormState = {
  name: string;
  address: string;
  capacity: string;
  latitude: string;
  longitude: string;
  is_organizer: boolean;
};

type QuickOrganizerFormState = {
  name: string;
  instagram_url: string;
  facebook_url: string;
  website_url: string;
};

type QuickArtistFormState = {
  name: string;
  artist_type_label: string;
  origin_city: string;
  short_description: string;
  instagram_url: string;
  website_url: string;
};

function CreateEventContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const requestId = params?.id as string;
  const prefillMode = searchParams.get("prefill");

  const [request, setRequest] = useState<UserRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isImportingFromUrl, setIsImportingFromUrl] = useState(false);
  const [isImportingFromFacebook, setIsImportingFromFacebook] = useState(false);
  const [locations, setLocations] = useState<
    {
      id: string;
      name: string;
      address: string | null;
      capacity: number | null;
      latitude: number | null;
      longitude: number | null;
    }[]
  >([]);
  const [rooms, setRooms] = useState<
    Array<{ id: string; name: string; location_id: string }>
  >([]);
  const [organizers, setOrganizers] = useState<
    Array<{
      id: string;
      name: string;
      instagram_url: string | null;
      facebook_url: string | null;
      type: "organizer" | "location";
    }>
  >([]);
  const [artists, setArtists] = useState<
    Array<{
      id: string;
      name: string;
      artist_type_label: string | null;
      origin_city: string | null;
    }>
  >([]);
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>(
    [],
  );
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
  const [isCreateLocationDialogOpen, setIsCreateLocationDialogOpen] =
    useState(false);
  const [isCreateOrganizerDialogOpen, setIsCreateOrganizerDialogOpen] =
    useState(false);
  const [isCreateArtistDialogOpen, setIsCreateArtistDialogOpen] =
    useState(false);
  const [quickLocationForm, setQuickLocationForm] =
    useState<QuickLocationFormState>({
      name: "",
      address: "",
      capacity: "",
      latitude: "",
      longitude: "",
      is_organizer: false,
    });
  const [quickOrganizerForm, setQuickOrganizerForm] =
    useState<QuickOrganizerFormState>({
      name: "",
      instagram_url: "",
      facebook_url: "",
      website_url: "",
    });
  const [quickArtistForm, setQuickArtistForm] = useState<QuickArtistFormState>({
    name: "",
    artist_type_label: "",
    origin_city: "",
    short_description: "",
    instagram_url: "",
    website_url: "",
  });
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [isCreatingOrganizer, setIsCreatingOrganizer] = useState(false);
  const [isCreatingArtist, setIsCreatingArtist] = useState(false);

  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Image states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null); // URL ou data URL de l'image originale
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(3 / 2);
  const [imageAnalysis, setImageAnalysis] =
    useState<ImportedEventAnalysisResult | null>(null);
  const [analysisPrefill, setAnalysisPrefill] =
    useState<EventFormPrefill | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<
    ImportedEventWarning[]
  >([]);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const autoPrefillTriggeredRef = useRef<string | null>(null);
  const previousImageSignatureRef = useRef<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price: "",
    presale_price: "",
    subscriber_price: "",
    capacity: "",
    location_id: "",
    room_id: "",
    door_opening_time: "",
    external_url: "",
    external_url_label: "",
    scraping_url: "",
    instagram_url: "",
    facebook_url: "",
    image_url: "",
    is_full: false,
  });

  // Fonction pour charger les salles d'un lieu
  async function loadRoomsForLocation(locationId: string) {
    if (!locationId) {
      setRooms([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, location_id")
        .eq("location_id", locationId)
        .order("name", { ascending: true });

      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des salles:", error);
      setRooms([]);
    }
  }

  async function reloadLocationsList() {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, address, capacity, latitude, longitude")
      .order("name");

    if (error) {
      throw error;
    }

    const nextLocations = data || [];
    setLocations(nextLocations);
    return nextLocations;
  }

  async function reloadOrganizersList() {
    const [organizersResult, locationsOrganizersResult] = await Promise.all([
      supabase
        .from("organizers")
        .select("id, name, instagram_url, facebook_url")
        .order("name"),
      supabase
        .from("locations")
        .select("id, name, instagram_url, facebook_url")
        .eq("is_organizer", true)
        .order("name"),
    ]);

    if (organizersResult.error) {
      throw organizersResult.error;
    }

    if (locationsOrganizersResult.error) {
      throw locationsOrganizersResult.error;
    }

    const nextOrganizers = [
      ...(organizersResult.data || []).map((org) => ({
        ...org,
        type: "organizer" as const,
      })),
      ...(locationsOrganizersResult.data || []).map((loc) => ({
        ...loc,
        type: "location" as const,
      })),
    ];

    setOrganizers(nextOrganizers);
    return nextOrganizers;
  }

  async function reloadArtistsList() {
    const { data, error } = await supabase
      .from("artists")
      .select("id, name, artist_type_label, origin_city")
      .order("name");

    if (error) {
      throw error;
    }

    const nextArtists = data || [];
    setArtists(nextArtists);
    return nextArtists;
  }

  function openCreateLocationDialog(prefillName = "") {
    setQuickLocationForm({
      name: prefillName,
      address: "",
      capacity: "",
      latitude: "",
      longitude: "",
      is_organizer: false,
    });
    setIsCreateLocationDialogOpen(true);
  }

  function openCreateOrganizerDialog(prefillName = "") {
    setQuickOrganizerForm({
      name: prefillName,
      instagram_url: "",
      facebook_url: "",
      website_url: "",
    });
    setIsCreateOrganizerDialogOpen(true);
  }

  function openCreateArtistDialog(prefillName = "") {
    setQuickArtistForm({
      name: prefillName,
      artist_type_label: "",
      origin_city: "",
      short_description: "",
      instagram_url: "",
      website_url: "",
    });
    setIsCreateArtistDialogOpen(true);
  }

  function handleLocationSelection(
    locationId: string,
    availableLocations = locations,
  ) {
    if (locationId) {
      const selectedLocation = availableLocations.find(
        (loc) => loc.id === locationId,
      );
      if (selectedLocation) {
        setFormData((prev) => ({
          ...prev,
          location_id: locationId,
          room_id: "",
          capacity:
            selectedLocation.capacity != null
              ? selectedLocation.capacity.toString()
              : prev.capacity || "",
        }));
        void loadRoomsForLocation(locationId);
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      location_id: locationId,
      room_id: "",
    }));
    setRooms([]);
  }

  function handleOrganizerChange(
    newOrganizerIds: string[],
    availableOrganizers = organizers,
  ) {
    setSelectedOrganizerIds(newOrganizerIds);

    if (newOrganizerIds.length === 0) {
      return;
    }

    const firstOrganizerId = newOrganizerIds[0];
    const selectedOrganizer = availableOrganizers.find(
      (organizer) => organizer.id === firstOrganizerId,
    );

    if (!selectedOrganizer) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      instagram_url: selectedOrganizer.instagram_url || prev.instagram_url,
      facebook_url: selectedOrganizer.facebook_url || prev.facebook_url,
    }));

    if (selectedOrganizer.type === "location") {
      handleLocationSelection(firstOrganizerId);
    }
  }

  // Fonction pour trouver une catégorie (ne crée pas de catégorie)
  async function findCategory(categoryName: string): Promise<string | null> {
    if (!categoryName || !categoryName.trim()) return null;

    const trimmedName = categoryName.trim();
    const normalizedName = trimmedName.toLowerCase();

    // Chercher une catégorie existante (active ou inactive) - recherche insensible à la casse
    const { data: allCategories, error: fetchError } = await supabase
      .from("categories")
      .select("id, name");

    if (fetchError) {
      console.error("Erreur lors de la récupération des catégories:", {
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
        code: fetchError.code,
      });
      return null;
    }

    // Rechercher une correspondance insensible à la casse
    const existing = allCategories?.find(
      (cat) => cat.name.toLowerCase() === normalizedName,
    );

    if (existing) {
      return existing.id;
    }

    // Ne pas créer de catégorie, retourner null si elle n'existe pas
    return null;
  }

  // Fonction pour trouver ou créer des tags
  async function findOrCreateTags(tagNames: string[]): Promise<string[]> {
    if (!tagNames || tagNames.length === 0) return [];

    const tagIds: string[] = [];

    for (const tagName of tagNames) {
      if (!tagName || !tagName.trim()) continue;

      const normalizedName = tagName.trim().toLowerCase();

      // Chercher un tag existant
      const { data: existing } = await supabase
        .from("tags")
        .select("id")
        .ilike("name", normalizedName)
        .maybeSingle();

      if (existing) {
        tagIds.push(existing.id);
      } else {
        // Créer un nouveau tag
        const { data: created, error } = await supabase
          .from("tags")
          .insert([{ name: tagName.trim() }])
          .select("id")
          .single();

        if (!error && created) {
          tagIds.push(created.id);
        }
      }
    }

    // Recharger la liste des tags pour inclure les nouveaux
    const { data: updatedTags } = await supabase
      .from("tags")
      .select("id, name")
      .order("name");

    if (updatedTags) {
      setTags(updatedTags);
    }

    return tagIds;
  }

  async function findOrCreateTagIdsForImport(rawTagNames: string[]) {
    return findOrCreateTags(rawTagNames);
  }

  function resolveLocationFromImportedData(
    locationName?: string | null,
    address?: string | null,
  ) {
    const candidates = [locationName, address]
      .flatMap((value) => {
        const raw = (value || "").trim();
        if (!raw) return [];
        return [
          raw,
          raw.split(",")[0],
          raw.split(" - ")[0],
          raw.split(" • ")[0],
        ].map((entry) => entry.trim());
      })
      .filter(
        (value, index, array) =>
          Boolean(value) && array.indexOf(value) === index,
      );

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeSearchValue(candidate);
      const byName = locations.find(
        (location) =>
          normalizeSearchValue(location.name) === normalizedCandidate,
      );
      if (byName) return byName;
    }

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeSearchValue(candidate);
      const byPartialName = locations.find((location) => {
        const normalizedName = normalizeSearchValue(location.name);
        return (
          normalizedName.includes(normalizedCandidate) ||
          normalizedCandidate.includes(normalizedName)
        );
      });
      if (byPartialName) return byPartialName;
    }

    if (address) {
      const normalizedAddress = normalizeSearchValue(address);
      const byAddress = locations.find((location) => {
        const locationAddress = normalizeSearchValue(location.address || "");
        return (
          locationAddress.length > 0 &&
          (locationAddress.includes(normalizedAddress) ||
            normalizedAddress.includes(locationAddress))
        );
      });
      if (byAddress) return byAddress;
    }

    return null;
  }

  function resolveOrganizerFromImportedData(organizerName?: string | null) {
    const raw = (organizerName || "").trim();
    if (!raw) return null;

    const candidates = [
      raw,
      raw.split(",")[0],
      raw.split(" / ")[0],
      raw.split(" - ")[0],
    ]
      .map((value) => value.trim())
      .filter(
        (value, index, array) =>
          Boolean(value) && array.indexOf(value) === index,
      );

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeSearchValue(candidate);
      const exact = organizers.find(
        (organizer) =>
          normalizeSearchValue(organizer.name) === normalizedCandidate,
      );
      if (exact) return exact;
    }

    for (const candidate of candidates) {
      const normalizedCandidate = normalizeSearchValue(candidate);
      const partial = organizers.find((organizer) => {
        const normalizedName = normalizeSearchValue(organizer.name);
        return (
          normalizedName.includes(normalizedCandidate) ||
          normalizedCandidate.includes(normalizedName)
        );
      });
      if (partial) return partial;
    }

    return null;
  }

  async function applyImportedEventData(
    importedData: Record<string, any>,
    sourceUrl: string,
    options?: {
      fallbackCategoryId?: string;
      fallbackLocationId?: string;
    },
  ) {
    const fallbackCategoryId =
      options?.fallbackCategoryId || categories[0]?.id || "";
    const fallbackLocationId =
      options?.fallbackLocationId || request?.location_id || "";

    const importedCategory =
      typeof importedData.category === "string"
        ? importedData.category.trim()
        : "";
    const resolvedCategoryId = importedCategory
      ? (await findCategory(importedCategory)) || fallbackCategoryId
      : fallbackCategoryId;

    const importedTags = Array.isArray(importedData.tags)
      ? importedData.tags
          .map((tag: unknown) => String(tag).trim())
          .filter(Boolean)
      : [];
    if (importedTags.length > 0) {
      const tagIds = await findOrCreateTags(importedTags);
      setSelectedTagIds(tagIds);
    }

    const matchedLocation = resolveLocationFromImportedData(
      typeof importedData.location === "string"
        ? importedData.location
        : undefined,
      typeof importedData.address === "string"
        ? importedData.address
        : undefined,
    );
    const resolvedLocationId =
      (typeof importedData.location_id === "string" &&
        importedData.location_id) ||
      matchedLocation?.id ||
      fallbackLocationId ||
      "";
    const matchedOrganizer = resolveOrganizerFromImportedData(
      typeof importedData.organizer === "string"
        ? importedData.organizer
        : undefined,
    );
    const importedOrganizerIds = [
      typeof importedData.organizer_id === "string"
        ? importedData.organizer_id
        : "",
      typeof importedData.location_organizer_id === "string"
        ? importedData.location_organizer_id
        : "",
      matchedOrganizer?.id || "",
    ].filter(
      (value, index, array) => Boolean(value) && array.indexOf(value) === index,
    );

    if (importedOrganizerIds.length > 0) {
      setSelectedOrganizerIds(importedOrganizerIds);
    } else if (
      resolvedLocationId &&
      organizers.some(
        (organizer) =>
          organizer.id === resolvedLocationId && organizer.type === "location",
      )
    ) {
      setSelectedOrganizerIds((prev) =>
        prev.length > 0 ? prev : [resolvedLocationId],
      );
    }

    if (resolvedLocationId) {
      void loadRoomsForLocation(resolvedLocationId);
    }

    const importedImageUrl =
      typeof importedData.image_url === "string"
        ? importedData.image_url.trim()
        : "";
    if (importedImageUrl) {
      setImagePreview(importedImageUrl);
      setOriginalImageSrc(importedImageUrl);
      setImageFile(null);
    }

    const importedDate =
      typeof importedData.date === "string" && importedData.date.trim()
        ? toDatetimeLocal(importedData.date)
        : "";
    const importedEndDate =
      typeof importedData.end_date === "string" && importedData.end_date.trim()
        ? toDatetimeLocal(importedData.end_date)
        : "";
    const importedCapacity =
      importedData.capacity != null && String(importedData.capacity).trim()
        ? String(importedData.capacity).trim()
        : "";
    const fallbackCapacity =
      matchedLocation?.capacity != null ? String(matchedLocation.capacity) : "";

    setFormData((prev) => ({
      ...prev,
      title:
        typeof importedData.title === "string" && importedData.title.trim()
          ? importedData.title
          : prev.title,
      description:
        typeof importedData.description === "string" &&
        importedData.description.trim()
          ? importedData.description
          : prev.description,
      date: importedDate || prev.date,
      end_date: importedEndDate || prev.end_date,
      category: resolvedCategoryId || prev.category || fallbackCategoryId,
      price:
        importedData.price != null && String(importedData.price).trim()
          ? String(importedData.price).trim()
          : prev.price,
      presale_price:
        importedData.presale_price != null &&
        String(importedData.presale_price).trim()
          ? String(importedData.presale_price).trim()
          : prev.presale_price,
      subscriber_price:
        importedData.subscriber_price != null &&
        String(importedData.subscriber_price).trim()
          ? String(importedData.subscriber_price).trim()
          : prev.subscriber_price,
      capacity: importedCapacity || prev.capacity || fallbackCapacity,
      location_id: resolvedLocationId || prev.location_id,
      room_id:
        typeof importedData.room_id === "string" && importedData.room_id.trim()
          ? importedData.room_id
          : resolvedLocationId && resolvedLocationId !== prev.location_id
            ? ""
            : prev.room_id,
      door_opening_time:
        typeof importedData.door_opening_time === "string" &&
        importedData.door_opening_time.trim()
          ? importedData.door_opening_time
          : prev.door_opening_time,
      external_url:
        typeof importedData.external_url === "string" &&
        importedData.external_url.trim()
          ? importedData.external_url
          : sourceUrl || prev.external_url,
      external_url_label:
        typeof importedData.external_url_label === "string" &&
        importedData.external_url_label.trim()
          ? importedData.external_url_label
          : prev.external_url_label,
      scraping_url:
        typeof importedData.scraping_url === "string" &&
        importedData.scraping_url.trim()
          ? importedData.scraping_url
          : sourceUrl || prev.scraping_url,
      instagram_url:
        typeof importedData.instagram_url === "string" &&
        importedData.instagram_url.trim()
          ? importedData.instagram_url
          : prev.instagram_url,
      facebook_url:
        typeof importedData.facebook_url === "string" &&
        importedData.facebook_url.trim()
          ? importedData.facebook_url
          : prev.facebook_url,
      image_url: importedImageUrl || prev.image_url,
      is_full:
        typeof importedData.is_full === "boolean"
          ? importedData.is_full
          : prev.is_full,
    }));
  }

  async function importRequestSourceWithUrlScraper() {
    const sourceUrl =
      formData.scraping_url.trim() || request?.source_url?.trim() || "";
    if (!sourceUrl) {
      alert("Aucun lien source disponible pour cette demande.");
      return;
    }

    try {
      setIsImportingFromUrl(true);
      const response = await fetch("/api/events/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: sourceUrl,
          location_id: request?.location_id || formData.location_id || null,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors du scraping");
      }

      const result = await response.json();
      await applyImportedEventData(result.data || {}, sourceUrl);
    } catch (error) {
      console.error("Erreur import URL:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de l'import depuis l'URL",
      );
    } finally {
      setIsImportingFromUrl(false);
    }
  }

  async function importRequestSourceWithFacebookScraper() {
    const sourceUrl =
      formData.scraping_url.trim() || request?.source_url?.trim() || "";
    if (!sourceUrl) {
      alert("Aucun lien source disponible pour cette demande.");
      return;
    }

    if (!isFacebookEventUrl(sourceUrl)) {
      alert("Le lien source doit être un événement Facebook public.");
      return;
    }

    try {
      setIsImportingFromFacebook(true);
      const response = await fetch("/api/facebook/events/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || "Erreur lors de l'import Facebook");
      }

      const result = await response.json();
      await applyImportedEventData(result.data || {}, sourceUrl);
    } catch (error) {
      console.error("Erreur import Facebook:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de l'import depuis Facebook",
      );
    } finally {
      setIsImportingFromFacebook(false);
    }
  }

  // Charger les salles quand le lieu change
  useEffect(() => {
    if (formData.location_id) {
      loadRoomsForLocation(formData.location_id);
    } else {
      setRooms([]);
      setFormData((prev) => ({ ...prev, room_id: "" }));
    }
  }, [formData.location_id]);

  useEffect(() => {
    loadData();
  }, [requestId]);

  async function loadData() {
    try {
      // Load request
      const { data: requestData, error: requestError } = await supabase
        .from("user_requests")
        .select("*")
        .eq("id", requestId)
        .single();

      if (requestError) throw requestError;
      if (
        !requestData ||
        (requestData.request_type !== "event_creation" &&
          requestData.request_type !== "event_from_url")
      ) {
        alert("Demande invalide ou non trouvée");
        router.push("/admin/requests");
        return;
      }

      setRequest(requestData);

      // Load locations, organizers, categories, tags
      const [
        locationsResult,
        organizersResult,
        locationsOrganizersResult,
        artistsResult,
        categoriesResult,
        tagsResult,
      ] = await Promise.all([
        supabase
          .from("locations")
          .select("id, name, address, capacity, latitude, longitude")
          .order("name"),
        supabase
          .from("organizers")
          .select("id, name, instagram_url, facebook_url")
          .order("name"),
        supabase
          .from("locations")
          .select("id, name, instagram_url, facebook_url")
          .eq("is_organizer", true)
          .order("name"),
        supabase
          .from("artists")
          .select("id, name, artist_type_label, origin_city")
          .order("name"),
        supabase
          .from("categories")
          .select("id, name")
          .eq("is_active", true)
          .order("display_order"),
        supabase.from("tags").select("id, name").order("name"),
      ]);

      if (locationsResult.data) setLocations(locationsResult.data);

      // Combiner les organisateurs classiques et les lieux-organisateurs
      const allOrganizers = [
        ...(organizersResult.data || []).map((org) => ({
          ...org,
          type: "organizer" as const,
        })),
        ...(locationsOrganizersResult.data || []).map((loc) => ({
          ...loc,
          type: "location" as const,
        })),
      ];
      setOrganizers(allOrganizers);
      if (artistsResult.data) setArtists(artistsResult.data);
      if (categoriesResult.data) setCategories(categoriesResult.data);
      if (tagsResult.data) setTags(tagsResult.data);

      // Populate form from request data
      if (requestData.event_data) {
        const ed = requestData.event_data;
        const formattedDate = ed.date ? toDatetimeLocal(ed.date) : "";
        const formattedEndDate = ed.end_date
          ? toDatetimeLocal(ed.end_date)
          : "";

        // Gérer la catégorie (peut être un nom de catégorie scrapé)
        let categoryId = "";
        if (ed.category) {
          // Si c'est déjà un ID (UUID), l'utiliser directement
          if (
            ed.category.match(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            )
          ) {
            categoryId = ed.category;
          } else {
            // Sinon, c'est un nom de catégorie, seulement trouver (ne pas créer)
            const foundCategoryId = await findCategory(ed.category);
            categoryId = foundCategoryId || "";
          }
        }

        // Gérer les tags (peut être un tableau de noms de tags scrapés)
        if (ed.tags && Array.isArray(ed.tags) && ed.tags.length > 0) {
          const tagIds = await findOrCreateTags(ed.tags);
          setSelectedTagIds(tagIds);
        }

        setFormData({
          title: ed.title || "",
          description: ed.description || "",
          date: formattedDate,
          end_date: formattedEndDate,
          category: categoryId,
          price: ed.price != null ? ed.price.toString() : "",
          presale_price:
            ed.presale_price != null ? ed.presale_price.toString() : "",
          subscriber_price:
            ed.subscriber_price != null ? ed.subscriber_price.toString() : "",
          capacity: ed.capacity != null ? ed.capacity.toString() : "",
          location_id: ed.location_id || "",
          room_id: ed.room_id || "",
          door_opening_time: ed.door_opening_time || "",
          external_url: ed.external_url || "",
          external_url_label: ed.external_url_label || "",
          scraping_url: requestData.source_url || "",
          instagram_url: ed.instagram_url || "",
          facebook_url: ed.facebook_url || "",
          image_url: ed.image_url || "",
          is_full: ed.is_full ?? false,
        });

        if (ed.image_url) {
          setImagePreview(ed.image_url);
          setOriginalImageSrc(ed.image_url); // Conserver l'URL originale
        }

        // Charger les organisateurs si un organizer_id est présent
        if (ed.organizer_id) {
          setSelectedOrganizerIds([ed.organizer_id]);
        } else if (ed.location_organizer_id) {
          // Si un lieu-organisateur a été détecté automatiquement lors de l'enrichissement
          setSelectedOrganizerIds([ed.location_organizer_id]);
        } else if (ed.location_id) {
          // Si aucun organisateur n'a été trouvé mais qu'un lieu est présent, vérifier si c'est un lieu-organisateur
          const { data: location } = await supabase
            .from("locations")
            .select("is_organizer")
            .eq("id", ed.location_id)
            .maybeSingle();

          if (location?.is_organizer) {
            // Le lieu est un organisateur, l'ajouter automatiquement
            setSelectedOrganizerIds([ed.location_id]);
          }
        }

        // Charger les salles si un lieu est déjà sélectionné
        if (ed.location_id) {
          loadRoomsForLocation(ed.location_id);
        }
      } else if (
        requestData.request_type === "event_from_url" &&
        requestData.source_url &&
        !prefillMode
      ) {
        // Pré-remplir via scraping (event_from_url)
        try {
          const response = await fetch("/api/events/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: requestData.source_url,
              location_id: requestData.location_id || null,
            }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err?.error || "Erreur lors du scraping");
          }

          const result = await response.json();
          const scrapedData = result.data || {};

          await applyImportedEventData(
            scrapedData,
            requestData.source_url || "",
            {
              fallbackCategoryId: categoriesResult.data?.[0]?.id || "",
              fallbackLocationId: requestData.location_id || "",
            },
          );
        } catch (error) {
          console.error("Erreur scraping (event_from_url):", error);
        }
      }
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      alert("Erreur lors du chargement des données");
      router.push("/admin/requests");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickLocationCreate(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!quickLocationForm.name.trim()) {
      alert("Le nom du lieu est requis.");
      return;
    }

    try {
      setIsCreatingLocation(true);

      const payload = {
        name: quickLocationForm.name.trim(),
        address: quickLocationForm.address.trim() || null,
        capacity: quickLocationForm.capacity.trim()
          ? parseInt(quickLocationForm.capacity, 10)
          : null,
        latitude: quickLocationForm.latitude.trim()
          ? parseFloat(quickLocationForm.latitude)
          : null,
        longitude: quickLocationForm.longitude.trim()
          ? parseFloat(quickLocationForm.longitude)
          : null,
        is_organizer: quickLocationForm.is_organizer,
      };

      const { data: createdLocation, error } = await supabase
        .from("locations")
        .insert([payload])
        .select("id, name, address, capacity, latitude, longitude")
        .single();

      if (error) {
        throw error;
      }

      const nextLocations = await reloadLocationsList();
      if (quickLocationForm.is_organizer) {
        await reloadOrganizersList();
      }

      handleLocationSelection(createdLocation.id, nextLocations);
      setIsCreateLocationDialogOpen(false);
      setQuickLocationForm({
        name: "",
        address: "",
        capacity: "",
        latitude: "",
        longitude: "",
        is_organizer: false,
      });
    } catch (error: any) {
      console.error("Erreur lors de la création rapide du lieu:", error);
      alert(error?.message || "Impossible de créer le lieu.");
    } finally {
      setIsCreatingLocation(false);
    }
  }

  async function handleQuickOrganizerCreate(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!quickOrganizerForm.name.trim()) {
      alert("Le nom de l'organisateur est requis.");
      return;
    }

    try {
      setIsCreatingOrganizer(true);

      const { data: createdOrganizer, error } = await supabase
        .from("organizers")
        .insert([
          {
            name: quickOrganizerForm.name.trim(),
            instagram_url: quickOrganizerForm.instagram_url.trim() || null,
            facebook_url: quickOrganizerForm.facebook_url.trim() || null,
            website_url: quickOrganizerForm.website_url.trim() || null,
          },
        ])
        .select("id, name, instagram_url, facebook_url")
        .single();

      if (error) {
        throw error;
      }

      const nextOrganizers = await reloadOrganizersList();
      const nextSelectedOrganizerIds = Array.from(
        new Set([...selectedOrganizerIds, createdOrganizer.id]),
      );

      handleOrganizerChange(nextSelectedOrganizerIds, nextOrganizers);
      setIsCreateOrganizerDialogOpen(false);
      setQuickOrganizerForm({
        name: "",
        instagram_url: "",
        facebook_url: "",
        website_url: "",
      });
    } catch (error: any) {
      console.error(
        "Erreur lors de la création rapide de l'organisateur:",
        error,
      );
      alert(error?.message || "Impossible de créer l'organisateur.");
    } finally {
      setIsCreatingOrganizer(false);
    }
  }

  async function handleQuickArtistCreate(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!quickArtistForm.name.trim()) {
      alert("Le nom de l'artiste est requis.");
      return;
    }

    try {
      setIsCreatingArtist(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: createdArtist, error } = await supabase
        .from("artists")
        .insert([
          {
            name: quickArtistForm.name.trim(),
            artist_type_label: quickArtistForm.artist_type_label.trim() || null,
            origin_city: quickArtistForm.origin_city.trim() || null,
            short_description: quickArtistForm.short_description.trim() || null,
            instagram_url: quickArtistForm.instagram_url.trim() || null,
            website_url: quickArtistForm.website_url.trim() || null,
            created_by: user?.id || null,
          },
        ])
        .select("id, name, artist_type_label, origin_city")
        .single();

      if (error) {
        throw error;
      }

      await reloadArtistsList();
      setSelectedArtistIds((previous) =>
        Array.from(new Set([...previous, createdArtist.id])),
      );
      setIsCreateArtistDialogOpen(false);
      setQuickArtistForm({
        name: "",
        artist_type_label: "",
        origin_city: "",
        short_description: "",
        instagram_url: "",
        website_url: "",
      });
    } catch (error: any) {
      console.error("Erreur lors de la création rapide de l'artiste:", error);
      alert(error?.message || "Impossible de créer l'artiste.");
    } finally {
      setIsCreatingArtist(false);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("L'image ne doit pas dépasser 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setOriginalImageSrc(dataUrl); // Conserver l'image originale
        setCropImageSrc(dataUrl);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  }

  const onCropComplete = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  async function createCroppedImage(
    imageSrc: string,
    pixelCrop: Area,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageSrc;

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Impossible de créer le contexte canvas"));
          return;
        }

        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          pixelCrop.width,
          pixelCrop.height,
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Erreur lors de la création du blob"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.9,
        );
      };

      image.onerror = () => {
        reject(new Error("Erreur lors du chargement de l'image"));
      };
    });
  }

  async function handleCropComplete() {
    if (!cropImageSrc || !croppedAreaPixels) return;

    try {
      const croppedImageBlob = await createCroppedImage(
        cropImageSrc,
        croppedAreaPixels,
      );
      const croppedImageFile = new File(
        [croppedImageBlob],
        `cropped-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        },
      );

      setImageFile(croppedImageFile);
      setImagePreview(URL.createObjectURL(croppedImageBlob));
      // Ne pas effacer originalImageSrc pour pouvoir rogner à nouveau
      setShowCropper(false);
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setAspectRatio(3 / 2); // Reset to default
      // Image rognée avec succès
    } catch (error) {
      console.error("Erreur lors du cropping:", error);
      alert("Erreur lors du rognage de l'image");
    }
  }

  async function handleImageUpload(): Promise<string | null> {
    if (!imageFile) return null;

    try {
      // Compresser l'image avant l'upload pour qu'elle fasse moins de 10 Mo
      const compressedFile = await compressImage(imageFile, 2);

      const fileExt = compressedFile.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("event-images")
        .upload(fileName, compressedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        if (
          error.message?.includes("Bucket not found") ||
          (error as any).statusCode === 404
        ) {
          alert(
            "Le bucket 'event-images' n'existe pas. Veuillez le créer dans Supabase Storage.",
          );
        } else {
          throw error;
        }
        return null;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(data.path);

      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      if (
        error.message?.includes("Bucket not found") ||
        error.statusCode === 404
      ) {
        alert(
          "Le bucket 'event-images' n'existe pas. Veuillez le créer dans Supabase Storage.",
        );
      } else {
        alert(
          "Erreur lors de l'upload de l'image: " +
            (error.message || "Erreur inconnue"),
        );
      }
      return null;
    }
  }

  function dismissImageAnalysis() {
    setImageAnalysis(null);
    setAnalysisPrefill(null);
    setAnalysisWarnings([]);
  }

  async function analyzeCurrentImage() {
    const currentImageUrl = formData.image_url.trim();

    if (!imageFile && !currentImageUrl) {
      alert(
        "Ajoute une image ou une URL d'image avant de lancer l'extraction.",
      );
      return;
    }

    try {
      setIsAnalyzingImage(true);
      dismissImageAnalysis();

      const payload = new FormData();
      if (imageFile) {
        payload.append("image", imageFile);
      }
      if (currentImageUrl) {
        payload.append("imageUrl", currentImageUrl);
      }

      const response = await fetch("/api/events/extract-from-image", {
        method: "POST",
        body: payload,
      });

      const result = (await response.json().catch(() => ({}))) as {
        data?: ImportedEventPayload;
        metadata?: Record<string, unknown>;
        warnings?: ImportedEventWarning[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result?.error || "Impossible d'analyser l'image de l'evenement.",
        );
      }

      const analysisResult: ImportedEventAnalysisResult = {
        data: result.data || {},
        metadata: result.metadata,
        warnings: result.warnings || [],
      };

      const built = await buildEventFormPrefillFromImport({
        data: analysisResult.data,
        categories,
        locations,
        organizers,
        findOrCreateTagIds: findOrCreateTagIdsForImport,
      });

      setImageAnalysis(analysisResult);
      setAnalysisPrefill(built.prefill);
      setAnalysisWarnings([
        ...(analysisResult.warnings || []),
        ...built.warnings,
      ]);
    } catch (error) {
      console.error("Erreur analyse image evenement:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de l'analyse de l'image",
      );
    } finally {
      setIsAnalyzingImage(false);
    }
  }

  function applyImageAnalysisToRequestForm() {
    if (!analysisPrefill) return;

    setFormData((previous) =>
      mergeRequestFormWithPrefill(previous, analysisPrefill.form || {}),
    );

    if ((analysisPrefill.organizerIds || []).length > 0) {
      const nextOrganizerIds = Array.from(
        new Set([
          ...selectedOrganizerIds,
          ...(analysisPrefill.organizerIds || []),
        ]),
      );
      handleOrganizerChange(nextOrganizerIds);
    }

    if ((analysisPrefill.tagIds || []).length > 0) {
      setSelectedTagIds((previous) =>
        Array.from(new Set([...previous, ...(analysisPrefill.tagIds || [])])),
      );
    }

    if ((analysisPrefill.artistIds || []).length > 0) {
      setSelectedArtistIds((previous) =>
        Array.from(
          new Set([...previous, ...(analysisPrefill.artistIds || [])]),
        ),
      );
    }

    dismissImageAnalysis();
  }

  async function handleSubmit(e: React.FormEvent, isDraft: boolean = false) {
    e.preventDefault();
    setSaving(true);

    try {
      // Validation : la catégorie est obligatoire (sauf pour les brouillons)
      if (!isDraft && (!formData.category || formData.category.trim() === "")) {
        alert("La catégorie est obligatoire");
        setSaving(false);
        return;
      }

      // Validation : la date de fin ne peut pas être antérieure à la date de début
      if (formData.end_date && formData.date) {
        const startDate = new Date(formData.date);
        const endDate = new Date(formData.end_date);
        if (
          !Number.isNaN(startDate.getTime()) &&
          !Number.isNaN(endDate.getTime()) &&
          endDate < startDate
        ) {
          alert(
            "La date et heure de fin ne peut pas être antérieure à la date et heure de début",
          );
          setSaving(false);
          return;
        }
      }

      let finalImageUrl = formData.image_url;

      if (imageFile) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          setSaving(false);
          return;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Récupérer l'adresse et les coordonnées du lieu sélectionné si un lieu est sélectionné
      const selectedLocation =
        formData.location_id && formData.location_id !== "none"
          ? locations.find((loc) => loc.id === formData.location_id)
          : null;

      // Create event
      const eventData: any = {
        title: formData.title,
        description: formData.description || null,
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date
          ? fromDatetimeLocal(formData.end_date)
          : null,
        category: formData.category,
        price: formData.price ? parseFloat(formData.price) : null,
        presale_price: formData.presale_price
          ? parseFloat(formData.presale_price)
          : null,
        subscriber_price: formData.subscriber_price
          ? parseFloat(formData.subscriber_price)
          : null,
        address: selectedLocation?.address || null,
        latitude: selectedLocation?.latitude || null,
        longitude: selectedLocation?.longitude || null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        is_full: formData.is_full || false,
        location_id:
          formData.location_id === "none" ? null : formData.location_id || null,
        room_id:
          formData.room_id === "none" || formData.room_id === ""
            ? null
            : formData.room_id || null,
        door_opening_time: formData.door_opening_time || null,
        external_url: formData.external_url || null,
        external_url_label: formData.external_url_label || null,
        scraping_url: formData.scraping_url || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        image_url: finalImageUrl || null,
        created_by: request?.requested_by || user?.id || null,
        status: isDraft ? "draft" : "pending",
        community_submission: true,
        community_attribution_opt_in:
          request?.community_attribution_opt_in === true,
        community_contributor_label:
          request?.community_attribution_opt_in === true
            ? request?.contributor_display_name || null
            : null,
      };

      // Ajouter les tags si sélectionnés
      if (selectedTagIds.length > 0) {
        eventData.tag_ids = selectedTagIds;
      }

      const { data: newEvent, error: eventError } = await supabase
        .from("events")
        .insert([eventData])
        .select()
        .single();

      if (eventError) {
        console.error("Erreur détaillée lors de la création de l'événement:", {
          message: eventError.message,
          details: eventError.details,
          hint: eventError.hint,
          code: eventError.code,
          eventData,
        });
        throw eventError;
      }

      // Link organizer if present
      // Ajouter les organisateurs sélectionnés (organisateurs classiques et lieux-organisateurs)
      if (selectedOrganizerIds.length > 0) {
        const organizerEntries = selectedOrganizerIds.map((id) => {
          const organizer = organizers.find((o) => o.id === id);
          if (organizer?.type === "location") {
            return {
              event_id: newEvent.id,
              location_id: id,
              organizer_id: null,
            };
          } else {
            return {
              event_id: newEvent.id,
              organizer_id: id,
              location_id: null,
            };
          }
        });

        const { error: orgError } = await supabase
          .from("event_organizers")
          .insert(organizerEntries);

        if (orgError) throw orgError;
      }

      if (selectedArtistIds.length > 0) {
        const artistEntries = selectedArtistIds.map((artistId, index) => ({
          event_id: newEvent.id,
          artist_id: artistId,
          sort_index: index,
          role_label: null,
        }));

        const { error: artistError } = await supabase
          .from("event_artists")
          .insert(artistEntries);

        if (artistError) throw artistError;
      }

      // Update request (seulement si ce n'est pas un brouillon)
      if (!isDraft) {
        // Note: On ne met à jour que les champs nécessaires pour éviter les conflits RLS
        const { error: updateError } = await supabase
          .from("user_requests")
          .update({
            status: "converted" as const,
            converted_event_id: newEvent.id,
            converted_at: new Date().toISOString(),
            reviewed_by: user?.id || null,
            reviewed_at: new Date().toISOString(),
            internal_notes: request?.internal_notes
              ? `${request.internal_notes}\nConverti en événement ID: ${newEvent.id}`
              : `Converti en événement ID: ${newEvent.id}`,
            notes: request?.internal_notes
              ? `${request.internal_notes}\nConverti en événement ID: ${newEvent.id}`
              : `Converti en événement ID: ${newEvent.id}`,
          })
          .eq("id", requestId)
          .select(); // Ajouter select() pour forcer l'exécution et vérifier les permissions

        if (updateError) {
          console.error(
            "Erreur détaillée lors de la mise à jour de la demande:",
            {
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
              code: updateError.code,
              requestId,
              user: user?.id,
            },
          );
          throw updateError;
        }

        alert("Événement créé avec succès !");
        router.push("/admin/requests");
      } else {
        // Pour les brouillons, on met juste à jour les notes avec l'ID de l'événement brouillon
        const { error: updateError } = await supabase
          .from("user_requests")
          .update({
            internal_notes: request?.internal_notes
              ? `${request.internal_notes}\nBrouillon créé - Événement ID: ${newEvent.id}`
              : `Brouillon créé - Événement ID: ${newEvent.id}`,
            notes: request?.internal_notes
              ? `${request.internal_notes}\nBrouillon créé - Événement ID: ${newEvent.id}`
              : `Brouillon créé - Événement ID: ${newEvent.id}`,
          })
          .eq("id", requestId);

        if (updateError) {
          console.error(
            "Erreur lors de la mise à jour de la demande (brouillon):",
            updateError,
          );
          // Ne pas bloquer si la mise à jour de la demande échoue pour un brouillon
        }

        alert("Événement sauvegardé en brouillon !");
        router.push("/admin/events");
      }
    } catch (error: any) {
      console.error("Erreur lors de la création:", {
        error,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        statusCode: error?.statusCode,
        stack: error?.stack,
      });

      // Messages d'erreur plus explicites
      let errorMessage = "Erreur lors de la création de l'événement";

      if (
        error?.message?.includes("Bucket not found") ||
        error?.code === "404"
      ) {
        errorMessage = `Bucket manquant: ${error.message}. Veuillez créer les buckets dans Supabase Storage (event-images, locations-images, organizers-images).`;
      } else if (
        error?.code === "42501" ||
        error?.message?.includes("permission denied") ||
        error?.message?.includes("new row violates")
      ) {
        if (
          error?.message?.includes("storage") ||
          error?.message?.includes("bucket")
        ) {
          errorMessage =
            "Erreur de permission sur le bucket de stockage. Vérifiez que les politiques RLS pour les buckets sont configurées (migration 020).";
        } else if (
          error?.message?.includes("user_requests") ||
          error?.hint?.includes("user_requests")
        ) {
          errorMessage =
            "Vous n'avez pas la permission de mettre à jour cette demande. Vérifiez vos droits d'administration et exécutez la migration 019.";
        } else if (error?.message?.includes("events")) {
          errorMessage =
            "Vous n'avez pas la permission de créer un événement. Vérifiez vos droits d'administration.";
        } else {
          errorMessage =
            "Vous n'avez pas la permission d'effectuer cette action. Vérifiez vos droits d'administration.";
        }
      } else if (error?.message) {
        errorMessage = `Erreur: ${error.message}`;
        if (error?.hint) {
          errorMessage += ` (Indice: ${error.hint})`;
        }
      } else if (error?.details) {
        errorMessage = `Erreur: ${error.details}`;
      }

      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  const requestSourceUrl =
    formData.scraping_url.trim() || request?.source_url?.trim() || "";
  const canImportRequestSourceFromFacebook =
    Boolean(requestSourceUrl) && isFacebookEventUrl(requestSourceUrl);
  const extractedFieldPreview =
    analysisPrefill && imageAnalysis
      ? buildRequestFieldPreview({
          extractedData: imageAnalysis.data,
          prefill: analysisPrefill,
          formData,
          selectedOrganizerIds,
          selectedTagIds,
          locations,
          organizers,
          categories,
          tags,
        })
      : [];

  useEffect(() => {
    const nextSignature = `${imageFile?.name || ""}::${formData.image_url.trim()}::${imagePreview || ""}`;

    if (previousImageSignatureRef.current == null) {
      previousImageSignatureRef.current = nextSignature;
      return;
    }

    if (previousImageSignatureRef.current === nextSignature) {
      return;
    }

    previousImageSignatureRef.current = nextSignature;

    if (imageAnalysis || analysisPrefill || analysisWarnings.length > 0) {
      dismissImageAnalysis();
    }
  }, [
    analysisPrefill,
    analysisWarnings.length,
    formData.image_url,
    imageAnalysis,
    imageFile,
    imagePreview,
  ]);

  useEffect(() => {
    if (
      loading ||
      !request ||
      request.request_type !== "event_from_url" ||
      !requestSourceUrl ||
      (prefillMode !== "url" && prefillMode !== "facebook")
    ) {
      return;
    }

    const triggerKey = `${request.id}:${prefillMode}`;
    if (autoPrefillTriggeredRef.current === triggerKey) {
      return;
    }

    autoPrefillTriggeredRef.current = triggerKey;

    if (prefillMode === "facebook") {
      void importRequestSourceWithFacebookScraper();
      return;
    }

    void importRequestSourceWithUrlScraper();
  }, [
    importRequestSourceWithFacebookScraper,
    importRequestSourceWithUrlScraper,
    loading,
    prefillMode,
    request,
    requestSourceUrl,
  ]);

  if (loading) {
    return (
      <AdminLayout
        title="Créer un événement"
        breadcrumbItems={[
          { label: "Demandes", href: "/admin/requests" },
          { label: "Créer événement" },
        ]}
      >
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!request) {
    return (
      <AdminLayout
        title="Erreur"
        breadcrumbItems={[{ label: "Demandes", href: "/admin/requests" }]}
      >
        <Card>
          <CardHeader>
            <CardTitle>Demande non trouvée</CardTitle>
            <CardDescription>
              La demande sélectionnée n'existe pas ou n'est pas valide.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/admin/requests">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour aux demandes
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Créer un événement"
      breadcrumbItems={[
        { label: "Demandes", href: "/admin/requests" },
        { label: "Créer événement" },
      ]}
    >
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild className="cursor-pointer">
            <Link href="/admin/requests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour aux demandes
            </Link>
          </Button>
        </div>

        {/* Main form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column - Main info */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Informations principales</CardTitle>
                  <CardDescription>Détails de l'événement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titre *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      required
                      placeholder="Nom de l'événement"
                      className="cursor-pointer"
                    />
                  </div>

                  <div
                    className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}
                  >
                    <div className="space-y-2">
                      <Label
                        htmlFor="category"
                        className="flex items-center gap-2"
                      >
                        <Tag className="h-4 w-4" />
                        Catégorie *
                      </Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => {
                          setFormData({ ...formData, category: value });
                          setCategoryError(null);
                        }}
                        required
                      >
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder="Sélectionner une catégorie" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem
                              key={cat.id}
                              value={cat.id}
                              className="cursor-pointer"
                            >
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {categoryError && (
                        <p className="text-sm text-destructive">
                          {categoryError}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Tags
                      </Label>
                      <MultiSelectCreatable
                        options={tags.map((tag) => ({
                          label: tag.name,
                          value: tag.id,
                        }))}
                        selected={selectedTagIds}
                        onChange={setSelectedTagIds}
                        onCreate={async (name: string) => {
                          try {
                            const { data, error } = await supabase
                              .from("tags")
                              .insert([{ name: name.trim() }])
                              .select("id")
                              .single();

                            if (error) {
                              console.error(
                                "Erreur détaillée lors de la création du tag:",
                                {
                                  message: error.message,
                                  details: error.details,
                                  hint: error.hint,
                                  code: error.code,
                                },
                              );

                              // Messages d'erreur plus explicites
                              if (error.code === "23505") {
                                alert(
                                  `Un tag avec le nom "${name}" existe déjà.`,
                                );
                              } else if (
                                error.message?.includes("permission denied") ||
                                error.code === "42501"
                              ) {
                                alert(
                                  "Vous n'avez pas la permission de créer un tag. Vérifiez vos droits d'administration.",
                                );
                              } else if (
                                error.message?.includes("relation") &&
                                error.message?.includes("does not exist")
                              ) {
                                alert(
                                  "La table 'tags' n'existe pas. Veuillez exécuter la migration 014_add_tags_to_events.sql",
                                );
                              } else {
                                alert(
                                  `Erreur lors de la création du tag: ${error.message || "Erreur inconnue"}`,
                                );
                              }
                              throw error;
                            }

                            // Recharger la liste des tags
                            const { data: tagsData } = await supabase
                              .from("tags")
                              .select("id, name")
                              .order("name");
                            if (tagsData) setTags(tagsData);

                            return data?.id || null;
                          } catch (error) {
                            console.error(
                              "Erreur lors de la création du tag:",
                              error,
                            );
                            return null;
                          }
                        }}
                        placeholder="Sélectionner ou créer des tags..."
                        createPlaceholder="Ajouter un nouveau tag..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={6}
                      placeholder="Description détaillée de l'événement"
                      className="cursor-pointer resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Date et heure de début *
                      </Label>
                      <DateTimePicker
                        id="date"
                        value={formData.date}
                        onChange={(newStartDate) => {
                          setFormData((prev) => {
                            const next: typeof prev = {
                              ...prev,
                              date: newStartDate,
                            };

                            // Si la date de fin n'est pas remplie, la définir à début + 1 heure
                            if (!prev.end_date && newStartDate) {
                              next.end_date = addHoursToDatetimeLocal(
                                newStartDate,
                                1,
                              );
                            }

                            // Si la date de fin est antérieure à la nouvelle date de début, la corriger
                            if (next.end_date && newStartDate) {
                              const start = new Date(newStartDate);
                              const end = new Date(next.end_date);
                              if (
                                !Number.isNaN(start.getTime()) &&
                                !Number.isNaN(end.getTime()) &&
                                end < start
                              ) {
                                next.end_date = addHoursToDatetimeLocal(
                                  newStartDate,
                                  1,
                                );
                              }
                            }

                            return next;
                          });
                        }}
                        required
                        placeholder="Choisir une date et une heure"
                        className="space-y-0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="end_date"
                        className="flex items-center gap-2"
                      >
                        <Calendar className="h-4 w-4" />
                        Date et heure de fin
                      </Label>
                      <DateTimePicker
                        id="end_date"
                        value={formData.end_date}
                        onChange={(newEndDate) => {
                          setFormData((prev) => ({
                            ...prev,
                            end_date: newEndDate,
                          }));
                        }}
                        placeholder="Optionnel"
                        allowClear
                        className="space-y-0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="door_opening_time"
                        className="flex items-center gap-2"
                      >
                        <Clock className="h-4 w-4" />
                        Heure d'ouverture des portes
                      </Label>
                      <Input
                        id="door_opening_time"
                        type="time"
                        step={60}
                        value={formData.door_opening_time}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            door_opening_time: e.target.value,
                          })
                        }
                        className="h-11"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lieu, organisateurs et artistes</CardTitle>
                  <CardDescription>
                    Associer un lieu, des organisateurs et des artistes
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Organisateurs
                    </Label>
                    <MultiSelect
                      options={organizers.map((org) => ({
                        label: `${org.name}${org.type === "location" ? " (Lieu)" : ""}`,
                        value: org.id,
                      }))}
                      selected={selectedOrganizerIds}
                      onChange={handleOrganizerChange}
                      placeholder="Sélectionner des organisateurs ou des lieux..."
                      emptyActionLabel="Ajouter un organisateur"
                      onEmptyAction={openCreateOrganizerDialog}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Music className="h-4 w-4" />
                      Artistes / collaborateurs
                    </Label>
                    <MultiSelect
                      options={artists.map((artist) => ({
                        label: [
                          artist.name,
                          artist.artist_type_label
                            ? `(${artist.artist_type_label})`
                            : null,
                          artist.origin_city ? `• ${artist.origin_city}` : null,
                        ]
                          .filter(Boolean)
                          .join(" "),
                        value: artist.id,
                      }))}
                      selected={selectedArtistIds}
                      onChange={setSelectedArtistIds}
                      placeholder="Sélectionner des artistes..."
                      emptyActionLabel="Ajouter un artiste"
                      onEmptyAction={openCreateArtistDialog}
                    />
                    <p className="text-xs text-muted-foreground">
                      Cette liste alimentera la section publique artistes de la
                      fiche événement.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="location_id"
                        className="flex items-center gap-2"
                      >
                        <MapPin className="h-4 w-4" />
                        Lieu
                      </Label>
                      <SelectSearchable
                        options={[
                          { value: "none", label: "Aucun lieu" },
                          ...locations.map((loc) => ({
                            value: loc.id,
                            label: loc.name,
                          })),
                        ]}
                        value={formData.location_id || "none"}
                        onValueChange={(value) => {
                          const locationId = value === "none" ? "" : value;
                          handleLocationSelection(locationId);
                        }}
                        placeholder="Sélectionner un lieu"
                        searchPlaceholder="Rechercher un lieu..."
                        emptyActionLabel="Ajouter un lieu"
                        onEmptyAction={openCreateLocationDialog}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="room_id"
                        className="flex items-center gap-2"
                      >
                        <LayoutGrid className="h-4 w-4" />
                        Salle
                      </Label>
                      <Select
                        value={formData.room_id || "none"}
                        onValueChange={(value) => {
                          const roomId = value === "none" ? "" : value;
                          setFormData({ ...formData, room_id: roomId });
                        }}
                        disabled={!formData.location_id || rooms.length === 0}
                      >
                        <SelectTrigger
                          className={
                            !formData.location_id || rooms.length === 0
                              ? "cursor-not-allowed opacity-50"
                              : "cursor-pointer"
                          }
                        >
                          <SelectValue
                            placeholder={
                              rooms.length === 0
                                ? "Aucune salle disponible"
                                : "Sélectionner une salle (optionnel)"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="cursor-pointer">
                            Aucune salle spécifique
                          </SelectItem>
                          {rooms.map((room) => (
                            <SelectItem
                              key={room.id}
                              value={room.id}
                              className="cursor-pointer"
                            >
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Détails supplémentaires</CardTitle>
                  <CardDescription>
                    Prix, capacité et autres informations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="price"
                        className="flex items-center gap-2"
                      >
                        <Euro className="h-4 w-4" />
                        Prix (€)
                      </Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            price: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="presale_price"
                        className="flex items-center gap-2"
                      >
                        <Euro className="h-4 w-4" />
                        Tarif prévente (€)
                      </Label>
                      <Input
                        id="presale_price"
                        type="number"
                        step="0.01"
                        value={formData.presale_price}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            presale_price: e.target.value,
                          }))
                        }
                        placeholder="Optionnel"
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="subscriber_price"
                        className="flex items-center gap-2"
                      >
                        <Euro className="h-4 w-4" />
                        Tarif abonné (€)
                      </Label>
                      <Input
                        id="subscriber_price"
                        type="number"
                        step="0.01"
                        value={formData.subscriber_price}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            subscriber_price: e.target.value,
                          }))
                        }
                        placeholder="Optionnel"
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="capacity"
                        className="flex items-center gap-2"
                      >
                        <Users className="h-4 w-4" />
                        Capacité
                      </Label>
                      <Input
                        id="capacity"
                        type="number"
                        value={formData.capacity}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            capacity: e.target.value,
                          }))
                        }
                        placeholder="Nombre de places"
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="is_full"
                        className="flex items-center gap-2"
                      >
                        Disponibilité
                      </Label>
                      <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
                        <div className="flex items-center gap-3 flex-1">
                          {formData.is_full ? (
                            <>
                              <span className="font-medium text-destructive">
                                Événement complet
                              </span>
                              <p className="text-sm text-muted-foreground">
                                Plus de places disponibles (sold out)
                              </p>
                            </>
                          ) : (
                            <>
                              <span className="font-medium text-success">
                                Places disponibles
                              </span>
                              <p className="text-sm text-muted-foreground">
                                L'événement accepte encore des réservations
                              </p>
                            </>
                          )}
                        </div>
                        <Switch
                          id="is_full"
                          checked={formData.is_full}
                          onCheckedChange={(checked) =>
                            setFormData((prev) => ({
                              ...prev,
                              is_full: checked,
                            }))
                          }
                          className="shrink-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="external_url"
                        className="flex items-center gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        URL externe
                      </Label>
                      <Input
                        id="external_url"
                        type="url"
                        value={formData.external_url}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            external_url: e.target.value,
                          }))
                        }
                        placeholder="https://..."
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="external_url_label"
                        className="flex items-center gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        Label du lien externe
                      </Label>
                      <Input
                        id="external_url_label"
                        type="text"
                        value={formData.external_url_label}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            external_url_label: e.target.value,
                          }))
                        }
                        placeholder="Réserver des billets"
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="scraping_url"
                      className="flex items-center gap-2"
                    >
                      <LinkIcon className="h-4 w-4" />
                      URL de scraping
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="scraping_url"
                        type="url"
                        value={formData.scraping_url}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            scraping_url: e.target.value,
                          }))
                        }
                        placeholder="https://..."
                        className="cursor-pointer flex-1"
                      />
                      {formData.scraping_url &&
                        formData.scraping_url.trim() && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            asChild
                            className="cursor-pointer"
                            title="Ouvrir l'URL dans un nouvel onglet"
                          >
                            <a
                              href={formData.scraping_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      URL utilisée pour mettre à jour l'événement via scraping
                    </p>
                    {requestSourceUrl && (
                      <div className="space-y-2 pt-2">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2"
                            onClick={() => void analyzeCurrentImage()}
                            disabled={
                              saving ||
                              isImportingFromUrl ||
                              isImportingFromFacebook ||
                              isAnalyzingImage
                            }
                          >
                            {isAnalyzingImage ? (
                              <RotateCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <ScanText className="h-4 w-4" />
                            )}
                            Créer à partir d’une image
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2"
                            onClick={() =>
                              void importRequestSourceWithUrlScraper()
                            }
                            disabled={
                              isImportingFromUrl || isImportingFromFacebook
                            }
                          >
                            {isImportingFromUrl ? (
                              <RotateCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <LinkIcon className="h-4 w-4" />
                            )}
                            Créer à partir de l’URL
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2"
                            onClick={() =>
                              void importRequestSourceWithFacebookScraper()
                            }
                            disabled={
                              !canImportRequestSourceFromFacebook ||
                              isImportingFromUrl ||
                              isImportingFromFacebook
                            }
                          >
                            {isImportingFromFacebook ? (
                              <RotateCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            Importer depuis Facebook
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {canImportRequestSourceFromFacebook
                            ? "Pour un lien Facebook public, l’import dédié récupère mieux les données d’événement."
                            : "Le bouton Facebook s’active uniquement pour un lien d’événement Facebook public."}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="instagram_url"
                        className="flex items-center gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        Instagram
                      </Label>
                      <Input
                        id="instagram_url"
                        type="url"
                        value={formData.instagram_url}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            instagram_url: e.target.value,
                          })
                        }
                        placeholder="https://instagram.com/..."
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="facebook_url"
                        className="flex items-center gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        Facebook
                      </Label>
                      <Input
                        id="facebook_url"
                        type="url"
                        value={formData.facebook_url}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            facebook_url: e.target.value,
                          })
                        }
                        placeholder="https://facebook.com/..."
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column - Sticky sidebar */}
            <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
              {/* Request info card */}
              {request.event_data && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="default">Données de la demande</Badge>
                    </CardTitle>
                    <CardDescription>
                      Informations pré-remplies depuis la demande
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      {request.event_data.title && (
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Titre:
                          </span>
                          <span className="break-words">
                            {request.event_data.title}
                          </span>
                        </div>
                      )}
                      {request.event_data.category && (
                        <div className="flex items-start gap-2">
                          <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Catégorie:
                          </span>
                          <span>{request.event_data.category}</span>
                        </div>
                      )}
                      {request.event_data.date && (
                        <div className="flex items-start gap-2">
                          <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Début:
                          </span>
                          <span className="break-words">
                            {formatDateWithoutTimezone(
                              request.event_data.date,
                              "PPpp",
                            )}
                          </span>
                        </div>
                      )}
                      {request.event_data.end_date && (
                        <div className="flex items-start gap-2">
                          <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Fin:
                          </span>
                          <span className="break-words">
                            {formatDateWithoutTimezone(
                              request.event_data.end_date,
                              "PPpp",
                            )}
                          </span>
                        </div>
                      )}
                      {request.event_data.price != null && (
                        <div className="flex items-start gap-2">
                          <Euro className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Prix:
                          </span>
                          <span>{request.event_data.price}€</span>
                        </div>
                      )}
                      {request.event_data.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Adresse:
                          </span>
                          <span className="break-words">
                            {request.event_data.address}
                          </span>
                        </div>
                      )}
                      {request.event_data.location_name && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Lieu:
                          </span>
                          <span className="break-words">
                            {request.event_data.location_name}
                          </span>
                        </div>
                      )}
                      {request.event_data.organizer_names &&
                        request.event_data.organizer_names.length > 0 && (
                          <div className="flex items-start gap-2">
                            <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-muted-foreground min-w-[80px]">
                              Organisateurs:
                            </span>
                            <span className="break-words">
                              {request.event_data.organizer_names.join(", ")}
                            </span>
                          </div>
                        )}
                      {request.email && (
                        <div className="flex items-start gap-2">
                          <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-muted-foreground min-w-[80px]">
                            Demandeur:
                          </span>
                          <span className="break-words">{request.email}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Image de l'événement
                  </CardTitle>
                  <CardDescription>
                    Ajoutez une image pour l'événement
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {imagePreview && !showCropper && (
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border">
                      <img
                        src={imagePreview}
                        alt="Aperçu"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          // Utiliser l'image originale si disponible, sinon utiliser le preview
                          if (originalImageSrc) {
                            setCropImageSrc(originalImageSrc);
                            setShowCropper(true);
                          } else if (imageFile) {
                            // Fallback: relire le fichier si pas d'originale conservée
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const dataUrl = reader.result as string;
                              setOriginalImageSrc(dataUrl); // Conserver pour la prochaine fois
                              setCropImageSrc(dataUrl);
                              setShowCropper(true);
                            };
                            reader.readAsDataURL(imageFile);
                          } else if (imagePreview) {
                            // Si c'est une URL, on l'utilise directement
                            setOriginalImageSrc(imagePreview); // Conserver l'URL
                            setCropImageSrc(imagePreview);
                            setShowCropper(true);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePreview(null);
                          setImageFile(null);
                          setOriginalImageSrc(null); // Réinitialiser aussi l'originale
                          setFormData({ ...formData, image_url: "" });
                          const fileInput = document.getElementById(
                            "image-upload",
                          ) as HTMLInputElement;
                          if (fileInput) fileInput.value = "";
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="absolute inset-0 flex items-center justify-center admin-overlay opacity-0 hover:opacity-100 transition-opacity cursor-pointer pointer-events-none">
                        <div className="text-sm font-medium flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Cliquer pour rogner
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="cursor-pointer"
                      />
                      <Label
                        htmlFor="image-upload"
                        className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="image_url">
                        Ou entrez une URL d'image
                      </Label>
                      <Input
                        id="image_url"
                        type="url"
                        value={formData.image_url}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            image_url: e.target.value,
                          });
                          if (e.target.value) {
                            setImagePreview(e.target.value);
                            setOriginalImageSrc(e.target.value); // Conserver l'URL originale
                            setImageFile(null);
                          }
                        }}
                        placeholder="https://..."
                        disabled={!!imageFile}
                        className="cursor-pointer"
                      />
                    </div>

                    {imageAnalysis && analysisPrefill ? (
                      <Card className="border-primary/20 bg-primary/5">
                        <CardContent className="space-y-4 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <Sparkles className="h-4 w-4" />
                                Relecture avant fusion
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Les champs detectes depuis l'image ne seront
                                appliques qu'apres validation.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={dismissImageAnalysis}
                                disabled={isAnalyzingImage}
                              >
                                Ignorer
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void analyzeCurrentImage()}
                                disabled={isAnalyzingImage}
                              >
                                Réessayer
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={applyImageAnalysisToRequestForm}
                              >
                                Appliquer
                              </Button>
                            </div>
                          </div>

                          {analysisWarnings.length > 0 ? (
                            <Alert>
                              <CircleAlert className="h-4 w-4" />
                              <AlertTitle>Points à vérifier</AlertTitle>
                              <AlertDescription>
                                <div className="space-y-1">
                                  {analysisWarnings.map((warning, index) => (
                                    <div key={`${warning.field}-${index}`}>
                                      {warning.message}
                                      {warning.value ? ` ${warning.value}` : ""}
                                    </div>
                                  ))}
                                </div>
                              </AlertDescription>
                            </Alert>
                          ) : null}

                          {extractedFieldPreview.length > 0 ? (
                            <div className="grid gap-2">
                              {extractedFieldPreview.map((field) => (
                                <div
                                  key={field.key}
                                  className="rounded-lg border bg-background/80 p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium">
                                      {field.label}
                                    </div>
                                    {field.willOverwrite ? (
                                      <span className="text-[11px] font-medium text-amber-600">
                                        Remplacera la valeur actuelle
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-medium text-emerald-600">
                                        Ajout ou confirmation
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                    <div>
                                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Detecte
                                      </div>
                                      <div className="mt-1 text-sm">
                                        {field.extractedValue}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Actuel
                                      </div>
                                      <div className="mt-1 text-sm">
                                        {field.currentValue || "Vide"}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Alert>
                              <CircleAlert className="h-4 w-4" />
                              <AlertTitle>Extraction limitée</AlertTitle>
                              <AlertDescription>
                                L'image a ete analysee, mais peu de champs
                                exploitables ont ete detectes. Tu peux reessayer
                                avec une image plus lisible.
                              </AlertDescription>
                            </Alert>
                          )}
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 sticky top-4">
                <Button
                  type="submit"
                  size="lg"
                  disabled={saving}
                  className="w-full cursor-pointer"
                >
                  {saving ? (
                    <>Création en cours...</>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Créer l'événement
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={saving}
                  onClick={(e) => handleSubmit(e, true)}
                  className="w-full cursor-pointer"
                >
                  {saving ? (
                    <>Sauvegarde en cours...</>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Sauvegarder en brouillon
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  asChild
                  className="w-full cursor-pointer"
                >
                  <Link href="/admin/requests">Annuler</Link>
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <Dialog
        open={isCreateLocationDialogOpen}
        onOpenChange={(open) => {
          setIsCreateLocationDialogOpen(open);
          if (!open) {
            setQuickLocationForm({
              name: "",
              address: "",
              capacity: "",
              latitude: "",
              longitude: "",
              is_organizer: false,
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un lieu</DialogTitle>
            <DialogDescription>
              Crée rapidement un nouveau lieu sans quitter la création
              d&apos;événement.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleQuickLocationCreate}>
            <div className="space-y-2">
              <Label htmlFor="quick-location-name">Nom du lieu</Label>
              <Input
                id="quick-location-name"
                value={quickLocationForm.name}
                onChange={(event) =>
                  setQuickLocationForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Nom du lieu"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-location-address">Adresse</Label>
              <AddressInput
                id="quick-location-address"
                value={quickLocationForm.address}
                onChange={(address) =>
                  setQuickLocationForm((prev) => ({
                    ...prev,
                    address,
                    latitude: "",
                    longitude: "",
                  }))
                }
                onAddressSelect={(address, coordinates) =>
                  setQuickLocationForm((prev) => ({
                    ...prev,
                    address,
                    latitude: coordinates?.latitude?.toString() || "",
                    longitude: coordinates?.longitude?.toString() || "",
                  }))
                }
                placeholder="Commencez à taper une adresse..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-location-capacity">Capacité</Label>
              <Input
                id="quick-location-capacity"
                type="number"
                min="0"
                value={quickLocationForm.capacity}
                onChange={(event) =>
                  setQuickLocationForm((prev) => ({
                    ...prev,
                    capacity: event.target.value,
                  }))
                }
                placeholder="Optionnel"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  Utilisable aussi comme organisateur
                </p>
                <p className="text-xs text-muted-foreground">
                  Le lieu apparaîtra aussi dans la liste des organisateurs.
                </p>
              </div>
              <Switch
                checked={quickLocationForm.is_organizer}
                onCheckedChange={(checked) =>
                  setQuickLocationForm((prev) => ({
                    ...prev,
                    is_organizer: checked,
                  }))
                }
              />
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:justify-end">
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

      <Dialog
        open={isCreateOrganizerDialogOpen}
        onOpenChange={(open) => {
          setIsCreateOrganizerDialogOpen(open);
          if (!open) {
            setQuickOrganizerForm({
              name: "",
              instagram_url: "",
              facebook_url: "",
              website_url: "",
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un organisateur</DialogTitle>
            <DialogDescription>
              Crée rapidement un organisateur sans quitter la création
              d&apos;événement.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleQuickOrganizerCreate}>
            <div className="space-y-2">
              <Label htmlFor="quick-organizer-name">Nom</Label>
              <Input
                id="quick-organizer-name"
                value={quickOrganizerForm.name}
                onChange={(event) =>
                  setQuickOrganizerForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Nom de l'organisateur"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-organizer-instagram">Instagram</Label>
              <Input
                id="quick-organizer-instagram"
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
              <Label htmlFor="quick-organizer-facebook">Facebook</Label>
              <Input
                id="quick-organizer-facebook"
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

            <div className="space-y-2">
              <Label htmlFor="quick-organizer-website">Site web</Label>
              <Input
                id="quick-organizer-website"
                type="url"
                value={quickOrganizerForm.website_url}
                onChange={(event) =>
                  setQuickOrganizerForm((prev) => ({
                    ...prev,
                    website_url: event.target.value,
                  }))
                }
                placeholder="https://..."
              />
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:justify-end">
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

      <Dialog
        open={isCreateArtistDialogOpen}
        onOpenChange={(open) => {
          setIsCreateArtistDialogOpen(open);
          if (!open) {
            setQuickArtistForm({
              name: "",
              artist_type_label: "",
              origin_city: "",
              short_description: "",
              instagram_url: "",
              website_url: "",
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un artiste</DialogTitle>
            <DialogDescription>
              Crée rapidement un artiste ou collaborateur sans quitter la
              création d&apos;événement.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleQuickArtistCreate}>
            <div className="space-y-2">
              <Label htmlFor="quick-artist-name">Nom</Label>
              <Input
                id="quick-artist-name"
                value={quickArtistForm.name}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Nom de scène / collaborateur"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-artist-type">Type / dénomination</Label>
              <Input
                id="quick-artist-type"
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
              <Label htmlFor="quick-artist-origin-city">
                Ville d&apos;origine
              </Label>
              <Input
                id="quick-artist-origin-city"
                value={quickArtistForm.origin_city}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    origin_city: event.target.value,
                  }))
                }
                placeholder="Paris, Bruxelles, Berlin..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-artist-description">
                Description courte
              </Label>
              <Textarea
                id="quick-artist-description"
                value={quickArtistForm.short_description}
                onChange={(event) =>
                  setQuickArtistForm((prev) => ({
                    ...prev,
                    short_description: event.target.value,
                  }))
                }
                placeholder="Quelques lignes de présentation"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-artist-instagram">Instagram</Label>
              <Input
                id="quick-artist-instagram"
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
              <Label htmlFor="quick-artist-website">Site web</Label>
              <Input
                id="quick-artist-website"
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

            <div className="flex flex-col gap-2 md:flex-row md:justify-end">
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

      {/* Cropper Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="max-w-5xl p-0 gap-0">
          <div className="flex flex-col h-[90vh] max-h-[800px]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/20">
              <DialogHeader className="text-left">
                <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Rogner l'image
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  Ajustez la zone de sélection en la déplaçant, changez le zoom
                  et le format selon vos besoins
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Cropper Area */}
            <div className="flex-1 relative bg-gradient-to-br from-gray-900 via-black to-gray-900 rounded-none overflow-hidden min-h-[400px]">
              {cropImageSrc && (
                <div className="absolute inset-0">
                  <Cropper
                    image={cropImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspectRatio}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                  />
                </div>
              )}
            </div>

            {/* Controls Section */}
            <div className="px-6 py-4 border-t border-border/20 bg-background/50 backdrop-blur-sm">
              <div className="space-y-4">
                {/* Format Selection */}
                <div className="space-y-2">
                  <Label
                    htmlFor="aspect-ratio"
                    className="text-sm font-medium flex items-center gap-2"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Format de sélection
                  </Label>
                  <Select
                    value={
                      aspectRatio === undefined
                        ? "libre"
                        : aspectRatio.toString()
                    }
                    onValueChange={(value) => {
                      if (value === "libre") {
                        setAspectRatio(undefined);
                      } else {
                        const ratio = parseFloat(value);
                        setAspectRatio(ratio);
                      }
                    }}
                  >
                    <SelectTrigger className="cursor-pointer h-10">
                      <SelectValue placeholder="Sélectionner un format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="libre" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Maximize2 className="h-4 w-4" />
                          Libre (pas de contrainte)
                        </div>
                      </SelectItem>
                      <SelectItem
                        value={(1 / 1).toString()}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border border-current rounded" />
                          Carré (1:1)
                        </div>
                      </SelectItem>
                      <SelectItem
                        value={(4 / 3).toString()}
                        className="cursor-pointer"
                      >
                        Paysage 4:3
                      </SelectItem>
                      <SelectItem
                        value={(16 / 9).toString()}
                        className="cursor-pointer"
                      >
                        Paysage 16:9
                      </SelectItem>
                      <SelectItem
                        value={(3 / 2).toString()}
                        className="cursor-pointer"
                      >
                        Paysage 3:2
                      </SelectItem>
                      <SelectItem
                        value={(3 / 4).toString()}
                        className="cursor-pointer"
                      >
                        Portrait 3:4
                      </SelectItem>
                      <SelectItem
                        value={(9 / 16).toString()}
                        className="cursor-pointer"
                      >
                        Portrait 9:16
                      </SelectItem>
                      <SelectItem
                        value={(2 / 3).toString()}
                        className="cursor-pointer"
                      >
                        Portrait 2:3
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Zoom Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="zoom"
                      className="text-sm font-medium flex items-center gap-2"
                    >
                      <Maximize2 className="h-4 w-4" />
                      Zoom
                    </Label>
                    <span className="text-sm text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                      {zoom.toFixed(1)}x
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="zoom"
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>1x</span>
                      <span>2x</span>
                      <span>3x</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex justify-between items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowCropper(false);
                      setCropImageSrc(null);
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setAspectRatio(3 / 2); // Reset to default
                      const fileInput = document.getElementById(
                        "image-upload",
                      ) as HTMLInputElement;
                      if (fileInput) fileInput.value = "";
                    }}
                    className="cursor-pointer"
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCropComplete}
                    className="cursor-pointer min-w-[140px]"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Valider le rognage
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

export default function CreateEventPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Créer un événement">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </AdminLayout>
      }
    >
      <CreateEventContent />
    </Suspense>
  );
}
