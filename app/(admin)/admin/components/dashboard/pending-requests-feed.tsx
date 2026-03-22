"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import {
  type AdminRequestItem,
  type AdminRequestLane,
  fetchAdminRequestItems,
  filterAdminRequests,
  formatRequestAgeShort,
  getRequestLaneLabel,
  getRequestTypeLabel,
} from "@/lib/admin-requests";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ArrowRight } from "lucide-react";

export type PendingRequestsFeedProps = {
  refreshKey?: number;
};

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

export function PendingRequestsFeed({ refreshKey }: PendingRequestsFeedProps) {
  const router = useRouter();
  const [requests, setRequests] = React.useState<AdminRequestItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchAdminRequestItems();
      const preview = ["ready", "to_process", "from_url"].flatMap((lane) =>
        filterAdminRequests(items, {
          lane: lane as AdminRequestLane,
          query: "",
          typeFilter: "all",
          periodFilter: "all",
        })
      );

      setRequests(preview.slice(0, 5));
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
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-lg">Demandes</CardTitle>
          <CardDescription>Aperçu cohérent de la file. Le traitement complet se fait dans l'inbox dédiée.</CardDescription>
        </div>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/requests")}>
          Voir toute la file
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => {
          const proposedDate = r.eventDate || null;
          const age = formatRequestAgeShort(r.requestedAt);

          return (
            <div key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {age}
                    {proposedDate ? ` • ${formatDateWithoutTimezone(proposedDate, "PPp")}` : ""}
                    {r.locationSummary ? ` • ${r.locationSummary}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge className={getLaneBadgeClassName(r.lane)}>{getRequestLaneLabel(r.lane)}</Badge>
                  <Badge variant={r.requestType === "event_from_url" ? "outline" : "secondary"}>{getRequestTypeLabel(r.requestType)}</Badge>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {r.missingFields.length > 0 && <Badge variant="outline">{r.missingFields.length} champ(s) manquant(s)</Badge>}
                  {r.sourceUrl && <Badge variant="outline">Source disponible</Badge>}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => router.push(`/admin/requests?request=${r.id}`)}
                >
                  Ouvrir
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

