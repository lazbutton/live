import { NextRequest, NextResponse } from "next/server";
import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/notifications/admin/new-feedback
 * 
 * Envoie une notification push à tous les admins lorsqu'un nouveau feedback est créé
 * 
 * Body:
 * {
 *   feedbackId: string - ID du feedback
 *   feedbackType?: string - Type de feedback (optionnel)
 *   message?: string - Description du feedback (optionnel, tronqué)
 *   userId?: string - ID de l'utilisateur qui a créé le feedback (optionnel)
 * }
 * 
 * Cette route peut être appelée :
 * - Par un trigger Supabase Database Webhook
 * - Directement depuis le code qui crée un feedback
 */
export async function POST(request: NextRequest) {
  try {
    // Essayer de lire le body JSON d'abord
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Si le body n'est pas JSON, utiliser les paramètres de requête
      const url = new URL(request.url);
      body = {
        feedbackId: url.searchParams.get("feedbackId"),
        message: url.searchParams.get("message"),
        userId: url.searchParams.get("userId"),
        feedbackType: url.searchParams.get("feedbackType"),
      };
    }

    // Aussi vérifier les paramètres de requête si le body est vide
    if (!body.feedbackId) {
      const url = new URL(request.url);
      body.feedbackId = url.searchParams.get("feedbackId");
      body.message = url.searchParams.get("message") || body.message;
      body.userId = url.searchParams.get("userId") || body.userId;
      body.feedbackType = url.searchParams.get("feedbackType") || body.feedbackType;
    }

    const { feedbackId, feedbackType, message, userId } = body;

    if (!feedbackId) {
      return NextResponse.json(
        { error: "feedbackId est requis (dans le body JSON ou en paramètre de requête)" },
        { status: 400 }
      );
    }

    // Récupérer les détails du feedback si nécessaire
    const supabase = createServiceClient();
    const { data: feedbackData, error: feedbackError } = await supabase
      .from("feedbacks")
      .select("id, description, user_id, created_at, status, feedback_object_id")
      .eq("id", feedbackId)
      .single();

    if (feedbackError || !feedbackData) {
      console.error("❌ Erreur lors de la récupération du feedback:", feedbackError);
      // Si on ne peut pas récupérer depuis la base, utiliser le message du body seulement s'il n'est pas une variable
      if (message && !message.includes("{{") && !message.includes("$1")) {
        // Le message est valide, on peut l'utiliser
      } else {
        return NextResponse.json(
          { error: "Impossible de récupérer le feedback depuis la base de données" },
          { status: 404 }
        );
      }
    }

    // Construire le message de notification
    // Priorité : données de la base > message du body (seulement si pas de variables non interpolées)
    let feedbackDescription = feedbackData?.description;
    
    if (!feedbackDescription) {
      // Vérifier si le message contient des variables non interpolées
      if (message && !message.includes("{{") && !message.includes("$1")) {
        feedbackDescription = message;
      } else {
        // Si le message contient des variables non interpolées, utiliser un message par défaut
        feedbackDescription = "Nouveau feedback";
      }
    }
    
    // Tronquer le message à 100 caractères pour la notification
    const truncatedMessage = feedbackDescription.length > 100 
      ? feedbackDescription.substring(0, 97) + "..." 
      : feedbackDescription;

    const feedbackTypeLabel = feedbackType || "feedback";

    // Envoyer la notification à tous les admins
    const result = await sendNotificationToAdmins({
      title: "💬 Nouveau feedback",
      body: `${feedbackTypeLabel}: ${truncatedMessage}`,
      data: {
        type: "new_feedback",
        feedback_id: feedbackId,
        feedback_type: feedbackType || null,
        message: truncatedMessage,
        user_id: feedbackData?.user_id || userId || null,
        feedback_object_id: feedbackData?.feedback_object_id || null,
      },
    });

    if (result.success) {
      console.log(`✅ Notification envoyée à ${result.sent} admin(s) pour le feedback ${feedbackId}`);
    } else {
      console.error(`❌ Erreur lors de l'envoi des notifications:`, result.errors);
    }

    return NextResponse.json({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi de la notification admin:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

