"use client";

import Link from "next/link";
import { AlertCircle, CalendarClock, FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
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
  icon: Icon,
  href,
  onClick,
  tone,
  emphasize,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  tone: "warning" | "info" | "cyan";
  emphasize?: boolean;
}) {
  const tones: Record<"warning" | "info" | "cyan", { gradient: string; icon: string }> = {
    warning: { gradient: "from-amber-500/20 via-orange-500/10 to-red-500/20", icon: "text-amber-600" },
    info: { gradient: "from-blue-500/20 via-indigo-500/10 to-purple-500/20", icon: "text-blue-600" },
    cyan: { gradient: "from-cyan-500/20 via-sky-500/10 to-blue-500/20", icon: "text-cyan-600" },
  } as const;

  const wrapClass = cn(
    "group relative overflow-hidden transition-all duration-300",
    "hover:shadow-xl hover:scale-[1.02] hover:border-primary/50",
    emphasize && value > 0 && "ring-2 ring-offset-2 ring-offset-background ring-amber-500/20 border-amber-500/30",
  );

  const inner = (
    <Card className={wrapClass}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none", tones[tone].gradient)} />
      <CardContent className="relative z-10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground/90">{title}</div>
            <div className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{value}</div>
          </div>
          <div className="rounded-xl bg-background/80 backdrop-blur-sm p-2.5 transition-transform group-hover:scale-110">
            <Icon className={cn("h-5 w-5", tones[tone].icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {inner}
    </button>
  );
}

export function KpiCards({ pendingEvents, weekCount, pendingRequests, onRequestsClick }: KpiCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KpiCard
        title="Événements pending"
        value={pendingEvents}
        icon={AlertCircle}
        href="/admin/events?status=pending"
        tone="warning"
        emphasize
      />
      <KpiCard
        title="Cette semaine"
        value={weekCount}
        icon={CalendarClock}
        href="/admin/events"
        tone="info"
      />
      <KpiCard
        title="Demandes en attente"
        value={pendingRequests}
        icon={FileText}
        onClick={onRequestsClick}
        tone="cyan"
        emphasize={pendingRequests > 0}
      />
    </div>
  );
}

