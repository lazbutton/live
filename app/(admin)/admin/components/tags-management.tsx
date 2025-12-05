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
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateWithoutTimezone } from "@/lib/date-utils";

interface Tag {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function TagsManagement() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [filteredTags, setFilteredTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tagName, setTagName] = useState<string>("");
  const isMobile = useIsMobile();

  useEffect(() => {
    loadTags();
  }, []);

  // Filtrer les tags par recherche
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTags(tags);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTags(
        tags.filter((tag) => tag.name.toLowerCase().includes(query))
      );
    }
  }, [tags, searchQuery]);

  async function loadTags() {
    try {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des tags:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce tag ?")) return;

    try {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
      await loadTags();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression du tag");
    }
  }

  function handleOpenDialog(tag?: Tag) {
    setEditingTag(tag || null);
    setTagName(tag?.name || "");
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setEditingTag(null);
    setTagName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!tagName.trim()) {
      alert("Le nom du tag est obligatoire");
      return;
    }

    try {
      if (editingTag) {
        // Mettre à jour le tag
        const { error } = await supabase
          .from("tags")
          .update({ name: tagName.trim() })
          .eq("id", editingTag.id);

        if (error) {
          if (error.code === "23505") {
            alert(`Un tag avec le nom "${tagName.trim()}" existe déjà.`);
          } else {
            throw error;
          }
          return;
        }
      } else {
        // Créer un nouveau tag
        const { error } = await supabase
          .from("tags")
          .insert({ name: tagName.trim() });

        if (error) {
          if (error.code === "23505") {
            alert(`Un tag avec le nom "${tagName.trim()}" existe déjà.`);
          } else {
            throw error;
          }
          return;
        }
      }

      await loadTags();
      handleCloseDialog();
    } catch (error: any) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert(`Erreur lors de la sauvegarde du tag: ${error.message || "Erreur inconnue"}`);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Chargement des tags...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des tags</CardTitle>
        <CardDescription>
          Gérez tous les tags utilisés pour catégoriser les événements
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Barre de recherche et bouton d'ajout */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 min-h-[44px] text-base"
            />
          </div>
          <Button
            onClick={() => handleOpenDialog()}
            className="min-h-[44px] cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un tag
          </Button>
        </div>

        {/* Statistiques */}
        <div className="mb-4 text-sm text-muted-foreground">
          {filteredTags.length} tag{filteredTags.length > 1 ? "s" : ""} 
          {searchQuery && ` (sur ${tags.length} au total)`}
        </div>

        <MobileTableView
          desktopView={
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead>Modifié le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {tags.length === 0 
                          ? "Aucun tag trouvé. Cliquez sur 'Ajouter un tag' pour commencer."
                          : "Aucun tag ne correspond à votre recherche"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTags.map((tag) => (
                      <TableRow key={tag.id} className="cursor-pointer">
                        <TableCell className="font-medium">{tag.name}</TableCell>
                        <TableCell>
                          {formatDateWithoutTimezone(tag.created_at, "PP")}
                        </TableCell>
                        <TableCell>
                          {formatDateWithoutTimezone(tag.updated_at, "PP")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDialog(tag);
                              }}
                              className="cursor-pointer"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTag(tag.id);
                              }}
                              className="cursor-pointer text-destructive hover:text-destructive"
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
          }
          mobileView={
            filteredTags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tags.length === 0 
                  ? "Aucun tag trouvé. Cliquez sur 'Ajouter un tag' pour commencer."
                  : "Aucun tag ne correspond à votre recherche"}
              </div>
            ) : (
              filteredTags.map((tag) => (
                <MobileCard key={tag.id}>
                  <MobileCardRow label="Nom" value={tag.name} />
                  <MobileCardRow
                    label="Créé le"
                    value={formatDateWithoutTimezone(tag.created_at, "PP")}
                  />
                  <MobileCardRow
                    label="Modifié le"
                    value={formatDateWithoutTimezone(tag.updated_at, "PP")}
                  />
                  <MobileCardActions>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[44px] cursor-pointer"
                      onClick={() => handleOpenDialog(tag)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[44px] cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => deleteTag(tag.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer
                    </Button>
                  </MobileCardActions>
                </MobileCard>
              ))
            )
          }
        />

        {/* Dialog pour créer/modifier un tag */}
        <Dialog open={isDialogOpen} onOpenChange={handleCloseDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingTag ? "Modifier le tag" : "Ajouter un tag"}
              </DialogTitle>
              <DialogDescription>
                {editingTag
                  ? "Modifiez les informations du tag ci-dessous."
                  : "Ajoutez un nouveau tag pour catégoriser les événements."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du tag *</Label>
                  <Input
                    id="name"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder="Ex: Musique, Théâtre, Sport..."
                    className="min-h-[44px] text-base"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  className="cursor-pointer"
                >
                  Annuler
                </Button>
                <Button type="submit" className="cursor-pointer">
                  {editingTag ? "Enregistrer" : "Créer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

