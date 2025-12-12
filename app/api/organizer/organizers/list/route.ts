import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// GET : Récupérer tous les organisateurs de l'app (pour sélection dans événement)
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    // Vérifier l'authentification
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Récupérer tous les organisateurs
    const { data: organizers, error: orgError } = await supabase
      .from("organizers")
      .select("id, name, logo_url")
      .order("name", { ascending: true });

    if (orgError) {
      console.error("Erreur lors de la récupération des organisateurs:", orgError);
      // Continuer même en cas d'erreur
    }

    // Récupérer tous les lieux-organisateurs
    const { data: locationOrganizers, error: locError } = await supabase
      .from("locations")
      .select("id, name, image_url")
      .eq("is_organizer", true)
      .order("name", { ascending: true });

    if (locError) {
      console.error("Erreur lors de la récupération des lieux-organisateurs:", locError);
      // Continuer même en cas d'erreur
    }

    // Combiner les organisateurs et lieux-organisateurs
    const allOrganizers = [
      ...(organizers || []).map((org) => ({
        id: org.id,
        name: org.name,
        logo_url: org.logo_url,
        type: "organizer" as const,
      })),
      ...(locationOrganizers || []).map((loc) => ({
        id: loc.id,
        name: loc.name,
        logo_url: loc.image_url,
        type: "location" as const,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      organizers: allOrganizers,
    });
  } catch (error: any) {
    console.error("Erreur API /api/organizer/organizers/list:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

