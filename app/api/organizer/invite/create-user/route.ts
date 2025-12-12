import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST : Créer un utilisateur automatiquement confirmé (sans email de confirmation)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    // Utiliser le service role key pour créer l'utilisateur avec email confirmé
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Variables d'environnement manquantes");
      return NextResponse.json(
        { error: "Configuration serveur incorrecte" },
        { status: 500 }
      );
    }

    // Créer un client admin avec service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Créer l'utilisateur avec email automatiquement confirmé
    const { data, error } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // Confirmer l'email automatiquement
      user_metadata: {},
    });

    if (error) {
      console.error("Erreur lors de la création de l'utilisateur:", error);
      
      // Si l'utilisateur existe déjà, retourner une erreur spécifique
      if (
        error.message.includes("already registered") ||
        error.message.includes("User already registered") ||
        error.message.includes("already exists")
      ) {
        return NextResponse.json(
          { error: "Cet utilisateur existe déjà" },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: error.message || "Erreur lors de la création de l'utilisateur" },
        { status: 500 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: "Erreur lors de la création de l'utilisateur" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        email_confirmed_at: data.user.email_confirmed_at,
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


