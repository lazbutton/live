import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST : Créer une demande d'ajout d'organisateur pour un événement
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Vérifier l'authentification
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { organizer_name, organizer_email, event_id } = body;

    if (!organizer_name || !organizer_name.trim()) {
      return NextResponse.json(
        { error: "Le nom de l'organisateur est requis" },
        { status: 400 }
      );
    }

    // Créer une demande dans user_requests
    // On utilise request_type 'event_creation' mais avec event_data contenant la demande d'organisateur
    const { data: requestData, error } = await supabase
      .from("user_requests")
      .insert([
        {
          request_type: "event_creation", // Réutiliser ce type pour l'instant
          requested_by: user.id,
          status: "pending",
          event_data: {
            organizer_request: true,
            organizer_name: organizer_name.trim(),
            organizer_email: organizer_email?.trim() || null,
            event_id: event_id || null,
          },
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Erreur lors de la création de la demande:", error);
      return NextResponse.json(
        { error: error.message || "Erreur lors de la création de la demande" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      request_id: requestData.id,
      message: "Demande d'ajout d'organisateur créée avec succès",
    });
  } catch (error: any) {
    console.error("Erreur API /api/organizer/organizer-request:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}


