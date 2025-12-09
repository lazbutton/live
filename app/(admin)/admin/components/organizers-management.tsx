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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Image as ImageIcon, X, Search, Save, RotateCw, LayoutGrid, Facebook, ExternalLink, Code } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardActions } from "./mobile-table-view";
import { FacebookEventsImporter } from "./facebook-events-importer";
import { compressImage } from "@/lib/image-compression";
import Cropper, { Area } from "react-easy-crop";
import { useCallback } from "react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Organizer {
  id: string;
  name: string;
  logo_url: string | null;
  short_description: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  facebook_page_id: string | null;
  website_url: string | null;
  scraping_example_url: string | null;
  created_at: string;
  updated_at: string;
  type?: "organizer" | "location"; // Pour différencier organisateur vs lieu
}

export function OrganizersManagement() {
  const router = useRouter();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [filteredOrganizers, setFilteredOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<Organizer | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isImporterOpen, setIsImporterOpen] = useState(false);

  useEffect(() => {
    loadOrganizers();
  }, []);

  async function loadOrganizers() {
    try {
      // Charger les organisateurs
      const { data: organizersData, error: organizersError } = await supabase
        .from("organizers")
        .select("*")
        .order("name", { ascending: true });

      if (organizersError) throw organizersError;

      // Charger les lieux qui sont aussi organisateurs
      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name, image_url, instagram_url, facebook_url, facebook_page_id, website_url, scraping_example_url, created_at, updated_at")
        .eq("is_organizer", true)
        .order("name", { ascending: true });

      if (locationsError) throw locationsError;

      // Combiner les deux listes
      const allOrganizers: Organizer[] = [
        ...(organizersData || []).map((org) => ({ ...org, type: "organizer" as const })),
        ...(locationsData || []).map((loc) => ({
          id: loc.id,
          name: loc.name,
          logo_url: loc.image_url, // Les lieux utilisent image_url au lieu de logo_url
          short_description: null,
          instagram_url: loc.instagram_url,
          facebook_url: loc.facebook_url,
          facebook_page_id: loc.facebook_page_id,
          website_url: loc.website_url || null,
          scraping_example_url: loc.scraping_example_url || null,
          created_at: loc.created_at,
          updated_at: loc.updated_at,
          type: "location" as const,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name));

      setOrganizers(allOrganizers);
      setFilteredOrganizers(allOrganizers);
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les organisateurs par recherche
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredOrganizers(organizers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredOrganizers(
        organizers.filter((organizer) => 
          organizer.name.toLowerCase().includes(query)
        )
      );
    }
  }, [organizers, searchQuery]);

  async function deleteOrganizer(id: string) {
    const organizer = organizers.find((o) => o.id === id);
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${organizer?.type === "location" ? "ce lieu-organisateur" : "cet organisateur"} ?`)) return;

    try {
      // Si c'est un lieu, on ne peut pas le supprimer depuis ici (il faut aller dans la gestion des lieux)
      if (organizer?.type === "location") {
        alert("Pour supprimer un lieu-organisateur, veuillez utiliser la gestion des lieux.");
        return;
      }

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
        <CardTitle>Gestion des organisateurs</CardTitle>
        <CardDescription>Gérez les organisateurs et artistes</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Barre de recherche et bouton d'ajout */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un organisateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 min-h-[44px] text-base"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setIsImporterOpen(true)}
              variant="outline"
              className="min-h-[44px] cursor-pointer"
            >
              <Facebook className="h-4 w-4 mr-2" />
              Importer depuis Facebook
            </Button>
            <Button
              onClick={() => handleOpenDialog()}
              className="min-h-[44px] cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un organisateur
            </Button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="mb-4 text-sm text-muted-foreground">
          {filteredOrganizers.length} organisateur{filteredOrganizers.length > 1 ? "s" : ""} 
          {searchQuery && ` (sur ${organizers.length} au total)`}
        </div>
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
                  {filteredOrganizers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        {organizers.length === 0 
                          ? "Aucun organisateur trouvé. Cliquez sur 'Ajouter un organisateur' pour commencer."
                          : "Aucun organisateur ne correspond à votre recherche"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrganizers.map((organizer) => (
                      <TableRow key={organizer.id} className="cursor-pointer">
                        <TableCell className="font-medium">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {organizer.name}
                              {organizer.type === "location" && (
                                <Badge variant="outline" className="text-xs">
                                  Lieu
                                </Badge>
                              )}
                              <Link
                                href={`/admin/events?organizer=${organizer.id}`}
                                target="_blank"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:text-primary/80 transition-colors"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <ExternalLink className="h-4 w-4" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Voir les événements</p>
                                  </TooltipContent>
                                </Tooltip>
                              </Link>
                            </div>
                            {organizer.short_description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {organizer.short_description}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {organizer.website_url && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/admin/scraping/${organizer.id}`);
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <Code className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Configurer le scraping</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDialog(organizer);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Modifier</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteOrganizer(organizer.id);
                                  }}
                                  className="cursor-pointer text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Supprimer</p>
                              </TooltipContent>
                            </Tooltip>
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
            filteredOrganizers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {organizers.length === 0 
                  ? "Aucun organisateur trouvé. Cliquez sur 'Ajouter un organisateur' pour commencer."
                  : "Aucun organisateur ne correspond à votre recherche"}
              </div>
            ) : (
              filteredOrganizers.map((organizer) => (
                <MobileCard
                  key={organizer.id}
                  onClick={() => handleOpenDialog(organizer)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base">{organizer.name}</h3>
                        {organizer.type === "location" && (
                          <Badge variant="outline" className="text-xs">
                            Lieu
                          </Badge>
                        )}
                        <Link
                          href={`/admin/events?organizer=${organizer.id}`}
                          target="_blank"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:text-primary/80 transition-colors"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ExternalLink className="h-4 w-4" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Voir les événements</p>
                            </TooltipContent>
                          </Tooltip>
                        </Link>
                      </div>
                      {organizer.short_description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {organizer.short_description}
                        </p>
                      )}
                    </div>
                  </div>
                  <MobileCardActions>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[44px] cursor-pointer"
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
                      variant="outline"
                      className="flex-1 min-h-[44px] cursor-pointer text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteOrganizer(organizer.id);
                      }}
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

        <OrganizerDialog
          organizer={editingOrganizer}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSuccess={loadOrganizers}
        />

        <FacebookEventsImporter
          open={isImporterOpen}
          onOpenChange={setIsImporterOpen}
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
    short_description: "",
    instagram_url: "",
    facebook_url: "",
    facebook_page_id: "",
    website_url: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Image cropping states
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(3 / 2);

  useEffect(() => {
    if (organizer) {
      setFormData({
        name: organizer.name || "",
        logo_url: organizer.logo_url || "",
        short_description: organizer.short_description || "",
        instagram_url: organizer.instagram_url || "",
        facebook_url: organizer.facebook_url || "",
        facebook_page_id: organizer.facebook_page_id || "",
        website_url: organizer.website_url || "",
      });
      setLogoPreview(organizer.logo_url || null);
      setOriginalImageSrc(organizer.logo_url || null);
      setLogoFile(null);
    } else {
      setFormData({
        name: "",
        logo_url: "",
        short_description: "",
        instagram_url: "",
        facebook_url: "",
        facebook_page_id: "",
        website_url: "",
      });
      setLogoPreview(null);
      setOriginalImageSrc(null);
      setLogoFile(null);
    }
  }, [organizer, open]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setOriginalImageSrc(dataUrl);
        setCropImageSrc(dataUrl);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  }

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  async function createCroppedImage(imageSrc: string, pixelCrop: Area): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageSrc;

      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Impossible de créer le contexte canvas"));
          return;
        }

        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          pixelCrop.width,
          pixelCrop.height
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Erreur lors de la création du blob"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.9
        );
      };

      image.onerror = () => {
        reject(new Error("Erreur lors du chargement de l'image"));
      };
    });
  }

  async function handleCropComplete() {
    if (!cropImageSrc || !croppedAreaPixels) return;

    try {
      const croppedImageBlob = await createCroppedImage(cropImageSrc, croppedAreaPixels);
      const croppedImageFile = new File([croppedImageBlob], `cropped-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      setLogoFile(croppedImageFile);
      setLogoPreview(URL.createObjectURL(croppedImageBlob));
      setShowCropper(false);
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setAspectRatio(3 / 2);
    } catch (error) {
      console.error("Erreur lors du cropping:", error);
      alert("Erreur lors du rognage de l'image");
    }
  }

  function handleImageClick() {
    if (originalImageSrc) {
      setCropImageSrc(originalImageSrc);
      setShowCropper(true);
    }
  }

  async function handleImageUpload(file: File): Promise<string | null> {
    try {
      // Compresser l'image avant l'upload pour qu'elle fasse moins de 10 Mo
      const compressedFile = await compressImage(file, 10);
      
      const fileExt = compressedFile.name.split(".").pop() || "jpg";
      const fileName = `organizers/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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
        alert(`Erreur lors de l'upload de l'image: ${error.message || "Erreur inconnue"}`);
      }
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setUploading(true);
      let finalLogoUrl = formData.logo_url;

      if (logoFile) {
        const uploadedUrl = await handleImageUpload(logoFile);
        if (uploadedUrl) {
          finalLogoUrl = uploadedUrl;
        } else {
          setUploading(false);
          return;
        }
      }

      const submitData = {
        ...formData,
        logo_url: finalLogoUrl || null,
        short_description: formData.short_description || null,
        facebook_page_id: formData.facebook_page_id || null,
        website_url: formData.website_url || null,
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
            <Label htmlFor="short_description">Courte description</Label>
            <Textarea
              id="short_description"
              value={formData.short_description}
              onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
              placeholder="Description courte de l'organisateur..."
              rows={3}
              className="cursor-pointer resize-none min-h-[60px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Image de l'organisateur
            </Label>
            {logoPreview && !showCropper && (
              <div className="relative w-full aspect-video max-w-xs rounded-lg overflow-hidden border group cursor-pointer" onClick={handleImageClick}>
                <img
                  src={logoPreview}
                  alt="Aperçu de l'image"
                  className="w-full h-full object-contain bg-muted/20"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm font-medium">
                    Cliquer pour rogner
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLogoPreview(null);
                    setLogoFile(null);
                    setOriginalImageSrc(null);
                    setFormData({ ...formData, logo_url: "" });
                    const fileInput = document.getElementById("organizer-image-upload") as HTMLInputElement;
                    if (fileInput) fileInput.value = "";
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="organizer-image-upload"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="cursor-pointer"
              />
              <Label
                htmlFor="organizer-image-upload"
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
                    setOriginalImageSrc(e.target.value);
                    setLogoFile(null);
                  }
                }}
                placeholder="https://example.com/logo.png"
                disabled={!!logoFile}
                className="cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram</Label>
              <Input
                id="instagram_url"
                type="url"
                value={formData.instagram_url}
                onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                placeholder="https://instagram.com/..."
                className="cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="facebook_url">Facebook</Label>
              <Input
                id="facebook_url"
                type="url"
                value={formData.facebook_url}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="https://facebook.com/..."
                className="cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website_url">Site web</Label>
            <Input
              id="website_url"
              type="url"
              value={formData.website_url}
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              placeholder="https://example.com"
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              URL du site web de l'organisateur. Utilisée pour le scraping automatique d'événements.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="facebook_page_id">ID de page Facebook</Label>
            <Input
              id="facebook_page_id"
              type="text"
              value={formData.facebook_page_id}
              onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
              placeholder="123456789 (ID numérique de la page)"
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              L'ID numérique de la page Facebook (nécessaire pour récupérer les événements). 
              Trouvez-le dans les paramètres de la page Facebook ou dans l'URL.
            </p>
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

        {/* Cropper Dialog */}
        <Dialog open={showCropper} onOpenChange={setShowCropper}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>Rogner l'image</DialogTitle>
              <DialogDescription>
                Ajustez la zone de l'image à utiliser
              </DialogDescription>
            </DialogHeader>
            
            <div className="px-6 pb-4 space-y-4">
              {/* Aspect Ratio Selector */}
              <div className="flex items-center gap-4">
                <Label htmlFor="aspect-ratio" className="text-sm font-medium">
                  Format:
                </Label>
                <Select
                  value={aspectRatio?.toString() || "none"}
                  onValueChange={(value) => {
                    if (value === "none") {
                      setAspectRatio(undefined);
                    } else {
                      setAspectRatio(parseFloat(value));
                    }
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Format" />
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Libre</SelectItem>
                  <SelectItem value="1">1:1 (Carré)</SelectItem>
                  <SelectItem value="1.3333333333333333">4:3</SelectItem>
                  <SelectItem value="1.5">3:2</SelectItem>
                  <SelectItem value="1.7777777777777777">16:9</SelectItem>
                  <SelectItem value="0.75">3:4 (Portrait)</SelectItem>
                  <SelectItem value="0.5625">9:16 (Portrait)</SelectItem>
                  <SelectItem value="0.6666666666666666">2:3 (Portrait)</SelectItem>
                </SelectContent>
                </Select>
              </div>

              {/* Cropper Area */}
              <div className="relative w-full h-[400px] bg-black rounded-lg overflow-hidden">
                {cropImageSrc && (
                  <Cropper
                    image={cropImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspectRatio}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                    style={{
                      containerStyle: {
                        width: "100%",
                        height: "100%",
                        position: "relative",
                      },
                    }}
                  />
                )}
              </div>

              {/* Zoom Control */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Zoom</Label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCropper(false);
                    setCropImageSrc(null);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                    setAspectRatio(3 / 2);
                  }}
                  className="cursor-pointer"
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  onClick={handleCropComplete}
                  className="cursor-pointer"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Enregistrer
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}




