"use client";

import { buildEventFormPrefillFromImport } from "@/app/(admin)/admin/components/events/event-import-utils";
import type {
  CategoryOption,
  LocationData,
  OrganizerOption,
} from "@/app/(admin)/admin/components/events/types";
import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import type {
  ImportedEventAnalysisResult,
  ImportedEventPayload,
  ImportedEventWarning,
} from "@/lib/events/imported-event-payload";
import type {
  EventSource,
  IntakeCaptureMode,
  IntakeImportPayload,
  LinkedEntity,
  LinkedLocation,
  OpportunityFormState,
} from "./intake-types";

type ImportableMode = Exclude<IntakeCaptureMode, "manual">;

export type IntakeImportContext = {
  categories: CategoryOption[];
  locations: LinkedLocation[];
  organizers: LinkedEntity[];
};

export type IntakeImportResult = {
  mode: ImportableMode;
  sourceUrl: string | null;
  imageUrl: string | null;
  data: ImportedEventPayload;
  importPayload: IntakeImportPayload;
  importWarnings: ImportedEventWarning[];
  importMetadata: Record<string, unknown> | null;
  rawTitle: string;
  detectedDate: string;
  detectedLocation: string;
  detectedCategory: string;
  notes: string;
  confidenceScore: number;
  missingFields: string[];
};

function assertValidUrl(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} requis.`);
  }

  try {
    return new URL(value.trim()).toString();
  } catch {
    throw new Error(`${label} invalide.`);
  }
}

function toLocationData(location: LinkedLocation): LocationData {
  return {
    id: location.id,
    name: location.name,
    address: location.address ?? null,
    capacity: location.capacity ?? null,
    latitude: null,
    longitude: null,
  };
}

function toOrganizerOptions(args: {
  locations: LinkedLocation[];
  organizers: LinkedEntity[];
}): OrganizerOption[] {
  return [
    ...args.organizers.map((organizer) => ({
      id: organizer.id,
      name: organizer.name,
      instagram_url: organizer.instagram_url ?? null,
      facebook_url: organizer.facebook_url ?? null,
      type: "organizer" as const,
    })),
    ...args.locations
      .filter((location) => location.is_organizer)
      .map((location) => ({
        id: location.id,
        name: location.name,
        instagram_url: location.instagram_url ?? null,
        facebook_url: location.facebook_url ?? null,
        type: "location" as const,
      })),
  ];
}

function getImportOwner(source: EventSource | undefined): OrganizerOption | undefined {
  if (!source) return undefined;

  if (source.organizer_id && source.organizer) {
    return {
      id: source.organizer_id,
      name: source.organizer.name,
      instagram_url: source.organizer.instagram_url ?? null,
      facebook_url: source.organizer.facebook_url ?? null,
      type: "organizer",
    };
  }

  if (source.organizer_location_id && source.organizer_location) {
    return {
      id: source.organizer_location_id,
      name: source.organizer_location.name,
      instagram_url: source.organizer_location.instagram_url ?? null,
      facebook_url: source.organizer_location.facebook_url ?? null,
      type: "location",
    };
  }

  return undefined;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDetectedCategory(args: {
  data: ImportedEventPayload;
  categoryId: string | undefined;
  categories: CategoryOption[];
}) {
  const categoryName = args.categories.find((category) => category.id === args.categoryId)?.name;
  return categoryName || getString(args.data.category);
}

function buildMissingFields(args: {
  rawTitle: string;
  detectedDate: string;
  detectedLocation: string;
  detectedCategory: string;
}) {
  const fields: string[] = [];
  if (!args.rawTitle) fields.push("titre");
  if (!args.detectedDate) fields.push("date");
  if (!args.detectedLocation) fields.push("lieu");
  if (!args.detectedCategory) fields.push("categorie");
  return fields;
}

async function scrapeFromUrl(args: {
  url: string;
  mode: "url" | "facebook";
  owner?: OrganizerOption;
}) {
  const endpoint = args.mode === "facebook" ? "/api/facebook/events/scrape" : "/api/events/scrape";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: args.url,
      organizer_id: args.owner?.type === "organizer" ? args.owner.id : undefined,
      location_id: args.owner?.type === "location" ? args.owner.id : undefined,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as {
    data?: ImportedEventPayload;
    metadata?: Record<string, unknown>;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error || "Import impossible.");
  }

  return {
    data: result.data || {},
    metadata: result.metadata ?? null,
    warnings: [] as ImportedEventWarning[],
  };
}

async function scrapeFromImage(args: { imageFile: File | null; imageUrl: string }) {
  if (!args.imageFile && !args.imageUrl.trim()) {
    throw new Error("Image ou URL d'image requise.");
  }

  const body = new FormData();
  if (args.imageFile) body.append("image", args.imageFile);
  if (args.imageUrl.trim()) body.append("imageUrl", args.imageUrl.trim());

  const response = await fetch("/api/events/extract-from-image", {
    method: "POST",
    body,
  });

  const result = (await response.json().catch(() => ({}))) as ImportedEventAnalysisResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error || "Analyse image impossible.");
  }

  return {
    data: result.data || {},
    metadata: result.metadata ?? null,
    warnings: result.warnings || [],
  };
}

export async function importOpportunityFromCapture(args: {
  form: OpportunityFormState;
  source?: EventSource;
  context: IntakeImportContext;
  findOrCreateTagIds?: (rawTagNames: string[]) => Promise<string[]>;
}): Promise<IntakeImportResult | null> {
  if (args.form.captureMode === "manual") return null;

  const mode = args.form.captureMode;
  const owner = getImportOwner(args.source);
  const sourceUrl =
    mode === "image"
      ? args.form.sourceUrl.trim() || args.source?.url || null
      : assertValidUrl(args.form.importUrl || args.form.sourceUrl || args.source?.url || "", "URL");
  const imageUrl =
    mode === "image" && args.form.imageUrl.trim()
      ? assertValidUrl(args.form.imageUrl, "URL d'image")
      : null;

  if (mode === "facebook" && !isFacebookEventUrl(sourceUrl || "")) {
    throw new Error("L'URL doit pointer vers un evenement Facebook public.");
  }

  const imported =
    mode === "image"
      ? await scrapeFromImage({ imageFile: args.form.imageFile, imageUrl: imageUrl || "" })
      : await scrapeFromUrl({ url: sourceUrl || "", mode, owner });

  const locations = args.context.locations.map(toLocationData);
  const organizers = toOrganizerOptions(args.context);
  const built = await buildEventFormPrefillFromImport({
    data: imported.data,
    sourceUrl: sourceUrl || undefined,
    owner,
    categories: args.context.categories,
    locations,
    organizers,
    findOrCreateTagIds: args.findOrCreateTagIds,
    defaultStatus: "pending",
  });

  const importWarnings = [...(imported.warnings || []), ...built.warnings];
  const eventPrefill = built.prefill;
  const form = eventPrefill.form || {};
  const rawTitle = getString(form.title || imported.data.title || args.form.rawTitle);
  const detectedDate = getString(form.date || imported.data.date || args.form.detectedDate);
  const detectedLocation =
    args.context.locations.find((location) => location.id === form.location_id)?.name ||
    getString(imported.data.location || imported.data.address || args.form.detectedLocation);
  const detectedCategory = getDetectedCategory({
    data: imported.data,
    categoryId: form.category,
    categories: args.context.categories,
  }) || args.form.detectedCategory;
  const missingFields = buildMissingFields({
    rawTitle,
    detectedDate,
    detectedLocation,
    detectedCategory,
  });

  return {
    mode,
    sourceUrl,
    imageUrl,
    data: imported.data,
    importPayload: {
      data: imported.data,
      eventPrefill,
      sourceUrl,
      imageUrl,
      mode,
    },
    importWarnings,
    importMetadata: imported.metadata,
    rawTitle,
    detectedDate,
    detectedLocation,
    detectedCategory,
    notes: args.form.notes.trim(),
    confidenceScore: Math.max(70, Math.min(95, Number(args.form.confidenceScore) || 80)),
    missingFields,
  };
}
