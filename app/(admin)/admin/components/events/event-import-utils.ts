import { toDatetimeLocal } from "@/lib/date-utils";
import {
  extractImportedCategoryLabels,
  resolveImportedCategory,
} from "@/lib/events/category-resolution";
import { deriveGenericPriceRange } from "@/lib/events/price-utils";
import {
  type ImportedEventPayload,
  type ImportedEventWarning,
} from "@/lib/events/imported-event-payload";
import { supabase } from "@/lib/supabase/client";

import type {
  CategoryOption,
  EventFormPrefill,
  EventStatus,
  LocationData,
  OrganizerOption,
  TagOption,
} from "./types";

type BuildEventPrefillFromImportArgs = {
  data: ImportedEventPayload;
  sourceUrl?: string;
  owner?: OrganizerOption;
  categories: CategoryOption[];
  locations: LocationData[];
  organizers: OrganizerOption[];
  findOrCreateTagIds?: (rawTagNames: string[]) => Promise<string[]>;
  defaultStatus?: EventStatus;
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resolveLocationFromImportedData(
  locations: LocationData[],
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
      (value, index, array) => Boolean(value) && array.indexOf(value) === index,
    );

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeSearchValue(candidate);
    const byName = locations.find(
      (location) => normalizeSearchValue(location.name) === normalizedCandidate,
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

function resolveOrganizerFromName(
  organizers: OrganizerOption[],
  organizerName?: string | null,
) {
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
      (value, index, array) => Boolean(value) && array.indexOf(value) === index,
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

export async function resolveTagIdsForImport({
  rawTagNames,
  tags,
  onTagsChanged,
}: {
  rawTagNames: string[];
  tags: TagOption[];
  onTagsChanged?: () => Promise<void> | void;
}) {
  if (!Array.isArray(rawTagNames) || rawTagNames.length === 0) return [];

  const normalizedNames = rawTagNames
    .map((tag) => tag.trim())
    .filter(
      (tag, index, array) => Boolean(tag) && array.indexOf(tag) === index,
    );

  const resolvedIds: string[] = [];
  let shouldNotifyTagsChanged = false;

  for (const tagName of normalizedNames) {
    const existingLocal = tags.find(
      (tag) => normalizeSearchValue(tag.name) === normalizeSearchValue(tagName),
    );
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
      shouldNotifyTagsChanged = true;
    }
  }

  if (shouldNotifyTagsChanged) {
    await onTagsChanged?.();
  }

  return [...new Set(resolvedIds)];
}

export async function buildEventFormPrefillFromImport({
  data,
  sourceUrl,
  owner,
  categories,
  locations,
  organizers,
  findOrCreateTagIds,
  defaultStatus,
}: BuildEventPrefillFromImportArgs): Promise<{
  prefill: EventFormPrefill;
  warnings: ImportedEventWarning[];
}> {
  const rawTags = data.tags as unknown;
  const importedTags = Array.isArray(rawTags)
    ? rawTags.map((tag) => tag.toString().trim()).filter(Boolean)
    : [];

  const tagIds = findOrCreateTagIds
    ? await findOrCreateTagIds(importedTags)
    : [];

  const matchedLocation =
    (typeof data.location_id === "string"
      ? locations.find((location) => location.id === data.location_id) || null
      : null) ||
    resolveLocationFromImportedData(locations, data.location, data.address);

  const resolvedLocationId =
    (typeof data.location_id === "string" && data.location_id) ||
    matchedLocation?.id ||
    (owner?.type === "location" ? owner.id : "");

  const organizerIds: string[] = [];
  const pushOrganizerId = (value?: string | null) => {
    if (value && !organizerIds.includes(value)) {
      organizerIds.push(value);
    }
  };

  if (owner) {
    pushOrganizerId(owner.id);
  }
  if (typeof data.organizer_id === "string") {
    pushOrganizerId(data.organizer_id);
  }
  if (typeof data.location_organizer_id === "string") {
    pushOrganizerId(data.location_organizer_id);
  }

  const matchedOrganizer = resolveOrganizerFromName(organizers, data.organizer);
  if (matchedOrganizer) {
    pushOrganizerId(matchedOrganizer.id);
  }

  const resolvedCategory = resolveImportedCategory(
    categories,
    extractImportedCategoryLabels({
      category: typeof data.category === "string" ? data.category : null,
      metadata:
        typeof data.metadata === "object" && data.metadata != null
          ? (data.metadata as Record<string, unknown>)
          : undefined,
    }),
  );

  const warnings: ImportedEventWarning[] = [];
  const importedCategoryLabels = resolvedCategory.candidateLabels;

  if (
    (data.location || data.address) &&
    !matchedLocation &&
    !data.location_id
  ) {
    warnings.push({
      field: "location",
      message: "Lieu detecte mais non rapproche automatiquement.",
      value:
        typeof data.location === "string" && data.location.trim()
          ? data.location.trim()
          : typeof data.address === "string"
            ? data.address.trim()
            : undefined,
    });
  }

  if (data.organizer && !matchedOrganizer && !data.organizer_id) {
    warnings.push({
      field: "organizer",
      message: "Organisateur detecte mais non rapproche automatiquement.",
      value:
        typeof data.organizer === "string" ? data.organizer.trim() : undefined,
    });
  }

  if (importedCategoryLabels.length > 0 && !resolvedCategory.matched) {
    warnings.push({
      field: "category",
      message: "Categorie detectee mais non rapprochee automatiquement.",
      value: importedCategoryLabels.join(", "),
    });
  }

  const derivedPrices = deriveGenericPriceRange(data);
  const isPayWhatYouWant = data.is_pay_what_you_want === true;
  const prefill: EventFormPrefill = {
    form: {
      title: (data.title || "").toString(),
      description: (data.description || "").toString(),
      date: data.date ? toDatetimeLocal(String(data.date)) : "",
      end_date: data.end_date ? toDatetimeLocal(String(data.end_date)) : "",
      category: resolvedCategory.id,
      price_min:
        !isPayWhatYouWant && derivedPrices.priceMin != null
          ? String(derivedPrices.priceMin)
          : "",
      price_max:
        !isPayWhatYouWant && derivedPrices.priceMax != null
          ? String(derivedPrices.priceMax)
          : "",
      is_pay_what_you_want: isPayWhatYouWant,
      capacity:
        data.capacity != null
          ? String(data.capacity)
          : matchedLocation?.capacity != null
            ? String(matchedLocation.capacity)
            : "",
      is_full: Boolean(data.is_full),
      location_id: resolvedLocationId,
      room_id: "",
      door_opening_time: (data.door_opening_time || "").toString(),
      external_url: (data.external_url || sourceUrl || "").toString(),
      external_url_label: (data.external_url_label || "").toString(),
      scraping_url: sourceUrl || "",
      instagram_url:
        typeof data.instagram_url === "string" ? data.instagram_url : "",
      facebook_url:
        typeof data.facebook_url === "string" ? data.facebook_url : "",
      image_url: (data.image_url || "").toString(),
      ...(defaultStatus ? { status: defaultStatus } : {}),
    },
    organizerIds,
    tagIds,
  };

  return {
    prefill,
    warnings,
  };
}
