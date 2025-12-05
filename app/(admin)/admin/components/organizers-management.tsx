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
import { Plus, Edit, Trash2, Image as ImageIcon, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardActions } from "./mobile-table-view";
import { compressImage } from "@/lib/image-compression";

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
        <MobileTableView
          desktopView={
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
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
          }
          mobileView={
            organizers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Aucun organisateur trouvé
              </div>
            ) : (
              organizers.map((organizer) => (
                <MobileCard
                  key={organizer.id}
                  onClick={() => handleOpenDialog(organizer)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base flex-1">{organizer.name}</h3>
                  </div>
                  <MobileCardActions>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 min-h-[44px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDialog(organizer);
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
                        deleteOrganizer(organizer.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </MobileCardActions>
                </MobileCard>
              ))
            )
          }
        />

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
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    icon_url: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (organizer) {
      setFormData({
        name: organizer.name || "",
        logo_url: organizer.logo_url || "",
        icon_url: organizer.icon_url || "",
      });
      setLogoPreview(organizer.logo_url || null);
      setIconPreview(organizer.icon_url || null);
      setLogoFile(null);
      setIconFile(null);
    } else {
      setFormData({
        name: "",
        logo_url: "",
        icon_url: "",
      });
      setLogoPreview(null);
      setIconPreview(null);
      setLogoFile(null);
      setIconFile(null);
    }
  }, [organizer, open]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image");
        return;
      }
      // La compression se fera automatiquement avant l'upload, pas besoin de limiter ici

      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
        setLogoFile(file);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image");
        return;
      }
      // La compression se fera automatiquement avant l'upload, pas besoin de limiter ici

      const reader = new FileReader();
      reader.onloadend = () => {
        setIconPreview(reader.result as string);
        setIconFile(file);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleImageUpload(file: File, type: "logo" | "icon"): Promise<string | null> {
    try {
      // Compresser l'image avant l'upload pour qu'elle fasse moins de 10 Mo
      const compressedFile = await compressImage(file, 10);
      
      const fileExt = compressedFile.name.split(".").pop() || "jpg";
      const fileName = `organizers/${type}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("organizers-images")
        .upload(fileName, compressedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        if (error.message?.includes("Bucket not found") || (error as any).statusCode === 404) {
          alert("Le bucket 'organizers-images' n'existe pas. Veuillez le créer dans Supabase Storage.");
        } else {
          throw error;
        }
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("organizers-images")
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      if (error.message?.includes("Bucket not found") || error.statusCode === 404) {
        alert("Le bucket 'organizers-images' n'existe pas. Veuillez le créer dans Supabase Storage.");
      } else {
        alert(`Erreur lors de l'upload de l'image ${type}: ${error.message || "Erreur inconnue"}`);
      }
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setUploading(true);
      let finalLogoUrl = formData.logo_url;
      let finalIconUrl = formData.icon_url;

      if (logoFile) {
        const uploadedUrl = await handleImageUpload(logoFile, "logo");
        if (uploadedUrl) {
          finalLogoUrl = uploadedUrl;
        } else {
          setUploading(false);
          return;
        }
      }

      if (iconFile) {
        const uploadedUrl = await handleImageUpload(iconFile, "icon");
        if (uploadedUrl) {
          finalIconUrl = uploadedUrl;
        } else {
          setUploading(false);
          return;
        }
      }

      const submitData = {
        ...formData,
        logo_url: finalLogoUrl || null,
        icon_url: finalIconUrl || null,
      };

      if (organizer) {
        // Mise à jour
        const { error } = await supabase
          .from("organizers")
          .update(submitData)
          .eq("id", organizer.id);

        if (error) throw error;
      } else {
        // Création
        const { error } = await supabase.from("organizers").insert([submitData]);
        if (error) throw error;
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de la sauvegarde de l'organisateur");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
            <Label htmlFor="logo" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Logo de l'organisateur
            </Label>
            {logoPreview && (
              <div className="relative w-full aspect-video max-w-xs rounded-lg overflow-hidden border">
                <img
                  src={logoPreview}
                  alt="Aperçu du logo"
                  className="w-full h-full object-contain bg-muted/20"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 cursor-pointer"
                  onClick={() => {
                    setLogoPreview(null);
                    setLogoFile(null);
                    setFormData({ ...formData, logo_url: "" });
                    const fileInput = document.getElementById("organizer-logo-upload") as HTMLInputElement;
                    if (fileInput) fileInput.value = "";
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="organizer-logo-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="cursor-pointer"
              />
              <Label
                htmlFor="organizer-logo-upload"
                className="text-xs text-muted-foreground"
              >
                Ou entrez une URL
              </Label>
              <Input
                id="logo_url"
                type="url"
                value={formData.logo_url}
                onChange={(e) => {
                  setFormData({ ...formData, logo_url: e.target.value });
                  if (e.target.value) {
                    setLogoPreview(e.target.value);
                    setLogoFile(null);
                  }
                }}
                placeholder="https://example.com/logo.png"
                disabled={!!logoFile}
                className="cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="icon" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Icône de l'organisateur
            </Label>
            {iconPreview && (
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                <img
                  src={iconPreview}
                  alt="Aperçu de l'icône"
                  className="w-full h-full object-contain bg-muted/20"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 cursor-pointer p-1 h-6 w-6"
                  onClick={() => {
                    setIconPreview(null);
                    setIconFile(null);
                    setFormData({ ...formData, icon_url: "" });
                    const fileInput = document.getElementById("organizer-icon-upload") as HTMLInputElement;
                    if (fileInput) fileInput.value = "";
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="organizer-icon-upload"
                type="file"
                accept="image/*"
                onChange={handleIconChange}
                className="cursor-pointer"
              />
              <Label
                htmlFor="organizer-icon-upload"
                className="text-xs text-muted-foreground"
              >
                Ou entrez une URL
              </Label>
              <Input
                id="icon_url"
                type="url"
                value={formData.icon_url}
                onChange={(e) => {
                  setFormData({ ...formData, icon_url: e.target.value });
                  if (e.target.value) {
                    setIconPreview(e.target.value);
                    setIconFile(null);
                  }
                }}
                placeholder="https://example.com/icon.png"
                disabled={!!iconFile}
                className="cursor-pointer"
              />
            </div>
          </div>

          <div className={`flex gap-2 ${isMobile ? "flex-col" : "justify-end"}`}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
              className="min-h-[44px] w-full md:w-auto"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={uploading}
              className="min-h-[44px] w-full md:w-auto"
            >
              {uploading ? "Upload..." : organizer ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


