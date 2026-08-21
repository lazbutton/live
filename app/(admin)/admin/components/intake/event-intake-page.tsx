"use client";

import * as React from "react";
import { Download, ListChecks } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { toDatetimeLocal } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase/client";
import { EventFormSheet } from "../events/event-form-sheet";
import { resolveTagIdsForImport } from "../events/event-import-utils";
import {
  OrganizerDialog,
  type Organizer as AdminOrganizer,
} from "../organizers-management";
import {
  LocationDialog,
  type Location as AdminLocation,
} from "../locations-management";
import type {
  AdminEvent,
  ArtistOption,
  EventFormPrefill,
  LocationData,
  OrganizerOption,
  TagOption,
} from "../events/types";
import {
  buildIntakeEventPrefillPayload,
  buildEventFormPrefillFromIntakePayload,
} from "./intake-event-prefill";
import { CapturePanel } from "./capture-panel";
import { importOpportunityFromCapture } from "./intake-import-service";
import { OpportunityEditSheet } from "./opportunity-edit-sheet";
import { OpportunityQueue } from "./opportunity-queue";
import { SourceCockpit } from "./source-cockpit";
import { SourceCreationSheet } from "./source-creation-sheet";
import { SourceQueue } from "./source-queue";
import { IntakeToolbar } from "./intake-toolbar";
import {
  ManagementHero,
  ManagementStat,
  ManagementStatGrid,
} from "../management-page-primitives";
import {
  defaultOpportunityForm,
  defaultOpportunityEditForm,
  defaultSourceForm,
  type CityOption,
  type EventOpportunity,
  type EventSource,
  type EventSourceScanLog,
  type IntakeMetrics,
  type IntakeDuplicateCandidate,
  type LinkedEntity,
  type LinkedLocation,
  type OpportunityFormState,
  type OpportunityEditFormState,
  type OpportunityQueueFilter,
  type OpportunityStatus,
  type SourceFormState,
  type SourceQueueFilter,
  type SourceStatus,
} from "./intake-types";
import {
  addDays,
  computeAverageScanMinutes,
  computePriorityScore,
  computeSourceNoveltyScore,
  findOpportunityDuplicateCandidate,
  getSourcePrioritySuggestion,
  getSourceStatusLabel,
  isSourceDue,
  isSourceLate,
  parseMissingFields,
  sourceSort,
  toDatetimeIso,
  uniqueSelectOptions,
} from "./intake-utils";

type ExistingEventForDuplicate = {
  id: string;
  title: string | null;
  date: string | null;
  end_date?: string | null;
  location_id: string | null;
  external_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  location?: { name?: string | null } | null;
  event_organizers?: Array<{
    organizer?: { id?: string | null; name?: string | null } | null;
    location?: { id?: string | null; name?: string | null } | null;
  }> | null;
};

type SourceScanContext = {
  startedAt: string;
  opportunityIds: string[];
};

type PendingSourceAction =
  | { type: "scan"; sourceId: string }
  | { type: "reset-scan"; sourceId: string }
  | { type: "status"; sourceId: string; status: SourceStatus }
  | null;

type LoadDataMode = "initial" | "silent";

const INTAKE_WORKFLOW_STORAGE_KEY = "outlive-intake-workflow-v3";

type IntakeSessionSummary = {
  key: string;
  label: string;
  scannedCount: number;
  opportunitiesFound: number;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  logs: EventSourceScanLog[];
};

function formatSessionDate(iso?: string | null) {
  if (!iso) return "Session sans date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Session sans date";
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number) {
  if (!seconds) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function buildSessionExportMarkdown(
  summary: IntakeSessionSummary,
  sourceById: Map<string, EventSource>,
) {
  const lines = [
    `# Récap collecte - ${summary.label}`,
    "",
    `- Sources scannées: ${summary.scannedCount}`,
    `- Opportunités trouvées: ${summary.opportunitiesFound}`,
    `- Temps passé: ${formatDuration(summary.durationSeconds)}`,
    "",
    "## Sources",
    "",
  ];

  for (const log of summary.logs) {
    const source = sourceById.get(log.source_id);
    lines.push(
      `- ${source?.name || log.source_id} - ${log.action} - ${log.opportunities_found || 0} opportunité(s) - ${formatDuration(log.duration_seconds || 0)}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function IntakeReportingPanel({
  currentSession,
  recentSessions,
  onExport,
}: {
  currentSession: IntakeSessionSummary | null;
  recentSessions: IntakeSessionSummary[];
  onExport: (summary: IntakeSessionSummary) => void;
}) {
  return (
    <Card className="rounded-2xl border-border/70 bg-card/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Reporting Collecte</div>
          <div className="text-sm text-muted-foreground">
            Récap de session exportable et historique multi-sessions.
          </div>
        </div>
        {currentSession ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => onExport(currentSession)}
          >
            <Download className="h-4 w-4" />
            Exporter la session
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-background/70 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Session courante
          </div>
          <div className="mt-2 text-lg font-semibold">
            {currentSession?.scannedCount ?? 0} source
            {(currentSession?.scannedCount ?? 0) > 1 ? "s" : ""}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {currentSession
              ? `${currentSession.opportunitiesFound} opportunité(s), ${formatDuration(currentSession.durationSeconds)}`
              : "Aucune session active"}
          </div>
        </div>
        {recentSessions.slice(0, 2).map((summary) => (
          <button
            key={summary.key}
            type="button"
            className="rounded-xl border bg-background/70 p-3 text-left transition-colors hover:bg-accent"
            onClick={() => onExport(summary)}
          >
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {summary.label}
            </div>
            <div className="mt-2 text-lg font-semibold">
              {summary.scannedCount} scan{summary.scannedCount > 1 ? "s" : ""}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {summary.opportunitiesFound} opportunité(s), {formatDuration(summary.durationSeconds)}
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function sourceHasEntityLink(source: EventSource) {
  return source.source_scope === "global" || Boolean(source.organizer_id || source.organizer_location_id);
}

function hydrateSourceFormFromSource(source: EventSource): SourceFormState {
  return {
    name: source.name || "",
    type: source.type,
    defaultCaptureMode: source.default_capture_mode ?? "url",
    url: source.url || "",
    organizerId: source.organizer_id || "",
    organizerLocationId: source.organizer_location_id || "",
    priority: source.priority,
    scanFrequencyDays: String(source.scan_frequency_days || 7),
    cityHint: source.city_hint || "",
    categoryHint: source.category_hint || "",
    notes: source.notes || "",
  };
}

function hydrateOpportunityEditForm(opportunity: EventOpportunity): OpportunityEditFormState {
  return {
    sourceId: opportunity.source_id || "",
    rawTitle: opportunity.raw_title || "",
    sourceUrl: opportunity.source_url || "",
    detectedDate: opportunity.detected_date ? toDatetimeLocal(opportunity.detected_date) : "",
    detectedLocation: opportunity.detected_location || "",
    detectedCategory: opportunity.detected_category || "",
    missingFields: opportunity.missing_fields.join(", "),
    notes: opportunity.notes || "",
    confidenceScore: String(opportunity.confidence_score ?? 50),
    status: opportunity.status,
    decisionReason: opportunity.decision_reason || "",
  };
}

function getNextSourceInQueue(
  queue: EventSource[],
  currentSourceId: string | null,
  options?: { allowSameWhenSingle?: boolean },
) {
  if (queue.length === 0) return null;
  if (!currentSourceId) return queue[0];

  const currentIndex = queue.findIndex((source) => source.id === currentSourceId);
  if (currentIndex === -1) return queue[0];

  if (queue.length === 1 && !options?.allowSameWhenSingle) {
    return null;
  }

  return queue[(currentIndex + 1) % queue.length] ?? queue[0];
}

export function EventIntakePage() {
  const searchParams = useSearchParams();
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [sources, setSources] = React.useState<EventSource[]>([]);
  const [opportunities, setOpportunities] = React.useState<EventOpportunity[]>([]);
  const [scanLogs, setScanLogs] = React.useState<EventSourceScanLog[]>([]);
  const [existingEvents, setExistingEvents] = React.useState<ExistingEventForDuplicate[]>([]);
  const [locations, setLocations] = React.useState<LinkedLocation[]>([]);
  const [organizers, setOrganizers] = React.useState<LinkedEntity[]>([]);
  const [categories, setCategories] = React.useState<LinkedEntity[]>([]);
  const [cities, setCities] = React.useState<CityOption[]>([]);
  const [sourceForm, setSourceForm] = React.useState<SourceFormState>(defaultSourceForm);
  const [opportunityForm, setOpportunityForm] =
    React.useState<OpportunityFormState>(defaultOpportunityForm);
  const [opportunityEditForm, setOpportunityEditForm] =
    React.useState<OpportunityEditFormState>(defaultOpportunityEditForm);
  const [sourceFilter, setSourceFilter] = React.useState<SourceQueueFilter>("due");
  const [opportunityFilter, setOpportunityFilter] =
    React.useState<OpportunityQueueFilter>("active");
  const [activeSourceId, setActiveSourceId] = React.useState<string | null>(null);
  const [sessionKey, setSessionKey] = React.useState<string | null>(null);
  const [recentlyScannedSourceIds, setRecentlyScannedSourceIds] = React.useState<string[]>([]);
  const [scanContexts, setScanContexts] = React.useState<Record<string, SourceScanContext>>({});
  const [captureAdvancedOpen, setCaptureAdvancedOpen] = React.useState(false);
  const [sourceCreationOpen, setSourceCreationOpen] = React.useState(false);
  const [sourceSheetMode, setSourceSheetMode] = React.useState<"create" | "edit">("create");
  const [sourceSheetNotice, setSourceSheetNotice] = React.useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = React.useState<string | null>(null);
  const [editingOpportunityId, setEditingOpportunityId] = React.useState<string | null>(null);
  const [opportunityEditOpen, setOpportunityEditOpen] = React.useState(false);
  const [pendingSourceAction, setPendingSourceAction] = React.useState<PendingSourceAction>(null);
  const [sessionStorageReady, setSessionStorageReady] = React.useState(false);
  const [eventFormOpen, setEventFormOpen] = React.useState(false);
  const [eventFormEvent, setEventFormEvent] = React.useState<AdminEvent | null>(null);
  const [eventFormPrefill, setEventFormPrefill] = React.useState<EventFormPrefill | undefined>(undefined);
  const [eventFormOpportunityId, setEventFormOpportunityId] = React.useState<string | null>(null);
  const [eventFormLocations, setEventFormLocations] = React.useState<LocationData[]>([]);
  const [eventFormOrganizers, setEventFormOrganizers] = React.useState<OrganizerOption[]>([]);
  const [eventFormArtists, setEventFormArtists] = React.useState<ArtistOption[]>([]);
  const [eventFormTags, setEventFormTags] = React.useState<TagOption[]>([]);
  const [organizerDialogOpen, setOrganizerDialogOpen] = React.useState(false);
  const [editingOrganizerEntity, setEditingOrganizerEntity] = React.useState<AdminOrganizer | null>(null);
  const [locationDialogOpen, setLocationDialogOpen] = React.useState(false);
  const [editingLocationEntity, setEditingLocationEntity] = React.useState<AdminLocation | null>(null);
  const [tabletSection, setTabletSection] = React.useState<"sources" | "work">(
    "sources",
  );
  const capturePanelRef = React.useRef<HTMLDivElement | null>(null);
  const keyboardContextRef = React.useRef<{
    activeSource: EventSource | null;
    nextSource: EventSource | null;
  }>({
    activeSource: null,
    nextSource: null,
  });
  const keyboardActionsRef = React.useRef<{
    openSource: () => void;
    startOpportunity: (source: EventSource) => void;
    scanSource: (source: EventSource) => Promise<void>;
    nextSource: () => void;
    previousListSource: () => void;
    nextListSource: () => void;
  }>({
    openSource: () => undefined,
    startOpportunity: () => undefined,
    scanSource: async () => undefined,
    nextSource: () => undefined,
    previousListSource: () => undefined,
    nextListSource: () => undefined,
  });

  const loadData = React.useCallback(async (mode: LoadDataMode = "silent") => {
    if (mode === "initial") {
      setInitialLoading(true);
    }

    try {
      const [
        sourcesResult,
        opportunitiesResult,
        locationsResult,
        organizersResult,
        categoriesResult,
        tagsResult,
        artistsResult,
        citiesResult,
        existingEventsResult,
        scanLogsResult,
      ] = await Promise.all([
        supabase
          .from("intake_sources_view")
          .select("*")
          .order("priority")
          .order("next_scan_at"),
        supabase
          .from("event_opportunities")
          .select("*")
          .order("priority_score", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("locations")
          .select("id, name, image_url, is_organizer, address, capacity, latitude, longitude, city_id, city:cities(id, label), instagram_url, facebook_url")
          .order("name", { ascending: true }),
        supabase
          .from("organizers")
          .select("id, name, icon_url, logo_url, instagram_url, facebook_url")
          .order("name", { ascending: true }),
        supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
        supabase.from("tags").select("id, name").order("name"),
        supabase.from("artists").select("id, name, slug, image_url, origin_city").order("name", { ascending: true }),
        supabase.from("cities").select("id, label").order("label", { ascending: true }),
        supabase
          .from("events")
          .select(
            "id, title, date, end_date, location_id, external_url, instagram_url, facebook_url, location:locations(name), event_organizers:event_organizers(organizer:organizers(id,name), location:locations(id,name))",
          )
          .gte("date", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
          .order("date", { ascending: true })
          .limit(1000),
        supabase
          .from("event_source_scan_logs")
          .select("*")
          .order("scanned_at", { ascending: false })
          .limit(200),
      ]);

      if (
        sourcesResult.error ||
        opportunitiesResult.error ||
        locationsResult.error ||
        organizersResult.error ||
        categoriesResult.error ||
        tagsResult.error ||
        artistsResult.error ||
        citiesResult.error ||
        existingEventsResult.error ||
        scanLogsResult.error
      ) {
        toast({
          title: "Impossible de charger la collecte",
          description:
            sourcesResult.error?.message ||
            opportunitiesResult.error?.message ||
            locationsResult.error?.message ||
            organizersResult.error?.message ||
            categoriesResult.error?.message ||
            tagsResult.error?.message ||
            artistsResult.error?.message ||
            citiesResult.error?.message ||
            existingEventsResult.error?.message ||
            scanLogsResult.error?.message ||
            "Verifie que les migrations ont bien ete appliquees.",
          variant: "destructive",
        });
      } else {
        const organizers = (organizersResult.data || []) as LinkedEntity[];
        const locations = ((locationsResult.data || []) as LinkedLocation[]).map((location: any) => ({
          ...location,
          city: Array.isArray(location.city) ? (location.city[0] ?? null) : (location.city ?? null),
        }));
        const organizerById = new Map(organizers.map((organizer) => [organizer.id, organizer]));
        const locationById = new Map(locations.map((location) => [location.id, location]));
        const hydratedSources = ((sourcesResult.data || []) as EventSource[])
          .map((source) => ({
            ...source,
            organizer: source.organizer_id ? organizerById.get(source.organizer_id) ?? null : null,
            organizer_location: source.organizer_location_id
              ? locationById.get(source.organizer_location_id) ?? null
              : null,
          }))
          .sort(sourceSort);

        setSources(hydratedSources);
        setOpportunities((opportunitiesResult.data || []) as EventOpportunity[]);
        setLocations(locations);
        setOrganizers(organizers);
        setCategories((categoriesResult.data || []) as LinkedEntity[]);
        setEventFormTags((tagsResult.data || []) as TagOption[]);
        setEventFormArtists((artistsResult.data || []) as ArtistOption[]);
        setEventFormLocations((locations as unknown as LocationData[]) || []);
        setEventFormOrganizers([
          ...organizers.map((item) => ({
            id: item.id,
            name: item.name,
            instagram_url: item.instagram_url ?? null,
            facebook_url: item.facebook_url ?? null,
            type: "organizer" as const,
          })),
          ...locations
            .filter((item) => Boolean((item as any).is_organizer))
            .map((item) => ({
              id: item.id,
              name: item.name,
              instagram_url: (item as any).instagram_url ?? null,
              facebook_url: (item as any).facebook_url ?? null,
              type: "location" as const,
            })),
        ]);
        setCities((citiesResult.data || []) as CityOption[]);
        setExistingEvents((existingEventsResult.data || []) as ExistingEventForDuplicate[]);
        setScanLogs((scanLogsResult.data || []) as EventSourceScanLog[]);
      }
    } finally {
      if (mode === "initial") {
        setInitialLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    void loadData("initial");
  }, [loadData]);

  React.useEffect(() => {
    const filter = searchParams.get("filter");
    if (filter === "overdue") {
      setSourceFilter("late");
      setTabletSection("sources");
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(INTAKE_WORKFLOW_STORAGE_KEY);
      if (!raw) {
        setSessionStorageReady(true);
        return;
      }
      const parsed = JSON.parse(raw) as {
        sessionKey?: string | null;
        recentlyScannedSourceIds?: string[];
        activeSourceId?: string | null;
        scanContexts?: Record<string, SourceScanContext>;
      };
      setSessionKey(parsed.sessionKey ?? null);
      setRecentlyScannedSourceIds(parsed.recentlyScannedSourceIds ?? []);
      setActiveSourceId(parsed.activeSourceId ?? null);
      setScanContexts(parsed.scanContexts ?? {});
    } catch {
      // Ignore malformed persisted workflow state.
    } finally {
      setSessionStorageReady(true);
    }
  }, []);

  React.useEffect(() => {
    if (!sessionStorageReady || typeof window === "undefined") return;
    window.localStorage.setItem(
      INTAKE_WORKFLOW_STORAGE_KEY,
      JSON.stringify({
        sessionKey,
        recentlyScannedSourceIds,
        activeSourceId,
        scanContexts,
      }),
    );
  }, [
    activeSourceId,
    recentlyScannedSourceIds,
    scanContexts,
    sessionKey,
    sessionStorageReady,
  ]);

  const sourceById = React.useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources],
  );

  const sessionSummaries = React.useMemo<IntakeSessionSummary[]>(() => {
    const groups = new Map<string, EventSourceScanLog[]>();

    for (const log of scanLogs) {
      const dayKey = log.scanned_at?.slice(0, 10) || log.created_at?.slice(0, 10) || "unknown";
      const key = log.session_key || `day:${dayKey}`;
      groups.set(key, [...(groups.get(key) || []), log]);
    }

    return Array.from(groups.entries())
      .map(([key, logs]) => {
        const sortedLogs = [...logs].sort(
          (left, right) =>
            new Date(left.scanned_at).getTime() - new Date(right.scanned_at).getTime(),
        );
        const scannedLogs = sortedLogs.filter((log) => log.action === "scanned");
        const startedAt =
          sortedLogs.find((log) => log.started_at)?.started_at ||
          sortedLogs[0]?.scanned_at ||
          null;
        const endedAt =
          [...sortedLogs].reverse().find((log) => log.ended_at)?.ended_at ||
          sortedLogs[sortedLogs.length - 1]?.scanned_at ||
          null;

        return {
          key,
          label: formatSessionDate(startedAt),
          scannedCount: scannedLogs.length,
          opportunitiesFound: sortedLogs.reduce(
            (total, log) => total + (log.opportunities_found || 0),
            0,
          ),
          durationSeconds: sortedLogs.reduce(
            (total, log) => total + (log.duration_seconds || 0),
            0,
          ),
          startedAt,
          endedAt,
          logs: sortedLogs,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.endedAt || right.startedAt || 0).getTime() -
          new Date(left.endedAt || left.startedAt || 0).getTime(),
      );
  }, [scanLogs]);

  const currentSessionSummary = React.useMemo(() => {
    if (!sessionKey) return null;
    return sessionSummaries.find((summary) => summary.key === sessionKey) ?? null;
  }, [sessionKey, sessionSummaries]);

  const exportSessionSummary = React.useCallback(
    (summary: IntakeSessionSummary) => {
      const day = (summary.startedAt || new Date().toISOString()).slice(0, 10);
      downloadTextFile(
        `collecte-session-${day}.md`,
        buildSessionExportMarkdown(summary, sourceById),
      );
    },
    [sourceById],
  );

  const findOrCreateTagIdsForImport = React.useCallback(
    async (rawTagNames: string[]) =>
      resolveTagIdsForImport({
        rawTagNames,
        tags: eventFormTags,
        onTagsChanged: () => loadData(),
      }),
    [eventFormTags, loadData],
  );

  const sourceOptions = React.useMemo(
    () => sources.map((source) => ({ value: source.id, label: source.name })),
    [sources],
  );

  const categoryOptions = React.useMemo(
    () => categories.map((category) => ({ value: category.name, label: category.name })),
    [categories],
  );

  const cityOptions = React.useMemo(
    () => cities.map((city) => ({ value: city.label, label: city.label })),
    [cities],
  );

  const locationNameOptions = React.useMemo(
    () => locations.map((location) => ({ value: location.name, label: location.name })),
    [locations],
  );

  const detectedLocationOptions = React.useMemo(
    () => uniqueSelectOptions([...locationNameOptions, ...cityOptions]),
    [cityOptions, locationNameOptions],
  );

  const buildSessionKey = React.useCallback(() => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, []);

  const ensureScanContext = React.useCallback((sourceId: string, startedAt?: string) => {
    setScanContexts((current) => {
      if (current[sourceId]) return current;
      return {
        ...current,
        [sourceId]: {
          startedAt: startedAt ?? new Date().toISOString(),
          opportunityIds: [],
        },
      };
    });
  }, []);

  const attachOpportunityToScanContext = React.useCallback((sourceId: string, opportunityId: string) => {
    setScanContexts((current) => {
      const existing = current[sourceId] ?? {
        startedAt: new Date().toISOString(),
        opportunityIds: [],
      };
      return {
        ...current,
        [sourceId]: {
          ...existing,
          opportunityIds: Array.from(new Set([...existing.opportunityIds, opportunityId])),
        },
      };
    });
  }, []);

  const clearScanContext = React.useCallback((sourceId: string) => {
    setScanContexts((current) => {
      if (!current[sourceId]) return current;
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
  }, []);

  const ensureWorkingState = React.useCallback((source?: EventSource | null) => {
    const startedAt = new Date().toISOString();

    if (!sessionKey) {
      setSessionKey(buildSessionKey());
    }

    if (source) {
      ensureScanContext(source.id, startedAt);
    }
  }, [buildSessionKey, ensureScanContext, sessionKey]);

  const filteredSources = React.useMemo(() => {
    const pinnedSource = activeSourceId ? sources.find((source) => source.id === activeSourceId) ?? null : null;
    const includePinnedSource = (items: EventSource[]) => {
      if (!pinnedSource || items.some((source) => source.id === pinnedSource.id)) {
        return items;
      }
      return [pinnedSource, ...items];
    };

    if (sourceFilter === "due") {
      const recentIds = new Set(recentlyScannedSourceIds);
      return includePinnedSource(
        sources
        .filter((source) => isSourceDue(source) || recentIds.has(source.id))
        .sort((left, right) => {
          const leftDue = isSourceDue(left);
          const rightDue = isSourceDue(right);
          if (leftDue !== rightDue) return leftDue ? -1 : 1;

          const leftRecent = recentIds.has(left.id);
          const rightRecent = recentIds.has(right.id);
          if (leftRecent !== rightRecent) return leftRecent ? 1 : -1;

          return sourceSort(left, right);
        }),
      );
    }

    return includePinnedSource(
      sources.filter((source) => {
        if (sourceFilter === "priority") {
          return source.status === "active" && (source.priority === "p0" || source.priority === "p1");
        }
        if (sourceFilter === "late") return isSourceLate(source);
        if (sourceFilter === "active") return source.status === "active";
        return true;
      }),
    );
  }, [activeSourceId, recentlyScannedSourceIds, sourceFilter, sources]);

  const actionableSources = React.useMemo(() => {
    if (sourceFilter === "due") {
      return filteredSources.filter((source) => isSourceDue(source));
    }
    return filteredSources.filter((source) => source.status === "active");
  }, [filteredSources, sourceFilter]);

  const activeOpportunities = React.useMemo(
    () =>
      opportunities.filter((opportunity) =>
        ["spotted", "needs_info", "ready_to_create", "recheck"].includes(opportunity.status),
      ),
    [opportunities],
  );

  const filteredOpportunities = React.useMemo(() => {
    if (opportunityFilter === "active") return activeOpportunities;
    if (opportunityFilter === "ready") {
      return opportunities.filter((opportunity) => opportunity.status === "ready_to_create");
    }
    if (opportunityFilter === "needs_info") {
      return opportunities.filter((opportunity) => opportunity.status === "needs_info");
    }
    return opportunities;
  }, [activeOpportunities, opportunities, opportunityFilter]);

  const duplicateByOpportunityId = React.useMemo(() => {
    const entries = opportunities
      .map((opportunity) => [
        opportunity.id,
        opportunity.duplicate_event_id
          ? {
              eventId: opportunity.duplicate_event_id,
              title: "Doublon confirme",
              date: "",
              locationName: null,
              score: 100,
              reasons: ["confirme"],
            }
          : findOpportunityDuplicateCandidate(opportunity, existingEvents, {
              source: opportunity.source_id ? sourceById.get(opportunity.source_id) : undefined,
              sourceUrl: opportunity.source_url,
            }),
      ] as const)
      .filter((entry): entry is readonly [string, IntakeDuplicateCandidate] => Boolean(entry[1]));

    return new Map(entries);
  }, [existingEvents, opportunities, sourceById]);

  const metrics = React.useMemo<IntakeMetrics>(() => {
    const dueSources = sources.filter(isSourceDue);
    const lateSources = sources.filter(isSourceLate);
    const ready = opportunities.filter((item) => item.status === "ready_to_create");
    const needsInfo = opportunities.filter((item) => item.status === "needs_info");

    return {
      dueSources: dueSources.length,
      lateSources: lateSources.length,
      activeOpportunities: activeOpportunities.length,
      ready: ready.length,
      needsInfo: needsInfo.length,
      sourceCoverage:
        sources.length === 0
          ? 0
          : Math.round(((sources.length - dueSources.length) / sources.length) * 100),
    };
  }, [activeOpportunities.length, opportunities, sources]);

  const activeSource = activeSourceId ? sourceById.get(activeSourceId) ?? null : null;
  const nextSource = React.useMemo(() => {
    return getNextSourceInQueue(actionableSources, activeSourceId);
  }, [actionableSources, activeSourceId]);
  const activeSourceOpportunityProgress = React.useMemo(() => {
    if (!activeSourceId) return null;
    const sourceOpportunities = opportunities.filter(
      (opportunity) => opportunity.source_id === activeSourceId,
    );
    if (sourceOpportunities.length === 0) {
      return {
        total: 0,
        open: 0,
        ready: 0,
        needsInfo: 0,
        duplicate: 0,
        completed: 0,
        progressPercent: 0,
      };
    }

    const ready = sourceOpportunities.filter(
      (opportunity) => opportunity.status === "ready_to_create",
    ).length;
    const needsInfo = sourceOpportunities.filter((opportunity) =>
      ["spotted", "needs_info", "recheck"].includes(opportunity.status),
    ).length;
    const duplicate = sourceOpportunities.filter(
      (opportunity) => opportunity.status === "duplicate",
    ).length;
    const completed = sourceOpportunities.filter((opportunity) =>
      ["created", "published", "out_of_scope", "archived", "duplicate"].includes(
        opportunity.status,
      ),
    ).length;
    const open = sourceOpportunities.length - completed;
    const progressPercent = Math.min(
      100,
      Math.round((completed / Math.max(1, sourceOpportunities.length)) * 100),
    );

    return {
      total: sourceOpportunities.length,
      open,
      ready,
      needsInfo,
      duplicate,
      completed,
      progressPercent,
    };
  }, [activeSourceId, opportunities]);
  const activeSourceExistingEvents = React.useMemo(() => {
    if (!activeSource) return [];
    const organizerId = activeSource.organizer_id || null;
    const organizerLocationId = activeSource.organizer_location_id || null;
    if (!organizerId && !organizerLocationId) return [];
    const now = new Date();

    const matches = existingEvents.filter((existingEvent) => {
      if (existingEvent.date) {
        const eventDate = new Date(existingEvent.date);
        if (!Number.isNaN(eventDate.getTime()) && eventDate <= now) {
          return false;
        }
      }
      const directLocationMatch =
        organizerLocationId && existingEvent.location_id === organizerLocationId;
      const linked = existingEvent.event_organizers || [];
      const linkedEntityMatch = linked.some((entry) => {
        const organizerMatch = organizerId && entry.organizer?.id === organizerId;
        const locationMatch =
          organizerLocationId && entry.location?.id === organizerLocationId;
        return Boolean(organizerMatch || locationMatch);
      });
      return Boolean(directLocationMatch || linkedEntityMatch);
    });
    const uniqueById = new Map<string, ExistingEventForDuplicate>();
    for (const event of matches) {
      uniqueById.set(event.id, event);
    }

    return Array.from(uniqueById.values())
      .sort((left, right) => {
        const leftTime = left.date ? new Date(left.date).getTime() : Number.POSITIVE_INFINITY;
        const rightTime = right.date ? new Date(right.date).getTime() : Number.POSITIVE_INFINITY;
        return leftTime - rightTime;
      })
      .map((event) => ({
        id: event.id,
        title: event.title || "Sans titre",
        date: event.date,
        locationName: event.location?.name || null,
      }));
  }, [activeSource, existingEvents]);
  const cockpitSourceId = activeSource?.id ?? nextSource?.id ?? null;

  const cockpitSource = cockpitSourceId ? sourceById.get(cockpitSourceId) ?? null : null;
  const sourceSuggestion = React.useMemo(
    () => (cockpitSource ? getSourcePrioritySuggestion(cockpitSource) : null),
    [cockpitSource],
  );

  React.useEffect(() => {
    if (!activeSourceId && nextSource) {
      setActiveSourceId(nextSource.id);
      return;
    }

    if (activeSourceId && !sources.some((source) => source.id === activeSourceId)) {
      setActiveSourceId(nextSource?.id ?? null);
    }
  }, [activeSourceId, nextSource, sources]);

  React.useEffect(() => {
    setRecentlyScannedSourceIds((current) =>
      current.filter((sourceId) => sources.some((source) => source.id === sourceId)),
    );
  }, [sources]);

  React.useEffect(() => {
    setScanContexts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([sourceId]) =>
          sources.some((source) => source.id === sourceId),
        ),
      ),
    );
  }, [sources]);

  const focusCapturePanel = React.useCallback(() => {
    requestAnimationFrame(() => {
      capturePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const openSourceEditor = React.useCallback((options?: {
    source?: EventSource;
    notice?: string | null;
    pendingAction?: PendingSourceAction;
  }) => {
    const source = options?.source;
    setSourceSheetMode(source ? "edit" : "create");
    setEditingSourceId(source?.id ?? null);
    setSourceSheetNotice(options?.notice ?? null);
    setPendingSourceAction(options?.pendingAction ?? null);
    setSourceForm(source ? hydrateSourceFormFromSource(source) : defaultSourceForm);
    setSourceCreationOpen(true);
  }, []);

  const openOpportunityEditor = React.useCallback((opportunity: EventOpportunity) => {
    setEditingOpportunityId(opportunity.id);
    setOpportunityEditForm(hydrateOpportunityEditForm(opportunity));
    setOpportunityEditOpen(true);
  }, []);

  const prefillOpportunityFromSource = React.useCallback((source: EventSource) => {
    setOpportunityForm((current) => ({
      ...current,
      captureMode: source.default_capture_mode ?? current.captureMode,
      sourceId: source.id,
      sourceUrl: source.url,
      importUrl: "",
      detectedLocation: "",
      detectedCategory: "",
    }));
  }, []);

  const handleOpenSource = React.useCallback((source: EventSource) => {
    ensureWorkingState(source);
    setActiveSourceId(source.id);
    window.open(source.url, "_blank", "noopener,noreferrer");
  }, [ensureWorkingState]);

  const handleOpenActiveSource = React.useCallback(() => {
    const source = activeSource ?? nextSource;
    if (!source) return;
    handleOpenSource(source);
  }, [activeSource, nextSource, handleOpenSource]);

  const handleSelectNextSource = React.useCallback(() => {
    if (!nextSource) return;
    ensureWorkingState(nextSource);
    setActiveSourceId(nextSource.id);
  }, [ensureWorkingState, nextSource]);

  const handleStartOpportunity = React.useCallback((source: EventSource) => {
    if (!sourceHasEntityLink(source)) {
      openSourceEditor({
        source,
        notice: "Relie cette source a un lieu ou un organisateur avant de capturer une opportunite.",
      });
      return;
    }

    ensureWorkingState(source);
    setActiveSourceId(source.id);
    prefillOpportunityFromSource(source);
    setTabletSection("work");
    focusCapturePanel();
  }, [ensureWorkingState, focusCapturePanel, openSourceEditor, prefillOpportunityFromSource]);

  const handleSelectSource = React.useCallback((source: EventSource) => {
    ensureWorkingState(source);
    setActiveSourceId(source.id);
    prefillOpportunityFromSource(source);
    setTabletSection("work");
  }, [ensureWorkingState, prefillOpportunityFromSource]);

  const handleSelectSourceByArrow = React.useCallback((direction: "up" | "down") => {
    if (filteredSources.length === 0) return;
    const currentIndex = activeSourceId
      ? filteredSources.findIndex((source) => source.id === activeSourceId)
      : -1;
    const fallbackIndex = direction === "down" ? 0 : filteredSources.length - 1;
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : direction === "down"
          ? (currentIndex + 1) % filteredSources.length
          : (currentIndex - 1 + filteredSources.length) % filteredSources.length;
    const nextSource = filteredSources[nextIndex];
    if (nextSource) {
      handleSelectSource(nextSource);
    }
  }, [activeSourceId, filteredSources, handleSelectSource]);

  async function createSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceName = sourceForm.name.trim();

    if (!sourceName || !sourceForm.url.trim()) {
      toast({
        title: "Source incomplete",
        description: "Ajoute au minimum un nom et une URL.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const frequency = Number(sourceForm.scanFrequencyDays) || 7;
    const now = new Date();
    const sourceBeingEdited = editingSourceId ? sourceById.get(editingSourceId) : null;
    const payload = {
      name: sourceBeingEdited?.source_scope === "owner" ? sourceBeingEdited.name : sourceName,
      type: sourceBeingEdited?.source_scope === "owner" ? sourceBeingEdited.type : sourceForm.type,
      default_capture_mode:
        sourceBeingEdited?.source_scope === "owner"
          ? sourceBeingEdited.default_capture_mode
          : sourceForm.defaultCaptureMode,
      source_scope: sourceBeingEdited?.source_scope ?? ("global" as const),
      url: sourceBeingEdited?.source_scope === "owner" ? sourceBeingEdited.url : sourceForm.url.trim(),
      organizer_id: sourceBeingEdited?.organizer_id ?? null,
      organizer_location_id: sourceBeingEdited?.organizer_location_id ?? null,
      priority: sourceForm.priority,
      scan_frequency_days: Math.max(1, frequency),
      category_hint: sourceForm.categoryHint.trim() || null,
      city_hint: sourceForm.cityHint.trim() || null,
      notes: sourceForm.notes.trim() || null,
    };

    const { error } = editingSourceId
      ? await supabase
          .from("event_sources")
          .update({
            ...payload,
            next_scan_at: sourceBeingEdited?.next_scan_at ?? now.toISOString(),
          })
          .eq("id", editingSourceId)
      : await supabase.from("event_sources").insert({
          ...payload,
          next_scan_at: now.toISOString(),
          created_by: userData.user?.id ?? null,
        });

    setSaving(false);

    if (error) {
      toast({ title: "Source non creee", description: error.message, variant: "destructive" });
      return;
    }

    setSourceForm(defaultSourceForm);
    setEditingSourceId(null);
    setSourceSheetMode("create");
    setSourceCreationOpen(false);
    toast({
      title: editingSourceId ? "Source mise a jour" : "Source ajoutee",
      description: editingSourceId
        ? pendingSourceAction
          ? "La source est maintenant exploitable dans la collecte."
          : "Les modifications de la source ont ete enregistrees."
        : "Elle rejoint immediatement la collecte.",
    });
    await loadData();

    const pendingAction = pendingSourceAction;
    setPendingSourceAction(null);
    setSourceSheetNotice(null);

    if (pendingAction?.type === "scan") {
      const source = sources.find((item) => item.id === pendingAction.sourceId);
      if (source) {
        const updatedSource: EventSource = {
          ...source,
          ...payload,
          scan_frequency_days: payload.scan_frequency_days,
          priority: payload.priority,
        };
        await markSourceScanned(updatedSource);
      }
    } else if (pendingAction?.type === "reset-scan") {
      const source = sources.find((item) => item.id === pendingAction.sourceId);
      if (source) {
        const updatedSource: EventSource = {
          ...source,
          ...payload,
          scan_frequency_days: payload.scan_frequency_days,
          priority: payload.priority,
        };
        await resetSourceScan(updatedSource);
      }
    } else if (pendingAction?.type === "status") {
      const source = sources.find((item) => item.id === pendingAction.sourceId);
      if (source) {
        const updatedSource: EventSource = {
          ...source,
          ...payload,
          scan_frequency_days: payload.scan_frequency_days,
          priority: payload.priority,
        };
        await updateSourceStatus(updatedSource, pendingAction.status);
      }
    }
  }

  const processOpportunityInBackground = React.useCallback(async (args: {
    source?: EventSource;
    formSnapshot: OpportunityFormState;
  }) => {
    const source = args.source;
    const formSnapshot = args.formSnapshot;
    const captureMode = formSnapshot.captureMode;
    const manualMissingFields = parseMissingFields(formSnapshot.missingFields);
    let importResult: Awaited<ReturnType<typeof importOpportunityFromCapture>> = null;

    try {
      importResult = await importOpportunityFromCapture({
        form: formSnapshot,
        source,
        context: {
          categories,
          locations,
          organizers,
        },
        findOrCreateTagIds: findOrCreateTagIdsForImport,
      });
    } catch (error) {
      toast({
        title: "Import impossible",
        description: error instanceof Error ? error.message : "Une erreur est survenue.",
        variant: "destructive",
      });
      return;
    }

    const rawTitle =
      importResult?.rawTitle ||
      formSnapshot.rawTitle.trim() ||
      `Import ${captureMode} a qualifier`;
    const detectedDate = importResult?.detectedDate || formSnapshot.detectedDate;
    const detectedLocation =
      importResult?.detectedLocation || formSnapshot.detectedLocation.trim() || source?.city_hint || null;
    const detectedCategory =
      importResult?.detectedCategory || formSnapshot.detectedCategory.trim() || source?.category_hint || null;
    const missingFields = Array.from(
      new Set([
        ...manualMissingFields,
        ...(importResult?.missingFields || []),
        ...(rawTitle === "Evenement a creer" || rawTitle.endsWith("a qualifier") ? ["titre"] : []),
      ]),
    );
    const confidenceScore = importResult?.confidenceScore ?? Math.max(0, Math.min(100, Number(formSnapshot.confidenceScore) || 50));
    const detectedDateIso = toDatetimeIso(detectedDate);
    if (detectedDateIso) {
      const detectedDateValue = new Date(detectedDateIso);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (!Number.isNaN(detectedDateValue.getTime()) && detectedDateValue < todayStart) {
        toast({
          title: "Opportunite ignoree",
          description: "Date passee: aucune nouvelle opportunite n'est creee dans la pipeline.",
          variant: "destructive",
        });
        return;
      }
    }
    const { data: userData } = await supabase.auth.getUser();

    const { data: insertedOpportunity, error } = await supabase
      .from("event_opportunities")
      .insert({
        source_id: source?.id ?? null,
        source_url: importResult?.sourceUrl || formSnapshot.sourceUrl.trim() || source?.url || null,
        raw_title: rawTitle,
        detected_date: detectedDateIso,
        detected_location: detectedLocation,
        detected_category: detectedCategory,
        missing_fields: missingFields,
        status: missingFields.length > 0 ? "needs_info" : "ready_to_create",
        confidence_score: confidenceScore,
        priority_score: computePriorityScore({
          source,
          detectedDate,
          missingFields,
          confidenceScore,
        }),
        notes: importResult?.notes || formSnapshot.notes.trim() || null,
        capture_mode: captureMode,
        import_payload: importResult?.importPayload ?? null,
        import_warnings: importResult?.importWarnings ?? [],
        import_metadata: importResult?.importMetadata ?? null,
        assigned_to: userData.user?.id ?? null,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "Opportunite non creee", description: error.message, variant: "destructive" });
      return;
    }

    if (source) {
      await supabase
        .from("event_sources")
        .update({
          discovery_count: source.discovery_count + 1,
          last_found_at: new Date().toISOString(),
        })
        .eq("id", source.id);
      if (insertedOpportunity?.id) {
        attachOpportunityToScanContext(source.id, insertedOpportunity.id);
      }
    }

    toast({
      title: importResult ? "Evenement importe dans le pipeline" : "Evenement repere",
      description: "Il est maintenant dans le pipeline de traitement.",
    });
    await loadData();
  }, [
    attachOpportunityToScanContext,
    categories,
    findOrCreateTagIdsForImport,
    loadData,
    locations,
    organizers,
  ]);

  function createOpportunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const source =
      opportunityForm.sourceId && opportunityForm.sourceId !== "none"
        ? sourceById.get(opportunityForm.sourceId)
        : undefined;
    if (source) {
      ensureWorkingState(source);
    }

    const formSnapshot: OpportunityFormState = {
      ...opportunityForm,
      imageFile: opportunityForm.imageFile,
    };

    setOpportunityForm(
      source
        ? {
            ...defaultOpportunityForm,
            captureMode:
              source.default_capture_mode === "image" || source.default_capture_mode === "facebook"
                ? source.default_capture_mode
                : "url",
            sourceId: source.id,
            sourceUrl: source.url,
            importUrl: "",
            detectedLocation: "",
            detectedCategory: "",
          }
        : defaultOpportunityForm,
    );
    setCaptureAdvancedOpen(false);

    toast({ title: "Import lance", description: "Le traitement continue en arriere-plan." });

    void processOpportunityInBackground({ source, formSnapshot });
  }

  const writeScanLog = React.useCallback(async (input: {
    source: EventSource;
    action: EventSourceScanLog["action"];
    startedAt?: string | null;
    endedAt?: string | null;
    durationSeconds?: number | null;
    previousNextScanAt?: string | null;
    nextScanAt?: string | null;
    previousScanCount?: number | null;
    scanCount?: number | null;
    opportunitiesFound?: number;
    notes?: string | null;
  }) => {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("event_source_scan_logs")
      .insert({
        source_id: input.source.id,
        action: input.action,
        session_key: sessionKey ?? null,
        scanned_at: input.endedAt ?? input.startedAt ?? new Date().toISOString(),
        started_at: input.startedAt ?? null,
        ended_at: input.endedAt ?? null,
        duration_seconds: input.durationSeconds ?? null,
        previous_next_scan_at: input.previousNextScanAt ?? null,
        next_scan_at: input.nextScanAt ?? null,
        previous_scan_count: input.previousScanCount ?? null,
        scan_count: input.scanCount ?? null,
        opportunities_found: input.opportunitiesFound ?? 0,
        notes: input.notes ?? null,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return null;
    return data?.id ?? null;
  }, [sessionKey]);

  const markSourceScanned = React.useCallback(async (source: EventSource) => {
    if (!sourceHasEntityLink(source)) {
      openSourceEditor({
        source,
        notice: "Cette source doit etre reliee a un lieu ou un organisateur avant de pouvoir etre scannee.",
        pendingAction: { type: "scan", sourceId: source.id },
      });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const scanContext = scanContexts[source.id];
    const startedAt = scanContext?.startedAt ?? nowIso;
    const durationSeconds = Math.max(
      0,
      Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000),
    );
    const opportunityIds = scanContext?.opportunityIds ?? [];
    const nextScanAt = addDays(now, source.scan_frequency_days).toISOString();
    const fallbackNextSource = getNextSourceInQueue(actionableSources, source.id);
    const fallbackNext = fallbackNextSource?.id ?? null;
    const averageScanMinutes = computeAverageScanMinutes({
      currentAverageMinutes: source.average_scan_minutes,
      currentScanCount: source.scan_count,
      latestDurationSeconds: durationSeconds,
    });
    const noveltyScore = computeSourceNoveltyScore({
      scanCount: source.scan_count + 1,
      discoveryCount: source.discovery_count,
      averageScanMinutes,
      lastFoundAt: opportunityIds.length > 0 ? nowIso : source.last_found_at,
    });

    const { error } = await supabase
      .from("event_sources")
      .update({
        last_scanned_at: nowIso,
        next_scan_at: nextScanAt,
        scan_count: source.scan_count + 1,
        average_scan_minutes: averageScanMinutes,
        novelty_score: noveltyScore,
      })
      .eq("id", source.id);

    if (error) {
      toast({ title: "Scan non enregistre", description: error.message, variant: "destructive" });
      return;
    }

    await writeScanLog({
      source,
      action: "scanned",
      startedAt,
      endedAt: nowIso,
      durationSeconds,
      previousNextScanAt: source.next_scan_at,
      nextScanAt,
      previousScanCount: source.scan_count,
      scanCount: source.scan_count + 1,
      opportunitiesFound: opportunityIds.length,
      notes: "Source marquee scannee.",
    });
    // La colonne source_scan_log_id n'est pas garantie sur tous les environnements.
    // On garde le scan log, sans forcer le lien direct opportunite->log.
    clearScanContext(source.id);
    if (fallbackNextSource) {
      ensureScanContext(fallbackNextSource.id, nowIso);
    }
    setRecentlyScannedSourceIds((current) => [source.id, ...current.filter((id) => id !== source.id)].slice(0, 6));
    setActiveSourceId(fallbackNext);
    toast(
      fallbackNextSource
        ? { title: "Source scannee", description: `${source.name} est replanifiee.` }
        : { title: "Source scannee", description: "La file prioritaire est vide pour le moment." },
    );
    await loadData();
  }, [
    actionableSources,
    clearScanContext,
    ensureScanContext,
    loadData,
    openSourceEditor,
    scanContexts,
    writeScanLog,
  ]);

  const resetSourceScan = React.useCallback(async (source: EventSource) => {
    if (!sourceHasEntityLink(source)) {
      openSourceEditor({
        source,
        notice: "Cette source doit etre reliee a un lieu ou un organisateur avant de pouvoir reinitialiser son scan.",
        pendingAction: { type: "reset-scan", sourceId: source.id },
      });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const scanContext = scanContexts[source.id];
    const startedAt = scanContext?.startedAt ?? nowIso;
    const durationSeconds = Math.max(
      0,
      Math.round((now.getTime() - new Date(startedAt).getTime()) / 1000),
    );
    const { error } = await supabase
      .from("event_sources")
      .update({
        last_scanned_at: null,
        next_scan_at: nowIso,
        scan_count: Math.max(0, source.scan_count - 1),
      })
      .eq("id", source.id);

    if (error) {
      toast({ title: "Scan non reinitialise", description: error.message, variant: "destructive" });
      return;
    }

    await writeScanLog({
      source,
      action: "reset_scan",
      startedAt,
      endedAt: nowIso,
      durationSeconds,
      previousNextScanAt: source.next_scan_at,
      nextScanAt: nowIso,
      previousScanCount: source.scan_count,
      scanCount: Math.max(0, source.scan_count - 1),
      opportunitiesFound: scanContext?.opportunityIds.length ?? 0,
      notes: "Scan reinitialise.",
    });
    clearScanContext(source.id);
    ensureScanContext(source.id, nowIso);
    setSourceFilter("due");
    setActiveSourceId(source.id);
    setRecentlyScannedSourceIds((current) => current.filter((id) => id !== source.id));
    toast({ title: "Source remise a scanner", description: `${source.name} revient dans la file.` });
    await loadData();
  }, [clearScanContext, ensureScanContext, loadData, openSourceEditor, scanContexts, writeScanLog]);

  async function updateSourceStatus(source: EventSource, status: SourceStatus) {
    if (!sourceHasEntityLink(source)) {
      openSourceEditor({
        source,
        notice: "Relie cette source a un lieu ou un organisateur avant de changer son statut.",
        pendingAction: { type: "status", sourceId: source.id, status },
      });
      return;
    }

    const { error } = await supabase.from("event_sources").update({ status }).eq("id", source.id);

    if (error) {
      toast({ title: "Statut non modifie", description: error.message, variant: "destructive" });
      return;
    }

    await writeScanLog({
      source,
      action: "status_change",
      startedAt: scanContexts[source.id]?.startedAt ?? null,
      endedAt: new Date().toISOString(),
      durationSeconds: null,
      previousNextScanAt: source.next_scan_at,
      nextScanAt: source.next_scan_at,
      previousScanCount: source.scan_count,
      scanCount: source.scan_count,
      notes: `Statut source: ${getSourceStatusLabel(status)}.`,
    });

    if (status !== "active") {
      clearScanContext(source.id);
    }

    if (activeSourceId === source.id && status !== "active") {
      setActiveSourceId(null);
    }

    if (status !== "active") {
      setRecentlyScannedSourceIds((current) => current.filter((id) => id !== source.id));
    }

    toast({
      title: "Statut source mis a jour",
      description: `${source.name} est maintenant ${getSourceStatusLabel(status)}.`,
    });
    await loadData();
  }

  async function applySourceSuggestion(source: EventSource) {
    const suggestion = getSourcePrioritySuggestion(source);
    if (!suggestion.differs) return;

    const { error } = await supabase
      .from("event_sources")
      .update({
        priority: suggestion.priority,
        scan_frequency_days: suggestion.scanFrequencyDays,
      })
      .eq("id", source.id);

    if (error) {
      toast({ title: "Suggestion non appliquee", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Suggestion appliquee",
      description: `${source.name}: ${suggestion.label}.`,
    });
    await loadData();
  }

  async function deleteSource(source: EventSource) {
    if (!source.is_editable) {
      toast({
        title: "Source synchronisee",
        description: "Seules les sources globales peuvent etre supprimees manuellement.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Supprimer la source "${source.name}" ? Cette action est irreversible.`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from("event_sources").delete().eq("id", source.id);
    if (error) {
      toast({
        title: "Suppression impossible",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    clearScanContext(source.id);
    setRecentlyScannedSourceIds((current) => current.filter((id) => id !== source.id));
    if (activeSourceId === source.id) {
      setActiveSourceId(null);
    }

    toast({ title: "Source supprimee", description: `${source.name} a ete retiree.` });
    await loadData();
  }

  React.useEffect(() => {
    keyboardContextRef.current = { activeSource, nextSource };
  }, [activeSource, nextSource]);

  React.useEffect(() => {
    keyboardActionsRef.current = {
      openSource: handleOpenActiveSource,
      startOpportunity: handleStartOpportunity,
      scanSource: markSourceScanned,
      nextSource: handleSelectNextSource,
      previousListSource: () => handleSelectSourceByArrow("up"),
      nextListSource: () => handleSelectSourceByArrow("down"),
    };
  }, [handleOpenActiveSource, handleSelectNextSource, handleSelectSourceByArrow, handleStartOpportunity, markSourceScanned]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const tagName = target.tagName;
      const isTypingContext =
        target.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT";

      if (isTypingContext || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        keyboardActionsRef.current.openSource();
      } else if (key === "f") {
        event.preventDefault();
        const source = keyboardContextRef.current.activeSource ?? keyboardContextRef.current.nextSource;
        if (source) keyboardActionsRef.current.startOpportunity(source);
      } else if (key === "s") {
        event.preventDefault();
        const source = keyboardContextRef.current.activeSource ?? keyboardContextRef.current.nextSource;
        if (source) void keyboardActionsRef.current.scanSource(source);
      } else if (key === "n") {
        event.preventDefault();
        keyboardActionsRef.current.nextSource();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        keyboardActionsRef.current.previousListSource();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        keyboardActionsRef.current.nextListSource();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function updateOpportunityStatus(opportunity: EventOpportunity, status: OpportunityStatus) {
    const { error } = await supabase
      .from("event_opportunities")
      .update({ status })
      .eq("id", opportunity.id);

    if (error) {
      toast({ title: "Statut non modifie", description: error.message, variant: "destructive" });
      return;
    }

    await loadData();
  }

  async function updateOpportunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOpportunityId) return;

    if (!opportunityEditForm.rawTitle.trim()) {
      toast({
        title: "Opportunite incomplete",
        description: "Ajoute au minimum un titre.",
        variant: "destructive",
      });
      return;
    }

    const source = opportunityEditForm.sourceId
      ? sourceById.get(opportunityEditForm.sourceId)
      : undefined;
    const missingFields = parseMissingFields(opportunityEditForm.missingFields);
    const confidenceScore = Math.max(
      0,
      Math.min(100, Number(opportunityEditForm.confidenceScore) || 50),
    );

    setSaving(true);
    const { error } = await supabase
      .from("event_opportunities")
      .update({
        source_id: source?.id ?? null,
        source_url: opportunityEditForm.sourceUrl.trim() || source?.url || null,
        raw_title: opportunityEditForm.rawTitle.trim(),
        detected_date: toDatetimeIso(opportunityEditForm.detectedDate),
        detected_location: opportunityEditForm.detectedLocation.trim() || null,
        detected_category: opportunityEditForm.detectedCategory.trim() || null,
        missing_fields: missingFields,
        status: opportunityEditForm.status,
        confidence_score: confidenceScore,
        priority_score: computePriorityScore({
          source,
          detectedDate: opportunityEditForm.detectedDate,
          missingFields,
          confidenceScore,
        }),
        notes: opportunityEditForm.notes.trim() || null,
        decision_reason: opportunityEditForm.decisionReason.trim() || null,
      })
      .eq("id", editingOpportunityId);
    setSaving(false);

    if (error) {
      toast({ title: "Opportunite non modifiee", description: error.message, variant: "destructive" });
      return;
    }

    setOpportunityEditOpen(false);
    setEditingOpportunityId(null);
    setOpportunityEditForm(defaultOpportunityEditForm);
    toast({ title: "Opportunite mise a jour" });
    await loadData();
  }

  async function markOpportunityDuplicate(
    opportunity: EventOpportunity,
    duplicate?: IntakeDuplicateCandidate | null,
  ) {
    const { error } = await supabase
      .from("event_opportunities")
      .update({
        status: "duplicate",
        duplicate_event_id: duplicate?.eventId ?? opportunity.duplicate_event_id ?? null,
        decision_reason: duplicate
          ? `Doublon probable: ${duplicate.title}`
          : "Marque comme doublon depuis la collecte.",
      })
      .eq("id", opportunity.id);

    if (error) {
      toast({ title: "Doublon non enregistre", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Opportunite marquee doublon" });
    await loadData();
  }

  async function archiveOpportunity(
    opportunity: EventOpportunity,
    status: Extract<OpportunityStatus, "archived" | "out_of_scope">,
  ) {
    const { error } = await supabase
      .from("event_opportunities")
      .update({
        status,
        decision_reason:
          status === "out_of_scope"
            ? "Archive comme hors scope depuis la collecte."
            : "Archive proprement depuis la collecte.",
      })
      .eq("id", opportunity.id);

    if (error) {
      toast({ title: "Archivage impossible", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: status === "out_of_scope" ? "Opportunite hors scope" : "Opportunite archivee",
    });
    await loadData();
  }

  function createEventFromOpportunity(opportunity: EventOpportunity) {
    const source = opportunity.source_id ? sourceById.get(opportunity.source_id) : undefined;
    const payload = buildIntakeEventPrefillPayload(opportunity, source);
    setEventFormEvent(null);
    setEventFormPrefill(
      buildEventFormPrefillFromIntakePayload({
        payload,
        categories: categories.map((category) => ({ id: category.id, name: category.name })),
      }),
    );
    setEventFormOpportunityId(opportunity.id);
    setEventFormOpen(true);
  }

  const openExistingEventEditorFromPipeline = React.useCallback(
    async (eventId: string) => {
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
        .eq("id", eventId)
        .single();

      if (error || !data) {
        toast({
          title: "Edition impossible",
          description: error?.message || "Evenement introuvable.",
          variant: "destructive",
        });
        return;
      }

      setEventFormEvent(data as AdminEvent);
      setEventFormPrefill(undefined);
      setEventFormOpportunityId(null);
      setEventFormOpen(true);
    },
    [],
  );

  async function openLinkedEntityEditorFromSource(source: EventSource) {
    if (source.organizer_id) {
      const { data, error } = await supabase
        .from("organizers")
        .select("*")
        .eq("id", source.organizer_id)
        .single();
      if (error || !data) {
        toast({
          title: "Edition impossible",
          description: error?.message || "Organisateur introuvable.",
          variant: "destructive",
        });
        return;
      }
      setEditingOrganizerEntity({ ...(data as AdminOrganizer), type: "organizer" });
      setOrganizerDialogOpen(true);
      return;
    }
    if (source.organizer_location_id) {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("id", source.organizer_location_id)
        .single();
      if (error || !data) {
        toast({
          title: "Edition impossible",
          description: error?.message || "Lieu-organisateur introuvable.",
          variant: "destructive",
        });
        return;
      }
      setEditingLocationEntity(data as AdminLocation);
      setLocationDialogOpen(true);
      return;
    }
    toast({
      title: "Aucun organisateur lie",
      description: "Cette source n'est pas reliee a un organisateur ou lieu organisateur.",
      variant: "destructive",
    });
  }

  async function copyToClipboard(value: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Lien copie" });
  }

  if (initialLoading) {
    return (
      <div className="space-y-4">
        <Card className="h-28 animate-pulse bg-muted/30" />
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <Card className="h-[520px] animate-pulse bg-muted/30" />
          <div className="space-y-4">
            <Card className="h-64 animate-pulse bg-muted/30" />
            <Card className="h-[360px] animate-pulse bg-muted/30" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ManagementHero
        icon={<ListChecks className="h-5 w-5" />}
        title="Collecte"
        description="Poste de veille source-first pour scanner, capturer et transformer les opportunités en événements."
      >
        <ManagementStatGrid>
          <ManagementStat label="Sources" value={sources.length} hint="Référentiel actif" />
          <ManagementStat label="À scanner" value={metrics.dueSources} hint="Session courante" />
          <ManagementStat label="En retard" value={metrics.lateSources} hint="Priorité ops" />
          <ManagementStat label="Opportunités" value={opportunities.length} hint="Pipeline" />
        </ManagementStatGrid>
      </ManagementHero>

      <IntakeReportingPanel
        currentSession={currentSessionSummary}
        recentSessions={sessionSummaries}
        onExport={exportSessionSummary}
      />

      <IntakeToolbar
        metrics={metrics}
        nextSource={nextSource}
        activeSource={activeSource}
        onOpenSourceCreation={() => openSourceEditor()}
      />

      <div className="xl:hidden">
        <Card className="rounded-2xl border-border/70 bg-background/80 p-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={tabletSection === "sources" ? "default" : "outline"}
              onClick={() => setTabletSection("sources")}
            >
              Sources
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tabletSection === "work" ? "default" : "outline"}
              onClick={() => setTabletSection("work")}
            >
              Traitement
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:hidden">
        {tabletSection === "sources" ? (
          <SourceQueue
            sources={filteredSources}
            activeSourceId={activeSourceId}
            sourceFilter={sourceFilter}
            recentlyScannedSourceIds={recentlyScannedSourceIds}
            onFilterChange={setSourceFilter}
            onSelectSource={handleSelectSource}
            onOpenSource={handleOpenSource}
            onEditSource={(source) => openSourceEditor({ source })}
            onEditLinkedEntity={(source) => void openLinkedEntityEditorFromSource(source)}
          />
        ) : null}

        {tabletSection === "work" ? (
          <section className="grid gap-3 md:grid-cols-2 md:items-start">
            <div className="space-y-3">
              <SourceCockpit
                activeSource={activeSource}
                nextSource={nextSource}
                recentlyScanned={Boolean(cockpitSourceId && recentlyScannedSourceIds.includes(cockpitSourceId))}
                suggestion={sourceSuggestion}
                onApplySuggestion={(source) => void applySourceSuggestion(source)}
                onEditSource={(source) => openSourceEditor({ source })}
                onOpenSource={handleOpenSource}
                onMarkScanned={(source) => void markSourceScanned(source)}
                onResetScan={(source) => void resetSourceScan(source)}
                onDeleteSource={(source) => void deleteSource(source)}
                onEditLinkedEntity={(source) => void openLinkedEntityEditorFromSource(source)}
                onSelectNextSource={handleSelectNextSource}
                onStatusChange={(source, status) => void updateSourceStatus(source, status)}
              />

              <div ref={capturePanelRef}>
                <CapturePanel
                  activeSource={activeSource}
                  sourceById={sourceById}
                  sources={sources}
                  form={opportunityForm}
                  categoryOptions={categoryOptions}
                  detectedLocationOptions={detectedLocationOptions}
                  saving={saving}
                  open={captureAdvancedOpen}
                  onOpenChange={setCaptureAdvancedOpen}
                  onFormChange={setOpportunityForm}
                  onSubmit={createOpportunity}
                />
              </div>
            </div>

            <OpportunityQueue
              opportunities={filteredOpportunities}
              filter={opportunityFilter}
              counts={{
                active: activeOpportunities.length,
                ready: metrics.ready,
                needsInfo: metrics.needsInfo,
              }}
              activeSource={activeSource}
              activeSourceProgress={activeSourceOpportunityProgress}
              activeSourceExistingEvents={activeSourceExistingEvents}
              onFilterChange={setOpportunityFilter}
              sourceById={sourceById}
              duplicateByOpportunityId={duplicateByOpportunityId}
              onCopyOpportunity={(opportunity) => void copyToClipboard(opportunity.source_url)}
              onCreateEvent={createEventFromOpportunity}
              onEditOpportunity={openOpportunityEditor}
              onArchiveOpportunity={(opportunity, status) => void archiveOpportunity(opportunity, status)}
              onMarkDuplicate={(opportunity, duplicate) =>
                void markOpportunityDuplicate(opportunity, duplicate)
              }
              onStatusChange={(opportunity, status) => void updateOpportunityStatus(opportunity, status)}
              onEditExistingEvent={(eventId) => void openExistingEventEditorFromPipeline(eventId)}
            />
          </section>
        ) : null}
      </div>

      <div className="hidden xl:grid xl:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)_minmax(360px,0.95fr)] xl:items-start xl:gap-4">
        <aside className="min-w-0 xl:sticky xl:top-32">
          <SourceQueue
            sources={filteredSources}
            activeSourceId={activeSourceId}
            sourceFilter={sourceFilter}
            recentlyScannedSourceIds={recentlyScannedSourceIds}
            onFilterChange={setSourceFilter}
            onSelectSource={handleSelectSource}
            onOpenSource={handleOpenSource}
            onEditSource={(source) => openSourceEditor({ source })}
            onEditLinkedEntity={(source) => void openLinkedEntityEditorFromSource(source)}
          />
        </aside>

        <section className="min-w-0 space-y-3">
          <SourceCockpit
            activeSource={activeSource}
            nextSource={nextSource}
            recentlyScanned={Boolean(cockpitSourceId && recentlyScannedSourceIds.includes(cockpitSourceId))}
            suggestion={sourceSuggestion}
            onApplySuggestion={(source) => void applySourceSuggestion(source)}
            onEditSource={(source) => openSourceEditor({ source })}
            onOpenSource={handleOpenSource}
            onMarkScanned={(source) => void markSourceScanned(source)}
            onResetScan={(source) => void resetSourceScan(source)}
            onDeleteSource={(source) => void deleteSource(source)}
            onEditLinkedEntity={(source) => void openLinkedEntityEditorFromSource(source)}
            onSelectNextSource={handleSelectNextSource}
            onStatusChange={(source, status) => void updateSourceStatus(source, status)}
          />

          <div ref={capturePanelRef}>
            <CapturePanel
              activeSource={activeSource}
              sourceById={sourceById}
              sources={sources}
              form={opportunityForm}
              categoryOptions={categoryOptions}
              detectedLocationOptions={detectedLocationOptions}
              saving={saving}
              open={captureAdvancedOpen}
              onOpenChange={setCaptureAdvancedOpen}
              onFormChange={setOpportunityForm}
              onSubmit={createOpportunity}
            />
          </div>
        </section>

        <aside className="min-w-0 xl:sticky xl:top-32">
          <OpportunityQueue
            opportunities={filteredOpportunities}
            filter={opportunityFilter}
            counts={{
              active: activeOpportunities.length,
              ready: metrics.ready,
              needsInfo: metrics.needsInfo,
            }}
            activeSource={activeSource}
            activeSourceProgress={activeSourceOpportunityProgress}
            activeSourceExistingEvents={activeSourceExistingEvents}
            onFilterChange={setOpportunityFilter}
            sourceById={sourceById}
            duplicateByOpportunityId={duplicateByOpportunityId}
            onCopyOpportunity={(opportunity) => void copyToClipboard(opportunity.source_url)}
            onCreateEvent={createEventFromOpportunity}
            onEditOpportunity={openOpportunityEditor}
            onArchiveOpportunity={(opportunity, status) => void archiveOpportunity(opportunity, status)}
            onMarkDuplicate={(opportunity, duplicate) =>
              void markOpportunityDuplicate(opportunity, duplicate)
            }
            onStatusChange={(opportunity, status) => void updateOpportunityStatus(opportunity, status)}
            onEditExistingEvent={(eventId) => void openExistingEventEditorFromPipeline(eventId)}
          />
        </aside>
      </div>

      <SourceCreationSheet
        open={sourceCreationOpen}
        saving={saving}
        form={sourceForm}
        mode={sourceSheetMode}
        notice={sourceSheetNotice}
        sourceScope={editingSourceId ? sourceById.get(editingSourceId)?.source_scope ?? null : "global"}
        ownerName={
          editingSourceId
            ? (() => {
                const source = sourceById.get(editingSourceId);
                return source?.organizer?.name || source?.organizer_location?.name || null;
              })()
            : null
        }
        onOpenChange={(open) => {
          setSourceCreationOpen(open);
          if (!open) {
            setSourceSheetMode("create");
            setSourceSheetNotice(null);
            setEditingSourceId(null);
            setPendingSourceAction(null);
            setSourceForm(defaultSourceForm);
          }
        }}
        onFormChange={setSourceForm}
        onSubmit={createSource}
      />

      <OpportunityEditSheet
        open={opportunityEditOpen}
        saving={saving}
        form={opportunityEditForm}
        sourceOptions={sourceOptions}
        categoryOptions={categoryOptions}
        detectedLocationOptions={detectedLocationOptions}
        onOpenChange={(open) => {
          setOpportunityEditOpen(open);
          if (!open) {
            setEditingOpportunityId(null);
            setOpportunityEditForm(defaultOpportunityEditForm);
          }
        }}
        onFormChange={setOpportunityEditForm}
        onSubmit={updateOpportunity}
      />

      <OrganizerDialog
        organizer={editingOrganizerEntity}
        open={organizerDialogOpen}
        onOpenChange={(open) => {
          setOrganizerDialogOpen(open);
          if (!open) {
            setEditingOrganizerEntity(null);
          }
        }}
        onSuccess={() => void loadData()}
      />

      <LocationDialog
        location={editingLocationEntity}
        open={locationDialogOpen}
        onOpenChange={(open) => {
          setLocationDialogOpen(open);
          if (!open) {
            setEditingLocationEntity(null);
          }
        }}
        onSuccess={() => void loadData()}
      />

      <EventFormSheet
        event={eventFormEvent}
        open={eventFormOpen}
        onOpenChange={(open) => {
          setEventFormOpen(open);
          if (!open) {
            setEventFormEvent(null);
            setEventFormPrefill(undefined);
            setEventFormOpportunityId(null);
          }
        }}
        locations={eventFormLocations}
        organizers={eventFormOrganizers}
        artists={eventFormArtists}
        tags={eventFormTags}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        prefill={eventFormPrefill}
        blockPastCreation
        onTagCreated={() => void loadData()}
        onSaved={() => {
          const opportunityId = eventFormOpportunityId;
          if (!opportunityId) {
            void loadData();
            return;
          }
          void (async () => {
            const { error } = await supabase
              .from("event_opportunities")
              .update({
                status: "archived",
                decision_reason:
                  "Archive automatiquement apres creation de l'evenement depuis la pipeline.",
              })
              .eq("id", opportunityId);
            if (error) {
              toast({
                title: "Archivage automatique impossible",
                description: error.message,
                variant: "destructive",
              });
            } else {
              toast({ title: "Opportunite archivee automatiquement" });
            }
            setEventFormOpportunityId(null);
            await loadData();
          })();
        }}
        onDeleted={() => void loadData()}
      />
    </div>
  );
}
