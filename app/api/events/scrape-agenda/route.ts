import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { scanAgendaPage } from "@/lib/scraping/agenda-scan";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/events/scrape-agenda
 *
 * Aperçu d'une page d'agenda : liste des événements détectés, avec ceux déjà
 * importés, passés ou annulés signalés. Aucune écriture.
 *
 * Body : { url: string; organizer_id?: string; location_id?: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (user.user_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  try {
    const { url, organizer_id, location_id } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL requise" }, { status: 400 });
    }

    const scan = await scanAgendaPage(createServiceClient(), {
      url,
      organizerId: organizer_id,
      locationId: location_id,
    });
    if (scan.events.length === 0 && scan.errors.length > 0) {
      return NextResponse.json({ error: scan.errors[0] }, { status: 502 });
    }
    return NextResponse.json(scan);
  } catch (error) {
    console.error("Aperçu d'agenda impossible:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aperçu impossible" },
      { status: 500 },
    );
  }
}
