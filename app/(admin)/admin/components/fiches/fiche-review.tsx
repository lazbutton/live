"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { logAdminAction } from "@/lib/admin-audit-log";
import { genreIdsForCategory, toMinAge, type EventGenreOption } from "@/lib/events/event-details";
import { groupFichesToComplete, type FicheEventRow } from "@/lib/events/fiches-to-complete";
import { parisToday } from "@/lib/scraping/dates";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { EventDetailsValue } from "../events/event-details-fields";
import { ManagementHero } from "../management-page-primitives";
import { FicheReviewList, type FicheReviewGroup } from "./fiche-review-list";

/*
 * Fiches à compléter (étape 2 de « Pour toi », ../live/docs/chantiers/pour-toi.md) : les événements à venir sans
 * genre, sans « pour qui » ou sans réservation, et ceux dont la collecte a lu ces champs sans qu'ils soient confirmés,
 * les plus proches d'abord. Une ligne vaut pour toutes les séances d'un même spectacle ; une ligne ignorée l'est sur
 * ce navigateur seulement (la source ne dit rien).
 */

const IGNORED_STORAGE_KEY = "outlive:fiches-ignorees";

function readIgnored(): Set<string> {
  try {
    const raw = window.localStorage.getItem(IGNORED_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeIgnored(titles: Set<string>) {
  try {
    window.localStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify([...titles]));
  } catch {
    // Stockage indisponible (navigation privée) : la fiche reviendra au prochain chargement.
  }
}

async function loadFiches(ignored: Set<string>) {
  const today = parisToday();
  const [eventsResult, categoriesResult, genresResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, date, status, category, genre_ids, audience, min_age, booking, details_to_confirm, scraping_url, external_url, location:locations(name)",
      )
      .eq("archived", false)
      .in("status", ["approved", "pending"])
      .or(`date.gte.${today}T00:00:00,end_date.gte.${today}T00:00:00`)
      .order("date", { ascending: true }),
    supabase.from("categories").select("id, name"),
    supabase.from("event_genres").select("id, category_id, name, phrase, display_order, is_active").order("display_order"),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (genresResult.error) throw genresResult.error;
  const genres = (genresResult.data || []) as EventGenreOption[];
  const groups = groupFichesToComplete(
    (eventsResult.data || []) as unknown as FicheEventRow[],
    (categoriesResult.data || []) as Array<{ id: string; name: string }>,
    genres,
    ignored,
  );
  return { groups, genres };
}

export function FicheReview() {
  const [groups, setGroups] = React.useState<FicheReviewGroup[] | null>(null);
  const [genres, setGenres] = React.useState<EventGenreOption[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const loaded = await loadFiches(readIgnored());
      setGenres(loaded.genres);
      setGroups(loaded.groups);
    } catch (error) {
      console.error("Fiches à compléter indisponibles:", error);
      toast({ title: "Chargement impossible", description: "Les événements n'ont pas pu être lus. Réessaie.", variant: "destructive" });
      setGroups((current) => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = React.useCallback(
    async (group: FicheReviewGroup, value: EventDetailsValue) => {
      setSavingKey(group.key);
      try {
        const update = {
          genre_ids: genreIdsForCategory(value.genreIds, genres, group.categoryId),
          audience: value.audience || null,
          min_age: toMinAge(value.minAge),
          booking: value.booking || null,
          details_to_confirm: false,
        };
        const { error } = await supabase.from("events").update(update).in("id", group.eventIds);
        if (error) throw error;
        await logAdminAction({
          action: "event.details_fix",
          entityType: "event",
          entityId: group.eventIds[0],
          entityLabel: group.title,
          metadata: { before: group.value, after: update, event_ids: group.eventIds, gaps: group.gaps },
        });
        // Encore incomplète (la source ne dit pas tout) : elle reste, sans « à confirmer ».
        await load();
        toast({
          title: "Fiche enregistrée",
          description: group.eventIds.length > 1 ? `${group.eventIds.length} séances mises à jour.` : undefined,
          variant: "success",
        });
      } catch (error) {
        console.error("Fiche non enregistrée:", error);
        toast({ title: "Fiche non enregistrée", description: "Réessaie dans un instant.", variant: "destructive" });
      } finally {
        setSavingKey(null);
      }
    },
    [genres, load],
  );

  const ignore = React.useCallback((group: FicheReviewGroup) => {
    const ignored = readIgnored();
    ignored.add(group.title);
    writeIgnored(ignored);
    setGroups((current) => (current || []).filter((entry) => entry.title !== group.title));
  }, []);

  return (
    <div className="space-y-6">
      <ManagementHero
        title="Fiches à compléter"
        description="Événements à venir sans genre, sans « pour qui » ou sans réservation, et ce que la collecte a lu sans que ce soit confirmé. Les plus proches d'abord ; une ligne vaut pour toutes les séances du spectacle."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} />
            Actualiser
          </Button>
        }
      />

      {groups === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_value, index) => (
            <Skeleton key={index} className="h-[124px] w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <FicheReviewList groups={groups} genres={genres} savingKey={savingKey} onSave={save} onIgnore={ignore} />
      )}
    </div>
  );
}
