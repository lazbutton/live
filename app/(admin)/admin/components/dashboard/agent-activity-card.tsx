"use client";

import * as React from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowRight, Bot, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAgentActivity, type AgentActivity, type AgentPublishedEvent } from "@/lib/agent-activity";
import { parseDateWithoutTimezone } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

function formatPassDate(iso: string) {
  const date = new Date(iso);
  const time = format(date, "HH:mm");
  if (isToday(date)) return `Aujourd’hui à ${time}`;
  if (isYesterday(date)) return `Hier à ${time}`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = format(date, sameYear ? "EEEE d MMMM" : "EEEE d MMMM yyyy", { locale: fr });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} à ${time}`;
}

function PassStat({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", dot ?? "bg-transparent")} aria-hidden />
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function PublishedEventRow({ item }: { item: AgentPublishedEvent }) {
  const date = item.current ? parseDateWithoutTimezone(item.current.date) : null;
  const meta = [date ? format(date, "EEE d MMM · HH:mm", { locale: fr }) : null, item.current?.locationName]
    .filter(Boolean)
    .join(" · ");
  const statusBadge = !item.current ? (
    <Badge variant="muted">Supprimé</Badge>
  ) : item.current.status === "pending" ? (
    <Badge variant="warning">En attente</Badge>
  ) : item.current.status === "rejected" ? (
    <Badge variant="destructive">Refusé</Badge>
  ) : null;

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.title}</div>
        {meta ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {statusBadge}
      <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">
        {formatDistanceToNowStrict(new Date(item.publishedAt), { addSuffix: true, locale: fr })}
      </span>
    </>
  );

  if (!item.current) {
    return <div className="flex items-center gap-3 px-5 py-2.5 opacity-60">{content}</div>;
  }

  return (
    <Link
      href={`/admin/events?event=${item.id}`}
      className="group flex items-center gap-3 px-5 py-2.5 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
    >
      {content}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Suivi de ce que l'agent Claude a créé (journal d'audit), sur le tableau de bord. */
export function AgentActivityCard() {
  const [activity, setActivity] = React.useState<AgentActivity | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchAgentActivity()
      .then((result) => {
        if (!cancelled) setActivity(result);
      })
      .catch((error) => {
        console.error("Erreur activité agent:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lastPass = activity?.lastPass ?? null;
  const published = activity?.published ?? [];

  let body: React.ReactNode;
  if (failed) {
    body = <p className="px-5 py-6 text-sm text-muted-foreground">Activité de l’agent indisponible pour le moment.</p>;
  } else if (!activity) {
    body = (
      <div className="grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-3 border-b border-border px-5 py-4 lg:border-b-0 lg:border-r">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-3 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  } else if (!lastPass && published.length === 0) {
    body = (
      <p className="px-5 py-6 text-sm text-muted-foreground">
        L’agent n’a encore rien créé. Ses événements et artistes apparaîtront ici après sa prochaine collecte.
      </p>
    );
  } else {
    body = (
      <div className="grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <section
          aria-label="Dernier passage"
          className="border-b border-border px-5 py-4 lg:border-b-0 lg:border-r"
        >
          <h3 className="text-xs font-medium text-muted-foreground">Dernier passage</h3>
          <p className="mt-1 text-sm font-medium">{lastPass ? formatPassDate(lastPass.endedAt) : "—"}</p>
          {lastPass ? (
            <dl className="mt-2">
              <PassStat label="Publiés" value={lastPass.published} dot="bg-success" />
              <PassStat label="En attente" value={lastPass.pending} dot="bg-warning" />
              <PassStat label="Artistes créés" value={lastPass.artistsCreated} />
            </dl>
          ) : null}
        </section>

        <section aria-label="Derniers événements publiés" className="min-w-0 pb-1.5">
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">Derniers événements publiés</h3>
            <Link
              href="/admin/events?agent=1"
              className="text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:underline"
            >
              Tous ses événements
            </Link>
          </div>
          {published.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-muted-foreground">Aucun événement publié directement pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-border">
              {published.map((item) => (
                <li key={item.id}>
                  <PublishedEventRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
            <Bot className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle>Agent Claude</CardTitle>
            <CardDescription>Créations de la collecte automatique</CardDescription>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/admin/events?status=pending">
            <span className="sm:hidden">En attente</span>
            <span className="max-sm:hidden">Événements en attente</span>
            <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      {body}
    </Card>
  );
}
