"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Code,
  Edit2,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Mail,
  MapPin,
  Music,
  Plus,
  RotateCw,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { fetchRemoteImageBlob } from "@/lib/events/remote-image";
import { compressImage } from "@/lib/image-compression";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { FacebookEventsImporter } from "./facebook-events-importer";
import { ManagementEmptyState } from "./management-page-primitives";
import {
  DirectoryHeader,
  DirectorySearch,
  DirectorySegments,
  DirectoryTableCard,
  EntityAvatar,
  EntityLinkIcons,
  MissingHints,
  RowActionsMenu,
  SortableHead,
  UpcomingEventsCell,
  compareText,
  formatShortDate,
  useDirectoryView,
  useSortState,
  type EntityLink,
} from "./directory/directory";
import { useUpcomingEventStats } from "./directory/use-upcoming-events";
import {
  ENTITY_SHEET_CLASSNAME,
  EntityFormSection,
  EntityImageField,
  EntitySheetBody,
  EntitySheetFooter,
  EntitySheetHeader,
} from "./directory/entity-sheet";
import { EntityRelatedEvents } from "./directory/entity-related-events";
import { ImageCropDialog } from "./directory/image-crop-dialog";

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

type OrganizerSegment = "all" | "organizer" | "location" | "incomplete";
type SourceFilter = "all" | "scraping" | "facebook" | "none";

function getOrganizerLinks(organizer: Organizer): EntityLink[] {
  return [
    organizer.website_url ? { key: "website", label: "Site web", href: organizer.website_url, icon: Globe } : null,
    organizer.instagram_url ? { key: "instagram", label: "Instagram", href: organizer.instagram_url, icon: Instagram } : null,
    organizer.facebook_url ? { key: "facebook", label: "Facebook", href: organizer.facebook_url, icon: Facebook } : null,
    organizer.tiktok_url ? { key: "tiktok", label: "TikTok", href: organizer.tiktok_url, icon: Music } : null,
  ].filter(Boolean) as EntityLink[];
}

/** Informations manquantes d'une fiche (affichées dans « À compléter »). */
function getOrganizerMissing(organizer: Organizer) {
  return [
    !organizer.logo_url ? "Sans logo" : null,
    !organizer.short_description?.trim() ? "Sans description" : null,
    getOrganizerLinks(organizer).length === 0 ? "Sans liens" : null,
  ].filter(Boolean) as string[];
}

function getTypeLabel(organizer: Organizer) {
  return organizer.type === "location" ? "Lieu-organisateur" : "Organisateur";
}

/** Sources de collecte configurées (scraping, page Facebook). */
function OrganizerSources({ organizer }: { organizer: Organizer }) {
  const sources = [
    organizer.scraping_example_url ? "Scraping" : null,
    organizer.facebook_page_id ? "Page Facebook" : null,
  ].filter(Boolean) as string[];
  if (sources.length === 0) {
    return <span className="text-xs text-muted-foreground/70">Aucune source</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs">
      <span className="size-1.5 shrink-0 rounded-full bg-success" />
      <span className="truncate">{sources.join(" · ")}</span>
    </span>
  );
}

export function OrganizersManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openOrganizerId = searchParams?.get("open");
  const didAutoOpenRef = useRef(false);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<Organizer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useDirectoryView("admin.organizers.view");
  const [segment, setSegment] = useState<OrganizerSegment>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const { sortKey, sortDirection, toggleSort } = useSortState<"name" | "upcoming" | "updated">("name");
  const upcoming = useUpcomingEventStats("organizer");
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

  const handleOpenDialog = useCallback(
    (organizer?: Organizer) => {
      // Les lieux-organisateurs se modifient depuis la page Lieux.
      if (organizer?.type === "location") {
        router.push(`/admin/locations?open=${organizer.id}`);
        return;
      }
      setEditingOrganizer(organizer || null);
      setIsDialogOpen(true);
    },
    [router],
  );

  const loadOrganizers = useCallback(async () => {
    try {
      const [{ data: organizersData, error: organizersError }, { data: locationsData, error: locationsError }] =
        await Promise.all([
          supabase.from("organizers").select("*").order("name", { ascending: true }),
          supabase
            .from("locations")
            .select(
              "id, name, image_url, short_description, instagram_url, facebook_url, tiktok_url, facebook_page_id, website_url, scraping_example_url, source_capture_mode, created_at, updated_at",
            )
            .eq("is_organizer", true)
            .order("name", { ascending: true }),
        ]);

      if (organizersError) throw organizersError;
      if (locationsError) throw locationsError;

      const allOrganizers: Organizer[] = [
        ...(organizersData || []).map((org) => ({ ...org, type: "organizer" as const })),
        ...(locationsData || []).map((loc) => ({
          id: loc.id,
          name: loc.name,
          logo_url: loc.image_url,
          short_description: loc.short_description || null,
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
      ];

      setOrganizers(allOrganizers);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrganizers();
  }, [loadOrganizers]);

  useEffect(() => {
    if (searchParams?.get("import") === "1") {
      setIsImporterOpen(true);
    }
  }, [searchParams]);

  // Ouvrir automatiquement une fiche depuis /admin/organizers?open=<id>
  useEffect(() => {
    if (!openOrganizerId || didAutoOpenRef.current || loading) return;
    const organizerToOpen = organizers.find((item) => item.id === openOrganizerId);
    if (!organizerToOpen) return;
    didAutoOpenRef.current = true;
    handleOpenDialog(organizerToOpen);
  }, [openOrganizerId, loading, organizers, handleOpenDialog]);

  const filteredOrganizers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = organizers.filter((organizer) => {
      const matchesQuery =
        !query ||
        organizer.name.toLowerCase().includes(query) ||
        organizer.short_description?.toLowerCase().includes(query);
      const matchesSegment =
        segment === "all" ||
        (segment === "organizer" && organizer.type === "organizer") ||
        (segment === "location" && organizer.type === "location") ||
        (segment === "incomplete" && getOrganizerMissing(organizer).length > 0);
      const hasScraping = Boolean(organizer.scraping_example_url);
      const hasFacebook = Boolean(organizer.facebook_page_id);
      const matchesSource =
        sourceFilter === "all" ||
        (sourceFilter === "scraping" && hasScraping) ||
        (sourceFilter === "facebook" && hasFacebook) ||
        (sourceFilter === "none" && !hasScraping && !hasFacebook);
      return matchesQuery && matchesSegment && matchesSource;
    });
    const direction = sortDirection === "asc" ? 1 : -1;
    return next.sort((a, b) => {
      if (sortKey === "updated") {
        return direction * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      }
      if (sortKey === "upcoming") {
        return (
          direction * ((upcoming?.get(a.id)?.count || 0) - (upcoming?.get(b.id)?.count || 0)) ||
          compareText(a.name, b.name)
        );
      }
      return direction * compareText(a.name, b.name);
    });
  }, [organizers, searchQuery, segment, sourceFilter, sortKey, sortDirection, upcoming]);

  function deleteOrganizer(organizer: Organizer) {
    const isLocation = organizer.type === "location";
    showConfirm({
      title: isLocation ? "Retirer des organisateurs" : "Supprimer l'organisateur",
      description: isLocation
        ? `« ${organizer.name} » restera dans les lieux mais ne sera plus proposé comme organisateur.`
        : `« ${organizer.name} » sera définitivement supprimé.`,
      confirmText: isLocation ? "Retirer" : "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          if (isLocation) {
            // Pour un lieu-organisateur, on retire uniquement le statut organisateur.
            const { error } = await supabase
              .from("locations")
              .update({ is_organizer: false })
              .eq("id", organizer.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("organizers").delete().eq("id", organizer.id);
            if (error) throw error;
          }
          toast({
            title: isLocation ? "Lieu retiré des organisateurs" : "Organisateur supprimé",
            variant: "success",
          });
          await loadOrganizers();
        } catch (error) {
          console.error("Erreur:", error);
          showAlert({
            title: "Suppression impossible",
            description: "Erreur lors de la suppression",
            confirmText: "OK",
          });
        }
      },
    });
  }

  const organizersCount = organizers.filter((item) => item.type === "organizer").length;
  const organizerLocationsCount = organizers.filter((item) => item.type === "location").length;
  const withScrapingCount = organizers.filter((item) => Boolean(item.scraping_example_url)).length;
  const incompleteCount = organizers.filter((item) => getOrganizerMissing(item).length > 0).length;
  const hasActiveFilters = searchQuery.trim().length > 0 || segment !== "all" || sourceFilter !== "all";

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-44 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
        <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  function renderOrganizerActions(organizer: Organizer) {
    const isLocation = organizer.type === "location";
    return (
      <RowActionsMenu label={`Actions pour ${organizer.name}`}>
        <DropdownMenuItem onSelect={() => handleOpenDialog(organizer)}>
          {isLocation ? <MapPin /> : <Edit2 />}
          {isLocation ? "Ouvrir dans Lieux" : "Modifier"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`/admin/organizers/${organizer.id}/team`)}>
          <Users />
          Équipe
        </DropdownMenuItem>
        {organizer.scraping_example_url ? (
          <>
            <DropdownMenuItem onSelect={() => router.push(`/admin/scraping/${organizer.id}`)}>
              <Code />
              Configurer le scraping
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={organizer.scraping_example_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Ouvrir l’URL source
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => deleteOrganizer(organizer)}
          className="text-destructive focus:text-destructive [&>svg]:!text-destructive"
        >
          <Trash2 />
          {isLocation ? "Retirer des organisateurs" : "Supprimer"}
        </DropdownMenuItem>
      </RowActionsMenu>
    );
  }

  return (
    <div className="space-y-5">
      <DirectoryHeader
        title="Organisateurs"
        meta={[
          `${organizersCount} organisateur${organizersCount > 1 ? "s" : ""}`,
          `${organizerLocationsCount} lieux-organisateurs`,
          `${withScrapingCount} avec scraping`,
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImporterOpen(true)}
              aria-label="Importer depuis Facebook"
            >
              <Facebook />
              <span className="max-sm:hidden">Import Facebook</span>
            </Button>
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus />
              Nouvel organisateur
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <DirectorySegments
          value={segment}
          onValueChange={setSegment}
          items={[
            { value: "all", label: "Tous", count: organizers.length },
            { value: "organizer", label: "Organisateurs", count: organizersCount },
            { value: "location", label: "Lieux-organisateurs", count: organizerLocationsCount },
            { value: "incomplete", label: "À compléter", count: incompleteCount, attention: true },
          ]}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DirectorySearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher un organisateur…"
          />
          <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as SourceFilter)}>
            <SelectTrigger className="sm:w-52" aria-label="Source de collecte">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sources</SelectItem>
              <SelectItem value="scraping">Scraping configuré</SelectItem>
              <SelectItem value="facebook">Page Facebook liée</SelectItem>
              <SelectItem value="none">Sans source</SelectItem>
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
                setSegment("all");
                setSourceFilter("all");
              }}
            >
              <RotateCw />
              Réinitialiser
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground sm:ml-auto">
            {filteredOrganizers.length} résultat{filteredOrganizers.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {filteredOrganizers.length === 0 ? (
        <ManagementEmptyState
          icon={<Users />}
          title={organizers.length === 0 ? "Aucun organisateur pour le moment" : "Aucun résultat"}
          description={
            organizers.length === 0
              ? "Ajoute un premier organisateur ou importe-le depuis Facebook pour démarrer plus vite."
              : "Aucun organisateur ne correspond à ces filtres."
          }
          action={
            organizers.length === 0 ? (
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus />
                Nouvel organisateur
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
                  label="Organisateur"
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
                <TableHead className="hidden w-44 @2xl:table-cell">Source</TableHead>
                <TableHead className="hidden w-36 @3xl:table-cell">Liens</TableHead>
                <TableHead className="hidden w-56 @5xl:table-cell">À compléter</TableHead>
                <SortableHead
                  label="Modifié"
                  active={sortKey === "updated"}
                  direction={sortDirection}
                  onSort={() => toggleSort("updated", "desc")}
                  className="hidden w-32 @6xl:table-cell"
                />
                <TableHead className="w-14 pr-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrganizers.map((organizer) => (
                <TableRow
                  key={organizer.id}
                  className="cursor-pointer"
                  onClick={() => handleOpenDialog(organizer)}
                >
                  <TableCell className="pl-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar src={organizer.logo_url} name={organizer.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{organizer.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[getTypeLabel(organizer), organizer.short_description?.trim()]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden @xl:table-cell">
                    <UpcomingEventsCell stats={upcoming?.get(organizer.id)} loading={!upcoming} />
                  </TableCell>
                  <TableCell className="hidden @2xl:table-cell">
                    <OrganizerSources organizer={organizer} />
                  </TableCell>
                  <TableCell className="hidden @3xl:table-cell">
                    <EntityLinkIcons links={getOrganizerLinks(organizer)} />
                  </TableCell>
                  <TableCell className="hidden @5xl:table-cell">
                    <MissingHints items={getOrganizerMissing(organizer)} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground @6xl:table-cell">
                    {formatShortDate(organizer.updated_at)}
                  </TableCell>
                  <TableCell className="pr-4" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end">{renderOrganizerActions(organizer)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DirectoryTableCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredOrganizers.map((organizer) => (
            <div
              key={organizer.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpenDialog(organizer)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleOpenDialog(organizer);
              }}
              className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-xs outline-none transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <div className="flex items-start gap-3">
                <EntityAvatar src={organizer.logo_url} name={organizer.name} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{organizer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{getTypeLabel(organizer)}</p>
                </div>
                <div onClick={(event) => event.stopPropagation()} className="-mr-1.5 -mt-1">
                  {renderOrganizerActions(organizer)}
                </div>
              </div>
              <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                {organizer.short_description?.trim() || (
                  <span className="text-muted-foreground/60">Aucune description</span>
                )}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                <EntityLinkIcons links={getOrganizerLinks(organizer)} />
                <OrganizerSources organizer={organizer} />
              </div>
            </div>
          ))}
        </div>
      )}

      <OrganizerDialog
        organizer={editingOrganizer}
        open={isDialogOpen}
        onOpenChange={(next) => {
          setIsDialogOpen(next);
          if (!next && openOrganizerId) router.replace("/admin/organizers", { scroll: false });
        }}
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

/* ------------------------------------------------------------------ */
/* Fiche organisateur                                                  */
/* ------------------------------------------------------------------ */

type OrganizerRole = "owner" | "editor" | "viewer";

const ROLE_LABELS: Record<OrganizerRole, string> = {
  owner: "Propriétaire",
  editor: "Éditeur",
  viewer: "Lecteur",
};

type OrganizerMember = {
  id: string;
  user_id: string;
  role: OrganizerRole;
  created_at: string;
  email?: string;
};

const EMPTY_ORGANIZER_FORM = {
  name: "",
  logo_url: "",
  short_description: "",
  instagram_url: "",
  facebook_url: "",
  tiktok_url: "",
  facebook_page_id: "",
  website_url: "",
  scraping_example_url: "",
  source_capture_mode: "url" as Organizer["source_capture_mode"],
};

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
  const [formData, setFormData] = useState(EMPTY_ORGANIZER_FORM);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [organizerUsers, setOrganizerUsers] = useState<OrganizerMember[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<OrganizerRole>("owner");
  const [showAddUser, setShowAddUser] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  const isLocation = organizer?.type === "location";

  const loadOrganizerUsers = useCallback(async (organizerId: string) => {
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
  }, []);

  // Chaque ouverture repart sur la fiche.
  useEffect(() => {
    if (open) setActiveTab("details");
  }, [open, organizer?.id]);

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
      setOriginalImageSrc(organizer.logo_url || null);
    } else {
      setFormData(EMPTY_ORGANIZER_FORM);
      setLogoPreview(null);
      setOriginalImageSrc(null);
    }
    setLogoFile(null);
    setCropSource(null);
    if (organizer && open) {
      void loadOrganizerUsers(organizer.id);
    } else {
      setOrganizerUsers([]);
    }
    setShowAddUser(false);
    setNewUserEmail("");
    setNewUserRole("owner");
  }, [organizer, open, loadOrganizerUsers]);

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
          title: "Invitation impossible",
          description: data.error || "Impossible d'envoyer l'invitation",
          confirmText: "OK",
        });
        return;
      }

      toast({
        title: "Invitation envoyée",
        description: `${newUserEmail.trim()} recevra un e-mail pour rejoindre l'organisateur.`,
        variant: "success",
      });
      await loadOrganizerUsers(organizer.id);
      setNewUserEmail("");
      setShowAddUser(false);
    } catch (error) {
      console.error("Erreur:", error);
      showAlert({
        title: "Invitation impossible",
        description: "Erreur lors de l'envoi de l'invitation",
        confirmText: "OK",
      });
    } finally {
      setSendingInvite(false);
    }
  }

  function removeUserFromOrganizer(member: OrganizerMember) {
    if (!organizer) return;

    showConfirm({
      title: "Retirer ce membre",
      description: `${member.email || "Cet utilisateur"} n'aura plus accès à l'espace organisateur.`,
      confirmText: "Retirer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        setLoadingUsers(true);
        try {
          const response = await fetch(
            `/api/admin/organizers/${organizer.id}/users?user_id=${member.user_id}`,
            { method: "DELETE" },
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

  async function updateUserRole(userId: string, newRole: OrganizerRole) {
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

  function handleLogoSelected(dataUrl: string) {
    setOriginalImageSrc(dataUrl);
    setCropSource(dataUrl);
  }

  function handleCropConfirm(blob: Blob) {
    setLogoFile(new File([blob], `cropped-${Date.now()}.jpg`, { type: "image/jpeg" }));
    setLogoPreview(URL.createObjectURL(blob));
  }

  function handleLogoRemove() {
    setLogoPreview(null);
    setLogoFile(null);
    setOriginalImageSrc(null);
    setFormData((current) => ({ ...current, logo_url: "" }));
  }

  function handleLogoUrlChange(value: string) {
    setFormData((current) => ({ ...current, logo_url: value }));
    const trimmed = value.trim();
    setLogoPreview(trimmed || null);
    setOriginalImageSrc(trimmed || null);
  }

  async function handleImageUpload(): Promise<string | null> {
    const currentUrl = formData.logo_url?.trim() || "";

    const isStoredOrganizerImage = (url: string) =>
      /\/storage\/v1\/object\/public\/organizers-images\//.test(url);

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
        const {
          data: { publicUrl },
        } = supabase.storage.from("organizers-images").getPublicUrl(data.path);
        return publicUrl;
      } catch (error: any) {
        console.error("Erreur copie image distante:", error);
        showAlert({
          title: "Image distante invalide",
          description: "Impossible de sauvegarder l'image distante: " + (error.message || "Erreur inconnue"),
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
      const {
        data: { publicUrl },
      } = supabase.storage.from("organizers-images").getPublicUrl(data.path);
      return publicUrl;
    } catch (error: any) {
      console.error("Erreur upload:", error);
      showAlert({
        title: "Upload impossible",
        description: "Erreur lors de l'upload: " + (error.message || "Erreur inconnue"),
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
        else {
          setUploading(false);
          return;
        }
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
      toast({
        title: organizer ? "Organisateur mis à jour" : "Organisateur créé",
        variant: "success",
      });
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

  const headerDescription = organizer
    ? [
        isLocation ? "Lieu-organisateur" : "Organisateur",
        formData.scraping_example_url ? "Scraping configuré" : null,
        formData.facebook_page_id ? "Page Facebook liée" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Ajoute une structure qui organise des événements.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={ENTITY_SHEET_CLASSNAME}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <EntitySheetHeader
            imageSrc={logoPreview}
            name={formData.name || organizer?.name || "Organisateur"}
            title={organizer ? formData.name.trim() || organizer.name : "Nouvel organisateur"}
            description={headerDescription}
            onClose={() => onOpenChange(false)}
          >
            {organizer ? (
              <TabsList variant="line" className="border-b-0">
                <TabsTrigger value="details">Fiche</TabsTrigger>
                <TabsTrigger value="events">Événements</TabsTrigger>
                <TabsTrigger value="team">
                  Équipe
                  <span className="rounded bg-muted px-1 text-[11px] tabular-nums text-muted-foreground">
                    {organizerUsers.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            ) : null}
          </EntitySheetHeader>

          <EntitySheetBody>
            {organizer ? (
              <>
                <TabsContent value="events" className="mt-0 pb-8">
                  <EntityRelatedEvents
                    scope={isLocation ? { kind: "location", id: organizer.id } : { kind: "organizer", id: organizer.id }}
                  />
                </TabsContent>

                <TabsContent value="team" className="mt-0 space-y-4 pb-8">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Les membres gèrent cet organisateur depuis l’espace pro.
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href={`/admin/organizers/${organizer.id}/team`} target="_blank" rel="noreferrer">
                          <ExternalLink />
                          Espace équipe
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setShowAddUser((current) => !current)}
                        disabled={loadingUsers}
                      >
                        <UserPlus />
                        Inviter
                      </Button>
                    </div>
                  </div>

                  {showAddUser ? (
                    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                        <div className="space-y-1.5">
                          <Label htmlFor="organizer-invite-email">E-mail</Label>
                          <Input
                            id="organizer-invite-email"
                            type="email"
                            placeholder="prenom@exemple.fr"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                            disabled={loadingUsers || sendingInvite}
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="organizer-invite-role">Rôle</Label>
                          <Select
                            value={newUserRole}
                            onValueChange={(value) => setNewUserRole(value as OrganizerRole)}
                            disabled={loadingUsers}
                          >
                            <SelectTrigger id="organizer-invite-role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROLE_LABELS) as OrganizerRole[]).map((role) => (
                                <SelectItem key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Un e-mail d’invitation permet de créer le compte et de rejoindre l’organisateur.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowAddUser(false);
                            setNewUserEmail("");
                          }}
                          disabled={sendingInvite}
                        >
                          Annuler
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={sendInvitation}
                          disabled={
                            loadingUsers || sendingInvite || !newUserEmail.trim() || !newUserEmail.includes("@")
                          }
                        >
                          {sendingInvite ? <Loader2 className="animate-spin" /> : <Mail />}
                          Envoyer l’invitation
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {loadingUsers && organizerUsers.length === 0 ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement des membres…
                    </div>
                  ) : organizerUsers.length === 0 ? (
                    showAddUser ? null : (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <p className="text-sm font-medium">Aucun membre</p>
                      <p className="max-w-xs text-sm text-muted-foreground">
                        Invite une personne pour lui donner accès à l’espace organisateur.
                      </p>
                    </div>
                    )
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {organizerUsers.map((member) => (
                        <div key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
                            {(member.email || "?").slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {member.email || `${member.user_id.slice(0, 8)}…`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Depuis le {formatShortDate(member.created_at)}
                            </p>
                          </div>
                          <Select
                            value={member.role}
                            onValueChange={(value) => updateUserRole(member.user_id, value as OrganizerRole)}
                            disabled={loadingUsers}
                          >
                            <SelectTrigger
                              className="h-8 w-[130px]"
                              aria-label={`Rôle de ${member.email || "ce membre"}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ROLE_LABELS) as OrganizerRole[]).map((role) => (
                                <SelectItem key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeUserFromOrganizer(member)}
                            disabled={loadingUsers}
                            aria-label={`Retirer ${member.email || "ce membre"}`}
                          >
                            <UserMinus />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </>
            ) : null}

            <TabsContent value="details" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-6">
                <EntityFormSection title="Identité">
                  <EntityImageField
                    id="organizer-logo"
                    name={formData.name}
                    shape="square"
                    preview={logoPreview}
                    url={formData.logo_url}
                    onUrlChange={handleLogoUrlChange}
                    onFileSelected={handleLogoSelected}
                    onRecrop={() => setCropSource(originalImageSrc || logoPreview)}
                    onRemove={handleLogoRemove}
                    hasLocalFile={Boolean(logoFile)}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="organizer-name">Nom *</Label>
                    <Input
                      id="organizer-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organizer-description">Description</Label>
                    <Textarea
                      id="organizer-description"
                      value={formData.short_description}
                      onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                      placeholder="Quelques lignes pour présenter la structure"
                      rows={4}
                    />
                  </div>
                </EntityFormSection>

                <EntityFormSection title="Liens publics" description="Affichés sur la fiche de l’organisateur.">
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
                          <Label htmlFor={`organizer-${field.key}`} className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {field.label}
                          </Label>
                          <Input
                            id={`organizer-${field.key}`}
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

                <EntityFormSection
                  title="Collecte d’événements"
                  description="Comment OutLive récupère les événements de cet organisateur."
                >
                  <div className="space-y-2">
                    <Label htmlFor="organizer-capture-mode">Type de source</Label>
                    <Select
                      value={formData.source_capture_mode}
                      onValueChange={(value) =>
                        setFormData({ ...formData, source_capture_mode: value as Organizer["source_capture_mode"] })
                      }
                    >
                      <SelectTrigger id="organizer-capture-mode">
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
                      <Label htmlFor="organizer-scraping-url">URL d’exemple pour le scraping</Label>
                      {organizer && formData.scraping_example_url ? (
                        <Link
                          href={`/admin/scraping/${organizer.id}`}
                          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Configurer
                        </Link>
                      ) : null}
                    </div>
                    <Input
                      id="organizer-scraping-url"
                      type="url"
                      value={formData.scraping_example_url}
                      onChange={(e) => setFormData({ ...formData, scraping_example_url: e.target.value })}
                      placeholder="https://…/agenda"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organizer-facebook-page">ID de la page Facebook</Label>
                    <Input
                      id="organizer-facebook-page"
                      value={formData.facebook_page_id}
                      onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
                      placeholder="Ex. 123456789012345"
                    />
                  </div>
                </EntityFormSection>

                <EntitySheetFooter
                  onCancel={() => onOpenChange(false)}
                  submitLabel={organizer ? "Enregistrer" : "Créer l’organisateur"}
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
