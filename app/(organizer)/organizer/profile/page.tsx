"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { OrganizerLayout } from "../components/organizer-layout";
import { supabase } from "@/lib/supabase/client";
import { getUserOrganizers, OrganizerInfo } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Upload, Image as ImageIcon, Loader2, Globe, Instagram, Facebook, Music, Code, AlertCircle } from "lucide-react";
import { compressImage } from "@/lib/image-compression";
import Cropper, { Area } from "react-easy-crop";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { Badge } from "@/components/ui/badge";

interface OrganizerData {
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
  type: "organizer" | "location";
}

function ProfileContent() {
  const [userOrganizers, setUserOrganizers] = useState<OrganizerInfo[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string | null>(null);
  const [organizerData, setOrganizerData] = useState<OrganizerData | null>(null);
  const [userRole, setUserRole] = useState<"owner" | "editor" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showAlert, AlertDialogComponent } = useAlertDialog();

  const [formData, setFormData] = useState({
    name: "",
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

  useEffect(() => {
    loadOrganizers();
  }, []);

  useEffect(() => {
    if (selectedOrganizerId) {
      loadOrganizerData(selectedOrganizerId);
    }
  }, [selectedOrganizerId]);

  async function loadOrganizers() {
    try {
      const organizers = await getUserOrganizers();
      setUserOrganizers(organizers);

      if (organizers.length === 0) {
        showAlert({
          title: "Aucun organisateur",
          description: "Vous n'êtes associé à aucun organisateur.",
          confirmText: "OK",
        });
        setLoading(false);
        return;
      }

      // Si un seul organisateur, le sélectionner automatiquement
      if (organizers.length === 1) {
        setSelectedOrganizerId(organizers[0].organizer_id);
        setUserRole(organizers[0].role);
      } else if (organizers.length > 1 && !selectedOrganizerId) {
        // Si plusieurs, demander de sélectionner
        setSelectedOrganizerId(null);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des organisateurs:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors du chargement de vos organisateurs.",
        confirmText: "OK",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrganizerData(organizerId: string) {
    try {
      setLoading(true);

      // Trouver le rôle de l'utilisateur pour cet organisateur
      const userOrg = userOrganizers.find((uo) => uo.organizer_id === organizerId);
      if (userOrg) {
        setUserRole(userOrg.role);
      }

      // Charger les données de l'organisateur (depuis organizers ou locations)
      const [organizerResult, locationResult] = await Promise.all([
        supabase.from("organizers").select("*").eq("id", organizerId).single(),
        supabase.from("locations").select("*").eq("id", organizerId).eq("is_organizer", true).single(),
      ]);

      let data: OrganizerData | null = null;

      if (organizerResult.data && !organizerResult.error) {
        data = {
          ...organizerResult.data,
          type: "organizer" as const,
        };
      } else if (locationResult.data && !locationResult.error) {
        data = {
          id: locationResult.data.id,
          name: locationResult.data.name,
          logo_url: locationResult.data.image_url,
          short_description: locationResult.data.description || null,
          instagram_url: locationResult.data.instagram_url || null,
          facebook_url: locationResult.data.facebook_url || null,
          tiktok_url: locationResult.data.tiktok_url || null,
          facebook_page_id: locationResult.data.facebook_page_id || null,
          website_url: locationResult.data.website_url || null,
          scraping_example_url: locationResult.data.scraping_example_url || null,
          type: "location" as const,
        };
      }

      if (!data) {
        showAlert({
          title: "Erreur",
          description: "Organisateur non trouvé.",
          confirmText: "OK",
        });
        return;
      }

      setOrganizerData(data);
      setFormData({
        name: data.name || "",
        short_description: data.short_description || "",
        instagram_url: data.instagram_url || "",
        facebook_url: data.facebook_url || "",
        tiktok_url: data.tiktok_url || "",
        facebook_page_id: data.facebook_page_id || "",
        website_url: data.website_url || "",
        scraping_example_url: data.scraping_example_url || "",
      });
      setLogoPreview(data.logo_url);
      setOriginalImageSrc(data.logo_url);
    } catch (error) {
      console.error("Erreur lors du chargement:", error);
      showAlert({
        title: "Erreur",
        description: "Erreur lors du chargement des données.",
        confirmText: "OK",
      });
    } finally {
      setLoading(false);
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
      showAlert({
        title: "Erreur",
        description: "Erreur lors du rognage de l'image",
        confirmText: "OK",
      });
    }
  }

  async function handleImageUpload(): Promise<string | null> {
    if (!logoFile) return organizerData?.logo_url || null;
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
        title: "Erreur",
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

    if (userRole !== "owner") {
      showAlert({
        title: "Permission refusée",
        description: "Seuls les propriétaires peuvent modifier le profil.",
        confirmText: "OK",
      });
      return;
    }

    if (!selectedOrganizerId || !organizerData) {
      showAlert({
        title: "Erreur",
        description: "Veuillez sélectionner un organisateur.",
        confirmText: "OK",
      });
      return;
    }

    try {
      setSaving(true);
      let finalLogoUrl = organizerData.logo_url;
      if (logoFile) {
        const uploadedUrl = await handleImageUpload();
        if (uploadedUrl) finalLogoUrl = uploadedUrl;
        else {
          setSaving(false);
          return;
        }
      }

      const updateData: any = {
        name: formData.name,
        short_description: formData.short_description || null,
        instagram_url: formData.instagram_url || null,
        facebook_url: formData.facebook_url || null,
        tiktok_url: formData.tiktok_url || null,
        facebook_page_id: formData.facebook_page_id || null,
        website_url: formData.website_url || null,
        scraping_example_url: formData.scraping_example_url || null,
      };

      if (organizerData.type === "organizer") {
        updateData.logo_url = finalLogoUrl || null;
        const { error } = await supabase
          .from("organizers")
          .update(updateData)
          .eq("id", selectedOrganizerId);
        if (error) throw error;
      } else {
        // Pour les locations, mettre à jour image_url et autres champs
        updateData.image_url = finalLogoUrl || null;
        updateData.description = formData.short_description || null;
        const { error } = await supabase
          .from("locations")
          .update(updateData)
          .eq("id", selectedOrganizerId);
        if (error) throw error;
      }

      // Recharger les données
      await loadOrganizerData(selectedOrganizerId);
      showAlert({
        title: "Succès",
        description: "Profil mis à jour avec succès !",
        confirmText: "OK",
      });
    } catch (error: any) {
      console.error("Erreur:", error);
      showAlert({
        title: "Erreur",
        description: error.message || "Erreur lors de la mise à jour",
        confirmText: "OK",
      });
    } finally {
      setSaving(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }

  const canEdit = userRole === "owner";

  if (loading && !organizerData) {
    return (
      <OrganizerLayout title="Mon profil">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-2">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </div>
        </div>
      </OrganizerLayout>
    );
  }

  if (userOrganizers.length === 0) {
    return (
      <OrganizerLayout title="Mon profil">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucun organisateur associé</p>
            </div>
          </CardContent>
        </Card>
      </OrganizerLayout>
    );
  }

  return (
    <OrganizerLayout title="Mon profil">
      <div className="space-y-6">
        {userOrganizers.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Sélectionner un organisateur</CardTitle>
              <CardDescription>Vous gérez plusieurs organisateurs. Sélectionnez celui à éditer.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedOrganizerId || ""} onValueChange={setSelectedOrganizerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un organisateur" />
                </SelectTrigger>
                <SelectContent>
                  {userOrganizers.map((uo) => (
                    <SelectItem key={uo.organizer_id} value={uo.organizer_id}>
                      {uo.organizer?.name || uo.organizer_id}
                      {uo.role === "owner" && (
                        <Badge variant="outline" className="ml-2">Propriétaire</Badge>
                      )}
                      {uo.role === "editor" && (
                        <Badge variant="outline" className="ml-2">Éditeur</Badge>
                      )}
                      {uo.role === "viewer" && (
                        <Badge variant="outline" className="ml-2">Visualiseur</Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {selectedOrganizerId && organizerData && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informations générales */}
            <Card>
              <CardHeader>
                <CardTitle>Informations générales</CardTitle>
                <CardDescription>
                  {canEdit
                    ? "Modifiez les informations de votre organisateur."
                    : "Vous pouvez consulter les informations mais vous n'avez pas les permissions pour les modifier."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Logo */}
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20">
                      {logoPreview ? (
                        <AvatarImage src={logoPreview} alt={formData.name} />
                      ) : null}
                      <AvatarFallback>{getInitials(formData.name)}</AvatarFallback>
                    </Avatar>
                    {canEdit && (
                      <div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoChange}
                          className="hidden"
                          id="logo-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById("logo-upload")?.click()}
                          disabled={uploading}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {logoPreview ? "Changer" : "Téléverser"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nom */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nom *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={!canEdit}
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.short_description}
                    onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                    rows={4}
                    disabled={!canEdit}
                    placeholder="Description courte de l'organisateur..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Réseaux sociaux et liens */}
            <Card>
              <CardHeader>
                <CardTitle>Réseaux sociaux et liens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="instagram">
                      <Instagram className="inline h-4 w-4 mr-2" />
                      Instagram
                    </Label>
                    <Input
                      id="instagram"
                      type="url"
                      value={formData.instagram_url}
                      onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                      placeholder="https://instagram.com/..."
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="facebook">
                      <Facebook className="inline h-4 w-4 mr-2" />
                      Facebook
                    </Label>
                    <Input
                      id="facebook"
                      type="url"
                      value={formData.facebook_url}
                      onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                      placeholder="https://facebook.com/..."
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tiktok">
                      <Music className="inline h-4 w-4 mr-2" />
                      TikTok
                    </Label>
                    <Input
                      id="tiktok"
                      type="url"
                      value={formData.tiktok_url}
                      onChange={(e) => setFormData({ ...formData, tiktok_url: e.target.value })}
                      placeholder="https://tiktok.com/@..."
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">
                      <Globe className="inline h-4 w-4 mr-2" />
                      Site web
                    </Label>
                    <Input
                      id="website"
                      type="url"
                      value={formData.website_url}
                      onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                      placeholder="https://..."
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Paramètres avancés */}
            <Card>
              <CardHeader>
                <CardTitle>Paramètres avancés</CardTitle>
                <CardDescription>Pour l'import automatique d'événements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="facebook_page_id">
                    <Facebook className="inline h-4 w-4 mr-2" />
                    ID Page Facebook
                  </Label>
                  <Input
                    id="facebook_page_id"
                    value={formData.facebook_page_id}
                    onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
                    placeholder="123456789012345"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground">
                    ID de votre page Facebook pour l'import automatique d'événements
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scraping_url">
                    <Code className="inline h-4 w-4 mr-2" />
                    URL d'exemple pour scraping
                  </Label>
                  <Input
                    id="scraping_url"
                    type="url"
                    value={formData.scraping_example_url}
                    onChange={(e) => setFormData({ ...formData, scraping_example_url: e.target.value })}
                    placeholder="https://example.com/events"
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground">
                    URL d'exemple pour l'import automatique depuis votre site web
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bouton de sauvegarde */}
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || uploading}>
                  {saving || uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Enregistrer les modifications
                    </>
                  )}
                </Button>
              </div>
            )}

            {!canEdit && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <p>
                      Vous avez un rôle "{userRole === "editor" ? "éditeur" : "visualiseur"}". 
                      Seuls les propriétaires peuvent modifier le profil.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </form>
        )}

        {/* Dialog pour le cropper */}
        <Dialog open={showCropper} onOpenChange={setShowCropper}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Rogner le logo</DialogTitle>
              <DialogDescription>Ajustez le logo. L'image sera compressée à moins de 2MB.</DialogDescription>
            </DialogHeader>
            {cropImageSrc && (
              <div className="relative h-[400px] w-full">
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCropper(false)}>
                Annuler
              </Button>
              <Button onClick={handleCropComplete}>Confirmer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <AlertDialogComponent />
    </OrganizerLayout>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <OrganizerLayout title="Mon profil">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </OrganizerLayout>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}


