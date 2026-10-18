"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CalendarCheck2, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export type KpiCardsProps = {
  pendingEvents: number;
  weekCount: number;
  pendingRequests: number;
  onRequestsClick: () => void;
};

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  href,
  onClick,
  needsAttention,
}: {
  title: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  needsAttention?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-muted-foreground sm:text-sm">{title}</span>
        <Icon className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      </div>
      <div className="mt-2 flex items-center gap-2 sm:mt-3">
        <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl">
          {value}
        </span>
        {needsAttention && value > 0 ? (
          <>
            <span className="size-2 rounded-full bg-warning sm:hidden" aria-label="À traiter" />
            <span className="hidden items-center gap-1.5 rounded-md border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning sm:inline-flex">
              <span className="size-1.5 rounded-full bg-warning" />
              À traiter
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-3 hidden items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground sm:flex">
        {hint}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </div>
    </>
  );

  const className = cn(
    "group block w-full rounded-xl border border-border bg-card p-3 text-left shadow-xs outline-none transition-[border-color,box-shadow] duration-150 sm:p-4",
    "hover:border-foreground/20 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/40",
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function todayLocalDateKey() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function KpiCards({ pendingEvents, weekCount, pendingRequests, onRequestsClick }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <KpiCard
        title="Événements en attente"
        value={pendingEvents}
        hint="Valider les événements"
        icon={CalendarCheck2}
        href="/admin/events?status=pending"
        needsAttention
      />
      <KpiCard
        title="7 prochains jours"
        value={weekCount}
        hint="Ouvrir l'agenda"
        icon={CalendarClock}
        href={`/admin/events?view=agenda&start=${todayLocalDateKey()}`}
      />
      <KpiCard
        title="Demandes en attente"
        value={pendingRequests}
        hint="Traiter la file"
        icon={Inbox}
        onClick={onRequestsClick}
        needsAttention
      />
    </div>
  );
}
