import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendNotificationToUser } from "@/lib/notifications";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * POST /api/notifications/send-test
 *
 * Endpoint pour envoyer des notifications de test depuis l'application mobile
 * Utilise l'authentification JWT Supabase (Bearer token)
 */
export async function POST(request: NextRequest) {
  try {
    // Récupérer le token JWT depuis le header Authorization
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token d'authentification manquant" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Créer un client Supabase pour valider le token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Valider le token en récupérant l'utilisateur
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("❌ Erreur validation token:", authError);
      return NextResponse.json(
        { error: "Token invalide ou expiré", details: authError?.message },
        { status: 401 }
      );
    }

    console.log("✅ Utilisateur authentifié:", user.id, user.email);

    // Récupérer le body de la requête
    const body = await request.json();
    const { title, body: messageBody, test } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: "title et body sont requis" },
        { status: 400 }
      );
    }

    // Envoyer la notification à l'utilisateur connecté
    const result = await sendNotificationToUser(user.id, {
      title,
      body: messageBody,
      data: test ? { test: "true" } : {},
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.errors[0] || "Erreur lors de l'envoi",
          sent: result.sent,
          failed: result.failed,
        },
        { status: 500 }
      );
    }

    console.log(
      `✅ Notification de test envoyée: ${result.sent} réussie(s), ${result.failed} échouée(s)`
    );

    return NextResponse.json({
      success: true,
      message: "Notification de test envoyée",
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi de la notification:", error);
    return NextResponse.json(
      {
        error: error.message || "Erreur serveur",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
}

