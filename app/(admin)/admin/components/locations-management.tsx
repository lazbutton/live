"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { fetchRemoteImageBlob } from "@/lib/events/remote-image";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
import {
  Building2,
  Code,
  Edit2,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  LayoutGrid,
  List as ListIcon,
  Music,
  Plus,
  RotateCw,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  DirectoryHeader,
  DirectorySearch,
  DirectorySegments,
  DirectoryTableCard,
  EntityAvatar,
  MissingHints,
  RowActionsMenu,
  SortableHead,
  UpcomingEventsCell,
  compareText,
  formatShortDate,
  getInitials,
  useDirectoryView,
  useSortState,
} from "./directory/directory";
import { useUpcomingEventStats } from "./directory/use-upcoming-events";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { RoomsManagement } from "./rooms-management";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityRelatedEvents } from "./directory/entity-related-events";
import { compressImage } from "@/lib/image-compression";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { toast } from "@/components/ui/use-toast";
import { ManagementEmptyState } from "./management-page-primitives";
import {
  ENTITY_SHEET_CLASSNAME,
  EntityFormSection,
  EntityImageField,
  EntitySheetBody,
  EntitySheetFooter,
  EntitySheetHeader,
  EntitySwitchRow,
} from "./directory/entity-sheet";
import { ImageCropDialog } from "./directory/image-crop-dialog";

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

/** Informations manquantes d'un lieu (affichées dans « À compléter »). */
function getLocationMissing(location: Location) {
  return [
    !location.image_url ? "Sans image" : null,
    !location.short_description?.trim() ? "Sans description" : null,
    !location.city ? "Sans ville" : null,
    location.latitude == null || location.longitude == null ? "Sans coordonnées" : null,
  ].filter(Boolean) as string[];
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
  const [viewMode, setViewMode] = useDirectoryView("admin.locations.view");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [segment, setSegment] = useState<"all" | "organizers" | "suggested" | "incomplete">("all");
  const { sortKey, sortDirection, toggleSort } = useSortState<"name" | "city" | "rooms" | "upcoming" | "updated">("name");
  const upcoming = useUpcomingEventStats("location");
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
      // TODO(types): source_capture_mode (text + CHECK) est une union dans Location, les dates y sont non nulles.
      const locationsWithRooms = (locationsData || []).map((location) => ({
        ...location,
        city: Array.isArray(location.city) ? (location.city[0] ?? null) : (location.city ?? null),
        rooms: (roomsData || []).filter((room) => room.location_id === location.id),
      })) as Location[];

      setLocations(locationsWithRooms);
      setFilteredLocations(locationsWithRooms);
    } catch (error) {
      console.error("Erreur lors du chargement des lieux:", error);
    } finally {
      setLoading(false);
    }
  }

  // Filtrer et trier les lieux (recherche, ville, segment, tri)
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = locations.filter((location) => {
      const matchesQuery =
        !query ||
        location.name.toLowerCase().includes(query) ||
        location.address?.toLowerCase().includes(query) ||
        location.city?.label.toLowerCase().includes(query);
      const matchesCity = cityFilter === "all" || location.city?.id === cityFilter;
      const matchesSegment =
        segment === "all" ||
        (segment === "organizers" && Boolean(location.is_organizer)) ||
        (segment === "suggested" && Boolean(location.suggested)) ||
        (segment === "incomplete" && getLocationMissing(location).length > 0);
      return matchesQuery && matchesCity && matchesSegment;
    });
    const direction = sortDirection === "asc" ? 1 : -1;
    next.sort((a, b) => {
      switch (sortKey) {
        case "city":
          return direction * (compareText(a.city?.label, b.city?.label) || compareText(a.name, b.name));
        case "rooms":
          return direction * ((a.rooms?.length || 0) - (b.rooms?.length || 0));
        case "upcoming":
          return (
            direction * ((upcoming?.get(a.id)?.count || 0) - (upcoming?.get(b.id)?.count || 0)) ||
            compareText(a.name, b.name)
          );
        case "updated":
          return direction * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
        default:
          return direction * compareText(a.name, b.name);
      }
    });
    setFilteredLocations(next);
  }, [locations, searchQuery, cityFilter, segment, sortKey, sortDirection, upcoming]);

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

  const hasActiveFilters =
    searchQuery.trim().length > 0 || cityFilter !== "all" || segment !== "all";
  const cityOptions = Array.from(
    new Map(
      locations
        .filter((location) => location.city?.id && location.city?.label)
        .map((location) => [location.city!.id, location.city!.label]),
    ).entries(),
  ).map(([id, label]) => ({ id, label }));
  const organizerLocationsCount = locations.filter((loc) => Boolean(loc.is_organizer)).length;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const incompleteCount = locations.filter((location) => getLocationMissing(location).length > 0).length;

  function renderLocationActions(location: Location) {
    return (
      <RowActionsMenu label={`Actions pour ${location.name}`}>
        <DropdownMenuItem onSelect={() => handleOpenDialog(location)}>
          <Edit2 />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setSelectedLocationForRooms(location);
            setIsRoomsDialogOpen(true);
          }}
        >
          <LayoutGrid />
          Salles
        </DropdownMenuItem>
        {location.is_organizer ? (
          <DropdownMenuItem onSelect={() => router.push(`/admin/organizers/${location.id}/team`)}>
            <Users />
            Équipe
          </DropdownMenuItem>
        ) : null}
        {location.scraping_example_url ? (
          <>
            <DropdownMenuItem onSelect={() => router.push(`/admin/scraping/${location.id}`)}>
              <Code />
              Configurer le scraping
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={location.scraping_example_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Ouvrir l’URL source
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void toggleSuggested(location.id, Boolean(location.suggested))}>
          <Star className={cn(location.suggested && "fill-current")} />
          {location.suggested ? "Retirer des recommandés" : "Recommander"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => deleteLocation(location.id)}
          className="text-destructive focus:text-destructive [&>svg]:!text-destructive"
        >
          <Trash2 />
          Supprimer
        </DropdownMenuItem>
      </RowActionsMenu>
    );
  }

  function renderSuggestedToggle(location: Location) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={(event) => {
          event.stopPropagation();
          void toggleSuggested(location.id, Boolean(location.suggested));
        }}
        className={cn(location.suggested ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground")}
        aria-pressed={Boolean(location.suggested)}
        title={location.suggested ? "Recommandé — cliquer pour retirer" : "Recommander ce lieu"}
        aria-label={location.suggested ? `Retirer ${location.name} des recommandés` : `Recommander ${location.name}`}
      >
        <Star className={cn(location.suggested && "fill-current")} />
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      <DirectoryHeader
        title="Lieux"
        meta={[
          `${locations.length} lieux`,
          `${organizerLocationsCount} lieux-organisateurs`,
          `${suggestedCount}/6 recommandés`,
        ]}
        actions={
          <>
            <SegmentedControl
              aria-label="Affichage"
              size="sm"
              value={viewMode}
              onValueChange={setViewMode}
              items={[
                { value: "list", label: <span className="max-sm:sr-only">Tableau</span>, icon: <ListIcon />, title: "Tableau" },
                { value: "grid", label: <span className="max-sm:sr-only">Grille</span>, icon: <LayoutGrid />, title: "Grille" },
              ]}
            />
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus />
              Nouveau lieu
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <DirectorySegments
          value={segment}
          onValueChange={setSegment}
          items={[
            { value: "all", label: "Tous", count: locations.length },
            { value: "organizers", label: "Lieux-organisateurs", count: organizerLocationsCount },
            { value: "suggested", label: "Recommandés", count: suggestedCount },
            { value: "incomplete", label: "À compléter", count: incompleteCount, attention: true },
          ]}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DirectorySearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher un lieu, une adresse…"
          />
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="sm:w-48" aria-label="Ville">
              <SelectValue placeholder="Toutes les villes" />
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
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setSearchQuery("");
                setCityFilter("all");
                setSegment("all");
              }}
            >
              <RotateCw />
              Réinitialiser
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground sm:ml-auto">
            {filteredLocations.length} résultat{filteredLocations.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {filteredLocations.length === 0 ? (
        <ManagementEmptyState
          icon={<Building2 />}
          title={locations.length === 0 ? "Aucun lieu pour le moment" : "Aucun résultat"}
          description={
            locations.length === 0
              ? "Ajoute un premier lieu pour y rattacher des événements, des salles et une source de collecte."
              : "Aucun lieu ne correspond à ces filtres."
          }
          action={
            locations.length === 0 ? (
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus />
                Nouveau lieu
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === "list" ? (
        <DirectoryTableCard>
          <Table containerClassName="mx-0 px-0" className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Lieu"
                  active={sortKey === "name"}
                  direction={sortDirection}
                  onSort={() => toggleSort("name")}
                  className="pl-4"
                />
                <SortableHead
                  label="À venir"
                  active={sortKey === "upcoming"}
                  direction={sortDirection}
                  onSort={() => toggleSort("upcoming", "desc")}
                  className="hidden w-28 @xl:table-cell"
                />
                <SortableHead
                  label="Ville"
                  active={sortKey === "city"}
                  direction={sortDirection}
                  onSort={() => toggleSort("city")}
                  className="hidden w-40 @2xl:table-cell"
                />
                <SortableHead
                  label="Salles"
                  active={sortKey === "rooms"}
                  direction={sortDirection}
                  onSort={() => toggleSort("rooms", "desc")}
                  className="hidden w-20 @3xl:table-cell"
                />
                <TableHead className="hidden w-40 @4xl:table-cell">Type</TableHead>
                <TableHead className="hidden w-56 @5xl:table-cell">À compléter</TableHead>
                <SortableHead
                  label="Modifié"
                  active={sortKey === "updated"}
                  direction={sortDirection}
                  onSort={() => toggleSort("updated", "desc")}
                  className="hidden w-32 @7xl:table-cell"
                />
                <TableHead className="w-24 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLocations.map((location) => (
                <TableRow
                  key={location.id}
                  className="cursor-pointer"
                  onClick={() => handleOpenDialog(location)}
                >
                  <TableCell className="pl-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar src={location.image_url} name={location.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{location.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {location.address || "Adresse non renseignée"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden @xl:table-cell">
                    <UpcomingEventsCell stats={upcoming?.get(location.id)} loading={!upcoming} />
                  </TableCell>
                  <TableCell className="hidden truncate text-muted-foreground @2xl:table-cell">
                    {location.city?.label || "—"}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground @3xl:table-cell">
                    {location.rooms?.length || 0}
                  </TableCell>
                  <TableCell className="hidden @4xl:table-cell">
                    {location.is_organizer ? (
                      <Badge variant="outline">Lieu-organisateur</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Lieu</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden @5xl:table-cell">
                    <MissingHints items={getLocationMissing(location)} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground @7xl:table-cell">
                    {formatShortDate(location.updated_at)}
                  </TableCell>
                  <TableCell className="pr-4" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      {renderSuggestedToggle(location)}
                      {renderLocationActions(location)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DirectoryTableCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredLocations.map((location) => (
            <div
              key={location.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpenDialog(location)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleOpenDialog(location);
              }}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-xs outline-none transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <div className="relative aspect-[16/9] w-full border-b border-border bg-muted">
                {location.image_url ? (
                  <span
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${location.image_url})` }}
                    aria-hidden
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground/60">
                    {getInitials(location.name)}
                  </span>
                )}
                {location.suggested ? (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/90 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur">
                    <Star className="h-3 w-3 fill-current" />
                    Recommandé
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{location.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[location.city?.label, location.is_organizer ? "Lieu-organisateur" : null]
                        .filter(Boolean)
                        .join(" · ") || "Ville non renseignée"}
                    </p>
                  </div>
                  <div onClick={(event) => event.stopPropagation()} className="-mr-1 -mt-1">
                    {renderLocationActions(location)}
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {location.short_description?.trim() || location.address || ""}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <MissingHints items={getLocationMissing(location)} />
                  <span className="shrink-0 tabular-nums">
                    {location.rooms?.length || 0} salle{(location.rooms?.length || 0) > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <LocationDialog
        location={editingLocation}
        open={isDialogOpen}
        onOpenChange={(next) => {
          setIsDialogOpen(next);
          if (!next && openLocationId) router.replace("/admin/locations", { scroll: false });
        }}
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
  const [activeTab, setActiveTab] = useState("details");
  const [roomsOpen, setRoomsOpen] = useState(false);

  // Chaque ouverture repart sur la fiche.
  useEffect(() => {
    if (open) setActiveTab("details");
  }, [open, location?.id]);
  
  // Recadrage de l'image
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);

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
    setCropSource(null);
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

  function handleImageSelected(dataUrl: string) {
    setOriginalImageSrc(dataUrl);
    setCropSource(dataUrl);
  }

  function handleCropConfirm(blob: Blob) {
    setImageFile(new File([blob], `cropped-${Date.now()}.jpg`, { type: "image/jpeg" }));
    setImagePreview(URL.createObjectURL(blob));
  }

  function handleImageRemove() {
    setImagePreview(null);
    setImageFile(null);
    setOriginalImageSrc(null);
    setFormData((current) => ({ ...current, image_url: "" }));
  }

  function handleImageUrlChange(value: string) {
    setFormData((current) => ({ ...current, image_url: value }));
    const trimmed = value.trim();
    setImagePreview(trimmed || null);
    setOriginalImageSrc(trimmed || null);
  }

  async function handleImageUpload(): Promise<string | null> {
    const currentUrl = formData.image_url?.trim() || "";
    const isStoredLocationImage = (url: string) =>
      /\/storage\/v1\/object\/public\/locations-images\//.test(url);

    async function uploadFromRemoteUrl(url: string): Promise<string | null> {
      try {
        const blob = await fetchRemoteImageBlob(url);
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

      // TODO(types): address est NOT NULL dans les migrations ; ce formulaire envoie null s'il est vide.
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
      } as TablesInsert<"locations">;

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

  const cityLabel = cities.find((city) => city.id === formData.city_id)?.label;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={ENTITY_SHEET_CLASSNAME}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <EntitySheetHeader
            imageSrc={imagePreview}
            name={formData.name || location?.name || "Lieu"}
            title={location ? formData.name.trim() || location.name : "Nouveau lieu"}
            description={
              location
                ? [
                    cityLabel,
                    formData.is_organizer ? "Lieu-organisateur" : "Lieu",
                    formData.suggested ? "Recommandé" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Ajoute un lieu pour y rattacher des événements, des salles et une source."
            }
            onClose={() => onOpenChange(false)}
          >
            {location ? (
              <TabsList variant="line" className="border-b-0">
                <TabsTrigger value="details">Fiche</TabsTrigger>
                <TabsTrigger value="events">Événements</TabsTrigger>
                <TabsTrigger value="rooms">
                  Salles
                  <span className="rounded bg-muted px-1 text-[11px] tabular-nums text-muted-foreground">
                    {location.rooms?.length || 0}
                  </span>
                </TabsTrigger>
              </TabsList>
            ) : null}
          </EntitySheetHeader>

          <EntitySheetBody>
            {location ? (
              <>
                <TabsContent value="events" className="mt-0 pb-8">
                  <EntityRelatedEvents scope={{ kind: "location", id: location.id }} />
                </TabsContent>
                <TabsContent value="rooms" className="mt-0 space-y-3 pb-8">
                  {(location.rooms?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune salle pour ce lieu.</p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {location.rooms?.map((room) => (
                        <div key={room.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                          <span className="font-medium">{room.name}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {room.capacity ? `${room.capacity} places` : "Capacité non renseignée"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => setRoomsOpen(true)}>
                    <LayoutGrid />
                    Gérer les salles
                  </Button>
                  <RoomsManagement
                    locationId={location.id}
                    locationName={location.name}
                    open={roomsOpen}
                    onOpenChange={(next) => {
                      setRoomsOpen(next);
                      if (!next) onSuccess();
                    }}
                  />
                </TabsContent>
              </>
            ) : null}

            <TabsContent value="details" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-6">
                <EntityFormSection title="Identité">
                  <EntityImageField
                    id="location-image"
                    name={formData.name}
                    shape="wide"
                    preview={imagePreview}
                    url={formData.image_url}
                    onUrlChange={handleImageUrlChange}
                    onFileSelected={handleImageSelected}
                    onRecrop={() => setCropSource(originalImageSrc || imagePreview)}
                    onRemove={handleImageRemove}
                    hasLocalFile={Boolean(imageFile)}
                  />
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
                    <Label htmlFor="short_description">Description courte</Label>
                    <Textarea
                      id="short_description"
                      value={formData.short_description}
                      onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                      placeholder="Ambiance, horaires, ce qu’on y trouve…"
                      rows={3}
                    />
                  </div>
                </EntityFormSection>

                <EntityFormSection title="Adresse et accès">
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
                      placeholder="Commencez à taper une adresse…"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                        <SelectTrigger id="city_id">
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
                    <div className="space-y-2">
                      <Label htmlFor="capacity">Capacité</Label>
                      <Input
                        id="capacity"
                        type="number"
                        min={0}
                        value={formData.capacity}
                        onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                        placeholder="Nombre de places"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="latitude">Latitude</Label>
                        <Input
                          id="latitude"
                          type="number"
                          step="any"
                          value={formData.latitude}
                          onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                          placeholder="47.9029"
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
                          placeholder="1.9093"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Remplies automatiquement quand une adresse est choisie dans la liste.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="directions">Comment s’y rendre</Label>
                    <Textarea
                      id="directions"
                      value={formData.directions}
                      onChange={(e) => setFormData({ ...formData, directions: e.target.value })}
                      placeholder="Transports, parking, accès PMR…"
                      rows={3}
                    />
                  </div>
                </EntityFormSection>

                <EntityFormSection title="Liens publics">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        { key: "website_url", label: "Site web", icon: Globe, placeholder: "https://…" },
                        { key: "instagram_url", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/…" },
                        { key: "facebook_url", label: "Facebook", icon: Facebook, placeholder: "https://facebook.com/…" },
                        { key: "tiktok_url", label: "TikTok", icon: Music, placeholder: "https://tiktok.com/@…" },
                      ] as const
                    ).map((field) => {
                      const Icon = field.icon;
                      return (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={field.key} className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {field.label}
                          </Label>
                          <Input
                            id={field.key}
                            type="url"
                            value={formData[field.key]}
                            onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                            placeholder={field.placeholder}
                          />
                        </div>
                      );
                    })}
                  </div>
                </EntityFormSection>

                <EntityFormSection title="Rôle et mise en avant">
                  <EntitySwitchRow
                    id="is_organizer"
                    title="Lieu-organisateur"
                    description="Le lieu peut aussi être choisi comme organisateur d’un événement."
                    checked={formData.is_organizer}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_organizer: checked })}
                  />
                  <EntitySwitchRow
                    id="suggested"
                    title="Lieu recommandé"
                    description="Mis en avant dans l’app, 6 lieux maximum."
                    checked={formData.suggested}
                    onCheckedChange={(checked) => setFormData({ ...formData, suggested: checked })}
                  />
                </EntityFormSection>

                {formData.is_organizer ? (
                  <EntityFormSection
                    title="Collecte d’événements"
                    description="Comment OutLive récupère les événements de ce lieu."
                  >
                    <div className="space-y-2">
                      <Label htmlFor="source_capture_mode">Type de source</Label>
                      <Select
                        value={formData.source_capture_mode}
                        onValueChange={(value: "url" | "image" | "facebook") =>
                          setFormData({ ...formData, source_capture_mode: value })
                        }
                      >
                        <SelectTrigger id="source_capture_mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">Page web (URL)</SelectItem>
                          <SelectItem value="image">Photo / affiche</SelectItem>
                          <SelectItem value="facebook">Facebook</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Détermine le mode d’import proposé pour cette source dans la collecte.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="scraping_example_url">URL d’exemple pour le scraping</Label>
                        {location && formData.scraping_example_url ? (
                          <Link
                            href={`/admin/scraping/${location.id}`}
                            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            Configurer
                          </Link>
                        ) : null}
                      </div>
                      <Input
                        id="scraping_example_url"
                        type="url"
                        value={formData.scraping_example_url}
                        onChange={(e) => setFormData({ ...formData, scraping_example_url: e.target.value })}
                        placeholder="https://…/agenda"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="facebook_page_id">ID de la page Facebook</Label>
                      <Input
                        id="facebook_page_id"
                        value={formData.facebook_page_id}
                        onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
                        placeholder="Ex. 123456789012345"
                      />
                      <p className="text-xs text-muted-foreground">
                        Nécessaire pour importer les événements depuis Facebook.
                      </p>
                    </div>
                  </EntityFormSection>
                ) : null}

                <EntitySheetFooter
                  onCancel={() => onOpenChange(false)}
                  submitLabel={location ? "Enregistrer" : "Créer le lieu"}
                  busy={uploading}
                />
              </form>
            </TabsContent>
          </EntitySheetBody>
        </Tabs>

        <ImageCropDialog
          imageSrc={cropSource}
          onOpenChange={(next) => {
            if (!next) setCropSource(null);
          }}
          defaultAspect={3 / 2}
          onConfirm={handleCropConfirm}
        />
        <AlertDialogComponent />
      </SheetContent>
    </Sheet>
  );
}
