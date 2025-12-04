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
} from "@/base_components/ui/table";
import { Button } from "@/base_components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/base_components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/base_components/ui/dialog";
import { Input } from "@/base_components/ui/input";
import { Label } from "@/base_components/ui/label";
import { Plus, Edit, Trash2 } from "lucide-react";

interface Organizer {
  id: string;
  name: string;
  logo_url: string | null;
  icon_url: string | null;
  created_at: string;
  updated_at: string;
}

export function OrganizersManagement() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<Organizer | null>(null);

  useEffect(() => {
    loadOrganizers();
  }, []);

  async function loadOrganizers() {
    try {
      const { data, error } = await supabase
        .from("organizers")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setOrganizers(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrganizer(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet organisateur ?")) return;

    try {
      const { error } = await supabase.from("organizers").delete().eq("id", id);
      if (error) throw error;
      await loadOrganizers();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression de l'organisateur");
    }
  }

  function handleOpenDialog(organizer?: Organizer) {
    setEditingOrganizer(organizer || null);
    setIsDialogOpen(true);
  }

  if (loading) {
    return <div className="text-center py-8">Chargement des organisateurs...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gestion des organisateurs</CardTitle>
            <CardDescription>Gérez les organisateurs et artistes</CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un organisateur
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    Aucun organisateur trouvé
                  </TableCell>
                </TableRow>
              ) : (
                organizers.map((organizer) => (
                  <TableRow key={organizer.id}>
                    <TableCell className="font-medium">{organizer.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenDialog(organizer)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteOrganizer(organizer.id)}
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

        <OrganizerDialog
          organizer={editingOrganizer}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSuccess={loadOrganizers}
        />
      </CardContent>
    </Card>
  );
}

function OrganizerDialog({
  organizer,
  open,
  onOpenChange,
  onSuccess,
}: {
  organizer: Organizer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    icon_url: "",
  });

  useEffect(() => {
    if (organizer) {
      setFormData({
        name: organizer.name || "",
        logo_url: organizer.logo_url || "",
        icon_url: organizer.icon_url || "",
      });
    } else {
      setFormData({
        name: "",
        logo_url: "",
        icon_url: "",
      });
    }
  }, [organizer, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (organizer) {
        // Mise à jour
        const { error } = await supabase
          .from("organizers")
          .update(formData)
          .eq("id", organizer.id);

        if (error) throw error;
      } else {
        // Création
        const { error } = await supabase.from("organizers").insert([formData]);
        if (error) throw error;
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de la sauvegarde de l'organisateur");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {organizer ? "Modifier l'organisateur" : "Nouveau organisateur"}
          </DialogTitle>
          <DialogDescription>
            {organizer
              ? "Modifiez les informations de l'organisateur"
              : "Ajoutez un nouvel organisateur ou artiste"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo_url">URL du logo</Label>
            <Input
              id="logo_url"
              type="url"
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon_url">URL de l'icône</Label>
            <Input
              id="icon_url"
              type="url"
              value={formData.icon_url}
              onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
              placeholder="https://example.com/icon.png"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">{organizer ? "Enregistrer" : "Créer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


