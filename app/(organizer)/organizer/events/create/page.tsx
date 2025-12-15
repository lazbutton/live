"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getUserOrganizers, OrganizerInfo } from "@/lib/auth";
import { OrganizerLayout } from "../../components/organizer-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
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
  Globe,
  Loader2,
  Plus,
  Check,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { compressImage } from "@/lib/image-compression";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { organizerCache, CACHE_KEYS, CACHE_TTL } from "@/lib/organizer-cache";
import { DateTimePicker } from "@/components/ui/date-time-picker";

function addHoursToDatetimeLocal(value: string, hoursToAdd: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return value;
  d.setHours(d.getHours() + hoursToAdd);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const ho = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}T${ho}:${mi}`;
}

function CreateEventContent() {
  const router = useRouter();
  const { showAlert, AlertDialogComponent } = useAlertDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  });

  useEffect(() => {
    loadData();
    loadAllOrganizers();
  }, []);

  async function loadAllOrganizers() {
    try {
      const response = await fetch("/api/organizer/organizers/list");
      if (response.ok) {
        const { organizers } = await response.json();
        setAllOrganizers(organizers || []);
      }
    } catch (error) {
      console.error("Erreur lors du chargement de tous les organisateurs:", error);
    }
  }

  // Pré-sélectionner l'organisateur si l'utilisateur n'en a qu'un
  useEffect(() => {
    if (userOrganizers.length === 1 && selectedOrganizerIds.length === 0) {
      setSelectedOrganizerIds([userOrganizers[0].organizer_id]);
    }
  }, [userOrganizers]);

  // Charger les salles quand le lieu change
  useEffect(() => {
    if (formData.location_id && formData.location_id !== "none") {
      loadRoomsForLocation(formData.location_id);
    } else {
      setRooms([]);
      // Ne pas réinitialiser room_id ici pour éviter les boucles
      // Il sera réinitialisé seulement si nécessaire
    }
  }, [formData.location_id]);

  async function loadData() {
    try {
      const organizers = await getUserOrganizers();
      setUserOrganizers(organizers);

      // Charger les lieux, catégories et tags avec cache
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
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors du chargement des données",
        confirmText: "OK",
      });
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
        showAlert({
          title: "Erreur",
          description: "Veuillez sélectionner une image",
          confirmText: "OK",
        });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showAlert({
          title: "Erreur",
          description: "L'image ne doit pas dépasser 5MB",
          confirmText: "OK",
        });
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
      showAlert({
        title: "Erreur",
        description: "Erreur lors du rognage de l'image",
        confirmText: "OK",
      });
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
          showAlert({
            title: "Erreur",
            description: "Le bucket 'event-images' n'existe pas. Veuillez le créer dans Supabase Storage.",
            confirmText: "OK",
          });
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
      showAlert({
        title: "Erreur",
        description: "Erreur lors de l'upload de l'image: " + (error.message || "Erreur inconnue"),
        confirmText: "OK",
      });
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent, submitStatus: "draft" | "pending" = "draft") {
    e.preventDefault();

    if (!formData.title || !formData.date || !formData.category) {
      showAlert({
        title: "Champs obligatoires",
        description: "Veuillez remplir les champs obligatoires (titre, date, catégorie)",
        confirmText: "OK",
      });
      return;
    }

    if (selectedOrganizerIds.length === 0) {
      showAlert({
        title: "Organisateur requis",
        description: "Veuillez sélectionner au moins un organisateur",
        confirmText: "OK",
      });
      return;
    }

    setSaving(true);

    try {
      let finalImageUrl: string | null = null;

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

      // Récupérer l'adresse et les coordonnées du lieu sélectionné
      const selectedLocation =
        formData.location_id && formData.location_id !== "none"
          ? locations.find((loc) => loc.id === formData.location_id)
          : null;

      // Créer l'événement
      const eventData: any = {
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
        created_by: user?.id || null,
        status: submitStatus, // "draft" ou "pending"
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
        console.error("Erreur détaillée:", eventError);
        throw eventError;
      }

      // Ajouter les organisateurs sélectionnés
      // Pour les organisateurs, on utilise organizer_id
      // Pour les lieux-organisateurs, on utiliserait location_id (mais on n'a que organizer_id ici)
      const organizerEntries = selectedOrganizerIds.map((id) => ({
        event_id: newEvent.id,
        organizer_id: id,
        location_id: null,
      }));

      const { error: orgError } = await supabase
        .from("event_organizers")
        .insert(organizerEntries);

      if (orgError) throw orgError;

      // Invalider le cache des événements après création
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        organizerCache.delete(CACHE_KEYS.EVENTS(currentUser.id));
      }

      showAlert({
        title: "Succès",
        description: submitStatus === "draft"
          ? "Événement sauvegardé en brouillon !"
          : "Événement soumis pour validation !",
        confirmText: "OK",
      });
      router.push("/organizer/events");
    } catch (error: any) {
      console.error("Erreur lors de la création:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors de la création de l'événement: " + (error.message || "Erreur inconnue"),
        confirmText: "OK",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <OrganizerLayout
        title="Créer un événement"
        breadcrumbItems={[
          { label: "Mes événements", href: "/organizer/events" },
          { label: "Créer un événement" },
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

  // Handlers mémorisés pour éviter les re-renders
  const handleDateChange = useCallback((newStartDate: string) => {
    setFormData((prev) => {
      const nextEnd =
        (!prev.end_date && newStartDate)
          ? addHoursToDatetimeLocal(newStartDate, 1)
          : prev.end_date;
      return { ...prev, date: newStartDate, end_date: nextEnd };
    });
  }, []);

  const handleEndDateChange = useCallback((v: string) => {
    setFormData((prev) => ({ ...prev, end_date: v }));
  }, []);

  // Vérifier que l'utilisateur a au moins un organisateur
  if (userOrganizers.length === 0) {
    return (
      <OrganizerLayout
        title="Créer un événement"
        breadcrumbItems={[
          { label: "Mes événements", href: "/organizer/events" },
          { label: "Créer un événement" },
        ]}
      >
        <Card>
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
            <CardDescription>
              Vous n'avez pas d'organisateur associé à votre compte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/organizer/events">
              <Button variant="outline">Retour aux événements</Button>
            </Link>
          </CardContent>
        </Card>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout
      title="Créer un événement"
      breadcrumbItems={[
        { label: "Mes événements", href: "/organizer/events" },
        { label: "Créer un événement" },
      ]}
    >
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild className="w-full sm:w-auto">
            <Link href="/organizer/events">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Retour aux événements</span>
              <span className="sm:hidden">Retour</span>
            </Link>
          </Button>
        </div>

        {/* Main form */}
        <form onSubmit={(e) => handleSubmit(e, "draft")} className="space-y-6">
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
                    <Label htmlFor="title">
                      Titre * <span className="text-muted-foreground text-xs">(obligatoire)</span>
                    </Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                      required
                      placeholder="Nom de l'événement"
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
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une catégorie" />
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
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      rows={6}
                      placeholder="Description détaillée de l'événement"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <DateTimePicker
                        id="date"
                        label="Date et heure de début *"
                        value={formData.date}
                        onChange={handleDateChange}
                        required
                        placeholder="Choisir une date et une heure"
                      />
                    </div>

                    <div className="space-y-2">
                      <DateTimePicker
                        id="end_date"
                        label="Date et heure de fin"
                        value={formData.end_date}
                        onChange={handleEndDateChange}
                        placeholder="Optionnel"
                        allowClear
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
                          setFormData((prev) => ({ ...prev, door_opening_time: e.target.value }))
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
                        onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="0.00"
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
                        onChange={(e) => setFormData((prev) => ({ ...prev, capacity: e.target.value }))}
                        placeholder="Nombre de places"
                      />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Lieu</CardTitle>
                  <CardDescription>Où se déroule l'événement ?</CardDescription>
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
                        setFormData((prev) => ({ ...prev, location_id: value, room_id: "" }))
                      }
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

                  {rooms.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="room_id">Salle</Label>
                      <Select
                        value={formData.room_id || "none"}
                        onValueChange={(value) =>
                          setFormData((prev) => ({ ...prev, room_id: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une salle" />
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
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, external_url: e.target.value }))
                      }
                      placeholder="https://..."
                    />
                  </div>

                  {formData.external_url && (
                    <div className="space-y-2">
                      <Label htmlFor="external_url_label">Label du lien</Label>
                      <Input
                        id="external_url_label"
                        value={formData.external_url_label}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, external_url_label: e.target.value }))
                        }
                        placeholder="Ex: Réserver, Acheter des billets, etc."
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
                          setFormData((prev) => ({ ...prev, instagram_url: e.target.value }))
                        }
                        placeholder="https://instagram.com/..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="facebook_url">Facebook</Label>
                      <Input
                        id="facebook_url"
                        type="url"
                        value={formData.facebook_url}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, facebook_url: e.target.value }))
                        }
                        placeholder="https://facebook.com/..."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column - Image and Organizer */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Image</CardTitle>
                  <CardDescription>Image de l'événement</CardDescription>
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
                          setImagePreview(null);
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
                  <CardDescription>
                    {userOrganizers.length === 1
                      ? "Organisateur de l'événement"
                      : "Sélectionner l'organisateur"}
                  </CardDescription>
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
                    Sauvegarder en brouillon
                  </Button>
                  <Button
                    type="submit"
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
                  <Label htmlFor="new-organizer-name">Nom de l'organisateur *</Label>
                  <Input
                    id="new-organizer-name"
                    value={newOrganizerName}
                    onChange={(e) => setNewOrganizerName(e.target.value)}
                    placeholder="Ex: Association Culturelle d'Orléans"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="new-organizer-email">Email (optionnel)</Label>
                  <Input
                    id="new-organizer-email"
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
                      showAlert({
                        title: "Nom requis",
                        description: "Veuillez saisir le nom de l'organisateur",
                        confirmText: "OK",
                      });
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
                        }),
                      });

                      const data = await response.json();

                      if (!response.ok) {
                        throw new Error(data.error || "Erreur lors de la création de la demande");
                      }

                      showAlert({
                        title: "Demande envoyée",
                        description: "✅ Demande envoyée ! L'admin va traiter votre demande.",
                        confirmText: "OK",
                      });
                      setNewOrganizerName("");
                      setNewOrganizerEmail("");
                      setShowOrganizerModal(false);
                    } catch (error: any) {
                      console.error("Erreur:", error);
                      showAlert({
                        title: "Erreur",
                        description: error.message || "Erreur lors de l'envoi de la demande",
                        confirmText: "OK",
                      });
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
        <AlertDialogComponent />
    </OrganizerLayout>
  );
}

export default function CreateEventPage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Créer un événement">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </OrganizerLayout>
      }
    >
      <CreateEventContent />
    </Suspense>
  );
}
