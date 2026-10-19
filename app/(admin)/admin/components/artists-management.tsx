"use client";

import * as React from "react";
import {
  Disc3,
  Edit2,
  ExternalLink,
  Globe,
  Instagram,
  LayoutGrid,
  List as ListIcon,
  Music,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { fetchRemoteImageBlob } from "@/lib/events/remote-image";
import { compressImage } from "@/lib/image-compression";
import { removeReplacedStorageObject } from "@/lib/supabase/image-utils";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
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
  getInitials,
  useDirectoryView,
  useSortState,
  type EntityLink,
} from "./directory/directory";
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
import { useUpcomingEventStats } from "./directory/use-upcoming-events";

type AdminArtist = {
  id: string;
  name: string;
  slug: string;
  artist_type_label: string | null;
  origin_city: string | null;
  tag_ids: string[] | null;
  short_description: string | null;
  image_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  soundcloud_url: string | null;
  deezer_url: string | null;
  created_at: string;
  updated_at: string;
};

type ArtistFormState = {
  name: string;
  artist_type_label: string;
  origin_city: string;
  tag_ids: string[];
  short_description: string;
  image_url: string;
  website_url: string;
  instagram_url: string;
  soundcloud_url: string;
  deezer_url: string;
};

type TagOption = {
  id: string;
  name: string;
};

type ArtistSegment = "all" | "upcoming" | "incomplete";
type ArtistSortKey = "name" | "upcoming" | "updated";

const emptyFormState: ArtistFormState = {
  name: "",
  artist_type_label: "",
  origin_city: "",
  tag_ids: [],
  short_description: "",
  image_url: "",
  website_url: "",
  instagram_url: "",
  soundcloud_url: "",
  deezer_url: "",
};

function normalizeNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function getArtistLinks(artist: AdminArtist): EntityLink[] {
  return [
    artist.website_url ? { key: "website", label: "Site web", href: artist.website_url, icon: Globe } : null,
    artist.instagram_url ? { key: "instagram", label: "Instagram", href: artist.instagram_url, icon: Instagram } : null,
    artist.soundcloud_url ? { key: "soundcloud", label: "SoundCloud", href: artist.soundcloud_url, icon: Music } : null,
    artist.deezer_url ? { key: "deezer", label: "Deezer", href: artist.deezer_url, icon: Disc3 } : null,
  ].filter(Boolean) as EntityLink[];
}

/** Informations manquantes d'un profil (affichées dans « À compléter »). */
function getArtistMissing(artist: AdminArtist) {
  return [
    !artist.image_url ? "Sans image" : null,
    !artist.short_description?.trim() ? "Sans description" : null,
    !artist.artist_type_label?.trim() ? "Sans type" : null,
  ].filter(Boolean) as string[];
}

function getArtistSubtitle(artist: AdminArtist) {
  return [artist.artist_type_label, artist.origin_city].filter(Boolean).join(" · ");
}

function ArtistTags({ tagIds, tagNameById, max = 3 }: { tagIds: string[] | null; tagNameById: Map<string, string>; max?: number }) {
  const names = (tagIds || []).map((tagId) => tagNameById.get(tagId)).filter(Boolean) as string[];
  if (names.length === 0) return <span className="text-xs text-muted-foreground/70">—</span>;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {names.slice(0, max).map((name) => (
        <span key={name} className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {name}
        </span>
      ))}
      {names.length > max ? (
        <span className="rounded-md px-1 py-0.5 text-[11px] text-muted-foreground">+{names.length - max}</span>
      ) : null}
    </div>
  );
}

export function ArtistsManagement() {
  const [artists, setArtists] = React.useState<AdminArtist[]>([]);
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [segment, setSegment] = React.useState<ArtistSegment>("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [viewMode, setViewMode] = useDirectoryView("admin.artists.view");
  const { sortKey, sortDirection, toggleSort } = useSortState<ArtistSortKey>("name");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedArtist, setSelectedArtist] = React.useState<AdminArtist | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const upcoming = useUpcomingEventStats("artist", reloadKey);
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

  const tagNameById = React.useMemo(() => new Map(tags.map((tag) => [tag.id, tag.name])), [tags]);

  const loadArtists = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("artists")
        .select(
          "id, name, slug, artist_type_label, origin_city, tag_ids, short_description, image_url, website_url, instagram_url, soundcloud_url, deezer_url, created_at, updated_at",
        )
        .order("name", { ascending: true });

      if (error) throw error;
      setArtists((data || []) as AdminArtist[]);
      setLoadError(null);
    } catch (error) {
      console.error("Erreur lors du chargement des artistes:", error);
      setLoadError("Impossible de charger les artistes.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTags = React.useCallback(async () => {
    try {
      const { data, error } = await supabase.from("tags").select("id, name").order("name", { ascending: true });
      if (error) throw error;
      setTags((data || []) as TagOption[]);
    } catch (error) {
      console.error("Erreur lors du chargement des tags:", error);
    }
  }, []);

  React.useEffect(() => {
    void loadArtists();
    void loadTags();
  }, [loadArtists, loadTags]);

  // Types existants, dédoublonnés sans tenir compte de la casse (« DJ » / « Dj »).
  const typeOptions = React.useMemo(() => {
    const byKey = new Map<string, string>();
    for (const artist of artists) {
      const label = artist.artist_type_label?.trim();
      if (label && !byKey.has(label.toLowerCase())) byKey.set(label.toLowerCase(), label);
    }
    return Array.from(byKey.values()).sort((a, b) => compareText(a, b));
  }, [artists]);

  const filteredArtists = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const next = artists.filter((artist) => {
      const tagNames = (artist.tag_ids || [])
        .map((tagId) => tagNameById.get(tagId) || "")
        .join(" ")
        .toLowerCase();
      const matchesQuery =
        !query ||
        artist.name.toLowerCase().includes(query) ||
        artist.slug.toLowerCase().includes(query) ||
        (artist.artist_type_label || "").toLowerCase().includes(query) ||
        (artist.origin_city || "").toLowerCase().includes(query) ||
        (artist.short_description || "").toLowerCase().includes(query) ||
        tagNames.includes(query);
      const matchesSegment =
        segment === "all" ||
        (segment === "upcoming" && (upcoming?.get(artist.id)?.count || 0) > 0) ||
        (segment === "incomplete" && getArtistMissing(artist).length > 0);
      const matchesType =
        typeFilter === "all" || artist.artist_type_label?.trim().toLowerCase() === typeFilter.toLowerCase();
      return matchesQuery && matchesSegment && matchesType;
    });
    const direction = sortDirection === "asc" ? 1 : -1;
    return next.sort((a, b) => {
      if (sortKey === "updated") {
        return direction * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      }
      if (sortKey === "upcoming") {
        const countA = upcoming?.get(a.id)?.count || 0;
        const countB = upcoming?.get(b.id)?.count || 0;
        return direction * (countA - countB) || compareText(a.name, b.name);
      }
      return direction * compareText(a.name, b.name);
    });
  }, [artists, searchQuery, segment, typeFilter, tagNameById, upcoming, sortKey, sortDirection]);

  function openArtist(artist: AdminArtist | null) {
    setSelectedArtist(artist);
    setSheetOpen(true);
  }

  function handleDelete(artist: AdminArtist) {
    showConfirm({
      title: "Supprimer l'artiste",
      description: `« ${artist.name} » sera retiré des événements auxquels il est rattaché.`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("artists").delete().eq("id", artist.id);
          if (error) throw error;
          toast({ title: "Artiste supprimé", variant: "success" });
          await loadArtists();
          setReloadKey((current) => current + 1);
        } catch (error: any) {
          console.error("Erreur lors de la suppression de l'artiste:", error);
          showAlert({
            title: "Suppression impossible",
            description: error?.message || "Impossible de supprimer l'artiste.",
            confirmText: "OK",
          });
        }
      },
    });
  }

  const upcomingCount = upcoming
    ? artists.filter((artist) => (upcoming.get(artist.id)?.count || 0) > 0).length
    : undefined;
  const incompleteCount = artists.filter((artist) => getArtistMissing(artist).length > 0).length;
  const hasActiveFilters = searchQuery.trim().length > 0 || segment !== "all" || typeFilter !== "all";

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

  function renderArtistActions(artist: AdminArtist) {
    return (
      <RowActionsMenu label={`Actions pour ${artist.name}`}>
        <DropdownMenuItem onSelect={() => openArtist(artist)}>
          <Edit2 />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/artists/${artist.slug}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            Voir la page publique
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => handleDelete(artist)}
          className="text-destructive focus:text-destructive [&>svg]:!text-destructive"
        >
          <Trash2 />
          Supprimer
        </DropdownMenuItem>
      </RowActionsMenu>
    );
  }

  return (
    <div className="space-y-5">
      <DirectoryHeader
        title="Artistes"
        meta={[
          `${artists.length} artiste${artists.length > 1 ? "s" : ""}`,
          upcomingCount != null ? `${upcomingCount} à l’affiche` : null,
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
            <Button size="sm" onClick={() => openArtist(null)}>
              <Plus />
              Nouvel artiste
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <DirectorySegments
          value={segment}
          onValueChange={setSegment}
          items={[
            { value: "all", label: "Tous", count: artists.length },
            { value: "upcoming", label: "À l’affiche", count: upcomingCount },
            { value: "incomplete", label: "À compléter", count: incompleteCount, attention: true },
          ]}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DirectorySearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Rechercher un artiste, une ville, un tag…"
          />
          {typeOptions.length > 0 ? (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="sm:w-48" aria-label="Type d'artiste">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {hasActiveFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setSearchQuery("");
                setSegment("all");
                setTypeFilter("all");
              }}
            >
              <RotateCw />
              Réinitialiser
            </Button>
          ) : null}
          <span className="text-sm text-muted-foreground sm:ml-auto">
            {filteredArtists.length} résultat{filteredArtists.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {loadError ? (
        <ManagementEmptyState
          icon={<Music />}
          title="Chargement impossible"
          description={loadError}
          action={
            <Button size="sm" variant="outline" onClick={() => void loadArtists()}>
              <RotateCw />
              Réessayer
            </Button>
          }
        />
      ) : filteredArtists.length === 0 ? (
        <ManagementEmptyState
          icon={<Music />}
          title={artists.length === 0 ? "Aucun artiste pour le moment" : "Aucun résultat"}
          description={
            artists.length === 0
              ? "Crée un premier profil pour le rattacher ensuite à des événements."
              : "Aucun artiste ne correspond à ces filtres."
          }
          action={
            artists.length === 0 ? (
              <Button size="sm" onClick={() => openArtist(null)}>
                <Plus />
                Nouvel artiste
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
                  label="Artiste"
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
                  className="hidden w-32 @xl:table-cell"
                />
                <TableHead className="hidden w-56 @3xl:table-cell">Tags</TableHead>
                <TableHead className="hidden w-36 @2xl:table-cell">Liens</TableHead>
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
              {filteredArtists.map((artist) => (
                <TableRow key={artist.id} className="cursor-pointer" onClick={() => openArtist(artist)}>
                  <TableCell className="pl-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar src={artist.image_url} name={artist.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{artist.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {getArtistSubtitle(artist) || "Type non renseigné"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden @xl:table-cell">
                    <UpcomingEventsCell stats={upcoming?.get(artist.id)} loading={!upcoming} />
                  </TableCell>
                  <TableCell className="hidden @3xl:table-cell">
                    <ArtistTags tagIds={artist.tag_ids} tagNameById={tagNameById} />
                  </TableCell>
                  <TableCell className="hidden @2xl:table-cell">
                    <EntityLinkIcons links={getArtistLinks(artist)} />
                  </TableCell>
                  <TableCell className="hidden @5xl:table-cell">
                    <MissingHints items={getArtistMissing(artist)} />
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground @6xl:table-cell">
                    {formatShortDate(artist.updated_at)}
                  </TableCell>
                  <TableCell className="pr-4" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end">{renderArtistActions(artist)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DirectoryTableCard>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {filteredArtists.map((artist) => {
            const stats = upcoming?.get(artist.id);
            return (
              <div
                key={artist.id}
                role="button"
                tabIndex={0}
                onClick={() => openArtist(artist)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") openArtist(artist);
                }}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-xs outline-none transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <div className="relative aspect-square w-full border-b border-border bg-muted">
                  {artist.image_url ? (
                    <span
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${artist.image_url})` }}
                      aria-hidden
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground/60">
                      {getInitials(artist.name)}
                    </span>
                  )}
                  {stats && stats.count > 0 ? (
                    <span className="absolute left-2 top-2 rounded-md border border-border bg-background/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums backdrop-blur">
                      {stats.count} à venir
                    </span>
                  ) : null}
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="absolute right-1.5 top-1.5 rounded-md bg-background/80 opacity-100 backdrop-blur transition-opacity md:opacity-0 md:group-hover:opacity-100 md:has-[[data-state=open]]:opacity-100"
                  >
                    {renderArtistActions(artist)}
                  </div>
                </div>
                <div className="min-w-0 space-y-0.5 p-3">
                  <p className="truncate text-sm font-medium">{artist.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {getArtistSubtitle(artist) || "Type non renseigné"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ArtistSheet
        artist={selectedArtist}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tags={tags}
        typeOptions={typeOptions}
        onTagsChange={loadTags}
        onSaved={() => {
          void loadArtists();
          setReloadKey((current) => current + 1);
        }}
      />
      <AlertDialogComponent />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche artiste                                                       */
/* ------------------------------------------------------------------ */

function ArtistSheet({
  artist,
  open,
  onOpenChange,
  tags,
  typeOptions,
  onTagsChange,
  onSaved,
}: {
  artist: AdminArtist | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagOption[];
  typeOptions: string[];
  onTagsChange: () => Promise<void>;
  onSaved: () => void;
}) {
  const { showAlert, AlertDialogComponent } = useAlertDialog();
  const [form, setForm] = React.useState<ArtistFormState>(emptyFormState);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [originalImageSrc, setOriginalImageSrc] = React.useState<string | null>(null);
  const [cropSource, setCropSource] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("details");

  const tagOptions = React.useMemo(() => tags.map((tag) => ({ value: tag.id, label: tag.name })), [tags]);

  // Chaque ouverture repart sur la fiche, avec les valeurs de l'artiste.
  React.useEffect(() => {
    if (!open) return;
    setActiveTab("details");
    setForm(
      artist
        ? {
            name: artist.name || "",
            artist_type_label: artist.artist_type_label || "",
            origin_city: artist.origin_city || "",
            tag_ids: artist.tag_ids || [],
            short_description: artist.short_description || "",
            image_url: artist.image_url || "",
            website_url: artist.website_url || "",
            instagram_url: artist.instagram_url || "",
            soundcloud_url: artist.soundcloud_url || "",
            deezer_url: artist.deezer_url || "",
          }
        : emptyFormState,
    );
    setImagePreview(artist?.image_url || null);
    setOriginalImageSrc(artist?.image_url || null);
    setImageFile(null);
    setCropSource(null);
  }, [open, artist]);

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
    setForm((current) => ({ ...current, image_url: "" }));
  }

  function handleImageUrlChange(value: string) {
    setForm((current) => ({ ...current, image_url: value }));
    const trimmed = value.trim();
    setImagePreview(trimmed || null);
    setOriginalImageSrc(trimmed || null);
  }

  async function uploadImageIfNeeded() {
    const currentUrl = normalizeNullable(form.image_url);
    const isStoredArtistImage = (url: string) => /\/storage\/v1\/object\/public\/organizers-images\//.test(url);

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
        const remoteFile = new File([blob], `artist-remote-${Date.now()}.${ext}`, { type: contentType });
        const compressedFile = await compressImage(remoteFile, 2);
        const extension = compressedFile.name.split(".").pop() || ext;
        const fileName = `artists/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

        const { data, error } = await supabase.storage
          .from("organizers-images")
          .upload(fileName, compressedFile, { cacheControl: "3600", upsert: false });
        if (error) throw error;

        const {
          data: { publicUrl },
        } = supabase.storage.from("organizers-images").getPublicUrl(data.path);
        return publicUrl;
      } catch (error: any) {
        console.error("Erreur copie image distante artiste:", error);
        showAlert({
          title: "Image distante invalide",
          description: error?.message || "Impossible de sauvegarder l'image distante.",
          confirmText: "OK",
        });
        return null;
      }
    }

    if (!imageFile) {
      if (!currentUrl) return null;
      if (isStoredArtistImage(currentUrl)) return currentUrl;
      return await uploadFromRemoteUrl(currentUrl);
    }

    const compressedFile = await compressImage(imageFile, 2);
    const extension = compressedFile.name.split(".").pop() || "jpg";
    const fileName = `artists/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { data, error } = await supabase.storage
      .from("organizers-images")
      .upload(fileName, compressedFile, { cacheControl: "3600", upsert: false });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("organizers-images").getPublicUrl(data.path);

    return publicUrl;
  }

  async function handleCreateTag(name: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.from("tags").insert([{ name: name.trim() }]).select("id, name").single();
      if (error) throw error;
      await onTagsChange();
      return data?.id ?? null;
    } catch (error: any) {
      console.error("Erreur lors de la creation du tag:", error);
      showAlert({
        title: "Tag non créé",
        description: error?.message || "Impossible de créer ce tag.",
        confirmText: "OK",
      });
      return null;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;

    setSaving(true);
    try {
      const imageUrl = await uploadImageIfNeeded();
      if (!imageFile && form.image_url.trim() && !imageUrl) {
        setSaving(false);
        return;
      }
      const payload = {
        name: form.name.trim(),
        artist_type_label: normalizeNullable(form.artist_type_label),
        origin_city: normalizeNullable(form.origin_city),
        tag_ids: form.tag_ids,
        short_description: normalizeNullable(form.short_description),
        image_url: imageUrl,
        website_url: normalizeNullable(form.website_url),
        instagram_url: normalizeNullable(form.instagram_url),
        soundcloud_url: normalizeNullable(form.soundcloud_url),
        deezer_url: normalizeNullable(form.deezer_url),
      };

      if (artist) {
        const { error } = await supabase.from("artists").update(payload).eq("id", artist.id);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // TODO(types): slug (NOT NULL) est rempli par le trigger assign_artist_slug, l'Insert généré l'exige.
        const { error } = await supabase.from("artists").insert({
          ...payload,
          created_by: user?.id || null,
        } as TablesInsert<"artists">);
        if (error) throw error;
      }

      if (artist) {
        await removeReplacedStorageObject(supabase, {
          bucket: "organizers-images",
          previousUrl: artist.image_url,
          nextUrl: imageUrl,
          references: [
            { table: "organizers", column: "logo_url" },
            { table: "artists", column: "image_url" },
          ],
        });
      }

      toast({ title: artist ? "Artiste mis à jour" : "Artiste créé", variant: "success" });
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error("Erreur lors de l'enregistrement de l'artiste:", error);
      showAlert({
        title: "Enregistrement impossible",
        description: error?.message || "Impossible d'enregistrer l'artiste.",
        confirmText: "OK",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={ENTITY_SHEET_CLASSNAME}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <EntitySheetHeader
            imageSrc={imagePreview}
            name={form.name || artist?.name || "Artiste"}
            title={artist ? form.name.trim() || artist.name : "Nouvel artiste"}
            description={
              artist
                ? [form.artist_type_label.trim(), form.origin_city.trim()].filter(Boolean).join(" · ") || "Artiste"
                : "Profil public rattachable aux événements."
            }
            onClose={() => onOpenChange(false)}
            actions={
              artist ? (
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" asChild>
                  <a
                    href={`/artists/${artist.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Voir la page publique"
                    aria-label="Voir la page publique"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              ) : null
            }
          >
            {artist ? (
              <TabsList variant="line" className="border-b-0">
                <TabsTrigger value="details">Fiche</TabsTrigger>
                <TabsTrigger value="events">Événements</TabsTrigger>
              </TabsList>
            ) : null}
          </EntitySheetHeader>

          <EntitySheetBody>
            {artist ? (
              <TabsContent value="events" className="mt-0 pb-8">
                <EntityRelatedEvents scope={{ kind: "artist", id: artist.id }} />
              </TabsContent>
            ) : null}

            <TabsContent value="details" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-6">
                <EntityFormSection title="Identité">
                  <EntityImageField
                    id="artist-image"
                    name={form.name}
                    shape="square"
                    preview={imagePreview}
                    url={form.image_url}
                    onUrlChange={handleImageUrlChange}
                    onFileSelected={handleImageSelected}
                    onRecrop={() => setCropSource(originalImageSrc || imagePreview)}
                    onRemove={handleImageRemove}
                    hasLocalFile={Boolean(imageFile)}
                  />
                  <div className="space-y-2">
                    <Label htmlFor="artist-name">Nom *</Label>
                    <Input
                      id="artist-name"
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Nom de scène, groupe, collectif…"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="artist-type-label">Type</Label>
                      <Input
                        id="artist-type-label"
                        list="artist-type-options"
                        value={form.artist_type_label}
                        onChange={(event) => setForm((prev) => ({ ...prev, artist_type_label: event.target.value }))}
                        placeholder="DJ, Groupe, Plasticien…"
                      />
                      <datalist id="artist-type-options">
                        {typeOptions.map((type) => (
                          <option key={type} value={type} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="artist-origin-city">Ville d’origine</Label>
                      <Input
                        id="artist-origin-city"
                        value={form.origin_city}
                        onChange={(event) => setForm((prev) => ({ ...prev, origin_city: event.target.value }))}
                        placeholder="Orléans, Paris, Berlin…"
                      />
                    </div>
                  </div>
                </EntityFormSection>

                <EntityFormSection title="Présentation">
                  <div className="space-y-2">
                    <Label htmlFor="artist-description">Description courte</Label>
                    <Textarea
                      id="artist-description"
                      value={form.short_description}
                      onChange={(event) => setForm((prev) => ({ ...prev, short_description: event.target.value }))}
                      placeholder="Quelques lignes pour présenter l’artiste"
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tags</Label>
                    <MultiSelectCreatable
                      options={tagOptions}
                      selected={form.tag_ids}
                      onChange={(tagIds) => setForm((prev) => ({ ...prev, tag_ids: tagIds }))}
                      onCreate={handleCreateTag}
                      placeholder="Ajouter des tags"
                      createPlaceholder="Créer ou rechercher un tag…"
                      disabled={saving}
                    />
                  </div>
                </EntityFormSection>

                <EntityFormSection title="Liens publics" description="Affichés sur la page publique de l’artiste.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        { key: "website_url", label: "Site web", icon: Globe, placeholder: "https://…" },
                        { key: "instagram_url", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/…" },
                        { key: "soundcloud_url", label: "SoundCloud", icon: Music, placeholder: "https://soundcloud.com/…" },
                        { key: "deezer_url", label: "Deezer", icon: Disc3, placeholder: "https://deezer.com/…" },
                      ] as const
                    ).map((field) => {
                      const Icon = field.icon;
                      return (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={`artist-${field.key}`} className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {field.label}
                          </Label>
                          <Input
                            id={`artist-${field.key}`}
                            inputMode="url"
                            value={form[field.key]}
                            onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
                            placeholder={field.placeholder}
                          />
                        </div>
                      );
                    })}
                  </div>
                </EntityFormSection>

                <EntitySheetFooter
                  onCancel={() => onOpenChange(false)}
                  submitLabel={artist ? "Enregistrer" : "Créer l’artiste"}
                  busy={saving}
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
          defaultAspect={1}
          onConfirm={handleCropConfirm}
        />
        <AlertDialogComponent />
      </SheetContent>
    </Sheet>
  );
}
