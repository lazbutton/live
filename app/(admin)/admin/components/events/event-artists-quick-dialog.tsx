"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";

import type { AdminEvent, ArtistOption } from "./types";

type EventArtistsQuickDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: AdminEvent | null;
  artists: ArtistOption[];
  onSave: (event: AdminEvent, artistIds: string[]) => Promise<boolean>;
};

export function EventArtistsQuickDialog({
  open,
  onOpenChange,
  event,
  artists,
  onSave,
}: EventArtistsQuickDialogProps) {
  const [selectedArtistIds, setSelectedArtistIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open || !event) return;

    const currentArtistIds =
      [...(event.event_artists || [])]
        .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
        .map((entry) => entry.artist?.id || null)
        .filter((artistId): artistId is string => Boolean(artistId)) || [];

    setSelectedArtistIds(currentArtistIds);
  }, [event, open]);

  const artistOptions = React.useMemo(
    () =>
      artists.map((artist) => ({
        value: artist.id,
        label: artist.name,
      })),
    [artists],
  );

  async function handleSave() {
    if (!event || saving) return;
    setSaving(true);
    try {
      const success = await onSave(event, selectedArtistIds);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Artistes / collaborateurs</DialogTitle>
          <DialogDescription>
            Gère rapidement les artistes liés à <strong>{event?.title || "cet événement"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Artistes liés</Label>
          <MultiSelect
            options={artistOptions}
            selected={selectedArtistIds}
            onChange={setSelectedArtistIds}
            placeholder="Sélectionner des artistes"
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            L’ordre de sélection est repris comme ordre d’affichage sur la fiche publique.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
