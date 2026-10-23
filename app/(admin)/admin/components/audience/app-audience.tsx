"use client";

import * as React from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart3, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import {
  APP_AUDIENCE_METRICS,
  audienceByDay,
  audienceTrends,
  formatTrend,
  shiftDay,
  type AppAudienceRow,
} from "@/lib/audience/app-audience";
import { parisToday } from "@/lib/scraping/dates";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ManagementEmptyState,
  ManagementHero,
  ManagementSectionLabel,
  ManagementStat,
  ManagementStatGrid,
} from "../management-page-primitives";

/*
 * Audience de l'app (U41) : les compteurs que l'app envoie sans identité, un total par jour
 * (`app_audience_counts`, lisible par les admins seulement).
 */

/** Jours affichés dans le tableau (les 7 de plus servent à la comparaison). */
const DAYS = 30;

function dayLabel(day: string) {
  return format(new Date(`${day}T12:00:00`), "EEE d MMM", { locale: fr });
}

export function AppAudience() {
  const [rows, setRows] = React.useState<AppAudienceRow[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const today = parisToday();

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from("app_audience_counts")
        .select("day, metric, count")
        .gte("day", shiftDay(parisToday(), -DAYS))
        .order("day", { ascending: false });
      if (error) throw error;
      setRows(data ?? []);
    } catch (error) {
      console.error("Audience de l'app indisponible:", error);
      toast({ title: "Chargement impossible", description: "Les compteurs n'ont pas pu être lus. Réessaie.", variant: "destructive" });
      setRows((current) => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const days = rows ? audienceByDay(rows, today, DAYS) : [];
  const trends = rows ? audienceTrends(rows, today) : [];

  return (
    <div className="space-y-6">
      <ManagementHero
        title="Audience de l'app"
        description="Gestes comptés dans l'app, sans identité ni compte : chaque téléphone additionne les siens et envoie ses totaux d'une journée le lendemain, au premier lancement. Les derniers jours se complètent donc encore. Chiffres indicatifs."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            Actualiser
          </Button>
        }
      />

      {rows === null ? (
        <div className="space-y-3">
          <Skeleton className="h-[88px] w-full rounded-xl" />
          <Skeleton className="h-[320px] w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <ManagementEmptyState
          icon={<BarChart3 />}
          title="Pas encore de compteurs"
          description="Ils arrivent le lendemain des premiers gestes faits avec une version de l'app qui les compte."
        />
      ) : (
        <>
          <ManagementSectionLabel>7 derniers jours, comparés aux 7 d&apos;avant</ManagementSectionLabel>
          <ManagementStatGrid>
            {trends.map((trend) => (
              <ManagementStat
                key={trend.metric}
                label={trend.label}
                value={trend.lastWeek}
                hint={formatTrend(trend) ?? "Rien à comparer"}
              />
            ))}
          </ManagementStatGrid>

          <ManagementSectionLabel>Par jour</ManagementSectionLabel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jour</TableHead>
                {APP_AUDIENCE_METRICS.map((metric) => (
                  <TableHead key={metric.key} className="text-right">
                    {metric.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => (
                <TableRow key={day.day}>
                  <TableCell className="whitespace-nowrap capitalize">{dayLabel(day.day)}</TableCell>
                  {APP_AUDIENCE_METRICS.map((metric) => (
                    <TableCell
                      key={metric.key}
                      className={cn("text-right tabular-nums", day.counts[metric.key] === 0 && "text-muted-foreground")}
                    >
                      {day.counts[metric.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
