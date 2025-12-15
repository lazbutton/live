import { NextRequest, NextResponse } from "next/server";
import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/notifications/admin/new-request
 * 
 * Envoie une notification push à tous les admins lorsqu'une nouvelle demande est créée
 * 
 * Body:
 * {
 *   requestId: string - ID de la demande
 *   requestType: 'event_creation' | 'event_from_url' - Type de demande
 *   eventTitle?: string - Titre de l'événement (optionnel)
 *   sourceUrl?: string - URL source (optionnel)
 * }
 * 
 * Cette route peut être appelée :
 * - Par un trigger Supabase Database Webhook
 * - Directement depuis le code qui crée une demande
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, requestType, eventTitle, sourceUrl } = body;

    if (!requestId || !requestType) {
      return NextResponse.json(
        { error: "requestId et requestType sont requis" },
        { status: 400 }
      );
    }

    // Récupérer les détails de la demande si nécessaire
    const supabase = createServiceClient();
    const { data: requestData, error: requestError } = await supabase
      .from("user_requests")
      .select("id, request_type, event_data, source_url, requested_at")
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      console.error("❌ Erreur lors de la récupération de la demande:", requestError);
      // On continue quand même, on utilisera les données du body
    }

    // Construire le message de notification
    const title = requestData?.event_data?.title || eventTitle || "Nouvelle demande";
    const requestTypeLabel = requestType === "event_from_url" ? "depuis URL" : "complète";
    const bodyText = requestData?.event_data?.title
      ? `Nouvelle demande ${requestTypeLabel}: ${title}`
      : `Nouvelle demande ${requestTypeLabel} d'événement`;

    // Envoyer la notification à tous les admins
    const result = await sendNotificationToAdmins({
      title: "📋 Nouvelle demande",
      body: bodyText,
      data: {
        type: "new_request",
        request_id: requestId,
        request_type: requestType,
        event_title: requestData?.event_data?.title || eventTitle || null,
        source_url: requestData?.source_url || sourceUrl || null,
      },
    });

    if (result.success) {
      console.log(`✅ Notification envoyée à ${result.sent} admin(s) pour la demande ${requestId}`);
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

