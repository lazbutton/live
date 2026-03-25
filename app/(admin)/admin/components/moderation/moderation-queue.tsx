"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock3,
  EyeOff,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  UserX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type ModerationStatus = "pending" | "under_review" | "actioned" | "dismissed";
type StatusFilter = "all" | "open" | ModerationStatus;

type ModerationReport = {
  id: string;
  reporter_user_id: string;
  target_event_id: string;
  reported_user_id: string | null;
  reason_code: string;
  details: string | null;
  block_requested: boolean;
  status: ModerationStatus;
  review_due_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
  created_at: string;
};

type EventSummary = {
  id: string;
  title: string;
  date: string;
  address?: string | null;
  locations?: {
    name?: string | null;
  } | null;
  status: string;
  is_safety_hidden: boolean;
  created_by: string | null;
};

type AdminUser = {
  id: string;
  email: string;
  role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  ugc_suspended?: boolean;
  ugc_suspension_reason?: string | null;
};

type ActionDraft = {
  hideEvent: boolean;
  suspendUser: boolean;
};

const statusLabels: Record<ModerationStatus, string> = {
  pending: "En attente",
  under_review: "Sous revue",
  actioned: "Traité",
  dismissed: "Écarté",
};

const reasonLabels: Record<string, string> = {
  abuse: "Abus ou menace",
  harassment: "Harcèlement",
  hate: "Discours haineux",
  sexual: "Contenu sexuel",
  violence: "Violence choquante",
  spam: "Spam ou arnaque",
  illegal: "Contenu illégal",
  impersonation: "Usurpation",
  other: "Autre",
};

const defaultActionDraft: ActionDraft = {
  hideEvent: false,
  suspendUser: false,
};

function getStatusVariant(status: ModerationStatus) {
  switch (status) {
    case "pending":
      return "destructive" as const;
    case "under_review":
      return "secondary" as const;
    case "actioned":
      return "default" as const;
    case "dismissed":
      return "outline" as const;
  }
}

function getUserDisplayName(user?: AdminUser | null) {
  if (!user) return "Utilisateur inconnu";
  if (user.full_name?.trim()) return user.full_name.trim();

  const composedName = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (composedName) return composedName;

  return user.email?.trim() || "Utilisateur sans email";
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "Date inconnue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date inconnue";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const absoluteMinutes = Math.abs(diffMinutes);

  if (absoluteMinutes < 60) {
    if (diffMinutes >= 0) return `dans ${absoluteMinutes} min`;
    return `il y a ${absoluteMinutes} min`;
  }

  const absoluteHours = Math.round(absoluteMinutes / 60);
  if (absoluteHours < 24) {
    if (diffMinutes >= 0) return `dans ${absoluteHours} h`;
    return `il y a ${absoluteHours} h`;
  }

  const absoluteDays = Math.round(absoluteHours / 24);
  if (diffMinutes >= 0) return `dans ${absoluteDays} j`;
  return `il y a ${absoluteDays} j`;
}

function getEventLocationLabel(event?: EventSummary | null) {
  return event?.locations?.name?.trim() || event?.address?.trim() || "";
}

function isResolved(status: ModerationStatus) {
  return status === "actioned" || status === "dismissed";
}

function isOverdue(report: ModerationReport) {
  if (isResolved(report.status)) return false;
  const dueTime = new Date(report.review_due_at).getTime();
  if (Number.isNaN(dueTime)) return false;
  return dueTime < Date.now();
}

export function ModerationQueue() {
  const [reports, setReports] = React.useState<ModerationReport[]>([]);
  const [eventsById, setEventsById] = React.useState<Record<string, EventSummary>>(
    {},
  );
  const [usersById, setUsersById] = React.useState<Record<string, AdminUser>>({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [workingId, setWorkingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("open");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>({});
  const [actionDrafts, setActionDrafts] = React.useState<
    Record<string, ActionDraft>
  >({});

  const loadQueue = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [{ data: reportsData, error: reportsError }, usersResponse] =
        await Promise.all([
          supabase
            .from("content_reports")
            .select(
              "id, reporter_user_id, target_event_id, reported_user_id, reason_code, details, block_requested, status, review_due_at, reviewed_at, reviewed_by, admin_note, created_at",
            )
            .order("review_due_at", { ascending: true })
            .order("created_at", { ascending: false })
            .limit(200),
          fetch("/api/admin/users/list"),
        ]);

      if (reportsError) throw reportsError;
      if (!usersResponse.ok) {
        const usersError = await usersResponse
          .json()
          .catch(() => ({ error: "Impossible de récupérer les utilisateurs" }));
        throw new Error(usersError.error || "Impossible de récupérer les utilisateurs");
      }

      const normalizedReports = (reportsData || []) as ModerationReport[];
      const { users } = (await usersResponse.json()) as { users?: AdminUser[] };

      const eventIds = Array.from(
        new Set(
          normalizedReports
            .map((report) => report.target_event_id)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const { data: eventsData, error: eventsError } = eventIds.length
        ? await supabase
            .from("events")
            .select(
              "id, title, date, address, status, is_safety_hidden, created_by, locations(name)",
            )
            .in("id", eventIds)
        : { data: [], error: null };

      if (eventsError) throw eventsError;

      const nextEventsById = Object.fromEntries(
        ((eventsData || []) as EventSummary[]).map((event) => [event.id, event]),
      );
      const nextUsersById = Object.fromEntries(
        (users || []).map((user) => [user.id, user]),
      );

      setReports(normalizedReports);
      setEventsById(nextEventsById);
      setUsersById(nextUsersById);
      setNoteDrafts((current) => {
        const next = { ...current };
        for (const report of normalizedReports) {
          if (next[report.id] === undefined) {
            next[report.id] = report.admin_note || "";
          }
        }
        return next;
      });
      setActionDrafts((current) => {
        const next = { ...current };
        for (const report of normalizedReports) {
          if (next[report.id] === undefined) {
            next[report.id] = { ...defaultActionDraft };
          }
        }
        return next;
      });
    } catch (error: any) {
      console.error("Erreur chargement modération:", error);
      toast({
        title: "Impossible de charger la file",
        description: error?.message || "Réessaie dans un instant.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      void loadQueue({ silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadQueue]);

  const counts = React.useMemo(() => {
    return reports.reduce(
      (acc, report) => {
        if (report.status === "pending") acc.pending += 1;
        if (report.status === "under_review") acc.underReview += 1;
        if (report.status === "actioned") acc.actioned += 1;
        if (isOverdue(report)) acc.overdue += 1;
        return acc;
      },
      { pending: 0, underReview: 0, actioned: 0, overdue: 0 },
    );
  }, [reports]);

  const filteredReports = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return reports.filter((report) => {
      if (statusFilter === "open" && isResolved(report.status)) {
        return false;
      }

      if (
        statusFilter !== "all" &&
        statusFilter !== "open" &&
        report.status !== statusFilter
      ) {
        return false;
      }

      if (overdueOnly && !isOverdue(report)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const event = eventsById[report.target_event_id];
      const reporter = usersById[report.reporter_user_id];
      const reportedUser = report.reported_user_id
        ? usersById[report.reported_user_id]
        : undefined;

      const searchableText = [
        report.id,
        report.reason_code,
        reasonLabels[report.reason_code] || report.reason_code,
        report.details || "",
        event?.title || "",
        getEventLocationLabel(event),
        reporter?.email || "",
        getUserDisplayName(reporter),
        reportedUser?.email || "",
        getUserDisplayName(reportedUser),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [eventsById, overdueOnly, reports, searchQuery, statusFilter, usersById]);

  async function applyModerationAction(
    report: ModerationReport,
    payload: {
      status?: ModerationStatus;
      eventSafetyHidden?: boolean;
      userUgcSuspended?: boolean;
      adminNote?: string;
    },
    successTitle: string,
    successDescription: string,
  ) {
    setWorkingId(report.id);

    try {
      const response = await fetch(`/api/admin/moderation/reports/${report.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Action impossible" }));
        throw new Error(errorData.error || "Action impossible");
      }

      await loadQueue({ silent: true });
      setActionDrafts((current) => ({
        ...current,
        [report.id]: { ...defaultActionDraft },
      }));

      toast({
        title: successTitle,
        description: successDescription,
      });
    } catch (error: any) {
      console.error("Erreur action modération:", error);
      toast({
        title: "Action impossible",
        description: error?.message || "La mise à jour a échoué.",
        variant: "destructive",
      });
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle>File de modération UGC</CardTitle>
            <CardDescription>
              Les signalements ouverts doivent être pris en charge sous 24h.
              Utilise cette vue pour qualifier, masquer et suspendre si
              nécessaire.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void loadQueue({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">En attente</div>
              <div className="mt-2 text-3xl font-semibold">{counts.pending}</div>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Sous revue</div>
              <div className="mt-2 text-3xl font-semibold">{counts.underReview}</div>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">En retard</div>
              <div className="mt-2 text-3xl font-semibold text-destructive">
                {counts.overdue}
              </div>
            </CardContent>
          </Card>
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Traités</div>
              <div className="mt-2 text-3xl font-semibold">{counts.actioned}</div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher un signalement, un événement ou un utilisateur"
              className="pl-10"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Ouverts uniquement</SelectItem>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="under_review">Sous revue</SelectItem>
                <SelectItem value="actioned">Traités</SelectItem>
                <SelectItem value="dismissed">Écartés</SelectItem>
              </SelectContent>
            </Select>

            <label className="flex min-h-10 items-center gap-3 rounded-md border px-3 py-2">
              <Checkbox
                checked={overdueOnly}
                onCheckedChange={(checked) => setOverdueOnly(checked === true)}
              />
              <span className="text-sm">Montrer seulement les retards</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-6 w-28" />
                </div>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground/50" />
            <div className="space-y-1">
              <div className="font-medium">Aucun signalement à afficher</div>
              <div className="text-sm text-muted-foreground">
                Ajuste les filtres ou attends le prochain signalement.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredReports.map((report) => {
            const event = eventsById[report.target_event_id];
            const reporter = usersById[report.reporter_user_id];
            const reportedUser = report.reported_user_id
              ? usersById[report.reported_user_id]
              : undefined;
            const noteValue = noteDrafts[report.id] ?? report.admin_note ?? "";
            const actionDraft = actionDrafts[report.id] ?? defaultActionDraft;
            const overdue = isOverdue(report);
            const resolved = isResolved(report.status);

            return (
              <Card
                key={report.id}
                className={cn(overdue && "border-destructive/50 shadow-sm")}
              >
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getStatusVariant(report.status)}>
                          {statusLabels[report.status]}
                        </Badge>
                        <Badge variant="outline">
                          {reasonLabels[report.reason_code] || report.reason_code}
                        </Badge>
                        {report.block_requested && (
                          <Badge variant="destructive">Blocage demandé</Badge>
                        )}
                        {overdue && (
                          <Badge variant="destructive">
                            <Clock3 className="mr-1 h-3.5 w-3.5" />
                            Délai dépassé
                          </Badge>
                        )}
                        {event?.is_safety_hidden && (
                          <Badge variant="secondary">
                            <EyeOff className="mr-1 h-3.5 w-3.5" />
                            Événement masqué
                          </Badge>
                        )}
                        {reportedUser?.ugc_suspended && (
                          <Badge variant="secondary">
                            <UserX className="mr-1 h-3.5 w-3.5" />
                            UGC suspendu
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-1">
                        <CardTitle className="text-xl">
                          {event?.title || "Événement introuvable"}
                        </CardTitle>
                        <CardDescription>
                          Signalé {formatRelative(report.created_at)} • échéance{" "}
                          {formatDateTime(report.review_due_at)}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Report #{report.id.slice(0, 8)}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Utilisateur signalé
                      </div>
                      <div className="mt-2 font-medium">
                        {getUserDisplayName(reportedUser)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {reportedUser?.email || report.reported_user_id || "Non renseigné"}
                      </div>
                      {reportedUser?.ugc_suspension_reason && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Motif actuel : {reportedUser.ugc_suspension_reason}
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Signalé par
                      </div>
                      <div className="mt-2 font-medium">
                        {getUserDisplayName(reporter)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {reporter?.email || report.reporter_user_id}
                      </div>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Événement
                      </div>
                      <div className="mt-2 font-medium">
                        {getEventLocationLabel(event) || "Lieu non renseigné"}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {event ? formatDateTime(event.date) : "Événement absent"}
                      </div>
                      {report.reviewed_at && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Clôturé le {formatDateTime(report.reviewed_at)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Détails du signalement
                    </div>
                    <div className="mt-2 text-sm leading-6">
                      {report.details?.trim() || "Aucun détail complémentaire fourni."}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`note-${report.id}`}>Note interne</Label>
                    <Textarea
                      id={`note-${report.id}`}
                      value={noteValue}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [report.id]: event.target.value,
                        }))
                      }
                      placeholder="Décision, justification, éléments à suivre..."
                      rows={4}
                    />
                  </div>

                  {!resolved && (
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex items-start gap-3 rounded-md border p-3">
                          <Checkbox
                            checked={actionDraft.hideEvent}
                            onCheckedChange={(checked) =>
                              setActionDrafts((current) => ({
                                ...current,
                                [report.id]: {
                                  ...(current[report.id] || defaultActionDraft),
                                  hideEvent: checked === true,
                                },
                              }))
                            }
                          />
                          <div>
                            <div className="font-medium">
                              Masquer l'événement du feed public
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Applique `is_safety_hidden = true` sur l'événement
                              lié au signalement.
                            </div>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 rounded-md border p-3">
                          <Checkbox
                            checked={actionDraft.suspendUser}
                            disabled={!report.reported_user_id}
                            onCheckedChange={(checked) =>
                              setActionDrafts((current) => ({
                                ...current,
                                [report.id]: {
                                  ...(current[report.id] || defaultActionDraft),
                                  suspendUser: checked === true,
                                },
                              }))
                            }
                          />
                          <div>
                            <div className="font-medium">
                              Suspendre l'UGC de l'auteur signalé
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Empêche immédiatement les futures publications UGC.
                            </div>
                          </div>
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {report.status === "pending" && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={workingId === report.id}
                            onClick={() =>
                              void applyModerationAction(
                                report,
                                {
                                  status: "under_review",
                                  adminNote: noteValue,
                                },
                                "Signalement pris en charge",
                                "Le report est désormais en cours de traitement.",
                              )
                            }
                          >
                            {workingId === report.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Clock3 className="mr-2 h-4 w-4" />
                            )}
                            Prendre en charge
                          </Button>
                        )}

                        <Button
                          type="button"
                          disabled={workingId === report.id}
                          onClick={() =>
                            void applyModerationAction(
                              report,
                              {
                                status: "actioned",
                                adminNote: noteValue,
                                eventSafetyHidden: actionDraft.hideEvent
                                  ? true
                                  : undefined,
                                userUgcSuspended: actionDraft.suspendUser
                                  ? true
                                  : undefined,
                              },
                              "Signalement clôturé",
                              "La décision de modération a bien été enregistrée.",
                            )
                          }
                        >
                          {workingId === report.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          {actionDraft.hideEvent || actionDraft.suspendUser
                            ? "Clore avec action"
                            : "Clore"}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          disabled={workingId === report.id}
                          onClick={() =>
                            void applyModerationAction(
                              report,
                              {
                                status: "dismissed",
                                adminNote: noteValue,
                              },
                              "Signalement écarté",
                              "Le report a été fermé sans action supplémentaire.",
                            )
                          }
                        >
                          Écarter
                        </Button>
                      </div>
                    </div>
                  )}

                  {(event?.is_safety_hidden || reportedUser?.ugc_suspended) && (
                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      {event?.is_safety_hidden && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={workingId === report.id}
                          onClick={() =>
                            void applyModerationAction(
                              report,
                              {
                                adminNote: noteValue,
                                eventSafetyHidden: false,
                              },
                              "Événement réaffiché",
                              "Le masquage sécurité de l'événement a été levé.",
                            )
                          }
                        >
                          Réafficher l'événement
                        </Button>
                      )}

                      {reportedUser?.ugc_suspended && report.reported_user_id && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={workingId === report.id}
                          onClick={() =>
                            void applyModerationAction(
                              report,
                              {
                                adminNote: noteValue,
                                userUgcSuspended: false,
                              },
                              "Suspension levée",
                              "L'utilisateur peut de nouveau utiliser les fonctionnalités UGC.",
                            )
                          }
                        >
                          Lever la suspension UGC
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
