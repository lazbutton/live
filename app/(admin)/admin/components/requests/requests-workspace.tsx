"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  type AdminRequestItem,
  type AdminRequestLane,
  type AdminRequestPeriodFilter,
  type AdminRequestStatus,
  type AdminRequestType,
  type AdminRequestTypeFilter,
  countActionablePendingRequests,
  countRequestsByLane,
  fetchAdminRequestItems,
  filterAdminRequests,
  formatRequestAgeShort,
  getRequestLaneLabel,
  getRequestStatusLabel,
  getRequestTypeLabel,
  startOfLocalDay,
} from "@/lib/admin-requests";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Copy,
  ExternalLink,
  FileSearch,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SquarePen,
  ThumbsDown,
  Wand2,
} from "lucide-react";

const REQUEST_LANES: AdminRequestLane[] = ["ready", "to_process", "from_url", "blocked", "processed"];

function getDefaultLane(counts: Record<AdminRequestLane, number>): AdminRequestLane {
  for (const lane of REQUEST_LANES) {
    if (counts[lane] > 0) return lane;
  }
  return "ready";
}

function formatEventDate(value: string | null) {
  if (!value) return "Non renseignée";

  try {
    return formatDateWithoutTimezone(value, "PPp");
  } catch {
    return value;
  }
}

function getLaneBadgeClassName(lane: AdminRequestLane) {
  switch (lane) {
    case "ready":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "to_process":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "from_url":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "blocked":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "processed":
      return "border-border bg-muted text-muted-foreground";
  }
}

function getStatusVariant(status: AdminRequestStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "converted":
      return "default";
    case "rejected":
      return "destructive";
    case "approved":
      return "outline";
    case "pending":
    default:
      return "secondary";
  }
}

function buildAgendaUrl(item: AdminRequestItem) {
  if (!item.eventDate) return "/admin/events?view=agenda";
  const start = startOfLocalDay(new Date(item.eventDate)).toISOString().slice(0, 10);
  return `/admin/events?view=agenda&start=${start}`;
}

function LaneBadge({ lane }: { lane: AdminRequestLane }) {
  return <Badge className={cn("border", getLaneBadgeClassName(lane))}>{getRequestLaneLabel(lane)}</Badge>;
}

function StatusBadge({ status }: { status: AdminRequestStatus }) {
  return <Badge variant={getStatusVariant(status)}>{getRequestStatusLabel(status)}</Badge>;
}

function SummaryField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card/70 p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium leading-snug">{value}</div>
    </div>
  );
}

function RequestListRow({
  item,
  active,
  processingId,
  onOpen,
  onConvert,
  onEdit,
}: {
  item: AdminRequestItem;
  active: boolean;
  processingId: string | null;
  onOpen: (item: AdminRequestItem) => void;
  onConvert: (item: AdminRequestItem) => void;
  onEdit: (item: AdminRequestItem) => void;
}) {
  const isProcessing = processingId === item.id;

  return (
    <div
      className={cn(
        "border-b p-3 transition-colors last:border-b-0",
        active && "bg-accent/30",
        !active && "hover:bg-accent/10"
      )}
    >
      <div className="flex items-start gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item)}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold">{item.title}</div>
            <LaneBadge lane={item.lane} />
            <Badge variant={item.requestType === "event_from_url" ? "outline" : "secondary"}>
              {getRequestTypeLabel(item.requestType)}
            </Badge>
            <StatusBadge status={item.status} />
            {item.missingFields.length > 0 && item.status === "pending" && (
              <Badge variant="outline">{item.missingFields.length} champ(s) manquant(s)</Badge>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{formatRequestAgeShort(item.requestedAt)}</span>
            <span>{formatEventDate(item.eventDate)}</span>
            <span>{item.locationSummary || "Lieu non renseigné"}</span>
            <span>{item.category || "Catégorie non renseignée"}</span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {item.status === "pending" && item.isFastConvertible ? (
            <Button type="button" size="sm" disabled={isProcessing} onClick={() => onConvert(item)}>
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span className="ml-2 hidden lg:inline">1 clic</span>
            </Button>
          ) : item.status === "pending" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)}>
              <SquarePen className="h-4 w-4" />
              <span className="ml-2 hidden lg:inline">Compléter</span>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpen(item)}>
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestDetails({
  item,
  notesDraft,
  savingNotes,
  processingId,
  onNotesChange,
  onSaveNotes,
  onOpenUrl,
  onCopy,
  onConvert,
  onEdit,
  onReject,
  onViewEvent,
}: {
  item: AdminRequestItem | null;
  notesDraft: string;
  savingNotes: boolean;
  processingId: string | null;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
  onOpenUrl: (url: string) => void;
  onCopy: (value: string) => void;
  onConvert: (item: AdminRequestItem) => void;
  onEdit: (item: AdminRequestItem) => void;
  onReject: (item: AdminRequestItem) => void;
  onViewEvent: (item: AdminRequestItem) => void;
}) {
  if (!item) {
    return <div className="text-sm text-muted-foreground">Sélectionne une demande pour afficher son détail.</div>;
  }

  const isProcessing = processingId === item.id;
  const actionLabel =
    item.lane === "ready"
      ? "Conversion 1 clic recommandée"
      : item.lane === "from_url"
        ? "Relecture complète recommandée"
        : item.lane === "blocked"
          ? "Demande obsolète à rejeter ou archiver"
          : item.status === "pending"
            ? "Compléter avant conversion"
            : "Demande déjà traitée";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <LaneBadge lane={item.lane} />
          <Badge variant={item.requestType === "event_from_url" ? "outline" : "secondary"}>
            {getRequestTypeLabel(item.requestType)}
          </Badge>
          <StatusBadge status={item.status} />
        </div>

        <div>
          <h3 className="text-xl font-semibold leading-tight">{item.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatRequestAgeShort(item.requestedAt)} • {actionLabel}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.status === "pending" && item.isFastConvertible && (
          <Button type="button" disabled={isProcessing} onClick={() => onConvert(item)}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Convertir en 1 clic
          </Button>
        )}

        {item.status === "pending" && (
          <Button type="button" variant="outline" onClick={() => onEdit(item)}>
            <SquarePen className="mr-2 h-4 w-4" />
            Ouvrir l'édition complète
          </Button>
        )}

        {item.status === "pending" && (
          <Button type="button" variant="destructive" onClick={() => onReject(item)}>
            <ThumbsDown className="mr-2 h-4 w-4" />
            Rejeter
          </Button>
        )}

        {item.sourceUrl && (
          <>
            <Button type="button" variant="outline" onClick={() => onOpenUrl(item.sourceUrl as string)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Ouvrir la source
            </Button>
            <Button type="button" variant="ghost" onClick={() => onCopy(item.sourceUrl as string)}>
              <Copy className="mr-2 h-4 w-4" />
              Copier l'URL
            </Button>
          </>
        )}

        {item.status === "converted" && item.convertedEventId && (
          <Button type="button" variant="outline" onClick={() => onViewEvent(item)}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Voir dans Événements
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SummaryField label="Date" value={formatEventDate(item.eventDate)} icon={<CalendarDays className="h-3.5 w-3.5" />} />
        <SummaryField label="Lieu" value={item.locationSummary || "Non renseigné"} icon={<MapPin className="h-3.5 w-3.5" />} />
        <SummaryField label="Catégorie" value={item.category || "Non renseignée"} icon={<FileSearch className="h-3.5 w-3.5" />} />
        <SummaryField label="Organisateurs" value={item.organizerSummary || "Non renseignés"} icon={<Link2 className="h-3.5 w-3.5" />} />
      </div>

      {item.missingFields.length > 0 && item.status === "pending" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Points à compléter</CardTitle>
            <CardDescription>La conversion rapide reste bloquée tant que ces champs ne sont pas remplis.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {item.missingFields.map((field) => (
              <Badge key={field} variant="outline" className="border-amber-500/30 bg-background">
                {field}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {item.raw.event_data?.description && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Description</div>
          <div className="rounded-xl border bg-card/70 p-4 text-sm leading-relaxed">{item.raw.event_data.description}</div>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Notes admin</div>
            <div className="text-xs text-muted-foreground">Motif de rejet, contexte, arbitrage ou notes internes.</div>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={savingNotes} onClick={onSaveNotes}>
            {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        </div>

        <Textarea
          rows={5}
          value={notesDraft}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Ajoute une note interne ou un motif explicite."
        />
      </div>

      <details className="rounded-xl border bg-card/70 p-4">
        <summary className="cursor-pointer text-sm font-medium">Données brutes</summary>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">
{JSON.stringify(
  {
    status: item.status,
    request_type: item.requestType,
    requested_at: item.requestedAt,
    reviewed_at: item.reviewedAt,
    source_url: item.sourceUrl,
    converted_event_id: item.convertedEventId,
    notes: item.notes,
    event_data: item.raw.event_data,
  },
  null,
  2
)}
        </pre>
      </details>
    </div>
  );
}

export function RequestsWorkspace() {
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
  const [notesDraft, setNotesDraft] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectTarget, setRejectTarget] = React.useState<AdminRequestItem | null>(null);

  const appliedSearchSelectionRef = React.useRef<string | null>(null);

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
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const counts = React.useMemo(() => countRequestsByLane(items), [items]);
  const actionableCount = React.useMemo(() => countActionablePendingRequests(items), [items]);

  React.useEffect(() => {
    if (loading) return;
    if (counts[lane] > 0) return;
    setLane(getDefaultLane(counts));
  }, [counts, lane, loading]);

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
    } else if (requestedLane && REQUEST_LANES.includes(requestedLane as AdminRequestLane)) {
      setLane(requestedLane as AdminRequestLane);
    }

    appliedSearchSelectionRef.current = selectionKey;
  }, [isMobile, items, searchParams]);

  const filteredItems = React.useMemo(
    () =>
      filterAdminRequests(items, {
        lane,
        query: searchQuery,
        typeFilter,
        periodFilter,
      }),
    [items, lane, searchQuery, typeFilter, periodFilter]
  );

  const activeItem = React.useMemo(
    () => filteredItems.find((item) => item.id === activeId) ?? null,
    [activeId, filteredItems]
  );

  React.useEffect(() => {
    if (filteredItems.length === 0) {
      setActiveId(null);
      if (isMobile) setDetailsOpen(false);
      return;
    }

    if (!activeId || !filteredItems.some((item) => item.id === activeId)) {
      setActiveId(filteredItems[0].id);
    }
  }, [activeId, filteredItems, isMobile]);

  React.useEffect(() => {
    setNotesDraft(activeItem?.notes || "");
  }, [activeItem?.id, activeItem?.notes]);

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

  const openItem = React.useCallback(
    (item: AdminRequestItem) => {
      setActiveId(item.id);
      if (isMobile) setDetailsOpen(true);
    },
    [isMobile]
  );

  const openFullReview = React.useCallback(
    (item: AdminRequestItem) => {
      router.push(`/admin/requests/${item.id}/create-event`);
    },
    [router]
  );

  const openUrl = React.useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

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
          notes: notesDraft.trim() || null,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", activeItem.id);

      if (error) throw error;

      await loadItems();
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
  }, [activeItem, loadItems, notesDraft]);

  const convertFast = React.useCallback(
    async (item: AdminRequestItem) => {
      setProcessingId(item.id);
      try {
        const { error } = await supabase.rpc("convert_event_request_to_event", {
          request_id: item.id,
        });

        if (error) throw error;

        const nextItems = await loadItems();
        setLane("processed");
        setActiveId(item.id);
        if (isMobile && nextItems.some((entry) => entry.id === item.id)) {
          setDetailsOpen(true);
        }

        toast({ title: "Demande convertie", variant: "success" });
      } catch (error: any) {
        console.error("Erreur conversion rapide:", error);
        toast({
          title: "Conversion impossible",
          description: error?.message || "La demande doit être complétée avant conversion.",
          variant: "destructive",
        });
      } finally {
        setProcessingId(null);
      }
    },
    [isMobile, loadItems]
  );

  const requestReject = React.useCallback((item: AdminRequestItem) => {
    setRejectTarget(item);
    setRejectReason(item.notes || "");
    setRejectOpen(true);
  }, []);

  const confirmReject = React.useCallback(async () => {
    if (!rejectTarget) return;

    const reason = rejectReason.trim();
    if (!reason) {
      toast({
        title: "Motif obligatoire",
        description: "Ajoute un motif explicite avant de rejeter la demande.",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(rejectTarget.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("user_requests")
        .update({
          status: "rejected",
          notes: reason,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", rejectTarget.id);

      if (error) throw error;

      const nextItems = await loadItems();
      setRejectOpen(false);
      setRejectTarget(null);
      setRejectReason("");
      setLane("processed");
      setActiveId(rejectTarget.id);
      if (isMobile && nextItems.some((item) => item.id === rejectTarget.id)) {
        setDetailsOpen(true);
      }

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
  }, [isMobile, loadItems, rejectReason, rejectTarget]);

  const viewEvent = React.useCallback(
    (item: AdminRequestItem) => {
      router.push(buildAgendaUrl(item));
    },
    [router]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Demandes</CardTitle>
            <CardDescription>Chargement de l'inbox dédiée…</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Inbox Demandes</CardTitle>
            <CardDescription>
              Un seul poste de travail pour convertir vite, relire si besoin, et rejeter proprement avec motif.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Rafraîchir</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <SummaryField label="Actionnables" value={String(actionableCount)} />
          <SummaryField label="Prêtes à convertir" value={String(counts.ready)} />
          <SummaryField label="Depuis URL" value={String(counts.from_url)} />
          <SummaryField label="Bloquées / passées" value={String(counts.blocked)} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {REQUEST_LANES.map((entry) => {
          const count = counts[entry];
          const active = lane === entry;
          return (
            <Button
              key={entry}
              type="button"
              variant={active ? "default" : "outline"}
              className="gap-2"
              onClick={() => setLane(entry)}
            >
              <span>{getRequestLaneLabel(entry)}</span>
              <Badge variant={active ? "secondary" : "outline"}>{count}</Badge>
            </Button>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Rechercher par titre, lieu, URL, note ou catégorie"
                className="pl-9"
              />
            </div>

            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as AdminRequestTypeFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="event_creation">{getRequestTypeLabel("event_creation")}</SelectItem>
                <SelectItem value="event_from_url">{getRequestTypeLabel("event_from_url")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={periodFilter} onValueChange={(value) => setPeriodFilter(value as AdminRequestPeriodFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les dates</SelectItem>
                <SelectItem value="24h">Dernières 24h</SelectItem>
                <SelectItem value="7d">Derniers 7 jours</SelectItem>
                <SelectItem value="30d">Derniers 30 jours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(searchQuery || typeFilter !== "all" || periodFilter !== "all") && (
            <div className="flex flex-wrap gap-2">
              {searchQuery && (
                <Badge variant="outline" className="gap-1">
                  Recherche: {searchQuery}
                </Badge>
              )}
              {typeFilter !== "all" && (
                <Badge variant="outline" className="gap-1">
                  {getRequestTypeLabel(typeFilter as AdminRequestType)}
                </Badge>
              )}
              {periodFilter !== "all" && <Badge variant="outline">Période: {periodFilter}</Badge>}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("all");
                  setPeriodFilter("all");
                }}
              >
                Réinitialiser
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_420px]")}>
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{filteredItems.length} demande(s)</CardTitle>
            <CardDescription>
              {lane === "ready" && "File prioritaire pour la conversion 1 clic."}
              {lane === "to_process" && "Demandes formulaires à compléter avant conversion."}
              {lane === "from_url" && "Demandes à partir d'une URL, à relire et enrichir."}
              {lane === "blocked" && "Demandes passées ou obsolètes à trancher rapidement."}
              {lane === "processed" && "Historique des demandes déjà converties ou rejetées."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
                <CircleAlert className="h-10 w-10 opacity-25" />
                <div className="font-medium">Aucune demande dans cette vue</div>
                <div className="text-sm">Change la vue ou les filtres pour retrouver une demande.</div>
              </div>
            ) : (
              <div className="max-h-[72vh] overflow-y-auto">
                {filteredItems.map((item) => (
                  <RequestListRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    processingId={processingId}
                    onOpen={openItem}
                    onConvert={convertFast}
                    onEdit={openFullReview}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {!isMobile && (
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Détail</CardTitle>
              <CardDescription>Décide vite: convertir, compléter ou rejeter avec motif.</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestDetails
                item={activeItem}
                notesDraft={notesDraft}
                savingNotes={savingNotes}
                processingId={processingId}
                onNotesChange={setNotesDraft}
                onSaveNotes={() => void saveNotes()}
                onOpenUrl={openUrl}
                onCopy={(value) => void copyText(value)}
                onConvert={(item) => void convertFast(item)}
                onEdit={openFullReview}
                onReject={requestReject}
                onViewEvent={viewEvent}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {isMobile && (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader className="mb-6">
              <SheetTitle>Détail de la demande</SheetTitle>
              <SheetDescription>Traite la demande sans perdre le contexte de la file.</SheetDescription>
            </SheetHeader>

            <RequestDetails
              item={activeItem}
              notesDraft={notesDraft}
              savingNotes={savingNotes}
              processingId={processingId}
              onNotesChange={setNotesDraft}
              onSaveNotes={() => void saveNotes()}
              onOpenUrl={openUrl}
              onCopy={(value) => void copyText(value)}
              onConvert={(item) => void convertFast(item)}
              onEdit={openFullReview}
              onReject={requestReject}
              onViewEvent={viewEvent}
            />
          </SheetContent>
        </Sheet>
      )}

      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) {
            setRejectTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande</DialogTitle>
            <DialogDescription>Le motif est obligatoire pour éviter les rejets incompréhensibles côté admin.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reject-reason">Motif</Label>
            <Textarea
              id="reject-reason"
              rows={5}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Ex: doublon confirmé, date passée, informations insuffisantes…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)} disabled={processingId === rejectTarget?.id}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmReject()} disabled={processingId === rejectTarget?.id}>
              {processingId === rejectTarget?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />}
              Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
