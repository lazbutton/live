"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "../components/admin-layout";
import { toast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

import type { CategoryOption, LocationData, OrganizerOption, TagOption, AdminEvent } from "../components/events/types";
import { toDatetimeLocal } from "@/lib/date-utils";

import { KpiCards } from "../components/dashboard/kpi-cards";
import { WeekTimeline } from "../components/dashboard/week-timeline";
import { PendingRequestsFeed, type UserRequest } from "../components/dashboard/pending-requests-feed";
import { QuickActions } from "../components/dashboard/quick-actions";
import { EventFormSheet, type EventFormPrefill } from "../components/events/event-form-sheet";

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function DashboardPage() {
  const router = useRouter();

  const requestsSectionRef = React.useRef<HTMLDivElement | null>(null);
  const [requestsRefreshKey, setRequestsRefreshKey] = React.useState(0);

  const [loading, setLoading] = React.useState(true);

  const [pendingEvents, setPendingEvents] = React.useState(0);
  const [weekCount, setWeekCount] = React.useState(0);
  const [pendingRequests, setPendingRequests] = React.useState(0);

  const [weekEvents, setWeekEvents] = React.useState<AdminEvent[]>([]);

  const [locations, setLocations] = React.useState<LocationData[]>([]);
  const [organizers, setOrganizers] = React.useState<OrganizerOption[]>([]);
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);

  const [selectedEvent, setSelectedEvent] = React.useState<AdminEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<EventFormPrefill | undefined>(undefined);
  const [convertingRequest, setConvertingRequest] = React.useState<UserRequest | null>(null);

  const loadRefs = React.useCallback(async () => {
    const [locRes, orgRes, tagRes, catRes] = await Promise.all([
      supabase.from("locations").select("id, name, address, capacity, latitude, longitude"),
      Promise.all([
        supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name"),
        supabase.from("locations").select("id, name, instagram_url, facebook_url").eq("is_organizer", true).order("name"),
      ]),
      supabase.from("tags").select("id, name").order("name"),
      supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    ]);

    if (locRes.error) throw locRes.error;
    if (tagRes.error) throw tagRes.error;
    if (catRes.error) throw catRes.error;

    const [orgs, locs] = orgRes;
    if (orgs.error) throw orgs.error;
    if (locs.error) throw locs.error;

    setLocations((locRes.data || []) as LocationData[]);
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
        pendingRequestsRes,
        weekEventsRes,
      ] = await Promise.all([
        supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("events").select("*", { count: "exact", head: true }).gte("date", today.toISOString()).lt("date", end.toISOString()),
        supabase
          .from("user_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .in("request_type", ["event_creation", "event_from_url"]),
        supabase
          .from("events")
          .select(
            `
            *,
            location:locations(id, name),
            event_organizers:event_organizers(
              organizer:organizers(id, name),
              location:locations(id, name)
            )
          `,
          )
          .gte("date", today.toISOString())
          .lt("date", end.toISOString())
          .order("date", { ascending: true }),
      ]);

      if (pendingEventsRes.error) throw pendingEventsRes.error;
      if (weekCountRes.error) throw weekCountRes.error;
      if (pendingRequestsRes.error) throw pendingRequestsRes.error;
      if (weekEventsRes.error) throw weekEventsRes.error;

      setPendingEvents(pendingEventsRes.count ?? 0);
      setWeekCount(weekCountRes.count ?? 0);
      setPendingRequests(pendingRequestsRes.count ?? 0);
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

  function scrollToRequests() {
    requestsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openEditEvent(ev: AdminEvent) {
    setSelectedEvent(ev);
    setPrefill(undefined);
    setConvertingRequest(null);
    setIsFormOpen(true);
  }

  function resolveCategory(raw: string | undefined | null) {
    const v = (raw || "").toString();
    if (!v) return categories[0]?.id || "";
    const byId = categories.find((c) => c.id === v);
    if (byId) return byId.id;
    const byName = categories.find((c) => c.name.toLowerCase() === v.toLowerCase());
    return byName?.id || categories[0]?.id || "";
  }

  function resolveLocationId(r: UserRequest) {
    const rawId = r.event_data?.location_id || r.location_id || null;
    if (rawId && locations.some((l) => l.id === rawId)) return rawId;

    const name = r.location_name || r.event_data?.location_name || null;
    if (!name) return "";
    const match = locations.find((l) => l.name.toLowerCase() === name.toLowerCase());
    return match?.id || "";
  }

  function convertRequest(r: UserRequest) {
    const d = r.event_data || {};

    const pre: EventFormPrefill = {
      form: {
        title: (d.title || "").toString(),
        description: (d.description || "").toString(),
        date: d.date ? toDatetimeLocal(String(d.date)) : "",
        end_date: d.end_date ? toDatetimeLocal(String(d.end_date)) : "",
        category: resolveCategory(d.category as any),
        price: d.price != null ? String(d.price) : "",
        capacity: d.capacity != null ? String(d.capacity) : "",
        location_id: resolveLocationId(r),
        door_opening_time: (d.door_opening_time || "").toString(),
        external_url: (d.external_url || r.source_url || "").toString(),
        external_url_label: (d.external_url_label || "").toString(),
        scraping_url: (d.scraping_url || r.source_url || "").toString(),
        image_url: (d.image_url || "").toString(),
        status: "pending",
      },
      organizerIds: d.organizer_id ? [String(d.organizer_id)] : [],
      tagIds: [],
    };

    setSelectedEvent(null);
    setPrefill(pre);
    setConvertingRequest(r);
    setIsFormOpen(true);
  }

  async function afterFormSaved(savedEventId: string) {
    await loadDashboardData();

    if (!convertingRequest) return;

    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;

      const { error } = await supabase
        .from("user_requests")
        .update({
          status: "converted",
          converted_event_id: savedEventId,
          converted_at: new Date().toISOString(),
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          notes: `Converti en événement ID: ${savedEventId}`,
        })
        .eq("id", convertingRequest.id);

      if (error) throw error;

      toast({ title: "Demande convertie", variant: "success" });
      setRequestsRefreshKey((k) => k + 1);
      setConvertingRequest(null);
    } catch (e: any) {
      console.error("Erreur update request converted:", e);
      toast({
        title: "Conversion partielle",
        description: "L’événement est créé, mais la demande n’a pas pu être mise à jour.",
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
          onRequestsClick={scrollToRequests}
        />

        <QuickActions
          onCreateEvent={() => router.push("/admin/events?create=1")}
          onImportFromUrl={() => router.push("/admin/events?import=1")}
        />

        <WeekTimeline events={weekEvents} onEventClick={openEditEvent} />

        <div id="requests" ref={requestsSectionRef} className="scroll-mt-24">
          <PendingRequestsFeed onConvert={convertRequest} refreshKey={requestsRefreshKey} />
        </div>

        <EventFormSheet
          event={selectedEvent}
          open={isFormOpen}
          onOpenChange={(o) => {
            setIsFormOpen(o);
            if (!o) {
              setSelectedEvent(null);
              setPrefill(undefined);
              setConvertingRequest(null);
            }
          }}
          locations={locations}
          organizers={organizers}
          tags={tags}
          categories={categories}
          prefill={prefill}
          onTagCreated={() => void loadRefs()}
          onSaved={(id) => void afterFormSaved(id)}
          onDeleted={() => void loadDashboardData()}
        />
      </div>
    </AdminLayout>
  );
}
