"use client";

import type { EventFormPrefill } from "@/app/(admin)/admin/components/events/types";
import type {
  ImportedEventPayload,
  ImportedEventWarning,
} from "@/lib/events/imported-event-payload";

export type SourceType =
  | "instagram"
  | "facebook"
  | "website"
  | "newsletter"
  | "ticketing"
  | "agenda"
  | "other";

export type SourcePriority = "p0" | "p1" | "p2" | "p3";
export type SourceStatus = "active" | "paused" | "dead" | "duplicate";
export type SourceScope = "owner" | "global";

export type OpportunityStatus =
  | "spotted"
  | "needs_info"
  | "ready_to_create"
  | "created"
  | "published"
  | "duplicate"
  | "out_of_scope"
  | "recheck"
  | "archived";

export type SourceQueueFilter = "due" | "priority" | "late" | "active" | "all";
export type OpportunityQueueFilter = "active" | "ready" | "needs_info" | "all";
export type IntakeCaptureMode = "manual" | "url" | "image" | "facebook";

export type IntakeImportPayload = {
  data: ImportedEventPayload;
  eventPrefill: EventFormPrefill;
  sourceUrl: string | null;
  imageUrl: string | null;
  mode: Exclude<IntakeCaptureMode, "manual">;
};

export type EventSource = {
  id: string;
  name: string;
  type: SourceType;
  source_scope: SourceScope;
  is_editable: boolean;
  default_capture_mode: IntakeCaptureMode | null;
  url: string;
  organizer_id: string | null;
  organizer_location_id: string | null;
  priority: SourcePriority;
  scan_frequency_days: number;
  last_scanned_at: string | null;
  next_scan_at: string | null;
  status: SourceStatus;
  reliability_score: number;
  novelty_score: number;
  average_scan_minutes: number;
  category_hint: string | null;
  city_hint: string | null;
  notes: string | null;
  scan_count: number;
  discovery_count: number;
  last_found_at: string | null;
  created_at: string;
  updated_at: string;
  organizer?: LinkedEntity | null;
  organizer_location?: LinkedLocation | null;
};

export type LinkedEntity = {
  id: string;
  name: string;
  icon_url?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
};

export type LinkedLocation = LinkedEntity & {
  is_organizer: boolean | null;
  address?: string | null;
  capacity?: number | null;
};

export type CityOption = {
  id: string;
  label: string;
};

export type EventOpportunity = {
  id: string;
  source_id: string | null;
  source_scan_log_id: string | null;
  source_url: string | null;
  raw_title: string;
  detected_date: string | null;
  detected_location: string | null;
  detected_category: string | null;
  missing_fields: string[];
  status: OpportunityStatus;
  confidence_score: number;
  priority_score: number;
  duplicate_event_id: string | null;
  created_event_id: string | null;
  decision_reason: string | null;
  notes: string | null;
  capture_mode: IntakeCaptureMode;
  import_payload: IntakeImportPayload | null;
  import_warnings: ImportedEventWarning[];
  import_metadata: Record<string, unknown> | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type EventSourceScanLog = {
  id: string;
  source_id: string;
  action: "scanned" | "reset_scan" | "status_change";
  session_key: string | null;
  scanned_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  previous_next_scan_at: string | null;
  next_scan_at: string | null;
  previous_scan_count: number | null;
  scan_count: number | null;
  opportunities_found: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type IntakeDuplicateCandidate = {
  eventId: string;
  title: string;
  date: string;
  locationName: string | null;
  score: number;
  reasons?: string[];
};

export type SourceFormState = {
  name: string;
  type: SourceType;
  defaultCaptureMode: IntakeCaptureMode;
  url: string;
  organizerId: string;
  organizerLocationId: string;
  priority: SourcePriority;
  scanFrequencyDays: string;
  cityHint: string;
  categoryHint: string;
  notes: string;
};

export type OpportunityFormState = {
  captureMode: IntakeCaptureMode;
  sourceId: string;
  rawTitle: string;
  sourceUrl: string;
  importUrl: string;
  imageUrl: string;
  imageFile: File | null;
  detectedDate: string;
  detectedLocation: string;
  detectedCategory: string;
  missingFields: string;
  notes: string;
  confidenceScore: string;
};

export type OpportunityEditFormState = {
  sourceId: string;
  rawTitle: string;
  sourceUrl: string;
  detectedDate: string;
  detectedLocation: string;
  detectedCategory: string;
  missingFields: string;
  notes: string;
  confidenceScore: string;
  status: OpportunityStatus;
  decisionReason: string;
};

export type IntakeMetrics = {
  dueSources: number;
  lateSources: number;
  activeOpportunities: number;
  ready: number;
  needsInfo: number;
  sourceCoverage: number;
};

export const sourceTypeOptions: Array<{ value: SourceType; label: string }> = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Site web" },
  { value: "newsletter", label: "Newsletter" },
  { value: "ticketing", label: "Billetterie" },
  { value: "agenda", label: "Agenda" },
  { value: "other", label: "Autre" },
];

export const priorityOptions: Array<{ value: SourcePriority; label: string; hint: string }> = [
  { value: "p0", label: "P0", hint: "Quotidien" },
  { value: "p1", label: "P1", hint: "2-3x/semaine" },
  { value: "p2", label: "P2", hint: "Hebdo" },
  { value: "p3", label: "P3", hint: "Occasionnel" },
];

export const sourceStatusOptions: Array<{ value: SourceStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Pause" },
  { value: "dead", label: "Morte" },
  { value: "duplicate", label: "Doublon" },
];

export const opportunityStatusOptions: Array<{ value: OpportunityStatus; label: string }> = [
  { value: "spotted", label: "Repere" },
  { value: "needs_info", label: "A completer" },
  { value: "ready_to_create", label: "Pret a creer" },
  { value: "created", label: "Cree" },
  { value: "published", label: "Publie" },
  { value: "duplicate", label: "Doublon" },
  { value: "out_of_scope", label: "Hors scope" },
  { value: "recheck", label: "A rechecker" },
  { value: "archived", label: "Archive" },
];

export const defaultSourceForm: SourceFormState = {
  name: "",
  type: "website",
  defaultCaptureMode: "url",
  url: "",
  organizerId: "",
  organizerLocationId: "",
  priority: "p2",
  scanFrequencyDays: "7",
  cityHint: "Orléans",
  categoryHint: "",
  notes: "",
};

export const defaultOpportunityForm: OpportunityFormState = {
  captureMode: "url",
  sourceId: "",
  rawTitle: "",
  sourceUrl: "",
  importUrl: "",
  imageUrl: "",
  imageFile: null,
  detectedDate: "",
  detectedLocation: "",
  detectedCategory: "",
  missingFields: "",
  notes: "",
  confidenceScore: "60",
};

export const defaultOpportunityEditForm: OpportunityEditFormState = {
  sourceId: "",
  rawTitle: "",
  sourceUrl: "",
  detectedDate: "",
  detectedLocation: "",
  detectedCategory: "",
  missingFields: "",
  notes: "",
  confidenceScore: "60",
  status: "spotted",
  decisionReason: "",
};
