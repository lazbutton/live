"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { AddressInput } from "@/components/ui/address-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Image as ImageIcon, X, Search, Link as LinkIcon, Save, Building2, ExternalLink, Code, Edit2, Globe, Instagram, Facebook, Users, Music, ChevronLeft, LayoutGrid, List as ListIcon, RotateCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RoomsManagement } from "./rooms-management";
import { compressImage } from "@/lib/image-compression";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { toast } from "@/components/ui/use-toast";
import {
  ManagementEmptyState,
  ManagementHero,
  ManagementPill,
  ManagementSectionLabel,
  ManagementStat,
  ManagementStatGrid,
  ManagementToolbar,
} from "./management-page-primitives";

interface Room {
  id: string;
  name: string;
  location_id: string;
  capacity: number | null;
}

export interface Location {
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
  tiktok_url: string | null;
  facebook_page_id: string | null;
  website_url: string | null;
  scraping_example_url: string | null;
  source_capture_mode: "url" | "image" | "facebook";
  is_organizer: boolean | null;
  suggested: boolean | null;
  created_at: string;
  updated_at: string;
  city_id?: string | null;
  city?: {
    id: string;
    label: string;
  } | null;
  rooms?: Room[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getCaptureModeLabel(mode: Location["source_capture_mode"]) {
  if (mode === "image") return "Capture image";
  if (mode === "facebook") return "Capture Facebook";
  return "Capture URL";
}

export function LocationsManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openLocationId = searchParams.get("open");
  const didAutoOpenRef = useRef(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [organizerFilter, setOrganizerFilter] = useState<"all" | "organizer" | "non_organizer">("all");
  const [suggestedFilter, setSuggestedFilter] = useState<"all" | "suggested" | "non_suggested">("all");
  const [isRoomsDialogOpen, setIsRoomsDialogOpen] = useState(false);
  const [selectedLocationForRooms, setSelectedLocationForRooms] = useState<Location | null>(null);
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

  useEffect(() => {
    loadLocations();
  }, []);

  // Ouvrir automatiquement un lieu depuis /admin/locations?open=<id>
  useEffect(() => {
    if (!openLocationId) return;
    if (didAutoOpenRef.current) return;
    if (loading) return;
    const loc = locations.find((l) => l.id === openLocationId);
    if (!loc) return;
    didAutoOpenRef.current = true;
    setEditingLocation(loc);
    setIsDialogOpen(true);
  }, [openLocationId, loading, locations]);

  async function loadLocations() {
    try {
      // Charger les lieux
      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("*, city:cities(id, label)")
        .order("name", { ascending: true });

      if (locationsError) throw locationsError;

      // Charger toutes les salles
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .order("name", { ascending: true });

      if (roomsError) throw roomsError;

      // Associer les salles aux lieux
      const locationsWithRooms = (locationsData || []).map((location) => ({
        ...location,
        city: Array.isArray(location.city) ? (location.city[0] ?? null) : (location.city ?? null),
        rooms: (roomsData || []).filter((room) => room.location_id === location.id),
      }));

      setLocations(locationsWithRooms);
      setFilteredLocations(locationsWithRooms);
    } catch (error) {
      console.error("Erreur lors du chargement des lieux:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrer les lieux par recherche
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = locations.filter((location) => {
      const matchesQuery =
        !query ||
        location.name.toLowerCase().includes(query) ||
        location.address?.toLowerCase().includes(query) ||
        location.city?.label.toLowerCase().includes(query);
      const matchesCity = cityFilter === "all" || location.city?.id === cityFilter;
      const matchesOrganizer =
        organizerFilter === "all" ||
        (organizerFilter === "organizer"
          ? Boolean(location.is_organizer)
          : !Boolean(location.is_organizer));
      const matchesSuggested =
        suggestedFilter === "all" ||
        (suggestedFilter === "suggested"
          ? Boolean(location.suggested)
          : !Boolean(location.suggested));
      return matchesQuery && matchesCity && matchesOrganizer && matchesSuggested;
    });
    setFilteredLocations(next);
  }, [locations, searchQuery, cityFilter, organizerFilter, suggestedFilter]);

  async function deleteLocation(id: string) {
    showConfirm({
      title: "Supprimer le lieu",
      description: "Êtes-vous sûr de vouloir supprimer ce lieu ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("locations").delete().eq("id", id);
          if (error) throw error;
          toast({ title: "Lieu supprimé", variant: "success" });
          await loadLocations();
        } catch (error) {
          console.error("Erreur lors de la suppression:", error);
          showAlert({
            title: "Suppression impossible",
            description: "Erreur lors de la suppression du lieu",
            confirmText: "OK",
          });
        }
      },
    });
  }

  async function toggleSuggested(locationId: string, currentValue: boolean) {
    try {
      // Si on essaie d'activer, vérifier qu'on n'a pas déjà 6 lieux recommandés
      if (!currentValue) {
        const suggestedCount = locations.filter(loc => loc.suggested).length;
        if (suggestedCount >= 6) {
          showAlert({
            title: "Limite atteinte",
            description:
              "Vous ne pouvez pas recommander plus de 6 lieux. Désactivez un lieu recommandé avant d'en activer un autre.",
            confirmText: "OK",
          });
          return;
        }
      }

      const { error } = await supabase
        .from("locations")
        .update({ suggested: !currentValue })
        .eq("id", locationId);

      if (error) throw error;
      await loadLocations();
    } catch (error) {
      console.error("Erreur lors de la mise à jour:", error);
      showAlert({
        title: "Mise à jour impossible",
        description: "Erreur lors de la mise à jour du lieu recommandé",
        confirmText: "OK",
      });
    }
  }

  // Calculer le nombre de lieux recommandés
  const suggestedCount = locations.filter(loc => loc.suggested).length;

  function handleOpenDialog(location?: Location) {
    setEditingLocation(location || null);
    setIsDialogOpen(true);
  }

  function getLocationLinkCount(location: Location) {
    return [
      location.website_url,
      location.instagram_url,
      location.facebook_url,
      location.tiktok_url,
    ].filter(Boolean).length;
  }

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    cityFilter !== "all" ||
    organizerFilter !== "all" ||
    suggestedFilter !== "all";
  const cityOptions = Array.from(
    new Map(
      locations
        .filter((location) => location.city?.id && location.city?.label)
        .map((location) => [location.city!.id, location.city!.label]),
    ).entries(),
  ).map(([id, label]) => ({ id, label }));
  const organizerLocationsCount = locations.filter((loc) => Boolean(loc.is_organizer)).length;
  const withoutImageCount = locations.filter((loc) => !loc.image_url).length;
  const withRoomsCount = locations.filter((loc) => (loc.rooms?.length || 0) > 0).length;

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
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5">
        <ManagementHero
          icon={<Building2 className="h-5 w-5" />}
          title="Lieux"
          description="Gérez les lieux, les salles associées, les pages source et la mise en avant dans une interface plus lisible et plus rapide à exploiter."
          actions={
            <>
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2 shadow-sm">
                <span className="text-sm font-medium">Recommandés</span>
                <Badge
                  variant={suggestedCount >= 6 ? "destructive" : suggestedCount >= 4 ? "default" : "secondary"}
                  className="rounded-full"
                >
                  {suggestedCount}/6
                </Badge>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-background/90 p-1 shadow-sm">
                <Button
                  type="button"
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setViewMode("list")}
                  title="Vue liste"
                >
                  <ListIcon className="h-4 w-4" />
                  <span className="hidden md:inline">Liste</span>
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "grid" ? "default" : "ghost"}
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setViewMode("grid")}
                  title="Vue grille"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden md:inline">Grille</span>
                </Button>
              </div>
              <Button onClick={() => handleOpenDialog()} size="sm" className="h-9 rounded-xl">
                <Plus className="mr-1.5 h-4 w-4" />
                Nouveau lieu
              </Button>
            </>
          }
        >
          <ManagementStatGrid>
            <ManagementStat label="Résultats visibles" value={filteredLocations.length} hint={`${locations.length} au total`} />
            <ManagementStat label="Lieux-organisateurs" value={organizerLocationsCount} hint="Peuvent créer une source" />
            <ManagementStat label="Avec salles" value={withRoomsCount} hint="Gestion rapide des rooms" />
            <ManagementStat label="Image & mise en avant" value={`${suggestedCount}/6`} hint={`${withoutImageCount} sans image`} />
          </ManagementStatGrid>
        </ManagementHero>

        <ManagementToolbar>
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.2fr_repeat(3,minmax(0,0.9fr))_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un lieu, une adresse ou une ville..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 rounded-xl pl-9"
                />
              </div>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Ville" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les villes</SelectItem>
                  {cityOptions.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={organizerFilter}
                onValueChange={(value) => setOrganizerFilter(value as typeof organizerFilter)}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les lieux</SelectItem>
                  <SelectItem value="organizer">Lieux-organisateurs</SelectItem>
                  <SelectItem value="non_organizer">Lieux simples</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={suggestedFilter}
                onValueChange={(value) => setSuggestedFilter(value as typeof suggestedFilter)}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Recommandation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="suggested">Recommandés</SelectItem>
                  <SelectItem value="non_suggested">Non recommandés</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-xl"
                disabled={!hasActiveFilters}
                onClick={() => {
                  setSearchQuery("");
                  setCityFilter("all");
                  setOrganizerFilter("all");
                  setSuggestedFilter("all");
                }}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                Réinitialiser
              </Button>
            </div>
            {hasActiveFilters ? (
              <div className="flex flex-wrap gap-2">
                {searchQuery.trim() ? <ManagementPill tone="muted">Recherche: {searchQuery.trim()}</ManagementPill> : null}
                {cityFilter !== "all" ? (
                  <ManagementPill tone="muted">
                    Ville: {cityOptions.find((city) => city.id === cityFilter)?.label || cityFilter}
                  </ManagementPill>
                ) : null}
                {organizerFilter !== "all" ? (
                  <ManagementPill tone="muted">
                    {organizerFilter === "organizer" ? "Lieux-organisateurs" : "Lieux simples"}
                  </ManagementPill>
                ) : null}
                {suggestedFilter !== "all" ? (
                  <ManagementPill tone="muted">
                    {suggestedFilter === "suggested" ? "Recommandés" : "Non recommandés"}
                  </ManagementPill>
                ) : null}
              </div>
            ) : null}
          </div>
        </ManagementToolbar>

        {/* Liste / Grille */}
        {filteredLocations.length === 0 ? (
          <ManagementEmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={locations.length === 0 ? "Aucun lieu pour le moment" : "Aucun résultat"}
            description={
              locations.length === 0
                ? "Ajoutez votre premier lieu pour structurer l’offre, les salles et les pages source."
                : `Aucun lieu ne correspond aux filtres actuels${searchQuery.trim() ? ` pour "${searchQuery.trim()}"` : ""}.`
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredLocations.map((location) => (
              <div
                key={location.id}
                onClick={() => handleOpenDialog(location)}
                className="group relative flex min-h-[320px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/95 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg cursor-pointer"
              >
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-primary/5 via-primary/0 to-transparent" />
                <div className="relative flex items-start gap-3">
                  <Avatar className="h-14 w-14 shrink-0 rounded-2xl border border-border/70 shadow-sm">
                    <AvatarImage src={location.image_url || undefined} alt={location.name} />
                    <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
                      {getInitials(location.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">{location.name}</h3>
                      {location.is_organizer && (
                        <Badge variant="outline" className="rounded-full border-border/70 bg-background/80 text-[11px]">
                          Lieu-organisateur
                        </Badge>
                      )}
                      {location.suggested && (
                        <Badge variant="secondary" className="rounded-full text-[11px]">
                          Recommandé
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {location.city?.label ? <ManagementPill tone="muted">{location.city.label}</ManagementPill> : null}
                      <ManagementPill tone={location.image_url ? "default" : "warning"}>
                        {location.image_url ? "Image OK" : "Image manquante"}
                      </ManagementPill>
                    </div>
                  </div>
                </div>

                <div className="mt-4 min-h-[72px] space-y-2">
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {location.address || "Aucune adresse renseignée"}
                  </p>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {location.short_description?.trim() ||
                      "Ajoutez une description courte pour mieux qualifier l’ambiance, l’accès ou la spécialité du lieu."}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  <ManagementPill tone="muted">
                    {(location.rooms?.length || 0)} salle{(location.rooms?.length || 0) > 1 ? "s" : ""}
                  </ManagementPill>
                  {location.capacity ? (
                    <ManagementPill tone="muted">Capacité {location.capacity}</ManagementPill>
                  ) : null}
                  {location.is_organizer ? (
                    <ManagementPill tone={location.scraping_example_url ? "positive" : "muted"}>
                      {location.scraping_example_url ? "Source prête" : getCaptureModeLabel(location.source_capture_mode)}
                    </ManagementPill>
                  ) : null}
                </div>

                {(location.instagram_url || location.facebook_url || location.tiktok_url || location.website_url) && (
                  <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                    {location.website_url && (
                      <a
                        href={location.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    {location.instagram_url && (
                      <a
                        href={location.instagram_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    {location.facebook_url && (
                      <a
                        href={location.facebook_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Facebook className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                    {location.tiktok_url && (
                      <a
                        href={location.tiktok_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Music className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl bg-background/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLocationForRooms(location);
                          setIsRoomsDialogOpen(true);
                        }}
                      >
                        <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
                        Salles
                      </Button>
                      {location.is_organizer ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl bg-background/80"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/admin/organizers/${location.id}/team`);
                          }}
                        >
                          <Users className="mr-1.5 h-3.5 w-3.5" />
                          Équipe
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="flex items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Switch
                            checked={location.suggested || false}
                            onCheckedChange={() => toggleSuggested(location.id, location.suggested || false)}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-pointer"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{location.suggested ? "Recommandé" : "Non recommandé"}</p>
                      </TooltipContent>
                    </Tooltip>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        title="Supprimer"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteLocation(location.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieu</TableHead>
                  <TableHead className="hidden lg:table-cell">Signaux</TableHead>
                  <TableHead className="hidden xl:table-cell">Capacité & salles</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Recommandé</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((location) => (
                  <TableRow
                    key={location.id}
                    className="cursor-pointer hover:bg-muted/20"
                    onClick={() => handleOpenDialog(location)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-11 w-11 shrink-0 rounded-2xl border border-border/70 shadow-sm">
                          <AvatarImage src={location.image_url || undefined} alt={location.name} />
                          <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
                            {getInitials(location.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{location.name}</div>
                            {location.is_organizer ? <Badge variant="outline" className="rounded-full text-[10px]">Orga</Badge> : null}
                            {location.suggested ? <Badge variant="secondary" className="rounded-full text-[10px]">Recommandé</Badge> : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{location.address || "Adresse non renseignée"}</div>
                          {location.city?.label && (
                            <div className="mt-1">
                              <Badge variant="secondary" className="rounded-full text-[10px]">
                                {location.city.label}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        <ManagementPill tone={location.is_organizer ? "default" : "muted"}>
                          {location.is_organizer ? getCaptureModeLabel(location.source_capture_mode) : "Lieu simple"}
                        </ManagementPill>
                        <ManagementPill tone={location.scraping_example_url ? "positive" : "muted"}>
                          {location.scraping_example_url ? "Scraping prêt" : "Pas de scraping"}
                        </ManagementPill>
                        <ManagementPill tone={location.image_url ? "default" : "warning"}>
                          {location.image_url ? "Image OK" : "Image manquante"}
                        </ManagementPill>
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex flex-wrap gap-1.5">
                        <ManagementPill tone="muted">
                          {(location.rooms?.length || 0)} salle{(location.rooms?.length || 0) > 1 ? "s" : ""}
                        </ManagementPill>
                        {location.capacity ? (
                          <ManagementPill tone="muted">Capacité {location.capacity}</ManagementPill>
                        ) : null}
                        <ManagementPill tone="muted">
                          {getLocationLinkCount(location)} lien{getLocationLinkCount(location) > 1 ? "s" : ""}
                        </ManagementPill>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div
                        className="flex justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={location.suggested || false}
                          onCheckedChange={() => toggleSuggested(location.id, location.suggested || false)}
                          className="cursor-pointer"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {location.is_organizer ? (
                          <Button asChild variant="ghost" size="icon" className="rounded-xl">
                            <Link
                              href={`/admin/organizers/${location.id}/team`}
                              title="Équipe"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Users className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-xl"
                          title={location.scraping_example_url ? "Configuration scraping" : "Aucune URL de scraping"}
                          disabled={!location.scraping_example_url}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!location.scraping_example_url) return;
                            router.push(`/admin/scraping/${location.id}`);
                          }}
                        >
                          <Code className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-xl"
                          title="Gérer les salles"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLocationForRooms(location);
                            setIsRoomsDialogOpen(true);
                          }}
                        >
                          <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-xl"
                          title="Modifier"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDialog(location);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="rounded-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-xl">
                            {location.scraping_example_url ? (
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <a
                                  href={location.scraping_example_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Ouvrir l'URL source
                                </a>
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onClick={() => deleteLocation(location.id)}
                              className="cursor-pointer text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

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
              if (!open) {
                setSelectedLocationForRooms(null);
                loadLocations();
              }
            }}
          />
        )}
        <AlertDialogComponent />
      </div>
    </TooltipProvider>
  );
}

export function LocationDialog({
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
  const { showAlert, AlertDialogComponent } = useAlertDialog();
  const [cities, setCities] = useState<Array<{ id: string; label: string }>>([]);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city_id: "",
    image_url: "",
    short_description: "",
    capacity: "",
    directions: "",
    latitude: "",
    longitude: "",
    instagram_url: "",
    facebook_url: "",
    tiktok_url: "",
    facebook_page_id: "",
    website_url: "",
    scraping_example_url: "",
    source_capture_mode: "url" as "url" | "image" | "facebook",
    is_organizer: false,
    suggested: false,
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
        city_id: location.city_id || "",
        image_url: location.image_url || "",
        short_description: location.short_description || "",
        capacity: location.capacity?.toString() || "",
        directions: location.directions || "",
        latitude: location.latitude?.toString() || "",
        longitude: location.longitude?.toString() || "",
        instagram_url: location.instagram_url || "",
        facebook_url: location.facebook_url || "",
        tiktok_url: location.tiktok_url || "",
        facebook_page_id: location.facebook_page_id || "",
        website_url: location.website_url || "",
        scraping_example_url: location.scraping_example_url || "",
        source_capture_mode: location.source_capture_mode || "url",
        is_organizer: location.is_organizer || false,
        suggested: location.suggested || false,
      });
      setImagePreview(location.image_url || null);
      setOriginalImageSrc(location.image_url || null);
      setImageFile(null);
    } else {
      setFormData({
        name: "",
        address: "",
        city_id: "",
        image_url: "",
        short_description: "",
        capacity: "",
        directions: "",
        latitude: "",
        longitude: "",
        instagram_url: "",
        facebook_url: "",
        tiktok_url: "",
        facebook_page_id: "",
        website_url: "",
        scraping_example_url: "",
        source_capture_mode: "url",
        is_organizer: false,
        suggested: false,
      });
      setImagePreview(null);
      setOriginalImageSrc(null);
      setImageFile(null);
    }
  }, [location, open]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("id, label")
        .order("label", { ascending: true });
      if (error) {
        console.error("Erreur chargement villes:", error);
        return;
      }
      setCities((data || []) as Array<{ id: string; label: string }>);
    })();
  }, [open]);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        showAlert({
          title: "Image invalide",
          description: "Veuillez sélectionner une image.",
          confirmText: "OK",
        });
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
      showAlert({
        title: "Rognage impossible",
        description: "Erreur lors du rognage de l'image",
        confirmText: "OK",
      });
    }
  }

  function handleImageClick() {
    if (originalImageSrc) {
      setCropImageSrc(originalImageSrc);
      setShowCropper(true);
    }
  }

  async function handleImageUpload(): Promise<string | null> {
    const currentUrl = formData.image_url?.trim() || "";
    const isStoredLocationImage = (url: string) =>
      /\/storage\/v1\/object\/public\/locations-images\//.test(url);

    async function uploadFromRemoteUrl(url: string): Promise<string | null> {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Image distante inaccessible (${response.status})`);
        }
        const blob = await response.blob();
        const contentType = blob.type || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          throw new Error("L'URL fournie n'est pas une image valide.");
        }
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
            ? "webp"
            : contentType.includes("gif")
              ? "gif"
              : "jpg";
        const remoteFile = new File([blob], `location-remote-${Date.now()}.${ext}`, {
          type: contentType,
        });
        const fileToUpload = await compressImage(remoteFile, 2);
        const fileExt = fileToUpload.name.split(".").pop() || ext;
        const fileName = `locations/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data, error } = await supabase.storage
          .from("locations-images")
          .upload(fileName, fileToUpload, {
            cacheControl: "3600",
            upsert: false,
          });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage
          .from("locations-images")
          .getPublicUrl(data.path);
        return publicUrl;
      } catch (error: any) {
        console.error("Erreur copie image distante:", error);
        showAlert({
          title: "Image distante invalide",
          description:
            "Impossible de sauvegarder l'image distante: " +
            (error.message || "Erreur inconnue"),
          confirmText: "OK",
        });
        return null;
      }
    }

    if (!imageFile) {
      if (!currentUrl) return "";
      if (isStoredLocationImage(currentUrl)) return currentUrl;
      return await uploadFromRemoteUrl(currentUrl);
    }

    try {
      setUploading(true);
      
      // Compresser l'image avant upload pour qu'elle fasse moins de 10 Mo
      const fileToUpload = await compressImage(imageFile, 2);

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
          showAlert({
            title: "Bucket manquant",
            description:
              "Le bucket 'locations-images' n'existe pas. Veuillez le créer dans Supabase Storage.",
            confirmText: "OK",
          });
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
        showAlert({
          title: "Bucket manquant",
          description:
            "Le bucket 'locations-images' n'existe pas. Veuillez le créer dans Supabase Storage.",
          confirmText: "OK",
        });
      } else {
        showAlert({
          title: "Upload impossible",
          description:
            "Erreur lors de l'upload de l'image: " +
            (error.message || "Erreur inconnue"),
          confirmText: "OK",
        });
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

      if (imageFile || formData.image_url.trim()) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl !== null) {
          finalImageUrl = uploadedUrl;
        } else {
          setUploading(false);
          return;
        }
      }

      if (formData.suggested && !location?.suggested) {
        const { count, error: suggestedError } = await supabase
          .from("locations")
          .select("id", { count: "exact", head: true })
          .eq("suggested", true);
        if (suggestedError) throw suggestedError;
        if ((count || 0) >= 6) {
          showAlert({
            title: "Limite atteinte",
            description:
              "Vous ne pouvez pas recommander plus de 6 lieux. Désactivez un lieu recommandé avant d'en activer un autre.",
            confirmText: "OK",
          });
          setUploading(false);
          return;
        }
      }

      const submitData = {
        name: formData.name,
        address: formData.address || null,
        city_id: formData.city_id || null,
        image_url: finalImageUrl || null,
        short_description: formData.short_description || null,
        capacity: formData.capacity ? parseInt(formData.capacity) : null,
        directions: formData.directions || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        tiktok_url: formData.tiktok_url || null,
        facebook_page_id: formData.facebook_page_id || null,
        website_url: formData.website_url || null,
        scraping_example_url: formData.scraping_example_url || null,
        source_capture_mode: formData.source_capture_mode,
        is_organizer: formData.is_organizer || false,
        suggested: formData.suggested || false,
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

      if (location) {
        await removeReplacedStorageObject(supabase, {
          bucket: "locations-images",
          previousUrl: location.image_url,
          nextUrl: finalImageUrl,
          references: [{ table: "locations", column: "image_url" }],
        });
      }

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      showAlert({
        title: "Sauvegarde impossible",
        description: "Erreur lors de la sauvegarde du lieu",
        confirmText: "OK",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-background sm:w-[66.666vw] [@media(min-width:1440px)]:w-[66.666vw] [@media(min-width:1600px)]:max-w-2xl"
      >
        <SheetHeader className="mb-5 border-b border-border/70 pb-5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-2 h-9 w-9"
              onClick={() => onOpenChange(false)}
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Fermer</span>
            </Button>
            <SheetTitle className="text-xl md:text-2xl">
              {location ? "Modifier le lieu" : "Nouveau lieu"}
            </SheetTitle>
          </div>
          <SheetDescription className="mt-2">
            {location ? "Modifiez les informations du lieu" : "Ajoutez un nouveau lieu pour les événements"}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pb-24">
          <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-14 w-14 shrink-0 rounded-2xl border border-border/70 shadow-sm">
                <AvatarImage src={imagePreview || undefined} alt={formData.name || "Lieu"} />
                <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
                  {getInitials(formData.name || location?.name || "NA")}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <div className="truncate text-base font-semibold">
                    {formData.name.trim() || "Nouveau lieu"}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Centralisez les infos d’accès, les salles, la source et la mise en avant dans une fiche plus claire.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formData.city_id ? (
                    <ManagementPill tone="muted">
                      {cities.find((city) => city.id === formData.city_id)?.label || "Ville sélectionnée"}
                    </ManagementPill>
                  ) : null}
                  <ManagementPill tone={imagePreview ? "default" : "warning"}>
                    {imagePreview ? "Image prête" : "Image manquante"}
                  </ManagementPill>
                  {formData.is_organizer ? (
                    <ManagementPill tone={formData.scraping_example_url ? "positive" : "muted"}>
                      {formData.scraping_example_url ? "Source prête" : getCaptureModeLabel(formData.source_capture_mode)}
                    </ManagementPill>
                  ) : null}
                  {formData.suggested ? <ManagementPill tone="positive">Recommandé</ManagementPill> : null}
                </div>
              </div>
            </div>
          </div>

          <ManagementSectionLabel>Essentiel</ManagementSectionLabel>
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

          <div className="space-y-2">
            <Label htmlFor="city_id">Ville</Label>
            <Select
              value={formData.city_id || "none"}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  city_id: value === "none" ? "" : value,
                })
              }
            >
              <SelectTrigger id="city_id" className="min-h-[44px] text-base">
                <SelectValue placeholder="Sélectionner une ville" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune ville</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ManagementSectionLabel>Coordonnées & accès</ManagementSectionLabel>

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

          <ManagementSectionLabel>Réseaux & diffusion</ManagementSectionLabel>

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

          <div className="space-y-3">
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
            <div className="flex items-center space-x-2 p-4 border rounded-lg">
              <Switch
                id="suggested"
                checked={formData.suggested}
                onCheckedChange={(checked) => setFormData({ ...formData, suggested: checked })}
              />
              <Label htmlFor="suggested" className="cursor-pointer">
                Lieu recommandé (maximum 6 lieux recommandés)
              </Label>
            </div>
          </div>

          {formData.is_organizer && (
            <div className="space-y-2">
              <Label htmlFor="source_capture_mode" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Type de lien pour la source
              </Label>
              <Select
                value={formData.source_capture_mode}
                onValueChange={(value: "url" | "image" | "facebook") =>
                  setFormData({ ...formData, source_capture_mode: value })
                }
              >
                <SelectTrigger id="source_capture_mode" className="min-h-[44px] text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="image">Photo / image</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ce choix pilote le mode d'entree de la source synchronisee dans l'intake.
              </p>
            </div>
          )}

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
            <Label htmlFor="tiktok_url" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              TikTok
            </Label>
            <Input
              id="tiktok_url"
              type="url"
              value={formData.tiktok_url}
              onChange={(e) => setFormData({ ...formData, tiktok_url: e.target.value })}
              placeholder="https://tiktok.com/@..."
              className="cursor-pointer min-h-[44px] text-base"
            />
          </div>

          {formData.is_organizer && (
            <>
              <div className="space-y-2">
                <Label htmlFor="website_url" className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4" />
                  Site web
                </Label>
                <Input
                  id="website_url"
                  type="url"
                  value={formData.website_url}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  placeholder="https://example.com"
                  className="cursor-pointer min-h-[44px] text-base"
                />
                <p className="text-xs text-muted-foreground">
                  URL du site web du lieu-organisateur. Utilisée pour le scraping automatique d'événements.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scraping_example_url" className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  URL d'exemple pour le scraping
                </Label>
                <Input
                  id="scraping_example_url"
                  type="url"
                  value={formData.scraping_example_url}
                  onChange={(e) => setFormData({ ...formData, scraping_example_url: e.target.value })}
                  placeholder="https://example.com/events"
                  className="cursor-pointer min-h-[44px] text-base"
                />
                <p className="text-xs text-muted-foreground">
                  URL d'exemple d'une page à scraper. Cette URL servira de modèle pour le scraping automatique d'événements.
                </p>
              </div>

            </>
          )}

          <ManagementSectionLabel>Média</ManagementSectionLabel>

          <div className="space-y-2">
            <Label htmlFor="image" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Image du lieu
            </Label>
            {imagePreview && !showCropper && (
              <div className="relative w-full aspect-video max-w-xs rounded-lg overflow-hidden border group cursor-pointer" onClick={handleImageClick}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Aperçu"
                  className="w-full h-full object-contain bg-muted/20"
                />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center admin-overlay">
                  <div className="text-sm font-medium">
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

          <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-border/70 bg-background/95 px-6 py-3 backdrop-blur">
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
              <div className="relative w-full h-[400px] bg-muted rounded-lg overflow-hidden">
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
        <AlertDialogComponent />
      </SheetContent>
    </Sheet>
  );
}

