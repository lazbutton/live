"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Room {
  id: string;
  location_id: string;
  name: string;
  capacity: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface RoomsManagementProps {
  locationId: string;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoomsManagement({
  locationId,
  locationName,
  open,
  onOpenChange,
}: RoomsManagementProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    capacity: "",
    description: "",
  });

  useEffect(() => {
    if (open && locationId) {
      loadRooms();
    }
  }, [open, locationId]);

  async function loadRooms() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("location_id", locationId)
        .order("name", { ascending: true });

      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des salles:", error);
      alert("Erreur lors du chargement des salles");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenDialog(room?: Room) {
    if (room) {
      setEditingRoom(room);
      setFormData({
        name: room.name || "",
        capacity: room.capacity?.toString() || "",
        description: room.description || "",
      });
    } else {
      setEditingRoom(null);
      setFormData({
        name: "",
        capacity: "",
        description: "",
      });
    }
    setIsDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const submitData = {
        location_id: locationId,
        name: formData.name,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        description: formData.description || null,
      };

      if (editingRoom) {
        // Mise à jour
        const { error } = await supabase
          .from("rooms")
          .update(submitData)
          .eq("id", editingRoom.id);

        if (error) throw error;
      } else {
        // Création
        const { error } = await supabase.from("rooms").insert([submitData]);
        if (error) throw error;
      }

      setIsDialogOpen(false);
      loadRooms();
    } catch (error: any) {
      console.error("Erreur lors de la sauvegarde:", error);
      let errorMessage = "Erreur lors de la sauvegarde de la salle";
      if (error?.message) {
        errorMessage += `: ${error.message}`;
      }
      if (error?.code === "42501" || error?.message?.includes("permission denied")) {
        errorMessage += ". Vérifiez que vous êtes admin et que la migration 031 a été appliquée avec la fonction is_user_admin().";
      }
      alert(errorMessage);
    }
  }

  async function deleteRoom(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette salle ?")) return;

    try {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
      loadRooms();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression de la salle");
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Salles de {locationName}</DialogTitle>
            <DialogDescription>
              Gérez les salles et scènes de ce lieu
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter une salle
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">Chargement...</div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucune salle. Cliquez sur "Ajouter une salle" pour commencer.
              </div>
            ) : (
              <div className="grid gap-4">
                {rooms.map((room) => (
                  <Card key={room.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{room.name}</CardTitle>
                          {room.capacity && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Capacité: {room.capacity} places
                            </p>
                          )}
                          {room.description && (
                            <p className="text-sm text-muted-foreground mt-2">
                              {room.description}
                            </p>
                          )}
                        </div>
                        <TooltipProvider delayDuration={300}>
                          <div className="flex gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenDialog(room)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Modifier la salle</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteRoom(room.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Supprimer la salle</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pour créer/modifier une salle */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRoom ? "Modifier la salle" : "Ajouter une salle"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
                placeholder="Ex: Grande salle, Scène principale..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Capacité</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({ ...formData, capacity: e.target.value })
                }
                placeholder="Nombre de places"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Description de la salle..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit">
                {editingRoom ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

