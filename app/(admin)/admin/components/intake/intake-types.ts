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

export type IntakeDuplicateCandidate = {
  eventId: string;
  title: string;
  date: string;
  locationName: string | null;
  score: number;
  reasons?: string[];
};
