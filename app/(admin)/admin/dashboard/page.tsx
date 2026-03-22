"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { fetchPendingAdminRequestsCount } from "@/lib/admin-requests";
import { AdminLayout } from "../components/admin-layout";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

import type {
  AdminEvent,
  ArtistOption,
  CategoryOption,
  LocationData,
  OrganizerOption,
  TagOption,
} from "../components/events/types";

import { KpiCards } from "../components/dashboard/kpi-cards";
import { WeekTimeline } from "../components/dashboard/week-timeline";
import { PendingRequestsFeed } from "../components/dashboard/pending-requests-feed";
import { QuickActions } from "../components/dashboard/quick-actions";
import { EventFormSheet } from "../components/events/event-form-sheet";

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);

  const [pendingEvents, setPendingEvents] = React.useState(0);
  const [weekCount, setWeekCount] = React.useState(0);
  const [pendingRequests, setPendingRequests] = React.useState(0);

  const [weekEvents, setWeekEvents] = React.useState<AdminEvent[]>([]);

  const [locations, setLocations] = React.useState<LocationData[]>([]);
  const [organizers, setOrganizers] = React.useState<OrganizerOption[]>([]);
  const [artists, setArtists] = React.useState<ArtistOption[]>([]);
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);

  const [selectedEvent, setSelectedEvent] = React.useState<AdminEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const loadRefs = React.useCallback(async () => {
    const [locRes, orgRes, artistRes, tagRes, catRes] = await Promise.all([
      supabase.from("locations").select("id, name, address, capacity, latitude, longitude"),
      Promise.all([
        supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name"),
        supabase.from("locations").select("id, name, instagram_url, facebook_url").eq("is_organizer", true).order("name"),
      ]),
      supabase.from("artists").select("id, name, slug, image_url").order("name"),
      supabase.from("tags").select("id, name").order("name"),
      supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    ]);

    if (locRes.error) throw locRes.error;
    if (artistRes.error) throw artistRes.error;
    if (tagRes.error) throw tagRes.error;
    if (catRes.error) throw catRes.error;

    const [orgs, locs] = orgRes;
    if (orgs.error) throw orgs.error;
    if (locs.error) throw locs.error;

    setLocations((locRes.data || []) as LocationData[]);
    setArtists((artistRes.data || []) as ArtistOption[]);
    setTags((tagRes.data || []) as TagOption[]);
    setCategories((catRes.data || []) as CategoryOption[]);
    setOrganizers([
      ...((orgs.data || []) as any[]).map((o) => ({ ...o, type: "organizer" as const })),
      ...((locs.data || []) as any[]).map((l) => ({ ...l, type: "location" as const })),
    ]);
  }, []);

  const loadDashboardData = React.useCallback(async () => {
    setLoading(true);
    try {
      const today = startOfLocalDay(new Date());
      const end = new Date(today);
      end.setDate(end.getDate() + 7);

      const [
        pendingEventsRes,
        weekCountRes,
        weekEventsRes,
        pendingRequestsCount,
      ] = await Promise.all([
        supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("events").select("*", { count: "exact", head: true }).gte("date", today.toISOString()).lt("date", end.toISOString()),
        supabase
          .from("events")
          .select(
            `
            *,
            location:locations(id, name),
            event_organizers:event_organizers(
              organizer:organizers(id, name),
              location:locations(id, name)
            ),
            event_artists:event_artists(
              artist_id,
              role_label,
              sort_index,
              artist:artists(id, name, slug, image_url)
            ),
            major_event_events(
              major_event_id,
              major_event:major_events(id, title, slug)
            )
          `,
          )
          .gte("date", today.toISOString())
          .lt("date", end.toISOString())
          .order("date", { ascending: true }),
        fetchPendingAdminRequestsCount(),
      ]);

      if (pendingEventsRes.error) throw pendingEventsRes.error;
      if (weekCountRes.error) throw weekCountRes.error;
      if (weekEventsRes.error) throw weekEventsRes.error;

      setPendingEvents(pendingEventsRes.count ?? 0);
      setWeekCount(weekCountRes.count ?? 0);
      setPendingRequests(pendingRequestsCount);
      setWeekEvents((weekEventsRes.data || []) as AdminEvent[]);
    } catch (e) {
      console.error("Erreur dashboard:", e);
      toast({
        title: "Dashboard indisponible",
        description: "Réessaie dans un instant.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void Promise.all([loadRefs(), loadDashboardData()]);
  }, [loadDashboardData, loadRefs]);

  function openRequestsInbox() {
    router.push("/admin/requests");
  }

  function openEditEvent(ev: AdminEvent) {
    setSelectedEvent(ev);
    setIsFormOpen(true);
  }

  if (loading) {
    return (
      <AdminLayout title="Dashboard" breadcrumbItems={[{ label: "Dashboard" }]}>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Dashboard" breadcrumbItems={[{ label: "Dashboard" }]}>
      <div className="space-y-8">
        <KpiCards
          pendingEvents={pendingEvents}
          weekCount={weekCount}
          pendingRequests={pendingRequests}
          onRequestsClick={openRequestsInbox}
        />

        <QuickActions
          onCreateEvent={() => router.push("/admin/events?create=1")}
          onImportFromUrl={() => router.push("/admin/events?import=1")}
        />

        <WeekTimeline events={weekEvents} onEventClick={openEditEvent} />

        <PendingRequestsFeed />

        <EventFormSheet
          event={selectedEvent}
          open={isFormOpen}
          onOpenChange={(o) => {
            setIsFormOpen(o);
            if (!o) {
              setSelectedEvent(null);
            }
          }}
          locations={locations}
          organizers={organizers}
          artists={artists}
          tags={tags}
          categories={categories}
          onTagCreated={() => void loadRefs()}
          onSaved={() => void loadDashboardData()}
          onDeleted={() => void loadDashboardData()}
        />
      </div>
    </AdminLayout>
  );
}
