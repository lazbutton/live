"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  AdminModerationReason,
  AdminRequestItem,
  AdminRequestLane,
  AdminRequestPeriodFilter,
  AdminRequestTypeFilter,
} from "@/lib/admin-requests";
import {
  countActionablePendingRequests,
  countRequestsByLane,
  fetchAdminRequestItems,
  filterAdminRequests,
  startOfLocalDay,
} from "@/lib/admin-requests";
import { RequestCard } from "./request-card";
import { RequestFiltersBar } from "./request-filters-bar";
import { RequestInspector } from "./request-inspector";
import { RequestLaneBoard } from "./request-lane-board";
import { RequestRejectDialog } from "./request-reject-dialog";
import type { DuplicateEvent, RequestBoardByLane } from "./request-types";
import { REQUEST_LANES } from "./request-ui";

function getDefaultLane(counts: Record<AdminRequestLane, number>): AdminRequestLane {
  for (const lane of REQUEST_LANES) {
    if (counts[lane] > 0) return lane;
  }
  return "ready";
}

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

  return [...new Set(values.map((value) => normalizeComparableUrl(value)).filter(Boolean))] as string[];
}

function buildRawUrlCandidates(item: AdminRequestItem) {
  const values = [
    item.sourceUrl,
    item.raw.source_url,
    item.raw.event_data?.external_url as string | null | undefined,
    item.raw.event_data?.scraping_url as string | null | undefined,
  ];

  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function buildAgendaUrl(item: AdminRequestItem) {
  if (!item.eventDate) return "/admin/events?view=agenda";
  const start = startOfLocalDay(new Date(item.eventDate)).toISOString().slice(0, 10);
  return `/admin/events?view=agenda&start=${start}`;
}

export function RequestsWorkspaceKanban() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  const [items, setItems] = React.useState<AdminRequestItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lane, setLane] = React.useState<AdminRequestLane>("ready");
  const [typeFilter, setTypeFilter] = React.useState<AdminRequestTypeFilter>("all");
  const [periodFilter, setPeriodFilter] = React.useState<AdminRequestPeriodFilter>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [internalNotesDraft, setInternalNotesDraft] = React.useState("");
  const [contributorMessageDraft, setContributorMessageDraft] = React.useState("");
  const [moderationReasonDraft, setModerationReasonDraft] =
    React.useState<AdminModerationReason | "">("");
  const [allowUserResubmissionDraft, setAllowUserResubmissionDraft] =
    React.useState(false);
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [duplicateEventsLoading, setDuplicateEventsLoading] = React.useState(false);
  const [duplicateEvents, setDuplicateEvents] = React.useState<DuplicateEvent[]>([]);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectInternalNotes, setRejectInternalNotes] = React.useState("");
  const [rejectContributorMessage, setRejectContributorMessage] = React.useState("");
  const [rejectModerationReason, setRejectModerationReason] =
    React.useState<AdminModerationReason | "">("");
  const [rejectAllowResubmission, setRejectAllowResubmission] = React.useState(true);
  const [rejectTarget, setRejectTarget] = React.useState<AdminRequestItem | null>(null);

  const appliedSearchSelectionRef = React.useRef<string | null>(null);

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

  const counts = React.useMemo(() => countRequestsByLane(items), [items]);
  const actionableCount = React.useMemo(
    () => countActionablePendingRequests(items),
    [items],
  );

  React.useEffect(() => {
    if (loading) return;
    if (counts[lane] > 0) return;
    setLane(getDefaultLane(counts));
  }, [counts, lane, loading]);

  const buildBoard = React.useCallback(
    (sourceItems: AdminRequestItem[]): RequestBoardByLane =>
      REQUEST_LANES.reduce((acc, entry) => {
        acc[entry] = filterAdminRequests(sourceItems, {
          lane: entry,
          query: searchQuery,
          typeFilter,
          periodFilter,
        });
        return acc;
      }, {} as RequestBoardByLane),
    [periodFilter, searchQuery, typeFilter],
  );

  const board = React.useMemo(() => buildBoard(items), [buildBoard, items]);
  const boardCounts = React.useMemo(
    () =>
      REQUEST_LANES.reduce<Record<AdminRequestLane, number>>((acc, entry) => {
        acc[entry] = board[entry].length;
        return acc;
      }, {
        ready: 0,
        to_process: 0,
        from_url: 0,
        blocked: 0,
        processed: 0,
      }),
    [board],
  );

  const activeLaneItems = board[lane];
  const activeItem = React.useMemo(
    () => activeLaneItems.find((item) => item.id === activeId) ?? null,
    [activeId, activeLaneItems],
  );

  React.useEffect(() => {
    const selectionKey = searchParams.toString();
    if (appliedSearchSelectionRef.current === selectionKey || items.length === 0) return;

    const requestedId = searchParams.get("request");
    const requestedLane = searchParams.get("lane");

    if (requestedId) {
      const target = items.find((item) => item.id === requestedId);
      if (target) {
        setLane(target.lane);
        setActiveId(target.id);
        if (isMobile) setDetailsOpen(true);
      }
    } else if (
      requestedLane &&
      REQUEST_LANES.includes(requestedLane as AdminRequestLane)
    ) {
      setLane(requestedLane as AdminRequestLane);
    }

    appliedSearchSelectionRef.current = selectionKey;
  }, [isMobile, items, searchParams]);

  React.useEffect(() => {
    if (activeLaneItems.length === 0) {
      setActiveId(null);
      if (isMobile) setDetailsOpen(false);
      return;
    }

    if (!activeId || !activeLaneItems.some((item) => item.id === activeId)) {
      const nextId = activeLaneItems[0]?.id ?? null;
      setActiveId(nextId);
    }
  }, [activeId, activeLaneItems, isMobile]);

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

  const similarRequests = React.useMemo(() => {
    if (!activeItem) return [];

    const activeUrlCandidates = buildUrlCandidates(activeItem);
    const activeDayKey =
      activeItem.eventDate && !Number.isNaN(new Date(activeItem.eventDate).getTime())
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
          new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime(),
      )
      .slice(0, 6);
  }, [activeItem, items]);

  const loadDuplicateEvents = React.useCallback(async (item: AdminRequestItem) => {
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

        if (byExternal.data) results.push(...(byExternal.data as DuplicateEvent[]));
        if (byScraping.data) results.push(...(byScraping.data as DuplicateEvent[]));
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
  }, []);

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

  const handleLaneChange = React.useCallback(
    (nextLane: AdminRequestLane) => {
      const nextActiveId = board[nextLane].some((item) => item.id === activeId)
        ? activeId
        : board[nextLane][0]?.id ?? null;

      setLane(nextLane);
      setActiveId(nextActiveId);
      syncParams({ lane: nextLane, request: nextActiveId });
    },
    [activeId, board, syncParams],
  );

  const openItem = React.useCallback(
    (item: AdminRequestItem) => {
      setLane(item.lane);
      setActiveId(item.id);
      syncParams({ lane: item.lane, request: item.id });
      if (isMobile) setDetailsOpen(true);
    },
    [isMobile, syncParams],
  );

  const openFullReview = React.useCallback(
    (item: AdminRequestItem) => {
      router.push(`/admin/requests/${item.id}/create-event`);
    },
    [router],
  );

  const openFullReviewWithPrefill = React.useCallback(
    (item: AdminRequestItem, mode: "url" | "facebook") => {
      router.push(`/admin/requests/${item.id}/create-event?prefill=${mode}`);
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
      previousLane: AdminRequestLane,
      previousIndex: number,
    ) => {
      const nextBoard = buildBoard(nextItems);
      const nextLaneItems = nextBoard[previousLane];
      const nextItem =
        nextLaneItems[previousIndex] ??
        nextLaneItems[Math.max(0, previousIndex - 1)] ??
        nextLaneItems[0] ??
        null;

      setLane(previousLane);
      setActiveId(nextItem?.id ?? null);
      syncParams({ lane: previousLane, request: nextItem?.id ?? null });

      if (isMobile) {
        setDetailsOpen(Boolean(nextItem));
      }
    },
    [buildBoard, isMobile, syncParams],
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
      const previousLane = item.lane;
      const previousIndex = board[previousLane].findIndex((entry) => entry.id === item.id);

      try {
        const { error } = await supabase.rpc("convert_event_request_to_event", {
          request_id: item.id,
        });

        if (error) throw error;

        const nextItems = await loadItems();
        selectNextItemAfterMutation(nextItems, previousLane, previousIndex);
        toast({ title: "Demande convertie", variant: "success" });
      } catch (error: any) {
        console.error("Erreur conversion rapide:", error);
        toast({
          title: "Conversion impossible",
          description:
            error?.message || "La demande doit être complétée avant conversion.",
          variant: "destructive",
        });
      } finally {
        setProcessingId(null);
      }
    },
    [board, loadItems, selectNextItemAfterMutation],
  );

  const requestReject = React.useCallback((item: AdminRequestItem) => {
    setRejectTarget(item);
    setRejectInternalNotes(item.internalNotes || item.notes || "");
    setRejectContributorMessage(item.contributorMessage || "");
    setRejectModerationReason(item.moderationReason || "");
    setRejectAllowResubmission(item.allowUserResubmission || true);
    setRejectOpen(true);
  }, []);

  const confirmReject = React.useCallback(async () => {
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
        description: "Ajoutez un message exploitable avant de rejeter la demande.",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(rejectTarget.id);
    const previousLane = rejectTarget.lane;
    const previousIndex = board[previousLane].findIndex(
      (item) => item.id === rejectTarget.id,
    );

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("user_requests")
        .update({
          status: "rejected",
          notes: rejectInternalNotes.trim() || null,
          internal_notes: rejectInternalNotes.trim() || null,
          moderation_reason: rejectModerationReason,
          contributor_message: contributorMessage,
          allow_user_resubmission: rejectAllowResubmission,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", rejectTarget.id);

      if (error) throw error;

      const nextItems = await loadItems();
      setRejectOpen(false);
      setRejectTarget(null);
      setRejectInternalNotes("");
      setRejectContributorMessage("");
      setRejectModerationReason("");
      setRejectAllowResubmission(true);
      selectNextItemAfterMutation(nextItems, previousLane, previousIndex);
      toast({ title: "Demande rejetée", variant: "success" });
    } catch (error) {
      console.error("Erreur rejet demande:", error);
      toast({
        title: "Rejet impossible",
        description: "La demande n'a pas pu être rejetée.",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  }, [
    board,
    loadItems,
    rejectAllowResubmission,
    rejectContributorMessage,
    rejectInternalNotes,
    rejectModerationReason,
    rejectTarget,
    selectNextItemAfterMutation,
  ]);

  const viewEvent = React.useCallback(
    (item: AdminRequestItem) => {
      router.push(buildAgendaUrl(item));
    },
    [router],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Demandes</CardTitle>
            <CardDescription>Chargement de la file active…</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[32rem] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RequestFiltersBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        periodFilter={periodFilter}
        onPeriodFilterChange={setPeriodFilter}
        activeLane={lane}
        onLaneChange={handleLaneChange}
        counts={boardCounts}
        actionableCount={actionableCount}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />

      <div
        className={
          isMobile
            ? "space-y-4"
            : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]"
        }
      >
        <RequestLaneBoard
          board={board}
          activeLane={lane}
          renderCard={(item) => (
            <RequestCard
              key={item.id}
              item={item}
              active={item.id === activeId}
              processingId={processingId}
              onOpen={openItem}
              onConvert={convertFast}
              onEdit={openFullReview}
              onReject={requestReject}
              onOpenUrl={openUrl}
            />
          )}
        />

        {!isMobile ? (
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
            onOpenRelatedRequest={openItem}
            onReject={requestReject}
            onViewEvent={viewEvent}
          />
        ) : null}
      </div>

      {isMobile ? (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
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
              onOpenRelatedRequest={openItem}
              onReject={requestReject}
              onViewEvent={viewEvent}
            />
          </SheetContent>
        </Sheet>
      ) : null}

      <RequestRejectDialog
        open={rejectOpen}
        target={rejectTarget}
        internalNotes={rejectInternalNotes}
        contributorMessage={rejectContributorMessage}
        moderationReason={rejectModerationReason}
        allowResubmission={rejectAllowResubmission}
        processing={processingId === rejectTarget?.id}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectTarget(null);
        }}
        onInternalNotesChange={setRejectInternalNotes}
        onContributorMessageChange={setRejectContributorMessage}
        onModerationReasonChange={setRejectModerationReason}
        onAllowResubmissionChange={setRejectAllowResubmission}
        onConfirm={() => void confirmReject()}
      />
    </div>
  );
}
