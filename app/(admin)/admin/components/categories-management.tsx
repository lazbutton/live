"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, GripVertical, Search } from "lucide-react";
import { SortableCategoryRow } from "./sortable-category-row";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import { useIsMobile } from "@/hooks/use-mobile";

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  icon_svg: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function CategoriesManagement() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setCategories(data || []);
      setFilteredCategories(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des catégories:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les catégories par recherche
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCategories(categories);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredCategories(
        categories.filter((category) => 
          category.name.toLowerCase().includes(query) ||
          category.description?.toLowerCase().includes(query)
        )
      );
    }
  }, [categories, searchQuery]);

  async function deleteCategory(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette catégorie ?")) return;

    try {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
      await loadCategories();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression de la catégorie");
    }
  }

  function handleOpenDialog(category?: Category) {
    setEditingCategory(category || null);
    setIsDialogOpen(true);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((cat) => cat.id === active.id);
      const newIndex = categories.findIndex((cat) => cat.id === over.id);

      // Créer le nouvel ordre avec display_order mis à jour
      const newCategories = arrayMove(categories, oldIndex, newIndex).map((cat, index) => ({
        ...cat,
        display_order: index,
      }));
      
      // Mettre à jour l'état immédiatement avec les nouveaux display_order
      setCategories(newCategories);
      setFilteredCategories(newCategories);

      // Mettre à jour l'ordre dans la base de données
      try {
        const updates = newCategories.map((cat) => ({
          id: cat.id,
          display_order: cat.display_order,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from("categories")
            .update({ display_order: update.display_order })
            .eq("id", update.id);

          if (error) throw error;
        }
      } catch (error) {
        console.error("Erreur lors de la mise à jour de l'ordre:", error);
        alert("Erreur lors de la mise à jour de l'ordre des catégories");
        // Recharger les catégories en cas d'erreur
        await loadCategories();
      }
    }
  }

  if (loading) {
    return <div className="text-center py-8">Chargement des catégories...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des catégories</CardTitle>
        <CardDescription>
          Gérez les catégories d'événements disponibles. Faites glisser pour réorganiser l'ordre.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Barre de recherche et bouton d'ajout */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une catégorie..."
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
            Ajouter une catégorie
          </Button>
        </div>

        {/* Statistiques */}
        <div className="mb-4 text-sm text-muted-foreground">
          {filteredCategories.length} catégorie{filteredCategories.length > 1 ? "s" : ""} 
          {searchQuery && ` (sur ${categories.length} au total)`}
        </div>

        <MobileTableView
          desktopView={
            <div className="rounded-md border">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Ordre</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCategories.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          {categories.length === 0 
                            ? "Aucune catégorie trouvée. Cliquez sur 'Ajouter une catégorie' pour commencer."
                            : "Aucune catégorie ne correspond à votre recherche"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <SortableContext
                        items={filteredCategories.map((cat) => cat.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {filteredCategories.map((category) => (
                          <SortableCategoryRow
                            key={category.id}
                            category={category}
                            onEdit={() => handleOpenDialog(category)}
                            onDelete={() => deleteCategory(category.id)}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
            </div>
          }
          mobileView={
            filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {categories.length === 0 
                  ? "Aucune catégorie trouvée. Cliquez sur 'Ajouter une catégorie' pour commencer."
                  : "Aucune catégorie ne correspond à votre recherche"}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredCategories.map((cat) => cat.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredCategories.map((category) => (
                    <SortableCategoryCard
                      key={category.id}
                      category={category}
                      onEdit={() => handleOpenDialog(category)}
                      onDelete={() => deleteCategory(category.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )
          }
        />

        <CategoryDialog
          category={editingCategory}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSuccess={loadCategories}
          categories={categories}
        />
      </CardContent>
    </Card>
  );
}

function CategoryDialog({
  category,
  open,
  onOpenChange,
  onSuccess,
  categories,
}: {
  category: Category | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  categories: Category[];
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon_url: "",
    icon_svg: "",
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || "",
        description: category.description || "",
        icon_url: category.icon_url || "",
        icon_svg: category.icon_svg || "",
        is_active: category.is_active ?? true,
        display_order: category.display_order || 0,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        icon_url: "",
        icon_svg: "",
        is_active: true,
        display_order: 0,
      });
    }
  }, [category, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      if (category) {
        // Mise à jour
        const { error } = await supabase
          .from("categories")
          .update(formData)
          .eq("id", category.id);

        if (error) throw error;
      } else {
        // Création - définir display_order au maximum actuel + 1
        const maxOrder = Math.max(...categories.map((c) => c.display_order), -1);
        const { error } = await supabase.from("categories").insert([
          {
            ...formData,
            display_order: maxOrder + 1,
          },
        ]);
        if (error) throw error;
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de la sauvegarde de la catégorie");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {category ? "Modifier la catégorie" : "Nouvelle catégorie"}
          </DialogTitle>
          <DialogDescription>
            {category
              ? "Modifiez les informations de la catégorie"
              : "Ajoutez une nouvelle catégorie d'événements"}
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
              placeholder="Concert"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_order">Ordre d'affichage</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                }
                min="0"
              />
            </div>

            <div className="space-y-2 flex items-center">
              <div className="flex items-center space-x-2 mt-6">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active">Catégorie active</Label>
              </div>
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="icon_svg">Icône SVG (code SVG brut)</Label>
            <Textarea
              id="icon_svg"
              value={formData.icon_svg}
              onChange={(e) => setFormData({ ...formData, icon_svg: e.target.value })}
              rows={4}
              placeholder='<svg>...</svg>'
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit">{category ? "Enregistrer" : "Créer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Composant de carte sortable pour mobile
function SortableCategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <MobileCard>
        <div className="flex items-start gap-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-2 hover:bg-muted/50 rounded-lg mt-1 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            type="button"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-base flex-1">{category.name}</h3>
              <Badge variant={category.is_active ? "default" : "secondary"}>
                {category.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {category.description && (
              <MobileCardRow label="Description" value={category.description} />
            )}
            <MobileCardRow label="Ordre d'affichage" value={category.display_order} />
            <MobileCardActions>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 min-h-[44px]"
                onClick={onEdit}
              >
                <Edit className="h-4 w-4 mr-2" />
                Modifier
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-[44px] min-w-[44px]"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </MobileCardActions>
          </div>
        </div>
      </MobileCard>
    </div>
  );
}

