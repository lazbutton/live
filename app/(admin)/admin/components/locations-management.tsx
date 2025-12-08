"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { AddressInput } from "@/components/ui/address-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Image as ImageIcon, X, Search, Link as LinkIcon, Save, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import { RoomsManagement } from "./rooms-management";
import { compressImage } from "@/lib/image-compression";
import Cropper, { Area } from "react-easy-crop";

interface Location {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  short_description: string | null;
  capacity: number | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
  instagram_url: string | null;
  facebook_url: string | null;
  facebook_page_id: string | null;
  is_organizer: boolean | null;
  created_at: string;
  updated_at: string;
}

export function LocationsManagement() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRoomsDialogOpen, setIsRoomsDialogOpen] = useState(false);
  const [selectedLocationForRooms, setSelectedLocationForRooms] = useState<Location | null>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    try {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setLocations(data || []);
      setFilteredLocations(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des lieux:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les lieux par recherche
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredLocations(locations);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredLocations(
        locations.filter((location) => 
          location.name.toLowerCase().includes(query) ||
          location.address?.toLowerCase().includes(query)
        )
      );
    }
  }, [locations, searchQuery]);

  async function deleteLocation(id: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce lieu ?")) return;

    try {
      const { error } = await supabase.from("locations").delete().eq("id", id);
      if (error) throw error;
      await loadLocations();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      alert("Erreur lors de la suppression du lieu");
    }
  }

  function handleOpenDialog(location?: Location) {
    setEditingLocation(location || null);
    setIsDialogOpen(true);
  }

  if (loading) {
    return <div className="text-center py-8">Chargement des lieux...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestion des lieux</CardTitle>
        <CardDescription>Gérez les lieux disponibles pour les événements</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Barre de recherche et bouton d'ajout */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un lieu..."
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
            Ajouter un lieu
          </Button>
        </div>

        {/* Statistiques */}
        <div className="mb-4 text-sm text-muted-foreground">
          {filteredLocations.length} lieu{filteredLocations.length > 1 ? "x" : ""} 
          {searchQuery && ` (sur ${locations.length} au total)`}
        </div>

        <MobileTableView
          desktopView={
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLocations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        {locations.length === 0 
                          ? "Aucun lieu trouvé. Cliquez sur 'Ajouter un lieu' pour commencer."
                          : "Aucun lieu ne correspond à votre recherche"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLocations.map((location) => (
                    <TableRow key={location.id} className="cursor-pointer">
                      <TableCell className="font-medium">{location.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{location.address || "-"}</div>
                          {location.short_description && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {location.short_description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLocationForRooms(location);
                                setIsRoomsDialogOpen(true);
                              }}
                              className="cursor-pointer"
                              title="Gérer les salles"
                            >
                              <Building2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDialog(location);
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
                                deleteLocation(location.id);
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
            filteredLocations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {locations.length === 0 
                  ? "Aucun lieu trouvé. Cliquez sur 'Ajouter un lieu' pour commencer."
                  : "Aucun lieu ne correspond à votre recherche"}
              </div>
            ) : (
              filteredLocations.map((location) => (
                <MobileCard
                  key={location.id}
                  onClick={() => handleOpenDialog(location)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base flex-1">{location.name}</h3>
                  </div>
                  {location.short_description && (
                    <MobileCardRow
                      label="Description"
                      value={location.short_description}
                    />
                  )}
                  <MobileCardRow
                    label="Adresse"
                    value={location.address || "-"}
                  />
                  {location.capacity && (
                    <MobileCardRow
                      label="Capacité"
                      value={`${location.capacity} places`}
                    />
                  )}
                  {location.directions && (
                    <MobileCardRow
                      label="Comment s'y rendre"
                      value={location.directions}
                    />
                  )}
                  <MobileCardActions>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[44px] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLocationForRooms(location);
                        setIsRoomsDialogOpen(true);
                      }}
                    >
                      <Building2 className="h-4 w-4 mr-2" />
                      Salles
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 min-h-[44px] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDialog(location);
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
                        deleteLocation(location.id);
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

        <LocationDialog
          location={editingLocation}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onSuccess={loadLocations}
        />

        {selectedLocationForRooms && (
          <RoomsManagement
            locationId={selectedLocationForRooms.id}
            locationName={selectedLocationForRooms.name}
            open={isRoomsDialogOpen}
            onOpenChange={(open) => {
              setIsRoomsDialogOpen(open);
              if (!open) setSelectedLocationForRooms(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function LocationDialog({
  location,
  open,
  onOpenChange,
  onSuccess,
}: {
  location: Location | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    image_url: "",
    short_description: "",
    capacity: "",
    directions: "",
    latitude: "",
    longitude: "",
    instagram_url: "",
    facebook_url: "",
    facebook_page_id: "",
    is_organizer: false,
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
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
    if (location) {
      setFormData({
        name: location.name || "",
        address: location.address || "",
        image_url: location.image_url || "",
        short_description: location.short_description || "",
        capacity: location.capacity?.toString() || "",
        directions: location.directions || "",
        latitude: location.latitude?.toString() || "",
        longitude: location.longitude?.toString() || "",
        instagram_url: location.instagram_url || "",
        facebook_url: location.facebook_url || "",
        facebook_page_id: location.facebook_page_id || "",
        is_organizer: location.is_organizer || false,
      });
      setImagePreview(location.image_url || null);
      setOriginalImageSrc(location.image_url || null);
      setImageFile(null);
    } else {
      setFormData({
        name: "",
        address: "",
        image_url: "",
        short_description: "",
        capacity: "",
        directions: "",
        latitude: "",
        longitude: "",
        instagram_url: "",
        facebook_url: "",
        facebook_page_id: "",
        is_organizer: false,
      });
      setImagePreview(null);
      setOriginalImageSrc(null);
      setImageFile(null);
    }
  }, [location, open]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
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

      setImageFile(croppedImageFile);
      setImagePreview(URL.createObjectURL(croppedImageBlob));
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

  async function handleImageUpload(): Promise<string | null> {
    if (!imageFile) return formData.image_url;

    try {
      setUploading(true);
      
      // Compresser l'image avant upload pour qu'elle fasse moins de 10 Mo
      const fileToUpload = await compressImage(imageFile, 10);

      const fileExt = fileToUpload.name.split(".").pop() || "jpg";
      const fileName = `locations/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("locations-images")
        .upload(fileName, fileToUpload, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        if (error.message?.includes("Bucket not found")) {
          alert("Le bucket 'locations-images' n'existe pas. Veuillez le créer dans Supabase Storage.");
        } else {
          throw error;
        }
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("locations-images")
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      if (error.message?.includes("Bucket not found")) {
        alert("Le bucket 'locations-images' n'existe pas. Veuillez le créer dans Supabase Storage.");
      } else {
        alert("Erreur lors de l'upload de l'image: " + (error.message || "Erreur inconnue"));
      }
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setUploading(true);
      let finalImageUrl = formData.image_url;

      if (imageFile) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          setUploading(false);
          return;
        }
      }

      const submitData = {
        name: formData.name,
        address: formData.address || null,
        image_url: finalImageUrl || null,
        short_description: formData.short_description || null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        directions: formData.directions || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        facebook_page_id: formData.facebook_page_id || null,
        is_organizer: formData.is_organizer || false,
      };

      if (location) {
        // Mise à jour
        const { error } = await supabase
          .from("locations")
          .update(submitData)
          .eq("id", location.id);

        if (error) throw error;
      } else {
        // Création
        const { error } = await supabase.from("locations").insert([submitData]);
        if (error) throw error;
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      alert("Erreur lors de la sauvegarde du lieu");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{location ? "Modifier le lieu" : "Nouveau lieu"}</DialogTitle>
          <DialogDescription>
            {location
              ? "Modifiez les informations du lieu"
              : "Ajoutez un nouveau lieu pour les événements"}
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
            <Label htmlFor="address">Adresse *</Label>
            <AddressInput
              id="address"
              value={formData.address}
              onChange={(address) => setFormData({ ...formData, address })}
              onAddressSelect={(address, coordinates) => {
                setFormData({
                  ...formData,
                  address,
                  latitude: coordinates?.latitude?.toString() || "",
                  longitude: coordinates?.longitude?.toString() || "",
                });
              }}
              placeholder="Commencez à taper une adresse..."
              className="cursor-pointer"
              required
            />
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={formData.latitude}
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
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="2.3522"
                className="cursor-pointer min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="short_description">Courte description</Label>
            <Textarea
              id="short_description"
              value={formData.short_description}
              onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
              placeholder="Description courte du lieu..."
              rows={3}
              className="cursor-pointer resize-none min-h-[60px] text-base"
            />
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacité</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                placeholder="Nombre de places"
                className="cursor-pointer min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="directions">Comment s'y rendre</Label>
            <Textarea
              id="directions"
              value={formData.directions}
              onChange={(e) => setFormData({ ...formData, directions: e.target.value })}
              placeholder="Instructions pour accéder au lieu (transport, parking, etc.)"
              rows={4}
              className="cursor-pointer resize-none min-h-[80px] text-base"
            />
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="instagram_url" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Instagram
              </Label>
              <Input
                id="instagram_url"
                type="url"
                value={formData.instagram_url}
                onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                placeholder="https://instagram.com/..."
                className="cursor-pointer min-h-[44px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebook_url" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Facebook
              </Label>
              <Input
                id="facebook_url"
                type="url"
                value={formData.facebook_url}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="https://facebook.com/..."
                className="cursor-pointer min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 p-4 border rounded-lg">
            <Switch
              id="is_organizer"
              checked={formData.is_organizer}
              onCheckedChange={(checked) => setFormData({ ...formData, is_organizer: checked })}
            />
            <Label htmlFor="is_organizer" className="cursor-pointer">
              Ce lieu peut aussi être utilisé comme organisateur
            </Label>
          </div>

          {formData.is_organizer && (
            <div className="space-y-2">
              <Label htmlFor="facebook_page_id" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                ID de page Facebook
              </Label>
              <Input
                id="facebook_page_id"
                type="text"
                value={formData.facebook_page_id}
                onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
                placeholder="123456789"
                className="cursor-pointer min-h-[44px] text-base"
              />
              <p className="text-xs text-muted-foreground">
                ID numérique de la page Facebook (nécessaire pour importer les événements depuis Facebook)
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="image" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Image du lieu
            </Label>
            {imagePreview && !showCropper && (
              <div className="relative w-full aspect-video max-w-xs rounded-lg overflow-hidden border group cursor-pointer" onClick={handleImageClick}>
                <img
                  src={imagePreview}
                  alt="Aperçu"
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
                    setImagePreview(null);
                    setImageFile(null);
                    setOriginalImageSrc(null);
                    setFormData({ ...formData, image_url: "" });
                    const fileInput = document.getElementById("location-image-upload") as HTMLInputElement;
                    if (fileInput) fileInput.value = "";
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="location-image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="cursor-pointer"
              />
              <Label
                htmlFor="location-image-upload"
                className="text-xs text-muted-foreground"
              >
                Ou entrez une URL
              </Label>
              <Input
                id="image_url"
                type="url"
                value={formData.image_url}
                onChange={(e) => {
                  setFormData({ ...formData, image_url: e.target.value });
                  if (e.target.value) {
                    setImagePreview(e.target.value);
                    setOriginalImageSrc(e.target.value);
                    setImageFile(null);
                  }
                }}
                placeholder="https://example.com/image.jpg"
                disabled={!!imageFile}
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
              {uploading ? "Upload..." : location ? "Enregistrer" : "Créer"}
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

