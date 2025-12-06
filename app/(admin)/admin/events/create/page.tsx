"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "@/app/(admin)/admin/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressInput } from "@/components/ui/address-input";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Calendar, MapPin, Tag, Euro, Users, Clock, Link as LinkIcon, Image as ImageIcon, Upload, X, Save, Maximize2, Minimize2, RotateCw, LayoutGrid } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { compressImage } from "@/lib/image-compression";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";

function CreateEventContent() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; address: string | null; capacity: number | null; latitude: number | null; longitude: number | null }[]>([]);
  const [organizers, setOrganizers] = useState<{ id: string; name: string; instagram_url: string | null; facebook_url: string | null }[]>([]);
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>([]);

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
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const isMobile = useIsMobile();

  // Image states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(3 / 2);

  const [formData, setFormData] = useState({
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
    image_url: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load locations, organizers, categories, tags
      const [locationsResult, organizersResult, categoriesResult, tagsResult] = await Promise.all([
        supabase.from("locations").select("id, name, address, capacity, latitude, longitude").order("name"),
        supabase.from("organizers").select("id, name, instagram_url, facebook_url").order("name"),
        supabase.from("categories").select("id, name").eq("is_active", true).order("display_order"),
        supabase.from("tags").select("id, name").order("name"),
      ]);

      if (locationsResult.data) setLocations(locationsResult.data);
      if (organizersResult.data) setOrganizers(organizersResult.data);
      if (categoriesResult.data) setCategories(categoriesResult.data);
      if (tagsResult.data) setTags(tagsResult.data);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      alert("Erreur lors du chargement des données");
      router.push("/admin/events");
    } finally {
      setLoading(false);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("L'image ne doit pas dépasser 5MB");
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

  async function handleImageUpload(): Promise<string | null> {
    if (!imageFile) return null;

    try {
      const compressedFile = await compressImage(imageFile, 10);
      
      const fileExt = compressedFile.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from("event-images")
        .upload(fileName, compressedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        if (error.message?.includes("Bucket not found") || (error as any).statusCode === 404) {
          alert("Le bucket 'event-images' n'existe pas. Veuillez le créer dans Supabase Storage.");
        } else {
          throw error;
        }
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("event-images")
        .getPublicUrl(data.path);

      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      if (error.message?.includes("Bucket not found") || error.statusCode === 404) {
        alert("Le bucket 'event-images' n'existe pas. Veuillez le créer dans Supabase Storage.");
      } else {
        alert("Erreur lors de l'upload de l'image: " + (error.message || "Erreur inconnue"));
      }
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      let finalImageUrl = formData.image_url;

      if (imageFile) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          setSaving(false);
          return;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Create event
      const eventData: any = {
        title: formData.title,
        description: formData.description || null,
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? fromDatetimeLocal(formData.end_date) : null,
        end_time: formData.end_time || null,
        category: formData.category,
        price: formData.price ? parseFloat(formData.price) : null,
        address: formData.address || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        location_id: formData.location_id === "none" ? null : formData.location_id || null,
        door_opening_time: formData.door_opening_time || null,
        external_url: formData.external_url || null,
        external_url_label: formData.external_url_label || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        image_url: finalImageUrl || null,
        created_by: user?.id || null,
        status: "approved",
      };

      // Ajouter les tags si sélectionnés
      if (selectedTagIds.length > 0) {
        eventData.tag_ids = selectedTagIds;
      }

      const { data: newEvent, error: eventError } = await supabase
        .from("events")
        .insert([eventData])
        .select()
        .single();

      if (eventError) {
        console.error("Erreur détaillée lors de la création de l'événement:", {
          message: eventError.message,
          details: eventError.details,
          hint: eventError.hint,
          code: eventError.code,
          eventData,
        });
        throw eventError;
      }

      // Ajouter les organisateurs sélectionnés
      if (selectedOrganizerIds.length > 0) {
        const { error: orgError } = await supabase
          .from("event_organizers")
          .insert(
            selectedOrganizerIds.map((orgId) => ({
              event_id: newEvent.id,
              organizer_id: orgId,
            }))
          );

        if (orgError) throw orgError;
      }

      alert("Événement créé avec succès !");
      router.push("/admin/events");
    } catch (error: any) {
      console.error("Erreur lors de la création:", error);
      
      let errorMessage = "Erreur lors de la création de l'événement";
      
      if (error?.message?.includes("Bucket not found") || error?.code === "404") {
        errorMessage = `Bucket manquant: ${error.message}. Veuillez créer les buckets dans Supabase Storage (event-images, locations-images, organizers-images).`;
      } else if (error?.code === "42501" || error?.message?.includes("permission denied")) {
        errorMessage = "Vous n'avez pas la permission de créer un événement. Vérifiez vos droits d'administration.";
      } else if (error?.message) {
        errorMessage = `Erreur: ${error.message}`;
        if (error?.hint) {
          errorMessage += ` (Indice: ${error.hint})`;
        }
      }
      
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Créer un événement" breadcrumbItems={[{ label: "Événements", href: "/admin/events" }, { label: "Créer un événement" }]}>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Créer un événement"
      breadcrumbItems={[
        { label: "Événements", href: "/admin/events" },
        { label: "Créer un événement" },
      ]}
    >
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild className="cursor-pointer">
            <Link href="/admin/events">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour aux événements
            </Link>
          </Button>
        </div>

        {/* Main form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column - Main info */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Informations principales</CardTitle>
                  <CardDescription>Détails de l'événement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titre *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                      placeholder="Nom de l'événement"
                      className="cursor-pointer"
                    />
                  </div>

                  <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                    <div className="space-y-2">
                      <Label htmlFor="category" className="flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Catégorie *
                      </Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                        required
                      >
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder="Sélectionner une catégorie" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name} className="cursor-pointer">
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Tags
                      </Label>
                      <MultiSelectCreatable
                        options={tags.map((tag) => ({
                          label: tag.name,
                          value: tag.id,
                        }))}
                        selected={selectedTagIds}
                        onChange={setSelectedTagIds}
                        onCreate={async (name: string) => {
                          try {
                            const { data, error } = await supabase
                              .from("tags")
                              .insert([{ name: name.trim() }])
                              .select("id")
                              .single();

                            if (error) {
                              if (error.code === "23505") {
                                alert(`Un tag avec le nom "${name}" existe déjà.`);
                              } else if (error.message?.includes("permission denied") || error.code === "42501") {
                                alert("Vous n'avez pas la permission de créer un tag. Vérifiez vos droits d'administration.");
                              } else {
                                alert(`Erreur lors de la création du tag: ${error.message || "Erreur inconnue"}`);
                              }
                              throw error;
                            }
                            
                            // Recharger la liste des tags
                            const { data: tagsData } = await supabase
                              .from("tags")
                              .select("id, name")
                              .order("name");
                            if (tagsData) setTags(tagsData);
                            
                            return data?.id || null;
                          } catch (error) {
                            console.error("Erreur lors de la création du tag:", error);
                            return null;
                          }
                        }}
                        placeholder="Sélectionner ou créer des tags..."
                        createPlaceholder="Ajouter un nouveau tag..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={6}
                      placeholder="Description détaillée de l'événement"
                      className="cursor-pointer resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Date et heure de début *
                      </Label>
                      <Input
                        id="date"
                        type="datetime-local"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        required
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Date et heure de fin
                      </Label>
                      <Input
                        id="end_date"
                        type="datetime-local"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lieu et organisateur</CardTitle>
                  <CardDescription>Associer un lieu et/ou un organisateur</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="location_id" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Lieu
                      </Label>
                      <Select
                        value={formData.location_id || "none"}
                        onValueChange={(value) => {
                          const locationId = value === "none" ? "" : value;
                          // Mettre à jour l'adresse et la capacité automatiquement si un lieu est sélectionné
                          if (locationId) {
                            const selectedLocation = locations.find((loc) => loc.id === locationId);
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
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder="Sélectionner un lieu" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="cursor-pointer">
                            Aucun lieu
                          </SelectItem>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id} className="cursor-pointer">
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Organisateurs
                      </Label>
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Adresse
                    </Label>
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Détails supplémentaires</CardTitle>
                  <CardDescription>Prix, capacité et autres informations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="price" className="flex items-center gap-2">
                        <Euro className="h-4 w-4" />
                        Prix (€)
                      </Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        placeholder="0.00"
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="capacity" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Capacité
                      </Label>
                      <Input
                        id="capacity"
                        type="number"
                        value={formData.capacity}
                        onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                        placeholder="Nombre de places"
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="door_opening_time" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Heure d'ouverture des portes
                      </Label>
                      <Input
                        id="door_opening_time"
                        value={formData.door_opening_time}
                        onChange={(e) => setFormData({ ...formData, door_opening_time: e.target.value })}
                        placeholder="20:00"
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_time" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Heure de fin
                      </Label>
                      <Input
                        id="end_time"
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="external_url" className="flex items-center gap-2">
                        <LinkIcon className="h-4 w-4" />
                        URL externe
                      </Label>
                      <Input
                        id="external_url"
                        type="url"
                        value={formData.external_url}
                        onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                        placeholder="https://..."
                        className="cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="external_url_label">Libellé de l'URL externe</Label>
                      <Input
                        id="external_url_label"
                        value={formData.external_url_label}
                        onChange={(e) => setFormData({ ...formData, external_url_label: e.target.value })}
                        placeholder="Billetterie, Réserver, etc."
                        className="cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        className="cursor-pointer"
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
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column - Sticky sidebar */}
            <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Image de l'événement
                  </CardTitle>
                  <CardDescription>Ajoutez une image pour l'événement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {imagePreview && !showCropper && (
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border">
                      <img
                        src={imagePreview}
                        alt="Aperçu"
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          if (originalImageSrc) {
                            setCropImageSrc(originalImageSrc);
                            setShowCropper(true);
                          } else if (imageFile) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const dataUrl = reader.result as string;
                              setOriginalImageSrc(dataUrl);
                              setCropImageSrc(dataUrl);
                              setShowCropper(true);
                            };
                            reader.readAsDataURL(imageFile);
                          } else if (imagePreview) {
                            setOriginalImageSrc(imagePreview);
                            setCropImageSrc(imagePreview);
                            setShowCropper(true);
                          }
                        }}
                      />
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
                          const fileInput = document.getElementById("image-upload") as HTMLInputElement;
                          if (fileInput) fileInput.value = "";
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity cursor-pointer pointer-events-none">
                        <div className="text-white text-sm font-medium flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Cliquer pour rogner
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="cursor-pointer"
                      />
                      <Label
                        htmlFor="image-upload"
                        className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="image_url">Ou entrez une URL d'image</Label>
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
                        placeholder="https://..."
                        disabled={!!imageFile}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action buttons */}
              <div className="flex flex-col gap-2 sticky top-4">
                <Button type="submit" size="lg" disabled={saving} className="w-full cursor-pointer">
                  {saving ? (
                    <>Création en cours...</>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Créer l'événement
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  asChild
                  className="w-full cursor-pointer"
                >
                  <Link href="/admin/events">
                    Annuler
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Cropper Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="max-w-5xl p-0 gap-0">
          <div className="flex flex-col h-[90vh] max-h-[800px]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/20">
              <DialogHeader className="text-left">
                <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Rogner l'image
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-1">
                  Ajustez la zone de sélection en la déplaçant, changez le zoom et le format selon vos besoins
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Cropper Area */}
            <div className="flex-1 relative bg-gradient-to-br from-gray-900 via-black to-gray-900 rounded-none overflow-hidden min-h-[400px]">
              {cropImageSrc && (
                <div className="absolute inset-0">
                  <Cropper
                    image={cropImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspectRatio}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                  />
                </div>
              )}
            </div>

            {/* Controls Section */}
            <div className="px-6 py-4 border-t border-border/20 bg-background/50 backdrop-blur-sm">
              <div className="space-y-4">
                {/* Format Selection */}
                <div className="space-y-2">
                  <Label htmlFor="aspect-ratio" className="text-sm font-medium flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    Format de sélection
                  </Label>
                  <Select
                    value={aspectRatio === undefined ? "libre" : aspectRatio.toString()}
                    onValueChange={(value) => {
                      if (value === "libre") {
                        setAspectRatio(undefined);
                      } else {
                        const ratio = parseFloat(value);
                        setAspectRatio(ratio);
                      }
                    }}
                  >
                    <SelectTrigger className="cursor-pointer h-10">
                      <SelectValue placeholder="Sélectionner un format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="libre" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Maximize2 className="h-4 w-4" />
                          Libre (pas de contrainte)
                        </div>
                      </SelectItem>
                      <SelectItem value={(1 / 1).toString()} className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border border-current rounded" />
                          Carré (1:1)
                        </div>
                      </SelectItem>
                      <SelectItem value={(4 / 3).toString()} className="cursor-pointer">
                        Paysage 4:3
                      </SelectItem>
                      <SelectItem value={(16 / 9).toString()} className="cursor-pointer">
                        Paysage 16:9
                      </SelectItem>
                      <SelectItem value={(3 / 2).toString()} className="cursor-pointer">
                        Paysage 3:2
                      </SelectItem>
                      <SelectItem value={(3 / 4).toString()} className="cursor-pointer">
                        Portrait 3:4
                      </SelectItem>
                      <SelectItem value={(9 / 16).toString()} className="cursor-pointer">
                        Portrait 9:16
                      </SelectItem>
                      <SelectItem value={(2 / 3).toString()} className="cursor-pointer">
                        Portrait 2:3
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Zoom Control */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="zoom" className="text-sm font-medium flex items-center gap-2">
                      <Maximize2 className="h-4 w-4" />
                      Zoom
                    </Label>
                    <span className="text-sm text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                      {zoom.toFixed(1)}x
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="zoom"
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>1x</span>
                      <span>2x</span>
                      <span>3x</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Action Buttons */}
                <div className="flex justify-between items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setShowCropper(false);
                      setCropImageSrc(null);
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setAspectRatio(3 / 2);
                      const fileInput = document.getElementById("image-upload") as HTMLInputElement;
                      if (fileInput) fileInput.value = "";
                    }}
                    className="cursor-pointer"
                  >
                    Annuler
                  </Button>
                  <Button 
                    type="button" 
                    onClick={handleCropComplete} 
                    className="cursor-pointer min-w-[140px]"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Valider le rognage
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

export default function CreateEventPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout title="Créer un événement">
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </AdminLayout>
      }
    >
      <CreateEventContent />
    </Suspense>
  );
}

