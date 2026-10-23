/*
 * Radio : le back-office (`/admin/radio`). Lecture et écriture par la clé service role, après
 * vérification du rôle admin dans les routes `app/api/admin/radio/` : la RLS des tables ne laisse
 * écrire que le service, et cache une station désactivée.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type AdminRadioStation = {
  id: string;
  name: string;
  frequency: string;
  enabled: boolean;
  siteUrl: string;
  organizerId: string;
};

export type AdminRadioShow = {
  id: string;
  stationId: string;
  slug: string;
  name: string;
  style: string | null;
  family: "musique" | "parole";
  organizerId: string | null;
  slots: Array<{ weekday: number; start: string; end: string }>;
  lastEpisodeAt: string | null;
  /** Un épisode depuis 45 jours (la règle d'app_radio_shows). */
  active: boolean;
  pageUrl: string;
  episodesCount: number;
};

export type AdminRadioPayload = {
  stations: AdminRadioStation[];
  shows: AdminRadioShow[];
  organizers: Array<{ id: string; name: string }>;
  /** Dernière lecture d'un flux par l'import (instant), toutes émissions confondues. */
  lastImportAt: string | null;
};

export const adminRadioShowUpdateSchema = z
  .object({
    family: z.enum(["musique", "parole"]).optional(),
    organizerId: z.string().uuid().nullable().optional(),
  })
  .refine((body) => body.family !== undefined || body.organizerId !== undefined, {
    message: "family ou organizerId attendu",
  });

export type AdminRadioShowUpdate = z.infer<typeof adminRadioShowUpdateSchema>;

function asSlots(value: Json): AdminRadioShow["slots"] {
  return Array.isArray(value) ? (value as AdminRadioShow["slots"]) : [];
}

/** Tous les organisateurs, par pages de 1 000 (le plafond de PostgREST chez Supabase). */
async function loadOrganizers(supabase: Client) {
  const organizers: Array<{ id: string; name: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("organizers").select("id, name").order("name").order("id").range(from, from + 999);
    if (error) throw error;
    organizers.push(...(data ?? []));
    if (!data || data.length < 1000) return organizers;
  }
}

export async function loadAdminRadio(supabase: Client): Promise<AdminRadioPayload> {
  const [stationsResult, showsResult, organizers, syncResult] = await Promise.all([
    supabase.from("radio_stations").select("id, name, frequency, enabled, site_url, organizer_id").order("name"),
    supabase
      .from("radio_shows")
      .select("id, station_id, slug, name, style, family, organizer_id, slots, last_episode_at, page_url, radio_episodes(count)")
      .order("name"),
    loadOrganizers(supabase),
    supabase.from("radio_show_sync").select("feed_checked_at").order("feed_checked_at", { ascending: false, nullsFirst: false }).limit(1),
  ]);
  if (stationsResult.error) throw stationsResult.error;
  if (showsResult.error) throw showsResult.error;
  if (syncResult.error) throw syncResult.error;

  const stations = stationsResult.data ?? [];
  // Actives : la règle en SQL (app_radio_shows, sous la clé service role même pour une station désactivée).
  const activeIds = new Set<string>();
  for (const station of stations) {
    const { data, error } = await supabase.rpc("app_radio_shows", { p_station: station.id });
    if (error) throw error;
    for (const show of data ?? []) activeIds.add(show.id);
  }

  return {
    stations: stations.map((station) => ({
      id: station.id,
      name: station.name,
      frequency: station.frequency,
      enabled: station.enabled,
      siteUrl: station.site_url,
      organizerId: station.organizer_id,
    })),
    shows: (showsResult.data ?? []).map((show) => ({
      id: show.id,
      stationId: show.station_id,
      slug: show.slug,
      name: show.name,
      style: show.style,
      family: show.family === "parole" ? "parole" : "musique",
      organizerId: show.organizer_id,
      slots: asSlots(show.slots),
      lastEpisodeAt: show.last_episode_at,
      active: activeIds.has(show.id),
      pageUrl: show.page_url,
      episodesCount: show.radio_episodes?.[0]?.count ?? 0,
    })),
    organizers,
    lastImportAt: syncResult.data?.[0]?.feed_checked_at ?? null,
  };
}

/** Famille et collectif d'une émission ; null si elle n'existe pas. */
export async function updateAdminRadioShow(supabase: Client, showId: string, update: AdminRadioShowUpdate) {
  const changes: Database["public"]["Tables"]["radio_shows"]["Update"] = {};
  if (update.family !== undefined) changes.family = update.family;
  if (update.organizerId !== undefined) changes.organizer_id = update.organizerId;
  const { data, error } = await supabase
    .from("radio_shows")
    .update(changes)
    .eq("id", showId)
    .select("id, family, organizer_id")
    .maybeSingle();
  if (error) throw error;
  return data;
}
