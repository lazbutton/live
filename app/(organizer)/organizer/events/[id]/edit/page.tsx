"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getUserOrganizers, OrganizerInfo } from "@/lib/auth";
import { canEditEvent } from "@/lib/auth-helpers";
import { OrganizerLayout } from "../../../components/organizer-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Tag,
  Euro,
  Users,
  Clock,
  Link as LinkIcon,
  Image as ImageIcon,
  Upload,
  X,
  Save,
  Send,
  Loader2,
  AlertCircle,
  Plus,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { compressImage } from "@/lib/image-compression";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { organizerCache, CACHE_KEYS, CACHE_TTL } from "@/lib/organizer-cache";

function EditEventContent() {
  const router = useRouter();
  const params = useParams();
  const eventId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [userOrganizers, setUserOrganizers] = useState<OrganizerInfo[]>([]);
  const [locations, setLocations] = useState<
    Array<{
      id: string;
      name: string;
      address: string | null;
      capacity: number | null;
      latitude: number | null;
      longitude: number | null;
    }>
  >([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string; location_id: string }>>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>([]);
  const [allOrganizers, setAllOrganizers] = useState<Array<{ id: string; name: string; logo_url: string | null; type: "organizer" | "location" }>>([]);
  const [showOrganizerModal, setShowOrganizerModal] = useState(false);
  const [newOrganizerName, setNewOrganizerName] = useState("");
  const [newOrganizerEmail, setNewOrganizerEmail] = useState("");
  const [requestingOrganizer, setRequestingOrganizer] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Image states
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price: "",
    capacity: "",
    location_id: "",
    room_id: "",
    door_opening_time: "",
    external_url: "",
    external_url_label: "",
    instagram_url: "",
    facebook_url: "",
    status: "draft" as "draft" | "pending" | "approved" | "rejected",
    is_full: false,
  });

  useEffect(() => {
    checkPermissionAndLoadData();
  }, [eventId]);

  useEffect(() => {
    if (formData.location_id && formData.location_id !== "none") {
      loadRoomsForLocation(formData.location_id);
    } else {
      setRooms([]);
      setFormData((prev) => ({ ...prev, room_id: "" }));
    }
  }, [formData.location_id]);

  async function checkPermissionAndLoadData() {
    if (!eventId) return;

    try {
      // Vérifier les permissions
      const canEdit = await canEditEvent(eventId);
      setHasPermission(canEdit);

      if (!canEdit) {
        setLoading(false);
        return;
      }

      // Charger les organisateurs de l'utilisateur
      const organizers = await getUserOrganizers();
      setUserOrganizers(organizers);

      // Charger les données de base (lieux, catégories, tags) avec cache
      const [locationsResult, categoriesResult, tagsResult] = await Promise.all([
        // Vérifier le cache pour les lieux
        (async () => {
          const cached = organizerCache.get<Array<{ id: string; name: string; address: string | null; capacity: number | null; latitude: number | null; longitude: number | null }>>(CACHE_KEYS.LOCATIONS);
          if (cached) return { data: cached, error: null };
          const result = await supabase.from("locations").select("id, name, address, capacity, latitude, longitude").order("name");
          if (!result.error && result.data) {
            organizerCache.set(CACHE_KEYS.LOCATIONS, result.data, CACHE_TTL.LOCATIONS);
          }
          return result;
        })(),
        // Vérifier le cache pour les catégories
        (async () => {
          const cached = organizerCache.get<Array<{ id: string; name: string }>>(CACHE_KEYS.CATEGORIES);
          if (cached) return { data: cached, error: null };
          const result = await supabase.from("categories").select("id, name").eq("is_active", true).order("display_order");
          if (!result.error && result.data) {
            organizerCache.set(CACHE_KEYS.CATEGORIES, result.data, CACHE_TTL.CATEGORIES);
          }
          return result;
        })(),
        // Vérifier le cache pour les tags
        (async () => {
          const cached = organizerCache.get<Array<{ id: string; name: string }>>(CACHE_KEYS.TAGS);
          if (cached) return { data: cached, error: null };
          const result = await supabase.from("tags").select("id, name").order("name");
          if (!result.error && result.data) {
            organizerCache.set(CACHE_KEYS.TAGS, result.data, CACHE_TTL.TAGS);
          }
          return result;
        })(),
      ]);

      if (locationsResult.data) setLocations(locationsResult.data);
      if (categoriesResult.data) setCategories(categoriesResult.data);
      if (tagsResult.data) setTags(tagsResult.data);

      // Charger l'événement
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select(`
          *,
          event_organizers:event_organizers(
            organizer_id,
            location_id
          )
        `)
        .eq("id", eventId)
        .single();

      if (eventError) throw eventError;
      if (!event) {
        alert("Événement non trouvé");
        router.push("/organizer/events");
        return;
      }

      // Pré-remplir le formulaire
      setFormData({
        title: event.title || "",
        description: event.description || "",
        date: event.date ? toDatetimeLocal(event.date) || "" : "",
        end_date: event.end_date ? toDatetimeLocal(event.end_date) || "" : "",
        category: event.category || "",
        price: event.price ? String(event.price) : "",
        capacity: event.capacity ? String(event.capacity) : "",
        location_id: event.location_id || "",
        room_id: event.room_id || "",
        door_opening_time: event.door_opening_time || "",
        external_url: event.external_url || "",
        external_url_label: event.external_url_label || "",
        instagram_url: event.instagram_url || "",
        facebook_url: event.facebook_url || "",
        status: event.status || "draft",
        is_full: event.is_full || false,
      });

      setCurrentImageUrl(event.image_url || null);
      setImagePreview(event.image_url || null);

      // Pré-remplir les tags
      if (event.tag_ids && Array.isArray(event.tag_ids)) {
        setSelectedTagIds(event.tag_ids);
      }

      // Pré-remplir les organisateurs
      if (event.event_organizers && Array.isArray(event.event_organizers)) {
        const orgIds: string[] = [];
        event.event_organizers.forEach((eo: any) => {
          if (eo.organizer_id) orgIds.push(eo.organizer_id);
          if (eo.location_id) orgIds.push(eo.location_id);
        });
        setSelectedOrganizerIds([...new Set(orgIds)]);
      }
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      alert("Erreur lors du chargement de l'événement");
      router.push("/organizer/events");
    } finally {
      setLoading(false);
    }
  }

  async function loadRoomsForLocation(locationId: string) {
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, location_id")
        .eq("location_id", locationId)
        .order("name");

      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des salles:", error);
      setRooms([]);
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
    } catch (error) {
      console.error("Erreur lors du cropping:", error);
      alert("Erreur lors du rognage de l'image");
    }
  }

  async function handleImageUpload(): Promise<string | null> {
    if (!imageFile) return null;

    try {
      const compressedFile = await compressImage(imageFile, 2);

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

      const {
        data: { publicUrl },
      } = supabase.storage.from("event-images").getPublicUrl(data.path);

      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      alert("Erreur lors de l'upload de l'image: " + (error.message || "Erreur inconnue"));
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent, submitStatus?: "draft" | "pending") {
    e.preventDefault();

    if (!formData.title || !formData.date || !formData.category) {
      alert("Veuillez remplir les champs obligatoires (titre, date, catégorie)");
      return;
    }

    if (selectedOrganizerIds.length === 0) {
      alert("Veuillez sélectionner au moins un organisateur");
      return;
    }

    setSaving(true);

    try {
      let finalImageUrl = currentImageUrl;

      if (imageFile) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          setSaving(false);
          return;
        }
      }

      const selectedLocation =
        formData.location_id && formData.location_id !== "none"
          ? locations.find((loc) => loc.id === formData.location_id)
          : null;

      // Préparer les données de mise à jour
      const updateData: any = {
        title: formData.title,
        description: formData.description || null,
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? fromDatetimeLocal(formData.end_date) : null,
        category: formData.category,
        price: formData.price ? parseFloat(formData.price) : null,
        address: selectedLocation?.address || null,
        latitude: selectedLocation?.latitude || null,
        longitude: selectedLocation?.longitude || null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        location_id: formData.location_id === "none" ? null : formData.location_id || null,
        room_id: formData.room_id === "none" ? null : formData.room_id || null,
        door_opening_time: formData.door_opening_time || null,
        external_url: formData.external_url || null,
        external_url_label: formData.external_url_label || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        image_url: finalImageUrl || null,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : null,
        is_full: formData.is_full || false,
      };

      // Changer le statut seulement si spécifié
      if (submitStatus) {
        updateData.status = submitStatus;
      }

      const { error: eventError } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", eventId);

      if (eventError) {
        console.error("Erreur détaillée:", eventError);
        throw eventError;
      }

      // Mettre à jour les organisateurs (supprimer les anciens et ajouter les nouveaux)
      const { error: deleteError } = await supabase
        .from("event_organizers")
        .delete()
        .eq("event_id", eventId);

      if (deleteError) throw deleteError;

      const organizerEntries = selectedOrganizerIds.map((id) => ({
        event_id: eventId,
        organizer_id: id,
        location_id: null,
      }));

      const { error: orgError } = await supabase
        .from("event_organizers")
        .insert(organizerEntries);

      if (orgError) throw orgError;

      // Invalider le cache des événements après mise à jour
      organizerCache.invalidate("events");
      organizerCache.delete(CACHE_KEYS.EVENT(eventId));

      alert(
        submitStatus === "pending"
          ? "Événement soumis pour validation !"
          : "Événement mis à jour avec succès !"
      );
      router.push("/organizer/events");
    } catch (error: any) {
      console.error("Erreur lors de la mise à jour:", error);
      alert("Erreur lors de la mise à jour de l'événement: " + (error.message || "Erreur inconnue"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <OrganizerLayout
        title="Éditer l'événement"
        breadcrumbItems={[
          { label: "Mes événements", href: "/organizer/events" },
          { label: "Éditer" },
        ]}
      >
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </OrganizerLayout>
    );
  }

  if (hasPermission === false) {
    return (
      <OrganizerLayout
        title="Éditer l'événement"
        breadcrumbItems={[
          { label: "Mes événements", href: "/organizer/events" },
          { label: "Éditer" },
        ]}
      >
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Accès refusé</AlertTitle>
          <AlertDescription>
            Vous n'avez pas la permission d'éditer cet événement.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Link href="/organizer/events">
            <Button variant="outline">Retour aux événements</Button>
          </Link>
        </div>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout
      title="Éditer l'événement"
      breadcrumbItems={[
        { label: "Mes événements", href: "/organizer/events" },
        { label: "Éditer" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild className="w-full sm:w-auto">
            <Link href="/organizer/events">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Retour aux événements</span>
              <span className="sm:hidden">Retour</span>
            </Link>
          </Button>
        </div>

        {/* Statut actuel */}
        {formData.status !== "draft" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Statut: {formData.status}</AlertTitle>
            <AlertDescription>
              {formData.status === "pending"
                ? "Cet événement est en attente de validation par un administrateur."
                : formData.status === "approved"
                  ? "Cet événement est approuvé et visible publiquement."
                  : "Cet événement a été rejeté."}
            </AlertDescription>
          </Alert>
        )}

        {/* Main form */}
        <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column - Main info */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Informations principales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titre *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
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

                            if (error) throw error;

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
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_date" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Date et heure de fin
                      </Label>
                      <Input
                        id="end_date"
                        type="datetime-local"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="door_opening_time" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Ouverture des portes
                      </Label>
                      <Input
                        id="door_opening_time"
                        type="time"
                        value={formData.door_opening_time}
                        onChange={(e) =>
                          setFormData({ ...formData, door_opening_time: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="price" className="flex items-center gap-2">
                        <Euro className="h-4 w-4" />
                        Prix (€)
                      </Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="capacity" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Capacité
                    </Label>
                    <Input
                      id="capacity"
                      type="number"
                      min="1"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lieu</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="location_id" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Lieu
                    </Label>
                    <Select
                      value={formData.location_id || "none"}
                      onValueChange={(value) =>
                        setFormData({ ...formData, location_id: value, room_id: "" })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
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

                  {rooms.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="room_id">Salle</Label>
                      <Select
                        value={formData.room_id || "none"}
                        onValueChange={(value) => setFormData({ ...formData, room_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Aucune salle</SelectItem>
                          {rooms.map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-4 border-t mt-4">
                    <input
                      type="checkbox"
                      id="is_full"
                      checked={formData.is_full}
                      onChange={(e) => setFormData({ ...formData, is_full: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                    />
                    <Label htmlFor="is_full" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Lieu complet (sold out)
                    </Label>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Liens et réseaux sociaux</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="external_url" className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Lien externe
                    </Label>
                    <Input
                      id="external_url"
                      type="url"
                      value={formData.external_url}
                      onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                    />
                  </div>

                  {formData.external_url && (
                    <div className="space-y-2">
                      <Label htmlFor="external_url_label">Label du lien</Label>
                      <Input
                        id="external_url_label"
                        value={formData.external_url_label}
                        onChange={(e) =>
                          setFormData({ ...formData, external_url_label: e.target.value })
                        }
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="instagram_url">Instagram</Label>
                      <Input
                        id="instagram_url"
                        type="url"
                        value={formData.instagram_url}
                        onChange={(e) =>
                          setFormData({ ...formData, instagram_url: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="facebook_url">Facebook</Label>
                      <Input
                        id="facebook_url"
                        type="url"
                        value={formData.facebook_url}
                        onChange={(e) =>
                          setFormData({ ...formData, facebook_url: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Image</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full rounded-lg object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setImagePreview(currentImageUrl);
                          setImageFile(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                      <Label htmlFor="image-upload" className="cursor-pointer">
                        <Button type="button" variant="outline" asChild>
                          <span>
                            <Upload className="h-4 w-4 mr-2" />
                            Uploader une image
                          </span>
                        </Button>
                      </Label>
                      <Input
                        id="image-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Organisateur</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <MultiSelect
                    options={userOrganizers.map((uo) => ({
                      label: uo.organizer?.name || uo.organizer_id,
                      value: uo.organizer_id,
                    }))}
                    selected={selectedOrganizerIds}
                    onChange={setSelectedOrganizerIds}
                    placeholder="Sélectionner un organisateur"
                  />
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowOrganizerModal(true)}
                      className="w-full"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Ajouter ou sélectionner un organisateur
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Vous pouvez sélectionner parmi tous les organisateurs de l'application ou faire une demande pour ajouter un nouvel organisateur à l'admin.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={(e) => handleSubmit(e, "draft")}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Sauvegarder
                  </Button>
                  {formData.status === "draft" && (
                    <Button
                      type="button"
                      className="w-full"
                      onClick={(e) => handleSubmit(e, "pending")}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Soumettre pour validation
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>

      {/* Cropper Dialog */}
      <Dialog open={showCropper} onOpenChange={setShowCropper}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Rogner l'image</DialogTitle>
            <DialogDescription>
              Ajustez l'image pour l'événement. L'image sera compressée à moins de 2MB.
            </DialogDescription>
          </DialogHeader>
          {cropImageSrc && (
            <div className="relative h-[400px] w-full">
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={3 / 2}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCropper(false)}>
              Annuler
            </Button>
            <Button onClick={handleCropComplete}>Confirmer</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modale pour sélectionner ou demander un organisateur */}
      <Dialog open={showOrganizerModal} onOpenChange={setShowOrganizerModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gérer les organisateurs</DialogTitle>
            <DialogDescription>
              Sélectionnez parmi les organisateurs existants ou faites une demande pour ajouter un nouvel organisateur à l'admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Liste de tous les organisateurs */}
            <div>
              <h3 className="text-sm font-medium mb-3">Sélectionner parmi tous les organisateurs</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {allOrganizers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Chargement des organisateurs...</p>
                ) : (
                  allOrganizers.map((org) => {
                    const isSelected = selectedOrganizerIds.includes(org.id);
                    const isUserOrganizer = userOrganizers.some((uo) => uo.organizer_id === org.id);
                    return (
                      <div
                        key={org.id}
                        className={`flex items-center justify-between p-2 rounded hover:bg-accent cursor-pointer ${
                          isSelected ? "bg-primary/10 border border-primary" : ""
                        }`}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedOrganizerIds(selectedOrganizerIds.filter((id) => id !== org.id));
                          } else {
                            setSelectedOrganizerIds([...selectedOrganizerIds, org.id]);
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                            isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                          }`}>
                            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="text-sm font-medium">{org.name}</span>
                          {isUserOrganizer && (
                            <Badge variant="outline" className="text-xs">Vos organisateurs</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Separator />

            {/* Demande d'ajout d'organisateur */}
            <div>
              <h3 className="text-sm font-medium mb-3">Demander l'ajout d'un nouvel organisateur</h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="edit-new-organizer-name">Nom de l'organisateur *</Label>
                  <Input
                    id="edit-new-organizer-name"
                    value={newOrganizerName}
                    onChange={(e) => setNewOrganizerName(e.target.value)}
                    placeholder="Ex: Association Culturelle d'Orléans"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-new-organizer-email">Email (optionnel)</Label>
                  <Input
                    id="edit-new-organizer-email"
                    type="email"
                    value={newOrganizerEmail}
                    onChange={(e) => setNewOrganizerEmail(e.target.value)}
                    placeholder="contact@exemple.com"
                    className="mt-1"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!newOrganizerName.trim()) {
                      alert("Veuillez saisir le nom de l'organisateur");
                      return;
                    }

                    setRequestingOrganizer(true);
                    try {
                      const response = await fetch("/api/organizer/organizer-request", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          organizer_name: newOrganizerName.trim(),
                          organizer_email: newOrganizerEmail.trim() || null,
                          event_id: eventId,
                        }),
                      });

                      const data = await response.json();

                      if (!response.ok) {
                        throw new Error(data.error || "Erreur lors de la création de la demande");
                      }

                      alert("✅ Demande envoyée ! L'admin va traiter votre demande.");
                      setNewOrganizerName("");
                      setNewOrganizerEmail("");
                      setShowOrganizerModal(false);
                    } catch (error: any) {
                      console.error("Erreur:", error);
                      alert(`Erreur: ${error.message || "Erreur lors de l'envoi de la demande"}`);
                    } finally {
                      setRequestingOrganizer(false);
                    }
                  }}
                  disabled={requestingOrganizer || !newOrganizerName.trim()}
                  className="w-full"
                >
                  {requestingOrganizer ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Envoyer la demande
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOrganizerModal(false);
                setNewOrganizerName("");
                setNewOrganizerEmail("");
              }}
            >
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </OrganizerLayout>
  );
}

export default function EditEventPage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Éditer l'événement">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </OrganizerLayout>
      }
    >
      <EditEventContent />
    </Suspense>
  );
}

