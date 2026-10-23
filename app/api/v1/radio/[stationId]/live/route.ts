import { jsonError } from "@/lib/api/v1/errors";
import {
  publicCachedGetJson,
  publicGetOptions,
  RADIO_LIVE_CACHE_CONTROL,
  withPublicGetCors,
} from "@/lib/api/v1/http";
import { radioStationIdParamsSchema, type RadioLiveResponse } from "@/lib/api/v1/radio/schemas";
import { createTypedAnonClient } from "@/lib/api/v1/supabase";
import { getRadioLive } from "@/lib/radio/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "cdg1";
export const maxDuration = 10;

export function OPTIONS() {
  return publicGetOptions();
}

function stationNotFound() {
  return withPublicGetCors(jsonError("not_found", "Station introuvable", 404));
}

/**
 * GET /api/v1/radio/{stationId}/live
 *
 * « Ce qui passe » sur une radio : l'émission en cours d'après la grille, ou le morceau entre deux
 * émissions, l'émission suivante et les morceaux d'avant (lib/radio/live.ts). Publique, en cache 10 s
 * (CDN) ; 404 pour une station inconnue ou désactivée ; si la radio ne répond pas, 200 avec la grille.
 * Contrat de l'app : docs/API_APP.md, « Radio ».
 */
export async function GET(_request: Request, { params }: { params: Promise<{ stationId: string }> }) {
  const parsed = radioStationIdParamsSchema.safeParse(await params);
  if (!parsed.success) return stationNotFound();

  try {
    const payload = await getRadioLive(parsed.data.stationId, { supabase: createTypedAnonClient() });
    if (!payload) return stationNotFound();
    return publicCachedGetJson(payload satisfies RadioLiveResponse, undefined, RADIO_LIVE_CACHE_CONTROL);
  } catch (error) {
    console.error("Erreur GET /api/v1/radio/[stationId]/live:", error);
    return withPublicGetCors(jsonError("internal_error", "Erreur serveur", 500));
  }
}
