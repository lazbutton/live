"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { DatabaseZap, RefreshCw, RotateCw } from "lucide-react";

import { CronsManagement } from "../crons-management";
import { FeedbackManagement } from "../feedback-management";

type NotionJob = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  entity_kind: string;
  direction: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type NotionError = {
  id: string;
  entity_kind: string;
  direction: string;
  error_message: string;
  created_at: string;
};

type AdminAuditEntry = {
  id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function formatDateTime(iso?: string | null) {
  if (!iso) return "Date inconnue";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date inconnue";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotionSyncWidget() {
  const [jobs, setJobs] = React.useState<NotionJob[]>([]);
  const [errors, setErrors] = React.useState<NotionError[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [resyncing, setResyncing] = React.useState(false);

  const loadNotionStatus = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [jobsRes, errorsRes] = await Promise.all([
        supabase
          .from("notion_sync_jobs")
          .select(
            "id,status,entity_kind,direction,error_message,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("notion_sync_errors")
          .select("id,entity_kind,direction,error_message,created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (jobsRes.error) throw jobsRes.error;
      if (errorsRes.error) throw errorsRes.error;

      setJobs((jobsRes.data || []) as NotionJob[]);
      setErrors((errorsRes.data || []) as NotionError[]);
    } catch (e) {
      console.error("Erreur statut Notion:", e);
      toast({
        title: "Statut Notion indisponible",
        description: "Impossible de charger les jobs de synchronisation.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadNotionStatus();
  }, [loadNotionStatus]);

  const counts = React.useMemo(
    () =>
      jobs.reduce(
        (acc, job) => {
          acc[job.status] += 1;
          return acc;
        },
        {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          skipped: 0,
        } satisfies Record<NotionJob["status"], number>,
      ),
    [jobs],
  );

  async function runResync() {
    setResyncing(true);
    try {
      const response = await fetch("/api/notion/resync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scan_all",
          limit: 25,
          drainNow: true,
          reason: "admin_system_tab",
        }),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: "Resync Notion impossible" }));
        throw new Error(payload.error || "Resync Notion impossible");
      }

      toast({
        title: "Resync Notion lancée",
        description: "Les jobs ont été scannés et le worker a été déclenché.",
        variant: "success",
      });
      await loadNotionStatus();
    } catch (e: any) {
      console.error("Erreur resync Notion:", e);
      toast({
        title: "Resync Notion impossible",
        description: e?.message || "Vérifie la configuration Notion.",
        variant: "destructive",
      });
    } finally {
      setResyncing(false);
    }
  }

  return (
    <Card id="notion" className="scroll-mt-24">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <DatabaseZap className="h-5 w-5 text-muted-foreground" />
            Synchronisation Notion
          </CardTitle>
          <CardDescription>
            Suivi rapide des jobs, erreurs récentes et resynchronisation manuelle.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadNotionStatus()}
            disabled={refreshing || resyncing}
            className="gap-2"
          >
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Actualiser
          </Button>
          <Button
            type="button"
            onClick={() => void runResync()}
            disabled={resyncing}
            className="gap-2"
          >
            <RotateCw className={resyncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Resync
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-5">
              {Object.entries(counts).map(([status, count]) => (
                <div key={status} className="rounded-xl border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {status}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{count}</div>
                </div>
              ))}
            </div>

            {errors.length > 0 ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Dernières erreurs</div>
                  <Badge variant="destructive">{errors.length}</Badge>
                </div>
                <div className="space-y-3">
                  {errors.map((error) => (
                    <div key={error.id} className="rounded-lg border bg-background/80 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{error.entity_kind}</Badge>
                        <span>{error.direction}</span>
                        <span>{formatDateTime(error.created_at)}</span>
                      </div>
                      <div className="mt-2 line-clamp-2 text-sm">
                        {error.error_message}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-muted/25 p-4 text-sm text-muted-foreground">
                Aucune erreur Notion récente.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdminActivityLog() {
  const [entries, setEntries] = React.useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadEntries = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select(
          "id,actor_email,action,entity_type,entity_id,entity_label,metadata,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setEntries((data || []) as AdminAuditEntry[]);
    } catch (error) {
      console.error("Erreur chargement audit admin:", error);
      toast({
        title: "Journal d'activité indisponible",
        description: "La migration admin_audit_log est peut-être absente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return (
    <Card id="activity" className="scroll-mt-24">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Activité admin</CardTitle>
          <CardDescription>
            Les dernières actions critiques effectuées dans le back-office.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadEntries()}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Actualiser
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border bg-muted/25 p-6 text-center text-sm text-muted-foreground">
            Aucune activité enregistrée pour le moment.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{entry.action}</Badge>
                  <Badge variant="outline">{entry.entity_type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium">
                  {entry.entity_label || entry.entity_id || "Entité inconnue"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {entry.actor_email || "Admin inconnu"}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SystemTab() {
  return (
    <div className="space-y-8">
      <div id="crons" className="scroll-mt-24">
        <CronsManagement />
      </div>

      <Separator />

      <NotionSyncWidget />

      <Separator />

      <AdminActivityLog />

      <Separator />

      <div id="feedbacks" className="scroll-mt-24">
        <FeedbackManagement />
      </div>
    </div>
  );
}
