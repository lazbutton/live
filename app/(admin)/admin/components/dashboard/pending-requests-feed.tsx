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
import { formatRequestDateTime } from "../requests/request-ui";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ArrowRight, ChevronRight } from "lucide-react";

export type PendingRequestsFeedProps = {
  refreshKey?: number;
};

function getLaneBadgeVariant(lane: AdminRequestLane): BadgeProps["variant"] {
  switch (lane) {
    case "ready":
      return "success";
    case "to_process":
      return "warning";
    case "from_url":
      return "info";
    case "blocked":
      return "destructive";
    case "processed":
      return "muted";
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
          <CardTitle>Demandes à traiter</CardTitle>
          <CardDescription>Chargement…</CardDescription>
        </CardHeader>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (requests.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Demandes à traiter</CardTitle>
          <CardDescription>Aperçu de la file. Le traitement complet se fait dans la file dédiée.</CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => router.push("/admin/requests")}>
          Voir la file
          <ArrowRight />
        </Button>
      </CardHeader>
      <ul className="divide-y divide-border">
        {requests.map((r) => {
          const proposedDate = r.eventDate || null;
          const requestedAt = formatRequestDateTime(r.requestedAt);
          const age = formatRequestAgeShort(r.requestedAt);
          const meta = [
            `Demandée ${requestedAt}${age ? ` (${age})` : ""}`,
            proposedDate ? `Événement ${formatDateWithoutTimezone(proposedDate, "PPp")}` : null,
            r.locationSummary || null,
          ].filter(Boolean);

          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => router.push(`/admin/requests?request=${r.id}`)}
                className="group flex w-full items-center gap-4 px-5 py-3.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta.join(" · ")}</div>
                </div>
                <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
                  {r.missingFields.length > 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      {r.missingFields.length} champ{r.missingFields.length > 1 ? "s" : ""} manquant{r.missingFields.length > 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="text-muted-foreground">
                    {getRequestTypeLabel(r.requestType)}
                  </Badge>
                  <Badge variant={getLaneBadgeVariant(r.lane)}>{getRequestLaneLabel(r.lane)}</Badge>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
