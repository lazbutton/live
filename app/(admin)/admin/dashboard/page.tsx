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
import { EventArtistsQuickDialog } from "../components/events/event-artists-quick-dialog";
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
  const [artistsDialogEvent, setArtistsDialogEvent] = React.useState<AdminEvent | null>(null);
  const [isArtistsDialogOpen, setIsArtistsDialogOpen] = React.useState(false);

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

  function openArtistsDialog(event: AdminEvent) {
    setArtistsDialogEvent(event);
    setIsArtistsDialogOpen(true);
  }

  async function quickApprove(event: AdminEvent) {
    try {
      const { data: before } = await supabase.from("events").select("title, status").eq("id", event.id).single();

      const { error } = await supabase.from("events").update({ status: "approved" }).eq("id", event.id);
      if (error) throw error;

      try {
        await fetch(`/api/admin/events/${event.id}/notify-organizers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "event_approved",
            title: "Événement approuvé",
            message: `Votre événement "${before?.title || "Sans titre"}" a été approuvé et est maintenant visible sur la plateforme.`,
            metadata: { old_status: before?.status, new_status: "approved" },
          }),
        });
      } catch (notificationError) {
        console.error("Notif approve (ignored):", notificationError);
      }

      toast({ title: "Événement approuvé", variant: "success" });
      await loadDashboardData();
    } catch (e: any) {
      console.error("Erreur approve dashboard:", e);
      toast({
        title: "Approbation impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  async function saveQuickArtists(event: AdminEvent, artistIds: string[]) {
    try {
      const { error: deleteError } = await supabase.from("event_artists").delete().eq("event_id", event.id);
      if (deleteError) throw deleteError;

      if (artistIds.length > 0) {
        const entries = artistIds.map((artistId, index) => ({
          event_id: event.id,
          artist_id: artistId,
          sort_index: index,
          role_label: null,
        }));

        const { error: insertError } = await supabase.from("event_artists").insert(entries);
        if (insertError) throw insertError;
      }

      toast({ title: "Artistes mis à jour", variant: "success" });
      await loadDashboardData();
      return true;
    } catch (e: any) {
      console.error("Erreur artistes dashboard:", e);
      toast({
        title: "Mise à jour impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
      return false;
    }
  }

  async function toggleEventFull(event: AdminEvent) {
    const nextIsFull = !Boolean(event.is_full);

    try {
      const { error } = await supabase.from("events").update({ is_full: nextIsFull }).eq("id", event.id);
      if (error) throw error;

      toast({
        title: nextIsFull ? "Événement marqué complet" : "Événement rouvert",
        variant: "success",
      });
      await loadDashboardData();
    } catch (e: any) {
      console.error("Erreur is_full dashboard:", e);
      toast({
        title: "Action impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  async function toggleEventFeatured(event: AdminEvent) {
    const nextIsFeatured = !Boolean(event.is_featured);

    try {
      const { error } = await supabase.from("events").update({ is_featured: nextIsFeatured }).eq("id", event.id);
      if (error) throw error;

      toast({
        title: nextIsFeatured ? "Événement mis à la une" : "Événement retiré de la une",
        variant: "success",
      });
      await loadDashboardData();
    } catch (e: any) {
      console.error("Erreur is_featured dashboard:", e);
      toast({
        title: "Action impossible",
        description: e?.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    }
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

        <WeekTimeline
          events={weekEvents}
          onEventClick={openEditEvent}
          onOpenArtistsDialog={openArtistsDialog}
          onToggleFull={toggleEventFull}
          onToggleFeatured={toggleEventFeatured}
          onQuickApprove={quickApprove}
        />

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

        <EventArtistsQuickDialog
          open={isArtistsDialogOpen}
          onOpenChange={(open) => {
            setIsArtistsDialogOpen(open);
            if (!open) {
              setArtistsDialogEvent(null);
            }
          }}
          event={artistsDialogEvent}
          artists={artists}
          onSave={saveQuickArtists}
        />
      </div>
    </AdminLayout>
  );
}
