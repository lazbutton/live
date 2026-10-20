"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { RefreshCw } from "lucide-react";

import { CronsManagement } from "../crons-management";
import { FeedbackManagement } from "../feedback-management";

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

      <AdminActivityLog />

      <Separator />

      <div id="feedbacks" className="scroll-mt-24">
        <FeedbackManagement />
      </div>
    </div>
  );
}
