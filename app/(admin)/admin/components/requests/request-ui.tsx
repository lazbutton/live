"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  Link2,
  LucideIcon,
  Sparkles,
  SquarePen,
} from "lucide-react";

import type {
  AdminModerationReason,
  AdminRequestLane,
  AdminRequestStatus,
} from "@/lib/admin-requests";
import {
  getModerationReasonLabel,
  getRequestLaneLabel,
  getRequestStatusLabel,
} from "@/lib/admin-requests";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateWithoutTimezone } from "@/lib/date-utils";

export const REQUEST_LANES: AdminRequestLane[] = [
  "ready",
  "to_process",
  "from_url",
  "blocked",
  "processed",
];

export const MODERATION_REASONS: AdminModerationReason[] = [
  "duplicate",
  "invalid_date",
  "insufficient_info",
  "unreliable_source",
  "out_of_scope",
];

type RequestLaneMeta = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: LucideIcon;
  accentClassName: string;
  softClassName: string;
  borderClassName: string;
  dotClassName: string;
};

const REQUEST_LANE_META: Record<AdminRequestLane, RequestLaneMeta> = {
  ready: {
    title: "Prêtes",
    description: "Demandes convertibles rapidement.",
    emptyTitle: "Aucune demande prête",
    emptyDescription: "Les conversions 1 clic apparaîtront ici dès qu’une demande est complète.",
    icon: Sparkles,
    accentClassName: "text-emerald-700 dark:text-emerald-300",
    softClassName: "bg-emerald-500/10",
    borderClassName: "border-emerald-500/20",
    dotClassName: "bg-emerald-500",
  },
  to_process: {
    title: "À compléter",
    description: "Demandes à relire ou enrichir.",
    emptyTitle: "Rien à compléter",
    emptyDescription: "Les demandes incomplètes ou ambiguës seront rangées dans cette colonne.",
    icon: SquarePen,
    accentClassName: "text-amber-700 dark:text-amber-300",
    softClassName: "bg-amber-500/10",
    borderClassName: "border-amber-500/20",
    dotClassName: "bg-amber-500",
  },
  from_url: {
    title: "Depuis URL",
    description: "Demandes à enrichir depuis une source externe.",
    emptyTitle: "Aucune URL en attente",
    emptyDescription: "Les demandes provenant d’une URL apparaîtront ici pour relecture.",
    icon: Link2,
    accentClassName: "text-sky-700 dark:text-sky-300",
    softClassName: "bg-sky-500/10",
    borderClassName: "border-sky-500/20",
    dotClassName: "bg-sky-500",
  },
  blocked: {
    title: "Bloquées",
    description: "Demandes passées ou à trancher.",
    emptyTitle: "Aucune demande bloquée",
    emptyDescription: "Les cas obsolètes ou sensibles seront regroupés ici pour être tranchés vite.",
    icon: CircleAlert,
    accentClassName: "text-rose-700 dark:text-rose-300",
    softClassName: "bg-rose-500/10",
    borderClassName: "border-rose-500/20",
    dotClassName: "bg-rose-500",
  },
  processed: {
    title: "Traitées",
    description: "Historique des décisions prises.",
    emptyTitle: "Aucune demande traitée",
    emptyDescription: "L’historique des décisions apparaîtra ici au fur et à mesure.",
    icon: CheckCircle2,
    accentClassName: "text-muted-foreground",
    softClassName: "bg-muted",
    borderClassName: "border-border",
    dotClassName: "bg-muted-foreground/60",
  },
};

export function formatEventDate(value: string | null) {
  if (!value) return "Non renseignée";

  try {
    return formatDateWithoutTimezone(value, "PPp");
  } catch {
    return value;
  }
}

export function getLaneMeta(lane: AdminRequestLane) {
  return REQUEST_LANE_META[lane];
}

export function getLaneBadgeClassName(lane: AdminRequestLane) {
  switch (lane) {
    case "ready":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "to_process":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "from_url":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "blocked":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "processed":
      return "border-border bg-muted text-muted-foreground";
  }
}

function getStatusBadgeClassName(status: AdminRequestStatus) {
  switch (status) {
    case "converted":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "rejected":
      return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "approved":
      return "border-border bg-muted/70 text-foreground";
    case "pending":
    default:
      return "border-border bg-muted/60 text-muted-foreground";
  }
}

export function LaneBadge({ lane }: { lane: AdminRequestLane }) {
  return (
    <Badge className={cn("border text-[11px]", getLaneBadgeClassName(lane))}>
      {getRequestLaneLabel(lane)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: AdminRequestStatus }) {
  return (
    <Badge className={cn("border text-[11px]", getStatusBadgeClassName(status))}>
      {getRequestStatusLabel(status)}
    </Badge>
  );
}

export function ReasonBadge({ reason }: { reason: AdminModerationReason }) {
  return (
    <Badge variant="outline" className="text-[11px] text-muted-foreground">
      {getModerationReasonLabel(reason)}
    </Badge>
  );
}

export function SummaryField({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium leading-snug">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function LaneCountPill({
  lane,
  count,
  active,
  subtle = false,
}: {
  lane: AdminRequestLane;
  count: number;
  active: boolean;
  subtle?: boolean;
}) {
  const meta = getLaneMeta(lane);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border text-sm transition-colors",
        subtle ? "px-2.5 py-1 text-xs" : "px-3 py-1.5",
        active ? meta.borderClassName : "border-border/70",
        active ? meta.softClassName : subtle ? "bg-transparent text-muted-foreground" : "bg-background",
      )}
    >
      <span className={cn(active ? "font-medium" : "text-muted-foreground", subtle && "tracking-tight")}>
        {meta.title}
      </span>
      <Badge
        variant={active ? "secondary" : "outline"}
        className={cn(subtle && "px-1.5 py-0 text-[10px]")}
      >
        {count}
      </Badge>
    </div>
  );
}
