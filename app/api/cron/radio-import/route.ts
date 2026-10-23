import { NextRequest, NextResponse } from "next/server";

import { importRadioStations } from "@/lib/radio/import";
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
 * GET /api/cron/radio-import
 *
 * Importe les émissions et les épisodes des radios (Radio Campus Orléans) depuis leur site, en lecture
 * seule : API WordPress, pages d'émission, flux RSS (lib/radio/import.ts). Chaque heure par pg_cron
 * (migration 20261023123000_schedule_radio_import.sql) ; une fois par jour par vercel.json (Vercel
 * Hobby n'accepte pas plus) ; à la main depuis la page des crons de l'admin.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    // Une fonction Vercel est coupée à 60 s : plus aucune lecture n'est commencée après 45 s.
    const result = await importRadioStations(createServiceClient(), { deadline: Date.now() + 45_000 });
    console.log("Import des radios", JSON.stringify(result));
    return NextResponse.json({ ok: true, result });
  } catch (error: unknown) {
    console.error("Erreur cron radio-import:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur cron radio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
