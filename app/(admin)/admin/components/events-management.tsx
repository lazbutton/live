"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { AddressInput } from "@/components/ui/address-input";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Check, X, Edit, Trash2, Plus, Search } from "lucide-react";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import Link from "next/link";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  end_time: string | null;
  status: "pending" | "approved" | "rejected";
  category: string;
  price: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  location_id: string | null;
  door_opening_time: string | null;
  external_url: string | null;
  external_url_label: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  image_url: string | null;
  tag_ids?: string[];
  location?: { name: string };
  event_organizers?: Array<{
    organizer: {
      id: string;
      name: string;
    };
  }>;
}

type LocationData = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
};

export function EventsManagement() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [organizers, setOrganizers] = useState<{ id: string; name: string; instagram_url: string | null; facebook_url: string | null }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  
  // États des filtres
  const [filterDate, setFilterDate] = useState<"upcoming" | "all">("upcoming");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterOrganizer, setFilterOrganizer] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    loadEvents();
    loadLocations();
    loadOrganizers();
    loadTags();
    loadCategories();
  }, []);

  async function loadCategories() {
    const { data } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");
    if (data) setCategories(data);
  }

  async function loadOrganizers() {
    const { data } = await supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name");
    if (data) setOrganizers(data);
  }

  async function loadTags() {
    const { data } = await supabase.from("tags").select("id, name").order("name");
    if (data) setTags(data);
  }

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          location:locations(id, name),
          event_organizers:event_organizers(
            organizer:organizers(id, name)
          )
        `)
        .order("date", { ascending: true });

      if (error) throw error;
      setEvents(data || []);
      setFilteredEvents(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des événements:", error);
    } finally {
      setLoading(false);
    }
  }

  // Appliquer les filtres
  useEffect(() => {
    let filtered = [...events];

    // Filtre par date (événements à venir par défaut)
    if (filterDate === "upcoming") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter((event) => {
        const eventDate = new Date(event.date);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today;
      });
    }

    // Filtre par statut
    if (filterStatus !== "all") {
      filtered = filtered.filter((event) => event.status === filterStatus);
    }

    // Filtre par lieu
    if (filterLocation !== "all") {
      filtered = filtered.filter((event) => event.location_id === filterLocation);
    }

    // Filtre par organisateur
    if (filterOrganizer !== "all") {
      filtered = filtered.filter((event) => 
        event.event_organizers?.some((eo) => eo.organizer.id === filterOrganizer)
      );
    }

    // Filtre par tag
    if (filterTag !== "all") {
      filtered = filtered.filter((event) => 
        event.tag_ids?.includes(filterTag)
      );
    }

    // Filtre par catégorie
    if (filterCategory !== "all") {
      filtered = filtered.filter((event) => 
        event.category === filterCategory
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

    setFilteredEvents(filtered);
  }, [events, filterDate, filterStatus, filterLocation, filterOrganizer, filterTag, filterCategory, searchQuery]);

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("id, name, address, capacity, latitude, longitude");
    if (data) setLocations(data as LocationData[]);
  }

  async function updateEventStatus(eventId: string, status: "approved" | "rejected") {
    try {
      const { error } = await supabase
        .from("events")
        .update({ status })
        .eq("id", eventId);

      if (error) throw error;
      await loadEvents();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet événement ?")) return;

    try {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
      await loadEvents();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
    }
  }

  async function updateEvent(eventData: Partial<Event>, organizerIds?: string[], tagIds?: string[]) {
    if (!selectedEvent) return;

    try {
      const updateData: any = { ...eventData };
      if (tagIds !== undefined) {
        updateData.tag_ids = tagIds;
      }

      const { error: eventError } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", selectedEvent.id);

      if (eventError) throw eventError;

      // Gérer les organisateurs si fournis
      if (organizerIds !== undefined) {
        await supabase
          .from("event_organizers")
          .delete()
          .eq("event_id", selectedEvent.id);

        if (organizerIds.length > 0) {
          const { error: orgError } = await supabase
            .from("event_organizers")
            .insert(
              organizerIds.map((orgId) => ({
                event_id: selectedEvent.id,
                organizer_id: orgId,
              }))
            );

          if (orgError) throw orgError;
        }
      }

      // Gérer les tags
      if (tagIds !== undefined) {
        const { error: tagError } = await supabase
          .from("events")
          .update({ tag_ids: tagIds })
          .eq("id", selectedEvent.id);

        if (tagError) throw tagError;
      }

      setIsDialogOpen(false);
      setSelectedEvent(null);
      await loadEvents();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("Erreur lors de la mise à jour de l'événement");
    }
  }

  function handleOpenDialog(event: Event) {
    setSelectedEvent(event);
    setIsDialogOpen(true);
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      approved: "default",
      pending: "secondary",
      rejected: "destructive",
    };

    const labels: Record<string, string> = {
      approved: "Approuvé",
      pending: "En attente",
      rejected: "Rejeté",
    };

    return (
      <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Chargement des événements...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des événements</CardTitle>
        <CardDescription>
          Gérez tous les événements de la plateforme et validez les demandes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Barre de recherche et bouton d'ajout */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Recherche textuelle */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par titre, description, catégorie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 min-h-[44px] text-base"
              />
            </div>
            <Button
              asChild
              className="min-h-[44px] cursor-pointer"
            >
              <Link href="/admin/events/create">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un événement
              </Link>
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            
            {/* Filtre par date */}
            <div className="w-full sm:w-[180px]">
              <Select value={filterDate} onValueChange={(value: any) => setFilterDate(value)}>
                <SelectTrigger className="min-h-[44px] text-base">
                  <SelectValue placeholder="Période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">À venir</SelectItem>
                  <SelectItem value="all">Tous</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Filtre par statut */}
            <div className="w-full sm:w-[180px]">
              <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
                <SelectTrigger className="min-h-[44px] text-base">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="approved">Approuvés</SelectItem>
                  <SelectItem value="rejected">Rejetés</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Filtre par catégorie */}
            <div className="w-full sm:w-[200px]">
              <SelectSearchable
                value={filterCategory}
                onValueChange={(value) => setFilterCategory(value)}
                placeholder="Toutes les catégories"
                searchPlaceholder="Rechercher une catégorie..."
                options={[
                  { value: "all", label: "Toutes les catégories" },
                  ...categories.map((cat) => ({
                    value: cat.name,
                    label: cat.name,
                  })),
                ]}
              />
            </div>
            
            {/* Filtre par lieu */}
            <div className="w-full sm:w-[200px]">
              <SelectSearchable
                value={filterLocation}
                onValueChange={(value) => setFilterLocation(value)}
                placeholder="Tous les lieux"
                searchPlaceholder="Rechercher un lieu..."
                options={[
                  { value: "all", label: "Tous les lieux" },
                  ...locations.map((location) => ({
                    value: location.id,
                    label: location.name,
                  })),
                ]}
              />
            </div>
            
            {/* Filtre par organisateur */}
            <div className="w-full sm:w-[200px]">
              <SelectSearchable
                value={filterOrganizer}
                onValueChange={(value) => setFilterOrganizer(value)}
                placeholder="Tous les organisateurs"
                searchPlaceholder="Rechercher un organisateur..."
                options={[
                  { value: "all", label: "Tous les organisateurs" },
                  ...organizers.map((organizer) => ({
                    value: organizer.id,
                    label: organizer.name,
                  })),
                ]}
              />
            </div>
            
            {/* Filtre par tag */}
            <div className="w-full sm:w-[200px]">
              <SelectSearchable
                value={filterTag}
                onValueChange={(value) => setFilterTag(value)}
                placeholder="Tous les tags"
                searchPlaceholder="Rechercher un tag..."
                options={[
                  { value: "all", label: "Tous les tags" },
                  ...tags.map((tag) => ({
                    value: tag.id,
                    label: tag.name,
                  })),
                ]}
              />
            </div>
            
            {/* Bouton réinitialiser */}
            {(filterDate !== "upcoming" || filterStatus !== "all" || filterLocation !== "all" || filterOrganizer !== "all" || filterTag !== "all" || filterCategory !== "all" || searchQuery) && (
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterDate("upcoming");
                    setFilterStatus("all");
                    setFilterLocation("all");
                    setFilterOrganizer("all");
                    setFilterTag("all");
                    setFilterCategory("all");
                    setSearchQuery("");
                  }}
                  className="h-[44px] cursor-pointer"
                >
                  Réinitialiser
                </Button>
              </div>
            )}
          </div>
          
          {/* Statistiques */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>
              Résultats: <span className="font-medium text-foreground">{filteredEvents.length}</span>
            </span>
            <span>
              Total: <span className="font-medium text-foreground">{events.length}</span>
            </span>
          </div>
        </div>

        <MobileTableView>
          {/* Desktop Table View */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Lieu</TableHead>
                  <TableHead>Organisateurs</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {events.length === 0 
                        ? "Aucun événement trouvé" 
                        : "Aucun événement ne correspond aux filtres"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.title}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">
                            <span className="font-medium">Début :</span> {formatDateWithoutTimezone(event.date)}
                          </span>
                          {event.end_date ? (
                            <span className="text-sm">
                              <span className="font-medium">Fin :</span> {formatDateWithoutTimezone(event.end_date)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              <span className="font-medium">Fin :</span> -
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{event.category}</TableCell>
                      <TableCell>
                        {event.location ? (event.location as any).name : "-"}
                      </TableCell>
                      <TableCell>
                        {event.event_organizers && event.event_organizers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {event.event_organizers.map((eo, idx) => (
                              <Badge key={eo.organizer.id} variant="outline" className="text-xs">
                                {eo.organizer.name}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {event.tag_ids && event.tag_ids.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {event.tag_ids.map((tagId) => {
                              const tag = tags.find((t) => t.id === tagId);
                              return tag ? (
                                <Badge key={tagId} variant="secondary" className="text-xs">
                                  {tag.name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(event.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {event.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateEventStatus(event.id, "approved")}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateEventStatus(event.id, "rejected")}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDialog(event)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteEvent(event.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Card View */}
          {filteredEvents.length === 0 ? (
            <div className="block md:hidden text-center py-8 text-muted-foreground">
              {events.length === 0 
                ? "Aucun événement trouvé" 
                : "Aucun événement ne correspond aux filtres"}
            </div>
          ) : (
            filteredEvents.map((event) => (
              <MobileCard
                key={event.id}
                onClick={() => handleOpenDialog(event)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate mb-1">{event.title}</h3>
                    {getStatusBadge(event.status)}
                  </div>
                </div>
                <MobileCardRow
                  label="Date de début"
                  value={formatDateWithoutTimezone(event.date)}
                />
                {event.end_date && (
                  <MobileCardRow
                    label="Date de fin"
                    value={formatDateWithoutTimezone(event.end_date)}
                  />
                )}
                <MobileCardRow label="Catégorie" value={event.category} />
                {event.location && (
                  <MobileCardRow
                    label="Lieu"
                    value={(event.location as any).name}
                  />
                )}
                {event.event_organizers && event.event_organizers.length > 0 && (
                  <MobileCardRow
                    label="Organisateurs"
                    value={event.event_organizers.map((eo) => eo.organizer.name).join(", ")}
                  />
                )}
                {event.tag_ids && event.tag_ids.length > 0 && (
                  <MobileCardRow
                    label="Tags"
                    value={event.tag_ids.map((tagId) => {
                      const tag = tags.find((t) => t.id === tagId);
                      return tag ? tag.name : "";
                    }).filter(Boolean).join(", ")}
                  />
                )}
                <MobileCardActions>
                  {event.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-h-[44px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateEventStatus(event.id, "approved");
                        }}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 min-h-[44px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateEventStatus(event.id, "rejected");
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Rejeter
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 min-h-[44px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDialog(event);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px] min-w-[44px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEvent(event.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </MobileCardActions>
              </MobileCard>
            ))
          )}
        </MobileTableView>

        {selectedEvent && (
          <EventEditDialog
            event={selectedEvent}
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            locations={locations}
            organizers={organizers}
            tags={tags}
            onSave={updateEvent}
            onTagCreated={loadTags}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EventEditDialog({
  event,
  open,
  onOpenChange,
  locations,
  organizers,
  tags,
  onSave,
  onTagCreated,
}: {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: { id: string; name: string; address: string | null; capacity: number | null }[];
  organizers: { id: string; name: string; instagram_url: string | null; facebook_url: string | null }[];
  tags: { id: string; name: string }[];
  onSave: (data: Partial<Event>, organizerIds?: string[], tagIds?: string[]) => void;
  onTagCreated?: () => void;
}) {
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    date: string;
    end_date: string;
    end_time: string;
    category: string;
    price: string;
    address: string;
    latitude: string;
    longitude: string;
    capacity: string;
    location_id: string;
    door_opening_time: string;
    external_url: string;
    external_url_label: string;
    instagram_url: string;
    facebook_url: string;
    status: "pending" | "approved" | "rejected";
  }>({
    title: "",
    description: "",
    date: "",
    end_date: "",
    end_time: "",
    category: "",
    price: "",
    address: "",
    latitude: "",
    longitude: "",
    capacity: "",
    location_id: "",
    door_opening_time: "",
    external_url: "",
    external_url_label: "",
    instagram_url: "",
    facebook_url: "",
    status: "pending",
  });
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Fonction pour mettre à jour les réseaux sociaux quand un organisateur est sélectionné
  const handleOrganizerChange = (newOrganizerIds: string[]) => {
    setSelectedOrganizerIds(newOrganizerIds);
    
    // Si un organisateur est sélectionné, mettre à jour les réseaux sociaux avec ceux du premier organisateur
    if (newOrganizerIds.length > 0) {
      const firstOrganizerId = newOrganizerIds[0];
      const selectedOrganizer = organizers.find((org) => org.id === firstOrganizerId);
      
      if (selectedOrganizer) {
        setFormData({
          ...formData,
          instagram_url: selectedOrganizer.instagram_url || formData.instagram_url,
          facebook_url: selectedOrganizer.facebook_url || formData.facebook_url,
        });
      }
    }
  };

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title || "",
        description: event.description || "",
        date: toDatetimeLocal(event.date),
        end_date: toDatetimeLocal(event.end_date),
        end_time: event.end_time || "",
        category: event.category || "",
        price: event.price?.toString() || "",
        address: event.address || "",
        latitude: event.latitude?.toString() || "",
        longitude: event.longitude?.toString() || "",
        capacity: event.capacity?.toString() || "",
        location_id: event.location_id || "",
        door_opening_time: event.door_opening_time || "",
        external_url: event.external_url || "",
        external_url_label: event.external_url_label || "",
        instagram_url: event.instagram_url || "",
        facebook_url: event.facebook_url || "",
        status: event.status,
      });

      // Charger les organisateurs de l'événement
      loadEventOrganizers(event.id);
      
      // Charger les tags de l'événement
      if (event.tag_ids && event.tag_ids.length > 0) {
        setSelectedTagIds(event.tag_ids);
      } else {
        setSelectedTagIds([]);
      }
    }
  }, [event, open]);

  async function loadEventOrganizers(eventId: string) {
    try {
      const { data, error } = await supabase
        .from("event_organizers")
        .select("organizer_id")
        .eq("event_id", eventId);

      if (error) throw error;
      setSelectedOrganizerIds(data?.map((eo) => eo.organizer_id) || []);
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
    }
  }

  async function handleCreateTag(name: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert([{ name: name.trim() }])
        .select("id")
        .single();

      if (error) {
        console.error("Erreur détaillée lors de la création du tag:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        
        // Messages d'erreur plus explicites
        if (error.code === "23505") {
          alert(`Un tag avec le nom "${name}" existe déjà.`);
        } else if (error.message?.includes("permission denied") || error.code === "42501") {
          alert("Vous n'avez pas la permission de créer un tag. Vérifiez vos droits d'administration.");
        } else if (error.message?.includes("Bucket not found") || error.message?.includes("relation") && error.message?.includes("does not exist")) {
          alert("La table 'tags' n'existe pas. Veuillez exécuter la migration 014_add_tags_to_events.sql");
        } else {
          alert(`Erreur lors de la création du tag: ${error.message || "Erreur inconnue"}`);
        }
        throw error;
      }
      
      // Recharger la liste des tags
      if (onTagCreated) {
        onTagCreated();
      }
      
      return data?.id || null;
    } catch (error) {
      console.error("Erreur lors de la création du tag:", error);
      return null;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(
      {
        ...formData,
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? fromDatetimeLocal(formData.end_date) : null,
        end_time: formData.end_time || null,
        price: formData.price ? parseFloat(formData.price) : null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        door_opening_time: formData.door_opening_time || null,
        external_url: formData.external_url || null,
        external_url_label: formData.external_url_label || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
      },
      selectedOrganizerIds,
      selectedTagIds
    );
  }

  const isMobile = useIsMobile();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier l'événement</DialogTitle>
          <DialogDescription>Modifiez les informations de l'événement</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="min-h-[44px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[100px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Catégorie *</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
              className="min-h-[44px] text-base"
            />
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="date">Date de début *</Label>
              <Input
                id="date"
                type="datetime-local"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">Date de fin</Label>
              <Input
                id="end_date"
                type="datetime-local"
                value={formData.end_date || ""}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="price">Prix</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price || ""}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacité</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity || ""}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location_id">Lieu</Label>
            <Select
              value={formData.location_id || "none"}
              onValueChange={(value) => {
                const locationId = value === "none" ? "" : value;
                // Mettre à jour l'adresse et la capacité automatiquement si un lieu est sélectionné
                if (locationId) {
                  const selectedLocation = locations.find((loc) => loc.id === locationId) as LocationData | undefined;
                  if (selectedLocation) {
                    setFormData({ 
                      ...formData, 
                      location_id: locationId,
                      address: selectedLocation.address || formData.address || "",
                      latitude: selectedLocation.latitude?.toString() || formData.latitude || "",
                      longitude: selectedLocation.longitude?.toString() || formData.longitude || "",
                      capacity: selectedLocation.capacity ? selectedLocation.capacity.toString() : formData.capacity || ""
                    });
                    return;
                  }
                }
                setFormData({ ...formData, location_id: locationId });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un lieu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun lieu</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <AddressInput
              id="address"
              value={formData.address || ""}
              onChange={(address) => setFormData({ ...formData, address })}
              onAddressSelect={(address, coordinates) => {
                setFormData({
                  ...formData,
                  address: address || "",
                  latitude: coordinates?.latitude?.toString() || "",
                  longitude: coordinates?.longitude?.toString() || "",
                });
              }}
              placeholder="Commencez à taper une adresse..."
              className="cursor-pointer"
            />
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={formData.latitude || ""}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="48.8566"
                className="cursor-pointer min-h-[44px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={formData.longitude || ""}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="2.3522"
                className="cursor-pointer min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="door_opening_time">Heure d'ouverture des portes</Label>
              <Input
                id="door_opening_time"
                type="time"
                value={formData.door_opening_time || ""}
                onChange={(e) => setFormData({ ...formData, door_opening_time: e.target.value })}
                placeholder="HH:MM"
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">Heure de fin</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time || ""}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="external_url">URL externe</Label>
              <Input
                id="external_url"
                type="url"
                value={formData.external_url || ""}
                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                placeholder="https://example.com"
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="external_url_label">Label du lien externe</Label>
              <Input
                id="external_url_label"
                type="text"
                value={formData.external_url_label || ""}
                onChange={(e) => setFormData({ ...formData, external_url_label: e.target.value })}
                placeholder="Réserver des billets"
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram</Label>
              <Input
                id="instagram_url"
                type="url"
                value={formData.instagram_url || ""}
                onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                placeholder="https://instagram.com/..."
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="facebook_url">Facebook</Label>
              <Input
                id="facebook_url"
                type="url"
                value={formData.facebook_url || ""}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="https://facebook.com/..."
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Organisateurs</Label>
            <MultiSelect
              options={organizers.map((org) => ({
                label: org.name,
                value: org.id,
              }))}
              selected={selectedOrganizerIds}
              onChange={handleOrganizerChange}
              placeholder="Sélectionner des organisateurs..."
              disabled={organizers.length === 0}
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <MultiSelectCreatable
              options={tags.map((tag) => ({
                label: tag.name,
                value: tag.id,
              }))}
              selected={selectedTagIds}
              onChange={setSelectedTagIds}
              onCreate={handleCreateTag}
              placeholder="Sélectionner ou créer des tags..."
              createPlaceholder="Ajouter un nouveau tag..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Statut</Label>
            <Select
              value={formData.status}
              onValueChange={(value: "pending" | "approved" | "rejected") =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={`flex gap-2 ${isMobile ? "flex-col" : "justify-end"}`}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px] w-full md:w-auto"
            >
              Annuler
            </Button>
            <Button type="submit" className="min-h-[44px] w-full md:w-auto">
              Enregistrer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

