"use client";

import * as React from "react";
import { Crop, ImagePlus, Link2, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { compressImage } from "@/lib/image-compression";
import { fetchAdminProxiedImageObjectUrl, isHttpImageUrl } from "@/lib/events/remote-image";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ImageCropDialog } from "../directory/image-crop-dialog";

export type EventImageUploadProps = {
  /** Aperçu courant : URL distante, URL de stockage ou objet local (blob:). */
  currentImageUrl: string | null;
  onImageChange: (file: File | null, previewUrl: string | null) => void;
  onUrlChange: (url: string) => void;
  disabled?: boolean;
  className?: string;
  /** Accepte une image collée (⌘V) hors des champs de saisie. */
  enablePaste?: boolean;
};

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const EVENT_IMAGE_ASPECT = 3 / 2;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isStoredEventImage(url: string) {
  return /\/storage\/v1\/object\/public\/event-images\//.test(url);
}

/** Affiche de l'événement : glisser-déposer, import, collage, URL et recadrage 3:2. */
export function EventImageUpload({
  currentImageUrl,
  onImageChange,
  onUrlChange,
  disabled,
  className,
  enablePaste = false,
}: EventImageUploadProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const remoteObjectUrlRef = React.useRef<string | null>(null);
  const [cropSource, setCropSource] = React.useState<string | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [showUrlField, setShowUrlField] = React.useState(false);

  const preview = currentImageUrl;
  const isRemote = Boolean(preview && isHttpImageUrl(preview));
  const [urlDraft, setUrlDraft] = React.useState(isRemote ? (preview as string) : "");

  React.useEffect(() => {
    setUrlDraft(currentImageUrl && isHttpImageUrl(currentImageUrl) ? currentImageUrl : "");
  }, [currentImageUrl]);

  const releaseRemoteObjectUrl = React.useCallback(() => {
    if (remoteObjectUrlRef.current) {
      URL.revokeObjectURL(remoteObjectUrlRef.current);
      remoteObjectUrlRef.current = null;
    }
  }, []);

  React.useEffect(() => releaseRemoteObjectUrl, [releaseRemoteObjectUrl]);

  const handleFile = React.useCallback((file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Fichier invalide", description: "Choisis une image (JPG, PNG, WebP).", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "Image trop lourde", description: "15 Mo maximum.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setCropSource(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  // Collage d'une affiche (⌘V) hors des champs de saisie.
  React.useEffect(() => {
    if (!enablePaste || disabled) return;
    function handlePaste(event: ClipboardEvent) {
      if (cropSource || isTypingTarget(event.target)) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((entry) => entry.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      handleFile(file);
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [cropSource, disabled, enablePaste, handleFile]);

  async function openRecrop() {
    if (!preview || disabled) return;
    if (!isHttpImageUrl(preview)) {
      setCropSource(preview);
      return;
    }
    // Les images distantes passent par le proxy admin (CORS) avant recadrage.
    setPreparing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Session admin absente.");
      releaseRemoteObjectUrl();
      const objectUrl = await fetchAdminProxiedImageObjectUrl({ source: preview, accessToken });
      remoteObjectUrlRef.current = objectUrl;
      setCropSource(objectUrl);
    } catch (error) {
      console.error("Erreur préparation recadrage:", error);
      toast({
        title: "Recadrage indisponible",
        description: "L’image distante n’a pas pu être chargée. Importe le fichier directement.",
        variant: "destructive",
      });
    } finally {
      setPreparing(false);
    }
  }

  async function handleCropConfirm(blob: Blob) {
    setPreparing(true);
    try {
      const cropped = new File([blob], `event-${Date.now()}.jpg`, { type: "image/jpeg" });
      const compressed = await compressImage(cropped, 2);
      onImageChange(compressed, URL.createObjectURL(compressed));
      setShowUrlField(false);
    } catch (error) {
      console.error("Erreur compression image:", error);
      toast({ title: "Image inutilisable", description: "Réessaie avec une autre image.", variant: "destructive" });
    } finally {
      setPreparing(false);
    }
  }

  function clearImage() {
    setUrlDraft("");
    onImageChange(null, null);
  }

  function commitUrl() {
    const next = urlDraft.trim();
    const current = isRemote ? (preview as string) : "";
    if (next === current) return;
    if (!next) {
      clearImage();
      return;
    }
    onUrlChange(next);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith("image/"));
    if (file) {
      handleFile(file);
      return;
    }
    const droppedUrl = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (droppedUrl && isHttpImageUrl(droppedUrl.trim())) {
      setUrlDraft(droppedUrl.trim());
      onUrlChange(droppedUrl.trim());
    }
  }

  const dropHandlers = {
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      if (disabled) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: handleDrop,
  };

  return (
    <div className={cn("space-y-3", className)}>
      {preview ? (
        <div className="space-y-2">
          <div
            {...dropHandlers}
            className={cn(
              "relative aspect-[3/2] overflow-hidden rounded-lg border border-border bg-muted",
              dragging && "ring-[3px] ring-ring/40",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Affiche de l’événement" className="h-full w-full object-cover" />
            {preparing ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus />
              Remplacer
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={disabled || preparing} onClick={() => void openRecrop()}>
              <Crop />
              Recadrer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={clearImage}
              className="ml-auto text-muted-foreground hover:text-destructive"
              aria-label="Retirer l’affiche"
              title="Retirer l’affiche"
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          {...dropHandlers}
          className={cn(
            "flex aspect-[3/2] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background px-4 text-center outline-none transition-colors hover:border-foreground/30 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
            dragging && "border-foreground/40 bg-accent/60",
          )}
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
            <ImagePlus className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium">Ajouter une affiche</span>
          <span className="text-xs text-muted-foreground">
            Glisse une image, clique pour choisir{enablePaste ? " ou colle-la (⌘V)" : ""}
          </span>
        </button>
      )}

      {showUrlField || isRemote ? (
        <div className="space-y-1.5">
          <Input
            type="url"
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onBlur={commitUrl}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitUrl();
              }
            }}
            placeholder="https://… (URL de l’image)"
            disabled={disabled}
            aria-label="URL de l’image"
            className="h-8 text-xs"
          />
          {isRemote && preview && !isStoredEventImage(preview) ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Image distante : elle sera copiée dans le stockage OutLive à l’enregistrement.
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowUrlField(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:underline"
        >
          <Link2 className="h-3.5 w-3.5" />
          Utiliser une URL
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <ImageCropDialog
        imageSrc={cropSource}
        onOpenChange={(next) => {
          if (!next) {
            setCropSource(null);
            releaseRemoteObjectUrl();
          }
        }}
        defaultAspect={EVENT_IMAGE_ASPECT}
        lockAspect
        title="Recadrer l’affiche"
        onConfirm={(blob) => void handleCropConfirm(blob)}
      />
    </div>
  );
}
