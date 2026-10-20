import { NextRequest, NextResponse } from "next/server";

import { syncSchoolHolidays } from "@/lib/school-holidays/official-calendar";
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
 * GET /api/cron/school-holidays
 *
 * Recharge public.school_holidays (vacances scolaires de la zone B, académie d'Orléans-Tours) depuis
 * le calendrier scolaire officiel, pour le calendrier de l'app. Chaque lundi à 5 h UTC (vercel.json) ;
 * à la main pour le premier chargement : `curl -H "Authorization: Bearer $CRON_SECRET" …`.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await syncSchoolHolidays(createServiceClient());
    console.log("Vacances scolaires", result);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    console.error("Erreur cron school-holidays:", error);
    return NextResponse.json({ error: error?.message || "Erreur serveur cron vacances scolaires" }, { status: 500 });
  }
}
