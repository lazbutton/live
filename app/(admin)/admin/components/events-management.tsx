"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useSidebar } from "@/components/ui/sidebar";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchable } from "@/components/ui/select-searchable";
import { Separator } from "@/components/ui/separator";
import { Check, X, Edit, Trash2, Plus, Search, Image as ImageIcon, Upload, Save, Maximize2, Minimize2, RotateCw, LayoutGrid, CalendarDays, Edit2, RefreshCw, Download, ChevronLeft, ChevronRight, CheckCircle2, Circle, EyeOff, Eye, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDateWithoutTimezone, toDatetimeLocal, fromDatetimeLocal } from "@/lib/date-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { compressImage } from "@/lib/image-compression";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { DateTimePicker } from "@/components/ui/date-time-picker";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  end_date: string | null;
  end_time: string | null;
  status: "pending" | "approved" | "rejected";
  category: string;
  price: number | null;
  presale_price: number | null;
  subscriber_price: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  is_full: boolean | null;
  location_id: string | null;
  room_id: string | null;
  door_opening_time: string | null;
  external_url: string | null;
  external_url_label: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  scraping_url: string | null;
  image_url: string | null;
  tag_ids?: string[];
  location?: { name: string };
  event_organizers?: Array<{
    organizer?: {
      id: string;
      name: string;
    } | null;
    location?: {
      id: string;
      name: string;
    } | null;
  }>;
}

type LocationData = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
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

function toLocalDayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromLocalDayKey(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function EventsManagement() {
  const searchParams = useSearchParams();
  const { setOpen: setSidebarOpen } = useSidebar();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importOrganizerId, setImportOrganizerId] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [scrapingEventId, setScrapingEventId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [organizers, setOrganizers] = useState<Array<{ id: string; name: string; instagram_url: string | null; facebook_url: string | null; type: "organizer" | "location" }>>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  
  // États des filtres
  const [filterDate, setFilterDate] = useState<"upcoming" | "all">("upcoming");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [filterOrganizer, setFilterOrganizer] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [pendingOpenEventId, setPendingOpenEventId] = useState<string | null>(null);

  // Vue d'affichage
  const [eventsView, setEventsView] = useState<"agenda" | "grid">("agenda");

  // Réglages Agenda
  const todayKey = useMemo(() => toLocalDayKey(startOfLocalDay(new Date())), []);
  const [agendaStartKey, setAgendaStartKey] = useState<string>(todayKey);
  const [agendaRangeDays, setAgendaRangeDays] = useState<7 | 14 | 30>(14);
  const [agendaShowEmptyDays, setAgendaShowEmptyDays] = useState(false);
  const [agendaDensity, setAgendaDensity] = useState<"compact" | "comfortable">("compact");
  const [agendaLaterOpen, setAgendaLaterOpen] = useState(false);
  const [agendaPastOpen, setAgendaPastOpen] = useState(false);
  const [agendaHiddenOpen, setAgendaHiddenOpen] = useState(false);

  // Masquage d'événements (préférence locale admin)
  const [hiddenEventIds, setHiddenEventIds] = useState<string[]>([]);
  const hiddenEventIdSet = useMemo(() => new Set(hiddenEventIds), [hiddenEventIds]);
  const hiddenInViewCount = useMemo(() => {
    if (hiddenEventIds.length === 0) return 0;
    let c = 0;
    for (const e of filteredEvents) {
      if (hiddenEventIdSet.has(e.id)) c++;
    }
    return c;
  }, [filteredEvents, hiddenEventIds.length, hiddenEventIdSet]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin.events.hiddenEventIds");
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setHiddenEventIds(parsed.filter((v): v is string => typeof v === "string"));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin.events.hiddenEventIds", JSON.stringify(hiddenEventIds));
    } catch {
      // ignore
    }
  }, [hiddenEventIds]);

  const toggleHidden = useCallback((eventId: string) => {
    setHiddenEventIds((prev) => {
      if (prev.includes(eventId)) return prev.filter((id) => id !== eventId);
      return [...prev, eventId];
    });
  }, []);

  const agendaDayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollToDay = useCallback((dayKey: string) => {
    const el = agendaDayRefs.current[dayKey];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const [pendingAgendaScrollKey, setPendingAgendaScrollKey] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingAgendaScrollKey) return;
    if (eventsView !== "agenda") return;
    const key = pendingAgendaScrollKey;
    requestAnimationFrame(() => scrollToDay(key));
    setPendingAgendaScrollKey(null);
  }, [pendingAgendaScrollKey, eventsView, scrollToDay]);

  // Persister la vue & réglages Agenda
  useEffect(() => {
    try {
      const raw = localStorage.getItem("admin.events.preferences");
      if (!raw) return;
      const prefs = JSON.parse(raw) as Partial<{
        view: "agenda" | "grid";
        agendaRangeDays: 7 | 14 | 30;
        agendaShowEmptyDays: boolean;
        agendaDensity: "compact" | "comfortable";
      }>;

      if (prefs.view === "agenda" || prefs.view === "grid") setEventsView(prefs.view);
      if (prefs.agendaRangeDays === 7 || prefs.agendaRangeDays === 14 || prefs.agendaRangeDays === 30) {
        setAgendaRangeDays(prefs.agendaRangeDays);
      }
      if (typeof prefs.agendaShowEmptyDays === "boolean") setAgendaShowEmptyDays(prefs.agendaShowEmptyDays);
      if (prefs.agendaDensity === "compact" || prefs.agendaDensity === "comfortable") setAgendaDensity(prefs.agendaDensity);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "admin.events.preferences",
        JSON.stringify({
          view: eventsView,
          agendaRangeDays,
          agendaShowEmptyDays,
          agendaDensity,
        })
      );
    } catch {
      // ignore
    }
  }, [eventsView, agendaRangeDays, agendaShowEmptyDays, agendaDensity]);

  // Initialiser les filtres depuis les paramètres d'URL
  useEffect(() => {
    if (searchParams) {
      const locationParam = searchParams.get("location");
      const organizerParam = searchParams.get("organizer");
      const statusParam = searchParams.get("status");
      const viewParam = searchParams.get("view");
      const importParam = searchParams.get("import");
      const startParam = searchParams.get("start");
      const openParam = searchParams.get("open");
      if (locationParam) {
        setFilterLocation(locationParam);
      }
      if (organizerParam) {
        setFilterOrganizer(organizerParam);
      }
      if (statusParam === "all" || statusParam === "pending" || statusParam === "approved" || statusParam === "rejected") {
        setFilterStatus(statusParam);
      }
      if (viewParam === "agenda" || viewParam === "grid") {
        setEventsView(viewParam);
      }
      if (startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam)) {
        setAgendaStartKey(startParam);
        setPendingAgendaScrollKey(startParam);
      }
      if (importParam === "1") {
        setIsImportDialogOpen(true);
      }
      if (openParam) {
        setPendingOpenEventId(openParam);
      }
      if (locationParam || organizerParam) {
        setShowAdvancedFilters(true);
      }
    }
  }, [searchParams]);

  // Ouvrir un événement directement via ?open=<id>
  useEffect(() => {
    if (!pendingOpenEventId) return;
    if (!events || events.length === 0) return;
    const ev = events.find((e) => e.id === pendingOpenEventId);
    if (!ev) return;

    setSelectedEvent(ev);
    setIsDialogOpen(true);

    // Se placer sur la journée de l'événement (agenda) pour garder le contexte
    const dayKey = toLocalDayKey(startOfLocalDay(new Date(ev.date)));
    setEventsView("agenda");
    setAgendaStartKey(dayKey);
    setPendingAgendaScrollKey(dayKey);

    setPendingOpenEventId(null);
  }, [pendingOpenEventId, events]);

  useEffect(() => {
    loadEvents();
    loadLocations();
    loadOrganizers();
    loadTags();
    loadCategories();
  }, []);

  async function loadCategories() {
    const { data } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");
    if (data) setCategories(data);
  }

  // Helper function pour obtenir le nom de la catégorie à partir de l'ID
  function getCategoryName(categoryId: string | null | undefined): string {
    if (!categoryId) return "-";
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || categoryId;
  }

  async function loadOrganizers() {
    // Charger les organisateurs classiques
    const { data: organizersData } = await supabase
      .from("organizers")
      .select("id, name, instagram_url, facebook_url")
      .order("name");
    
    // Charger les lieux qui sont aussi organisateurs
    const { data: locationsData } = await supabase
      .from("locations")
      .select("id, name, instagram_url, facebook_url")
      .eq("is_organizer", true)
      .order("name");
    
    // Combiner les deux listes avec un indicateur de type
    const allOrganizers = [
      ...(organizersData || []).map((org) => ({ ...org, type: "organizer" as const })),
      ...(locationsData || []).map((loc) => ({ ...loc, type: "location" as const })),
    ];
    
    setOrganizers(allOrganizers);
  }

  async function loadTags() {
    const { data } = await supabase.from("tags").select("id, name").order("name");
    if (data) setTags(data);
  }

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          location:locations(id, name),
          event_organizers:event_organizers(
            organizer:organizers(id, name),
            location:locations(id, name)
          )
        `)
        .order("date", { ascending: true });

      if (error) throw error;
      setEvents(data || []);
      setFilteredEvents(data || []);
    } catch (error) {
      console.error("Erreur lors du chargement des événements:", error);
    } finally {
      setLoading(false);
    }
  }

  // Appliquer les filtres
  useEffect(() => {
    let filtered = [...events];

    // Filtre par date (événements à venir par défaut)
    if (filterDate === "upcoming") {
      const today = startOfLocalDay(new Date());
      filtered = filtered.filter((event) => {
        const start = startOfLocalDay(new Date(event.date));
        const end = event.end_date ? startOfLocalDay(new Date(event.end_date)) : start;
        const endClamped = end.getTime() < start.getTime() ? start : end;
        return endClamped.getTime() >= today.getTime();
      });
    }

    // Filtre par statut
    if (filterStatus !== "all") {
      filtered = filtered.filter((event) => event.status === filterStatus);
    }

    // Filtre par lieu
    if (filterLocation !== "all") {
      filtered = filtered.filter((event) => event.location_id === filterLocation);
    }

    // Filtre par organisateur
    if (filterOrganizer !== "all") {
      filtered = filtered.filter((event) => 
        event.event_organizers?.some((eo) => 
          (eo.organizer?.id === filterOrganizer) || (eo.location?.id === filterOrganizer)
        )
      );
    }

    // Filtre par tag
    if (filterTag !== "all") {
      filtered = filtered.filter((event) => 
        event.tag_ids?.includes(filterTag)
      );
    }

    // Filtre par catégorie
    if (filterCategory !== "all") {
      filtered = filtered.filter((event) => 
        event.category === filterCategory
      );
    }

    // Filtre par recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((event) => {
        const titleMatch = event.title?.toLowerCase().includes(query);
        const descriptionMatch = event.description?.toLowerCase().includes(query);
        const categoryMatch = event.category?.toLowerCase().includes(query);
        const locationMatch = event.location?.name?.toLowerCase().includes(query);
        return titleMatch || descriptionMatch || categoryMatch || locationMatch;
      });
    }

    // Trier par date (ascendant)
    filtered.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA - dateB;
    });

    setFilteredEvents(filtered);
  }, [events, filterDate, filterStatus, filterLocation, filterOrganizer, filterTag, filterCategory, searchQuery]);

  async function loadLocations() {
    const { data } = await supabase.from("locations").select("id, name, address, capacity, latitude, longitude");
    if (data) setLocations(data as LocationData[]);
  }

  async function updateEventStatus(eventId: string, status: "approved" | "rejected") {
    try {
      // Récupérer le titre de l'événement avant la mise à jour
      const { data: event } = await supabase
        .from("events")
        .select("title, status")
        .eq("id", eventId)
        .single();

      const { error } = await supabase
        .from("events")
        .update({ status })
        .eq("id", eventId);

      if (error) throw error;

      // Créer des notifications pour les organisateurs
      const notificationType = status === "approved" ? "event_approved" : "event_rejected";
      const notificationTitle = status === "approved" 
        ? "Événement approuvé" 
        : "Événement rejeté";
      const notificationMessage = status === "approved"
        ? `Votre événement "${event?.title || "Sans titre"}" a été approuvé et est maintenant visible sur la plateforme.`
        : `Votre événement "${event?.title || "Sans titre"}" a été rejeté. Veuillez vérifier les informations et le soumettre à nouveau si nécessaire.`;

      try {
        await fetch(`/api/admin/events/${eventId}/notify-organizers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: notificationType,
            title: notificationTitle,
            message: notificationMessage,
            metadata: {
              old_status: event?.status,
              new_status: status,
            },
          }),
        });
      } catch (notifError) {
        // Ne pas bloquer la mise à jour si les notifications échouent
        console.error("Erreur lors de l'envoi des notifications:", notifError);
      }

      await loadEvents();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet événement ?")) return;

    try {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
      await loadEvents();
    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
    }
  }

  async function updateEvent(eventData: Partial<Event>, organizerIds?: string[], tagIds?: string[]) {
    if (!selectedEvent) return;

    try {
      const updateData: any = { ...eventData };
      
      // Convertir les chaînes vides en null pour les champs UUID
      const uuidFields = ['location_id', 'room_id'];
      uuidFields.forEach(field => {
        if (updateData[field] === "" || updateData[field] === "none") {
          updateData[field] = null;
        }
      });
      
      // Nettoyer les autres champs qui peuvent être des chaînes vides
      const nullableFields = ['external_url', 'external_url_label', 'instagram_url', 'facebook_url', 'scraping_url', 'door_opening_time'];
      nullableFields.forEach(field => {
        if (updateData[field] === "") {
          updateData[field] = null;
        }
      });
      
      if (tagIds !== undefined) {
        updateData.tag_ids = tagIds;
      }

      console.log("Données de mise à jour:", updateData);

      const { error: eventError } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", selectedEvent.id);

      if (eventError) {
        console.error("Erreur Supabase (update event):", JSON.stringify(eventError, null, 2));
        throw eventError;
      }

      // Gérer les organisateurs si fournis
      if (organizerIds !== undefined) {
        const { error: deleteError } = await supabase
          .from("event_organizers")
          .delete()
          .eq("event_id", selectedEvent.id);

        if (deleteError) {
          console.error("Erreur Supabase (delete organizers):", JSON.stringify(deleteError, null, 2));
          throw deleteError;
        }

        if (organizerIds.length > 0) {
          // Séparer les IDs en organisateurs classiques et lieux-organisateurs
          const organizerEntries = organizerIds.map((id) => {
            const organizer = organizers.find((o) => o.id === id);
            if (organizer?.type === "location") {
              return {
                event_id: selectedEvent.id,
                location_id: id,
                organizer_id: null,
              };
            } else {
              return {
                event_id: selectedEvent.id,
                organizer_id: id,
                location_id: null,
              };
            }
          });
          
          console.log("Insertion des organisateurs:", organizerEntries);
          
          const { error: orgError } = await supabase
            .from("event_organizers")
            .insert(organizerEntries);

          if (orgError) {
            console.error("Erreur Supabase (insert organizers):", JSON.stringify(orgError, null, 2));
            throw orgError;
          }
        }
      }

      setIsDialogOpen(false);
      setSelectedEvent(null);
      await loadEvents();
    } catch (error: any) {
      console.error("Erreur lors de la mise à jour:", error);
      console.error("Détails de l'erreur:", JSON.stringify(error, null, 2));
      alert(`Erreur lors de la mise à jour de l'événement: ${error?.message || JSON.stringify(error)}`);
    }
  }

  async function handleImportFromUrl() {
    if (!importUrl.trim()) {
      alert("Veuillez entrer une URL");
      return;
    }

    // Valider l'URL
    try {
      new URL(importUrl);
    } catch {
      alert("URL invalide");
      return;
    }

    setIsImporting(true);
    try {
      // Appeler l'API de scraping avec l'organisateur si sélectionné
      const response = await fetch('/api/events/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: importUrl.trim(),
          organizer_id: importOrganizerId || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors du scraping');
      }

      const result = await response.json();
      const scrapedData = result.data;

      // Créer un événement temporaire pour ouvrir le dialog d'édition
      // avec les données scrapées pré-remplies
      const tempEvent: Event = {
        id: 'temp',
        title: scrapedData.title || '',
        description: scrapedData.description || null,
        date: scrapedData.date || new Date().toISOString(),
        end_date: scrapedData.end_date || null,
        end_time: null,
        status: 'pending',
        category: scrapedData.category || categories[0]?.id || '',
        price: scrapedData.price ? parseFloat(scrapedData.price) : null,
        presale_price: scrapedData.presale_price ? parseFloat(scrapedData.presale_price) : null,
        subscriber_price: scrapedData.subscriber_price ? parseFloat(scrapedData.subscriber_price) : null,
        address: scrapedData.address || null,
        latitude: null,
        longitude: null,
        capacity: scrapedData.capacity ? parseInt(scrapedData.capacity) : null,
        is_full: scrapedData.is_full || false,
        location_id: null,
        room_id: null,
        door_opening_time: scrapedData.door_opening_time || null,
        external_url: scrapedData.external_url || scrapedData.external_url || null,
        external_url_label: null,
        instagram_url: null,
        facebook_url: null,
        scraping_url: importUrl.trim(),
        image_url: scrapedData.image_url || null,
      };

      // Fermer le dialog d'import et ouvrir le dialog d'édition
      setIsImportDialogOpen(false);
      setImportUrl("");
      setImportOrganizerId("");
      setSelectedEvent(tempEvent);
      setIsDialogOpen(true);
    } catch (error: any) {
      console.error('Erreur lors de l\'import:', error);
      alert(`Erreur lors de l'import: ${error.message || 'Erreur inconnue'}`);
    } finally {
      setIsImporting(false);
    }
  }

  function handleOpenDialog(event: Event) {
    setSelectedEvent(event);
    setIsDialogOpen(true);
  }

  // Fonction pour lancer le scraping depuis une carte d'événement
  async function handleScrapeFromCard(event: Event) {
    if (!event.scraping_url || !event.scraping_url.trim()) {
      alert("Aucune URL de scraping configurée pour cet événement");
      return;
    }

    setScrapingEventId(event.id);

    try {
      // Appeler l'API de scraping
      const response = await fetch('/api/events/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: event.scraping_url,
          organizer_id: event.event_organizers?.[0]?.organizer?.id || event.event_organizers?.[0]?.location?.id || null,
          location_id: event.location_id || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors du scraping');
      }

      const result = await response.json();
      const scrapedData = result.data;

      // Créer un événement mis à jour avec les données scrapées
      const updatedEvent: Event = {
        ...event,
        title: scrapedData.title || event.title,
        description: scrapedData.description || event.description,
        date: scrapedData.date || event.date,
        end_date: scrapedData.end_date || event.end_date,
        price: scrapedData.price ? parseFloat(scrapedData.price) : event.price,
        presale_price: scrapedData.presale_price ? parseFloat(scrapedData.presale_price) : event.presale_price,
        subscriber_price: scrapedData.subscriber_price ? parseFloat(scrapedData.subscriber_price) : event.subscriber_price,
        capacity: scrapedData.capacity ? parseInt(scrapedData.capacity) : event.capacity,
        door_opening_time: scrapedData.door_opening_time || event.door_opening_time,
        image_url: scrapedData.image_url || event.image_url,
        external_url: scrapedData.external_url || event.external_url,
        is_full: scrapedData.is_full !== undefined ? scrapedData.is_full : event.is_full,
      };

      // Ouvrir le dialog d'édition avec les données mises à jour
      setSelectedEvent(updatedEvent);
      setIsDialogOpen(true);
    } catch (error: any) {
      console.error('Erreur lors du scraping:', error);
      alert(`Erreur lors du scraping: ${error.message || 'Erreur inconnue'}`);
    } finally {
      setScrapingEventId(null);
    }
  }

  const getStatusBadge = (status: string) => {
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
      <Badge variant={variants[status] || "secondary"}>{labels[status] || status}</Badge>
    );
  };

  function getInitials(title: string) {
    return title
      .split(" ")
      .slice(0, 2)
      .map(n => n[0])
      .join("")
      .toUpperCase();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête compact */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">Événements</h2>
            <p className="text-sm text-muted-foreground">
              {filteredEvents.length} événement{filteredEvents.length > 1 ? "s" : ""}
              {searchQuery && ` sur ${events.length}`}
              {hiddenInViewCount > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  • {hiddenInViewCount} masqué{hiddenInViewCount > 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            <Button
              size="sm"
              variant={eventsView === "agenda" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setEventsView("agenda")}
              type="button"
            >
              <CalendarDays className="h-4 w-4 mr-1.5" />
              Agenda
            </Button>
            <Button
              size="sm"
              variant={eventsView === "grid" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setEventsView("grid")}
              type="button"
            >
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              Grille
            </Button>
          </div>
          <Button
            size="sm"
            className="h-9"
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Importer depuis une URL
          </Button>
          <Button asChild size="sm" className="h-9">
            <Link href="/admin/events/create">
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter
            </Link>
          </Button>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un événement..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Filtres */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterDate} onValueChange={(value: any) => setFilterDate(value)}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">À venir</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
          </SelectContent>
        </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setShowAdvancedFilters((v) => !v)}
          >
            {showAdvancedFilters ? "Masquer les filtres" : "Filtres avancés"}
            {[filterLocation, filterOrganizer, filterTag, filterCategory].filter((v) => v !== "all").length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {[filterLocation, filterOrganizer, filterTag, filterCategory].filter((v) => v !== "all").length}
              </Badge>
            )}
          </Button>

          {(filterDate !== "upcoming" ||
            filterStatus !== "all" ||
            filterLocation !== "all" ||
            filterOrganizer !== "all" ||
            filterTag !== "all" ||
            filterCategory !== "all" ||
            searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
              type="button"
            onClick={() => {
              setFilterDate("upcoming");
              setFilterStatus("all");
              setFilterLocation("all");
              setFilterOrganizer("all");
              setFilterTag("all");
              setFilterCategory("all");
              setSearchQuery("");
            }}
            className="h-9"
          >
            Réinitialiser
          </Button>
        )}
      </div>
          
        {showAdvancedFilters && (
          <div className="p-3 rounded-lg border bg-card">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>Lieu</Label>
                <SelectSearchable
                  value={filterLocation}
                  onValueChange={setFilterLocation}
                  placeholder="Tous les lieux"
                  options={[
                    { value: "all", label: "Tous les lieux" },
                    ...locations
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((loc) => ({ value: loc.id, label: loc.name })),
                  ]}
                />
              </div>

              <div className="space-y-1">
                <Label>Organisateur</Label>
                <SelectSearchable
                  value={filterOrganizer}
                  onValueChange={setFilterOrganizer}
                  placeholder="Tous les organisateurs"
                  options={[
                    { value: "all", label: "Tous les organisateurs" },
                    ...organizers
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((org) => ({
                        value: org.id,
                        label: `${org.name}${org.type === "location" ? " (Lieu)" : ""}`,
                      })),
                  ]}
                />
              </div>

              <div className="space-y-1">
                <Label>Tag</Label>
                <SelectSearchable
                  value={filterTag}
                  onValueChange={setFilterTag}
                  placeholder="Tous les tags"
                  options={[
                    { value: "all", label: "Tous les tags" },
                    ...tags
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((tag) => ({ value: tag.id, label: tag.name })),
                  ]}
                />
              </div>

              <div className="space-y-1">
                <Label>Catégorie</Label>
                <SelectSearchable
                  value={filterCategory}
                  onValueChange={setFilterCategory}
                  placeholder="Toutes les catégories"
                  options={[
                    { value: "all", label: "Toutes les catégories" },
                    ...categories
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((cat) => ({ value: cat.id, label: cat.name })),
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* Chips de filtres actifs */}
        {(filterDate !== "upcoming" ||
          filterStatus !== "all" ||
          filterLocation !== "all" ||
          filterOrganizer !== "all" ||
          filterTag !== "all" ||
          filterCategory !== "all" ||
          searchQuery.trim()) && (
          <div className="flex flex-wrap gap-2">
            {searchQuery.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setSearchQuery("")}
                title="Effacer la recherche"
              >
                <span className="max-w-[220px] truncate">Recherche: {searchQuery}</span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}

            {filterDate !== "upcoming" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setFilterDate("upcoming")}
                title="Remettre sur À venir"
              >
                <span>Période: Tous</span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}

            {filterStatus !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setFilterStatus("all")}
                title="Retirer le filtre statut"
              >
                <span>
                  Statut:{" "}
                  {filterStatus === "pending"
                    ? "En attente"
                    : filterStatus === "approved"
                      ? "Approuvé"
                      : "Rejeté"}
                </span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}

            {filterLocation !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setFilterLocation("all")}
                title="Retirer le filtre lieu"
              >
                <span className="max-w-[220px] truncate">
                  Lieu: {locations.find((l) => l.id === filterLocation)?.name || filterLocation}
                </span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}

            {filterOrganizer !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setFilterOrganizer("all")}
                title="Retirer le filtre organisateur"
              >
                <span className="max-w-[220px] truncate">
                  Organisateur: {organizers.find((o) => o.id === filterOrganizer)?.name || filterOrganizer}
                </span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}

            {filterTag !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setFilterTag("all")}
                title="Retirer le filtre tag"
              >
                <span className="max-w-[220px] truncate">
                  Tag: {tags.find((t) => t.id === filterTag)?.name || filterTag}
                </span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}

            {filterCategory !== "all" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={() => setFilterCategory("all")}
                title="Retirer le filtre catégorie"
              >
                <span className="max-w-[220px] truncate">
                  Catégorie: {categories.find((c) => c.id === filterCategory)?.name || filterCategory}
                </span>
                <X className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}
          </div>
        )}
      </div>
          
      {/* Liste d'événements */}
      {filteredEvents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto opacity-20 mb-2" />
          <p>{events.length === 0 ? "Aucun événement. Cliquez sur 'Ajouter' pour commencer." : `Aucun résultat pour les filtres sélectionnés`}</p>
        </div>
      ) : eventsView === "agenda" ? (
        (() => {
          const agendaStart = startOfLocalDay(fromLocalDayKey(agendaStartKey));
          const agendaEnd = startOfLocalDay(addDays(agendaStart, agendaRangeDays));

          const getDayLabel = (dayKey: string) => {
            const dayDate = startOfLocalDay(fromLocalDayKey(dayKey));
            const today = startOfLocalDay(new Date());
            const tomorrow = startOfLocalDay(addDays(today, 1));

            if (dayDate.getTime() === today.getTime()) return "Aujourd'hui";
            if (dayDate.getTime() === tomorrow.getTime()) return "Demain";

            return dayDate.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            });
          };

          const getDayShortLabel = (dayKey: string) => {
            const dayDate = startOfLocalDay(fromLocalDayKey(dayKey));
            const today = startOfLocalDay(new Date());
            const tomorrow = startOfLocalDay(addDays(today, 1));

            if (dayDate.getTime() === today.getTime()) return "Aujourd'hui";
            if (dayDate.getTime() === tomorrow.getTime()) return "Demain";

            return dayDate.toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            });
          };

          // Grouper les événements par jour en tenant compte des événements multi-jours (date → end_date)
          const groupByDaySpan = (items: Event[]) => {
            const grouped: Record<string, Event[]> = {};
            for (const event of items) {
              const start = startOfLocalDay(new Date(event.date));
              if (Number.isNaN(start.getTime())) continue;

              const endCandidate = event.end_date ? startOfLocalDay(new Date(event.end_date)) : start;
              const endSafe = Number.isNaN(endCandidate.getTime()) ? start : endCandidate;
              const end = endSafe.getTime() < start.getTime() ? start : endSafe;

              const maxDays = 60; // garde-fou
              for (let i = 0; i < maxDays; i++) {
                const d = addDays(start, i);
                if (d.getTime() > end.getTime()) break;
                const dayKey = toLocalDayKey(d);
                if (!grouped[dayKey]) grouped[dayKey] = [];
                grouped[dayKey].push(event);
              }
            }

            Object.values(grouped).forEach((eventsForDay) => {
              eventsForDay.sort((a, b) => {
                const aTime = new Date(a.date).getTime();
                const bTime = new Date(b.date).getTime();
                if (aTime !== bTime) return aTime - bTime;
                return a.id.localeCompare(b.id);
              });
            });
            return grouped;
          };

          const visibleEvents = filteredEvents.filter((e) => !hiddenEventIdSet.has(e.id));
          const hiddenEvents = filteredEvents.filter((e) => hiddenEventIdSet.has(e.id));
          const hiddenCount = hiddenEvents.length;

          const allGrouped = groupByDaySpan(visibleEvents);

          const upcomingGrouped: Record<string, Event[]> = {};
          const laterGrouped: Record<string, Event[]> = {};
          const pastGrouped: Record<string, Event[]> = {};
          const laterEventIds = new Set<string>();
          const pastEventIds = new Set<string>();

          for (const [dayKey, dayEvents] of Object.entries(allGrouped)) {
            const dayDate = startOfLocalDay(fromLocalDayKey(dayKey));
            if (dayDate.getTime() >= agendaStart.getTime() && dayDate.getTime() < agendaEnd.getTime()) {
              upcomingGrouped[dayKey] = dayEvents;
              continue;
            }
            if (dayDate.getTime() >= agendaEnd.getTime()) {
              laterGrouped[dayKey] = dayEvents;
              dayEvents.forEach((e) => laterEventIds.add(e.id));
              continue;
            }
            pastGrouped[dayKey] = dayEvents;
            dayEvents.forEach((e) => pastEventIds.add(e.id));
          }

          const laterCount = laterEventIds.size;
          const pastCount = pastEventIds.size;

          const hiddenGrouped = (() => {
            const grouped: Record<string, Event[]> = {};
            for (const event of hiddenEvents) {
              const start = startOfLocalDay(new Date(event.date));
              if (Number.isNaN(start.getTime())) continue;
              const dayKey = toLocalDayKey(start);
              if (!grouped[dayKey]) grouped[dayKey] = [];
              grouped[dayKey].push(event);
            }
            Object.values(grouped).forEach((eventsForDay) => {
              eventsForDay.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            });
            return grouped;
          })();
          const hiddenDayKeys = Object.keys(hiddenGrouped).sort((a, b) => fromLocalDayKey(a).getTime() - fromLocalDayKey(b).getTime());

          const upcomingDayKeys = (() => {
            if (agendaShowEmptyDays) {
              const keys: string[] = [];
              for (let i = 0; i < agendaRangeDays; i++) {
                keys.push(toLocalDayKey(addDays(agendaStart, i)));
              }
              return keys;
            }
            const keys = Object.keys(upcomingGrouped).sort(
              (a, b) => fromLocalDayKey(a).getTime() - fromLocalDayKey(b).getTime()
            );
            // Toujours inclure le jour de départ (même s'il est vide) pour que "Aller à…" et "Aujourd'hui/Demain" restent utiles.
            if (!keys.includes(agendaStartKey)) keys.unshift(agendaStartKey);
            return keys;
          })();

          const laterDayKeys = Object.keys(laterGrouped).sort((a, b) => fromLocalDayKey(a).getTime() - fromLocalDayKey(b).getTime());
          const pastDayKeys = Object.keys(pastGrouped).sort((a, b) => fromLocalDayKey(b).getTime() - fromLocalDayKey(a).getTime());

          const rangeLabel = (() => {
            const startLabel = agendaStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
            const endLabel = addDays(agendaEnd, -1).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
            return `Prochains ${agendaRangeDays} jours • ${startLabel} → ${endLabel}`;
          })();

          const renderDaySection = (dayKey: string, dayEvents: Event[]) => {
            const counts = dayEvents.reduce(
              (acc, e) => {
                acc.total++;
                acc[e.status]++;
                return acc;
              },
              { total: 0, pending: 0, approved: 0, rejected: 0 } as {
                total: number;
                pending: number;
                approved: number;
                rejected: number;
              }
            );

            return (
              <div
                key={dayKey}
                ref={(el) => {
                  agendaDayRefs.current[dayKey] = el;
                }}
                className="scroll-mt-24"
              >
                <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-background/80 backdrop-blur border-b">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{getDayLabel(dayKey)}</div>
                        <div className="text-xs text-muted-foreground">
                          {counts.total} événement{counts.total > 1 ? "s" : ""}
                          {counts.pending > 0 ? ` • ${counts.pending} en attente` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {counts.approved > 0 && (
                        <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                          {counts.approved} approuvé{counts.approved > 1 ? "s" : ""}
                        </Badge>
                      )}
                      {counts.rejected > 0 && (
                        <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                          {counts.rejected} rejeté{counts.rejected > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {dayEvents.length === 0 ? (
                  <div className="py-3 text-sm text-muted-foreground border-b">
                    Aucun événement
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card overflow-hidden">
                    <div className="divide-y">
                      {dayEvents.map((event) => {
          const eventDate = new Date(event.date);
                        const startDay = startOfLocalDay(new Date(event.date));
                        const endDayCandidate = event.end_date ? startOfLocalDay(new Date(event.end_date)) : startDay;
                        const endDaySafe = Number.isNaN(endDayCandidate.getTime()) ? startDay : endDayCandidate;
                        const endDay = endDaySafe.getTime() < startDay.getTime() ? startDay : endDaySafe;

                        const startKey = toLocalDayKey(startDay);
                        const endKey = toLocalDayKey(endDay);
                        const isMultiDay = startKey !== endKey;
                        const segment: "single" | "start" | "middle" | "end" =
                          !isMultiDay ? "single" : dayKey === startKey ? "start" : dayKey === endKey ? "end" : "middle";

                        const timeLabel =
                          segment === "start" || segment === "single"
                            ? eventDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                            : segment === "end"
                              ? "Fin"
                              : "Suite";

                        const startShort = fromLocalDayKey(startKey).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        });
                        const endShort = fromLocalDayKey(endKey).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

                        const meta =
                          event.location?.name ||
                          (event.event_organizers?.[0]?.organizer?.name || event.event_organizers?.[0]?.location?.name) ||
                          "";
                        const metaLine = [isMultiDay ? `Du ${startShort} → ${endShort}` : null, meta || null]
                          .filter(Boolean)
                          .join(" • ");

                        return (
                          <div
                            key={event.id}
                            className={cn(
                              "group flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors cursor-pointer",
                              agendaDensity === "comfortable" ? "py-4" : "py-3"
                            )}
                            onClick={() => handleOpenDialog(event)}
                          >
                            <div className="w-[56px] shrink-0 text-sm tabular-nums text-muted-foreground">
                              {timeLabel}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="font-medium truncate">{event.title}</div>
                                {getStatusBadge(event.status)}
                                {hiddenEventIdSet.has(event.id) && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    Masqué
                                  </Badge>
                                )}
                                {isMultiDay && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                    title={`Du ${startShort} → ${endShort}`}
                                  >
                                    {segment === "start"
                                      ? `Multi-jours • jusqu'au ${endShort}`
                                      : segment === "middle"
                                        ? "Multi-jours • en cours"
                                        : "Multi-jours • dernier jour"}
                                  </Badge>
                                )}
                                {event.is_full && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                    Complet
                                  </Badge>
                                )}
                              </div>
                              {agendaDensity === "comfortable" && event.description && (
                                <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                  {event.description}
                                </div>
                              )}
                              {metaLine && (
                                <div className="text-xs text-muted-foreground truncate mt-0.5">{metaLine}</div>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {event.external_url && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(event.external_url!, '_blank', 'noopener,noreferrer');
                                  }}
                                  className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                  title={`Ouvrir ${event.external_url_label || 'l\'URL externe'}`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </button>
                              )}
                              {event.status === "pending" && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateEventStatus(event.id, "approved");
                                    }}
                                    className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                    title="Approuver"
                                  >
                                    <Check className="h-4 w-4 text-success" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateEventStatus(event.id, "rejected");
                                    }}
                                    className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                    title="Rejeter"
                                  >
                                    <X className="h-4 w-4 text-destructive" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHidden(event.id);
                                }}
                                className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                title={hiddenEventIdSet.has(event.id) ? "Réafficher" : "Masquer"}
                              >
                                {hiddenEventIdSet.has(event.id) ? (
                                  <Eye className="h-4 w-4" />
                                ) : (
                                  <EyeOff className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDialog(event);
                                }}
                                className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                title="Modifier"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteEvent(event.id);
                                }}
                                className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors cursor-pointer"
                                title="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          };

          return (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              {/* Rail (sticky) */}
              <div className="lg:sticky lg:top-4 h-fit">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Navigation</CardTitle>
                    <CardDescription className="text-sm">{rangeLabel}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Jour de départ</div>
                      <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={agendaStartKey === todayKey ? "default" : "outline"}
                        className="h-9"
                        onClick={() => {
                          setEventsView("agenda");
                          setAgendaStartKey(todayKey);
                          setPendingAgendaScrollKey(todayKey);
                        }}
                      >
                        Aujourd'hui
                      </Button>
                      <Button
                        type="button"
                        variant={
                          agendaStartKey === toLocalDayKey(addDays(startOfLocalDay(new Date()), 1)) ? "default" : "outline"
                        }
                        className="h-9"
                        onClick={() => {
                          const key = toLocalDayKey(addDays(startOfLocalDay(new Date()), 1));
                          setEventsView("agenda");
                          setAgendaStartKey(key);
                          setPendingAgendaScrollKey(key);
                        }}
                      >
                        Demain
                      </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="agenda-start">Aller au jour…</Label>
                      <Input
                        id="agenda-start"
                        type="date"
                        value={agendaStartKey}
                        onChange={(e) => {
                          const next = e.target.value || todayKey;
                          setEventsView("agenda");
                          setAgendaStartKey(next);
                          setPendingAgendaScrollKey(next);
                        }}
                        className="h-10"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Plage</div>
                        <div className="text-xs text-muted-foreground">Afficher {agendaRangeDays} jours</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant={agendaRangeDays === 7 ? "default" : "outline"}
                          className="h-9"
                          onClick={() => setAgendaRangeDays(7)}
                        >
                          7j
                        </Button>
                        <Button
                          type="button"
                          variant={agendaRangeDays === 14 ? "default" : "outline"}
                          className="h-9"
                          onClick={() => setAgendaRangeDays(14)}
                        >
                          14j
                        </Button>
                        <Button
                          type="button"
                          variant={agendaRangeDays === 30 ? "default" : "outline"}
                          className="h-9"
                          onClick={() => setAgendaRangeDays(30)}
                        >
                          30j
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">Densité</div>
                          <div className="text-xs text-muted-foreground">Compact / Confort</div>
                        </div>
                        <Switch
                          checked={agendaDensity === "comfortable"}
                          onCheckedChange={(checked) => setAgendaDensity(checked ? "comfortable" : "compact")}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">Jours vides</div>
                          <div className="text-xs text-muted-foreground">Afficher “Aucun événement”</div>
                        </div>
                        <Switch checked={agendaShowEmptyDays} onCheckedChange={setAgendaShowEmptyDays} />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Plus tard</div>
                        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAgendaLaterOpen((v) => !v)}>
                          {agendaLaterOpen ? "Masquer" : "Afficher"} ({laterCount})
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Passés</div>
                        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAgendaPastOpen((v) => !v)}>
                          {agendaPastOpen ? "Masquer" : "Afficher"} ({pastCount})
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Masqués</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={hiddenCount === 0}
                          onClick={() => setAgendaHiddenOpen((v) => !v)}
                        >
                          {agendaHiddenOpen ? "Masquer" : "Afficher"} ({hiddenCount})
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Liste */}
              <div className="space-y-8">
                <div className="space-y-6">
                  {upcomingDayKeys.map((dayKey) => renderDaySection(dayKey, upcomingGrouped[dayKey] || []))}
                </div>

                {agendaLaterOpen && laterDayKeys.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Separator className="flex-1" />
                      <div className="px-3 py-1 rounded-full bg-muted text-sm font-semibold">
                        Plus tard
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {laterCount}
                        </Badge>
                      </div>
                      <Separator className="flex-1" />
                    </div>
                    <div className="space-y-6">
                      {laterDayKeys.map((dayKey) => renderDaySection(dayKey, laterGrouped[dayKey] || []))}
                    </div>
                  </div>
                )}

                {agendaPastOpen && pastDayKeys.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Separator className="flex-1" />
                      <div className="px-3 py-1 rounded-full bg-muted text-sm font-semibold">
                        Passés
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {pastCount}
                        </Badge>
                      </div>
                      <Separator className="flex-1" />
                    </div>
                    <div className="space-y-6">
                      {pastDayKeys.map((dayKey) => renderDaySection(dayKey, pastGrouped[dayKey] || []))}
                    </div>
                  </div>
                )}

                {agendaHiddenOpen && hiddenDayKeys.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Separator className="flex-1" />
                      <div className="px-3 py-1 rounded-full bg-muted text-sm font-semibold">
                        Masqués
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {hiddenCount}
                        </Badge>
                      </div>
                      <Separator className="flex-1" />
                    </div>
                    <div className="space-y-6">
                      {hiddenDayKeys.map((dayKey) => renderDaySection(dayKey, hiddenGrouped[dayKey] || []))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : (
        (() => {
          // Grouper les événements par jour (clé locale pour éviter les décalages de timezone)
          const visibleEvents = filteredEvents.filter((e) => !hiddenEventIdSet.has(e.id));
          if (visibleEvents.length === 0) {
            return (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto opacity-20 mb-2" />
                <p>Tous les événements correspondants sont masqués.</p>
                <p className="text-xs mt-1">Passe en vue Agenda pour afficher “Masqués”.</p>
              </div>
            );
          }

          const groupedEvents: Record<string, Event[]> = {};
          visibleEvents.forEach((event) => {
            const dayKey = toLocalDayKey(startOfLocalDay(new Date(event.date)));
            if (!groupedEvents[dayKey]) groupedEvents[dayKey] = [];
          groupedEvents[dayKey].push(event);
        });

        // Trier les jours par date (plus ancien en premier)
        const sortedDays = Object.keys(groupedEvents).sort((a, b) => {
            return fromLocalDayKey(a).getTime() - fromLocalDayKey(b).getTime();
        });

        return (
          <div className="space-y-6">
            {sortedDays.map((dayKey) => {
              const dayEvents = groupedEvents[dayKey];
              const firstEventDate = new Date(dayEvents[0].date);
                const today = startOfLocalDay(new Date());
                const eventDay = startOfLocalDay(firstEventDate);
                const tomorrow = startOfLocalDay(addDays(today, 1));
              
              const isToday = eventDay.getTime() === today.getTime();
              const isTomorrow = eventDay.getTime() === tomorrow.getTime();
              
              let dayLabel = "";
              if (isToday) {
                dayLabel = "Aujourd'hui";
              } else if (isTomorrow) {
                dayLabel = "Demain";
              } else {
                  dayLabel = firstEventDate.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                });
              }

              return (
                <div key={dayKey} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Separator className="flex-1" />
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{dayLabel}</span>
                      <Badge variant="secondary" className="text-xs">
                        {dayEvents.length}
                      </Badge>
                    </div>
                    <Separator className="flex-1" />
                  </div>
                    {/* Vue cartes "masonry" (réduit les zones vides) */}
                    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 [column-gap:1rem]">
                    {dayEvents.map((event) => (
            <div
              key={event.id}
                          className="group relative mb-4 inline-block w-full break-inside-avoid flex flex-col p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/50 transition-all duration-200"
            >
              {/* Image ou avatar */}
              <div className="flex items-start gap-3 mb-3">
                <Avatar className="h-12 w-12 ring-2 ring-background shrink-0">
                  {event.image_url ? (
                    <AvatarImage src={event.image_url} alt={event.title} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(event.title)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const startKey = toLocalDayKey(startOfLocalDay(new Date(event.date)));
                      const endKey = event.end_date ? toLocalDayKey(startOfLocalDay(new Date(event.end_date))) : startKey;
                      const isMultiDay = startKey !== endKey;
                      if (!isMultiDay) return null;
                      const startShort = fromLocalDayKey(startKey).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
                      const endShort = fromLocalDayKey(endKey).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
                      return (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0" title={`Du ${startShort} → ${endShort}`}>
                          Multi-jours
                        </Badge>
                      );
                    })()}
                    <h3 className="font-semibold text-sm truncate">{event.title}</h3>
                    {getStatusBadge(event.status)}
                    {event.is_full && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Complet</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="mb-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  <span>{formatDateWithoutTimezone(event.date)}</span>
                </div>
                {event.end_date && (
                  <div className="text-xs text-muted-foreground ml-4">
                    Fin: {formatDateWithoutTimezone(event.end_date)}
                  </div>
                )}
              </div>

              {/* Catégorie et lieu */}
              <div className="mb-2 space-y-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{getCategoryName(event.category)}</Badge>
                {event.location && (
                  <div className="text-xs text-muted-foreground truncate">
                    {event.location.name}
                  </div>
                )}
              </div>

              {/* Organisateurs */}
              {event.event_organizers && event.event_organizers.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {event.event_organizers.slice(0, 2).map((eo) => {
                    const organizer = eo.organizer || eo.location;
                    if (!organizer) return null;
                    return (
                      <Badge key={organizer.id} variant="outline" className="text-[10px] px-1.5 py-0">
                        {organizer.name}
                      </Badge>
                    );
                  })}
                  {event.event_organizers.length > 2 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      +{event.event_organizers.length - 2}
                    </Badge>
                  )}
                </div>
              )}

              {/* Actions - toujours visibles */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t mt-auto">
                <div className="flex items-center gap-1">
                  {event.status === "pending" && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateEventStatus(event.id, "approved");
                        }}
                  className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                    title="Approuver"
                      >
                        <Check className="h-3.5 w-3.5 text-success" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateEventStatus(event.id, "rejected");
                        }}
                  className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                    title="Rejeter"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                    {event.external_url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(event.external_url!, '_blank', 'noopener,noreferrer');
                        }}
                        className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                        title={`Ouvrir ${event.external_url_label || 'l\'URL externe'}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                      toggleHidden(event.id);
                    }}
                    className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                    title={hiddenEventIdSet.has(event.id) ? "Réafficher" : "Masquer"}
                  >
                    {hiddenEventIdSet.has(event.id) ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDialog(event);
                    }}
                    className="p-1.5 rounded hover:bg-accent transition-colors cursor-pointer"
                    title="Modifier"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEvent(event.id);
                    }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
        })()
      )}

      {selectedEvent && (
        <EventEditDialog
          event={selectedEvent}
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
          }}
          allEvents={filteredEvents}
          onNavigate={(eventId) => {
            const next = filteredEvents.find((e) => e.id === eventId);
            if (next) setSelectedEvent(next);
          }}
          locations={locations}
          organizers={organizers}
          tags={tags}
          categories={categories}
          onSave={updateEvent}
          onTagCreated={loadTags}
        />
      )}

      {/* Dialog d'import depuis URL */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importer depuis une URL</DialogTitle>
            <DialogDescription>
              Entrez l'URL de la page web contenant les informations de l'événement à importer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-organizer">Organisateur (optionnel)</Label>
              <Select
                value={importOrganizerId || "none"}
                onValueChange={(value) => setImportOrganizerId(value === "none" ? "" : value)}
                disabled={isImporting}
              >
                <SelectTrigger className="min-h-[44px] text-base cursor-pointer">
                  <SelectValue placeholder="Sélectionner un organisateur pour utiliser ses configurations de scraping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun organisateur</SelectItem>
                  {organizers.map((org) => (
                    <SelectItem key={org.id} value={org.id} className="cursor-pointer">
                      {org.name}{org.type === "location" ? " (Lieu)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si un organisateur est sélectionné, ses configurations de scraping CSS et IA seront utilisées pour extraire les informations.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-url">URL</Label>
              <Input
                id="import-url"
                type="url"
                placeholder="https://example.com/event"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isImporting) {
                    handleImportFromUrl();
                  }
                }}
                className="min-h-[44px] text-base"
                disabled={isImporting}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setImportUrl("");
                  setImportOrganizerId("");
                }}
                disabled={isImporting}
              >
                Annuler
              </Button>
              <Button
                onClick={handleImportFromUrl}
                disabled={isImporting || !importUrl.trim()}
              >
                {isImporting ? (
                  <>
                    <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Importer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventEditDialog({
  event,
  open,
  onOpenChange,
  allEvents = [],
  onNavigate,
  locations,
  organizers,
  tags,
  categories,
  onSave,
  onTagCreated,
}: {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allEvents?: Event[];
  onNavigate?: (eventId: string) => void;
  locations: { id: string; name: string; address: string | null; capacity: number | null }[];
  organizers: Array<{ id: string; name: string; instagram_url: string | null; facebook_url: string | null; type: "organizer" | "location" }>;
  tags: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onSave: (data: Partial<Event>, organizerIds?: string[], tagIds?: string[]) => void;
  onTagCreated?: () => void;
}) {
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    date: string;
    end_date: string;
    category: string;
    price: string;
    presale_price: string;
    subscriber_price: string;
    capacity: string;
    is_full: boolean;
    location_id: string;
    room_id: string;
    door_opening_time: string;
    external_url: string;
    external_url_label: string;
    instagram_url: string;
    facebook_url: string;
    scraping_url: string;
    image_url: string;
    status: "pending" | "approved" | "rejected";
  }>({
    title: "",
    description: "",
    date: "",
    end_date: "",
    category: "",
    price: "",
    presale_price: "",
    subscriber_price: "",
    capacity: "",
    is_full: false,
    location_id: "",
    room_id: "",
    door_opening_time: "",
    external_url: "",
    external_url_label: "",
    instagram_url: "",
    facebook_url: "",
    scraping_url: "",
    image_url: "",
    status: "pending",
  });
  const [selectedOrganizerIds, setSelectedOrganizerIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string; location_id: string }>>([]);
  const [scrapingChanges, setScrapingChanges] = useState<Record<string, any>>({});
  const [isScraping, setIsScraping] = useState(false);
  
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

  // Fonction pour mettre à jour les réseaux sociaux quand un organisateur est sélectionné
  const handleOrganizerChange = (newOrganizerIds: string[]) => {
    setSelectedOrganizerIds(newOrganizerIds);
    
    // Si un organisateur est sélectionné, mettre à jour les réseaux sociaux avec ceux du premier organisateur
    if (newOrganizerIds.length > 0) {
      const firstOrganizerId = newOrganizerIds[0];
      const selectedOrganizer = organizers.find((org) => org.id === firstOrganizerId);
      
      if (selectedOrganizer) {
        const updates: any = {
          instagram_url: selectedOrganizer.instagram_url || formData.instagram_url,
          facebook_url: selectedOrganizer.facebook_url || formData.facebook_url,
        };
        
        // Si l'organisateur est aussi un lieu, remplir automatiquement le lieu
        if (selectedOrganizer.type === "location") {
          updates.location_id = firstOrganizerId;
          // Charger les salles du lieu-organisateur
          loadRoomsForLocation(firstOrganizerId);
        }
        
        setFormData({
          ...formData,
          ...updates,
        });
      }
    }
  };

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

  useEffect(() => {
    if (event) {
      // Réinitialiser les changements de scraping quand on ouvre le dialog
      setScrapingChanges({});
      
      setFormData({
        title: event.title || "",
        description: event.description || "",
        date: toDatetimeLocal(event.date),
        end_date: toDatetimeLocal(event.end_date),
        category: event.category || "",
        price: event.price?.toString() || "",
        presale_price: event.presale_price?.toString() || "",
        subscriber_price: event.subscriber_price?.toString() || "",
        capacity: event.capacity?.toString() || "",
        is_full: event.is_full ?? false,
        location_id: event.location_id || "",
        room_id: event.room_id || "",
        door_opening_time: event.door_opening_time || "",
        external_url: event.external_url || "",
        external_url_label: event.external_url_label || "",
        instagram_url: event.instagram_url || "",
        facebook_url: event.facebook_url || "",
        scraping_url: event.scraping_url || "",
        image_url: event.image_url || "",
        status: event.status,
      });

      // Charger les organisateurs de l'événement
      loadEventOrganizers(event.id);
      
      // Charger les tags de l'événement
      if (event.tag_ids && event.tag_ids.length > 0) {
        setSelectedTagIds(event.tag_ids);
      } else {
        setSelectedTagIds([]);
      }
      
      // Initialiser l'image preview avec l'image existante
      if (event.image_url) {
        setImagePreview(event.image_url);
        setOriginalImageSrc(event.image_url);
      } else {
        setImagePreview(null);
        setOriginalImageSrc(null);
      }
      setImageFile(null);
    }
  }, [event, open]);

  async function loadEventOrganizers(eventId: string) {
    // Ne pas charger si l'ID est temporaire ou invalide
    if (!eventId || eventId === 'temp' || eventId.trim() === '') {
      setSelectedOrganizerIds([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("event_organizers")
        .select("organizer_id, location_id")
        .eq("event_id", eventId);

      if (error) {
        console.error("Erreur Supabase lors du chargement des organisateurs:", error);
        throw error;
      }
      
      // Combiner organizer_id et location_id dans une seule liste
      const ids = (data || [])
        .map((eo) => eo.organizer_id || eo.location_id)
        .filter((id): id is string => id != null);
      setSelectedOrganizerIds(ids);
    } catch (error: any) {
      // Ne logger que si c'est une vraie erreur (pas juste une absence de données)
      if (error?.code && error.code !== 'PGRST116') {
      console.error("Erreur lors du chargement des organisateurs:", error);
      }
      setSelectedOrganizerIds([]);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Veuillez sélectionner un fichier image");
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

  async function handleCreateTag(name: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert([{ name: name.trim() }])
        .select("id")
        .single();

      if (error) {
        console.error("Erreur détaillée lors de la création du tag:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        
        // Messages d'erreur plus explicites
        if (error.code === "23505") {
          alert(`Un tag avec le nom "${name}" existe déjà.`);
        } else if (error.message?.includes("permission denied") || error.code === "42501") {
          alert("Vous n'avez pas la permission de créer un tag. Vérifiez vos droits d'administration.");
        } else if (error.message?.includes("Bucket not found") || error.message?.includes("relation") && error.message?.includes("does not exist")) {
          alert("La table 'tags' n'existe pas. Veuillez exécuter la migration 014_add_tags_to_events.sql");
        } else {
          alert(`Erreur lors de la création du tag: ${error.message || "Erreur inconnue"}`);
        }
        throw error;
      }
      
      // Recharger la liste des tags
      if (onTagCreated) {
        onTagCreated();
      }
      
      return data?.id || null;
    } catch (error) {
      console.error("Erreur lors de la création du tag:", error);
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validation : la date de fin ne peut pas être antérieure à la date de début
    if (formData.end_date && formData.date) {
      const startDate = new Date(formData.date);
      const endDate = new Date(formData.end_date);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate < startDate) {
        alert("La date et heure de fin ne peut pas être antérieure à la date et heure de début");
        return;
      }
    }
    
    let finalImageUrl = event?.image_url || null;

    // Si une nouvelle image a été téléchargée, l'uploader
    if (imageFile) {
      const uploadedUrl = await handleImageUpload();
      if (uploadedUrl) {
        finalImageUrl = uploadedUrl;
      } else {
        // Si l'upload échoue, on ne continue pas
        return;
      }
    } else if (formData.image_url) {
      // Si une URL d'image a été saisie, utiliser cette URL
      finalImageUrl = formData.image_url;
    } else if (!imagePreview && event?.image_url) {
      // Si l'image a été supprimée, définir à null
      finalImageUrl = null;
    }

    // Récupérer l'adresse et les coordonnées du lieu sélectionné si un lieu est sélectionné
    const selectedLocation = formData.location_id && formData.location_id !== "none" 
      ? (locations.find((loc) => loc.id === formData.location_id) as LocationData | undefined)
      : null;

    onSave(
      {
        ...formData,
        date: fromDatetimeLocal(formData.date) || formData.date,
        end_date: formData.end_date ? (fromDatetimeLocal(formData.end_date) || null) : null,
        price: formData.price ? parseFloat(formData.price) : null,
        presale_price: formData.presale_price ? parseFloat(formData.presale_price) : null,
        subscriber_price: formData.subscriber_price ? parseFloat(formData.subscriber_price) : null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        is_full: formData.is_full || false,
        door_opening_time: formData.door_opening_time || null,
        external_url: formData.external_url || null,
        external_url_label: formData.external_url_label || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        scraping_url: formData.scraping_url || null,
        image_url: finalImageUrl,
        address: selectedLocation?.address || null,
        latitude: selectedLocation?.latitude || null,
        longitude: selectedLocation?.longitude || null,
      } as any,
      selectedOrganizerIds,
      selectedTagIds
    );
  }

  // Fonction pour lancer le scraping et comparer les données
  async function handleScrapeAndCompare() {
    if (!event?.scraping_url || !event.scraping_url.trim()) {
      alert("Aucune URL de scraping configurée pour cet événement");
      return;
    }

    setIsScraping(true);
    try {
      // Déterminer l'organisateur ou le lieu-organisateur à utiliser pour le scraping
      let organizerId: string | null = null;
      let locationId: string | null = null;

      // D'abord, essayer d'utiliser les organisateurs sélectionnés dans le formulaire
      if (selectedOrganizerIds.length > 0) {
        const firstOrganizerId = selectedOrganizerIds[0];
        // Vérifier si c'est un organisateur classique ou un lieu-organisateur
        const organizer = organizers.find((org) => org.id === firstOrganizerId);
        if (organizer) {
          if (organizer.type === "location") {
            locationId = firstOrganizerId;
          } else {
            organizerId = firstOrganizerId;
          }
        }
      }

      // Si aucun organisateur trouvé dans le formulaire, utiliser ceux de l'événement
      if (!organizerId && !locationId && event.event_organizers && event.event_organizers.length > 0) {
        const firstEO = event.event_organizers[0];
        if (firstEO.organizer) {
          organizerId = firstEO.organizer.id;
        } else if (firstEO.location) {
          locationId = firstEO.location.id;
        }
      }

      // Utiliser le location_id du formulaire si pas de lieu-organisateur trouvé
      if (!locationId && formData.location_id) {
        locationId = formData.location_id;
      }

      // Appeler l'API de scraping
      const response = await fetch('/api/events/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: event.scraping_url,
          organizer_id: organizerId,
          location_id: locationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors du scraping');
      }

      const result = await response.json();
      const scrapedData = result.data;

      // Comparer avec les données existantes
      const changes: Record<string, any> = {};
      
      // Fonction helper pour comparer deux valeurs
      const compareValues = (oldVal: any, newVal: any, fieldName: string) => {
        if (newVal === undefined || newVal === null) return;
        
        const oldStr = String(oldVal || '').trim();
        const newStr = String(newVal || '').trim();
        
        if (oldStr !== newStr && newStr !== '') {
          changes[fieldName] = newVal;
        }
      };

      // Comparer chaque champ
      if (scrapedData.title) compareValues(formData.title, scrapedData.title, 'title');
      if (scrapedData.description) compareValues(formData.description, scrapedData.description, 'description');
      if (scrapedData.date) {
        const newDate = scrapedData.date ? toDatetimeLocal(scrapedData.date) : null;
        compareValues(formData.date, newDate, 'date');
      }
      if (scrapedData.end_date) {
        const newEndDate = scrapedData.end_date ? toDatetimeLocal(scrapedData.end_date) : null;
        compareValues(formData.end_date, newEndDate, 'end_date');
      }
      if (scrapedData.price !== undefined) {
        const newPrice = scrapedData.price ? String(parseFloat(scrapedData.price)) : '';
        compareValues(formData.price, newPrice, 'price');
      }
      if (scrapedData.presale_price !== undefined) {
        const newPresalePrice = scrapedData.presale_price ? String(parseFloat(scrapedData.presale_price)) : '';
        compareValues(formData.presale_price, newPresalePrice, 'presale_price');
      }
      if (scrapedData.subscriber_price !== undefined) {
        const newSubscriberPrice = scrapedData.subscriber_price ? String(parseFloat(scrapedData.subscriber_price)) : '';
        compareValues(formData.subscriber_price, newSubscriberPrice, 'subscriber_price');
      }
      if (scrapedData.capacity !== undefined) {
        const newCapacity = scrapedData.capacity ? String(parseInt(scrapedData.capacity)) : '';
        compareValues(formData.capacity, newCapacity, 'capacity');
      }
      if (scrapedData.door_opening_time) compareValues(formData.door_opening_time, scrapedData.door_opening_time, 'door_opening_time');
      if (scrapedData.image_url) compareValues(formData.image_url, scrapedData.image_url, 'image_url');
      if (scrapedData.external_url) compareValues(formData.external_url, scrapedData.external_url, 'external_url');
      if (scrapedData.is_full !== undefined) {
        if (formData.is_full !== scrapedData.is_full) {
          changes['is_full'] = scrapedData.is_full;
        }
      }

      setScrapingChanges(changes);
    } catch (error) {
      console.error('Erreur lors du scraping:', error);
      alert('Erreur lors du scraping. Veuillez réessayer.');
    } finally {
      setIsScraping(false);
    }
  }

  // Fonction helper pour afficher la nouvelle valeur à côté du label
  function renderChangeIndicator(fieldName: string) {
    if (scrapingChanges[fieldName] !== undefined) {
      const newValue = scrapingChanges[fieldName];
      let displayValue = "";
      
      // Formater la valeur selon le type de champ
      if (fieldName === "is_full") {
        displayValue = newValue ? "Complet" : "Disponible";
      } else if (fieldName === "date" || fieldName === "end_date") {
        // Afficher la date formatée
        if (typeof newValue === "string" && newValue) {
          try {
            // Convertir de datetime-local vers ISO pour le formatage
            const isoDate = fromDatetimeLocal(newValue);
            if (isoDate) {
              displayValue = formatDateWithoutTimezone(isoDate, "PPpp");
            } else {
              displayValue = newValue;
            }
          } catch {
            displayValue = newValue;
          }
        } else {
          displayValue = String(newValue || "");
        }
      } else if (fieldName === "description") {
        // Tronquer la description si elle est trop longue
        const desc = String(newValue || "");
        displayValue = desc.length > 50 ? desc.substring(0, 50) + "..." : desc;
      } else {
        displayValue = String(newValue || "");
      }

      return (
        <div className="ml-2 flex items-center gap-1">
          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
            Nouveau:
          </Badge>
          <span className="text-xs text-success font-medium max-w-[200px] truncate" title={String(newValue)}>
            {displayValue}
          </span>
        </div>
      );
    }
    return null;
  }

  // Fonction pour appliquer une modification spécifique
  function applyChange(fieldName: string) {
    if (scrapingChanges[fieldName] !== undefined) {
      const updatedFormData = { ...formData };
      (updatedFormData as any)[fieldName] = scrapingChanges[fieldName];
      setFormData(updatedFormData);
      
      // Retirer le changement de la liste
      const updatedChanges = { ...scrapingChanges };
      delete updatedChanges[fieldName];
      setScrapingChanges(updatedChanges);
    }
  }

  const isMobile = useIsMobile();

  // Effet supprimé - plus de marge appliquée

  // Navigation entre événements
  const currentIndex = event ? allEvents.findIndex(e => e.id === event.id) : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allEvents.length - 1;
  
  const handlePrevious = () => {
    if (hasPrevious && onNavigate && allEvents[currentIndex - 1]) {
      onNavigate(allEvents[currentIndex - 1].id);
    }
  };
  
  const handleNext = () => {
    if (hasNext && onNavigate && allEvents[currentIndex + 1]) {
      onNavigate(allEvents[currentIndex + 1].id);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(newOpen) => {
        // Ne fermer que via le bouton de fermeture explicite
        if (newOpen === false && onOpenChange) {
          onOpenChange(false);
        }
      }}>
        <SheetContent 
          side="right" 
          className="w-full sm:w-[66.666vw] overflow-y-auto [@media(min-width:1440px)]:w-[66.666vw] [@media(min-width:1600px)]:max-w-2xl"
        >
          <SheetHeader className="mb-6">
            <div className="flex items-start gap-3">
              {/* Chevron de fermeture aligné à gauche avec le titre */}
              <button
                onClick={() => onOpenChange(false)}
                className="mt-1 p-1.5 rounded hover:bg-accent transition-colors cursor-pointer shrink-0"
                title="Fermer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-1">
                {/* Bouton précédent */}
                {allEvents.length > 1 && (
                  <button
                    onClick={handlePrevious}
                    disabled={!hasPrevious}
                    className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Événement précédent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}
                    <SheetTitle className="mb-0">Modifier l'événement</SheetTitle>
                {/* Bouton suivant */}
                {allEvents.length > 1 && (
                  <button
                    onClick={handleNext}
                    disabled={!hasNext}
                    className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Événement suivant"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              {event?.scraping_url && event.scraping_url.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleScrapeAndCompare}
                  disabled={isScraping}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${isScraping ? 'animate-spin' : ''}`} />
                  {isScraping ? 'Scraping...' : 'Mettre à jour depuis le scraping'}
                </Button>
              )}
                </div>
                <SheetDescription className="mt-2">
                  {allEvents.length > 1 && currentIndex >= 0 
                    ? `Événement ${currentIndex + 1} sur ${allEvents.length}`
                    : "Modifiez les informations de l'événement"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Statut, disponibilité et Image */}
          <div className={`grid gap-6 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statut et disponibilité</CardTitle>
                <CardDescription>Gestion du statut et de la disponibilité de l'événement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Statut</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: "pending" | "approved" | "rejected") =>
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">En attente</SelectItem>
                        <SelectItem value="approved">Approuvé</SelectItem>
                        <SelectItem value="rejected">Rejeté</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="is_full" className="text-base font-medium">
                      Disponibilité
                    </Label>
                    <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
                      <div className="flex items-center gap-3 flex-1">
                        {formData.is_full ? (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-destructive shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-destructive">Événement complet</span>
                                {renderChangeIndicator('is_full')}
                                {scrapingChanges['is_full'] !== undefined && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                                    onClick={() => applyChange('is_full')}
                                  >
                                    Appliquer
                                  </Button>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">Plus de places disponibles (sold out)</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Circle className="h-5 w-5 text-success shrink-0" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-success">Places disponibles</span>
                                {renderChangeIndicator('is_full')}
                                {scrapingChanges['is_full'] !== undefined && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                                    onClick={() => applyChange('is_full')}
                                  >
                                    Appliquer
                                  </Button>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">L'événement accepte encore des réservations</p>
                            </div>
                          </>
                        )}
                      </div>
                      <Switch
                        id="is_full"
                        checked={formData.is_full}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_full: checked })}
                        className="shrink-0"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section: Image */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Image de l'événement
                </CardTitle>
                <CardDescription>Image principale de l'événement</CardDescription>
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
                      const fileInput = document.getElementById("edit-image-upload") as HTMLInputElement;
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
                    id="edit-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="cursor-pointer"
                  />
                  <Label
                    htmlFor="edit-image-upload"
                    className="absolute inset-0 flex items-center justify-center cursor-pointer opacity-0"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="edit_image_url">Ou entrez une URL d'image</Label>
                    {renderChangeIndicator('image_url')}
                  </div>
                  <Input
                    id="edit_image_url"
                    type="url"
                    value={formData.image_url || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, image_url: e.target.value });
                      if (e.target.value) {
                        setImagePreview(e.target.value);
                        setOriginalImageSrc(e.target.value);
                        setImageFile(null);
                      } else {
                        if (!imageFile) {
                          setImagePreview(event?.image_url || null);
                          setOriginalImageSrc(event?.image_url || null);
                        }
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
          </div>

          {/* Section: Informations générales */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informations générales</CardTitle>
              <CardDescription>Les informations de base de l'événement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center flex-wrap gap-2">
              <Label htmlFor="title">Titre *</Label>
              {renderChangeIndicator('title')}
              {scrapingChanges['title'] !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                    onClick={() => applyChange('title')}
                  >
                    Appliquer
                  </Button>
              )}
            </div>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="min-h-[44px] text-base"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center flex-wrap gap-2">
              <Label htmlFor="description">Description</Label>
              {renderChangeIndicator('description')}
              {scrapingChanges['description'] !== undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                      className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                    onClick={() => applyChange('description')}
                >
                  Appliquer
                </Button>
              )}
            </div>
            <Textarea
              id="description"
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[100px] text-base"
            />
          </div>

              <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
          <div className="space-y-2">
            <Label htmlFor="category">Catégorie *</Label>
            <Select
              value={formData.category || ""}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
              required
            >
              <SelectTrigger className="min-h-[44px] text-base cursor-pointer">
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
                  <Label>Tags</Label>
                  <MultiSelectCreatable
                    options={tags
                      .filter((tag) => tag.id && tag.name && tag.name.trim() !== "")
                      .map((tag) => ({
                        label: tag.name,
                        value: tag.id,
                      }))}
                    selected={selectedTagIds}
                    onChange={setSelectedTagIds}
                    onCreate={handleCreateTag}
                    placeholder="Sélectionner ou créer des tags..."
                    createPlaceholder="Ajouter un nouveau tag..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Dates et horaires */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dates et horaires</CardTitle>
              <CardDescription>Planification de l'événement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-3"}`}>
            <div className="space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <Label htmlFor="date">Date de début *</Label>
                {renderChangeIndicator('date')}
                {scrapingChanges['date'] !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                    onClick={() => applyChange('date')}
                  >
                    Appliquer
                  </Button>
                )}
              </div>
              <DateTimePicker
                id="date"
                value={formData.date}
                onChange={(v) => setFormData((prev) => ({ ...prev, date: v }))}
                required
                placeholder="Choisir une date et une heure"
                className="space-y-0"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <Label htmlFor="end_date">Date de fin</Label>
                {renderChangeIndicator('end_date')}
                {scrapingChanges['end_date'] !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                    onClick={() => applyChange('end_date')}
                  >
                    Appliquer
                  </Button>
                )}
              </div>
              <DateTimePicker
                id="end_date"
                value={formData.end_date || ""}
                onChange={(v) => setFormData((prev) => ({ ...prev, end_date: v }))}
                placeholder="Optionnel"
                allowClear
                className="space-y-0"
              />
          </div>

            <div className="space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                    <Label htmlFor="door_opening_time">Heure d'ouverture des portes</Label>
                    {renderChangeIndicator('door_opening_time')}
                    {scrapingChanges['door_opening_time'] !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                        onClick={() => applyChange('door_opening_time')}
                  >
                    Appliquer
                  </Button>
                )}
              </div>
              <Input
                    id="door_opening_time"
                    type="time"
                    value={formData.door_opening_time || ""}
                    onChange={(e) => setFormData({ ...formData, door_opening_time: e.target.value })}
                    placeholder="HH:MM"
                className="min-h-[44px] text-base"
              />
            </div>
              </div>
            </CardContent>
          </Card>

          {/* Section: Lieu et organisateurs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lieu et organisateurs</CardTitle>
              <CardDescription>Localisation, capacité et associations de l'événement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-3"}`}>
            <div className="space-y-2">
              <Label htmlFor="location_id">Lieu</Label>
              <SelectSearchable
                options={[
                  { value: "none", label: "Aucun lieu" },
                  ...locations
                    .filter((loc) => loc.id && loc.name && loc.name.trim() !== "")
                    .map((loc) => ({
                      value: loc.id,
                      label: loc.name,
                    })),
                ]}
                value={formData.location_id || "none"}
                onValueChange={(value) => {
                  const locationId = value === "none" ? "" : value;
                  // Mettre à jour l'adresse et la capacité automatiquement si un lieu est sélectionné
                  if (locationId) {
                    const selectedLocation = locations.find((loc) => loc.id === locationId) as LocationData | undefined;
                    if (selectedLocation) {
                      setFormData({ 
                        ...formData, 
                        location_id: locationId,
                        room_id: "", // Réinitialiser la salle quand le lieu change
                        capacity: selectedLocation.capacity ? selectedLocation.capacity.toString() : formData.capacity || ""
                      });
                      // Charger les salles du lieu sélectionné
                      loadRoomsForLocation(locationId);
                      return;
                    }
                  }
                  setFormData({ ...formData, location_id: locationId, room_id: "" });
                  setRooms([]);
                }}
                placeholder="Sélectionner un lieu"
                searchPlaceholder="Rechercher un lieu..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="room_id">Salle</Label>
              <Select
                value={formData.room_id || "none"}
                onValueChange={(value) => {
                  const roomId = value === "none" ? "" : value;
                  setFormData({ ...formData, room_id: roomId });
                }}
                disabled={!formData.location_id || rooms.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={rooms.length === 0 ? "Aucune salle disponible" : "Sélectionner une salle"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune salle</SelectItem>
                  {rooms
                    .filter((room) => room.id && room.name && room.name.trim() !== "")
                    .map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center flex-wrap gap-2">
                    <Label htmlFor="capacity">Capacité</Label>
                    {renderChangeIndicator('capacity')}
                    {scrapingChanges['capacity'] !== undefined && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                        onClick={() => applyChange('capacity')}
                >
                  Appliquer
                </Button>
              )}
            </div>
            <Input
                    id="capacity"
                    type="number"
                    value={formData.capacity || ""}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              className="min-h-[44px] text-base"
            />
                </div>
          </div>

              <div className="space-y-2">
                <Label>Organisateurs</Label>
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
            </CardContent>
          </Card>

          {/* Section: Liens et réseaux sociaux */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Liens et réseaux sociaux</CardTitle>
              <CardDescription>URLs et liens externes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <Label htmlFor="external_url">URL externe</Label>
                {renderChangeIndicator('external_url')}
                {scrapingChanges['external_url'] !== undefined && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                    onClick={() => applyChange('external_url')}
                  >
                    Appliquer
                  </Button>
                )}
              </div>
              <Input
                id="external_url"
                type="url"
                value={formData.external_url || ""}
                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                placeholder="https://example.com"
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="external_url_label">Label du lien externe</Label>
              <Input
                id="external_url_label"
                type="text"
                value={formData.external_url_label || ""}
                onChange={(e) => setFormData({ ...formData, external_url_label: e.target.value })}
                placeholder="Réserver des billets"
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-2">
              <Label htmlFor="instagram_url">Instagram</Label>
              <Input
                id="instagram_url"
                type="url"
                value={formData.instagram_url || ""}
                onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                placeholder="https://instagram.com/..."
                className="min-h-[44px] text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="facebook_url">Facebook</Label>
              <Input
                id="facebook_url"
                type="url"
                value={formData.facebook_url || ""}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="https://facebook.com/..."
                className="min-h-[44px] text-base"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scraping_url">URL d'exemple pour le scraping</Label>
            <div className="flex gap-2">
              <Input
                id="scraping_url"
                type="url"
                value={formData.scraping_url || ""}
                onChange={(e) => setFormData({ ...formData, scraping_url: e.target.value })}
                placeholder="https://example.com/event"
                className="min-h-[44px] text-base flex-1"
              />
              {formData.scraping_url && formData.scraping_url.trim() && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  asChild
                  className="min-h-[44px] min-w-[44px] cursor-pointer"
                  title="Ouvrir l'URL dans un nouvel onglet"
                >
                  <a href={formData.scraping_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              URL d'exemple utilisée pour le scraping d'informations sur cet événement
            </p>
          </div>
            </CardContent>
          </Card>

          {/* Section: Tarification */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tarification</CardTitle>
              <CardDescription>Prix et tarifs de l'événement</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-3"}`}>
          <div className="space-y-2">
                  <div className="flex items-center flex-wrap gap-2">
                    <Label htmlFor="price">Prix</Label>
                    {renderChangeIndicator('price')}
                    {scrapingChanges['price'] !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                        onClick={() => applyChange('price')}
                      >
                        Appliquer
                      </Button>
                    )}
                  </div>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price || ""}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="min-h-[44px] text-base"
            />
          </div>

          <div className="space-y-2">
                  <div className="flex items-center flex-wrap gap-2">
                    <Label htmlFor="presale_price">Tarif prévente</Label>
                    {renderChangeIndicator('presale_price')}
                    {scrapingChanges['presale_price'] !== undefined && (
                <Button
                  type="button"
                        variant="ghost"
                  size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                        onClick={() => applyChange('presale_price')}
                >
                        Appliquer
                </Button>
                    )}
                  </div>
                <Input
                    id="presale_price"
                    type="number"
                    step="0.01"
                    value={formData.presale_price || ""}
                    onChange={(e) => setFormData({ ...formData, presale_price: e.target.value })}
                    className="min-h-[44px] text-base"
                    placeholder="Optionnel"
                />
              </div>

              <div className="space-y-2">
                  <div className="flex items-center flex-wrap gap-2">
                    <Label htmlFor="subscriber_price">Tarif abonné</Label>
                    {renderChangeIndicator('subscriber_price')}
                    {scrapingChanges['subscriber_price'] !== undefined && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-success hover:opacity-80 cursor-pointer"
                        onClick={() => applyChange('subscriber_price')}
                      >
                        Appliquer
                      </Button>
                    )}
                </div>
                <Input
                    id="subscriber_price"
                    type="number"
                    step="0.01"
                    value={formData.subscriber_price || ""}
                    onChange={(e) => setFormData({ ...formData, subscriber_price: e.target.value })}
                    className="min-h-[44px] text-base"
                    placeholder="Optionnel"
                />
              </div>
            </div>
            </CardContent>
          </Card>

          <div className={`flex gap-2 ${isMobile ? "flex-col" : "justify-end"}`}>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px] w-full md:w-auto cursor-pointer"
            >
              Annuler
            </Button>
            <Button type="submit" className="min-h-[44px] w-full md:w-auto cursor-pointer">
              Enregistrer
            </Button>
          </div>
        </form>
        </SheetContent>
      </Sheet>
      
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
                  <Label htmlFor="edit-aspect-ratio" className="text-sm font-medium flex items-center gap-2">
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="libre">Libre</SelectItem>
                      <SelectItem value="1">Carré (1:1)</SelectItem>
                      <SelectItem value="1.5">Paysage (3:2)</SelectItem>
                      <SelectItem value="1.7777777777777777">Vidéo (16:9)</SelectItem>
                      <SelectItem value="0.6666666666666666">Portrait (2:3)</SelectItem>
                      <SelectItem value="0.75">Portrait (3:4)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Zoom Control */}
                <div className="space-y-2">
                  <Label htmlFor="edit-zoom" className="text-sm font-medium flex items-center gap-2">
                    <Maximize2 className="h-4 w-4" />
                    Zoom: {Math.round(zoom * 100)}%
                  </Label>
                  <input
                    id="edit-zoom"
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end">
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
                  >
                    Annuler
                  </Button>
                  <Button type="button" onClick={handleCropComplete}>
                    <Save className="mr-2 h-4 w-4" />
                    Appliquer le rognage
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


