"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  ["J / ↓", "Demande suivante"],
  ["K / ↑", "Demande précédente"],
  ["C", "Convertir si la demande est prête"],
  ["E", "Compléter la demande"],
  ["R", "Refuser"],
  ["X", "Demander une correction"],
  ["O", "Ouvrir la source"],
  ["?", "Afficher cette aide"],
] as const;

export function RequestShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raccourcis demandes</DialogTitle>
          <DialogDescription>
            Navigue et traite la file sans quitter le clavier. Les raccourcis
            sont ignorés pendant la saisie.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {SHORTCUTS.map(([shortcut, label]) => (
            <div
              key={shortcut}
              className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">{label}</span>
              <kbd className="rounded-md border bg-muted px-2 py-1 text-xs font-semibold">
                {shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
