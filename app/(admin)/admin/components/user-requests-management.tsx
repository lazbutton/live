"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateWithoutTimezone } from "@/lib/date-utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  ChevronLeft,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  FileSearch,
  Loader2,
  Pencil,
  Search,
  ThumbsDown,
  Wand2,
  X,
} from "lucide-react";

type RequestType = "event_creation" | "event_from_url";

type RequestStatus = "pending" | "approved" | "rejected" | "converted";

type RequestStatusTab = "pending" | "converted" | "rejected" | "all";

type RequestTypeFilter = "all" | RequestType;

type PeriodFilter = "all" | "24h" | "7d" | "30d";

type SortMode = "newest" | "oldest" | "event_date_asc";

interface UserRequest {
  id: string;
  requested_at: string;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;

  request_type?: RequestType;
  requested_by?: string | null;

  source_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;

  converted_event_id?: string | null;
  converted_at?: string | null;

  event_data?: {
    title?: string;
    description?: string;
    date?: string;
    end_date?: string;
    category?: string;
    location_id?: string;
    location_name?: string;
    organizer_id?: string;
    organizer_names?: string[];
    price?: number;
    address?: string;
    capacity?: number;
    image_url?: string;
    door_opening_time?: string;
    external_url?: string;
    external_url_label?: string;
    scraping_url?: string;
    [key: string]: unknown;
  };
}

type DuplicateEvent = {
  id: string;
  title: string;
  date: string;
  external_url: string | null;
  scraping_url: string | null;
};

function toLocalDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function safeDomainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatAgeShort(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";

  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function getRequestTitle(r: UserRequest) {
  return r.event_data?.title || (r.source_url ? safeDomainFromUrl(r.source_url) : "(sans titre)");
}

function getRequestTypeLabel(r: UserRequest) {
  return r.request_type === "event_from_url" ? "URL" : "Complet";
}

function isRequestConvertibleFast(r: UserRequest) {
  if (r.status !== "pending") return false;
  if (r.request_type !== "event_creation") return false;
  const ed = r.event_data || {};
  return Boolean(ed.title && ed.date && ed.category);
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    approved: "default",
    pending: "secondary",
    rejected: "destructive",
    converted: "outline",
  };

  const labels: Record<string, string> = {
    approved: "Approuvé",
    pending: "À traiter",
    rejected: "Rejeté",
    converted: "Converti",
  };

  return <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>;
}

function RequestDetailsBody({
  request,
  duplicates,
  duplicatesLoading,
  notes,
  setNotes,
  savingNotes,
  onSaveNotes,
  onCopy,
  onOpenUrl,
  onEdit,
  onReject,
  onFastConvert,
  onViewEvent,
}: {
  request: UserRequest;
  duplicates: DuplicateEvent[];
  duplicatesLoading: boolean;
  notes: string;
  setNotes: (v: string) => void;
  savingNotes: boolean;
  onSaveNotes: () => void;
  onCopy: (text: string) => void;
  onOpenUrl: (url: string) => void;
  onEdit: () => void;
  onReject: () => void;
  onFastConvert: () => void;
  onViewEvent: () => void;
}) {
  const title = getRequestTitle(request);
  const isUrl = request.request_type === "event_from_url";
  const typeLabel = getRequestTypeLabel(request);
  const canFastConvert = isRequestConvertibleFast(request);

  const eventDate = request.event_data?.date || null;
  const category = request.event_data?.category || null;
  const locationLabel = request.location_name || request.event_data?.location_name || null;

  const url = request.source_url || request.event_data?.external_url || request.event_data?.scraping_url || null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold truncate">{title}</div>
            <div className="text-xs text-muted-foreground">
              {formatAgeShort(request.requested_at)} • {typeLabel}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={isUrl ? "outline" : "secondary"} className="text-xs">
              {typeLabel}
            </Badge>
            <StatusBadge status={request.status} />
          </div>
        </div>

        {url && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{url}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onCopy(url)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpenUrl(url)}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {request.status === "pending" && request.request_type === "event_creation" && (
          <Button type="button" variant="outline" size="sm" disabled={!canFastConvert} onClick={onFastConvert}>
            <Wand2 className="h-4 w-4 mr-2" />
            Convertir (fast)
          </Button>
        )}

        {request.status === "pending" && (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Éditer
          </Button>
        )}

        {request.status === "pending" && (
          <Button type="button" variant="destructive" size="sm" onClick={onReject}>
            <ThumbsDown className="h-4 w-4 mr-2" />
            Rejeter
          </Button>
        )}

        {request.status === "converted" && request.converted_event_id && (
          <Button type="button" variant="outline" size="sm" onClick={onViewEvent}>
            <Eye className="h-4 w-4 mr-2" />
            Voir dans Événements
          </Button>
        )}
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Date</div>
          <div className="text-sm font-medium">
            {eventDate ? formatDateWithoutTimezone(eventDate, "PPp") : "-"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Catégorie</div>
          <div className="text-sm font-medium">{category || "-"}</div>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <div className="text-xs text-muted-foreground">Lieu</div>
          <div className="text-sm font-medium">{locationLabel || "-"}</div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="text-sm font-medium">Doublons potentiels</div>
        {duplicatesLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Recherche…
          </div>
        ) : duplicates.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aucun doublon détecté.</div>
        ) : (
          <div className="space-y-2">
            {duplicates.map((e) => (
              <div key={e.id} className="rounded-lg border p-2">
                <div className="font-medium text-sm truncate">{e.title}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDateWithoutTimezone(e.date, "PPp")}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-1">
                  {e.external_url || e.scraping_url || ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Notes admin</div>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={onSaveNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes internes (raison de rejet, contexte, etc.)"
          rows={4}
        />
      </div>

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Données brutes</summary>
        <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">
{JSON.stringify(
  {
    request_type: request.request_type,
    status: request.status,
    requested_at: request.requested_at,
    source_url: request.source_url,
    location_name: request.location_name,
    converted_event_id: request.converted_event_id,
    event_data: request.event_data,
  },
  null,
  2
)}
        </pre>
      </details>
    </div>
  );
}

export function UserRequestsManagement() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [requests, setRequests] = React.useState<UserRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // Tabs & filters
  const [tab, setTab] = React.useState<RequestStatusTab>("pending");
  const [filterType, setFilterType] = React.useState<RequestTypeFilter>("all");
  const [filterPeriod, setFilterPeriod] = React.useState<PeriodFilter>("7d");
  const [sortMode, setSortMode] = React.useState<SortMode>("event_date_asc");
  const [searchQuery, setSearchQuery] = React.useState("");

  // Selection & details
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  // Reject sheet
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [isWorking, setIsWorking] = React.useState(false);
  const [singleLoadingId, setSingleLoadingId] = React.useState<string | null>(null);

  // Notes save
  const [notesDraft, setNotesDraft] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);

  // Duplicates
  const [duplicatesLoading, setDuplicatesLoading] = React.useState(false);
  const [duplicates, setDuplicates] = React.useState<DuplicateEvent[]>([]);

  // Indicateur doublon (liste) : même lieu + même jour de début
  const [locationDayEventCounts, setLocationDayEventCounts] = React.useState<Record<string, number>>({});
  const [locationDayCountsLoading, setLocationDayCountsLoading] = React.useState(false);

  const activeRequest = React.useMemo(() => requests.find((r) => r.id === activeId) || null, [requests, activeId]);

  const counts = React.useMemo(() => {
    const list = requests.filter((r) => r.request_type === "event_creation" || r.request_type === "event_from_url");
    return {
      pending: list.filter((r) => r.status === "pending").length,
      converted: list.filter((r) => r.status === "converted").length,
      rejected: list.filter((r) => r.status === "rejected").length,
      all: list.length,
    };
  }, [requests]);

  const filtered = React.useMemo(() => {
    let list = requests.filter((r) => r.request_type === "event_creation" || r.request_type === "event_from_url");

    // Filtrer les demandes avec dates passées
    const now = Date.now();
    list = list.filter((r) => {
      const eventDate = r.event_data?.date;
      if (!eventDate) return true; // Garder les demandes sans date
      const eventDateTimestamp = new Date(eventDate).getTime();
      if (Number.isNaN(eventDateTimestamp)) return true; // Garder si la date est invalide
      // Garder uniquement les événements futurs (date >= aujourd'hui à minuit)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return eventDateTimestamp >= todayStart.getTime();
    });

    if (tab !== "all") list = list.filter((r) => r.status === tab);

    if (filterType !== "all") list = list.filter((r) => r.request_type === filterType);

    if (filterPeriod !== "all") {
      const now = Date.now();
      const delta =
        filterPeriod === "24h"
          ? 24 * 3600 * 1000
          : filterPeriod === "7d"
            ? 7 * 24 * 3600 * 1000
            : 30 * 24 * 3600 * 1000;
      list = list.filter((r) => {
        const t = new Date(r.requested_at).getTime();
        return !Number.isNaN(t) && now - t <= delta;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const title = (r.event_data?.title || "").toLowerCase();
        const desc = (r.event_data?.description || "").toLowerCase();
        const url = (r.source_url || "").toLowerCase();
        const loc = (r.location_name || r.event_data?.location_name || "").toLowerCase();
        const cat = (r.event_data?.category || "").toLowerCase();
        return title.includes(q) || desc.includes(q) || url.includes(q) || loc.includes(q) || cat.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sortMode === "event_date_asc") {
        // Trier par date de début de l'événement (les plus proches en premier)
        const dateA = a.event_data?.date ? new Date(a.event_data.date).getTime() : null;
        const dateB = b.event_data?.date ? new Date(b.event_data.date).getTime() : null;
        
        // Si les deux ont une date, trier par ordre croissant
        if (dateA !== null && dateB !== null) {
          return dateA - dateB;
        }
        // Si seulement A a une date, A vient avant
        if (dateA !== null && dateB === null) {
          return -1;
        }
        // Si seulement B a une date, B vient avant
        if (dateA === null && dateB !== null) {
          return 1;
        }
        // Si aucune des deux n'a de date, garder l'ordre original (ou trier par requested_at)
        const ta = new Date(a.requested_at).getTime();
        const tb = new Date(b.requested_at).getTime();
        return tb - ta; // Plus récentes en premier pour celles sans date
      }
      
      // Tri par requested_at (comportement original)
      const ta = new Date(a.requested_at).getTime();
      const tb = new Date(b.requested_at).getTime();
      return sortMode === "newest" ? tb - ta : ta - tb;
    });

    return list;
  }, [requests, tab, filterType, filterPeriod, sortMode, searchQuery]);

  const [visibleCount, setVisibleCount] = React.useState(50);
  const visible = React.useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const selectedList = React.useMemo(() => filtered.filter((r) => selectedIds.has(r.id)), [filtered, selectedIds]);
  const selectedConvertible = React.useMemo(
    () => selectedList.filter((r) => isRequestConvertibleFast(r)),
    [selectedList]
  );

  const loadRequests = React.useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setRequests([]);
      return;
    }

    const { data, error } = await supabase
      .from("user_requests")
      .select(
        [
          "id",
          "request_type",
          "status",
          "requested_at",
          "requested_by",
          "reviewed_by",
          "reviewed_at",
          "notes",
          "event_data",
          "source_url",
          "location_id",
          "location_name",
          "converted_event_id",
          "converted_at",
        ].join(",")
      )
      .order("requested_at", { ascending: false });

    if (error) {
      console.error("Erreur Supabase (user_requests):", error);
      setRequests([]);
      return;
    }

    const allRequests = ((data || []) as unknown) as UserRequest[];

    // Supprimer automatiquement les demandes avec dates passées
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartTimestamp = todayStart.getTime();

    const requestsToDelete: string[] = [];
    const validRequests: UserRequest[] = [];

    for (const request of allRequests) {
      const eventDate = request.event_data?.date;
      if (eventDate) {
        const eventDateTimestamp = new Date(eventDate).getTime();
        if (!Number.isNaN(eventDateTimestamp) && eventDateTimestamp < todayStartTimestamp) {
          // Date passée : marquer pour suppression
          requestsToDelete.push(request.id);
          continue;
        }
      }
      validRequests.push(request);
    }

    // Supprimer les demandes avec dates passées
    if (requestsToDelete.length > 0) {
      console.log(`🗑️ Suppression automatique de ${requestsToDelete.length} demande(s) avec dates passées`);
      try {
        const { error: deleteError } = await supabase
          .from("user_requests")
          .delete()
          .in("id", requestsToDelete);
        
        if (deleteError) {
          console.error("Erreur lors de la suppression des demandes passées:", deleteError);
        }
      } catch (err) {
        console.error("Erreur lors de la suppression des demandes passées:", err);
      }
    }

    setRequests(validRequests);
  }, []);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadRequests();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadRequests]);

  React.useEffect(() => {
    setVisibleCount(50);
    setSelectedIds(new Set());
    setDetailsOpen(false);
    setDuplicates([]);
    setActiveId(null);
  }, [tab, filterType, filterPeriod, sortMode, searchQuery]);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadRequests();
    } finally {
      setRefreshing(false);
    }
  }, [loadRequests]);

  const openDetails = React.useCallback((id: string) => {
    setActiveId(id);
    setDetailsOpen(true);
  }, []);

  const openUrl = React.useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const copyText = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }, []);

  const editRequest = React.useCallback(
    (r: UserRequest) => {
      router.push(`/admin/requests/${r.id}/create-event`);
    },
    [router]
  );

  const viewEvent = React.useCallback(
    (r: UserRequest) => {
      const start = r.event_data?.date
        ? startOfLocalDay(new Date(r.event_data.date)).toISOString().slice(0, 10)
        : undefined;
      const url = start ? `/admin/events?view=agenda&start=${start}` : `/admin/events?view=agenda`;
      router.push(url);
    },
    [router]
  );

  const loadDuplicates = React.useCallback(async (r: UserRequest) => {
    const urlCandidates = [r.source_url, r.event_data?.external_url, r.event_data?.scraping_url].filter(Boolean) as string[];
    const title = r.event_data?.title || "";
    const dateIso = r.event_data?.date || "";

    setDuplicatesLoading(true);
    try {
      const results: DuplicateEvent[] = [];

      for (const u of urlCandidates.slice(0, 2)) {
        const q1 = await supabase
          .from("events")
          .select("id,title,date,external_url,scraping_url")
          .eq("external_url", u)
          .limit(10);
        if (q1.data) results.push(...(q1.data as DuplicateEvent[]));

        const q2 = await supabase
          .from("events")
          .select("id,title,date,external_url,scraping_url")
          .eq("scraping_url", u)
          .limit(10);
        if (q2.data) results.push(...(q2.data as DuplicateEvent[]));
      }

      if (title && dateIso) {
        const dayStart = startOfLocalDay(new Date(dateIso));
        const dayEnd = addDays(dayStart, 1);
        const q = await supabase
          .from("events")
          .select("id,title,date,external_url,scraping_url")
          .gte("date", dayStart.toISOString())
          .lt("date", dayEnd.toISOString())
          .ilike("title", `%${title.slice(0, 60)}%`)
          .limit(10);
        if (q.data) results.push(...(q.data as DuplicateEvent[]));
      }

      const uniq = new Map<string, DuplicateEvent>();
      results.forEach((e) => {
        if (e?.id) uniq.set(e.id, e);
      });
      setDuplicates(Array.from(uniq.values()));
    } catch (e) {
      console.error("Erreur doublons:", e);
      setDuplicates([]);
    } finally {
      setDuplicatesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!activeRequest) {
      setDuplicates([]);
      return;
    }

    if (detailsOpen || !isMobile) {
      loadDuplicates(activeRequest);
    }
  }, [activeRequest, detailsOpen, isMobile, loadDuplicates]);

  // Pré-calculer les doublons potentiels dans la liste (batch query)
  React.useEffect(() => {
    (async () => {
      // On ne fait le calcul que si on a des demandes visibles (souvent pending) avec lieu + date.
      const candidates = visible
        .filter((r) => r.status === "pending")
        .map((r) => {
          const locationId = r.location_id || (r.event_data?.location_id as string | undefined) || null;
          const dateIso = r.event_data?.date || null;
          if (!locationId || !dateIso) return null;
          const dayStart = startOfLocalDay(new Date(dateIso));
          if (Number.isNaN(dayStart.getTime())) return null;
          const dayKey = toLocalDayKey(dayStart);
          return { locationId, dayStart, dayKey };
        })
        .filter(Boolean) as Array<{ locationId: string; dayStart: Date; dayKey: string }>;

      if (candidates.length === 0) {
        setLocationDayEventCounts({});
        return;
      }

      const locationIds = Array.from(new Set(candidates.map((c) => c.locationId)));
      const dayStarts = candidates.map((c) => c.dayStart.getTime());
      const minDay = new Date(Math.min(...dayStarts));
      const maxDay = new Date(Math.max(...dayStarts));
      const rangeStart = startOfLocalDay(minDay);
      const rangeEnd = addDays(startOfLocalDay(maxDay), 1); // end exclusive

      setLocationDayCountsLoading(true);
      try {
        const { data, error } = await supabase
          .from("events")
          .select("id,date,location_id")
          .in("location_id", locationIds)
          .gte("date", rangeStart.toISOString())
          .lt("date", rangeEnd.toISOString())
          .limit(2000);

        if (error) throw error;

        const counts: Record<string, number> = {};
        (data || []).forEach((e: any) => {
          if (!e?.location_id || !e?.date) return;
          const key = `${e.location_id}__${toLocalDayKey(startOfLocalDay(new Date(e.date)))}`;
          counts[key] = (counts[key] || 0) + 1;
        });

        setLocationDayEventCounts(counts);
      } catch (e) {
        console.error("Erreur doublons liste (lieu+date):", e);
        setLocationDayEventCounts({});
      } finally {
        setLocationDayCountsLoading(false);
      }
    })();
  }, [visible]);

  React.useEffect(() => {
    setNotesDraft(activeRequest?.notes || "");
  }, [activeRequest?.id]);

  const saveNotes = React.useCallback(async () => {
    if (!activeRequest) return;

    setSavingNotes(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("user_requests")
        .update({
          notes: notesDraft || null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", activeRequest.id);

      if (error) throw error;
      await loadRequests();
    } catch (e) {
      console.error("Erreur notes:", e);
      alert("Impossible d'enregistrer les notes.");
    } finally {
      setSavingNotes(false);
    }
  }, [activeRequest, loadRequests, notesDraft]);

  const rejectRequests = React.useCallback(
    async (ids: string[], notes: string) => {
      setIsWorking(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        for (const id of ids) {
          await supabase
            .from("user_requests")
            .update({
              status: "rejected",
              reviewed_by: user?.id || null,
              reviewed_at: new Date().toISOString(),
              notes: notes || null,
            })
            .eq("id", id);
        }

        await loadRequests();
        setSelectedIds(new Set());
        setRejectOpen(false);
      } catch (e) {
        console.error("Erreur rejet:", e);
        alert("Impossible de rejeter la/les demande(s). ");
      } finally {
        setIsWorking(false);
      }
    },
    [loadRequests]
  );

  const convertFast = React.useCallback(
    async (ids: string[]) => {
      setIsWorking(true);
      try {
        for (const id of ids) {
          const { error } = await supabase.rpc("convert_event_request_to_event", { request_id: id });
          if (error) throw error;
        }
        await loadRequests();
        setSelectedIds(new Set());
      } catch (e) {
        console.error("Erreur conversion:", e);
        alert("Conversion impossible. Vérifie que la demande est complète.");
      } finally {
        setIsWorking(false);
      }
    },
    [loadRequests]
  );

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || (target as any)?.isContentEditable;
      if (isTyping) return;

      if (e.key === "Escape") {
        if (rejectOpen) {
          setRejectOpen(false);
          return;
        }
        if (detailsOpen) {
          setDetailsOpen(false);
          return;
        }
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          return;
        }
      }

      if (filtered.length === 0) return;

      const currentIndex = activeId ? filtered.findIndex((r) => r.id === activeId) : -1;
      const clamp = (n: number) => Math.min(filtered.length - 1, Math.max(0, n));

      if (e.key.toLowerCase() === "j") {
        e.preventDefault();
        const next = filtered[clamp(currentIndex + 1)]?.id || filtered[0].id;
        setActiveId(next);
        return;
      }
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        const prev = filtered[clamp(currentIndex - 1)]?.id || filtered[0].id;
        setActiveId(prev);
        return;
      }
      if (e.key === "Enter") {
        if (!activeId) return;
        e.preventDefault();
        setDetailsOpen((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === "e") {
        if (!activeRequest) return;
        e.preventDefault();
        editRequest(activeRequest);
        return;
      }
      if (e.key.toLowerCase() === "r") {
        if (!activeRequest || activeRequest.status !== "pending") return;
        e.preventDefault();
        setRejectNotes(activeRequest.notes || "");
        setRejectOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "c") {
        if (!activeRequest) return;
        if (!isRequestConvertibleFast(activeRequest)) return;
        e.preventDefault();
        void convertFast([activeRequest.id]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, activeRequest, convertFast, detailsOpen, editRequest, filtered, rejectOpen, selectedIds.size]);

  const chips = React.useMemo(() => {
    const items: Array<{ key: string; label: string; clear: () => void }> = [];
    if (searchQuery.trim()) items.push({ key: "search", label: `Recherche: ${searchQuery}`, clear: () => setSearchQuery("") });
    if (filterType !== "all")
      items.push({
        key: "type",
        label: `Type: ${filterType === "event_from_url" ? "URL" : "Complet"}`,
        clear: () => setFilterType("all"),
      });
    if (filterPeriod !== "all") items.push({ key: "period", label: `Période: ${filterPeriod}`, clear: () => setFilterPeriod("all") });
    if (sortMode !== "event_date_asc") {
      const sortLabels: Record<SortMode, string> = {
        newest: "Tri: récent",
        oldest: "Tri: ancien",
        event_date_asc: "Tri: date événement",
      };
      items.push({ key: "sort", label: sortLabels[sortMode] || "Tri", clear: () => setSortMode("event_date_asc") });
    }
    return items;
  }, [searchQuery, filterType, filterPeriod, sortMode]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = visible.some((r) => selectedIds.has(r.id));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Demandes</CardTitle>
          <CardDescription>Inbox des demandes d'ajout d'événements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Chargement…
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Demandes</h3>
          <p className="text-sm text-muted-foreground">Inbox pour traiter rapidement les ajouts d'événements</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={refresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Rafraîchir</span>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="pending" className="gap-2">
            À traiter <Badge variant="secondary" className="h-5 px-1.5 text-xs">{counts.pending}</Badge>
          </TabsTrigger>
          <TabsTrigger value="converted" className="gap-2">
            Converties <Badge variant="secondary" className="h-5 px-1.5 text-xs">{counts.converted}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            Rejetées <Badge variant="secondary" className="h-5 px-1.5 text-xs">{counts.rejected}</Badge>
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            Tout <Badge variant="secondary" className="h-5 px-1.5 text-xs">{counts.all}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_200px_160px_160px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher (titre, URL, lieu, catégorie)…"
                    className="pl-9 h-10"
                  />
                </div>

                <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="event_creation">Complet</SelectItem>
                    <SelectItem value="event_from_url">URL</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterPeriod} onValueChange={(v: any) => setFilterPeriod(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Période" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24h</SelectItem>
                    <SelectItem value="7d">7j</SelectItem>
                    <SelectItem value="30d">30j</SelectItem>
                    <SelectItem value="all">Tout</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortMode} onValueChange={(v: any) => setSortMode(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Tri" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="event_date_asc">Date événement ↑</SelectItem>
                    <SelectItem value="newest">Récent</SelectItem>
                    <SelectItem value="oldest">Ancien</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <Button key={c.key} type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={c.clear}>
                      <span className="max-w-[260px] truncate">{c.label}</span>
                      <X className="h-3.5 w-3.5 opacity-70" />
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterType("all");
                      setFilterPeriod("7d");
                      setSortMode("event_date_asc");
                    }}
                  >
                    Réinitialiser
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bulk bar */}
          {selectedIds.size > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm">
                  <span className="font-medium">{selectedIds.size}</span> sélectionnée{selectedIds.size > 1 ? "s" : ""}
                  <span className="text-muted-foreground"> • </span>
                  <span className="text-muted-foreground">
                    {selectedConvertible.length} convertible{selectedConvertible.length > 1 ? "s" : ""} (fast)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isWorking || selectedConvertible.length === 0}
                    onClick={() => convertFast(selectedConvertible.map((r) => r.id))}
                  >
                    {isWorking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
                    Convertir
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isWorking}
                    onClick={() => {
                      setRejectNotes("");
                      setRejectOpen(true);
                    }}
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Rejeter
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={isWorking} onClick={() => setSelectedIds(new Set())}>
                    Tout désélectionner
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inbox + details */}
          <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-[1fr_420px]")}> 
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Inbox</CardTitle>
                    <CardDescription className="text-xs">
                      {filtered.length} résultat{filtered.length > 1 ? "s" : ""} • J/K, Enter, C/E/R, Esc
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => {
                        const next = Boolean(v);
                        setSelectedIds((prev) => {
                          const copy = new Set(prev);
                          if (next) visible.forEach((r) => copy.add(r.id));
                          else visible.forEach((r) => copy.delete(r.id));
                          return copy;
                        });
                      }}
                      aria-label="Sélectionner tout"
                    />
                    <span className="text-xs text-muted-foreground">Tout</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <CircleAlert className="h-10 w-10 mx-auto opacity-20 mb-2" />
                    <div className="font-medium">Aucune demande</div>
                    <div className="text-sm">Change les filtres ou la période.</div>
                  </div>
                ) : (
                  <div className="divide-y">
                    {visible.map((r) => {
                      const isActive = r.id === activeId;
                      const selected = selectedIds.has(r.id);
                      const title = getRequestTitle(r);
                      const typeLabel = getRequestTypeLabel(r);
                      const isUrl = r.request_type === "event_from_url";
                      const canFastConvert = isRequestConvertibleFast(r);

                      const dateLabel = r.event_data?.date ? formatDateWithoutTimezone(r.event_data.date, "PPp") : null;
                      const locationLabel = r.location_name || r.event_data?.location_name || "-";
                      const categoryLabel = r.event_data?.category || "-";
                      const age = formatAgeShort(r.requested_at);

                      const locationIdForDup = r.location_id || (r.event_data?.location_id as string | undefined) || null;
                      const dayKeyForDup = r.event_data?.date
                        ? toLocalDayKey(startOfLocalDay(new Date(r.event_data.date)))
                        : null;
                      const dupKey = locationIdForDup && dayKeyForDup ? `${locationIdForDup}__${dayKeyForDup}` : null;
                      const hasPotentialDuplicate =
                        r.status === "pending" &&
                        Boolean(dupKey) &&
                        (locationDayEventCounts[dupKey as string] || 0) > 0;

                      return (
                        <div
                          key={r.id}
                          className={cn(
                            "p-3 flex gap-3 items-start hover:bg-accent/20 transition-colors",
                            isActive && "bg-accent/30",
                            r.status === "pending" && canFastConvert && "border-l-2 border-success/60",
                            r.status === "pending" && !canFastConvert && "border-l-2 border-warning/50"
                          )}
                        >
                          <div className="pt-1">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(v) => {
                                const next = Boolean(v);
                                setSelectedIds((prev) => {
                                  const copy = new Set(prev);
                                  if (next) copy.add(r.id);
                                  else copy.delete(r.id);
                                  return copy;
                                });
                              }}
                              aria-label="Sélectionner"
                            />
                          </div>

                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left cursor-pointer"
                            onClick={() => {
                              setActiveId(r.id);
                              if (isMobile) openDetails(r.id);
                            }}
                            onDoubleClick={() => openDetails(r.id)}
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium truncate max-w-[520px]">{title}</div>
                              <Badge variant={isUrl ? "outline" : "secondary"} className="text-xs">
                                {typeLabel}
                              </Badge>
                              <StatusBadge status={r.status} />
                              {hasPotentialDuplicate && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-warning/10 border-warning/30 text-warning-foreground"
                                  title="Doublon potentiel (même lieu + même jour)"
                                >
                                  Doublon ?
                                </Badge>
                              )}
                              {r.status === "pending" && !canFastConvert && r.request_type === "event_creation" && (
                                <Badge variant="outline" className="text-xs bg-warning/10 border-warning/30">
                                  Incomplet
                                </Badge>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>{age}</span>
                              {dateLabel && (
                                <span>
                                  <span className="opacity-70">Date:</span> {dateLabel}
                                </span>
                              )}
                              <span>
                                <span className="opacity-70">Lieu:</span> {locationLabel}
                              </span>
                              <span>
                                <span className="opacity-70">Cat:</span> {categoryLabel}
                              </span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1 pt-0.5">
                            {r.status === "pending" && r.request_type === "event_creation" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={!canFastConvert || isWorking || singleLoadingId === r.id}
                                onClick={async () => {
                                  setSingleLoadingId(r.id);
                                  try {
                                    await convertFast([r.id]);
                                  } finally {
                                    setSingleLoadingId(null);
                                  }
                                }}
                                title={!canFastConvert ? "Demande incomplète (utiliser Éditer)" : "Convertir (fast)"}
                              >
                                {singleLoadingId === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Wand2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}

                            {r.status === "pending" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => editRequest(r)}
                                title="Éditer"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}

                            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => openDetails(r.id)} title="Détails">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filtered.length > visibleCount && (
                  <div className="p-3 flex justify-center">
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((c) => c + 50)}>
                      Charger plus
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Desktop details */}
            {!isMobile && (
              <Card className="h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Détails</CardTitle>
                  <CardDescription className="text-xs">Sélectionne une demande (J/K) puis Enter</CardDescription>
                </CardHeader>
                <CardContent>
                  {!activeRequest ? (
                    <div className="text-sm text-muted-foreground">Aucune demande sélectionnée.</div>
                  ) : (
                    <RequestDetailsBody
                      request={activeRequest}
                      duplicates={duplicates}
                      duplicatesLoading={duplicatesLoading}
                      notes={notesDraft}
                      setNotes={setNotesDraft}
                      savingNotes={savingNotes}
                      onSaveNotes={saveNotes}
                      onCopy={copyText}
                      onOpenUrl={openUrl}
                      onEdit={() => editRequest(activeRequest)}
                      onReject={() => {
                        setRejectNotes(activeRequest.notes || "");
                        setRejectOpen(true);
                      }}
                      onFastConvert={() => void convertFast([activeRequest.id])}
                      onViewEvent={() => viewEvent(activeRequest)}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Mobile details sheet */}
      {isMobile && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" className="w-full sm:w-[66.666vw] overflow-y-auto [@media(min-width:1440px)]:w-[66.666vw] [@media(min-width:1600px)]:max-w-2xl">
            <SheetHeader className="mb-6">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setDetailsOpen(false)}
                  className="mt-1 p-1.5 rounded hover:bg-accent transition-colors cursor-pointer shrink-0"
                  title="Fermer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="mb-0">Détails</SheetTitle>
                  <SheetDescription className="mt-2">Traiter la demande sans perdre le contexte</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {!activeRequest ? (
              <div className="text-sm text-muted-foreground">Aucune demande sélectionnée.</div>
            ) : (
              <RequestDetailsBody
                request={activeRequest}
                duplicates={duplicates}
                duplicatesLoading={duplicatesLoading}
                notes={notesDraft}
                setNotes={setNotesDraft}
                savingNotes={savingNotes}
                onSaveNotes={saveNotes}
                onCopy={copyText}
                onOpenUrl={openUrl}
                onEdit={() => editRequest(activeRequest)}
                onReject={() => {
                  setRejectNotes(activeRequest.notes || "");
                  setRejectOpen(true);
                }}
                onFastConvert={() => void convertFast([activeRequest.id])}
                onViewEvent={() => viewEvent(activeRequest)}
              />
            )}
          </SheetContent>
        </Sheet>
      )}

      {/* Reject sheet */}
      <Sheet open={rejectOpen} onOpenChange={setRejectOpen}>
        <SheetContent side="right" className="w-full sm:w-[66.666vw] overflow-y-auto [@media(min-width:1440px)]:w-[66.666vw] [@media(min-width:1600px)]:max-w-2xl">
          <SheetHeader className="mb-6">
            <SheetTitle>Rejeter</SheetTitle>
            <SheetDescription>Ajoute une note (optionnel) puis confirme.</SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reject-notes">Raison / notes</Label>
              <Textarea
                id="reject-notes"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Ex: doublon, informations manquantes, mauvaise date…"
                rows={5}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)} disabled={isWorking}>
                Annuler
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isWorking}
                onClick={() => {
                  const ids = selectedIds.size > 0 ? Array.from(selectedIds) : activeRequest ? [activeRequest.id] : [];
                  if (ids.length === 0) return;
                  void rejectRequests(ids, rejectNotes);
                }}
              >
                {isWorking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ThumbsDown className="h-4 w-4 mr-2" />}
                Confirmer le rejet
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
