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
import { Textarea } from "@/components/ui/textarea";
import { AddressInput } from "@/components/ui/address-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Image as ImageIcon, X, Search, Link as LinkIcon, Save, Building2, ExternalLink, Code, Edit2, Globe, Instagram, Facebook, Users, Music, ChevronLeft, LayoutGrid, List as ListIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableView, MobileCard, MobileCardRow, MobileCardActions } from "./mobile-table-view";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RoomsManagement } from "./rooms-management";
import { compressImage } from "@/lib/image-compression";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";

interface Room {
  id: string;
  name: string;
  location_id: string;
  capacity: number | null;
}

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
  tiktok_url: string | null;
  facebook_page_id: string | null;
  website_url: string | null;
  scraping_example_url: string | null;
  is_organizer: boolean | null;
  suggested: boolean | null;
  created_at: string;
  updated_at: string;
  rooms?: Room[];
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
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isRoomsDialogOpen, setIsRoomsDialogOpen] = useState(false);
  const [selectedLocationForRooms, setSelectedLocationForRooms] = useState<Location | null>(null);

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
        .select("*")
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

  async function toggleSuggested(locationId: string, currentValue: boolean) {
    try {
      // Si on essaie d'activer, vérifier qu'on n'a pas déjà 6 lieux recommandés
      if (!currentValue) {
        const suggestedCount = locations.filter(loc => loc.suggested).length;
        if (suggestedCount >= 6) {
          alert("Vous ne pouvez pas recommander plus de 6 lieux. Veuillez désactiver un lieu recommandé avant d'en activer un autre.");
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
      alert("Erreur lors de la mise à jour du lieu recommandé");
    }
  }

  // Calculer le nombre de lieux recommandés
  const suggestedCount = locations.filter(loc => loc.suggested).length;

  function handleOpenDialog(location?: Location) {
    setEditingLocation(location || null);
    setIsDialogOpen(true);
  }

  function getInitials(name: string) {
    return name
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
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6">
        {/* En-tête compact */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-xl font-semibold">Lieux</h2>
              <p className="text-sm text-muted-foreground">
                {filteredLocations.length} lieu{filteredLocations.length > 1 ? "x" : ""}
                {searchQuery && ` sur ${locations.length}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border">
              <span className="text-sm font-medium">Lieux recommandés:</span>
              <Badge variant={suggestedCount >= 6 ? "destructive" : suggestedCount >= 4 ? "default" : "secondary"} className="font-semibold">
                {suggestedCount}/6
              </Badge>
            </div>

            <div className="flex items-center gap-1 rounded-lg border bg-background p-1">
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

            <Button onClick={() => handleOpenDialog()} size="sm" className="h-9">
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter
            </Button>
          </div>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un lieu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {/* Liste / Grille */}
        {filteredLocations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto opacity-20 mb-2" />
            <p>{locations.length === 0 ? "Aucun lieu. Cliquez sur 'Ajouter' pour commencer." : `Aucun résultat pour "${searchQuery}"`}</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLocations.map((location) => (
              <div
                key={location.id}
                onClick={() => handleOpenDialog(location)}
                className="group relative flex flex-col p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/50 transition-all duration-200 cursor-pointer min-h-[160px]"
              >
                {/* Avatar et infos */}
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="h-12 w-12 ring-2 ring-background shrink-0">
                    <AvatarImage src={location.image_url || undefined} alt={location.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {getInitials(location.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{location.name}</h3>
                      {location.is_organizer && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Orga</Badge>
                      )}
                    </div>
                    {location.address && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {location.address}
                      </p>
                    )}
                    {location.short_description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {location.short_description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Salles et capacité */}
                {(location.rooms && location.rooms.length > 0) || location.capacity ? (
                  <div className="mb-3 space-y-1">
                    {location.rooms && location.rooms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {location.rooms.map((room) => (
                          <Badge key={room.id} variant="secondary" className="text-xs">
                            {room.name}{room.capacity && ` (${room.capacity})`}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {location.capacity && (
                      <p className="text-xs text-muted-foreground">Capacité: {location.capacity}</p>
                    )}
                  </div>
                ) : null}

                {/* Liens sociaux */}
                {(location.instagram_url || location.facebook_url || location.tiktok_url || location.website_url) && (
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {location.website_url && (
                      <a
                        href={location.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded hover:bg-accent transition-colors"
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
                        className="p-1.5 rounded hover:bg-accent transition-colors"
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
                        className="p-1.5 rounded hover:bg-accent transition-colors"
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
                        className="p-1.5 rounded hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Music className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    )}
                  </div>
                )}

                {/* Actions - collées en bas */}
                <div className="flex items-center justify-between gap-1 pt-2 border-t mt-auto">
                  <div className="flex items-center gap-1">
                    {location.is_organizer && (
                      <Link
                        href={`/admin/organizers/${location.id}/team`}
                        className="p-1.5 rounded hover:bg-accent transition-colors"
                        title="Gérer l'équipe"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Users className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    <Link
                      href={`/admin/events?location=${location.id}`}
                      target="_blank"
                      className="p-1.5 rounded hover:bg-accent transition-colors"
                      title="Voir les événements"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    {location.scraping_example_url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/scraping/${location.id}`);
                        }}
                        className="p-1.5 rounded hover:bg-accent transition-colors"
                        title="Configuration scraping"
                      >
                        <Code className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLocationForRooms(location);
                        setIsRoomsDialogOpen(true);
                      }}
                      className="p-1.5 rounded hover:bg-accent transition-colors"
                      title="Gérer les salles"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
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
                  <Popover>
                    <PopoverTrigger asChild>
                        <button 
                          className="p-1.5 rounded hover:bg-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1" align="end">
                      <div className="space-y-0.5">
                        <button
                          onClick={() => handleOpenDialog(location)}
                          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Modifier
                        </button>
                        <button
                          onClick={() => deleteLocation(location.id)}
                          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lieu</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Recommandé</TableHead>
                  <TableHead className="text-right">Commandes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((location) => (
                  <TableRow
                    key={location.id}
                    className="cursor-pointer"
                    onClick={() => handleOpenDialog(location)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 ring-2 ring-background shrink-0">
                          <AvatarImage src={location.image_url || undefined} alt={location.name} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {getInitials(location.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium truncate">{location.name}</div>
                            {location.is_organizer && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Orga</Badge>
                            )}
                            {location.suggested && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Recommandé</Badge>
                            )}
                          </div>
                          {location.address && (
                            <div className="text-xs text-muted-foreground truncate">{location.address}</div>
                          )}
                          {(location.rooms?.length || 0) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {(location.rooms?.length || 0)} salle{(location.rooms?.length || 0) > 1 ? "s" : ""}
                              {location.capacity ? ` • Capacité ${location.capacity}` : ""}
                            </div>
                          )}
                        </div>
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
                        {location.is_organizer && (
                          <Button asChild variant="ghost" size="icon">
                            <Link
                              href={`/admin/organizers/${location.id}/team`}
                              title="Équipe"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Users className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="icon">
                          <Link
                            href={`/admin/events?location=${location.id}`}
                            target="_blank"
                            title="Événements"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
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
                          title="Modifier"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDialog(location);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Supprimer"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLocation(location.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
      </div>
    </TooltipProvider>
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
    tiktok_url: "",
    facebook_page_id: "",
    website_url: "",
    scraping_example_url: "",
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
        is_organizer: false,
        suggested: false,
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
        tiktok_url: formData.tiktok_url || null,
        facebook_page_id: formData.facebook_page_id || null,
        website_url: formData.website_url || null,
        scraping_example_url: formData.scraping_example_url || null,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[66.666vw] overflow-y-auto [@media(min-width:1440px)]:w-[66.666vw] [@media(min-width:1600px)]:max-w-2xl"
      >
        <SheetHeader className="mb-6">
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
      </SheetContent>
    </Sheet>
  );
}

