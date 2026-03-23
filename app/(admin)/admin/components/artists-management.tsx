"use client";

import * as React from "react";
import { supabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image-compression";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelectCreatable } from "@/components/ui/multi-select-creatable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ExternalLink,
  Globe,
  Instagram,
  Music,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

type AdminArtist = {
  id: string;
  name: string;
  slug: string;
  artist_type_label: string | null;
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
  tag_ids: string[];
  short_description: string;
  image_url: string;
  website_url: string;
  instagram_url: string;
  soundcloud_url: string;
  deezer_url: string;
};

const emptyFormState: ArtistFormState = {
  name: "",
  artist_type_label: "",
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

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function buildArtistLinks(artist: AdminArtist) {
  return [
    artist.website_url ? { label: "Site", href: artist.website_url } : null,
    artist.instagram_url ? { label: "Instagram", href: artist.instagram_url } : null,
    artist.soundcloud_url ? { label: "SoundCloud", href: artist.soundcloud_url } : null,
    artist.deezer_url ? { label: "Deezer", href: artist.deezer_url } : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;
}

type TagOption = {
  id: string;
  name: string;
};

export function ArtistsManagement() {
  const [artists, setArtists] = React.useState<AdminArtist[]>([]);
  const [tags, setTags] = React.useState<TagOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedArtist, setSelectedArtist] = React.useState<AdminArtist | null>(null);
  const [form, setForm] = React.useState<ArtistFormState>(emptyFormState);
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const tagNameById = React.useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.name])),
    [tags]
  );

  const tagOptions = React.useMemo(
    () => tags.map((tag) => ({ value: tag.id, label: tag.name })),
    [tags]
  );

  const filteredArtists = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return artists;
    return artists.filter((artist) => {
      const normalizedTagNames = (artist.tag_ids || [])
        .map((tagId) => tagNameById.get(tagId) || "")
        .join(" ")
        .toLowerCase();
      return (
        artist.name.toLowerCase().includes(query) ||
        artist.slug.toLowerCase().includes(query) ||
        (artist.artist_type_label || "").toLowerCase().includes(query) ||
        (artist.short_description || "").toLowerCase().includes(query) ||
        normalizedTagNames.includes(query)
      );
    });
  }, [artists, searchQuery, tagNameById]);

  const loadArtists = React.useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("artists")
        .select(
          "id, name, slug, artist_type_label, tag_ids, short_description, image_url, website_url, instagram_url, soundcloud_url, deezer_url, created_at, updated_at"
        )
        .order("name", { ascending: true });

      if (error) throw error;
      setArtists((data || []) as AdminArtist[]);
    } catch (error) {
      console.error("Erreur lors du chargement des artistes:", error);
      alert("Impossible de charger les artistes.");
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
    loadArtists();
    loadTags();
  }, [loadArtists, loadTags]);

  function openCreateDialog() {
    setSelectedArtist(null);
    setForm(emptyFormState);
    setImageFile(null);
    setDialogOpen(true);
  }

  function openEditDialog(artist: AdminArtist) {
    setSelectedArtist(artist);
    setForm({
      name: artist.name || "",
      artist_type_label: artist.artist_type_label || "",
      tag_ids: artist.tag_ids || [],
      short_description: artist.short_description || "",
      image_url: artist.image_url || "",
      website_url: artist.website_url || "",
      instagram_url: artist.instagram_url || "",
      soundcloud_url: artist.soundcloud_url || "",
      deezer_url: artist.deezer_url || "",
    });
    setImageFile(null);
    setDialogOpen(true);
  }

  async function uploadImageIfNeeded() {
    if (!imageFile) return normalizeNullable(form.image_url);

    const compressedFile = await compressImage(imageFile, 2);
    const extension = compressedFile.name.split(".").pop() || "jpg";
    const fileName = `artists/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { data, error } = await supabase.storage
      .from("organizers-images")
      .upload(fileName, compressedFile, {
        cacheControl: "3600",
        upsert: false,
      });

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
      await loadTags();
      return data?.id ?? null;
    } catch (error: any) {
      console.error("Erreur lors de la creation du tag:", error);
      alert(error?.message || "Impossible de creer ce tag.");
      return null;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      alert("Le nom de l'artiste est requis.");
      return;
    }

    setSaving(true);
    try {
      const imageUrl = await uploadImageIfNeeded();
      const payload = {
        name: form.name.trim(),
        artist_type_label: normalizeNullable(form.artist_type_label),
        tag_ids: form.tag_ids,
        short_description: normalizeNullable(form.short_description),
        image_url: imageUrl,
        website_url: normalizeNullable(form.website_url),
        instagram_url: normalizeNullable(form.instagram_url),
        soundcloud_url: normalizeNullable(form.soundcloud_url),
        deezer_url: normalizeNullable(form.deezer_url),
      };

      if (selectedArtist) {
        const { error } = await supabase.from("artists").update(payload).eq("id", selectedArtist.id);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { error } = await supabase.from("artists").insert({
          ...payload,
          created_by: user?.id || null,
        });
        if (error) throw error;
      }

      await loadArtists();
      setDialogOpen(false);
      setSelectedArtist(null);
      setForm(emptyFormState);
      setImageFile(null);
    } catch (error: any) {
      console.error("Erreur lors de l'enregistrement de l'artiste:", error);
      alert(error?.message || "Impossible d'enregistrer l'artiste.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(artist: AdminArtist) {
    if (!window.confirm(`Supprimer l'artiste "${artist.name}" ?`)) {
      return;
    }

    try {
      const { error } = await supabase.from("artists").delete().eq("id", artist.id);
      if (error) throw error;
      await loadArtists();
    } catch (error: any) {
      console.error("Erreur lors de la suppression de l'artiste:", error);
      alert(error?.message || "Impossible de supprimer l'artiste.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Artistes
            </CardTitle>
            <CardDescription>
              Gerez les profils publics des artistes et collaborateurs relies aux evenements.
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un artiste
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Rechercher par nom, slug, type, tag ou description"
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              Chargement des artistes...
            </div>
          ) : filteredArtists.length == 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center">
              <Music className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Aucun artiste pour le moment</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Cree un premier profil pour le rattacher ensuite a des evenements dans l&apos;admin.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artiste</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Liens</TableHead>
                    <TableHead>Maj</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredArtists.map((artist) => {
                    const links = buildArtistLinks(artist);
                    const artistTags = (artist.tag_ids || [])
                      .map((tagId) => ({ id: tagId, name: tagNameById.get(tagId) || "" }))
                      .filter((tag) => tag.name);
                    return (
                      <TableRow key={artist.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div
                              className="h-11 w-11 rounded-xl border bg-muted bg-cover bg-center"
                              style={{
                                backgroundImage: artist.image_url ? `url(${artist.image_url})` : undefined,
                              }}
                            >
                              {!artist.image_url ? (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Music className="h-4 w-4 text-muted-foreground" />
                                </div>
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{artist.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{artist.id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {artist.artist_type_label ? (
                            <Badge variant="outline">{artist.artist_type_label}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Non renseigne</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          {artistTags.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Aucun tag</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {artistTags.slice(0, 4).map((tag) => (
                                <Badge key={tag.id} variant="secondary">
                                  {tag.name}
                                </Badge>
                              ))}
                              {artistTags.length > 4 ? (
                                <Badge variant="outline">+{artistTags.length - 4}</Badge>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{artist.slug}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[360px]">
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {artist.short_description || "Aucune description"}
                          </p>
                        </TableCell>
                        <TableCell>
                          {links.length == 0 ? (
                            <span className="text-sm text-muted-foreground">Aucun lien</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {links.map((link) => (
                                <a
                                  key={link.label}
                                  href={link.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {link.label}
                                </a>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(artist.updated_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(artist)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDelete(artist)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedArtist ? "Modifier l'artiste" : "Ajouter un artiste"}</DialogTitle>
            <DialogDescription>
              Renseigne le profil public qui sera affiche dans l&apos;app et rattachable aux evenements.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="artist-name">Nom</Label>
                <Input
                  id="artist-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nom de scène / collectif / collaborateur"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="artist-type-label">Type / denomination</Label>
                <Input
                  id="artist-type-label"
                  value={form.artist_type_label}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, artist_type_label: event.target.value }))
                  }
                  placeholder="DJ, Groupe, Plasticien, Musicien..."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Tags</Label>
                <MultiSelectCreatable
                  options={tagOptions}
                  selected={form.tag_ids}
                  onChange={(tagIds) => setForm((prev) => ({ ...prev, tag_ids: tagIds }))}
                  onCreate={handleCreateTag}
                  placeholder="Ajouter des tags"
                  createPlaceholder="Creer ou rechercher un tag..."
                  disabled={saving}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="artist-description">Description courte</Label>
                <Textarea
                  id="artist-description"
                  value={form.short_description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, short_description: event.target.value }))
                  }
                  placeholder="Quelques lignes pour presenter l'artiste"
                  rows={4}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="artist-image-url">Image (URL)</Label>
                <Input
                  id="artist-image-url"
                  value={form.image_url}
                  onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="artist-image-file">Image (fichier)</Label>
                <Input
                  id="artist-image-file"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground">
                  Si un fichier est choisi, il remplacera l&apos;URL saisie apres upload.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div
                  className="h-40 rounded-xl border bg-muted bg-cover bg-center"
                  style={{
                    backgroundImage: form.image_url.trim()
                      ? `url(${form.image_url.trim()})`
                      : undefined,
                  }}
                >
                  {!form.image_url.trim() ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">Apercu de l&apos;image</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="artist-website" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Site web
                </Label>
                <Input
                  id="artist-website"
                  value={form.website_url}
                  onChange={(event) => setForm((prev) => ({ ...prev, website_url: event.target.value }))}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="artist-instagram" className="flex items-center gap-2">
                  <Instagram className="h-4 w-4" />
                  Instagram
                </Label>
                <Input
                  id="artist-instagram"
                  value={form.instagram_url}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, instagram_url: event.target.value }))
                  }
                  placeholder="https://instagram.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="artist-soundcloud" className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  SoundCloud
                </Label>
                <Input
                  id="artist-soundcloud"
                  value={form.soundcloud_url}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, soundcloud_url: event.target.value }))
                  }
                  placeholder="https://soundcloud.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="artist-deezer" className="flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  Deezer
                </Label>
                <Input
                  id="artist-deezer"
                  value={form.deezer_url}
                  onChange={(event) => setForm((prev) => ({ ...prev, deezer_url: event.target.value }))}
                  placeholder="https://deezer.com/..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enregistrement..." : selectedArtist ? "Mettre a jour" : "Creer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
