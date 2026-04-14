"use client";

import * as React from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  Link2,
  Loader2,
  MapPin,
  SquarePen,
  ThumbsDown,
  Wand2,
} from "lucide-react";

import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import type { AdminModerationReason, AdminRequestItem } from "@/lib/admin-requests";
import { getModerationReasonLabel, getRequestTypeLabel, safeDomainFromUrl } from "@/lib/admin-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { DuplicateEvent } from "./request-types";
import {
  formatEventDate,
  MODERATION_REASONS,
  ReasonBadge,
  StatusBadge,
  SummaryField,
} from "./request-ui";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FoldSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className="rounded-xl border border-border/70 bg-card/70"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{title}</div>
            {subtitle ? (
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">Afficher</span>
        </div>
      </summary>
      <div className="border-t border-border/70 px-4 py-4">{children}</div>
    </details>
  );
}

export function RequestInspector({
  item,
  duplicateEvents,
  duplicateEventsLoading,
  similarRequests,
  internalNotesDraft,
  contributorMessageDraft,
  moderationReasonDraft,
  allowUserResubmissionDraft,
  savingNotes,
  processingId,
  onInternalNotesChange,
  onContributorMessageChange,
  onModerationReasonChange,
  onAllowUserResubmissionChange,
  onSaveNotes,
  onOpenUrl,
  onCopy,
  onConvert,
  onEdit,
  onEditWithPrefill,
  onOpenRelatedRequest,
  onReject,
  onViewEvent,
}: {
  item: AdminRequestItem | null;
  duplicateEvents: DuplicateEvent[];
  duplicateEventsLoading: boolean;
  similarRequests: AdminRequestItem[];
  internalNotesDraft: string;
  contributorMessageDraft: string;
  moderationReasonDraft: AdminModerationReason | "";
  allowUserResubmissionDraft: boolean;
  savingNotes: boolean;
  processingId: string | null;
  onInternalNotesChange: (value: string) => void;
  onContributorMessageChange: (value: string) => void;
  onModerationReasonChange: (value: AdminModerationReason | "") => void;
  onAllowUserResubmissionChange: (value: boolean) => void;
  onSaveNotes: () => void;
  onOpenUrl: (url: string) => void;
  onCopy: (value: string) => void;
  onConvert: (item: AdminRequestItem) => void;
  onEdit: (item: AdminRequestItem) => void;
  onEditWithPrefill: (item: AdminRequestItem, mode: "url" | "facebook") => void;
  onOpenRelatedRequest: (item: AdminRequestItem) => void;
  onReject: (item: AdminRequestItem) => void;
  onViewEvent: (item: AdminRequestItem) => void;
}) {
  if (!item) {
    return (
      <Card className="border-dashed border-border/70 bg-card/60">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sélectionne une demande dans la file active pour afficher son détail.
        </CardContent>
      </Card>
    );
  }

  const isProcessing = processingId === item.id;
  const sourceDomain = item.sourceUrl ? safeDomainFromUrl(item.sourceUrl) : null;
  const contributor = item.contributorDisplayName || item.requestedBy || "Contributeur inconnu";
  const description =
    typeof item.raw.event_data?.description === "string"
      ? item.raw.event_data.description.trim()
      : "";
  const canUseFacebookPrefill =
    item.requestType === "event_from_url" &&
    item.status === "pending" &&
    Boolean(item.sourceUrl) &&
    isFacebookEventUrl(item.sourceUrl as string);
  const collisionCount = duplicateEvents.length + similarRequests.length;
  const canConvert = item.status === "pending" && item.isFastConvertible;
  const canEdit = item.status === "pending";

  return (
    <div className="space-y-3">
      <Card className="sticky top-[8.5rem] border-border/70 bg-background/95 shadow-sm backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <Badge variant={item.requestType === "event_from_url" ? "outline" : "secondary"}>
              {getRequestTypeLabel(item.requestType)}
            </Badge>
            {sourceDomain ? <Badge variant="outline">{sourceDomain}</Badge> : null}
            {item.moderationReason ? <ReasonBadge reason={item.moderationReason} /> : null}
          </div>

          <div className="space-y-1">
            <CardTitle className="text-xl leading-tight">{item.title}</CardTitle>
            <div className="text-sm text-muted-foreground">
              {contributor} • {formatEventDate(item.eventDate)} •{" "}
              {item.locationSummary || "Lieu non renseigné"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canConvert ? (
              <Button type="button" disabled={isProcessing} onClick={() => onConvert(item)}>
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Convertir
              </Button>
            ) : null}

            {canEdit ? (
              <Button
                type="button"
                variant={canConvert ? "outline" : "default"}
                onClick={() => onEdit(item)}
              >
                <SquarePen className="mr-2 h-4 w-4" />
                Compléter
              </Button>
            ) : null}

            {item.status === "pending" ? (
              <Button type="button" variant="destructive" onClick={() => onReject(item)}>
                <ThumbsDown className="mr-2 h-4 w-4" />
                Rejeter
              </Button>
            ) : null}

            {item.status === "converted" && item.convertedEventId ? (
              <Button type="button" variant="outline" onClick={() => onViewEvent(item)}>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Voir l’événement
              </Button>
            ) : null}
          </div>

          {item.sourceUrl ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenUrl(item.sourceUrl as string)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Source
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onCopy(item.sourceUrl as string)}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copier URL
              </Button>
              {item.requestType === "event_from_url" && item.status === "pending" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditWithPrefill(item, "url")}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Préremplir URL
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditWithPrefill(item, "facebook")}
                    disabled={!canUseFacebookPrefill}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Facebook
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
      </Card>

      <Section title="Résumé">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryField
            label="Date"
            value={formatEventDate(item.eventDate)}
            icon={<CalendarDays className="h-3.5 w-3.5" />}
          />
          <SummaryField
            label="Lieu"
            value={item.locationSummary || "Non renseigné"}
            icon={<MapPin className="h-3.5 w-3.5" />}
          />
          <SummaryField
            label="Catégorie"
            value={item.category || "Non renseignée"}
            icon={<FileSearch className="h-3.5 w-3.5" />}
          />
        </div>

        {item.missingFields.length > 0 && item.status === "pending" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
              À compléter
            </div>
            {item.missingFields.map((field) => (
              <Badge
                key={field}
                variant="outline"
                className="border-amber-500/30 bg-background"
              >
                {field}
              </Badge>
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        title="Feedback de modération"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={savingNotes}
            onClick={onSaveNotes}
          >
            {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="moderation-reason">Motif structuré</Label>
              <Select
                value={moderationReasonDraft}
                onValueChange={(value) =>
                  onModerationReasonChange(value as AdminModerationReason)
                }
              >
                <SelectTrigger id="moderation-reason">
                  <SelectValue placeholder="Sélectionner un motif" />
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

            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Autoriser une reprise</div>
                  <div className="text-xs text-muted-foreground">
                    Affiche la reprise côté app.
                  </div>
                </div>
                <Switch
                  checked={allowUserResubmissionDraft}
                  onCheckedChange={onAllowUserResubmissionChange}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributor-message">Message contributeur</Label>
            <Textarea
              id="contributor-message"
              rows={3}
              value={contributorMessageDraft}
              onChange={(event) => onContributorMessageChange(event.target.value)}
              placeholder="Explique clairement ce qu’il faut corriger."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="internal-notes">Notes internes</Label>
            <Textarea
              id="internal-notes"
              rows={3}
              value={internalNotesDraft}
              onChange={(event) => onInternalNotesChange(event.target.value)}
              placeholder="Contexte interne, arbitrage, vigilance."
            />
          </div>
        </div>
      </Section>

      <FoldSection
        title="Doublons et demandes similaires"
        subtitle={
          duplicateEventsLoading
            ? "Analyse en cours"
            : collisionCount > 0
              ? `${collisionCount} signal${collisionCount > 1 ? "s" : ""} détecté${collisionCount > 1 ? "s" : ""}`
              : "Aucun signal détecté"
        }
        defaultOpen={duplicateEventsLoading || collisionCount > 0}
      >
        <div className="space-y-3">
          {duplicateEventsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Recherche de doublons…
            </div>
          ) : null}

          {duplicateEvents.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Événements potentiels</div>
              {duplicateEvents.map((duplicate) => (
                <button
                  key={duplicate.id}
                  type="button"
                  onClick={() =>
                    onOpenUrl(`/admin/events?view=agenda&start=${duplicate.date.slice(0, 10)}`)
                  }
                  className="w-full rounded-lg border bg-card/60 p-3 text-left transition-colors hover:bg-accent/10"
                >
                  <div className="font-medium">{duplicate.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatEventDate(duplicate.date)}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {similarRequests.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Demandes similaires</div>
              {similarRequests.map((similar) => (
                <button
                  key={similar.id}
                  type="button"
                  onClick={() => onOpenRelatedRequest(similar)}
                  className="w-full rounded-lg border bg-card/60 p-3 text-left transition-colors hover:bg-accent/10"
                >
                  <div className="font-medium">{similar.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatEventDate(similar.eventDate)} •{" "}
                    {similar.locationSummary || "Lieu inconnu"}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!duplicateEventsLoading && collisionCount === 0 ? (
            <div className="text-sm text-muted-foreground">
              Aucun doublon évident détecté pour cette demande.
            </div>
          ) : null}
        </div>
      </FoldSection>

      {description ? (
        <FoldSection title="Description" subtitle="Contenu fourni par le contributeur">
          <div className="text-sm leading-relaxed">{description}</div>
        </FoldSection>
      ) : null}

      <FoldSection title="Données brutes" subtitle="Champs stockés pour diagnostic">
        <pre className="overflow-auto whitespace-pre-wrap text-xs">
{JSON.stringify(
  {
    status: item.status,
    request_type: item.requestType,
    requested_at: item.requestedAt,
    reviewed_at: item.reviewedAt,
    source_url: item.sourceUrl,
    converted_event_id: item.convertedEventId,
    notes: item.notes,
    internal_notes: item.internalNotes,
    moderation_reason: item.moderationReason,
    contributor_message: item.contributorMessage,
    allow_user_resubmission: item.allowUserResubmission,
    event_data: item.raw.event_data,
  },
  null,
  2,
)}
        </pre>
      </FoldSection>
    </div>
  );
}
