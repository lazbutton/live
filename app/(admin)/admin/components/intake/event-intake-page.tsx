"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Archive,
  Check,
  CheckCircle2,
  Code,
  Copy,
  ExternalLink,
  Facebook,
  Globe,
  Inbox,
  Instagram,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  ScanSearch,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { getAddressLabel, getSourceKind, hostOf, type SourceKind } from "@/lib/collecte/source-kind";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";

import { ManagementEmptyState } from "../management-page-primitives";
import {
  DirectoryHeader,
  DirectorySearch,
  DirectorySegments,
  DirectoryTableCard,
  EntityAvatar,
  RowActionsMenu,
} from "../directory/directory";
import { AgendaImportPanel } from "../events/event-agenda-import";
import { notifyAdminEventsChanged, useEventCreation } from "../events/event-creation-provider";
import type { OrganizerOption } from "../events/types";
import {
  buildEventFormPrefillFromIntakePayload,
  buildIntakeEventPrefillPayload,
} from "./intake-event-prefill";
import type { EventOpportunity, EventSource, IntakeDuplicateCandidate } from "./intake-types";
import { addDays, findOpportunityDuplicateCandidate, isSourceDue } from "./intake-utils";

/*
 * Collecte : les sites et réseaux des lieux et organisateurs à revoir régulièrement.
 * Un site se scanne (lecture automatique de son agenda, import en attente) ;
 * un compte Instagram ou Facebook s'ouvre, puis on crée les événements repérés.
 */

const OPEN_FINDING_STATUSES = ["spotted", "needs_info", "ready_to_create", "recheck"];

const FREQUENCIES = [
  { days: 7, label: "Chaque semaine" },
  { days: 14, label: "Toutes les 2 semaines" },
  { days: 30, label: "Chaque mois" },
  { days: 90, label: "Tous les 3 mois" },
];

const DUPLICATE_EVENT_SELECT =
  "id, title, date, end_date, location_id, external_url, instagram_url, facebook_url, location:locations(name), event_organizers:event_organizers(organizer:organizers(name), location:locations(name))";

type CollecteTab = "due" | "findings" | "all";
type KindFilter = "all" | "website" | "social";

const KIND_META: Record<SourceKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  website: { label: "Site", icon: Globe },
  instagram: { label: "Instagram", icon: Instagram },
  facebook: { label: "Facebook", icon: Facebook },
};

type CollecteSource = EventSource & {
  kind: SourceKind;
  /** Lieu ou organisateur dont la fiche alimente la source. */
  ownerId: string | null;
  avatarUrl: string | null;
  /** Page lue par « Scanner » : agenda configuré du propriétaire, sinon le site lui-même. */
  scanUrl: string | null;
};

/** Événement repéré par l'ancienne collecte, encore à traiter. */
type Finding = EventOpportunity & {
  source: CollecteSource | null;
  when: Date | null;
  past: boolean;
  duplicate: IntakeDuplicateCandidate | null;
};

type ReviewSnapshot = Pick<
  EventSource,
  "last_scanned_at" | "next_scan_at" | "scan_count" | "discovery_count" | "last_found_at"
>;

type DuplicateCheckEvent = Parameters<typeof findOpportunityDuplicateCandidate>[1][number];

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/** Clé de comparaison d'adresses (sans protocole, www ni barre finale). */
function urlKey(url: string) {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.hostname.includes(".") ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function frequencyLabel(days: number) {
  return FREQUENCIES.find((option) => option.days === days)?.label ?? `Tous les ${days} jours`;
}

function fromNow(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { locale: fr, addSuffix: true });
}

function shortDay(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "d MMM", { locale: fr });
}

function compareNextScan(left: CollecteSource, right: CollecteSource) {
  const leftTime = left.next_scan_at ? Date.parse(left.next_scan_at) : 0;
  const rightTime = right.next_scan_at ? Date.parse(right.next_scan_at) : 0;
  return leftTime - rightTime || left.name.localeCompare(right.name, "fr");
}

function compareFindings(left: Finding, right: Finding) {
  if (left.past !== right.past) return left.past ? 1 : -1;
  if (left.when && right.when) {
    const delta = left.when.getTime() - right.when.getTime();
    return left.past ? -delta : delta;
  }
  return left.when ? -1 : right.when ? 1 : 0;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Réessaie dans un instant.";
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Chargement                                                          */
/* ------------------------------------------------------------------ */

async function fetchCollecte(): Promise<{ sources: CollecteSource[]; findings: Finding[] }> {
  const [sourcesRes, findingsRes, organizersRes, locationsRes, agendasRes] = await Promise.all([
    supabase.from("intake_sources_view").select("*"),
    supabase.from("event_opportunities").select("*").in("status", OPEN_FINDING_STATUSES),
    supabase.from("organizers").select("id, name, logo_url, icon_url"),
    supabase.from("locations").select("id, name, image_url, is_organizer"),
    supabase.from("organizer_agenda_scraping_configs").select("organizer_id, location_id, agenda_url"),
  ]);
  const error = sourcesRes.error || findingsRes.error || organizersRes.error || locationsRes.error;
  if (error) throw error;

  const organizerById = new Map(((organizersRes.data || []) as any[]).map((row) => [row.id as string, row]));
  const locationById = new Map(((locationsRes.data || []) as any[]).map((row) => [row.id as string, row]));
  // Les réglages d'agenda sont facultatifs : sans eux, on lit le site de la source.
  const agendaByOwner = new Map<string, string>();
  for (const row of (agendasRes.data || []) as any[]) {
    const ownerId = row.location_id || row.organizer_id;
    if (ownerId && row.agenda_url && !agendaByOwner.has(ownerId)) agendaByOwner.set(ownerId, row.agenda_url);
  }

  const sources: CollecteSource[] = ((sourcesRes.data || []) as EventSource[]).map((source) => {
    const organizer = source.organizer_id ? organizerById.get(source.organizer_id) : undefined;
    const location = source.organizer_location_id ? locationById.get(source.organizer_location_id) : undefined;
    const ownerId = source.organizer_id || source.organizer_location_id || null;
    const kind = getSourceKind(source.url);
    return {
      ...source,
      organizer: organizer ? { id: organizer.id, name: organizer.name } : null,
      organizer_location: location
        ? { id: location.id, name: location.name, is_organizer: location.is_organizer }
        : null,
      kind,
      ownerId,
      avatarUrl: organizer?.logo_url || organizer?.icon_url || location?.image_url || null,
      scanUrl: (ownerId && agendaByOwner.get(ownerId)) || (kind === "website" ? source.url : null),
    };
  });

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const findings: Finding[] = ((findingsRes.data || []) as EventOpportunity[]).map((opportunity) => {
    const date = opportunity.detected_date ? new Date(opportunity.detected_date) : null;
    const when = date && !Number.isNaN(date.getTime()) ? date : null;
    return {
      ...opportunity,
      source: (opportunity.source_id && sourceById.get(opportunity.source_id)) || null,
      when,
      past: Boolean(when && when < startOfToday),
      duplicate: null,
    };
  });

  // Trouvailles à venir déjà présentes dans l'agenda (même titre, même date…).
  if (findings.some((finding) => !finding.past)) {
    const { data: events } = await supabase
      .from("events")
      .select(DUPLICATE_EVENT_SELECT)
      .gte("date", addDays(startOfToday, -1).toISOString())
      .order("date", { ascending: true })
      .limit(1500);
    const existing = (events || []) as unknown as DuplicateCheckEvent[];
    for (const finding of findings) {
      if (finding.past) continue;
      finding.duplicate = findOpportunityDuplicateCandidate(finding, existing, {
        source: finding.source ?? undefined,
        sourceUrl: finding.source_url,
      });
    }
  }

  return { sources, findings: findings.sort(compareFindings) };
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function EventIntakePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("source");
  const { openEventCreation, loadReferences } = useEventCreation();
  const { showConfirm, AlertDialogComponent } = useAlertDialog();

  const [loading, setLoading] = React.useState(true);
  const [sources, setSources] = React.useState<CollecteSource[]>([]);
  const [findings, setFindings] = React.useState<Finding[]>([]);
  const [owners, setOwners] = React.useState<OrganizerOption[] | null>(null);
  const [tab, setTab] = React.useState<CollecteTab>(highlightId ? "all" : "due");
  const [kindFilter, setKindFilter] = React.useState<KindFilter>("all");
  const [search, setSearch] = React.useState("");
  const [seenHighlightId, setSeenHighlightId] = React.useState(highlightId);

  const [scanOpen, setScanOpen] = React.useState(false);
  const [scanTarget, setScanTarget] = React.useState<CollecteSource | null>(null);
  const [scanOwnerId, setScanOwnerId] = React.useState("");
  const [scanKey, setScanKey] = React.useState(0);

  const [sourceDialogOpen, setSourceDialogOpen] = React.useState(false);
  const [editedSource, setEditedSource] = React.useState<CollecteSource | null>(null);
  const [sourceFormKey, setSourceFormKey] = React.useState(0);

  // Lien vers une source précise (palette de commandes) : on l'affiche dans « Toutes ».
  if (highlightId !== seenHighlightId) {
    setSeenHighlightId(highlightId);
    if (highlightId) {
      setTab("all");
      setKindFilter("all");
      setSearch("");
    }
  }

  const loadData = React.useCallback(async () => {
    try {
      const data = await fetchCollecte();
      setSources(data.sources);
      setFindings(data.findings);
    } catch (error) {
      toast({ title: "Collecte indisponible", description: errorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Lieux et organisateurs proposés au scan (référentiel partagé avec la création d'événements).
  React.useEffect(() => {
    let cancelled = false;
    loadReferences()
      .then((references) => {
        if (!cancelled) setOwners(references.organizers);
      })
      .catch(() => {
        if (!cancelled) setOwners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadReferences]);

  React.useEffect(() => {
    if (loading || !highlightId) return;
    document.getElementById(`source-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId, loading]);

  const ownerOptions = React.useMemo(
    () => [
      { value: "", label: "Aucun lieu ni organisateur" },
      ...(owners || []).map((owner) => ({
        value: owner.id,
        label: `${owner.name}${owner.type === "location" ? " (lieu)" : ""}`,
      })),
    ],
    [owners],
  );

  const dueSources = React.useMemo(() => sources.filter(isSourceDue).sort(compareNextScan), [sources]);
  const allSources = React.useMemo(
    () =>
      [...sources].sort((left, right) => {
        if ((left.status === "active") !== (right.status === "active")) return left.status === "active" ? -1 : 1;
        return left.name.localeCompare(right.name, "fr");
      }),
    [sources],
  );
  const nextReview = React.useMemo(
    () => sources.filter((source) => source.status === "active" && !isSourceDue(source)).sort(compareNextScan)[0],
    [sources],
  );
  const lastReviewAt = React.useMemo(() => {
    let latest: number | null = null;
    for (const source of sources) {
      const time = source.last_scanned_at ? Date.parse(source.last_scanned_at) : Number.NaN;
      if (!Number.isNaN(time) && (latest === null || time > latest)) latest = time;
    }
    return latest === null ? null : new Date(latest).toISOString();
  }, [sources]);

  const query = normalizeText(search.trim());
  const visibleSources = (tab === "due" ? dueSources : allSources).filter((source) => {
    if (kindFilter === "website" && source.kind !== "website") return false;
    if (kindFilter === "social" && source.kind === "website") return false;
    return !query || normalizeText(`${source.name} ${source.url} ${source.scanUrl ?? ""}`).includes(query);
  });
  const visibleFindings = findings.filter(
    (finding) =>
      !query ||
      normalizeText(`${finding.raw_title} ${finding.source?.name ?? ""} ${finding.source_url ?? ""}`).includes(query),
  );
  const pastFindings = findings.filter((finding) => finding.past);
  const duplicateFindings = findings.filter((finding) => !finding.past && finding.duplicate);
  const showFindingsTab = findings.length > 0 || tab === "findings";

  /* ---------------------------- Sources ---------------------------- */

  const patchSource = React.useCallback((id: string, patch: Partial<CollecteSource>) => {
    setSources((current) => current.map((source) => (source.id === id ? { ...source, ...patch } : source)));
  }, []);

  async function undoReview(source: CollecteSource, previous: ReviewSnapshot, logId: string | null) {
    patchSource(source.id, previous);
    const { error } = await supabase.from("event_sources").update(previous).eq("id", source.id);
    if (error) {
      toast({ title: "Annulation impossible", description: error.message, variant: "destructive" });
      await loadData();
      return;
    }
    if (logId) await supabase.from("event_source_scan_logs").delete().eq("id", logId);
  }

  /** Source revue : elle quitte « À revoir » jusqu'à sa prochaine échéance. */
  async function markReviewed(source: CollecteSource, imported = 0) {
    const now = new Date();
    const previous: ReviewSnapshot = {
      last_scanned_at: source.last_scanned_at,
      next_scan_at: source.next_scan_at,
      scan_count: source.scan_count,
      discovery_count: source.discovery_count,
      last_found_at: source.last_found_at,
    };
    const next: Partial<ReviewSnapshot> = {
      last_scanned_at: now.toISOString(),
      next_scan_at: addDays(now, source.scan_frequency_days || 7).toISOString(),
      scan_count: (source.scan_count || 0) + 1,
      ...(imported > 0
        ? { discovery_count: (source.discovery_count || 0) + imported, last_found_at: now.toISOString() }
        : {}),
    };

    patchSource(source.id, next);
    const { error } = await supabase.from("event_sources").update(next).eq("id", source.id);
    if (error) {
      patchSource(source.id, previous);
      toast({ title: "Revue non enregistrée", description: error.message, variant: "destructive" });
      return;
    }

    const { data: log } = await supabase
      .from("event_source_scan_logs")
      .insert({
        source_id: source.id,
        action: "scanned",
        scanned_at: next.last_scanned_at,
        ended_at: next.last_scanned_at,
        previous_next_scan_at: previous.next_scan_at,
        next_scan_at: next.next_scan_at,
        previous_scan_count: previous.scan_count,
        scan_count: next.scan_count,
        opportunities_found: imported,
        notes: imported > 0 ? `${plural(imported, "événement importé", "événements importés")}.` : "Source revue.",
        created_by: await currentUserId(),
      })
      .select("id")
      .single();

    const nextLabel = `Prochaine revue le ${format(new Date(next.next_scan_at as string), "d MMMM", { locale: fr })}.`;
    toast({
      title: `${source.name} : revue`,
      description:
        imported > 0
          ? `${plural(imported, "événement importé", "événements importés")} en attente. ${nextLabel}`
          : nextLabel,
      // Après un import, annuler la revue laisserait croire que l'import est annulé.
      action:
        imported > 0 ? undefined : (
          <ToastAction altText="Annuler la revue" onClick={() => void undoReview(source, previous, log?.id ?? null)}>
            Annuler
          </ToastAction>
        ),
    });
  }

  async function changeFrequency(source: CollecteSource, days: number) {
    if (days === source.scan_frequency_days) return;
    // L'échéance suit la nouvelle fréquence à partir de la dernière revue.
    const nextScanAt = source.last_scanned_at
      ? addDays(new Date(source.last_scanned_at), days).toISOString()
      : source.next_scan_at;
    patchSource(source.id, { scan_frequency_days: days, next_scan_at: nextScanAt });
    const { error } = await supabase
      .from("event_sources")
      .update({ scan_frequency_days: days, next_scan_at: nextScanAt })
      .eq("id", source.id);
    if (error) {
      toast({ title: "Fréquence non modifiée", description: error.message, variant: "destructive" });
      await loadData();
      return;
    }
    toast({ title: "Fréquence mise à jour", description: `${source.name} : ${frequencyLabel(days).toLowerCase()}.` });
  }

  async function requeueSource(source: CollecteSource) {
    const nowIso = new Date().toISOString();
    patchSource(source.id, { next_scan_at: nowIso });
    const { error } = await supabase.from("event_sources").update({ next_scan_at: nowIso }).eq("id", source.id);
    if (error) {
      toast({ title: "Action impossible", description: error.message, variant: "destructive" });
      await loadData();
      return;
    }
    toast({ title: `${source.name} revient dans « À revoir »` });
  }

  async function toggleSourceStatus(source: CollecteSource) {
    const status = source.status === "active" ? "paused" : "active";
    patchSource(source.id, { status });
    const { error } = await supabase.from("event_sources").update({ status }).eq("id", source.id);
    if (error) {
      patchSource(source.id, { status: source.status });
      toast({ title: "Statut non modifié", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: status === "paused" ? `${source.name} en pause` : `${source.name} réactivée`,
      description: status === "paused" ? "Elle ne revient plus dans « À revoir »." : undefined,
    });
  }

  function deleteSource(source: CollecteSource) {
    showConfirm({
      title: "Supprimer la source",
      description: `« ${source.name} » ne sera plus suivie dans la collecte.`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        const { error } = await supabase.from("event_sources").delete().eq("id", source.id);
        if (error) {
          toast({ title: "Suppression impossible", description: error.message, variant: "destructive" });
          return;
        }
        setSources((current) => current.filter((entry) => entry.id !== source.id));
        toast({ title: "Source supprimée", variant: "success" });
      },
    });
  }

  function openScan(source: CollecteSource) {
    setScanTarget(source);
    setScanOwnerId(source.ownerId || "");
    setScanKey((key) => key + 1);
    setScanOpen(true);
  }

  function openSourceDialog(source: CollecteSource | null) {
    setEditedSource(source);
    setSourceFormKey((key) => key + 1);
    setSourceDialogOpen(true);
  }

  /* --------------------------- Trouvailles -------------------------- */

  function removeFindings(ids: string[]) {
    setFindings((current) => current.filter((finding) => !ids.includes(finding.id)));
  }

  async function classifyFinding(finding: Finding, status: "archived" | "out_of_scope" | "duplicate") {
    const patch =
      status === "duplicate"
        ? {
            status,
            duplicate_event_id: finding.duplicate?.eventId ?? finding.duplicate_event_id ?? null,
            decision_reason: finding.duplicate
              ? `Doublon de « ${finding.duplicate.title} ».`
              : "Marquée comme doublon depuis la collecte.",
          }
        : {
            status,
            decision_reason: status === "out_of_scope" ? "Hors sujet (collecte)." : "Archivée depuis la collecte.",
          };
    removeFindings([finding.id]);
    const { error } = await supabase.from("event_opportunities").update(patch).eq("id", finding.id);
    if (error) {
      toast({ title: "Action impossible", description: error.message, variant: "destructive" });
      await loadData();
      return;
    }
    toast({
      title: status === "duplicate" ? "Classée en doublon" : status === "out_of_scope" ? "Classée hors sujet" : "Trouvaille archivée",
      description: finding.raw_title,
      action: (
        <ToastAction
          altText="Annuler"
          onClick={() =>
            void (async () => {
              await supabase
                .from("event_opportunities")
                .update({
                  status: finding.status,
                  duplicate_event_id: finding.duplicate_event_id,
                  decision_reason: finding.decision_reason,
                })
                .eq("id", finding.id);
              await loadData();
            })()
          }
        >
          Annuler
        </ToastAction>
      ),
    });
  }

  async function createFromFinding(finding: Finding) {
    let categories: Array<{ id: string; name: string }> = [];
    try {
      categories = (await loadReferences()).categories;
    } catch {
      // Le formulaire signale lui-même un référentiel indisponible.
    }
    const payload = buildIntakeEventPrefillPayload(finding, finding.source ?? undefined);
    openEventCreation({
      prefill: buildEventFormPrefillFromIntakePayload({ payload, categories }),
      sourceLabel: "la collecte",
      onSaved: async (eventId) => {
        removeFindings([finding.id]);
        const { error } = await supabase
          .from("event_opportunities")
          .update({ status: "created", created_event_id: eventId, decision_reason: "Événement créé depuis la collecte." })
          .eq("id", finding.id);
        if (error) {
          toast({ title: "Trouvaille non mise à jour", description: error.message, variant: "destructive" });
        }
      },
    });
  }

  function archivePastFindings() {
    const ids = pastFindings.map((finding) => finding.id);
    if (ids.length === 0) return;
    showConfirm({
      title: `Archiver ${plural(ids.length, "trouvaille passée", "trouvailles passées")} ?`,
      description: "Leurs dates sont dépassées : elles quittent la liste.",
      confirmText: "Archiver",
      cancelText: "Annuler",
      onConfirm: async () => {
        const { error } = await supabase
          .from("event_opportunities")
          .update({ status: "archived", decision_reason: "Date passée : archivée depuis la collecte." })
          .in("id", ids);
        if (error) {
          toast({ title: "Archivage impossible", description: error.message, variant: "destructive" });
          return;
        }
        removeFindings(ids);
        toast({ title: `${plural(ids.length, "trouvaille archivée", "trouvailles archivées")}`, variant: "success" });
      },
    });
  }

  function classifyDuplicateFindings() {
    const list = duplicateFindings;
    if (list.length === 0) return;
    showConfirm({
      title: `Classer ${plural(list.length, "doublon")} ?`,
      description: "Ces trouvailles correspondent à des événements déjà dans l’agenda (titre et date proches).",
      confirmText: "Classer en doublons",
      cancelText: "Annuler",
      onConfirm: async () => {
        const results = await Promise.all(
          list.map((finding) =>
            supabase
              .from("event_opportunities")
              .update({
                status: "duplicate",
                duplicate_event_id: finding.duplicate?.eventId ?? null,
                decision_reason: `Doublon de « ${finding.duplicate?.title ?? "un événement existant"} ».`,
              })
              .eq("id", finding.id),
          ),
        );
        const done = list.filter((_, index) => !results[index].error).map((finding) => finding.id);
        removeFindings(done);
        const failed = list.length - done.length;
        toast({
          title: `${plural(done.length, "doublon classé", "doublons classés")}`,
          description: failed ? `${plural(failed, "trouvaille n’a pas pu", "trouvailles n’ont pas pu")} être modifiée${failed > 1 ? "s" : ""}.` : undefined,
          variant: failed ? "destructive" : "success",
        });
      },
    });
  }

  /* ----------------------------- Rendu ------------------------------ */

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-36 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  function renderReviewStatus(source: CollecteSource) {
    if (source.status !== "active") return <span>En pause</span>;
    if (isSourceDue(source)) {
      return (
        <span className="inline-flex items-center gap-1.5">
          {tab === "all" ? <span className="size-1.5 shrink-0 rounded-full bg-warning" /> : null}
          {source.last_scanned_at ? `Revue ${fromNow(source.last_scanned_at)}` : "Jamais revue"}
        </span>
      );
    }
    return <span>Prochaine revue le {shortDay(source.next_scan_at)}</span>;
  }

  function renderSourceRow(source: CollecteSource) {
    const meta = KIND_META[source.kind];
    const KindIcon = meta.icon;
    const due = isSourceDue(source);
    const paused = source.status !== "active";
    const ownerHref = source.organizer_id
      ? `/admin/organizers?open=${source.organizer_id}`
      : source.organizer_location_id
        ? `/admin/locations?open=${source.organizer_location_id}`
        : null;

    return (
      <li
        key={source.id}
        id={`source-${source.id}`}
        className={cn(
          "flex scroll-mt-24 items-center gap-3 px-4 py-3 transition-colors",
          highlightId === source.id && "bg-accent/60",
        )}
      >
        <EntityAvatar src={source.avatarUrl} name={source.name} className={cn(paused && "opacity-50")} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", paused && "text-muted-foreground")}>{source.name}</p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <KindIcon className="size-3 shrink-0" />
            <span className="sr-only">{meta.label} :</span>
            {/* En largeur réduite, la revue remplace l'adresse (sa colonne est masquée). */}
            <span className="hidden truncate @2xl:inline">
              {getAddressLabel(source.scanUrl || source.url, source.kind)}
            </span>
            <span className="truncate @2xl:hidden">{renderReviewStatus(source)}</span>
          </p>
        </div>
        <div className="hidden w-44 shrink-0 text-xs text-muted-foreground @2xl:block">
          {renderReviewStatus(source)}
        </div>
        {/* Largeur fixe : la colonne de revue reste alignée, site ou réseau. */}
        <div className="flex shrink-0 items-center justify-end gap-1 @2xl:w-[12.5rem]">
          {source.scanUrl ? (
            <Button type="button" variant="outline" size="sm" onClick={() => openScan(source)} title="Lire l’agenda et importer ses événements">
              <ScanSearch />
              <span className="max-sm:sr-only">Scanner</span>
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  <span className="max-sm:sr-only">Ouvrir</span>
                </a>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-sm:hidden"
                onClick={() => openEventCreation({ ownerId: source.ownerId || undefined })}
                title="Créer un événement repéré sur ce compte"
                aria-label={`Créer un événement pour ${source.name}`}
              >
                <Plus />
              </Button>
            </>
          )}
          {due ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void markReviewed(source)}
              title="Marquer comme revue"
              aria-label={`Marquer ${source.name} comme revue`}
            >
              <Check />
            </Button>
          ) : (
            <span className="size-8 shrink-0 max-md:size-9" aria-hidden />
          )}
          <RowActionsMenu label={`Actions pour ${source.name}`}>
            <DropdownMenuItem asChild>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {source.kind === "website" ? "Ouvrir le site" : `Ouvrir sur ${meta.label}`}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openEventCreation({ ownerId: source.ownerId || undefined })}>
              <Plus />
              Créer un événement
            </DropdownMenuItem>
            {ownerHref ? (
              <DropdownMenuItem onSelect={() => router.push(ownerHref)}>
                <Pencil />
                Modifier la fiche
              </DropdownMenuItem>
            ) : source.is_editable ? (
              <DropdownMenuItem onSelect={() => openSourceDialog(source)}>
                <Pencil />
                Modifier la source
              </DropdownMenuItem>
            ) : null}
            {source.ownerId && source.scanUrl ? (
              <DropdownMenuItem onSelect={() => router.push(`/admin/scraping/${source.ownerId}`)}>
                <Code />
                Configurer le scraping
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Repeat />
                Fréquence de revue
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={String(source.scan_frequency_days)}
                  onValueChange={(value) => void changeFrequency(source, Number(value))}
                >
                  {FREQUENCIES.map((option) => (
                    <DropdownMenuRadioItem key={option.days} value={String(option.days)}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {!due && !paused ? (
              <DropdownMenuItem onSelect={() => void requeueSource(source)}>
                <RotateCcw />
                Remettre à revoir
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => void toggleSourceStatus(source)}>
              {paused ? <Play /> : <Pause />}
              {paused ? "Réactiver" : "Mettre en pause"}
            </DropdownMenuItem>
            {source.is_editable ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => deleteSource(source)}
                  className="text-destructive focus:text-destructive [&>svg]:!text-destructive"
                >
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </>
            ) : null}
          </RowActionsMenu>
        </div>
      </li>
    );
  }

  function renderFindingRow(finding: Finding) {
    const sourceLabel = finding.source?.name || (finding.source_url ? hostOf(finding.source_url) : null);
    const primary = finding.past ? "archive" : finding.duplicate ? "duplicate" : "create";

    return (
      <li key={finding.id} className="flex items-center gap-3 px-4 py-3">
        <div className="w-[4.5rem] shrink-0 leading-tight">
          {finding.when ? (
            <>
              <p className={cn("text-xs font-medium first-letter:uppercase", finding.past && "text-muted-foreground")}>
                {format(finding.when, "EEE d MMM", { locale: fr }).replace(/\./g, "")}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {finding.past ? "Passée" : format(finding.when, "HH:mm")}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Date ?</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", finding.past && "text-muted-foreground")}>
            {finding.raw_title}
          </p>
          {finding.duplicate ? (
            <p className="truncate text-xs text-warning">Déjà dans l’agenda : « {finding.duplicate.title} »</p>
          ) : sourceLabel ? (
            <p className="truncate text-xs text-muted-foreground">{sourceLabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {primary === "archive" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void classifyFinding(finding, "archived")}>
              <Archive />
              <span className="max-sm:sr-only">Archiver</span>
            </Button>
          ) : primary === "duplicate" ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void classifyFinding(finding, "duplicate")}>
              <Copy />
              <span className="max-sm:sr-only">Doublon</span>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => void createFromFinding(finding)}>
              <Plus />
              <span className="max-sm:sr-only">Créer</span>
            </Button>
          )}
          <RowActionsMenu label={`Actions pour ${finding.raw_title}`}>
            {finding.source_url ? (
              <DropdownMenuItem asChild>
                <a href={finding.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Ouvrir la page
                </a>
              </DropdownMenuItem>
            ) : null}
            {primary !== "create" ? (
              <DropdownMenuItem onSelect={() => void createFromFinding(finding)}>
                <Plus />
                Créer l’événement
              </DropdownMenuItem>
            ) : null}
            {primary !== "duplicate" ? (
              <DropdownMenuItem onSelect={() => void classifyFinding(finding, "duplicate")}>
                <Copy />
                Classer en doublon
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => void classifyFinding(finding, "out_of_scope")}>
              <X />
              Hors sujet
            </DropdownMenuItem>
            {primary !== "archive" ? (
              <DropdownMenuItem onSelect={() => void classifyFinding(finding, "archived")}>
                <Archive />
                Archiver
              </DropdownMenuItem>
            ) : null}
          </RowActionsMenu>
        </div>
      </li>
    );
  }

  const resultCount = tab === "findings" ? visibleFindings.length : visibleSources.length;

  return (
    <div className="space-y-5">
      <DirectoryHeader
        title="Collecte"
        meta={[
          `${dueSources.length} à revoir`,
          plural(sources.length, "source"),
          lastReviewAt ? `dernière revue ${fromNow(lastReviewAt)}` : "aucune revue pour l’instant",
        ]}
        actions={
          <Button size="sm" onClick={() => openSourceDialog(null)}>
            <Plus />
            Ajouter une source
          </Button>
        }
      />

      <div className="space-y-3">
        <DirectorySegments
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "due", label: "À revoir", count: dueSources.length, attention: true },
            ...(showFindingsTab ? [{ value: "findings" as const, label: "Trouvailles", count: findings.length }] : []),
            { value: "all", label: "Toutes les sources", count: sources.length },
          ]}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DirectorySearch
            value={search}
            onChange={setSearch}
            placeholder={tab === "findings" ? "Rechercher une trouvaille…" : "Rechercher une source…"}
          />
          {tab === "findings" ? (
            <div className="flex flex-wrap items-center gap-2">
              {pastFindings.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={archivePastFindings}>
                  <Archive />
                  Archiver les {plural(pastFindings.length, "passée")}
                </Button>
              ) : null}
              {duplicateFindings.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={classifyDuplicateFindings}>
                  <Copy />
                  Classer {plural(duplicateFindings.length, "doublon")}
                </Button>
              ) : null}
            </div>
          ) : (
            <SegmentedControl
              aria-label="Type de source"
              size="sm"
              value={kindFilter}
              onValueChange={setKindFilter}
              items={[
                { value: "all", label: "Toutes" },
                { value: "website", label: "Sites", icon: <Globe /> },
                { value: "social", label: "Réseaux", icon: <Instagram /> },
              ]}
            />
          )}
          <span className="text-sm text-muted-foreground sm:ml-auto">{plural(resultCount, "résultat")}</span>
        </div>
      </div>

      {tab === "findings" ? (
        visibleFindings.length === 0 ? (
          <ManagementEmptyState
            icon={findings.length === 0 ? <Inbox /> : <Search />}
            title={findings.length === 0 ? "Aucune trouvaille en attente" : "Aucun résultat"}
            description={
              findings.length === 0
                ? "Les événements repérés lors d’un scan sont désormais créés directement en attente dans Événements."
                : "Aucune trouvaille ne correspond à cette recherche."
            }
          />
        ) : (
          <DirectoryTableCard>
            <ul className="divide-y divide-border">{visibleFindings.map(renderFindingRow)}</ul>
          </DirectoryTableCard>
        )
      ) : visibleSources.length === 0 ? (
        sources.length === 0 ? (
          <ManagementEmptyState
            icon={<Globe />}
            title="Aucune source suivie"
            description="Le site ou les réseaux d’un lieu ou d’un organisateur sont suivis automatiquement dès qu’ils sont renseignés sur sa fiche. Tu peux aussi ajouter un agenda à surveiller."
            action={
              <Button size="sm" onClick={() => openSourceDialog(null)}>
                <Plus />
                Ajouter une source
              </Button>
            }
          />
        ) : tab === "due" && dueSources.length === 0 ? (
          <ManagementEmptyState
            icon={<CheckCircle2 />}
            title="Tout est à jour"
            description={
              nextReview
                ? `Prochaine revue : ${nextReview.name}, le ${shortDay(nextReview.next_scan_at)}.`
                : "Aucune source à revoir pour le moment."
            }
          />
        ) : (
          <ManagementEmptyState
            icon={<Search />}
            title="Aucun résultat"
            description="Aucune source ne correspond à ces filtres."
          />
        )
      ) : (
        <DirectoryTableCard>
          <ul className="divide-y divide-border">{visibleSources.map(renderSourceRow)}</ul>
        </DirectoryTableCard>
      )}

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogTitle className="sr-only">{scanTarget ? `Scanner ${scanTarget.name}` : "Scanner une source"}</DialogTitle>
          <DialogDescription className="sr-only">
            Événements repérés sur la page de la source, à importer en attente de validation.
          </DialogDescription>
          {scanTarget?.scanUrl && owners ? (
            <AgendaImportPanel
              key={`${scanTarget.id}-${scanKey}`}
              url={scanTarget.scanUrl}
              title={scanTarget.name}
              ownerOptions={ownerOptions}
              ownerId={scanOwnerId}
              onOwnerChange={setScanOwnerId}
              owners={owners}
              loadReferences={loadReferences}
              onImportAsSingle={() => {
                setScanOpen(false);
                openEventCreation({ importUrl: scanTarget.scanUrl ?? undefined, ownerId: scanOwnerId || undefined });
              }}
              onImported={() => notifyAdminEventsChanged()}
              onFinished={(created) => void markReviewed(scanTarget, created)}
              onClose={() => setScanOpen(false)}
              reviewAction={{
                label: "Marquer comme revue",
                onClick: () => {
                  setScanOpen(false);
                  void markReviewed(scanTarget);
                },
              }}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Préparation du scan…
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <SourceForm
            key={sourceFormKey}
            source={editedSource}
            sources={sources}
            onCancel={() => setSourceDialogOpen(false)}
            onSaved={() => {
              setSourceDialogOpen(false);
              void loadData();
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialogComponent />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ajout / modification d'une source libre                              */
/* ------------------------------------------------------------------ */

function SourceForm({
  source,
  sources,
  onCancel,
  onSaved,
}: {
  /** Source libre à modifier, ou null pour en ajouter une. */
  source: CollecteSource | null;
  sources: CollecteSource[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = React.useState(source?.url ?? "");
  const [name, setName] = React.useState(source?.name ?? "");
  const [frequency, setFrequency] = React.useState(String(source?.scan_frequency_days ?? 7));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function suggestName() {
    if (name.trim()) return;
    const normalized = normalizeUrlInput(url);
    if (!normalized) return;
    const kind = getSourceKind(normalized);
    setName(kind === "website" ? hostOf(normalized) : getAddressLabel(normalized, kind));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = normalizeUrlInput(url);
    if (!normalizedUrl) {
      setError("Adresse invalide : colle le lien complet de la page à suivre.");
      return;
    }
    if (!name.trim()) {
      setError("Donne un nom à la source.");
      return;
    }
    const existing = sources.find((entry) => entry.id !== source?.id && urlKey(entry.url) === urlKey(normalizedUrl));
    if (existing) {
      setError(`Cette adresse est déjà suivie : ${existing.name}.`);
      return;
    }

    const kind = getSourceKind(normalizedUrl);
    const payload = {
      name: name.trim(),
      url: normalizedUrl,
      type: kind,
      default_capture_mode: kind === "facebook" ? "facebook" : "url",
      scan_frequency_days: Number(frequency) || 7,
    };

    setSaving(true);
    setError(null);
    const { error: saveError } = source
      ? await supabase.from("event_sources").update(payload).eq("id", source.id)
      : await supabase.from("event_sources").insert({
          ...payload,
          source_scope: "global",
          next_scan_at: new Date().toISOString(),
          created_by: await currentUserId(),
        });
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    toast({
      title: source ? "Source mise à jour" : "Source ajoutée",
      description: source ? undefined : "Elle apparaît dans « À revoir ».",
      variant: "success",
    });
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{source ? "Modifier la source" : "Ajouter une source"}</DialogTitle>
        <DialogDescription>
          {source
            ? "Page suivie en dehors des fiches des lieux et organisateurs."
            : "Un agenda, une billetterie ou un compte à surveiller. Le site d’un lieu ou d’un organisateur se renseigne plutôt sur sa fiche : il est alors suivi automatiquement."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="collecte-source-url">Adresse</Label>
          <Input
            id="collecte-source-url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            onBlur={suggestName}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="collecte-source-name">Nom</Label>
          <Input
            id="collecte-source-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="Agenda culturel de la ville"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="collecte-source-frequency">Fréquence de revue</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger id="collecte-source-frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((option) => (
                <SelectItem key={option.days} value={String(option.days)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {source ? "Enregistrer" : "Ajouter"}
        </Button>
      </DialogFooter>
    </form>
  );
}
