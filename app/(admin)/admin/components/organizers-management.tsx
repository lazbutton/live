"use client";

import { useEffect, useState, useCallback } from "react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus, Search, Edit2, Trash2, ExternalLink, Code, Facebook,
  Globe, Instagram, Image as ImageIcon, X, Save, Users, RotateCw, Music, ChevronLeft, UserPlus, UserMinus, LayoutGrid, List as ListIcon
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { compressImage } from "@/lib/image-compression";
import Cropper, { Area } from "react-easy-crop";
import Link from "next/link";
import { cn } from "@/lib/utils";
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

interface Organizer {
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
  created_at: string;
  updated_at: string;
  type?: "organizer" | "location";
}

export function OrganizersManagement() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [filteredOrganizers, setFilteredOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOrganizer, setEditingOrganizer] = useState<Organizer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const { showAlert, showConfirm, AlertDialogComponent } = useAlertDialog();

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
    if (!searchQuery.trim()) {
      setFilteredOrganizers(organizers);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredOrganizers(
        organizers.filter((org) => 
          org.name.toLowerCase().includes(query) ||
          org.short_description?.toLowerCase().includes(query)
        )
      );
    }
  }, [organizers, searchQuery]);

  async function loadOrganizers() {
    try {
      const { data: organizersData, error: organizersError } = await supabase
        .from("organizers")
        .select("*")
        .order("name", { ascending: true });

      if (organizersError) throw organizersError;

      const { data: locationsData, error: locationsError } = await supabase
        .from("locations")
        .select("id, name, image_url, instagram_url, facebook_url, tiktok_url, facebook_page_id, website_url, scraping_example_url, created_at, updated_at")
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
    const organizerName = organizer?.type === "location" ? "ce lieu-organisateur" : "cet organisateur";
    
    if (organizer?.type === "location") {
      showAlert({
        title: "Action non autorisée",
        description: "Supprimez-le depuis la gestion des lieux.",
        confirmText: "OK",
      });
      return;
    }

    showConfirm({
      title: "Supprimer l'organisateur",
      description: `Supprimer ${organizerName} ?`,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "destructive",
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("organizers").delete().eq("id", id);
          if (error) throw error;
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

  function handleOpenDialog(organizer?: Organizer) {
    // Les lieux-organisateurs se gèrent dans la page /admin/locations
    if (organizer?.type === "location") {
      router.push(`/admin/locations?open=${organizer.id}`);
      return;
    }
    setEditingOrganizer(organizer || null);
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
    <div className="space-y-6">
      {/* En-tête compact */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">Organisateurs</h2>
            <p className="text-sm text-muted-foreground">
              {filteredOrganizers.length} organisateur{filteredOrganizers.length > 1 ? "s" : ""}
              {searchQuery && ` sur ${organizers.length}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
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
          <Button
            onClick={() => setIsImporterOpen(true)}
            variant="outline"
            size="sm"
            className="h-9"
          >
            <Facebook className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Facebook</span>
          </Button>
          <Button
            onClick={() => handleOpenDialog()}
            size="sm"
            className="h-9"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un organisateur..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Liste / Grille */}
      {filteredOrganizers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto opacity-20 mb-2" />
          <p>{organizers.length === 0 ? "Aucun organisateur. Cliquez sur 'Ajouter' pour commencer." : `Aucun résultat pour "${searchQuery}"`}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredOrganizers.map((organizer) => (
            <div
              key={organizer.id}
              onClick={() => handleOpenDialog(organizer)}
              className="group relative flex flex-col p-4 rounded-lg border bg-card hover:shadow-md hover:border-primary/50 transition-all duration-200 cursor-pointer min-h-[160px]"
            >
              {/* Avatar et badges */}
              <div className="flex items-start gap-3 mb-3">
                <Avatar className="h-12 w-12 ring-2 ring-background">
                  <AvatarImage src={organizer.logo_url || undefined} alt={organizer.name} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(organizer.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">{organizer.name}</h3>
                    {organizer.type === "location" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Lieu</Badge>
                    )}
                  </div>
                  {organizer.short_description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {organizer.short_description}
                    </p>
                  )}
                </div>
              </div>

              {/* Liens sociaux */}
              {(organizer.instagram_url || organizer.facebook_url || organizer.tiktok_url || organizer.website_url) && (
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  {organizer.website_url && (
                    <a
                      href={organizer.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-accent transition-colors"
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
                      className="p-1.5 rounded hover:bg-accent transition-colors"
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
                      className="p-1.5 rounded hover:bg-accent transition-colors"
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
                  <Link
                    href={`/admin/organizers/${organizer.id}/team`}
                    className="p-1.5 rounded hover:bg-accent transition-colors"
                    title="Gérer l'équipe"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Users className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href={`/admin/events?organizer=${organizer.id}`}
                    target="_blank"
                    className="p-1.5 rounded hover:bg-accent transition-colors"
                    title="Voir les événements"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {organizer.scraping_example_url && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/scraping/${organizer.id}`);
                      }}
                      className="p-1.5 rounded hover:bg-accent transition-colors"
                      title="Configuration scraping"
                    >
                      <Code className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="p-1.5 rounded hover:bg-accent transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1" align="end">
                    <div className="space-y-0.5">
                      <button
                        onClick={() => handleOpenDialog(organizer)}
                        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        {organizer.type === "location" ? "Ouvrir dans Lieux" : "Modifier"}
                      </button>
                      <button
                        onClick={() => deleteOrganizer(organizer.id)}
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
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisateur</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell">Liens</TableHead>
                <TableHead className="text-right">Commandes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrganizers.map((organizer) => (
                <TableRow
                  key={organizer.id}
                  className="cursor-pointer"
                  onClick={() => handleOpenDialog(organizer)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 ring-2 ring-background shrink-0">
                        <AvatarImage src={organizer.logo_url || undefined} alt={organizer.name} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {getInitials(organizer.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">{organizer.name}</div>
                          {organizer.type === "location" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                              Lieu
                            </Badge>
                          )}
                        </div>
                        {organizer.short_description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {organizer.short_description}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {organizer.type === "location" ? (
                      <Badge variant="secondary">Lieu-organisateur</Badge>
                    ) : (
                      <Badge variant="secondary">Organisateur</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-1.5">
                      {organizer.website_url && (
                        <a
                          href={organizer.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          title="Site web"
                        >
                          <Globe className="h-4 w-4 text-muted-foreground" />
                        </a>
                      )}
                      {organizer.instagram_url && (
                        <a
                          href={organizer.instagram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          title="Instagram"
                        >
                          <Instagram className="h-4 w-4 text-muted-foreground" />
                        </a>
                      )}
                      {organizer.facebook_url && (
                        <a
                          href={organizer.facebook_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          title="Facebook"
                        >
                          <Facebook className="h-4 w-4 text-muted-foreground" />
                        </a>
                      )}
                      {organizer.tiktok_url && (
                        <a
                          href={organizer.tiktok_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-accent transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          title="TikTok"
                        >
                          <Music className="h-4 w-4 text-muted-foreground" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/admin/organizers/${organizer.id}/team`}
                          title="Équipe"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Users className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="icon">
                        <Link
                          href={`/admin/events?organizer=${organizer.id}`}
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
                        title={organizer.type === "location" ? "Ouvrir dans Lieux" : "Modifier"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(organizer);
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
                          deleteOrganizer(organizer.id);
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

function OrganizerDialog({
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
  const router = useRouter();
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
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
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
      });
      setLogoPreview(organizer.logo_url || null);
      setOriginalImageSrc(organizer.logo_url || null);
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
      });
      setLogoPreview(null);
      setOriginalImageSrc(null);
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
        alert("Erreur lors de la mise à jour du rôle");
        return;
      }

      await loadOrganizerUsers(organizer.id);
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la mise à jour");
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
      alert("Erreur lors du rognage de l'image");
    }
  }

  async function handleImageUpload(): Promise<string | null> {
    if (!logoFile) return formData.logo_url;
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
      alert("Erreur lors de l'upload: " + (error.message || "Erreur inconnue"));
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
      if (logoFile) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl) finalLogoUrl = uploadedUrl;
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
      };
      if (organizer) {
        const { error } = await supabase.from("organizers").update(submitData).eq("id", organizer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("organizers").insert([submitData]);
        if (error) throw error;
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la sauvegarde");
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
              <Label htmlFor="short_description">Description</Label>
              <Textarea
                id="short_description"
                value={formData.short_description}
                onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                rows={3}
              />
            </div>
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
              <Label>Logo</Label>
              {logoPreview && (
                <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
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
            </div>

            {/* Section Gestion des utilisateurs (seulement si on modifie un organisateur existant) */}
            {organizer && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Utilisateurs associés</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Note: Les organisateurs doivent utiliser leur interface /organizer/team
                          // Ce bouton est visible uniquement pour les admins
                        }}
                        disabled
                        title="Utilisez l'interface organisateur pour gérer l'équipe"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Gérer l'équipe (via interface organisateur)
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

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? <RotateCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {organizer ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
      <AlertDialogComponent />
    </Sheet>
  );
}
