import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";
import {
  AGENDA_CONFIG_COLUMNS,
  runAgendaScraping,
  type AgendaConfigRow,
} from "@/lib/scraping/agenda-pipeline";

// Plan Vercel Hobby : 60 s maximum par exécution.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Vérifie que la requête vient bien de Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("❌ CRON_SECRET n'est pas défini dans les variables d'environnement");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/scrape-events
 *
 * Scanne les agendas configurés et crée une demande « depuis une URL » pour
 * chaque nouvel événement à venir. Les liens déjà connus, passés ou annulés sont
 * écartés sans lecture ; le scan s'arrête proprement avant la limite de temps
 * et reprend au passage suivant.
 *
 * `?dry=1` : découverte seule (aucune lecture d'événement, aucune écriture).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const startedAt = Date.now();
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";

  try {
    const supabase = createServiceClient();
    const { data: configs, error } = await supabase
      .from("organizer_agenda_scraping_configs")
      .select(AGENDA_CONFIG_COLUMNS)
      .eq("enabled", true);

    if (error) {
      console.error("❌ Configurations d'agenda illisibles:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ success: true, message: "Aucune configuration d'agenda active", configs: 0 });
    }

    const summary = await runAgendaScraping({
      supabase,
      configs: configs as AgendaConfigRow[],
      maxNewPerConfig: Number(process.env.SCRAPE_EVENTS_MAX_PER_CONFIG || "25"),
      maxNewTotal: Number(process.env.SCRAPE_EVENTS_MAX_TOTAL || "60"),
      deadline: startedAt + 50_000,
      dryRun,
    });

    console.log(
      `✅ Cron scrape-events : ${summary.configs} agendas, ${summary.discovered} liens, ${summary.created} demandes créées, ` +
        `${summary.skippedKnown} déjà connus, ${summary.skippedPast} passés, ${summary.errors} erreurs${summary.truncated ? " (à suivre)" : ""}`,
    );

    return NextResponse.json({
      success: summary.errors === 0,
      dryRun,
      durationMs: Date.now() - startedAt,
      ...summary,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du cron:", error);
    return NextResponse.json({ success: false, error: error.message || "Erreur inconnue" }, { status: 500 });
  }
}
