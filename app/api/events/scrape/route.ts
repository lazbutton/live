import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scrapeEventPage } from "@/lib/scraping/scrape-event-page";

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur est admin
    const userRole = user.user_metadata?.role;
    if (userRole !== "admin") {
      return NextResponse.json(
        { error: "Accès refusé. Administrateur requis." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { url, organizer_id, location_id } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL requise" },
        { status: 400 }
      );
    }

    const result = await scrapeEventPage({ url, organizer_id: organizer_id || null, location_id: location_id || null, supabase });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ data: result.data, metadata: result.metadata });
  } catch (error) {
    console.error("Erreur lors du scraping:", error);
    return NextResponse.json(
      {
        error: "Erreur lors du scraping",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
