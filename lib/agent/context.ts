import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ArtistOption,
  CategoryOption,
  LocationData,
  OrganizerOption,
  TagOption,
} from "@/app/(admin)/admin/components/events/types";
import { fetchFestivalCandidates, type FestivalCandidate } from "@/lib/events/festivals";
import { createServiceClient } from "@/lib/supabase/service";

/*
 * Contexte d'exécution des outils de l'agent (serveur MCP local ou HTTP).
 * Les outils travaillent avec la clé service : ils ne sont exposés qu'à un
 * processus local de confiance ou derrière le jeton OUTLIVE_AGENT_TOKEN.
 */

export { AGENT_ACTOR } from "./actor";

/** Liens publics d'un lieu ou d'un organisateur : ils écartent les doublons à la création. */
type PublicLinks = { website_url?: string | null; instagram_url?: string | null; facebook_url?: string | null };

export type AgentLocation = LocationData & PublicLinks & { is_organizer?: boolean | null };
export type AgentOrganizer = OrganizerOption & PublicLinks;
/** Salle d'un lieu : une séance peut y être rattachée (events.room_id). */
export type AgentRoom = { id: string; name: string; location_id: string };

export type AgentReferences = {
  locations: AgentLocation[];
  organizers: AgentOrganizer[];
  rooms: AgentRoom[];
  artists: ArtistOption[];
  tags: TagOption[];
  categories: CategoryOption[];
  /** Festivals de l'app : un événement importé est rattaché à celui qu'il nomme. */
  festivals: FestivalCandidate[];
};

export type AgentContext = {
  supabase: SupabaseClient;
  /** Simulation : rien n'est écrit, les réponses décrivent ce qui serait fait. */
  dryRun: boolean;
  /** Échéance (horodatage en ms) des traitements par lot. */
  deadline?: number;
  references?: Promise<AgentReferences>;
};

export function createAgentContext(options: { dryRun?: boolean; deadline?: number } = {}): AgentContext {
  return {
    supabase: createServiceClient(),
    dryRun: Boolean(options.dryRun),
    deadline: options.deadline,
  };
}

export function hasTimeLeft(ctx: AgentContext, marginMs = 0) {
  return !ctx.deadline || Date.now() + marginMs < ctx.deadline;
}

async function fetchReferences(supabase: SupabaseClient): Promise<AgentReferences> {
  const [locationsRes, organizersRes, organizerLocationsRes, roomsRes, artistsRes, tagsRes, categoriesRes] = await Promise.all([
    supabase
      .from("locations")
      .select(
        "id, name, address, capacity, latitude, longitude, city_id, city:cities(id, label), website_url, instagram_url, facebook_url, is_organizer",
      ),
    supabase.from("organizers").select("id, name, instagram_url, facebook_url, website_url").order("name"),
    supabase
      .from("locations")
      .select("id, name, instagram_url, facebook_url, website_url")
      .eq("is_organizer", true)
      .order("name"),
    supabase.from("rooms").select("id, name, location_id").order("name"),
    supabase.from("artists").select("id, name, slug, image_url, origin_city, instagram_url").order("name"),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
  ]);
  for (const result of [locationsRes, organizersRes, organizerLocationsRes, roomsRes, artistsRes, tagsRes, categoriesRes]) {
    if (result.error) throw result.error;
  }
  const categories = (categoriesRes.data || []) as CategoryOption[];
  const festivals = await fetchFestivalCandidates(supabase, categories);

  return {
    locations: ((locationsRes.data || []) as any[]).map((location) => ({
      ...location,
      city: Array.isArray(location.city) ? (location.city[0] ?? null) : (location.city ?? null),
    })) as AgentLocation[],
    organizers: [
      ...((organizersRes.data || []) as any[]).map((row) => ({ ...row, type: "organizer" as const })),
      ...((organizerLocationsRes.data || []) as any[]).map((row) => ({ ...row, type: "location" as const })),
    ],
    rooms: (roomsRes.data || []) as AgentRoom[],
    artists: (artistsRes.data || []) as ArtistOption[],
    tags: (tagsRes.data || []) as TagOption[],
    categories,
    festivals,
  };
}

/** Référentiels chargés une fois par appel d'outil (rechargés après une création : artiste, lieu, organisateur, salle). */
export function loadAgentReferences(ctx: AgentContext) {
  if (!ctx.references) {
    ctx.references = fetchReferences(ctx.supabase).catch((error) => {
      ctx.references = undefined;
      throw error;
    });
  }
  return ctx.references;
}

export function invalidateAgentReferences(ctx: AgentContext) {
  ctx.references = undefined;
}
