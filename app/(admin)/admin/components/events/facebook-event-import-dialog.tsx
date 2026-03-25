"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";

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
import { SelectSearchable } from "@/components/ui/select-searchable";
import { toast } from "@/components/ui/use-toast";
import { isFacebookEventUrl } from "@/lib/facebook/event-url";

import type { OrganizerOption } from "./types";
import type { ScrapedEventPayload } from "./event-import-dialog";

export type FacebookEventImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizers: OrganizerOption[];
  onImported: (payload: {
    sourceUrl: string;
    owner?: OrganizerOption;
    data: ScrapedEventPayload;
    metadata?: Record<string, unknown>;
  }) => void | Promise<void>;
};

export function FacebookEventImportDialog({
  open,
  onOpenChange,
  organizers,
  onImported,
}: FacebookEventImportDialogProps) {
  const [importUrl, setImportUrl] = React.useState("");
  const [importOwnerId, setImportOwnerId] = React.useState<string>("");
  const [isImporting, setIsImporting] = React.useState(false);

  const organizerOptions = React.useMemo(
    () => [
      { value: "", label: "Aucun organisateur ni lieu" },
      ...organizers.map((org) => ({
        value: org.id,
        label: `${org.name}${org.type === "location" ? " (Lieu)" : ""}`,
      })),
    ],
    [organizers],
  );

  async function handleImport() {
    if (!importUrl.trim()) {
      toast({
        title: "URL requise",
        description: "Ajoute une URL d'événement Facebook pour importer l'événement.",
        variant: "destructive",
      });
      return;
    }

    try {
      new URL(importUrl.trim());
    } catch {
      toast({
        title: "URL invalide",
        description: "Vérifie le format de l’URL.",
        variant: "destructive",
      });
      return;
    }

    if (!isFacebookEventUrl(importUrl.trim())) {
      toast({
        title: "Lien Facebook attendu",
        description:
          "L’URL doit pointer vers un événement Facebook public.",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    try {
      const selectedOwner = organizers.find(
        (organizer) => organizer.id === importOwnerId,
      );
      const response = await fetch("/api/facebook/events/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: importUrl.trim(),
          organizer_id:
            selectedOwner?.type === "organizer" ? selectedOwner.id : undefined,
          location_id:
            selectedOwner?.type === "location" ? selectedOwner.id : undefined,
        }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json?.error || "Erreur lors de l'import Facebook");
      }

      const result = (await response.json()) as {
        data?: ScrapedEventPayload;
        metadata?: Record<string, unknown>;
      };

      await onImported({
        sourceUrl: importUrl.trim(),
        owner: selectedOwner,
        data: result?.data || {},
        metadata: result?.metadata,
      });

      toast({
        title: "Import Facebook réussi",
        description: "Les champs ont été pré-remplis depuis l’événement Facebook.",
        variant: "success",
      });
      setImportUrl("");
      setImportOwnerId("");
      onOpenChange(false);
    } catch (e: any) {
      console.error("Erreur import Facebook:", e);
      toast({
        title: "Import Facebook impossible",
        description: e?.message || "Une erreur est survenue.",
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
          <DialogTitle>Importer depuis Facebook</DialogTitle>
          <DialogDescription>
            Renseigne l’URL d’un événement Facebook public pour pré-remplir le
            formulaire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="facebook-import-organizer">
              Organisateur ou lieu (optionnel)
            </Label>
            <SelectSearchable
              options={organizerOptions}
              value={importOwnerId}
              onValueChange={setImportOwnerId}
              placeholder="Sélectionner un organisateur ou un lieu"
              searchPlaceholder="Rechercher un organisateur ou un lieu..."
              disabled={isImporting}
            />
            <p className="text-xs text-muted-foreground">
              Si tu sélectionnes un organisateur ou un lieu, il sera proposé par
              défaut dans le formulaire.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="facebook-import-url">URL de l'événement Facebook</Label>
            <Input
              id="facebook-import-url"
              type="url"
              placeholder="https://www.facebook.com/events/1234567890"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isImporting) {
                  e.preventDefault();
                  void handleImport();
                }
              }}
              className="min-h-[44px] text-base"
              disabled={isImporting}
            />
            <p className="text-xs text-muted-foreground">
              Le scraping fonctionne sur les événements Facebook publics.
            </p>
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
              disabled={isImporting || !importUrl.trim()}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Import...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Importer depuis Facebook
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
