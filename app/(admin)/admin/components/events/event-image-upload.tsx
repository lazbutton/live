"use client";

import * as React from "react";
import Cropper, { Area } from "react-easy-crop";
import { Image as ImageIcon, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { compressImage } from "@/lib/image-compression";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type EventImageUploadProps = {
  currentImageUrl: string | null;
  onImageChange: (file: File | null, previewUrl: string | null) => void;
  onUrlChange: (url: string) => void;
  disabled?: boolean;
  className?: string;
};

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
        pixelCrop.height,
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
        0.9,
      );
    };

    image.onerror = () => reject(new Error("Erreur lors du chargement de l'image"));
  });
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function toProxyImageUrl(url: string, token: string | null) {
  const base = `/api/admin/images/proxy?url=${encodeURIComponent(url)}`;
  if (!token) return base;
  return `${base}&token=${encodeURIComponent(token)}&_cb=${Date.now()}`;
}

export function EventImageUpload({
  currentImageUrl,
  onImageChange,
  onUrlChange,
  disabled,
  className,
}: EventImageUploadProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = React.useState<string | null>(currentImageUrl);
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  const [showCropper, setShowCropper] = React.useState(false);
  const [cropImageSrc, setCropImageSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null);
  const [proxyToken, setProxyToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    // sync externe -> interne seulement si pas de file locale
    if (!imageFile) {
      setPreviewUrl(currentImageUrl);
    }
  }, [currentImageUrl, imageFile]);

  React.useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setProxyToken(data.session?.access_token ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setProxyToken(session?.access_token ?? null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const onCropComplete = React.useCallback((_a: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  function openCropperFromUrl(rawUrl: string) {
    if (isHttpUrl(rawUrl) && !proxyToken) {
      toast({
        title: "Préparation de l'image",
        description: "Réessaie dans un instant.",
        variant: "destructive",
      });
      return;
    }

    const nextCropSrc = isHttpUrl(rawUrl) ? toProxyImageUrl(rawUrl, proxyToken) : rawUrl;
    setCropImageSrc(nextCropSrc);
    setShowCropper(true);
  }

  async function openCropperFromFile(file: File) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setCropImageSrc(dataUrl);
      setShowCropper(true);
    };
    reader.readAsDataURL(file);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Fichier invalide", description: "Sélectionne une image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image trop lourde", description: "Maximum 5MB.", variant: "destructive" });
      return;
    }

    setImageFile(file);
    onUrlChange(""); // si on upload un fichier, on privilégie le fichier
    await openCropperFromFile(file);
  }

  async function applyCrop() {
    if (!cropImageSrc || !croppedAreaPixels) return;

    try {
      const blob = await createCroppedImage(cropImageSrc, croppedAreaPixels);
      const cropped = new File([blob], `event-${Date.now()}.jpg`, { type: "image/jpeg" });
      const compressed = await compressImage(cropped, 2);

      const nextPreview = URL.createObjectURL(compressed);
      setImageFile(compressed);
      setPreviewUrl(nextPreview);
      onImageChange(compressed, nextPreview);
      setShowCropper(false);
      setCropImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (e) {
      console.error("Erreur crop image:", e);
      toast({ title: "Crop impossible", description: "Réessaie avec une autre image.", variant: "destructive" });
    }
  }

  function clearImage() {
    setImageFile(null);
    setPreviewUrl(null);
    setCropImageSrc(null);
    setShowCropper(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onUrlChange("");
    onImageChange(null, null);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="min-w-0">
          {previewUrl ? (
            <div className="relative h-44 w-full overflow-hidden rounded-xl border bg-muted md:h-48">
              <img
                src={previewUrl}
                alt="Aperçu"
                className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-95"
                onClick={() => {
                  if (disabled) return;
                  openCropperFromUrl(previewUrl);
                }}
              />
              {!disabled ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearImage();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <div className="flex items-center gap-2 text-xs text-white/90">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Cliquer pour rogner
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-44 w-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground md:h-48">
              Aucun visuel
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="event-image-file">Fichier</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                id="event-image-file"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={disabled}
                className="cursor-pointer"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Choisir un fichier"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Après sélection, un crop 3:2 est proposé automatiquement.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-image-url">Ou URL</Label>
            <Input
              id="event-image-url"
              type="url"
              placeholder="https://…"
              defaultValue={currentImageUrl || ""}
              disabled={disabled}
              onBlur={(e) => {
                const next = e.target.value.trim();
                onUrlChange(next);
                if (next) {
                  setPreviewUrl(next);
                  setImageFile(null);
                  onImageChange(null, next);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Conseillé si l’image est déjà hébergée (sinon, privilégier l’upload).
            </p>
          </div>
        </div>
      </div>

      <Dialog open={showCropper} onOpenChange={(o) => !disabled && setShowCropper(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Rogner l’image</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border bg-muted">
              {cropImageSrc ? (
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={3 / 2}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCropper(false)}>
                Annuler
              </Button>
              <Button type="button" onClick={() => void applyCrop()}>
                Appliquer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

