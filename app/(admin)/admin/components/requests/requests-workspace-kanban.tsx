"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import {
  buildRequestReviewUpdate,
  getDefaultContributorMessage,
  type AdminRequestReviewAction,
} from "@/lib/admin-request-review";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  AdminModerationReason,
  AdminRequestItem,
  AdminRequestLane,
  AdminRequestPeriodFilter,
  AdminRequestQueueFilter,
  AdminRequestTypeFilter,
  AdminRequestWorkspaceTab,
} from "@/lib/admin-requests";
import {
  countRequestsByLane,
  fetchAdminRequestItems,
  filterAdminRequests,
  flattenQueueSections,
  getQueueFilterFromLane,
  getRequestWorkspaceTab,
  groupUnifiedQueue,
  startOfLocalDay,
} from "@/lib/admin-requests";
import { RequestCard } from "./request-card";
import { RequestFiltersBar } from "./request-filters-bar";
import { RequestInspector } from "./request-inspector";
import {
  RequestQueueBoard,
  type RequestListSection,
} from "./request-queue-board";
import { RequestRejectDialog } from "./request-reject-dialog";
import { RequestShortcutsDialog } from "./request-shortcuts-dialog";
import type { DuplicateEvent } from "./request-types";
import { getLaneMeta, getQueueGroupMeta, REQUEST_LANES } from "./request-ui";
import { logAdminAction } from "@/lib/admin-audit-log";
import {
  ManagementHero,
  ManagementStat,
  ManagementStatGrid,
} from "../management-page-primitives";

function toLocalDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeComparableUrl(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return trimmed.toLowerCase();
  }
}

function buildUrlCandidates(item: AdminRequestItem) {
  const values = [
    item.sourceUrl,
    item.raw.source_url,
    item.raw.event_data?.external_url as string | null | undefined,
    item.raw.event_data?.scraping_url as string | null | undefined,
  ];

  return [
    ...new Set(
      values.map((value) => normalizeComparableUrl(value)).filter(Boolean),
    ),
  ] as string[];
}

function buildRawUrlCandidates(item: AdminRequestItem) {
  const values = [
    item.sourceUrl,
    item.raw.source_url,
    item.raw.event_data?.external_url as string | null | undefined,
    item.raw.event_data?.scraping_url as string | null | undefined,
  ];

  return [
    ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
}

function buildAgendaUrl(item: AdminRequestItem) {
  if (!item.eventDate) return "/admin/events?view=agenda";
  const start = startOfLocalDay(new Date(item.eventDate))
    .toISOString()
    .slice(0, 10);
  return `/admin/events?view=agenda&start=${start}`;
}

function queueFilterToLane(
  filter: AdminRequestQueueFilter,
): AdminRequestLane | null {
  switch (filter) {
    case "ready":
      return "ready";
    case "to_complete":
      return "to_process";
    case "from_url":
      return "from_url";
    case "all":
    default:
      return null;
  }
}

function tabToLaneParam(
  tab: AdminRequestWorkspaceTab,
  queueFilter: AdminRequestQueueFilter,
) {
  if (tab === "blocked") return "blocked";
  if (tab === "processed") return "processed";
  return queueFilterToLane(queueFilter);
}

function getDefaultTab(
  counts: Record<AdminRequestLane, number>,
): AdminRequestWorkspaceTab {
  if (counts.ready + counts.to_process + counts.from_url > 0) return "queue";
  if (counts.blocked > 0) return "blocked";
  if (counts.processed > 0) return "processed";
  return "queue";
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}

function getBoardCopy(
  tab: AdminRequestWorkspaceTab,
  queueFilter: AdminRequestQueueFilter,
) {
  if (tab === "blocked") {
    return {
      title: "Demandes bloquées",
      description:
        "Demandes passées ou à trancher sans polluer la file principale.",
      emptyTitle: "Aucune demande bloquée",
      emptyDescription:
        "Les cas obsolètes apparaîtront ici pour décision rapide.",
    };
  }

  if (tab === "processed") {
    return {
      title: "Demandes traitées",
      description:
        "Historique des conversions, refus et corrections demandées.",
      emptyTitle: "Aucune demande traitée",
      emptyDescription:
        "L’historique des décisions apparaîtra ici au fur et à mesure.",
    };
  }

  const suffix =
    queueFilter === "ready"
      ? "prêtes à convertir"
      : queueFilter === "to_complete"
        ? "à compléter"
        : queueFilter === "from_url"
          ? "depuis URL"
          : "priorisée";

  return {
    title: "File à traiter",
    description: `Vue ${suffix}, avec les urgences en haut.`,
    emptyTitle: "Aucune demande à traiter",
    emptyDescription: "La file est vide avec les filtres actuels.",
  };
}

export function RequestsWorkspaceKanban() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const [items, setItems] = React.useState<AdminRequestItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [tab, setTab] = React.useState<AdminRequestWorkspaceTab>("queue");
  const [queueFilter, setQueueFilter] =
    React.useState<AdminRequestQueueFilter>("all");
  const [typeFilter, setTypeFilter] =
    React.useState<AdminRequestTypeFilter>("all");
  const [periodFilter, setPeriodFilter] =
    React.useState<AdminRequestPeriodFilter>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [internalNotesDraft, setInternalNotesDraft] = React.useState("");
  const [contributorMessageDraft, setContributorMessageDraft] =
    React.useState("");
  const [moderationReasonDraft, setModerationReasonDraft] = React.useState<
    AdminModerationReason | ""
  >("");
  const [allowUserResubmissionDraft, setAllowUserResubmissionDraft] =
    React.useState(false);
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [duplicateEventsLoading, setDuplicateEventsLoading] =
    React.useState(false);
  const [duplicateEvents, setDuplicateEvents] = React.useState<
    DuplicateEvent[]
  >([]);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reviewAction, setReviewAction] =
    React.useState<AdminRequestReviewAction>("request_changes");
  const [rejectInternalNotes, setRejectInternalNotes] = React.useState("");
  const [rejectContributorMessage, setRejectContributorMessage] =
    React.useState("");
  const [rejectModerationReason, setRejectModerationReason] = React.useState<
    AdminModerationReason | ""
  >("");
  const [rejectTarget, setRejectTarget] =
    React.useState<AdminRequestItem | null>(null);

  const appliedSearchSelectionRef = React.useRef<string | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLDivElement>());

  const syncParams = React.useCallback(
    (next: { lane?: AdminRequestLane | null; request?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.lane !== undefined) {
        if (next.lane) params.set("lane", next.lane);
        else params.delete("lane");
      }

      if (next.request !== undefined) {
        if (next.request) params.set("request", next.request);
        else params.delete("request");
      }

      const query = params.toString();
      router.replace(query ? `/admin/requests?${query}` : "/admin/requests");
    },
    [router, searchParams],
  );

  const loadItems = React.useCallback(async () => {
    const nextItems = await fetchAdminRequestItems();
    setItems(nextItems);
    return nextItems;
  }, []);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const nextItems = await fetchAdminRequestItems();
        if (!mounted) return;
        setItems(nextItems);
      } catch (error) {
        console.error("Erreur chargement demandes:", error);
        if (!mounted) return;
        toast({
          title: "Demandes indisponibles",
          description: "Impossible de charger l'inbox pour le moment.",
          variant: "destructive",
        });
        setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const rawCounts = React.useMemo(() => countRequestsByLane(items), [items]);

  const laneCounts = React.useMemo(
    () =>
      REQUEST_LANES.reduce<Record<AdminRequestLane, number>>(
        (acc, lane) => {
          acc[lane] = filterAdminRequests(items, {
            lane,
            query: searchQuery,
            typeFilter,
            periodFilter,
          }).length;
          return acc;
        },
        {
          ready: 0,
          to_process: 0,
          from_url: 0,
          blocked: 0,
          processed: 0,
        },
      ),
    [items, periodFilter, searchQuery, typeFilter],
  );

  const actionableCount =
    laneCounts.ready + laneCounts.to_process + laneCounts.from_url;

  React.useEffect(() => {
    if (loading) return;
    if (items.length === 0) return;
    setTab((current) => {
      if (
        current === "queue" &&
        rawCounts.ready + rawCounts.to_process + rawCounts.from_url > 0
      ) {
        return current;
      }
      if (current === "blocked" && rawCounts.blocked > 0) return current;
      if (current === "processed" && rawCounts.processed > 0) return current;
      return getDefaultTab(rawCounts);
    });
  }, [items.length, loading, rawCounts]);

  const getVisibleItems = React.useCallback(
    (
      targetTab: AdminRequestWorkspaceTab,
      targetQueueFilter: AdminRequestQueueFilter,
      sourceItems: AdminRequestItem[] = items,
    ) => {
      if (targetTab === "queue") {
        return flattenQueueSections(
          groupUnifiedQueue(sourceItems, {
            query: searchQuery,
            typeFilter,
            periodFilter,
            queueFilter: targetQueueFilter,
          }),
        );
      }

      return filterAdminRequests(sourceItems, {
        lane: targetTab,
        query: searchQuery,
        typeFilter,
        periodFilter,
      });
    },
    [items, periodFilter, searchQuery, typeFilter],
  );

  const queueSections = React.useMemo(
    () =>
      groupUnifiedQueue(items, {
        query: searchQuery,
        typeFilter,
        periodFilter,
        queueFilter,
      }),
    [items, periodFilter, queueFilter, searchQuery, typeFilter],
  );
  const blockedItems = React.useMemo(
    () =>
      filterAdminRequests(items, {
        lane: "blocked",
        query: searchQuery,
        typeFilter,
        periodFilter,
      }),
    [items, periodFilter, searchQuery, typeFilter],
  );
  const processedItems = React.useMemo(
    () =>
      filterAdminRequests(items, {
        lane: "processed",
        query: searchQuery,
        typeFilter,
        periodFilter,
      }),
    [items, periodFilter, searchQuery, typeFilter],
  );

  const activeItems = React.useMemo(
    () =>
      tab === "queue"
        ? flattenQueueSections(queueSections)
        : tab === "blocked"
          ? blockedItems
          : processedItems,
    [blockedItems, processedItems, queueSections, tab],
  );
  const activeItem = React.useMemo(
    () => activeItems.find((item) => item.id === activeId) ?? null,
    [activeId, activeItems],
  );

  React.useEffect(() => {
    const selectionKey = searchParams.toString();
    if (
      appliedSearchSelectionRef.current === selectionKey ||
      items.length === 0
    )
      return;

    const requestedId = searchParams.get("request");
    const requestedLane = searchParams.get("lane");

    if (requestedId) {
      const target = items.find((item) => item.id === requestedId);
      if (target) {
        const nextTab = getRequestWorkspaceTab(target.lane);
        setTab(nextTab);
        setQueueFilter(
          nextTab === "queue" &&
            REQUEST_LANES.includes(requestedLane as AdminRequestLane)
            ? getQueueFilterFromLane(requestedLane as AdminRequestLane)
            : "all",
        );
        setActiveId(target.id);
        if (isMobile) setDetailsOpen(true);
      }
    } else if (
      requestedLane &&
      REQUEST_LANES.includes(requestedLane as AdminRequestLane)
    ) {
      const nextLane = requestedLane as AdminRequestLane;
      const nextTab = getRequestWorkspaceTab(nextLane);
      setTab(nextTab);
      setQueueFilter(
        nextTab === "queue" ? getQueueFilterFromLane(nextLane) : "all",
      );
    }

    appliedSearchSelectionRef.current = selectionKey;
  }, [isMobile, items, searchParams]);

  React.useEffect(() => {
    if (activeItems.length === 0) {
      setActiveId(null);
      if (isMobile) setDetailsOpen(false);
      return;
    }

    if (!activeId || !activeItems.some((item) => item.id === activeId)) {
      setActiveId(activeItems[0]?.id ?? null);
    }
  }, [activeId, activeItems, isMobile]);

  React.useEffect(() => {
    if (!activeId || isMobile) return;
    itemRefs.current.get(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId, isMobile, tab, queueFilter]);

  React.useEffect(() => {
    setInternalNotesDraft(activeItem?.internalNotes || activeItem?.notes || "");
    setContributorMessageDraft(activeItem?.contributorMessage || "");
    setModerationReasonDraft(activeItem?.moderationReason || "");
    setAllowUserResubmissionDraft(activeItem?.allowUserResubmission || false);
  }, [
    activeItem?.id,
    activeItem?.internalNotes,
    activeItem?.notes,
    activeItem?.contributorMessage,
    activeItem?.moderationReason,
    activeItem?.allowUserResubmission,
  ]);

  const boardSections = React.useMemo<RequestListSection[]>(() => {
    if (tab === "queue") {
      return queueSections.map((section) => {
        const meta = getQueueGroupMeta(section.group);
        return {
          id: section.group,
          title: meta.title,
          description: meta.description,
          items: section.items,
          icon: meta.icon,
          accentClassName: meta.accentClassName,
          softClassName: meta.softClassName,
          borderClassName: meta.borderClassName,
        };
      });
    }

    const laneMeta = getLaneMeta(tab);
    const itemsForTab = tab === "blocked" ? blockedItems : processedItems;
    return [
      {
        id: tab,
        title: laneMeta.title,
        description: laneMeta.description,
        items: itemsForTab,
        icon: laneMeta.icon,
        accentClassName: laneMeta.accentClassName,
        softClassName: laneMeta.softClassName,
        borderClassName: laneMeta.borderClassName,
      },
    ];
  }, [blockedItems, processedItems, queueSections, tab]);

  const boardCopy = React.useMemo(
    () => getBoardCopy(tab, queueFilter),
    [queueFilter, tab],
  );

  const similarRequests = React.useMemo(() => {
    if (!activeItem) return [];

    const activeUrlCandidates = buildUrlCandidates(activeItem);
    const activeDayKey =
      activeItem.eventDate &&
      !Number.isNaN(new Date(activeItem.eventDate).getTime())
        ? toLocalDayKey(startOfLocalDay(new Date(activeItem.eventDate)))
        : null;
    const normalizedActiveTitle = activeItem.title.trim().toLowerCase();

    return items
      .filter((item) => item.id !== activeItem.id)
      .filter((item) => {
        const otherUrlCandidates = buildUrlCandidates(item);
        const hasMatchingUrl = otherUrlCandidates.some((candidate) =>
          activeUrlCandidates.includes(candidate),
        );

        const hasMatchingTitleAndDay =
          Boolean(activeDayKey) &&
          Boolean(item.eventDate) &&
          !Number.isNaN(new Date(item.eventDate as string).getTime()) &&
          toLocalDayKey(startOfLocalDay(new Date(item.eventDate as string))) ===
            activeDayKey &&
          item.title.trim().toLowerCase() === normalizedActiveTitle;

        return hasMatchingUrl || hasMatchingTitleAndDay;
      })
      .sort(
        (left, right) =>
          new Date(right.requestedAt).getTime() -
          new Date(left.requestedAt).getTime(),
      )
      .slice(0, 6);
  }, [activeItem, items]);

  const loadDuplicateEvents = React.useCallback(
    async (item: AdminRequestItem) => {
      const urlCandidates = buildRawUrlCandidates(item);
      const title = item.raw.event_data?.title || item.title || "";
      const dateIso = item.eventDate || item.raw.event_data?.date || "";

      setDuplicateEventsLoading(true);
      try {
        const results: DuplicateEvent[] = [];

        for (const candidate of urlCandidates.slice(0, 3)) {
          const [byExternal, byScraping] = await Promise.all([
            supabase
              .from("events")
              .select("id,title,date,external_url,scraping_url")
              .eq("external_url", candidate)
              .limit(10),
            supabase
              .from("events")
              .select("id,title,date,external_url,scraping_url")
              .eq("scraping_url", candidate)
              .limit(10),
          ]);

          if (byExternal.data)
            results.push(...(byExternal.data as DuplicateEvent[]));
          if (byScraping.data)
            results.push(...(byScraping.data as DuplicateEvent[]));
        }

        if (title && dateIso && !Number.isNaN(new Date(dateIso).getTime())) {
          const dayStart = startOfLocalDay(new Date(dateIso));
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          const byTitleAndDay = await supabase
            .from("events")
            .select("id,title,date,external_url,scraping_url")
            .gte("date", dayStart.toISOString())
            .lt("date", dayEnd.toISOString())
            .ilike("title", `%${title.slice(0, 60)}%`)
            .limit(10);

          if (byTitleAndDay.data) {
            results.push(...(byTitleAndDay.data as DuplicateEvent[]));
          }
        }

        const unique = new Map<string, DuplicateEvent>();
        results.forEach((entry) => {
          if (entry?.id) unique.set(entry.id, entry);
        });
        setDuplicateEvents(Array.from(unique.values()));
      } catch (error) {
        console.error("Erreur doublons événements:", error);
        setDuplicateEvents([]);
      } finally {
        setDuplicateEventsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!activeItem) {
      setDuplicateEvents([]);
      setDuplicateEventsLoading(false);
      return;
    }

    if (!isMobile || detailsOpen) {
      void loadDuplicateEvents(activeItem);
    }
  }, [activeItem, detailsOpen, isMobile, loadDuplicateEvents]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadItems();
      toast({ title: "Inbox rafraîchie", variant: "success" });
    } catch (error) {
      console.error("Erreur refresh demandes:", error);
      toast({
        title: "Rafraîchissement impossible",
        description: "Réessaie dans un instant.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  }, [loadItems]);

  const selectFirstInView = React.useCallback(
    (
      nextTab: AdminRequestWorkspaceTab,
      nextQueueFilter: AdminRequestQueueFilter,
    ) => {
      const nextItems = getVisibleItems(nextTab, nextQueueFilter);
      const nextItem = nextItems[0] ?? null;
      setActiveId(nextItem?.id ?? null);
      syncParams({
        lane: nextItem?.lane ?? tabToLaneParam(nextTab, nextQueueFilter),
        request: nextItem?.id ?? null,
      });
      if (isMobile) setDetailsOpen(Boolean(nextItem));
    },
    [getVisibleItems, isMobile, syncParams],
  );

  const handleTabChange = React.useCallback(
    (nextTab: AdminRequestWorkspaceTab) => {
      const nextQueueFilter = nextTab === "queue" ? queueFilter : "all";
      setTab(nextTab);
      if (nextTab !== "queue") setQueueFilter("all");
      selectFirstInView(nextTab, nextQueueFilter);
    },
    [queueFilter, selectFirstInView],
  );

  const handleQueueFilterChange = React.useCallback(
    (nextFilter: AdminRequestQueueFilter) => {
      setTab("queue");
      setQueueFilter(nextFilter);
      selectFirstInView("queue", nextFilter);
    },
    [selectFirstInView],
  );

  const openItem = React.useCallback(
    (item: AdminRequestItem) => {
      const nextTab = getRequestWorkspaceTab(item.lane);
      const canKeepQueueFilter =
        nextTab === "queue" &&
        getVisibleItems("queue", queueFilter).some(
          (entry) => entry.id === item.id,
        );
      const nextQueueFilter = canKeepQueueFilter ? queueFilter : "all";

      setTab(nextTab);
      setQueueFilter(nextTab === "queue" ? nextQueueFilter : "all");
      setActiveId(item.id);
      syncParams({ lane: item.lane, request: item.id });
      if (isMobile) setDetailsOpen(true);
    },
    [getVisibleItems, isMobile, queueFilter, syncParams],
  );

  const openFullReview = React.useCallback(
    (item: AdminRequestItem) => {
      router.push(`/admin/events?request_id=${item.id}`);
    },
    [router],
  );

  const openFullReviewWithPrefill = React.useCallback(
    (item: AdminRequestItem, mode: "url" | "facebook") => {
      router.push(`/admin/events?request_id=${item.id}&prefill=${mode}`);
    },
    [router],
  );

  const openUrl = React.useCallback(
    (url: string) => {
      if (url.startsWith("/")) {
        router.push(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [router],
  );

  const copyText = React.useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copié dans le presse-papiers", variant: "success" });
    } catch {
      toast({
        title: "Copie impossible",
        description: "Le presse-papiers n'est pas disponible.",
        variant: "destructive",
      });
    }
  }, []);

  const selectNextItemAfterMutation = React.useCallback(
    (
      nextItems: AdminRequestItem[],
      previousTab: AdminRequestWorkspaceTab,
      previousQueueFilter: AdminRequestQueueFilter,
      previousIndex: number,
    ) => {
      const nextVisibleItems = getVisibleItems(
        previousTab,
        previousQueueFilter,
        nextItems,
      );
      const nextItem =
        nextVisibleItems[previousIndex] ??
        nextVisibleItems[Math.max(0, previousIndex - 1)] ??
        nextVisibleItems[0] ??
        null;

      setTab(previousTab);
      setQueueFilter(previousTab === "queue" ? previousQueueFilter : "all");
      setActiveId(nextItem?.id ?? null);
      syncParams({
        lane:
          nextItem?.lane ?? tabToLaneParam(previousTab, previousQueueFilter),
        request: nextItem?.id ?? null,
      });

      if (isMobile) {
        setDetailsOpen(Boolean(nextItem));
      }
    },
    [getVisibleItems, isMobile, syncParams],
  );

  const saveNotes = React.useCallback(async () => {
    if (!activeItem) return;

    setSavingNotes(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("user_requests")
        .update({
          notes: internalNotesDraft.trim() || null,
          internal_notes: internalNotesDraft.trim() || null,
          moderation_reason: moderationReasonDraft || null,
          contributor_message: contributorMessageDraft.trim() || null,
          allow_user_resubmission: allowUserResubmissionDraft,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", activeItem.id);

      if (error) throw error;

      const nextItems = await loadItems();
      setItems(nextItems);
      setActiveId(activeItem.id);
      toast({ title: "Notes enregistrées", variant: "success" });
    } catch (error) {
      console.error("Erreur sauvegarde notes:", error);
      toast({
        title: "Enregistrement impossible",
        description: "Les notes n'ont pas pu être sauvegardées.",
        variant: "destructive",
      });
    } finally {
      setSavingNotes(false);
    }
  }, [
    activeItem,
    allowUserResubmissionDraft,
    contributorMessageDraft,
    internalNotesDraft,
    loadItems,
    moderationReasonDraft,
  ]);

  const convertFast = React.useCallback(
    async (item: AdminRequestItem) => {
      setProcessingId(item.id);
      const previousTab = tab;
      const previousQueueFilter = queueFilter;
      const previousIndex = activeItems.findIndex(
        (entry) => entry.id === item.id,
      );

      try {
        const { error } = await supabase.rpc("convert_event_request_to_event", {
          request_id: item.id,
        });

        if (error) throw error;

        await logAdminAction({
          action: "request.convert",
          entityType: "request",
          entityId: item.id,
          entityLabel: item.title,
          metadata: {
            request_type: item.requestType,
            source_kind: item.sourceKind,
          },
        });

        const nextItems = await loadItems();
        selectNextItemAfterMutation(
          nextItems,
          previousTab,
          previousQueueFilter,
          previousIndex,
        );
        toast({ title: "Demande convertie", variant: "success" });
      } catch (error: any) {
        console.error("Erreur conversion rapide:", error);
        toast({
          title: "Conversion impossible",
          description:
            error?.message ||
            "La demande doit être complétée avant conversion.",
          variant: "destructive",
        });
      } finally {
        setProcessingId(null);
      }
    },
    [activeItems, loadItems, queueFilter, selectNextItemAfterMutation, tab],
  );

  const requestReview = React.useCallback(
    (item: AdminRequestItem, action: AdminRequestReviewAction) => {
      setRejectTarget(item);
      setReviewAction(action);
      setRejectInternalNotes(item.internalNotes || item.notes || "");
      setRejectContributorMessage(
        item.contributorMessage ||
          (item.moderationReason
            ? getDefaultContributorMessage(action, item.moderationReason)
            : ""),
      );
      setRejectModerationReason(item.moderationReason || "");
      setRejectOpen(true);
    },
    [],
  );

  const requestChanges = React.useCallback(
    (item: AdminRequestItem) => requestReview(item, "request_changes"),
    [requestReview],
  );

  const requestReject = React.useCallback(
    (item: AdminRequestItem) => requestReview(item, "reject"),
    [requestReview],
  );

  const confirmReview = React.useCallback(async () => {
    if (!rejectTarget) return;

    const contributorMessage = rejectContributorMessage.trim();
    if (!rejectModerationReason) {
      toast({
        title: "Motif structuré obligatoire",
        description: "Choisissez un motif clair pour aider le contributeur.",
        variant: "destructive",
      });
      return;
    }

    if (!contributorMessage) {
      toast({
        title: "Message contributeur obligatoire",
        description:
          "Ajoutez un message exploitable avant de traiter la demande.",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(rejectTarget.id);
    const previousTab = tab;
    const previousQueueFilter = queueFilter;
    const previousIndex = activeItems.findIndex(
      (item) => item.id === rejectTarget.id,
    );

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const update = buildRequestReviewUpdate({
        action: reviewAction,
        reviewedBy: user?.id || null,
        internalNotes: rejectInternalNotes,
        moderationReason: rejectModerationReason,
        contributorMessage,
      });

      const { error } = await supabase
        .from("user_requests")
        .update(update)
        .eq("id", rejectTarget.id);

      if (error) throw error;

      await logAdminAction({
        action:
          reviewAction === "request_changes"
            ? "request.request_changes"
            : "request.reject",
        entityType: "request",
        entityId: rejectTarget.id,
        entityLabel: rejectTarget.title,
        metadata: {
          moderation_reason: rejectModerationReason,
          allow_user_resubmission: update.allow_user_resubmission,
        },
      });

      const nextItems = await loadItems();
      setRejectOpen(false);
      setRejectTarget(null);
      setRejectInternalNotes("");
      setRejectContributorMessage("");
      setRejectModerationReason("");
      selectNextItemAfterMutation(
        nextItems,
        previousTab,
        previousQueueFilter,
        previousIndex,
      );
      toast({
        title:
          reviewAction === "request_changes"
            ? "Correction demandée"
            : "Demande refusée",
        variant: "success",
      });
    } catch (error) {
      console.error("Erreur décision demande:", error);
      toast({
        title: "Décision impossible",
        description: "La demande n'a pas pu être traitée.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  }, [
    activeItems,
    loadItems,
    queueFilter,
    rejectContributorMessage,
    rejectInternalNotes,
    rejectModerationReason,
    rejectTarget,
    reviewAction,
    selectNextItemAfterMutation,
    tab,
  ]);

  const viewEvent = React.useCallback(
    (item: AdminRequestItem) => {
      router.push(buildAgendaUrl(item));
    },
    [router],
  );

  const getItemRef = React.useCallback(
    (itemId: string) => (node: HTMLDivElement | null) => {
      if (node) itemRefs.current.set(itemId, node);
      else itemRefs.current.delete(itemId);
    },
    [],
  );

  React.useEffect(() => {
    if (isMobile || shortcutsOpen || rejectOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (!activeItem) return;

      if (key === "arrowdown" || key === "j") {
        event.preventDefault();
        const index = activeItems.findIndex(
          (item) => item.id === activeItem.id,
        );
        const nextItem =
          activeItems[Math.min(activeItems.length - 1, index + 1)];
        if (nextItem) {
          setActiveId(nextItem.id);
          syncParams({ lane: nextItem.lane, request: nextItem.id });
        }
        return;
      }

      if (key === "arrowup" || key === "k") {
        event.preventDefault();
        const index = activeItems.findIndex(
          (item) => item.id === activeItem.id,
        );
        const nextItem = activeItems[Math.max(0, index - 1)];
        if (nextItem) {
          setActiveId(nextItem.id);
          syncParams({ lane: nextItem.lane, request: nextItem.id });
        }
        return;
      }

      if (
        key === "c" &&
        activeItem.isFastConvertible &&
        activeItem.status === "pending"
      ) {
        event.preventDefault();
        void convertFast(activeItem);
        return;
      }

      if (key === "e" && activeItem.status === "pending") {
        event.preventDefault();
        openFullReview(activeItem);
        return;
      }

      if (key === "r" && activeItem.status === "pending") {
        event.preventDefault();
        requestReject(activeItem);
        return;
      }

      if (
        key === "x" &&
        activeItem.status === "pending" &&
        !activeItem.isFastConvertible
      ) {
        event.preventDefault();
        requestChanges(activeItem);
        return;
      }

      if (key === "o" && activeItem.sourceUrl) {
        event.preventDefault();
        openUrl(activeItem.sourceUrl);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeItem,
    activeItems,
    convertFast,
    isMobile,
    openFullReview,
    openUrl,
    rejectOpen,
    requestChanges,
    requestReject,
    shortcutsOpen,
    syncParams,
  ]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Demandes</CardTitle>
            <CardDescription>Chargement de la file active…</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[32rem] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <ManagementHero
        icon={<Inbox className="h-5 w-5" />}
        title="Demandes"
        description="File unifiée pour convertir, compléter ou modérer les contributions utilisateurs."
      >
        <ManagementStatGrid className="xl:grid-cols-4">
          <ManagementStat label="Actionnables" value={actionableCount} hint="À traiter" />
          <ManagementStat label="Prêtes" value={laneCounts.ready} hint="Conversion rapide" />
          <ManagementStat label="Bloquées" value={laneCounts.blocked} hint="À trancher" />
          <ManagementStat label="Traitées" value={laneCounts.processed} hint="Historique" />
        </ManagementStatGrid>
      </ManagementHero>

      <RequestFiltersBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        periodFilter={periodFilter}
        onPeriodFilterChange={setPeriodFilter}
        activeTab={tab}
        onTabChange={handleTabChange}
        queueFilter={queueFilter}
        onQueueFilterChange={handleQueueFilterChange}
        counts={laneCounts}
        actionableCount={actionableCount}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />

      <div
        className={
          isMobile
            ? "space-y-4"
            : "grid min-h-0 flex-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]"
        }
      >
        <RequestQueueBoard
          sections={boardSections}
          title={boardCopy.title}
          description={boardCopy.description}
          emptyTitle={boardCopy.emptyTitle}
          emptyDescription={boardCopy.emptyDescription}
          className={!isMobile ? "min-h-0" : undefined}
          getItemRef={getItemRef}
          renderCard={(item) => (
            <RequestCard
              key={item.id}
              item={item}
              active={item.id === activeId}
              processingId={processingId}
              onOpen={openItem}
              onConvert={convertFast}
              onEdit={openFullReview}
              onRequestChanges={requestChanges}
              onReject={requestReject}
              onOpenUrl={openUrl}
            />
          )}
        />

        {!isMobile ? (
          <div className="min-h-0">
            <RequestInspector
              item={activeItem}
              duplicateEvents={duplicateEvents}
              duplicateEventsLoading={duplicateEventsLoading}
              similarRequests={similarRequests}
              internalNotesDraft={internalNotesDraft}
              contributorMessageDraft={contributorMessageDraft}
              moderationReasonDraft={moderationReasonDraft}
              allowUserResubmissionDraft={allowUserResubmissionDraft}
              savingNotes={savingNotes}
              processingId={processingId}
              panelMode
              onInternalNotesChange={setInternalNotesDraft}
              onContributorMessageChange={setContributorMessageDraft}
              onModerationReasonChange={setModerationReasonDraft}
              onAllowUserResubmissionChange={setAllowUserResubmissionDraft}
              onSaveNotes={() => void saveNotes()}
              onOpenUrl={openUrl}
              onCopy={(value) => void copyText(value)}
              onConvert={(item) => void convertFast(item)}
              onEdit={openFullReview}
              onEditWithPrefill={openFullReviewWithPrefill}
              onRequestChanges={requestChanges}
              onOpenRelatedRequest={openItem}
              onReject={requestReject}
              onViewEvent={viewEvent}
            />
          </div>
        ) : null}
      </div>

      {isMobile ? (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent
            side="right"
            className="w-full overflow-y-auto sm:max-w-2xl"
          >
            <SheetHeader className="mb-6">
              <SheetTitle>Détail de la demande</SheetTitle>
              <SheetDescription>
                Traite la demande sans quitter la file active.
              </SheetDescription>
            </SheetHeader>

            <RequestInspector
              item={activeItem}
              duplicateEvents={duplicateEvents}
              duplicateEventsLoading={duplicateEventsLoading}
              similarRequests={similarRequests}
              internalNotesDraft={internalNotesDraft}
              contributorMessageDraft={contributorMessageDraft}
              moderationReasonDraft={moderationReasonDraft}
              allowUserResubmissionDraft={allowUserResubmissionDraft}
              savingNotes={savingNotes}
              processingId={processingId}
              onInternalNotesChange={setInternalNotesDraft}
              onContributorMessageChange={setContributorMessageDraft}
              onModerationReasonChange={setModerationReasonDraft}
              onAllowUserResubmissionChange={setAllowUserResubmissionDraft}
              onSaveNotes={() => void saveNotes()}
              onOpenUrl={openUrl}
              onCopy={(value) => void copyText(value)}
              onConvert={(item) => void convertFast(item)}
              onEdit={openFullReview}
              onEditWithPrefill={openFullReviewWithPrefill}
              onRequestChanges={requestChanges}
              onOpenRelatedRequest={openItem}
              onReject={requestReject}
              onViewEvent={viewEvent}
            />
          </SheetContent>
        </Sheet>
      ) : null}

      <RequestRejectDialog
        open={rejectOpen}
        action={reviewAction}
        target={rejectTarget}
        internalNotes={rejectInternalNotes}
        contributorMessage={rejectContributorMessage}
        moderationReason={rejectModerationReason}
        processing={processingId === rejectTarget?.id}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectTarget(null);
        }}
        onInternalNotesChange={setRejectInternalNotes}
        onContributorMessageChange={setRejectContributorMessage}
        onModerationReasonChange={setRejectModerationReason}
        onConfirm={() => void confirmReview()}
      />

      <RequestShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}
