"use client";

import * as React from "react";
import { Loader2, RotateCcw, ThumbsDown } from "lucide-react";

import type { AdminModerationReason, AdminRequestItem } from "@/lib/admin-requests";
import { getModerationReasonLabel } from "@/lib/admin-requests";
import {
  getDefaultContributorMessage,
  type AdminRequestReviewAction,
} from "@/lib/admin-request-review";
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
import { Textarea } from "@/components/ui/textarea";
import { MODERATION_REASONS } from "./request-ui";

export function RequestRejectDialog({
  open,
  action,
  target,
  internalNotes,
  contributorMessage,
  moderationReason,
  processing,
  onOpenChange,
  onInternalNotesChange,
  onContributorMessageChange,
  onModerationReasonChange,
  onConfirm,
}: {
  open: boolean;
  action: AdminRequestReviewAction;
  target: AdminRequestItem | null;
  internalNotes: string;
  contributorMessage: string;
  moderationReason: AdminModerationReason | "";
  processing: boolean;
  onOpenChange: (open: boolean) => void;
  onInternalNotesChange: (value: string) => void;
  onContributorMessageChange: (value: string) => void;
  onModerationReasonChange: (value: AdminModerationReason | "") => void;
  onConfirm: () => void;
}) {
  const isRequestChanges = action === "request_changes";
  const title = isRequestChanges ? "Demander une correction" : "Refuser définitivement";
  const description = isRequestChanges
    ? "Message clair, reprise autorisée, retour rapide côté utilisateur."
    : "Décision finale, message court et compréhensible côté utilisateur.";
  const confirmLabel = isRequestChanges ? "Demander correction" : "Refuser";
  const ConfirmIcon = isRequestChanges ? RotateCcw : ThumbsDown;

  function handleReasonChange(value: string) {
    const nextReason = value as AdminModerationReason;
    onModerationReasonChange(nextReason);
    if (!contributorMessage.trim()) {
      onContributorMessageChange(getDefaultContributorMessage(action, nextReason));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
              onValueChange={handleReasonChange}
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
              placeholder={
                isRequestChanges
                  ? "Explique ce qu’il faut corriger pour renvoyer la demande."
                  : "Explique brièvement pourquoi la demande est refusée."
              }
            />
            {moderationReason ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0"
                onClick={() =>
                  onContributorMessageChange(
                    getDefaultContributorMessage(action, moderationReason),
                  )
                }
              >
                Utiliser le message recommandé
              </Button>
            ) : null}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div>
              <div className="text-sm font-medium">
                {isRequestChanges ? "Correction possible" : "Refus définitif"}
              </div>
              <div className="text-xs text-muted-foreground">
                {isRequestChanges
                  ? "La demande passera en À corriger côté utilisateur."
                  : "L’utilisateur verra le retour, sans bouton de renvoi."}
              </div>
            </div>
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
          <Button
            type="button"
            variant={isRequestChanges ? "default" : "destructive"}
            onClick={onConfirm}
            disabled={processing}
          >
            {processing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ConfirmIcon className="mr-2 h-4 w-4" />
            )}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
