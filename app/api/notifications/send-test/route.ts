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

    // Vérifier que les variables d'environnement Supabase sont définies
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("❌ Variables d'environnement Supabase manquantes");
      return NextResponse.json(
        { error: "Configuration serveur incomplète" },
        { status: 500 }
      );
    }

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
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error("❌ Erreur lors du parsing du body:", parseError);
      return NextResponse.json(
        { error: "Format JSON invalide dans le body", details: parseError?.message },
        { status: 400 }
      );
    }

    const { title, body: messageBody, test } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: "title et body sont requis" },
        { status: 400 }
      );
    }

    // Envoyer la notification à l'utilisateur connecté
    let result;
    try {
      result = await sendNotificationToUser(user.id, {
        title,
        body: messageBody,
        data: test ? { test: "true" } : {},
      });
    } catch (sendError: any) {
      console.error("❌ Erreur lors de l'appel à sendNotificationToUser:", sendError);
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de l'envoi de la notification",
          details: sendError?.message || sendError?.toString(),
        },
        { status: 500 }
      );
    }

    // Si au moins une notification a été envoyée, considérer comme succès
    // (même si certaines ont échoué)
    if (result.sent > 0) {
      console.log(
        `✅ Notification de test envoyée: ${result.sent} réussie(s), ${result.failed} échouée(s)`
      );
      
      return NextResponse.json({
        success: true,
        message: "Notification de test envoyée",
        sent: result.sent,
        failed: result.failed,
        errors: result.failed > 0 ? result.errors : undefined,
      });
    }

    // Si aucune notification n'a été envoyée, retourner une erreur
    if (!result.success || result.sent === 0) {
      console.error("❌ Échec de l'envoi:", result.errors);
      return NextResponse.json(
        {
          success: false,
          error: result.errors[0] || "Erreur lors de l'envoi",
          sent: result.sent,
          failed: result.failed,
          errors: result.errors,
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
    console.error("❌ Erreur inattendue lors de l'envoi de la notification:", error);
    console.error("   Stack:", error?.stack);
    console.error("   Message:", error?.message);
    return NextResponse.json(
      {
        error: error?.message || "Erreur serveur inattendue",
        details: error?.toString(),
        type: error?.constructor?.name || "Unknown",
      },
      { status: 500 }
    );
  }
}

