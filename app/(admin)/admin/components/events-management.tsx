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
import { Check, X, Edit, Trash2 } from "lucide-react";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  status: "pending" | "approved" | "rejected";
  category: string;
  price: number | null;
  address: string | null;
  capacity: number | null;
  location_id: string | null;
  door_opening_time: string | null;
  external_url: string | null;
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

export function EventsManagement() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [organizers, setOrganizers] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadEvents();
    loadLocations();
    loadOrganizers();
    loadTags();
  }, []);

  async function loadOrganizers() {
    const { data } = await supabase.from("organizers").select("id, name").order("name");
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
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des événements:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("id, name");
    if (data) setLocations(data);
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
      // Préparer les données à mettre à jour
      const updateData: any = { ...eventData };
      if (tagIds !== undefined) {
        updateData.tag_ids = tagIds;
      }

      // Mettre à jour l'événement
      const { error: eventError } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", selectedEvent.id);

      if (eventError) throw eventError;

      // Gérer les organisateurs si fournis
      if (organizerIds !== undefined) {
        // Supprimer les associations existantes
        await supabase
          .from("event_organizers")
          .delete()
          .eq("event_id", selectedEvent.id);

        // Ajouter les nouvelles associations
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

      setIsDialogOpen(false);
      setSelectedEvent(null);
      await loadEvents();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("Erreur lors de la mise à jour de l'événement");
    }
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
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Aucun événement trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
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
                            onClick={() => {
                              setSelectedEvent(event);
                              setIsDialogOpen(true);
                            }}
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
          {events.length === 0 ? (
            <div className="block md:hidden text-center py-8 text-muted-foreground">
              Aucun événement trouvé
            </div>
          ) : (
            events.map((event) => (
              <MobileCard
                key={event.id}
                onClick={() => {
                  setSelectedEvent(event);
                  setIsDialogOpen(true);
                }}
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
                      setSelectedEvent(event);
                      setIsDialogOpen(true);
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
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: { id: string; name: string }[];
  organizers: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  onSave: (data: Partial<Event>, organizerIds?: string[], tagIds?: string[]) => void;
  onTagCreated?: () => void;
}) {
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    date: string;
    end_date: string;
    category: string;
    price: string;
    address: string;
    capacity: string;
    location_id: string;
    door_opening_time: string;
    external_url: string;
    status: "pending" | "approved" | "rejected";
  }>({
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price: "",
    address: "",
    capacity: "",
    location_id: "",
    door_opening_time: "",
    external_url: "",
    status: "pending",
  });
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title || "",
        description: event.description || "",
        date: toDatetimeLocal(event.date),
        end_date: toDatetimeLocal(event.end_date),
        category: event.category || "",
        price: event.price?.toString() || "",
        address: event.address || "",
        capacity: event.capacity?.toString() || "",
        location_id: event.location_id || "",
        door_opening_time: event.door_opening_time || "",
        external_url: event.external_url || "",
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
    } else {
      setSelectedOrganizerIds([]);
      setSelectedTagIds([]);
    }
  }, [event]);

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
        price: formData.price ? parseFloat(formData.price) : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        door_opening_time: formData.door_opening_time || null,
        external_url: formData.external_url || null,
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
              value={formData.description}
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
                value={formData.end_date}
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
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacité</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location_id">Lieu</Label>
            <Select
              value={formData.location_id || "none"}
              onValueChange={(value) => setFormData({ ...formData, location_id: value === "none" ? "" : value })}
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
              value={formData.address}
              onChange={(address) => setFormData({ ...formData, address })}
              placeholder="Commencez à taper une adresse..."
              className="cursor-pointer"
            />
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="door_opening_time">Heure d'ouverture des portes</Label>
              <Input
                id="door_opening_time"
                type="time"
                value={formData.door_opening_time}
                onChange={(e) => setFormData({ ...formData, door_opening_time: e.target.value })}
                placeholder="HH:MM"
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="external_url">URL externe</Label>
              <Input
                id="external_url"
                type="url"
                value={formData.external_url}
                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                placeholder="https://example.com"
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
              onChange={setSelectedOrganizerIds}
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

