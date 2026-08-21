"use client";

import type { EventFormPrefill } from "@/app/(admin)/admin/components/events/types";
import { toDatetimeLocal } from "@/lib/date-utils";
import type { EventOpportunity, EventSource, IntakeImportPayload } from "./intake-types";

export const INTAKE_EVENT_PREFILL_STORAGE_KEY = "outlive:intake-event-prefill";

export type IntakeEventPrefillPayload = {
  opportunityId: string;
  sourceId: string | null;
  title: string;
  sourceUrl: string | null;
  detectedDate: string | null;
  detectedLocation: string | null;
  detectedCategory: string | null;
  organizerId: string | null;
  organizerLocationId: string | null;
  notes: string | null;
  importPayload: IntakeImportPayload | null;
  createdAt: string;
};

export function buildIntakeEventPrefillPayload(
  opportunity: EventOpportunity,
  source?: EventSource,
): IntakeEventPrefillPayload {
  return {
    opportunityId: opportunity.id,
    sourceId: source?.id ?? opportunity.source_id ?? null,
    title: opportunity.raw_title,
    sourceUrl: opportunity.source_url || source?.url || null,
    detectedDate: opportunity.detected_date,
    detectedLocation: opportunity.detected_location,
    detectedCategory: opportunity.detected_category,
    organizerId: source?.organizer_id ?? null,
    organizerLocationId: source?.organizer_location_id ?? null,
    notes: opportunity.notes,
    importPayload: opportunity.import_payload,
    createdAt: new Date().toISOString(),
  };
}

export function saveIntakeEventPrefill(payload: IntakeEventPrefillPayload) {
  window.localStorage.setItem(INTAKE_EVENT_PREFILL_STORAGE_KEY, JSON.stringify(payload));
}

export function readIntakeEventPrefill(opportunityId: string) {
  const raw = window.localStorage.getItem(INTAKE_EVENT_PREFILL_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as IntakeEventPrefillPayload;
    if (parsed.opportunityId !== opportunityId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearIntakeEventPrefill() {
  window.localStorage.removeItem(INTAKE_EVENT_PREFILL_STORAGE_KEY);
}

export function buildEventFormPrefillFromIntakePayload(args: {
  payload: IntakeEventPrefillPayload;
  categories: Array<{ id: string; name: string }>;
}): EventFormPrefill {
  if (args.payload.importPayload?.eventPrefill) {
    const importedPrefill = args.payload.importPayload.eventPrefill;
    return {
      ...importedPrefill,
      form: {
        ...(importedPrefill.form || {}),
        external_url:
          importedPrefill.form?.external_url || args.payload.sourceUrl || "",
        scraping_url:
          importedPrefill.form?.scraping_url || args.payload.sourceUrl || "",
        status: "pending",
      },
    };
  }

  const categoryId =
    args.categories.find((category) => category.name === args.payload.detectedCategory)?.id || "";
  const organizerIds = [args.payload.organizerId, args.payload.organizerLocationId].filter(
    (id): id is string => Boolean(id),
  );

  return {
    form: {
      title: args.payload.title,
      description: args.payload.notes || "",
      date: args.payload.detectedDate ? toDatetimeLocal(args.payload.detectedDate) : "",
      category: categoryId,
      location_id: "",
      external_url: args.payload.sourceUrl || "",
      external_url_label: "Source",
      scraping_url: args.payload.sourceUrl || "",
      status: "pending",
    },
    organizerIds,
  };
}
