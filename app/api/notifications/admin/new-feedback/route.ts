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

    // Détecter si le body contient directement les données du feedback (format webhook Supabase)
    // Le webhook Supabase peut envoyer soit { feedbackId: "{{ $1.id }}" } soit directement { id: "...", description: "..." }
    let feedbackId: string | null = null;
    let feedbackData: any = null;

    // Vérifier si le body contient directement les champs de la table feedbacks (format webhook)
    if (body.id && typeof body.id === "string" && !body.id.includes("{{") && !body.id.includes("$1")) {
      // Le body contient directement les données du feedback (format webhook Supabase)
      feedbackId = body.id;
      feedbackData = {
        id: body.id,
        description: body.description || body.message,
        user_id: body.user_id || body.userId,
        status: body.status,
        feedback_object_id: body.feedback_object_id,
        created_at: body.created_at,
      };
    } else if (body.feedbackId && typeof body.feedbackId === "string" && !body.feedbackId.includes("{{") && !body.feedbackId.includes("$1")) {
      // Le body contient un feedbackId valide
      feedbackId = body.feedbackId;
    } else {
      // Le feedbackId contient des variables non interpolées, on ne peut pas continuer
      return NextResponse.json(
        { 
          error: "feedbackId invalide ou contient des variables non interpolées. Le webhook Supabase doit interpoler les variables ou envoyer les données complètes du feedback.",
          hint: "Configurez le webhook pour envoyer soit un body JSON avec les données complètes (id, description, user_id, etc.), soit un feedbackId interpolé."
        },
        { status: 400 }
      );
    }

    // Si on n'a pas encore les données, les récupérer depuis la base
    if (!feedbackData && feedbackId) {
      const supabase = createServiceClient();
      const { data: fetchedData, error: feedbackError } = await supabase
        .from("feedbacks")
        .select("id, description, user_id, created_at, status, feedback_object_id")
        .eq("id", feedbackId)
        .single();

      if (feedbackError || !fetchedData) {
        console.error("❌ Erreur lors de la récupération du feedback:", feedbackError);
        return NextResponse.json(
          { error: "Impossible de récupérer le feedback depuis la base de données", details: feedbackError },
          { status: 404 }
        );
      }
      feedbackData = fetchedData;
    }

    if (!feedbackData) {
      return NextResponse.json(
        { error: "Impossible de récupérer les données du feedback" },
        { status: 400 }
      );
    }

    // Construire le message de notification
    const feedbackDescription = feedbackData.description || "Nouveau feedback";
    
    // Tronquer le message à 100 caractères pour la notification
    const truncatedMessage = feedbackDescription.length > 100 
      ? feedbackDescription.substring(0, 97) + "..." 
      : feedbackDescription;

    const feedbackTypeLabel = body.feedbackType || "feedback";

    // Envoyer la notification à tous les admins
    const result = await sendNotificationToAdmins({
      title: "💬 Nouveau feedback",
      body: `${feedbackTypeLabel}: ${truncatedMessage}`,
      data: {
        type: "new_feedback",
        feedback_id: feedbackData.id,
        feedback_type: body.feedbackType || null,
        message: truncatedMessage,
        user_id: feedbackData.user_id || null,
        feedback_object_id: feedbackData.feedback_object_id || null,
      },
    });

    if (result.success) {
      console.log(`✅ Notification envoyée à ${result.sent} admin(s) pour le feedback ${feedbackData.id}`);
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

