"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSearch,
  type LucideIcon,
  Link2,
  Loader2,
  MapPin,
  Sparkles,
  SquarePen,
  ThumbsDown,
  Wand2,
} from "lucide-react";

import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import type { AdminModerationReason, AdminRequestItem } from "@/lib/admin-requests";
import {
  formatRequestAgeShort,
  getModerationReasonLabel,
  getRequestTypeLabel,
  safeDomainFromUrl,
} from "@/lib/admin-requests";
import { formatDateWithoutTimezone } from "@/lib/date-utils";
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
} from "./request-ui";
import { cn } from "@/lib/utils";

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

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function InspectorMetric({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string | null;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-background/80 p-3", className)}>
      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium leading-snug">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ChecklistItem({
  label,
  value,
  present,
}: {
  label: string;
  value: string;
  present: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        present
          ? "border-emerald-500/20 bg-emerald-500/[0.05]"
          : "border-amber-500/20 bg-amber-500/[0.05]",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 shrink-0 rounded-full p-1",
            present
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-1 text-sm leading-snug text-foreground">
            {present ? value : "Non renseigné"}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDecisionCallout(
  item: AdminRequestItem,
  collisionCount: number,
): {
  title: string;
  description?: string;
  toneClassName: string;
  icon: LucideIcon;
} {
  if (item.status === "converted") {
    return {
      title: "Demande déjà convertie",
      toneClassName:
        "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-950 dark:text-emerald-100",
      icon: CheckCircle2,
    };
  }

  if (item.status === "rejected") {
    return {
      title: "Demande déjà rejetée",
      toneClassName:
        "border-rose-500/20 bg-rose-500/[0.07] text-rose-950 dark:text-rose-100",
      icon: AlertTriangle,
    };
  }

  if (collisionCount > 0) {
    return {
      title: "Vérification doublon recommandée",
      toneClassName:
        "border-amber-500/20 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100",
      icon: AlertTriangle,
    };
  }

  if (item.isPast && item.status === "pending") {
    return {
      title: "Date passée ou imminente",
      toneClassName:
        "border-rose-500/20 bg-rose-500/[0.07] text-rose-950 dark:text-rose-100",
      icon: AlertTriangle,
    };
  }

  if (item.isFastConvertible) {
    return {
      title: "Prête à convertir",
      toneClassName:
        "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-950 dark:text-emerald-100",
      icon: Sparkles,
    };
  }

  if (item.requestType === "event_from_url") {
    return {
      title: "À fiabiliser depuis la source",
      toneClassName:
        "border-sky-500/20 bg-sky-500/[0.07] text-sky-950 dark:text-sky-100",
      icon: Link2,
    };
  }

  if (item.missingFields.length > 0) {
    return {
      title: "Compléter avant conversion",
      toneClassName:
        "border-amber-500/20 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100",
      icon: FileSearch,
    };
  }

  return {
    title: "Relecture recommandée",
    toneClassName: "border-border/70 bg-muted/30 text-foreground",
    icon: FileSearch,
  };
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
  panelMode = false,
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
  panelMode?: boolean;
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
      <Card className={cn("border-dashed border-border/70 bg-card/60", panelMode && "h-full")}>
        <CardContent
          className={cn(
            "p-6 text-sm text-muted-foreground",
            panelMode && "flex h-full items-center",
          )}
        >
          Sélectionne une demande dans la file active pour afficher un panneau de décision plus détaillé.
        </CardContent>
      </Card>
    );
  }

  const isProcessing = processingId === item.id;
  const sourceDomain = item.sourceUrl ? safeDomainFromUrl(item.sourceUrl) : null;
  const contributor =
    item.contributorDisplayName || item.requestedBy || "Contributeur inconnu";
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
  const requestedAtLabel = formatDateWithoutTimezone(item.requestedAt, "PPp");
  const requestedAge = formatRequestAgeShort(item.requestedAt);
  const reviewedAtLabel = item.reviewedAt
    ? formatDateWithoutTimezone(item.reviewedAt, "PPp")
    : "Pas encore relue";
  const eventData = item.raw.event_data ?? {};
  const address = normalizeText(eventData.address);
  const externalUrl = normalizeText(eventData.external_url);
  const externalUrlLabel = normalizeText(eventData.external_url_label);
  const scrapingUrl = normalizeText(eventData.scraping_url);
  const priceLabel =
    typeof eventData.price === "number" ? `${eventData.price} €` : null;
  const capacityLabel =
    typeof eventData.capacity === "number"
      ? `${eventData.capacity} places`
      : null;
  const doorOpeningTime = normalizeText(eventData.door_opening_time);
  const sourceLinks = (() => {
    const seen = new Set<string>();
    const candidates = [
      {
        label: "Source d'origine",
        value: item.sourceUrl,
        hint: sourceDomain,
      },
      {
        label: externalUrlLabel || "URL externe",
        value: externalUrl,
        hint: null,
      },
      {
        label: "URL scraping",
        value: scrapingUrl,
        hint: null,
      },
    ];

    return candidates.filter(
      (entry): entry is { label: string; value: string; hint: string | null } => {
        if (!entry.value) return false;
        if (seen.has(entry.value)) return false;
        seen.add(entry.value);
        return true;
      },
    );
  })();
  const coverageItems = [
    ...(item.requestType === "event_from_url"
      ? [
          {
            label: "Source",
            value: sourceDomain || item.sourceUrl || "Non renseignée",
            present: Boolean(item.sourceUrl),
          },
        ]
      : []),
    {
      label: "Titre",
      value: item.title,
      present: Boolean(item.title && item.title !== "(sans titre)"),
    },
    {
      label: "Description",
      value:
        description.length > 96 ? `${description.slice(0, 96).trimEnd()}…` : description,
      present: description.length >= 10,
    },
    {
      label: "Date",
      value: formatEventDate(item.eventDate),
      present: Boolean(item.eventDate),
    },
    {
      label: "Lieu",
      value: item.locationSummary || "Non renseigné",
      present: Boolean(item.locationSummary),
    },
    {
      label: "Adresse",
      value: address || "Non renseignée",
      present: Boolean(address),
    },
    {
      label: "Organisateur",
      value: item.organizerSummary || "Non renseigné",
      present: Boolean(item.organizerSummary),
    },
    {
      label: "Catégorie",
      value: item.category || "Non renseignée",
      present: Boolean(item.category),
    },
  ];
  const coverageCount = coverageItems.filter((entry) => entry.present).length;
  const decisionCallout = getDecisionCallout(item, collisionCount);
  const DecisionIcon = decisionCallout.icon;
  const contextChips = [
    item.category ? `Catégorie ${item.category}` : null,
    item.communityAttributionOptIn ? "Crédit communauté autorisé" : null,
    priceLabel ? `Prix ${priceLabel}` : null,
    capacityLabel ? capacityLabel : null,
    doorOpeningTime ? `Portes ${doorOpeningTime}` : null,
    item.endDate ? `Fin ${formatEventDate(item.endDate)}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className={cn(panelMode && "h-full min-h-0 overflow-y-auto pr-1")}>
      <div className="space-y-4">
      <Card
        className={cn(
          "border-border/70 bg-background/95 shadow-sm backdrop-blur",
          panelMode && "sticky top-0 z-10",
        )}
      >
        <CardHeader className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={item.status} />
            <Badge variant={item.requestType === "event_from_url" ? "outline" : "secondary"}>
              {getRequestTypeLabel(item.requestType)}
            </Badge>
            {item.moderationReason ? <ReasonBadge reason={item.moderationReason} /> : null}
            {sourceDomain ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {sourceDomain}
              </Badge>
            ) : null}
          </div>

          <div className="space-y-0.5">
            <CardTitle className="text-lg leading-tight">{item.title}</CardTitle>
            <div className="text-xs text-muted-foreground">
              {contributor} • demandée {requestedAge || requestedAtLabel}
            </div>
          </div>

          <div className={cn("rounded-xl border px-3 py-2.5", decisionCallout.toneClassName)}>
            <div className="flex items-start gap-2.5">
              <div className="rounded-full bg-background/70 p-1.5">
                <DecisionIcon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">{decisionCallout.title}</div>
                {decisionCallout.description ? (
                  <div className="mt-0.5 text-xs leading-relaxed opacity-90">
                    {decisionCallout.description}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {canConvert ? (
              <Button type="button" size="sm" disabled={isProcessing} onClick={() => onConvert(item)}>
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
                size="sm"
                variant={canConvert ? "outline" : "default"}
                onClick={() => onEdit(item)}
              >
                <SquarePen className="mr-2 h-4 w-4" />
                Compléter
              </Button>
            ) : null}

            {item.status === "pending" ? (
              <Button type="button" size="sm" variant="destructive" onClick={() => onReject(item)}>
                <ThumbsDown className="mr-2 h-4 w-4" />
                Rejeter
              </Button>
            ) : null}

            {item.status === "converted" && item.convertedEventId ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onViewEvent(item)}>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Voir l’événement
              </Button>
            ) : null}

            {item.sourceUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onOpenUrl(item.sourceUrl as string)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Source
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Section title="Résumé rapide">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {item.missingFields.length > 0 ? (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/[0.05] text-amber-800 dark:text-amber-200"
              >
                {item.missingFields.length} champ
                {item.missingFields.length > 1 ? "s" : ""} à compléter
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-800 dark:text-emerald-200"
              >
                Dossier exploitable
              </Badge>
            )}
            {collisionCount > 0 ? (
              <Badge
                variant="outline"
                className="border-rose-500/30 bg-rose-500/[0.05] text-rose-800 dark:text-rose-200"
              >
                {collisionCount} signal{collisionCount > 1 ? "s" : ""} de collision
              </Badge>
            ) : null}
            {item.isPast ? (
              <Badge
                variant="outline"
                className="border-rose-500/30 bg-rose-500/[0.05] text-rose-800 dark:text-rose-200"
              >
                Date passée
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InspectorMetric
              label="Date de l’événement"
              value={formatEventDate(item.eventDate)}
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              className="col-span-2"
            />
            <InspectorMetric
              label="Lieu"
              value={item.locationSummary || "Non renseigné"}
              icon={<MapPin className="h-3.5 w-3.5" />}
              className="col-span-2"
            />
            <InspectorMetric
              label="Organisateur"
              value={item.organizerSummary || "Non renseigné"}
              icon={<FileSearch className="h-3.5 w-3.5" />}
              className="col-span-2"
            />
            <InspectorMetric
              label="Demandée"
              value={requestedAge || requestedAtLabel}
              hint={requestedAtLabel}
            />
            <InspectorMetric label="Dernière revue" value={reviewedAtLabel} />
          </div>

          {description ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Aperçu du contenu
              </div>
              <div className="mt-1 line-clamp-4 text-sm leading-relaxed text-foreground/90">
                {description}
              </div>
            </div>
          ) : null}

          {contextChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {contextChips.map((chip) => (
                <Badge key={chip} variant="outline" className="bg-background/70">
                  {chip}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </Section>

      {(sourceLinks.length > 0 ||
        (item.requestType === "event_from_url" && item.status === "pending")) ? (
        <Section title="Source et import">
          <div className="space-y-3">
            {sourceLinks.map((entry) => (
              <div
                key={`${entry.label}-${entry.value}`}
                className="rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {entry.label}
                    </div>
                    <div className="mt-1 break-all text-sm font-medium">
                      {entry.value}
                    </div>
                    {entry.hint ? (
                      <div className="mt-1 text-xs text-muted-foreground">{entry.hint}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onOpenUrl(entry.value)}
                      title="Ouvrir"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onCopy(entry.value)}
                      title="Copier"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {item.requestType === "event_from_url" && item.status === "pending" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEditWithPrefill(item, "url")}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Préremplir depuis l’URL
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEditWithPrefill(item, "facebook")}
                  disabled={!canUseFacebookPrefill}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Préremplir Facebook
                </Button>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Couverture des infos">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {coverageCount}/{coverageItems.length} signaux présents
            </Badge>
            {item.missingFields.length > 0 ? (
              item.missingFields.map((field) => (
                <Badge
                  key={field}
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/[0.05] text-amber-800 dark:text-amber-200"
                >
                  {field}
                </Badge>
              ))
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-800 dark:text-emerald-200"
              >
                Aucun champ critique manquant
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {coverageItems.map((entry) => (
              <ChecklistItem
                key={entry.label}
                label={entry.label}
                value={entry.value}
                present={entry.present}
              />
            ))}
          </div>
        </div>
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
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            Le message contributeur est visible côté app si la reprise est autorisée. Les notes internes restent privées.
          </div>

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
                  Permet au contributeur de corriger puis de renvoyer la demande.
                </div>
              </div>
              <Switch
                checked={allowUserResubmissionDraft}
                onCheckedChange={onAllowUserResubmissionChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contributor-message">Message contributeur</Label>
            <Textarea
              id="contributor-message"
              rows={4}
              value={contributorMessageDraft}
              onChange={(event) => onContributorMessageChange(event.target.value)}
              placeholder="Explique clairement ce qu’il faut corriger."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="internal-notes">Notes internes</Label>
            <Textarea
              id="internal-notes"
              rows={4}
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
    </div>
  );
}
