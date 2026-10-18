"use client";

import * as React from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";

/** Découpe la zone choisie et renvoie un JPEG. */
export function cropImageToBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
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
        (blob) => (blob ? resolve(blob) : reject(new Error("Erreur lors de la création de l'image"))),
        "image/jpeg",
        0.9,
      );
    };
    image.onerror = () => reject(new Error("Erreur lors du chargement de l'image"));
  });
}

const ASPECT_OPTIONS = [
  { value: "original", label: "Original", ratio: undefined },
  { value: "1", label: "1:1", ratio: 1 },
  { value: "1.5", label: "3:2", ratio: 3 / 2 },
  { value: "1.7778", label: "16:9", ratio: 16 / 9 },
  { value: "0.8", label: "4:5", ratio: 4 / 5 },
] as const;

type AspectValue = (typeof ASPECT_OPTIONS)[number]["value"];

function toAspectValue(ratio?: number): AspectValue {
  if (!ratio) return "original";
  const match = ASPECT_OPTIONS.find((option) => option.ratio && Math.abs(option.ratio - ratio) < 0.01);
  return match?.value ?? "original";
}

/** Fenêtre de recadrage partagée par les fiches lieu, organisateur et artiste. */
export function ImageCropDialog({
  imageSrc,
  onOpenChange,
  defaultAspect,
  lockAspect = false,
  title = "Recadrer l'image",
  onConfirm,
}: {
  /** Image à recadrer ; la fenêtre est ouverte tant qu'elle est définie. */
  imageSrc: string | null;
  onOpenChange: (open: boolean) => void;
  defaultAspect?: number;
  /** Impose `defaultAspect` (masque le choix du format). */
  lockAspect?: boolean;
  title?: string;
  onConfirm: (blob: Blob) => void;
}) {
  const [crop, setCrop] = React.useState({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [aspect, setAspect] = React.useState<AspectValue>(toAspectValue(defaultAspect));
  const [area, setArea] = React.useState<Area | null>(null);
  const [naturalRatio, setNaturalRatio] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!imageSrc) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setNaturalRatio(null);
    setError(null);
    setAspect(toAspectValue(defaultAspect));
  }, [imageSrc, defaultAspect]);

  // « Original » conserve les proportions de l'image importée.
  const ratio = ASPECT_OPTIONS.find((option) => option.value === aspect)?.ratio ?? naturalRatio ?? 4 / 3;

  async function handleConfirm() {
    if (!imageSrc || !area) return;
    setBusy(true);
    setError(null);
    try {
      onConfirm(await cropImageToBlob(imageSrc, area));
      onOpenChange(false);
    } catch (cropError) {
      console.error("Recadrage impossible:", cropError);
      setError("Recadrage impossible : l'image distante bloque peut-être la lecture. Importez le fichier directement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(imageSrc)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="px-5 pb-4 pt-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Faites glisser l&apos;image et ajustez le zoom
            {lockAspect && defaultAspect ? " — format imposé pour l'app." : "."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative h-[min(380px,55vh)] w-full bg-muted">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={ratio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, pixels) => setArea(pixels)}
              onMediaLoaded={(media) => setNaturalRatio(media.naturalWidth / media.naturalHeight)}
              style={{ containerStyle: { width: "100%", height: "100%", position: "relative" } }}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          {lockAspect ? (
            <span className="text-xs text-muted-foreground">
              Format {ASPECT_OPTIONS.find((option) => option.value === aspect)?.label ?? "imposé"}
            </span>
          ) : (
            <SegmentedControl
              aria-label="Format"
              size="sm"
              value={aspect}
              onValueChange={setAspect}
              items={ASPECT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Minus className="h-3.5 w-3.5" aria-hidden />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              aria-label="Zoom"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground sm:w-36"
            />
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </div>
        </div>
        {error ? <p className="px-5 pb-3 text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={busy || !area}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
