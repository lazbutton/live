"use client";

import * as React from "react";
import { Loader2, ScanText } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import type {
  ImportedEventAnalysisResult,
  ImportedEventWarning,
} from "@/lib/events/imported-event-payload";

type EventImageImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (payload: ImportedEventAnalysisResult) => void | Promise<void>;
};

export function EventImageImportDialog({
  open,
  onOpenChange,
  onImported,
}: EventImageImportDialogProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imageUrl, setImageUrl] = React.useState("");
  const [isImporting, setIsImporting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setImageFile(null);
      setImageUrl("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  async function handleImport() {
    if (!imageFile && !imageUrl.trim()) {
      toast({
        title: "Image requise",
        description:
          "Ajoute un fichier image ou une URL avant de lancer l'analyse.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsImporting(true);

      const payload = new FormData();
      if (imageFile) {
        payload.append("image", imageFile);
      }
      if (imageUrl.trim()) {
        payload.append("imageUrl", imageUrl.trim());
      }

      const response = await fetch("/api/events/extract-from-image", {
        method: "POST",
        body: payload,
      });

      const result = (await response.json().catch(() => ({}))) as {
        data?: ImportedEventAnalysisResult["data"];
        metadata?: Record<string, unknown>;
        warnings?: ImportedEventWarning[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result?.error || "Impossible d'analyser l'image de l'evenement.",
        );
      }

      await onImported({
        data: result.data || {},
        metadata: result.metadata,
        warnings: result.warnings || [],
      });

      toast({
        title: "Analyse terminee",
        description:
          "Le formulaire a ete pre-rempli. Verifie les champs avant d'enregistrer.",
        variant: "success",
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Erreur import image evenement:", error);
      toast({
        title: "Analyse impossible",
        description:
          error instanceof Error ? error.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isImporting && onOpenChange(next)}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer à partir d’une image</DialogTitle>
          <DialogDescription>
            Ajoute une affiche ou une URL d’image, puis on extrait
            automatiquement les informations de l’événement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="event-image-import-file">Fichier image</Label>
            <Input
              ref={fileInputRef}
              id="event-image-import-file"
              type="file"
              accept="image/*"
              onChange={(event) =>
                setImageFile(event.target.files?.[0] || null)
              }
              disabled={isImporting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-image-import-url">Ou URL d’image</Label>
            <Input
              id="event-image-import-url"
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              disabled={isImporting}
            />
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Utilise ce bouton quand tu veux creer un evenement a partir d’une
            affiche, sans passer par l’image finale de l’evenement.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting || (!imageFile && !imageUrl.trim())}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyse...
                </>
              ) : (
                <>
                  <ScanText className="mr-2 h-4 w-4" />
                  Créer à partir d’une image
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
