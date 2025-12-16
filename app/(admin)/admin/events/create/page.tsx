"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AdminLayout } from "@/app/(admin)/admin/components/admin-layout";
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
import { SelectSearchable } from "@/components/ui/select-searchable";
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
import { ArrowLeft, Calendar, MapPin, Tag, Euro, Users, Clock, Link as LinkIcon, Image as ImageIcon, Upload, X, Save, Maximize2, Minimize2, RotateCw, LayoutGrid, Plus, Globe, Loader2, TriangleAlert, ExternalLink } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { compressImage } from "@/lib/image-compression";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { DateTimePicker } from "@/components/ui/date-time-picker";

type DuplicateEvent = {
  id: string;
  title: string;
  date: string;
  status: "pending" | "approved" | "rejected";
};

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

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

function toLocalDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function CreateEventContent() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string; address: string | null; capacity: number | null; latitude: number | null; longitude: number | null }[]>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string; location_id: string }>>([]);
  const [organizers, setOrganizers] = useState<Array<{ id: string; name: string; instagram_url: string | null; facebook_url: string | null; website_url: string | null; scraping_example_url: string | null; type: "organizer" | "location" }>>([]);
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>([]);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [isOrganizerDialogOpen, setIsOrganizerDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importOrganizerId, setImportOrganizerId] = useState<string>("none");
  const [formKey, setFormKey] = useState(Date.now()); // Clé pour forcer le re-render du formulaire (utiliser timestamp pour garantir l'unicité)
  const [duplicateEvents, setDuplicateEvents] = useState<DuplicateEvent[]>([]);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  
  // Refs pour forcer la mise à jour des inputs
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Fonction pour mettre à jour les réseaux sociaux quand un organisateur est sélectionné
  const handleOrganizerChange = (newOrganizerIds: string[]) => {
    setSelectedOrganizerIds(newOrganizerIds);
    
    // Si un organisateur est sélectionné, mettre à jour les réseaux sociaux avec ceux du premier organisateur
    if (newOrganizerIds.length > 0) {
      const firstOrganizerId = newOrganizerIds[0];
      const selectedOrganizer = organizers.find((org) => org.id === firstOrganizerId);
      
      if (selectedOrganizer) {
        // Utiliser la forme fonctionnelle pour éviter les problèmes de closure
        setFormData((prev) => {
          const updates: any = {
            instagram_url: selectedOrganizer.instagram_url || prev.instagram_url,
            facebook_url: selectedOrganizer.facebook_url || prev.facebook_url,
          };
          
          // Si l'organisateur est aussi un lieu, remplir automatiquement le lieu
          if (selectedOrganizer.type === "location") {
            updates.location_id = firstOrganizerId;
            // Charger les salles du lieu-organisateur
            loadRoomsForLocation(firstOrganizerId);
          }
          
          return {
            ...prev,
            ...updates,
          };
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
    image_url: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  // Doublons (lieu + jour de début) — debounce pour éviter spam de requêtes
  useEffect(() => {
    const locationId = formData.location_id;
    const start = formData.date;
    if (!locationId || locationId === "none" || !start) {
      setDuplicateEvents([]);
      setDuplicateLoading(false);
      return;
    }

    const t = window.setTimeout(async () => {
      try {
        setDuplicateLoading(true);
        const iso = fromDatetimeLocal(start) || start;
        const dayStart = startOfLocalDay(new Date(iso));
        if (Number.isNaN(dayStart.getTime())) {
          setDuplicateEvents([]);
          return;
        }
        const dayEnd = addDays(dayStart, 1);

        const { data, error } = await supabase
          .from("events")
          .select("id,title,date,status")
          .eq("location_id", locationId)
          .gte("date", dayStart.toISOString())
          .lt("date", dayEnd.toISOString())
          .order("date", { ascending: true })
          .limit(10);

        if (error) throw error;
        setDuplicateEvents((data || []) as DuplicateEvent[]);
      } catch (e) {
        console.error("Erreur doublons (create event):", e);
        setDuplicateEvents([]);
      } finally {
        setDuplicateLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(t);
  }, [formData.location_id, formData.date]);

  // Debug: log des changements de formData pour diagnostiquer
  useEffect(() => {
    console.log("🔄 formData a changé:", {
      title: formData.title,
      description: formData.description?.substring(0, 30),
      date: formData.date,
      end_date: formData.end_date,
      price: formData.price,
      category: formData.category,
      image_url: formData.image_url?.substring(0, 30),
      location_id: formData.location_id
    });
  }, [formData]);

  async function loadData() {
    try {
      // Load locations, organizers, categories, tags
      const [locationsResult, organizersResult, locationsOrganizersResult, categoriesResult, tagsResult] = await Promise.all([
        supabase.from("locations").select("id, name, address, capacity, latitude, longitude").order("name"),
        supabase.from("organizers").select("id, name, instagram_url, facebook_url, website_url, scraping_example_url").order("name"),
        supabase.from("locations").select("id, name, instagram_url, facebook_url, website_url, scraping_example_url").eq("is_organizer", true).order("name"),
        supabase.from("categories").select("id, name").eq("is_active", true).order("display_order"),
        supabase.from("tags").select("id, name").order("name"),
      ]);

      if (locationsResult.data) setLocations(locationsResult.data);
      
      // Combiner les organisateurs classiques et les lieux-organisateurs
      const allOrganizers = [
        ...(organizersResult.data || []).map((org) => ({ ...org, scraping_example_url: (org as any).scraping_example_url || null, type: "organizer" as const })),
        ...(locationsOrganizersResult.data || []).map((loc) => ({ ...loc, website_url: loc.website_url || null, scraping_example_url: loc.scraping_example_url || null, type: "location" as const })),
      ];
      setOrganizers(allOrganizers);
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

  // Fonction pour charger les salles d'un lieu
  async function loadRoomsForLocation(locationId: string) {
    if (!locationId) {
      setRooms([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, location_id")
        .eq("location_id", locationId)
        .order("name", { ascending: true });

      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des salles:", error);
      setRooms([]);
    }
  }

  // Charger les salles quand le lieu change
  useEffect(() => {
    if (formData.location_id) {
      loadRoomsForLocation(formData.location_id);
    } else {
      setRooms([]);
      setFormData((prev) => ({ ...prev, room_id: "" }));
    }
  }, [formData.location_id]);

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

  async function handleImportFromUrl() {
    if (!importUrl.trim()) {
      alert("Veuillez saisir une URL");
      return;
    }

    setIsImporting(true);
    try {
      const response = await fetch("/api/events/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          url: importUrl,
          organizer_id: importOrganizerId && importOrganizerId !== "none" ? (() => {
            const selectedOrg = organizers.find((org) => org.id === importOrganizerId);
            return selectedOrg?.type === "organizer" ? importOrganizerId : undefined;
          })() : undefined,
          location_id: importOrganizerId && importOrganizerId !== "none" ? (() => {
            const selectedOrg = organizers.find((org) => org.id === importOrganizerId);
            return selectedOrg?.type === "location" ? importOrganizerId : undefined;
          })() : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'import");
      }

      const result = await response.json();
      const data = result.data;

      if (!data) {
        throw new Error("Aucune donnée extraite");
      }

      console.log("📥 Données reçues de l'API:", data);

      // Pré-remplir le formulaire avec les données extraites (CSS en priorité, puis IA)
      const updates: Partial<typeof formData> = {};

      // Titre - CSS prioritaire puis IA
      if (data.title) {
        updates.title = data.title;
        console.log("✅ Titre pré-rempli:", data.title);
      }

      // Description - CSS prioritaire puis IA
      if (data.description) {
        updates.description = data.description;
        console.log("✅ Description pré-remplie:", data.description.substring(0, 50) + "...");
      }

      // URL externe
      if (data.external_url) {
        updates.external_url = data.external_url;
        console.log("✅ URL externe pré-remplie:", data.external_url);
      }

      // Prix - CSS prioritaire puis IA
      if (data.price !== undefined && data.price !== null && data.price !== "") {
        updates.price = String(data.price);
        console.log("✅ Prix pré-rempli:", updates.price);
      } else {
        console.log("ℹ️ Pas de prix fourni dans les données");
      }

      // Convertir les dates ISO en format datetime-local
      // Gestion correcte des timestamps et fuseaux horaires
      if (data.date) {
        try {
          // Si c'est déjà au format datetime-local, l'utiliser directement
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.date)) {
            updates.date = data.date;
            console.log("✅ Date pré-remplie (format datetime-local):", updates.date);
          } else {
            // Sinon, convertir depuis ISO en préservant la date/heure locale
            const dateObj = new Date(data.date);
            if (!isNaN(dateObj.getTime())) {
              // Utiliser les méthodes UTC pour éviter les conversions de fuseau horaire
              // ou utiliser les méthodes locales si on veut garder le fuseau horaire local
              const year = dateObj.getFullYear();
              const month = String(dateObj.getMonth() + 1).padStart(2, "0");
              const day = String(dateObj.getDate()).padStart(2, "0");
              const hours = String(dateObj.getHours()).padStart(2, "0");
              const minutes = String(dateObj.getMinutes()).padStart(2, "0");
              updates.date = `${year}-${month}-${day}T${hours}:${minutes}`;
              console.log("✅ Date pré-remplie (convertie):", updates.date);
            } else {
              console.warn("⚠️ Date invalide:", data.date);
            }
          }
        } catch (e) {
          console.error("Erreur lors de la conversion de la date:", e, data.date);
        }
      }

      if (data.end_date) {
        try {
          // Si c'est déjà au format datetime-local, l'utiliser directement
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.end_date)) {
            updates.end_date = data.end_date;
            console.log("✅ Date de fin pré-remplie (format datetime-local):", updates.end_date);
          } else {
            // Sinon, convertir depuis ISO en préservant la date/heure locale
            const dateObj = new Date(data.end_date);
            if (!isNaN(dateObj.getTime())) {
              const year = dateObj.getFullYear();
              const month = String(dateObj.getMonth() + 1).padStart(2, "0");
              const day = String(dateObj.getDate()).padStart(2, "0");
              const hours = String(dateObj.getHours()).padStart(2, "0");
              const minutes = String(dateObj.getMinutes()).padStart(2, "0");
              updates.end_date = `${year}-${month}-${day}T${hours}:${minutes}`;
              console.log("✅ Date de fin pré-remplie (convertie):", updates.end_date);
            } else {
              console.warn("⚠️ Date de fin invalide:", data.end_date);
            }
          }
        } catch (e) {
          console.error("Erreur lors de la conversion de la date de fin:", e, data.end_date);
        }
      }

      if (data.price !== undefined && data.price !== null) {
        updates.price = String(data.price);
        console.log("✅ Prix pré-rempli:", updates.price);
      }

      if (data.capacity) {
        updates.capacity = String(data.capacity);
        console.log("✅ Capacité pré-remplie:", updates.capacity);
      }
      if (data.door_opening_time) {
        updates.door_opening_time = data.door_opening_time;
        console.log("✅ Heure d'ouverture pré-remplie:", updates.door_opening_time);
      }
      if (data.image_url) {
        updates.image_url = data.image_url;
        console.log("✅ Image URL pré-remplie:", updates.image_url);
        // Mettre à jour aussi l'aperçu de l'image
        setImagePreview(data.image_url);
        setOriginalImageSrc(data.image_url);
      }

      // Essayer de trouver et sélectionner le lieu si un nom de lieu est fourni
      let locationIdToSet = "";
      if (data.location) {
        console.log("🔍 Recherche de lieu:", data.location);
        const matchingLocation = locations.find(
          (loc) => loc.name.toLowerCase().includes(data.location.toLowerCase()) ||
                   data.location.toLowerCase().includes(loc.name.toLowerCase())
        );
        if (matchingLocation) {
          console.log("✅ Lieu trouvé:", matchingLocation.name);
          locationIdToSet = matchingLocation.id;
          loadRoomsForLocation(matchingLocation.id);
        } else {
          console.warn("⚠️ Aucun lieu correspondant trouvé pour:", data.location);
        }
      }

      // Essayer de trouver et sélectionner l'organisateur
      let organizerIdToSet = "";
      
      // Priorité 1: Utiliser l'organisateur sélectionné dans le dialog d'import
      if (importOrganizerId && importOrganizerId !== "none") {
        const selectedOrg = organizers.find((org) => org.id === importOrganizerId);
        if (selectedOrg) {
          console.log("✅ Organisateur sélectionné dans l'import:", selectedOrg.name);
          organizerIdToSet = importOrganizerId;
        }
      }
      
      // Priorité 2: Si aucun organisateur sélectionné dans l'import, chercher dans les données scrapées
      if (!organizerIdToSet && data.organizer) {
        console.log("🔍 Recherche d'organisateur dans les données scrapées:", data.organizer);
        const matchingOrganizer = organizers.find(
          (org) => org.name.toLowerCase().includes(data.organizer.toLowerCase()) ||
                   data.organizer.toLowerCase().includes(org.name.toLowerCase())
        );
        if (matchingOrganizer) {
          console.log("✅ Organisateur trouvé dans les données:", matchingOrganizer.name);
          organizerIdToSet = matchingOrganizer.id;
        } else {
          console.warn("⚠️ Aucun organisateur correspondant trouvé pour:", data.organizer);
        }
      }

      // Essayer de trouver et sélectionner la catégorie si fournie
      let categoryIdToSet = "";
      if (data.category) {
        console.log("🔍 Recherche de catégorie:", data.category);
        console.log("📋 Catégories disponibles:", categories.map(c => ({ id: c.id, name: c.name })));
        
        // Vérifier d'abord si data.category est déjà un ID (UUID format)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.category);
        
        if (isUUID) {
          // C'est un ID, vérifier s'il existe dans les catégories
          const categoryById = categories.find(cat => cat.id === data.category);
          if (categoryById) {
            categoryIdToSet = categoryById.id;
            console.log("✅ Catégorie trouvée par ID:", categoryById.name, "->", categoryIdToSet);
          } else {
            console.warn("⚠️ ID de catégorie non trouvé:", data.category);
          }
        } else {
          // C'est un nom, chercher par nom
          const categoryLower = data.category.toLowerCase().trim();
          // Essayer d'abord une correspondance exacte
          let matchingCategory = categories.find(
            (cat) => cat.name.toLowerCase().trim() === categoryLower
          );
          // Sinon, essayer une correspondance partielle (contient ou est contenu)
          if (!matchingCategory) {
            matchingCategory = categories.find(
              (cat) => {
                const catNameLower = cat.name.toLowerCase().trim();
                return catNameLower.includes(categoryLower) || categoryLower.includes(catNameLower);
              }
            );
          }
          // Dernière tentative : recherche plus flexible (mots-clés communs)
          if (!matchingCategory) {
            const categoryWords = categoryLower.split(/\s+/);
            matchingCategory = categories.find(
              (cat) => {
                const catNameLower = cat.name.toLowerCase().trim();
                return categoryWords.some((word: string) => catNameLower.includes(word)) || 
                       catNameLower.split(/\s+/).some((word: string) => categoryLower.includes(word));
              }
            );
          }
          if (matchingCategory) {
            console.log("✅ Catégorie trouvée par nom:", matchingCategory.name, "->", matchingCategory.id);
            categoryIdToSet = matchingCategory.id;
          } else {
            console.warn("⚠️ Aucune catégorie correspondante trouvée pour:", data.category);
            console.warn("📋 Catégories disponibles:", categories.map(c => c.name));
          }
        }
      } else {
        console.log("ℹ️ Pas de catégorie fournie dans les données");
      }

      // Regrouper toutes les mises à jour en une seule
      if (locationIdToSet) updates.location_id = locationIdToSet;
      if (categoryIdToSet) updates.category = categoryIdToSet;

      console.log("📝 Mise à jour complète du formulaire avec:", updates);
      console.log("📋 État actuel du formulaire AVANT mise à jour:", formData);
      
      // Forcer un nouveau timestamp pour la clé AVANT la mise à jour
      const newFormKey = Date.now();
      setFormKey(newFormKey);
      
      // Attendre un peu pour que la clé soit appliquée
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Forcer la mise à jour en utilisant une fonction callback pour garantir que React détecte le changement
      setFormData((prev) => {
        const newData = { 
          ...prev, 
          ...updates
        };
        console.log("📋 Nouveau formulaire après mise à jour:", newData);
        console.log("🔍 Différences détectées:", Object.keys(updates).map(key => ({
          key,
          old: prev[key as keyof typeof prev],
          new: newData[key as keyof typeof newData],
          changed: prev[key as keyof typeof prev] !== newData[key as keyof typeof newData]
        })));
        return newData;
      });
      
      // Attendre que React applique les changements
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Forcer la mise à jour des inputs via les refs pour s'assurer que les valeurs sont visibles
      setTimeout(() => {
        if (titleInputRef.current && updates.title) {
          titleInputRef.current.value = updates.title;
          titleInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (descriptionTextareaRef.current && updates.description) {
          descriptionTextareaRef.current.value = updates.description;
          descriptionTextareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (dateInputRef.current && updates.date) {
          dateInputRef.current.value = updates.date;
          dateInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (endDateInputRef.current && updates.end_date) {
          endDateInputRef.current.value = updates.end_date;
          endDateInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (priceInputRef.current && updates.price) {
          priceInputRef.current.value = updates.price;
          priceInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 100);
      
      // Fermer la modale APRÈS la mise à jour pour que l'utilisateur voie les changements
      setIsImportDialogOpen(false);

      // Gérer l'organisateur séparément (il a sa propre logique)
      // ATTENTION: Ne pas appeler handleOrganizerChange ici car elle utilise ...formData (ancienne closure)
      // et peut écraser les données récemment importées. Mettre à jour manuellement.
      if (organizerIdToSet) {
        // Ajouter l'organisateur à la liste existante s'il n'est pas déjà présent
        setSelectedOrganizerIds((prev) => {
          if (prev.includes(organizerIdToSet)) {
            return prev; // Déjà présent, ne rien changer
          }
          return [...prev, organizerIdToSet]; // Ajouter à la liste existante
        });
        // Attendre un peu avant de mettre à jour les réseaux sociaux pour ne pas écraser les données importées
        setTimeout(() => {
          const selectedOrganizer = organizers.find((org) => org.id === organizerIdToSet);
          if (selectedOrganizer) {
            setFormData((prev) => ({
              ...prev,
              instagram_url: selectedOrganizer.instagram_url || prev.instagram_url,
              facebook_url: selectedOrganizer.facebook_url || prev.facebook_url,
            }));
            
            // Si l'organisateur est aussi un lieu, remplir automatiquement le lieu (seulement si pas déjà défini)
            if (selectedOrganizer.type === "location") {
              setFormData((prev2) => ({
                ...prev2,
                location_id: prev2.location_id || organizerIdToSet,
              }));
              loadRoomsForLocation(organizerIdToSet);
            }
          }
        }, 300);
      }

      // Essayer de trouver et créer les tags si fournis
      if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
        console.log("🔍 Recherche/création de tags:", data.tags);
        const matchedTagIds: string[] = [];
        
        for (const tagName of data.tags) {
          if (!tagName || !tagName.trim()) continue;
          
          const normalizedTagName = tagName.trim();
          
          // Essayer de trouver un tag existant qui correspond
          let matchingTag = tags.find(
            (tag) => tag.name.toLowerCase() === normalizedTagName.toLowerCase()
          );
          
          // Si pas trouvé, créer le tag
          if (!matchingTag) {
            try {
              console.log("➕ Création du tag:", normalizedTagName);
              const { data: newTag, error: tagError } = await supabase
                .from("tags")
                .insert([{ name: normalizedTagName }])
                .select()
                .single();
              
              if (!tagError && newTag) {
                matchingTag = { id: newTag.id, name: newTag.name };
                // Ajouter le nouveau tag à la liste locale
                setTags((prev) => [...prev, matchingTag!]);
                console.log("✅ Tag créé:", normalizedTagName, "->", newTag.id);
              } else {
                console.error("❌ Erreur lors de la création du tag:", tagError);
              }
            } catch (err) {
              console.error("❌ Erreur lors de la création du tag:", err);
            }
          }
          
          if (matchingTag) {
            matchedTagIds.push(matchingTag.id);
            console.log("✅ Tag sélectionné:", normalizedTagName, "->", matchingTag.name);
          }
        }
        
        if (matchedTagIds.length > 0) {
          console.log("✅ Tags sélectionnés:", matchedTagIds);
          setSelectedTagIds(matchedTagIds);
        } else {
          console.warn("⚠️ Aucun tag créé ou trouvé");
        }
      }

      // Ne pas fermer le dialog immédiatement, laisser les données s'appliquer d'abord
      console.log("✅ Import terminé, formulaire mis à jour");
      
      // Fermer le dialog après un court délai pour permettre à React de mettre à jour l'état
      setTimeout(() => {
        setIsImportDialogOpen(false);
        setImportUrl("");
        setImportOrganizerId("none");
      }, 100);
    } catch (error: any) {
      console.error("Erreur lors de l'import:", error);
      alert(`Erreur lors de l'import: ${error.message || "Erreur inconnue"}`);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      // Validation : la catégorie est obligatoire
      if (!formData.category || formData.category.trim() === "") {
        alert("La catégorie est obligatoire");
        setSaving(false);
        return;
      }

      // Validation : la date de fin ne peut pas être antérieure à la date de début
      if (formData.end_date && formData.date) {
        const startDate = new Date(formData.date);
        const endDate = new Date(formData.end_date);
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate < startDate) {
          alert("La date et heure de fin ne peut pas être antérieure à la date et heure de début");
          setSaving(false);
          return;
        }
      }

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

      // Récupérer l'adresse et les coordonnées du lieu sélectionné si un lieu est sélectionné
      const selectedLocation = formData.location_id && formData.location_id !== "none" 
        ? locations.find((loc) => loc.id === formData.location_id)
        : null;

      // Create event
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

      // Ajouter les organisateurs sélectionnés (organisateurs classiques et lieux-organisateurs)
      if (selectedOrganizerIds.length > 0) {
        const organizerEntries = selectedOrganizerIds.map((id) => {
          const organizer = organizers.find((o) => o.id === id);
          if (organizer?.type === "location") {
            return {
              event_id: newEvent.id,
              location_id: id,
              organizer_id: null,
            };
          } else {
            return {
              event_id: newEvent.id,
              organizer_id: id,
              location_id: null,
            };
          }
        });
        
        const { error: orgError } = await supabase
          .from("event_organizers")
          .insert(organizerEntries);

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
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            className="cursor-pointer"
          >
            <Globe className="mr-2 h-4 w-4" />
            Importer depuis une URL
          </Button>
        </div>

        {/* Main form */}
        <form key={`form-${formKey}`} onSubmit={handleSubmit} className="space-y-6">
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
                      ref={titleInputRef}
                      key={`input-title-${formKey}`}
                      value={formData.title || ""}
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
                        key={`select-category-${formKey}`}
                        value={formData.category || ""}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                        required
                      >
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder="Sélectionner une catégorie" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id} className="cursor-pointer">
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
                      ref={descriptionTextareaRef}
                      key={`textarea-description-${formKey}`}
                      value={formData.description || ""}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={6}
                      placeholder="Description détaillée de l'événement"
                      className="cursor-pointer resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Début *
                      </Label>
                      <DateTimePicker
                        id="date"
                        value={formData.date || ""}
                        onChange={(newStartDate) => {
                          setFormData((prev) => {
                            const next: typeof prev = { ...prev, date: newStartDate };

                            // Si la date de fin n'est pas remplie, la définir à début + 1 heure
                            if (!prev.end_date && newStartDate) {
                              next.end_date = addHoursToDatetimeLocal(newStartDate, 1);
                            }

                            // Si la date de fin est antérieure à la nouvelle date de début, la corriger
                            if (next.end_date && newStartDate) {
                              const start = new Date(newStartDate);
                              const end = new Date(next.end_date);
                              if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
                                next.end_date = addHoursToDatetimeLocal(newStartDate, 1);
                              }
                            }

                            return next;
                          });
                        }}
                        required
                        placeholder="Choisir une date et une heure"
                        className="space-y-0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_date" className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Fin
                      </Label>
                      <DateTimePicker
                        id="end_date"
                        value={formData.end_date || ""}
                        onChange={(newEndDate) => {
                          setFormData((prev) => ({ ...prev, end_date: newEndDate }));
                        }}
                        placeholder="Optionnel"
                        allowClear
                        className="space-y-0"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="door_opening_time" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Ouverture des portes
                      </Label>
                      <Input
                        id="door_opening_time"
                        value={formData.door_opening_time}
                        onChange={(e) => setFormData({ ...formData, door_opening_time: e.target.value })}
                        placeholder="20:00"
                        className="cursor-pointer"
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
                        ref={priceInputRef}
                        type="number"
                        step="0.01"
                        key={`input-price-${formKey}`}
                        value={formData.price || ""}
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
            <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-4 lg:self-start">
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
                      <div className="absolute inset-0 flex items-center justify-center admin-overlay opacity-0 hover:opacity-100 transition-opacity cursor-pointer pointer-events-none">
                        <div className="text-sm font-medium flex items-center gap-2">
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
                        key={`input-image_url-${formKey}`}
                        value={formData.image_url || ""}
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
                {(duplicateLoading || duplicateEvents.length > 0) && formData.location_id && formData.date && (
                  <div className="rounded-lg border-2 border-destructive/60 bg-destructive/5 p-3 ring-2 ring-destructive/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <TriangleAlert className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-destructive">Doublon potentiel</div>
                          <div className="text-xs text-muted-foreground">
                            {duplicateLoading
                              ? "Vérification des événements existants…"
                              : `${duplicateEvents.length} événement${duplicateEvents.length > 1 ? "s" : ""} déjà prévu${duplicateEvents.length > 1 ? "s" : ""} à ce lieu ce jour.`}
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
                        disabled={duplicateLoading || duplicateEvents.length === 0}
                        onClick={() => setDuplicateDialogOpen(true)}
                      >
                        Voir
                      </Button>
                    </div>
                  </div>
                )}
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

              {/* Lieu et organisateur */}
              <Card>
                <CardHeader>
                  <CardTitle>Lieu et organisateur</CardTitle>
                  <CardDescription>Associer un lieu et/ou un organisateur</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Organisateurs
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsOrganizerDialogOpen(true)}
                        className="h-8"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Ajouter
                      </Button>
                    </div>
                    <MultiSelect
                      options={organizers.map((org) => ({
                        label: `${org.name}${org.type === "location" ? " (Lieu)" : ""}`,
                        value: org.id,
                      }))}
                      selected={selectedOrganizerIds}
                      onChange={handleOrganizerChange}
                      placeholder="Sélectionner des organisateurs ou des lieux..."
                      disabled={organizers.length === 0}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="location_id" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Lieu
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsLocationDialogOpen(true)}
                        className="h-8"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Ajouter
                      </Button>
                    </div>
                    <SelectSearchable
                      options={[
                        { value: "none", label: "Aucun lieu" },
                        ...locations.map((loc) => ({
                          value: loc.id,
                          label: loc.name,
                        })),
                      ]}
                      value={formData.location_id || "none"}
                      onValueChange={(value) => {
                        const locationId = value === "none" ? "" : value;
                        // Mettre à jour l'adresse et la capacité automatiquement si un lieu est sélectionné
                        if (locationId) {
                          const selectedLocation = locations.find((loc) => loc.id === locationId);
                          if (selectedLocation) {
                            setFormData((prev) => ({ 
                              ...prev, 
                              location_id: locationId,
                              room_id: "", // Réinitialiser la salle quand le lieu change
                              capacity: selectedLocation.capacity ? selectedLocation.capacity.toString() : prev.capacity || ""
                            }));
                            // Charger les salles du lieu sélectionné
                            loadRoomsForLocation(locationId);
                            return;
                          }
                        }
                        setFormData((prev) => ({ ...prev, location_id: locationId, room_id: "" }));
                        setRooms([]);
                      }}
                      placeholder="Sélectionner un lieu"
                      searchPlaceholder="Rechercher un lieu..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="room_id" className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      Salle
                    </Label>
                    <Select
                      value={formData.room_id || "none"}
                      onValueChange={(value) => {
                        const roomId = value === "none" ? "" : value;
                        setFormData({ ...formData, room_id: roomId });
                      }}
                      disabled={!formData.location_id || rooms.length === 0}
                    >
                      <SelectTrigger className={!formData.location_id || rooms.length === 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}>
                        <SelectValue placeholder={rooms.length === 0 ? "Aucune salle disponible" : "Sélectionner une salle (optionnel)"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="cursor-pointer">
                          Aucune salle spécifique
                        </SelectItem>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id} className="cursor-pointer">
                            {room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                </CardContent>
              </Card>
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

      {/* Modal pour importer depuis une URL */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Importer depuis une URL
            </DialogTitle>
            <DialogDescription>
              Saisissez l'URL d'une page web contenant des informations sur un événement. L'IA analysera le contenu et pré-remplira automatiquement le formulaire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-organizer">Organisateur</Label>
              <Select
                value={importOrganizerId}
                onValueChange={setImportOrganizerId}
                disabled={isImporting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un organisateur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun organisateur</SelectItem>
                  {organizers
                    .filter((org) => org.scraping_example_url && org.website_url) // Afficher seulement les organisateurs avec un exemple de page
                    .map((organizer) => (
                      <SelectItem key={organizer.id} value={organizer.id}>
                        {organizer.name}
                        {organizer.type === "location" && (
                          <span className="text-xs text-muted-foreground ml-2">(Lieu)</span>
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {importOrganizerId && importOrganizerId !== "none" && (() => {
                const selectedOrg = organizers.find((org) => org.id === importOrganizerId);
                return selectedOrg?.scraping_example_url ? (
                  <div className="p-3 bg-info/10 rounded-lg border border-info/30">
                    <p className="text-xs font-medium text-info mb-1">
                      📄 Exemple de page configurée :
                    </p>
                    <a
                      href={selectedOrg.scraping_example_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-info underline break-all"
                    >
                      {selectedOrg.scraping_example_url}
                    </a>
                    <p className="text-xs text-muted-foreground mt-2">
                      ✅ Les sélecteurs CSS configurés seront utilisés pour scraper cette page et les nouvelles pages ajoutées.
                    </p>
                  </div>
                ) : null;
              })()}
              {(!importOrganizerId || importOrganizerId === "none") && (
                <p className="text-xs text-muted-foreground">
                  💡 Sélectionnez un organisateur ayant un exemple de page configuré pour utiliser ses sélecteurs CSS.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-url">URL de la page web</Label>
              <Input
                id="import-url"
                type="url"
                placeholder="https://example.com/evenement"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleImportFromUrl();
                  }
                }}
                disabled={isImporting}
                className="cursor-pointer"
              />
            </div>
            {isImporting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyse de la page en cours...</span>
              </div>
            )}
            <div className="text-sm text-muted-foreground">
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportUrl("");
                setImportOrganizerId("none");
              }}
              disabled={isImporting}
              className="cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleImportFromUrl}
              disabled={isImporting || !importUrl.trim()}
              className="cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Import en cours...
                </>
              ) : (
                <>
                  <Globe className="mr-2 h-4 w-4" />
                  Importer
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal doublons (lieu + jour) */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-warning-foreground" />
              Doublons potentiels
            </DialogTitle>
            <DialogDescription>
              Événements déjà prévus au même lieu le même jour.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {duplicateLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : duplicateEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucun doublon détecté.</div>
            ) : (
              <div className="space-y-2">
                {duplicateEvents.map((e) => {
                  const startKey = toLocalDayKey(startOfLocalDay(new Date(e.date)));
                  const href = `/admin/events?view=agenda&start=${startKey}&open=${e.id}`;
                  const variants: Record<string, "default" | "secondary" | "destructive"> = {
                    approved: "default",
                    pending: "secondary",
                    rejected: "destructive",
                  };
                  const labels: Record<string, string> = {
                    approved: "Approuvé",
                    pending: "En attente",
                    rejected: "Rejeté",
                  };
                  return (
                    <div key={e.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateWithoutTimezone(e.date, "PPp")}
                        </div>
                        <div className="mt-1">
                          <Badge variant={variants[e.status] || "secondary"}>{labels[e.status] || e.status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setDuplicateDialogOpen(false);
                            router.push(href);
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ouvrir
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal pour créer un lieu */}
      <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Ajouter un lieu</DialogTitle>
            <DialogDescription>
              Créez un nouveau lieu pour l'utiliser dans cet événement
            </DialogDescription>
          </DialogHeader>
          <CreateLocationModal
            onSuccess={async (locationId: string) => {
              setIsLocationDialogOpen(false);
              // Recharger les lieux
              const { data } = await supabase
                .from("locations")
                .select("id, name, address, capacity, latitude, longitude")
                .order("name");
              if (data) {
                setLocations(data);
                // Sélectionner automatiquement le nouveau lieu
                setFormData({ ...formData, location_id: locationId });
                loadRoomsForLocation(locationId);
              }
            }}
            onCancel={() => setIsLocationDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Modal pour créer un organisateur */}
      <Dialog open={isOrganizerDialogOpen} onOpenChange={setIsOrganizerDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Ajouter un organisateur</DialogTitle>
            <DialogDescription>
              Créez un nouvel organisateur pour l'utiliser dans cet événement
            </DialogDescription>
          </DialogHeader>
          <CreateOrganizerModal
            onSuccess={async (organizerId: string) => {
              setIsOrganizerDialogOpen(false);
              // Recharger les organisateurs
              const [organizersResult, locationsOrganizersResult] = await Promise.all([
                supabase.from("organizers").select("id, name, instagram_url, facebook_url, website_url, scraping_example_url").order("name"),
                supabase.from("locations").select("id, name, instagram_url, facebook_url, website_url, scraping_example_url").eq("is_organizer", true).order("name"),
              ]);
              const allOrganizers = [
                ...(organizersResult.data || []).map((org) => ({ ...org, type: "organizer" as const })),
                ...(locationsOrganizersResult.data || []).map((loc) => ({ ...loc, website_url: loc.website_url || null, scraping_example_url: loc.scraping_example_url || null, type: "location" as const })),
              ];
              setOrganizers(allOrganizers);
              // Sélectionner automatiquement le nouvel organisateur
              setSelectedOrganizerIds([...selectedOrganizerIds, organizerId]);
              handleOrganizerChange([...selectedOrganizerIds, organizerId]);
            }}
            onCancel={() => setIsOrganizerDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

// Composant modal pour créer un lieu (version simplifiée)
function CreateLocationModal({
  onSuccess,
  onCancel,
}: {
  onSuccess: (locationId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Le nom du lieu est obligatoire");
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("locations")
        .insert([{ name: name.trim() }])
        .select("id")
        .single();

      if (error) throw error;
      if (data) {
        onSuccess(data.id);
      }
    } catch (error: any) {
      console.error("Erreur lors de la création:", error);
      alert("Erreur lors de la création du lieu: " + (error.message || "Erreur inconnue"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="location-name">Nom du lieu *</Label>
        <Input
          id="location-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Salle des fêtes"
          className="cursor-pointer"
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="cursor-pointer">
          Annuler
        </Button>
        <Button type="submit" disabled={saving || !name.trim()} className="cursor-pointer">
          {saving ? "Création..." : "Créer"}
        </Button>
      </div>
    </form>
  );
}

// Composant modal pour créer un organisateur (version simplifiée)
function CreateOrganizerModal({
  onSuccess,
  onCancel,
}: {
  onSuccess: (organizerId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      alert("Le nom de l'organisateur est obligatoire");
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("organizers")
        .insert([{ name: name.trim() }])
        .select("id")
        .single();

      if (error) throw error;
      if (data) {
        onSuccess(data.id);
      }
    } catch (error: any) {
      console.error("Erreur lors de la création:", error);
      alert("Erreur lors de la création de l'organisateur: " + (error.message || "Erreur inconnue"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="organizer-name">Nom de l'organisateur *</Label>
        <Input
          id="organizer-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Association Culturelle"
          className="cursor-pointer"
          autoFocus
        />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="cursor-pointer">
          Annuler
        </Button>
        <Button type="submit" disabled={saving || !name.trim()} className="cursor-pointer">
          {saving ? "Création..." : "Créer"}
        </Button>
      </div>
    </form>
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

