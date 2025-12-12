"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getUserOrganizers, OrganizerInfo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Edit, 
  Trash2, 
  Plus, 
  Search, 
  X, 
  Eye,
  FileEdit,
  Send,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  FileText
} from "lucide-react";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { organizerCache, CACHE_KEYS, CACHE_TTL } from "@/lib/organizer-cache";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  end_time: string | null;
  status: "pending" | "approved" | "rejected" | "draft";
  category: string;
  price: number | null;
  presale_price: number | null;
  subscriber_price: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  is_full: boolean | null;
  location_id: string | null;
  room_id: string | null;
  door_opening_time: string | null;
  external_url: string | null;
  external_url_label: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  scraping_url: string | null;
  image_url: string | null;
  tag_ids?: string[];
  location?: { name: string };
  event_organizers?: Array<{
    organizer?: {
      id: string;
      name: string;
    } | null;
    location?: {
      id: string;
      name: string;
    } | null;
  }>;
}

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const statusConfig = {
  draft: { label: "Brouillon", color: "bg-gray-500", icon: FileText },
  pending: { label: "En attente", color: "bg-yellow-500", icon: Clock },
  approved: { label: "Approuvé", color: "bg-green-500", icon: CheckCircle2 },
  rejected: { label: "Rejeté", color: "bg-red-500", icon: XCircle },
};

export function OrganizerEventsManagement() {
  const router = useRouter();
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [userOrganizers, setUserOrganizers] = useState<OrganizerInfo[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Filtres
  const [filterStatus, setFilterStatus] = useState<"all" | "draft" | "pending" | "approved" | "rejected">("all");
  const [filterDate, setFilterDate] = useState<"upcoming" | "all">("upcoming");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedOrganizer, setSelectedOrganizer] = useState<string>("all");

  useEffect(() => {
    loadUserOrganizers();
  }, []);

  useEffect(() => {
    if (userOrganizers.length > 0) {
      loadEvents();
    }
  }, [userOrganizers]);

  // Appliquer les filtres
  useEffect(() => {
    let filtered = [...events];

    // Filtre par statut
    if (filterStatus !== "all") {
      filtered = filtered.filter((event) => event.status === filterStatus);
    }

    // Filtre par date (événements à venir par défaut)
    if (filterDate === "upcoming") {
      const today = startOfLocalDay(new Date());
      filtered = filtered.filter((event) => {
        const start = startOfLocalDay(new Date(event.date));
        const end = event.end_date ? startOfLocalDay(new Date(event.end_date)) : start;
        const endClamped = end.getTime() < start.getTime() ? start : end;
        return endClamped.getTime() >= today.getTime();
      });
    }

    // Filtre par organisateur
    if (selectedOrganizer !== "all") {
      filtered = filtered.filter((event) => 
        event.event_organizers?.some((eo) => 
          (eo.organizer?.id === selectedOrganizer) || (eo.location?.id === selectedOrganizer)
        )
      );
    }

    // Filtre par recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((event) => {
        const titleMatch = event.title?.toLowerCase().includes(query);
        const descriptionMatch = event.description?.toLowerCase().includes(query);
        const categoryMatch = event.category?.toLowerCase().includes(query);
        const locationMatch = event.location?.name?.toLowerCase().includes(query);
        return titleMatch || descriptionMatch || categoryMatch || locationMatch;
      });
    }

    // Trier par date (ascendant)
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });

    setFilteredEvents(filtered);
  }, [events, filterStatus, filterDate, selectedOrganizer, searchQuery]);

  async function loadUserOrganizers() {
    try {
      const organizers = await getUserOrganizers();
      setUserOrganizers(organizers);
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
    }
  }

  async function loadEvents() {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/admin/login");
        return;
      }

      // Récupérer les IDs des organisateurs de l'utilisateur
      const organizerIds = userOrganizers.map((uo) => uo.organizer_id);

      if (organizerIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      // Récupérer les événements associés aux organisateurs (classiques et lieux-organisateurs)
      const { data: eventOrganizersByOrg } = await supabase
        .from("event_organizers")
        .select("event_id")
        .in("organizer_id", organizerIds);

      const { data: eventOrganizersByLoc } = await supabase
        .from("event_organizers")
        .select("event_id")
        .in("location_id", organizerIds);

      // Combiner les deux listes et extraire les event_id uniques
      const allEventIds = [
        ...(eventOrganizersByOrg || []).map((eo) => eo.event_id),
        ...(eventOrganizersByLoc || []).map((eo) => eo.event_id),
      ];
      const eventIds = [...new Set(allEventIds)];

      if (eventIds.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      // Vérifier le cache pour les événements
      const cacheKey = CACHE_KEYS.EVENTS(user.id);
      const cachedEvents = organizerCache.get<Event[]>(cacheKey);
      
      if (cachedEvents && eventIds.length > 0) {
        // Filtrer les événements cachés pour ne garder que ceux qui correspondent aux IDs actuels
        const cachedEventIds = new Set(cachedEvents.map(e => e.id));
        const allCurrentIdsCached = eventIds.every(id => cachedEventIds.has(id));
        
        if (allCurrentIdsCached) {
          setEvents(cachedEvents);
          setLoading(false);
          return;
        }
      }

      // Charger les événements avec leurs relations
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          location:locations(id, name),
          event_organizers:event_organizers(
            organizer:organizers(id, name),
            location:locations(id, name)
          )
        `)
        .in("id", eventIds)
        .order("date", { ascending: true });

      if (error) throw error;
      const eventsData = data || [];
      setEvents(eventsData);
      
      // Mettre en cache
      organizerCache.set(cacheKey, eventsData, CACHE_TTL.EVENTS);
    } catch (error) {
      console.error("Erreur lors du chargement des événements:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteEvent(eventId: string) {
    // Vérifier que l'événement est en draft ou pending
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    if (event.status !== "draft" && event.status !== "pending") {
      showAlert({
        title: "Suppression impossible",
        description: "Vous ne pouvez supprimer que les événements en brouillon ou en attente de validation.",
        confirmText: "OK",
      });
      return;
    }

    showConfirm({
      title: "Supprimer l'événement",
      description: "Êtes-vous sûr de vouloir supprimer cet événement ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("events").delete().eq("id", eventId);
          if (error) throw error;
          await loadEvents();
        } catch (error) {
          console.error("Erreur lors de la suppression:", error);
          showAlert({
            title: "Erreur",
            description: "Erreur lors de la suppression de l'événement.",
            confirmText: "OK",
          });
        }
      },
    });
  }

  async function submitEvent(eventId: string) {
    // Passer de draft à pending
    try {
      const { error } = await supabase
        .from("events")
        .update({ status: "pending" })
        .eq("id", eventId);

      if (error) throw error;
      
      // Invalider le cache des événements après suppression
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        organizerCache.delete(CACHE_KEYS.EVENTS(user.id));
      }
      
      await loadEvents();
      setIsDialogOpen(false);
      setSelectedEvent(null);
      showAlert({
        title: "Événement soumis",
        description: "Votre événement a été soumis pour validation.",
        confirmText: "OK",
      });
    } catch (error) {
      console.error("Erreur lors de la soumission:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors de la soumission de l'événement.",
        confirmText: "OK",
      });
    }
  }

  async function duplicateEvent(event: Event) {
    try {
      // Créer une copie de l'événement en draft
      const newEvent: any = {
        title: `${event.title} (Copie)`,
        description: event.description,
        date: event.date,
        end_date: event.end_date,
        end_time: event.end_time,
        status: "draft",
        category: event.category,
        price: event.price,
        presale_price: event.presale_price,
        subscriber_price: event.subscriber_price,
        address: event.address,
        latitude: event.latitude,
        longitude: event.longitude,
        capacity: event.capacity,
        is_full: false,
        location_id: event.location_id,
        room_id: event.room_id,
        door_opening_time: event.door_opening_time,
        external_url: event.external_url,
        external_url_label: event.external_url_label,
        instagram_url: event.instagram_url,
        facebook_url: event.facebook_url,
        scraping_url: event.scraping_url,
        image_url: event.image_url,
        tag_ids: event.tag_ids || [],
      };

      const { data: createdEvent, error: eventError } = await supabase
        .from("events")
        .insert(newEvent)
        .select()
        .single();

      if (eventError) throw eventError;

      // Copier les associations avec les organisateurs
      if (event.event_organizers && event.event_organizers.length > 0) {
        const organizerEntries = event.event_organizers.map((eo) => ({
          event_id: createdEvent.id,
          organizer_id: eo.organizer?.id || null,
          location_id: eo.location?.id || null,
        }));

        const { error: orgError } = await supabase
          .from("event_organizers")
          .insert(organizerEntries);

        if (orgError) throw orgError;
      }

      // Invalider le cache des événements après duplication
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        organizerCache.delete(CACHE_KEYS.EVENTS(user.id));
      }

      await loadEvents();
      showAlert({
        title: "Événement dupliqué",
        description: "L'événement a été dupliqué avec succès.",
        confirmText: "OK",
      });
    } catch (error) {
      console.error("Erreur lors de la duplication:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors de la duplication de l'événement.",
        confirmText: "OK",
      });
    }
  }

  const statusCounts = useMemo(() => {
    const counts = { draft: 0, pending: 0, approved: 0, rejected: 0, total: events.length };
    events.forEach((e) => {
      if (e.status in counts) {
        counts[e.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement des événements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Mes événements</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Gérez tous vos événements depuis cette page
          </p>
        </div>
        <Link href="/organizer/events/create" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Créer un événement
          </Button>
        </Link>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Brouillons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.draft}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Rejetés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            {/* Recherche */}
            <div className="flex-1 min-w-full sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Filtre statut */}
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillons</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Approuvés</SelectItem>
                <SelectItem value="rejected">Rejetés</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtre date */}
            <Select value={filterDate} onValueChange={(value: any) => setFilterDate(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">À venir</SelectItem>
                <SelectItem value="all">Tous</SelectItem>
              </SelectContent>
            </Select>

            {/* Filtre organisateur (si plusieurs) */}
            {userOrganizers.length > 1 && (
              <Select
                value={selectedOrganizer}
                onValueChange={(value) => setSelectedOrganizer(value)}
              >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Organisateur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les organisateurs</SelectItem>
                  {userOrganizers.map((uo) => (
                    <SelectItem key={uo.organizer_id} value={uo.organizer_id}>
                      {uo.organizer?.name || uo.organizer_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Réinitialiser */}
            {(filterStatus !== "all" ||
              filterDate !== "upcoming" ||
              selectedOrganizer !== "all" ||
              searchQuery.trim()) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStatus("all");
                  setFilterDate("upcoming");
                  setSelectedOrganizer("all");
                  setSearchQuery("");
                }}
                className="w-full sm:w-auto"
              >
                <X className="h-4 w-4 mr-2" />
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Liste des événements */}
      {filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {events.length === 0
                ? "Vous n'avez pas encore d'événements. Créez votre premier événement !"
                : "Aucun événement ne correspond à vos filtres."}
            </p>
            {events.length === 0 && (
              <Link href="/organizer/events/create">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un événement
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map((event) => {
            const StatusIcon = statusConfig[event.status].icon;
            return (
              <Card key={event.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "flex items-center gap-1.5",
                            statusConfig[event.status].color
                          )}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig[event.status].label}
                        </Badge>
                        {event.location && (
                          <Badge variant="outline">{event.location.name}</Badge>
                        )}
                      </div>
                      <h3 className="text-base sm:text-lg font-semibold break-words">{event.title}</h3>
                      {event.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {event.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          📅 {formatDateWithoutTimezone(event.date)}
                        </span>
                        {event.price !== null && (
                          <span>
                            💰 {event.price === 0 ? "Gratuit" : `${event.price}€`}
                          </span>
                        )}
                        {event.capacity && (
                          <span>
                            👥 {event.capacity} places
                            {event.is_full && " (Complet)"}
                          </span>
                        )}
                      </div>
                      {event.event_organizers && event.event_organizers.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {event.event_organizers.map((eo, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {eo.organizer?.name || eo.location?.name || "Organisateur"}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:ml-4 w-full sm:w-auto">
                      {event.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => submitEvent(event.id)}
                          title="Soumettre pour validation"
                          className="flex-1 sm:flex-none"
                        >
                          <Send className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Soumettre</span>
                        </Button>
                      )}
                      <Link href={`/organizer/events/${event.id}/edit`} className="flex-1 sm:flex-none">
                        <Button variant="outline" size="sm" title="Éditer" className="w-full sm:w-auto">
                          <Edit className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Éditer</span>
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateEvent(event)}
                        title="Dupliquer"
                        className="flex-1 sm:flex-none"
                      >
                        <Copy className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Dupliquer</span>
                      </Button>
                      {(event.status === "draft" || event.status === "pending") && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteEvent(event.id)}
                          title="Supprimer"
                          className="flex-1 sm:flex-none"
                        >
                          <Trash2 className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Supprimer</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <AlertDialogComponent />
    </div>
  );
}
