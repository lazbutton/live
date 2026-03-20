"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import { toast } from "@/components/ui/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ArrowRight, ThumbsDown } from "lucide-react";

type RequestType = "event_creation" | "event_from_url";
type RequestStatus = "pending" | "approved" | "rejected" | "converted";

export type UserRequest = {
  id: string;
  requested_at: string;
  status: RequestStatus;
  request_type?: RequestType;
  requested_by?: string | null;
  source_url?: string | null;
  location_id?: string | null;
  location_name?: string | null;
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
};

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

function getTitle(r: UserRequest) {
  return r.event_data?.title || (r.source_url ? safeDomainFromUrl(r.source_url) : "(sans titre)");
}

function getTypeLabel(r: UserRequest) {
  return r.request_type === "event_from_url" ? "URL" : "Complet";
}

export type PendingRequestsFeedProps = {
  onConvert: (request: UserRequest) => void;
  refreshKey?: number;
};

export function PendingRequestsFeed({ onConvert, refreshKey }: PendingRequestsFeedProps) {
  const [requests, setRequests] = React.useState<UserRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [workingId, setWorkingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_requests")
        .select("*")
        .eq("status", "pending")
        .in("request_type", ["event_creation", "event_from_url"])
        .order("requested_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setRequests((data || []) as UserRequest[]);
    } catch (e) {
      console.error("Erreur load user_requests:", e);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function rejectRequest(id: string) {
    setWorkingId(id);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;

      const { error } = await supabase
        .from("user_requests")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast({ title: "Demande rejetée", variant: "success" });
    } catch (e: any) {
      console.error("Erreur reject request:", e);
      toast({
        title: "Rejet impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setWorkingId(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Demandes en attente</CardTitle>
          <CardDescription>Chargement…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-9 w-36" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Demandes en attente</CardTitle>
        <CardDescription>Inbox rapide (5 dernières).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => {
          const title = getTitle(r);
          const typeLabel = getTypeLabel(r);
          const proposedDate = r.event_data?.date || null;
          const age = formatAgeShort(r.requested_at);

          return (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {age}
                    {proposedDate ? ` • ${formatDateWithoutTimezone(proposedDate, "PPp")}` : ""}
                  </div>
                </div>
                <Badge variant={typeLabel === "URL" ? "outline" : "secondary"} className="shrink-0">
                  {typeLabel}
                </Badge>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => onConvert(r)}
                >
                  Convertir en événement
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  onClick={() => void rejectRequest(r.id)}
                  disabled={workingId === r.id}
                >
                  <ThumbsDown className="h-4 w-4" />
                  {workingId === r.id ? "..." : "Rejeter"}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

