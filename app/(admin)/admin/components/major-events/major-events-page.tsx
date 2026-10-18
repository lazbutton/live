"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { AdminMajorEvent, MajorEventStatus } from "./types";
import {
  ManagementHero,
  ManagementStat,
  ManagementStatGrid,
} from "../management-page-primitives";

function formatDateRange(startAt: string, endAt: string) {
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  try {
    return `${formatter.format(new Date(startAt))} -> ${formatter.format(new Date(endAt))}`;
  } catch {
    return `${startAt} -> ${endAt}`;
  }
}

function getStatusBadgeVariant(
  status: MajorEventStatus,
): "success" | "warning" | "muted" | "outline" {
  switch (status) {
    case "approved":
      return "success";
    case "pending":
      return "warning";
    case "archived":
      return "muted";
    case "draft":
    default:
      return "outline";
  }
}

function getStatusLabel(status: MajorEventStatus) {
  switch (status) {
    case "approved":
      return "Publié";
    case "pending":
      return "En validation";
    case "archived":
      return "Archivé";
    case "draft":
    default:
      return "Brouillon";
  }
}

function countByMajorEventId(rows: Array<{ major_event_id: string }> | null) {
  const counts = new Map<string, number>();
  for (const row of rows || []) {
    counts.set(row.major_event_id, (counts.get(row.major_event_id) || 0) + 1);
  }
  return counts;
}

export function MajorEventsPage() {
  const [loading, setLoading] = React.useState(true);
  const [majorEvents, setMajorEvents] = React.useState<AdminMajorEvent[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | MajorEventStatus>("all");

  const loadMajorEvents = React.useCallback(async () => {
    setLoading(true);
    try {
      const [majorEventsResult, eventLinksResult, locationLinksResult, organizerLinksResult] = await Promise.all([
        supabase
          .from("major_events")
          .select(
            "id, slug, title, short_description, long_description, hero_image_url, logo_url, start_at, end_at, timezone, city_name, primary_category, tag_ids, status, is_featured, map_center_latitude, map_center_longitude, default_map_zoom, ticketing_url, official_url, created_by, created_at, updated_at",
          )
          .order("start_at", { ascending: false }),
        supabase.from("major_event_events").select("major_event_id"),
        supabase.from("major_event_locations").select("major_event_id"),
        supabase.from("major_event_organizers").select("major_event_id"),
      ]);

      if (majorEventsResult.error) throw majorEventsResult.error;
      if (eventLinksResult.error) throw eventLinksResult.error;
      if (locationLinksResult.error) throw locationLinksResult.error;
      if (organizerLinksResult.error) throw organizerLinksResult.error;

      const eventCounts = countByMajorEventId(eventLinksResult.data);
      const locationCounts = countByMajorEventId(locationLinksResult.data);
      const organizerCounts = countByMajorEventId(organizerLinksResult.data);

      const next = ((majorEventsResult.data || []) as AdminMajorEvent[]).map((majorEvent) => ({
        ...majorEvent,
        events_count: eventCounts.get(majorEvent.id) || 0,
        locations_count: locationCounts.get(majorEvent.id) || 0,
        organizers_count: organizerCounts.get(majorEvent.id) || 0,
      }));

      setMajorEvents(next);
    } catch (error) {
      console.error("Erreur chargement major events:", error);
      toast({
        title: "Chargement impossible",
        description: "Les Multi-événements n'ont pas pu être chargés.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadMajorEvents();
  }, [loadMajorEvents]);

  const filteredMajorEvents = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return majorEvents.filter((majorEvent) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        majorEvent.title.toLowerCase().includes(normalizedQuery) ||
        majorEvent.slug.toLowerCase().includes(normalizedQuery) ||
        (majorEvent.city_name || "").toLowerCase().includes(normalizedQuery);

      const matchesStatus = statusFilter === "all" || majorEvent.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [majorEvents, searchQuery, statusFilter]);

  const publishedCount = majorEvents.filter((item) => item.status === "approved").length;
  const featuredCount = majorEvents.filter((item) => item.is_featured).length;
  const totalEventsLinked = majorEvents.reduce((sum, item) => sum + (item.events_count || 0), 0);

  return (
    <div className="space-y-6">
      <ManagementHero
        title="Multi-événements"
        description="Base éditoriale des fêtes, festivals et programmations qui regroupent plusieurs événements."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadMajorEvents()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Actualiser
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/major-events/create">
                <Plus />
                Créer un Multi-événements
              </Link>
            </Button>
          </>
        }
      >
        <ManagementStatGrid className="xl:grid-cols-3">
          <ManagementStat label="Multi-événements" value={majorEvents.length} hint={`${featuredCount} mis en avant`} />
          <ManagementStat label="Publiés" value={publishedCount} />
          <ManagementStat label="Événements liés" value={totalEventsLinked} />
        </ManagementStatGrid>
      </ManagementHero>

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-0">
          <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher par titre, slug ou ville"
              className="lg:max-w-sm"
              aria-label="Rechercher un Multi-événements"
            />

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | MajorEventStatus)}>
              <SelectTrigger className="w-full lg:w-[220px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillons</SelectItem>
                <SelectItem value="pending">En validation</SelectItem>
                <SelectItem value="approved">Publiés</SelectItem>
                <SelectItem value="archived">Archivés</SelectItem>
              </SelectContent>
            </Select>

          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Chargement des Multi-événements…
            </div>
          ) : filteredMajorEvents.length == 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun Multi-événements ne correspond aux filtres actuels.
              </p>
              <div className="mt-4 flex justify-center">
                <Button asChild>
                  <Link href="/admin/major-events/create">
                    <Plus />
                    Créer le premier Multi-événements
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Liens</TableHead>
                  <TableHead>Mise en avant</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMajorEvents.map((majorEvent) => (
                  <TableRow key={majorEvent.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{majorEvent.title}</div>
                        <div className="text-xs text-muted-foreground">
                          /{majorEvent.slug}
                          {majorEvent.city_name ? ` · ${majorEvent.city_name}` : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(majorEvent.status)}>
                        {getStatusLabel(majorEvent.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateRange(majorEvent.start_at, majorEvent.end_at)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm tabular-nums text-muted-foreground">
                        {majorEvent.events_count || 0} év. · {majorEvent.locations_count || 0} lieux · {majorEvent.organizers_count || 0} orga.
                      </div>
                    </TableCell>
                    <TableCell>
                      {majorEvent.is_featured ? (
                        <Badge variant="outline">Mis en avant</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Standard</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/major-events/${majorEvent.id}`}>
                          Ouvrir
                          <ArrowRight />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!loading && majorEvents.length > 0 ? (
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {filteredMajorEvents.length} Multi-événements affiché{filteredMajorEvents.length > 1 ? "s" : ""} · {featuredCount} mis en avant
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
