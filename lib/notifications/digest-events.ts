import { createServiceClient } from "@/lib/supabase/service";
import { startsIn, type DigestCategory, type DigestEvent, type DigestRange } from "./digest";

/**
 * Les événements qui commencent dans [range] (heure de Paris), tels que l'accueil de l'app les montre :
 * `app_events_in_range` (visibles dans l'app, pas terminés), sans les complets, triés par date, avec la règle
 * de « Tout » (`app_on_tout`, colonne calculée) : le résumé sans goût n'a que ceux de « Tout », celui de « Pour
 * toi » les a tous, comme sa page. Ceux qui ne font que traverser la plage (expositions) sont écartés : voir
 * `digest.ts`.
 *
 * Service role : sans session, la fonction ne retire ni masqués ni auteurs bloqués (propres à chacun) ;
 * `loadForMeDigest` les retire pour « Pour toi ».
 */
export async function loadDigestEvents(range: DigestRange): Promise<DigestEvent[]> {
  const supabase = createServiceClient();
  // Tri sur une colonne sélectionnée : sur un RPC, PostgREST ne trie pas sur une colonne qu'il ne
  // sélectionne pas (CLAUDE.md). `app_on_tout` est une colonne calculée que les types générés ne
  // connaissent pas (son argument est nommé) : le type du résultat est donné.
  const { data, error } = await supabase
    .rpc("app_events_in_range", { range_start: range.start, range_end: range.end })
    .select("id, title, date, category, app_on_tout")
    .or("is_full.is.null,is_full.eq.false")
    .order("date", { ascending: true })
    .overrideTypes<DigestEvent[], { merge: false }>();

  if (error) {
    throw error;
  }

  return (data ?? []).filter((event) => startsIn(event, range));
}

/** Les catégories (id et nom) : `events.category` contient l'un ou l'autre. */
export async function loadDigestCategories(): Promise<DigestCategory[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("categories").select("id, name");

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * « Pour toi » sur [range] (`app_digest_for_me`, la règle de la page, en SQL) : pour chaque utilisateur qui a
 * choisi des goûts, les ids des événements qui sont pour lui, sans ses masqués ni les auteurs qu'il a bloqués.
 * Un utilisateur qui a des goûts mais rien sur la plage est là, sans événement : il ne reçoit pas le résumé de
 * tout. Les autres n'y sont pas.
 */
export async function loadForMeDigest(range: DigestRange): Promise<Map<string, Set<string>>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .rpc("app_digest_for_me", { range_start: range.start, range_end: range.end })
    .select("user_id, event_id");

  if (error) {
    throw error;
  }

  const byUser = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.user_id) continue;
    const events = byUser.get(row.user_id) ?? new Set<string>();
    if (row.event_id) events.add(row.event_id);
    byUser.set(row.user_id, events);
  }
  return byUser;
}

/** Les séries à venir (`app_event_series`, la règle de l'accueil) : l'id de la série de chaque événement qui en a une. */
export async function loadDigestSeries(): Promise<Map<string, string>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("app_event_series").select("event_id, series_id");

  if (error) {
    throw error;
  }

  const seriesOf = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.event_id && row.series_id) seriesOf.set(row.event_id, row.series_id);
  }
  return seriesOf;
}
