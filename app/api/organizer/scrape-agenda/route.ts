import { NextRequest, NextResponse } from "next/server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  AGENDA_CONFIG_COLUMNS,
  runAgendaScraping,
  type AgendaConfigRow,
} from "@/lib/scraping/agenda-pipeline";

// Plan Vercel Hobby : 60 s maximum ; le scan s'arrête proprement avant.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/scrape-agenda
 *
 * Déclenche le scan de l'agenda d'un organisateur ou d'un lieu.
 *
 * Body : { organizer_id?: string; location_id?: string }
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  try {
    const { organizer_id, location_id } = await request.json();

    if (!organizer_id && !location_id) {
      return NextResponse.json({ error: "organizer_id ou location_id requis" }, { status: 400 });
    }

    const userRole = user.user_metadata?.role || user.app_metadata?.role;
    if (userRole !== "admin") {
      const { data: userOrg, error: accessError } = await supabase
        .from("user_organizers")
        .select("role")
        .eq("user_id", user.id)
        .eq("organizer_id", organizer_id || location_id)
        .single();

      if (accessError || !userOrg) {
        return NextResponse.json({ error: "Accès non autorisé à cet organisateur" }, { status: 403 });
      }
      if (userOrg.role !== "owner" && userOrg.role !== "editor") {
        return NextResponse.json(
          { error: "Seuls les propriétaires et éditeurs peuvent déclencher le scraping" },
          { status: 403 },
        );
      }
    }

    const serviceSupabase = createServiceClient();
    let query = serviceSupabase.from("organizer_agenda_scraping_configs").select(AGENDA_CONFIG_COLUMNS).eq("enabled", true);
    query = organizer_id ? query.eq("organizer_id", organizer_id) : query.eq("location_id", location_id);
    const { data: configs, error: cfgError } = await query;

    if (cfgError) {
      return NextResponse.json({ success: false, error: cfgError.message }, { status: 500 });
    }
    if (!configs || configs.length === 0) {
      return NextResponse.json({ success: false, error: "Aucune configuration d'agenda active trouvée" }, { status: 404 });
    }

    const summary = await runAgendaScraping({
      supabase: serviceSupabase,
      configs: configs as AgendaConfigRow[],
      deadline: startedAt + 52_000,
    });

    return NextResponse.json({
      success: summary.errors === 0,
      message: "Scraping de l'agenda terminé",
      configs: summary.configs,
      discoveredUrls: summary.discovered,
      createdRequests: summary.created,
      enrichedRequests: summary.created,
      skipped: summary.skippedKnown + summary.skippedPast + summary.skippedCancelled,
      truncated: summary.truncated,
      errors: summary.errors,
      errorDetails: summary.errors ? summary.errorDetails : undefined,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du scraping:", error);
    return NextResponse.json({ success: false, error: error.message || "Erreur inconnue" }, { status: 500 });
  }
}
