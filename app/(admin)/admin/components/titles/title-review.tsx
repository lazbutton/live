"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { logAdminAction } from "@/lib/admin-audit-log";
import { findTitleIssues, type EventTitleIssue } from "@/lib/collecte/event-text";
import { parisToday } from "@/lib/scraping/dates";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ManagementHero } from "../management-page-primitives";
import { TitleReviewList, type TitleReviewGroup } from "./title-review-list";

/*
 * Titres à revoir (U31) : événements à venir ou en cours dont le titre garde une date, des
 * capitales, le lieu répété ou des guillemets droits. La correction proposée est celle de la
 * collecte (lib/collecte/event-text.ts) ; un titre ignoré l'est sur ce navigateur seulement.
 */

const IGNORED_STORAGE_KEY = "outlive:titres-ignores";

type ReviewedEvent = {
  id: string;
  title: string | null;
  date: string | null;
  status: string | null;
  category: string | null;
  address: string | null;
  location: { name: string | null } | null;
};

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
    // Stockage indisponible (navigation privée) : le titre reviendra au prochain chargement.
  }
}

async function namesOf(table: "artists" | "locations" | "organizers" | "tags") {
  const { data, error } = await supabase.from(table).select("name");
  if (error) throw error;
  return ((data || []) as Array<{ name: string | null }>).map((row) => row.name);
}

/** Événements à venir regroupés par titre, avec leurs défauts. */
async function loadTitleGroups(ignored: Set<string>): Promise<TitleReviewGroup[]> {
  const today = parisToday();
  const [eventsResult, categoriesResult, ...names] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, date, status, category, address, location:locations(name)")
      .eq("archived", false)
      .in("status", ["approved", "pending"])
      .or(`date.gte.${today}T00:00:00,end_date.gte.${today}T00:00:00`)
      .order("date", { ascending: true }),
    supabase.from("categories").select("id, name"),
    namesOf("artists"),
    namesOf("locations"),
    namesOf("organizers"),
    namesOf("tags"),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  const categories = new Map(((categoriesResult.data || []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
  const knownNames = names.flat();

  const groups = new Map<string, TitleReviewGroup>();
  for (const event of (eventsResult.data || []) as unknown as ReviewedEvent[]) {
    const title = event.title?.trim();
    if (!title || ignored.has(title)) continue;
    const venue = event.location?.name ?? null;
    const { issues, suggestion } = findTitleIssues(title, {
      // Sans fiche de lieu, l'adresse garde le lieu annoncé (« Église Saint-Paterne, … »).
      venues: [venue, event.address?.split(",")[0]],
      category: event.category ? (categories.get(event.category) ?? event.category) : null,
      knownNames,
    });
    if (issues.length === 0) continue;
    const key = `${title}→${suggestion}`;
    const group = groups.get(key) ?? {
      key,
      title,
      suggestion,
      issues: [] as EventTitleIssue[],
      eventIds: [],
      nextDate: event.date,
      venue,
      pendingCount: 0,
    };
    group.eventIds.push(event.id);
    for (const issue of issues) if (!group.issues.includes(issue)) group.issues.push(issue);
    if (event.status === "pending") group.pendingCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function TitleReview() {
  const [groups, setGroups] = React.useState<TitleReviewGroup[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    try {
      setGroups(await loadTitleGroups(readIgnored()));
    } catch (error) {
      console.error("Titres à revoir indisponibles:", error);
      toast({ title: "Chargement impossible", description: "Les événements n'ont pas pu être lus. Réessaie.", variant: "destructive" });
      setGroups((current) => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = React.useCallback(async (group: TitleReviewGroup, title: string) => {
    setSavingKey(group.key);
    try {
      const { error } = await supabase.from("events").update({ title }).in("id", group.eventIds);
      if (error) throw error;
      await logAdminAction({
        action: "event.title_fix",
        entityType: "event",
        entityId: group.eventIds[0],
        entityLabel: title,
        metadata: { before: group.title, after: title, event_ids: group.eventIds, issues: group.issues },
      });
      setGroups((current) => (current || []).filter((entry) => entry.key !== group.key));
      toast({
        title: "Titre corrigé",
        description: group.eventIds.length > 1 ? `${group.eventIds.length} séances mises à jour.` : undefined,
        variant: "success",
      });
    } catch (error) {
      console.error("Titre non enregistré:", error);
      toast({ title: "Titre non enregistré", description: "Réessaie dans un instant.", variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  }, []);

  const ignore = React.useCallback((group: TitleReviewGroup) => {
    const ignored = readIgnored();
    ignored.add(group.title);
    writeIgnored(ignored);
    setGroups((current) => (current || []).filter((entry) => entry.title !== group.title));
  }, []);

  return (
    <div className="space-y-6">
      <ManagementHero
        title="Titres à revoir"
        description="Titres d'événements à venir avec une date, des capitales, le lieu ou des guillemets droits. Corrige la proposition si besoin : elle s'applique à toutes les séances du même titre."
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
        <TitleReviewList groups={groups} savingKey={savingKey} onSave={save} onIgnore={ignore} />
      )}
    </div>
  );
}
