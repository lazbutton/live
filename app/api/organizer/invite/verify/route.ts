import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET : Vérifier et récupérer les détails d'une invitation
export async function GET(request: Request) {
  try {
    // Utiliser le service role key pour bypass RLS et permettre la vérification par token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Si le service role key est disponible, l'utiliser (bypass RLS)
    // Sinon, utiliser le client normal (nécessite que la politique RLS soit configurée)
    const supabase = serviceRoleKey && supabaseUrl
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : await import("@/lib/supabase/server").then((m) => m.createClient());
    
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token manquant" },
        { status: 400 }
      );
    }

    // Récupérer l'invitation via la fonction SQL (bypass RLS pour la vérification par token)
    // Alternative: utiliser directement la table si la politique RLS le permet
    const { data: invitation, error } = await supabase
      .from("organizer_invitations")
      .select("id, organizer_id, email, role, expires_at, accepted_at, created_at")
      .eq("token", token)
      .single();

    if (error || !invitation) {
      console.error("Erreur lors de la récupération de l'invitation:", error);
      console.error("Token recherché:", token);
      return NextResponse.json(
        { error: "Invitation non trouvée", details: error?.message },
        { status: 404 }
      );
    }

    // Vérifier si l'invitation est expirée
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Cette invitation a expiré" },
        { status: 410 }
      );
    }

    // Vérifier si l'invitation est déjà acceptée
    if (invitation.accepted_at) {
      return NextResponse.json(
        { error: "Cette invitation a déjà été acceptée" },
        { status: 410 }
      );
    }

    // Récupérer le nom de l'organisateur (organisateur classique ou lieu-organisateur)
    let organizerName = "Organisateur";
    
    // Essayer d'abord dans organizers
    const { data: organizer } = await supabase
      .from("organizers")
      .select("id, name")
      .eq("id", invitation.organizer_id)
      .single();

    if (organizer) {
      organizerName = organizer.name;
    } else {
      // Si pas trouvé, chercher dans locations (lieu-organisateur)
      const { data: location } = await supabase
        .from("locations")
        .select("id, name")
        .eq("id", invitation.organizer_id)
        .eq("is_organizer", true)
        .single();

      if (location) {
        organizerName = location.name;
      }
    }

    return NextResponse.json({
      invitation: {
        email: invitation.email,
        organizer_name: organizerName,
        role: invitation.role,
        expires_at: invitation.expires_at,
      },
    });
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

