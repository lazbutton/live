import { createServiceClient } from "@/lib/supabase/service";
import { startsIn, type DigestCategory, type DigestEvent, type DigestRange } from "./digest";

/**
 * Les événements qui commencent dans [range] (heure de Paris), tels que l'accueil de l'app les montre :
 * `app_events_in_range` (visibles dans l'app, pas terminés), sans les complets ni ceux retirés de l'accueil
 * (`hide_from_home`, filtré par la liste de l'app), triés par date. Ceux qui ne font que traverser la plage
 * (expositions) sont écartés : voir `digest.ts`.
 *
 * Service role : sans session, la fonction ne retire ni masqués ni auteurs bloqués (propres à chacun).
 */
export async function loadDigestEvents(range: DigestRange): Promise<DigestEvent[]> {
  const supabase = createServiceClient();
  // Tri sur une colonne sélectionnée : sur un RPC, PostgREST ne trie pas sur une colonne qu'il ne
  // sélectionne pas (CLAUDE.md).
  const { data, error } = await supabase
    .rpc("app_events_in_range", { range_start: range.start, range_end: range.end })
    .select("id, title, date, category")
    .or("is_full.is.null,is_full.eq.false")
    .eq("hide_from_home", false)
    .order("date", { ascending: true });

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
