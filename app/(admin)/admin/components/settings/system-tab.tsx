"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { CheckCircle2, RefreshCw } from "lucide-react";

import { CronsManagement } from "../crons-management";
import { ShareNetworkContent } from "../share-network-content";

type PendingFeedback = {
  id: string;
  description: string;
  created_at: string;
  feedback_object?: { name?: string | null } | null;
};

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

export function SystemTab() {
  const [feedbacks, setFeedbacks] = React.useState<PendingFeedback[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [workingId, setWorkingId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadPending = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("feedbacks")
        .select(
          `
          id,
          description,
          created_at,
          feedback_object:feedback_objects(name)
        `,
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      setFeedbacks((data || []) as PendingFeedback[]);
    } catch (e) {
      console.error("Erreur chargement feedbacks pending:", e);
      toast({
        title: "Impossible de charger les feedbacks",
        description: "Réessaie dans un instant.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function markAsRead(id: string) {
    setWorkingId(id);
    try {
      const { error } = await supabase
        .from("feedbacks")
        .update({ status: "read", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      toast({ title: "Feedback marqué comme lu", variant: "success" });
    } catch (e) {
      console.error("Erreur feedback read:", e);
      toast({
        title: "Action impossible",
        description: "Le feedback n’a pas pu être mis à jour.",
        variant: "destructive",
      });
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div id="crons" className="scroll-mt-24">
        <CronsManagement />
      </div>

      <Separator />

      <Card id="feedbacks" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Feedbacks en attente</CardTitle>
            <CardDescription>Traitement rapide (lecture) des derniers retours utilisateurs.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPending()}
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
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-8 w-28" />
                  </div>
                  <Skeleton className="mt-3 h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-6 text-center">
              <div className="text-sm font-medium">Aucun feedback en attente</div>
              <div className="mt-1 text-sm text-muted-foreground">Tout est à jour.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((f) => (
                <div key={f.id} className="rounded-lg border p-4 bg-card">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-snug line-clamp-2">{f.description}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {f.feedback_object?.name ? `${f.feedback_object.name} • ` : ""}
                        {formatAgeShort(f.created_at)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-2"
                      onClick={() => void markAsRead(f.id)}
                      disabled={workingId === f.id}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {workingId === f.id ? "..." : "Marquer lu"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div id="share" className="scroll-mt-24">
        <ShareNetworkContent />
      </div>
    </div>
  );
}

