import { NextRequest, NextResponse } from "next/server";

import { fillMissingImageCards } from "@/lib/image-cards/service";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET n'est pas défini");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/image-cards
 *
 * Filet du webhook des vignettes : fabrique celles qui manquent (webhook pas encore branché,
 * envoi raté, échec passager). Tous les jours à 4 h UTC (vercel.json), après le nettoyage.
 * Le rattrapage complet passe par scripts/backfill-image-cards.mjs (docs/EVENT_IMAGE_CARDS.md).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    // Une fonction Vercel est coupée à 60 s : plus aucune affiche n'est commencée après 35 s.
    const result = await fillMissingImageCards(createServiceClient(), {
      limit: 200,
      deadline: Date.now() + 35_000,
    });
    console.log("Vignettes des affiches", result);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("Erreur cron image-cards:", error);
    return NextResponse.json({ error: error?.message || "Erreur serveur cron vignettes" }, { status: 500 });
  }
}
