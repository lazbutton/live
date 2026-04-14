"use client";

import * as React from "react";
import { Loader2, ThumbsDown } from "lucide-react";

import type { AdminModerationReason, AdminRequestItem } from "@/lib/admin-requests";
import { getModerationReasonLabel } from "@/lib/admin-requests";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MODERATION_REASONS } from "./request-ui";

export function RequestRejectDialog({
  open,
  target,
  internalNotes,
  contributorMessage,
  moderationReason,
  allowResubmission,
  processing,
  onOpenChange,
  onInternalNotesChange,
  onContributorMessageChange,
  onModerationReasonChange,
  onAllowResubmissionChange,
  onConfirm,
}: {
  open: boolean;
  target: AdminRequestItem | null;
  internalNotes: string;
  contributorMessage: string;
  moderationReason: AdminModerationReason | "";
  allowResubmission: boolean;
  processing: boolean;
  onOpenChange: (open: boolean) => void;
  onInternalNotesChange: (value: string) => void;
  onContributorMessageChange: (value: string) => void;
  onModerationReasonChange: (value: AdminModerationReason | "") => void;
  onAllowResubmissionChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeter la demande</DialogTitle>
          <DialogDescription>Motif clair, message utile, décision rapide.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {target ? (
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="text-sm font-medium">{target.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {target.locationSummary || "Lieu non renseigné"} •{" "}
                {target.category || "Catégorie non renseignée"}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="reject-reason-structured">Motif structuré</Label>
            <Select
              value={moderationReason}
              onValueChange={(value) =>
                onModerationReasonChange(value as AdminModerationReason)
              }
            >
              <SelectTrigger id="reject-reason-structured">
                <SelectValue placeholder="Choisissez un motif" />
              </SelectTrigger>
              <SelectContent>
                {MODERATION_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {getModerationReasonLabel(reason)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reject-contributor-message">Message contributeur</Label>
            <Textarea
              id="reject-contributor-message"
              rows={3}
              value={contributorMessage}
              onChange={(event) => onContributorMessageChange(event.target.value)}
              placeholder="Explique ce qu’il faut corriger ou pourquoi la demande est refusée."
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/20 p-3">
            <div>
              <div className="text-sm font-medium">Autoriser une reprise</div>
                  <div className="text-xs text-muted-foreground">Autorise une nouvelle soumission.</div>
            </div>
            <Switch
              checked={allowResubmission}
              onCheckedChange={onAllowResubmissionChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reject-internal-notes">Notes internes</Label>
            <Textarea
              id="reject-internal-notes"
              rows={3}
              value={internalNotes}
              onChange={(event) => onInternalNotesChange(event.target.value)}
              placeholder="Contexte interne non visible côté contributeur."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Annuler
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={processing}>
            {processing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ThumbsDown className="mr-2 h-4 w-4" />
            )}
            Rejeter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
