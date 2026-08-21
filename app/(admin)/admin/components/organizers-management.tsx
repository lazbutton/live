"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Edit2, Trash2, ExternalLink, Code, Facebook,
  Globe, Instagram, X, Save, Users, RotateCw, Music, ChevronLeft, UserPlus, UserMinus, LayoutGrid, List as ListIcon, MoreHorizontal, Link2
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { compressImage } from "@/lib/image-compression";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { FacebookEventsImporter } from "./facebook-events-importer";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import {
  ManagementEmptyState,
  ManagementHero,
  ManagementPill,
  ManagementSectionLabel,
  ManagementStat,
  ManagementStatGrid,
  ManagementToolbar,
} from "./management-page-primitives";

export interface Organizer {
  id: string;
  name: string;
  logo_url: string | null;
  short_description: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  facebook_page_id: string | null;
  website_url: string | null;
  scraping_example_url: string | null;
  source_capture_mode: "url" | "image" | "facebook";
  created_at: string;
  updated_at: string;
  type?: "organizer" | "location";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getCaptureModeLabel(mode: Organizer["source_capture_mode"]) {
  if (mode === "image") return "Capture image";
  if (mode === "facebook") return "Capture Facebook";
  return "Capture URL";
}

export function OrganizersManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openOrganizerId = searchParams?.get("open");
  const didAutoOpenRef = useRef(false);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [filteredOrganizers, setFilteredOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<Organizer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [typeFilter, setTypeFilter] = useState<"all" | "organizer" | "location">("all");
  const [networkFilter, setNetworkFilter] = useState<"all" | "with_links" | "without_links">("all");
  const [scrapingFilter, setScrapingFilter] = useState<"all" | "with_scraping" | "without_scraping">("all");
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

  const handleOpenDialog = useCallback((organizer?: Organizer) => {
    if (organizer?.type === "location") {
      router.push(`/admin/locations?open=${organizer.id}`);
      return;
    }
    setEditingOrganizer(organizer || null);
    setIsDialogOpen(true);
  }, [router]);

  useEffect(() => {
    loadOrganizers();
  }, []);

  useEffect(() => {
    const importParam = searchParams?.get("import");
    if (importParam === "1") {
      setIsImporterOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!openOrganizerId) return;
    if (didAutoOpenRef.current) return;
    if (loading) return;

    const organizerToOpen = organizers.find((item) => item.id === openOrganizerId);
    if (!organizerToOpen) return;

    didAutoOpenRef.current = true;
    handleOpenDialog(organizerToOpen);
  }, [openOrganizerId, loading, organizers, handleOpenDialog]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = organizers.filter((org) => {
      const matchesQuery =
        !query ||
        org.name.toLowerCase().includes(query) ||
        org.short_description?.toLowerCase().includes(query);
      const matchesType = typeFilter === "all" || org.type === typeFilter;
      const hasLinks = Boolean(
        org.website_url || org.instagram_url || org.facebook_url || org.tiktok_url,
      );
      const matchesLinks =
        networkFilter === "all" ||
        (networkFilter === "with_links" ? hasLinks : !hasLinks);
      const hasScraping = Boolean(org.scraping_example_url);
      const matchesScraping =
        scrapingFilter === "all" ||
        (scrapingFilter === "with_scraping" ? hasScraping : !hasScraping);
      return matchesQuery && matchesType && matchesLinks && matchesScraping;
    });
    setFilteredOrganizers(next);
  }, [organizers, searchQuery, typeFilter, networkFilter, scrapingFilter]);

  async function loadOrganizers() {
    try {
      const { data: organizersData, error: organizersError } = await supabase
        .from("organizers")
        .select("*")
        .order("name", { ascending: true });

      if (organizersError) throw organizersError;

      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name, image_url, instagram_url, facebook_url, tiktok_url, facebook_page_id, website_url, scraping_example_url, source_capture_mode, created_at, updated_at")
        .eq("is_organizer", true)
        .order("name", { ascending: true });

      if (locationsError) throw locationsError;

      const allOrganizers: Organizer[] = [
        ...(organizersData || []).map((org) => ({ ...org, type: "organizer" as const })),
        ...(locationsData || []).map((loc) => ({
          id: loc.id,
          name: loc.name,
          logo_url: loc.image_url,
          short_description: null,
          instagram_url: loc.instagram_url,
          facebook_url: loc.facebook_url,
          tiktok_url: loc.tiktok_url || null,
          facebook_page_id: loc.facebook_page_id,
          website_url: loc.website_url || null,
          scraping_example_url: loc.scraping_example_url || null,
          source_capture_mode: loc.source_capture_mode || "url",
          created_at: loc.created_at,
          updated_at: loc.updated_at,
          type: "location" as const,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name));

      setOrganizers(allOrganizers);
      setFilteredOrganizers(allOrganizers);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrganizer(id: string) {
    const organizer = organizers.find((o) => o.id === id);
    const organizerName =
      organizer?.type === "location" ? "ce lieu-organisateur" : "cet organisateur";

    showConfirm({
      title: "Supprimer l'organisateur",
      description: `Supprimer ${organizerName} ?`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          if (organizer?.type === "location") {
            // Pour un lieu-organisateur, on retire uniquement le statut organisateur.
            const { error } = await supabase
              .from("locations")
              .update({ is_organizer: false })
              .eq("id", id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("organizers")
              .delete()
              .eq("id", id);
            if (error) throw error;
          }

          await loadOrganizers();
        } catch (error) {
          console.error("Erreur:", error);
          showAlert({
            title: "Erreur",
            description: "Erreur lors de la suppression",
            confirmText: "OK",
          });
        }
      },
    });
  }

  function getOrganizerLinkCount(organizer: Organizer) {
    return [
      organizer.website_url,
      organizer.instagram_url,
      organizer.facebook_url,
      organizer.tiktok_url,
    ].filter(Boolean).length;
  }

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    typeFilter !== "all" ||
    networkFilter !== "all" ||
    scrapingFilter !== "all";
  const organizersCount = organizers.filter((item) => item.type === "organizer").length;
  const organizerLocationsCount = organizers.filter((item) => item.type === "location").length;
  const withoutImageCount = organizers.filter((item) => !item.logo_url).length;
  const withScrapingCount = organizers.filter((item) => Boolean(item.scraping_example_url)).length;

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
    <div className="space-y-5">
      <ManagementHero
        icon={<Users className="h-5 w-5" />}
        title="Organisateurs"
        description="Pilotez les organisateurs et lieux-organisateurs depuis une vue claire, plus rapide à filtrer et plus agréable à éditer."
        actions={
          <>
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
            <Button
              onClick={() => setIsImporterOpen(true)}
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
            >
              <Facebook className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Import Facebook</span>
            </Button>
            <Button onClick={() => handleOpenDialog()} size="sm" className="h-9 rounded-xl">
              <Plus className="mr-1.5 h-4 w-4" />
              Nouvel organisateur
            </Button>
          </>
        }
      >
        <ManagementStatGrid>
          <ManagementStat
            label="Résultats visibles"
            value={filteredOrganizers.length}
            hint={`${organizers.length} au total`}
          />
          <ManagementStat
            label="Organisateurs purs"
            value={organizersCount}
            hint="Structures éditées ici"
          />
          <ManagementStat
            label="Lieux-organisateurs"
            value={organizerLocationsCount}
            hint="Basculent vers la page Lieux"
          />
          <ManagementStat
            label="Scraping prêt"
            value={withScrapingCount}
            hint={`${withoutImageCount} sans image`}
          />
        </ManagementStatGrid>
      </ManagementHero>

      <ManagementToolbar>
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.2fr_repeat(3,minmax(0,0.9fr))_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="organizer">Organisateurs</SelectItem>
                <SelectItem value="location">Lieux-organisateurs</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={networkFilter}
              onValueChange={(value) => setNetworkFilter(value as typeof networkFilter)}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Liens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les liens</SelectItem>
                <SelectItem value="with_links">Avec liens</SelectItem>
                <SelectItem value="without_links">Sans liens</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={scrapingFilter}
              onValueChange={(value) => setScrapingFilter(value as typeof scrapingFilter)}
            >
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Scraping" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="with_scraping">Avec scraping</SelectItem>
                <SelectItem value="without_scraping">Sans scraping</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-xl"
              disabled={!hasActiveFilters}
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
                setNetworkFilter("all");
                setScrapingFilter("all");
              }}
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          </div>
          {hasActiveFilters ? (
            <div className="flex flex-wrap gap-2">
              {searchQuery.trim() ? <ManagementPill tone="muted">Recherche: {searchQuery.trim()}</ManagementPill> : null}
              {typeFilter !== "all" ? (
                <ManagementPill tone="muted">
                  {typeFilter === "organizer" ? "Type: organisateurs" : "Type: lieux-organisateurs"}
                </ManagementPill>
              ) : null}
              {networkFilter !== "all" ? (
                <ManagementPill tone="muted">
                  {networkFilter === "with_links" ? "Avec liens" : "Sans liens"}
                </ManagementPill>
              ) : null}
              {scrapingFilter !== "all" ? (
                <ManagementPill tone="muted">
                  {scrapingFilter === "with_scraping" ? "Avec scraping" : "Sans scraping"}
                </ManagementPill>
              ) : null}
            </div>
          ) : null}
        </div>
      </ManagementToolbar>

      {/* Liste / Grille */}
      {filteredOrganizers.length === 0 ? (
        <ManagementEmptyState
          icon={<Users className="h-6 w-6" />}
          title={organizers.length === 0 ? "Aucun organisateur pour le moment" : "Aucun résultat"}
          description={
            organizers.length === 0
              ? "Ajoutez un premier organisateur ou importez-le depuis Facebook pour démarrer plus vite."
              : `Aucun organisateur ne correspond aux filtres actuels${searchQuery.trim() ? ` pour "${searchQuery.trim()}"` : ""}.`
          }
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredOrganizers.map((organizer) => (
            <div
              key={organizer.id}
              onClick={() => handleOpenDialog(organizer)}
              className="group relative flex min-h-[280px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/95 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg cursor-pointer"
            >
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-primary/5 via-primary/0 to-transparent" />
              <div className="relative flex items-start gap-3">
                <Avatar className="h-14 w-14 shrink-0 rounded-2xl border border-border/70 shadow-sm">
                  <AvatarImage src={organizer.logo_url || undefined} alt={organizer.name} />
                  <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
                    {getInitials(organizer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold">{organizer.name}</h3>
                    {organizer.type === "location" && (
                      <Badge variant="outline" className="rounded-full border-border/70 bg-background/80 text-[11px]">
                        Lieu-organisateur
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <ManagementPill tone={organizer.scraping_example_url ? "positive" : "muted"}>
                      {organizer.scraping_example_url ? "Scraping prêt" : "Sans scraping"}
                    </ManagementPill>
                    <ManagementPill tone={organizer.logo_url ? "default" : "warning"}>
                      {organizer.logo_url ? "Image OK" : "Image manquante"}
                    </ManagementPill>
                    <ManagementPill tone="muted">
                      {getOrganizerLinkCount(organizer)} lien{getOrganizerLinkCount(organizer) > 1 ? "s" : ""}
                    </ManagementPill>
                  </div>
                </div>
              </div>

              <div className="mt-4 min-h-[60px]">
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {organizer.short_description?.trim() ||
                    "Aucune description pour le moment. Ouvrez la fiche pour compléter la présence publique, les liens et le scraping."}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <ManagementPill tone="muted">{getCaptureModeLabel(organizer.source_capture_mode)}</ManagementPill>
                {organizer.facebook_page_id ? <ManagementPill tone="muted">Page Facebook liée</ManagementPill> : null}
              </div>

              {(organizer.instagram_url || organizer.facebook_url || organizer.tiktok_url || organizer.website_url) && (
                <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                  {organizer.website_url && (
                    <a
                      href={organizer.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  )}
                  {organizer.instagram_url && (
                    <a
                      href={organizer.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  )}
                  {organizer.facebook_url && (
                    <a
                      href={organizer.facebook_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-border/70 bg-background/80 p-2 hover:bg-accent transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Facebook className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  )}
                  {organizer.tiktok_url && (
                    <a
                      href={organizer.tiktok_url}
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
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl bg-background/80"
                    >
                      <Link
                        href={`/admin/organizers/${organizer.id}/team`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Users className="mr-1.5 h-3.5 w-3.5" />
                        Équipe
                      </Link>
                    </Button>
                    {organizer.scraping_example_url ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl bg-background/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/scraping/${organizer.id}`);
                        }}
                      >
                        <Code className="mr-1.5 h-3.5 w-3.5" />
                        Scraping
                      </Button>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl"
                    title="Supprimer"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteOrganizer(organizer.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
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
                <TableHead>Organisateur</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Signaux</TableHead>
                <TableHead className="hidden xl:table-cell">Liens</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrganizers.map((organizer) => (
                <TableRow
                  key={organizer.id}
                  className="cursor-pointer hover:bg-muted/20"
                  onClick={() => handleOpenDialog(organizer)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-11 w-11 shrink-0 rounded-2xl border border-border/70 shadow-sm">
                        <AvatarImage src={organizer.logo_url || undefined} alt={organizer.name} />
                        <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
                          {getInitials(organizer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">{organizer.name}</div>
                          {organizer.type === "location" && (
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              Lieu-organisateur
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {organizer.short_description?.trim() || "Aucune description"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1.5">
                      <ManagementPill tone={organizer.type === "location" ? "warning" : "default"}>
                        {organizer.type === "location" ? "Lieu-organisateur" : "Organisateur"}
                      </ManagementPill>
                      <ManagementPill tone="muted">
                        {getCaptureModeLabel(organizer.source_capture_mode)}
                      </ManagementPill>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1.5">
                      <ManagementPill tone={organizer.scraping_example_url ? "positive" : "muted"}>
                        {organizer.scraping_example_url ? "Scraping prêt" : "Pas de scraping"}
                      </ManagementPill>
                      <ManagementPill tone={organizer.logo_url ? "default" : "warning"}>
                        {organizer.logo_url ? "Image OK" : "Image manquante"}
                      </ManagementPill>
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="flex items-center gap-2">
                      <ManagementPill tone="muted">
                        <Link2 className="mr-1 h-3.5 w-3.5" />
                        {getOrganizerLinkCount(organizer)} lien{getOrganizerLinkCount(organizer) > 1 ? "s" : ""}
                      </ManagementPill>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" className="rounded-xl">
                        <Link
                          href={`/admin/organizers/${organizer.id}/team`}
                          title="Équipe"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Users className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-xl"
                        title={organizer.scraping_example_url ? "Configuration scraping" : "Aucune URL de scraping"}
                        disabled={!organizer.scraping_example_url}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!organizer.scraping_example_url) return;
                          router.push(`/admin/scraping/${organizer.id}`);
                        }}
                      >
                        <Code className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-xl"
                        title={organizer.type === "location" ? "Ouvrir dans Lieux" : "Modifier"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(organizer);
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
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 rounded-xl">
                          {organizer.scraping_example_url ? (
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <a
                                href={organizer.scraping_example_url}
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
                            onClick={() => deleteOrganizer(organizer.id)}
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
      <AlertDialogComponent />
    </div>
  );
}

export function OrganizerDialog({
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
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();
  const [formData, setFormData] = useState({
    name: "",
    logo_url: "",
    short_description: "",
    instagram_url: "",
    facebook_url: "",
    tiktok_url: "",
    facebook_page_id: "",
    website_url: "",
    scraping_example_url: "",
    source_capture_mode: "url" as "url" | "image" | "facebook",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [organizerUsers, setOrganizerUsers] = useState<Array<{
    id: string;
    user_id: string;
    role: "owner" | "editor" | "viewer";
    created_at: string;
    email?: string;
  }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"owner" | "editor" | "viewer">("owner");
  const [showAddUser, setShowAddUser] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  useEffect(() => {
    if (organizer) {
      setFormData({
        name: organizer.name || "",
        logo_url: organizer.logo_url || "",
        short_description: organizer.short_description || "",
        instagram_url: organizer.instagram_url || "",
        facebook_url: organizer.facebook_url || "",
        tiktok_url: organizer.tiktok_url || "",
        facebook_page_id: organizer.facebook_page_id || "",
        website_url: organizer.website_url || "",
        scraping_example_url: organizer.scraping_example_url || "",
        source_capture_mode: organizer.source_capture_mode || "url",
      });
      setLogoPreview(organizer.logo_url || null);
    } else {
      setFormData({
        name: "",
        logo_url: "",
        short_description: "",
        instagram_url: "",
        facebook_url: "",
        tiktok_url: "",
        facebook_page_id: "",
        website_url: "",
        scraping_example_url: "",
        source_capture_mode: "url",
      });
      setLogoPreview(null);
    }
    setLogoFile(null);
    if (organizer) {
      loadOrganizerUsers(organizer.id);
    } else {
      setOrganizerUsers([]);
    }
    setShowAddUser(false);
    setNewUserEmail("");
    setNewUserRole("owner");
  }, [organizer, open]);

  async function loadOrganizerUsers(organizerId: string) {
    setLoadingUsers(true);
    try {
      const response = await fetch(`/api/admin/organizers/${organizerId}/users`);
      if (!response.ok) {
        console.error("Erreur lors du chargement des utilisateurs");
        return;
      }
      const { users } = await response.json();
      setOrganizerUsers(users || []);
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function sendInvitation() {
    if (!organizer || !newUserEmail.trim() || !newUserEmail.includes("@")) return;

    setSendingInvite(true);
    try {
      const response = await fetch(`/api/admin/organizers/${organizer.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail.trim().toLowerCase(),
          role: newUserRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showAlert({
          title: "Erreur",
          description: data.error || "Impossible d'envoyer l'invitation",
          confirmText: "OK",
        });
        return;
      }

      showAlert({
        title: "Invitation envoyée",
        description: `Invitation envoyée à ${newUserEmail} !\n\nL'utilisateur recevra un email avec un lien pour créer son compte et rejoindre l'organisateur.`,
        confirmText: "OK",
      });
      await loadOrganizerUsers(organizer.id);
      setNewUserEmail("");
      setShowAddUser(false);
    } catch (error) {
      console.error("Erreur:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors de l'envoi de l'invitation",
        confirmText: "OK",
      });
    } finally {
      setSendingInvite(false);
    }
  }

  async function removeUserFromOrganizer(userId: string) {
    if (!organizer) return;

    showConfirm({
      title: "Retirer l'utilisateur",
      description: "Êtes-vous sûr de vouloir retirer cet utilisateur ?",
      confirmText: "Retirer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        setLoadingUsers(true);
        try {
          const response = await fetch(
            `/api/admin/organizers/${organizer.id}/users?user_id=${userId}`,
            { method: "DELETE" }
          );

          if (!response.ok) {
            showAlert({
              title: "Erreur",
              description: "Erreur lors de la suppression",
              confirmText: "OK",
            });
            return;
          }

          await loadOrganizerUsers(organizer.id);
        } catch (error) {
          console.error("Erreur:", error);
          showAlert({
            title: "Erreur",
            description: "Erreur lors de la suppression",
            confirmText: "OK",
          });
        } finally {
          setLoadingUsers(false);
        }
      },
    });
  }

  async function updateUserRole(userId: string, newRole: "owner" | "editor" | "viewer") {
    if (!organizer) return;

    setLoadingUsers(true);
    try {
      const response = await fetch(`/api/admin/organizers/${organizer.id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: userId, // Dans ce cas, c'est l'ID utilisateur
          role: newRole,
        }),
      });

      if (!response.ok) {
        showAlert({
          title: "Erreur",
          description: "Erreur lors de la mise à jour du rôle",
          confirmText: "OK",
        });
        return;
      }

      await loadOrganizerUsers(organizer.id);
    } catch (error) {
      console.error("Erreur:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors de la mise à jour",
        confirmText: "OK",
      });
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
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
        ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error("Erreur lors de la création du blob"));
          else resolve(blob);
        }, "image/jpeg", 0.9);
      };
      image.onerror = () => reject(new Error("Erreur lors du chargement de l'image"));
    });
  }

  async function handleCropComplete() {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const croppedImageBlob = await createCroppedImage(cropImageSrc, croppedAreaPixels);
      const croppedImageFile = new File([croppedImageBlob], `cropped-${Date.now()}.jpg`, { type: "image/jpeg" });
      setLogoFile(croppedImageFile);
      setLogoPreview(URL.createObjectURL(croppedImageBlob));
      setShowCropper(false);
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (error) {
      console.error("Erreur lors du cropping:", error);
      showAlert({
        title: "Rognage impossible",
        description: "Erreur lors du rognage de l'image",
        confirmText: "OK",
      });
    }
  }

  async function handleImageUpload(): Promise<string | null> {
    const currentUrl = formData.logo_url?.trim() || "";

    const isStoredOrganizerImage = (url: string) =>
      /\/storage\/v1\/object\/public\/organizers-images\//.test(url);

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
        const remoteFile = new File([blob], `organizer-remote-${Date.now()}.${ext}`, {
          type: contentType,
        });
        const fileToUpload = await compressImage(remoteFile, 2);
        const fileExt = fileToUpload.name.split(".").pop() || ext;
        const fileName = `organizers/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { data, error } = await supabase.storage
          .from("organizers-images")
          .upload(fileName, fileToUpload, { cacheControl: "3600", upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from("organizers-images").getPublicUrl(data.path);
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

    if (!logoFile) {
      if (!currentUrl) return "";
      if (isStoredOrganizerImage(currentUrl)) return currentUrl;
      return await uploadFromRemoteUrl(currentUrl);
    }

    try {
      setUploading(true);
      const fileToUpload = await compressImage(logoFile, 2);
      const fileExt = fileToUpload.name.split(".").pop() || "jpg";
      const fileName = `organizers/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from("organizers-images")
        .upload(fileName, fileToUpload, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("organizers-images").getPublicUrl(data.path);
      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      showAlert({
        title: "Upload impossible",
        description:
          "Erreur lors de l'upload: " + (error.message || "Erreur inconnue"),
        confirmText: "OK",
      });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setUploading(true);
      let finalLogoUrl = formData.logo_url;
      if (logoFile || formData.logo_url.trim()) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl !== null) finalLogoUrl = uploadedUrl;
        else { setUploading(false); return; }
      }
      const submitData = {
        name: formData.name,
        logo_url: finalLogoUrl || null,
        short_description: formData.short_description || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        tiktok_url: formData.tiktok_url || null,
        facebook_page_id: formData.facebook_page_id || null,
        website_url: formData.website_url || null,
        scraping_example_url: formData.scraping_example_url || null,
        source_capture_mode: formData.source_capture_mode,
      };
      if (organizer) {
        const { error } = await supabase.from("organizers").update(submitData).eq("id", organizer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("organizers").insert([submitData]);
        if (error) throw error;
      }
      if (organizer) {
        await removeReplacedStorageObject(supabase, {
          bucket: "organizers-images",
          previousUrl: organizer.logo_url,
          nextUrl: finalLogoUrl,
          references: [
            { table: "organizers", column: "logo_url" },
            { table: "artists", column: "image_url" },
          ],
        });
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur:", error);
      showAlert({
        title: "Sauvegarde impossible",
        description: "Erreur lors de la sauvegarde",
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
              {organizer ? "Modifier l'organisateur" : "Nouvel organisateur"}
            </SheetTitle>
          </div>
          <SheetDescription className="mt-2">
            {organizer ? "Modifiez les informations de l'organisateur" : "Ajoutez un nouvel organisateur"}
          </SheetDescription>
        </SheetHeader>
        {showCropper ? (
          <div className="space-y-4">
            <div className="relative h-[400px] bg-muted rounded-lg">
              <Cropper
                image={cropImageSrc || ""}
                crop={crop}
                zoom={zoom}
                aspect={3 / 2}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCropper(false)}>
                Annuler
              </Button>
              <Button type="button" onClick={handleCropComplete}>
                Valider
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pb-24">
            <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-14 w-14 shrink-0 rounded-2xl border border-border/70 shadow-sm">
                  <AvatarImage src={logoPreview || undefined} alt={formData.name || "Organisateur"} />
                  <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-semibold">
                    {getInitials(formData.name || organizer?.name || "NA")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <div className="truncate text-base font-semibold">
                      {formData.name.trim() || "Nouvel organisateur"}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Préparez la fiche publique, les liens et la configuration source depuis un seul écran.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <ManagementPill tone={logoPreview ? "default" : "warning"}>
                      {logoPreview ? "Logo prêt" : "Logo manquant"}
                    </ManagementPill>
                    <ManagementPill tone={formData.scraping_example_url ? "positive" : "muted"}>
                      {formData.scraping_example_url ? "Scraping prêt" : "Scraping à configurer"}
                    </ManagementPill>
                    <ManagementPill tone="muted">
                      {getCaptureModeLabel(formData.source_capture_mode)}
                    </ManagementPill>
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
              <Label htmlFor="short_description">Description</Label>
              <Textarea
                id="short_description"
                value={formData.short_description}
                onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                rows={3}
              />
            </div>
            <ManagementSectionLabel>Réseaux & liens publics</ManagementSectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="instagram_url">Instagram</Label>
                <Input
                  id="instagram_url"
                  type="url"
                  value={formData.instagram_url}
                  onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook_url">Facebook</Label>
                <Input
                  id="facebook_url"
                  type="url"
                  value={formData.facebook_url}
                  onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tiktok_url">TikTok</Label>
              <Input
                id="tiktok_url"
                type="url"
                value={formData.tiktok_url}
                onChange={(e) => setFormData({ ...formData, tiktok_url: e.target.value })}
                placeholder="https://tiktok.com/@..."
              />
            </div>
            <ManagementSectionLabel>Source & scraping</ManagementSectionLabel>
            <div className="space-y-2">
              <Label htmlFor="facebook_page_id">ID Page Facebook</Label>
              <Input
                id="facebook_page_id"
                value={formData.facebook_page_id}
                onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website_url">Site web</Label>
              <Input
                id="website_url"
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scraping_example_url">URL d'exemple scraping</Label>
              <Input
                id="scraping_example_url"
                type="url"
                value={formData.scraping_example_url}
                onChange={(e) => setFormData({ ...formData, scraping_example_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source_capture_mode">Type de lien pour la source</Label>
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
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="image">Photo / image</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ce choix pilote le mode d'entree de la source synchronisee dans l'intake.
              </p>
            </div>
            <ManagementSectionLabel>Média</ManagementSectionLabel>
            <div className="space-y-2">
              <Label>Logo</Label>
              {logoPreview && (
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1"
                    onClick={() => {
                      setLogoPreview(null);
                      setLogoFile(null);
                      setFormData({ ...formData, logo_url: "" });
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Input type="file" accept="image/*" onChange={handleLogoChange} />
              <Label htmlFor="logo_url" className="text-xs text-muted-foreground">
                Ou entrez une URL
              </Label>
              <Input
                id="logo_url"
                type="url"
                value={formData.logo_url}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, logo_url: value });
                  if (value) {
                    setLogoPreview(value);
                    setLogoFile(null);
                  }
                }}
                placeholder="https://example.com/logo.jpg"
                disabled={!!logoFile}
              />
            </div>

            {/* Section Gestion des utilisateurs (seulement si on modifie un organisateur existant) */}
            {organizer && (
              <>
                <Separator />
                <ManagementSectionLabel>Équipe</ManagementSectionLabel>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Utilisateurs associés</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link
                          href={`/admin/organizers/${organizer.id}/team`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Ouvrir l'espace équipe
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddUser(!showAddUser)}
                        disabled={loadingUsers}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Ajouter un utilisateur
                      </Button>
                    </div>
                  </div>

                  {showAddUser && (
                    <div className="p-4 border rounded-lg space-y-3 bg-muted/50">
                      <div className="space-y-2">
                        <Label htmlFor="new_user_email">Email de l'utilisateur</Label>
                        <Input
                          id="new_user_email"
                          type="email"
                          placeholder="utilisateur@example.com"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          disabled={loadingUsers || sendingInvite}
                        />
                        <p className="text-xs text-muted-foreground">
                          Un email d'invitation sera envoyé à cette adresse
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new_user_role">Rôle</Label>
                        <Select
                          value={newUserRole}
                          onValueChange={(value: "owner" | "editor" | "viewer") => setNewUserRole(value)}
                          disabled={loadingUsers}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner (Propriétaire)</SelectItem>
                            <SelectItem value="editor">Editor (Éditeur)</SelectItem>
                            <SelectItem value="viewer">Viewer (Visualiseur)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={sendInvitation}
                          disabled={loadingUsers || sendingInvite || !newUserEmail.trim() || !newUserEmail.includes("@")}
                          size="sm"
                        >
                          {sendingInvite ? (
                            <>
                              <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                              Envoi...
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Envoyer l'invitation
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowAddUser(false);
                            setNewUserEmail("");
                          }}
                          disabled={loadingUsers}
                          size="sm"
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}

                  {loadingUsers ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      Chargement...
                    </div>
                  ) : organizerUsers.length === 0 ? (
                    <div className="text-center py-4 text-sm text-muted-foreground border rounded-lg">
                      Aucun utilisateur associé
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {organizerUsers.map((userOrg) => (
                        <div
                          key={userOrg.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {userOrg.email ? (
                                <span className="text-sm font-medium truncate max-w-[200px]">
                                  {userOrg.email}
                                </span>
                              ) : (
                                <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-[200px]">
                                  {userOrg.user_id.substring(0, 8)}...
                                </code>
                              )}
                              <Badge
                                variant={
                                  userOrg.role === "owner"
                                    ? "default"
                                    : userOrg.role === "editor"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {userOrg.role === "owner"
                                  ? "Propriétaire"
                                  : userOrg.role === "editor"
                                  ? "Éditeur"
                                  : "Visualiseur"}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={userOrg.role}
                              onValueChange={(value: "owner" | "editor" | "viewer") =>
                                updateUserRole(userOrg.user_id, value)
                              }
                              disabled={loadingUsers}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeUserFromOrganizer(userOrg.user_id)}
                              disabled={loadingUsers}
                              className="text-destructive hover:text-destructive"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            <div className="sticky bottom-0 z-10 -mx-6 mt-6 border-t border-border/70 bg-background/95 px-6 py-3 backdrop-blur">
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? <RotateCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {organizer ? "Enregistrer" : "Créer"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </SheetContent>
      <AlertDialogComponent />
    </Sheet>
  );
}
