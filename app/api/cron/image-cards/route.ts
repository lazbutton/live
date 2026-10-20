import { NextRequest, NextResponse } from "next/server";

import { copyExternalPosters } from "@/lib/image-cards/external-posters";
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
 * envoi raté, échec passager), puis recopie dans Storage les affiches restées sur un autre site
 * (copie ratée à l'import, lien saisi à la main) : leur vignette est refaite par le webhook.
 * Tous les jours à 4 h UTC (vercel.json), après le nettoyage. Le rattrapage complet passe par
 * scripts/backfill-image-cards.mjs et scripts/copy-external-images.mjs (docs/EVENT_IMAGE_CARDS.md).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    // Une fonction Vercel est coupée à 60 s : plus aucune affiche n'est commencée après 35 s.
    const deadline = Date.now() + 35_000;
    const result = await fillMissingImageCards(supabase, { limit: 200, deadline });
    console.log("Vignettes des affiches", result);
    // Une copie ratée ne fait pas échouer les vignettes : reprise au prochain passage.
    const externalPosters = await copyExternalPosters(supabase, { limit: 20, deadline }).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    console.log("Affiches recopiées dans Storage", externalPosters);
    return NextResponse.json({ ok: true, result, externalPosters });
  } catch (error: any) {
    console.error("Erreur cron image-cards:", error);
    return NextResponse.json({ error: error?.message || "Erreur serveur cron vignettes" }, { status: 500 });
  }
}
