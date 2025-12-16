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
    // Essayer de lire le body JSON d'abord
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Si le body n'est pas JSON, utiliser les paramètres de requête
      const url = new URL(request.url);
      body = {
        requestId: url.searchParams.get("requestId"),
        requestType: url.searchParams.get("requestType"),
        eventTitle: url.searchParams.get("eventTitle"),
        sourceUrl: url.searchParams.get("sourceUrl"),
      };
    }

    // Aussi vérifier les paramètres de requête si le body est vide
    if (!body.requestId) {
      const url = new URL(request.url);
      body.requestId = url.searchParams.get("requestId");
      body.requestType = url.searchParams.get("requestType") || body.requestType;
      body.eventTitle = url.searchParams.get("eventTitle") || body.eventTitle;
      body.sourceUrl = url.searchParams.get("sourceUrl") || body.sourceUrl;
    }

    // Détecter si le body contient directement les données de la demande (format webhook Supabase)
    let requestId: string | null = null;
    let requestData: any = null;

    // Vérifier si le body contient directement les champs de la table user_requests (format webhook)
    if (body.id && typeof body.id === "string" && !body.id.includes("{{") && !body.id.includes("$1")) {
      // Le body contient directement les données de la demande (format webhook Supabase)
      requestId = body.id;
      requestData = {
        id: body.id,
        request_type: body.request_type || body.requestType,
        event_data: body.event_data,
        source_url: body.source_url || body.sourceUrl,
        requested_at: body.requested_at,
      };
    } else if (body.requestId && typeof body.requestId === "string" && !body.requestId.includes("{{") && !body.requestId.includes("$1")) {
      // Le body contient un requestId valide
      requestId = body.requestId;
    } else {
      // Le requestId contient des variables non interpolées, on ne peut pas continuer
      return NextResponse.json(
        { 
          error: "requestId invalide ou contient des variables non interpolées. Le webhook Supabase doit interpoler les variables ou envoyer les données complètes de la demande.",
          hint: "Configurez le webhook pour envoyer soit un body JSON avec les données complètes (id, request_type, event_data, etc.), soit un requestId interpolé."
        },
        { status: 400 }
      );
    }

    // Si on n'a pas encore les données, les récupérer depuis la base
    if (!requestData && requestId) {
      const supabase = createServiceClient();
      const { data: fetchedData, error: requestError } = await supabase
        .from("user_requests")
        .select("id, request_type, event_data, source_url, requested_at")
        .eq("id", requestId)
        .single();

      if (requestError || !fetchedData) {
        console.error("❌ Erreur lors de la récupération de la demande:", requestError);
        return NextResponse.json(
          { error: "Impossible de récupérer la demande depuis la base de données", details: requestError },
          { status: 404 }
        );
      }
      requestData = fetchedData;
    }

    if (!requestData) {
      return NextResponse.json(
        { error: "Impossible de récupérer les données de la demande" },
        { status: 400 }
      );
    }

    const requestType = requestData.request_type || body.requestType;

    // Construire le message de notification
    const title = requestData.event_data?.title || body.eventTitle || "Nouvelle demande";
    const requestTypeLabel = requestType === "event_from_url" ? "depuis URL" : "complète";
    const bodyText = title && title !== "Nouvelle demande"
      ? `Nouvelle demande ${requestTypeLabel}: ${title}`
      : `Nouvelle demande ${requestTypeLabel} d'événement`;

    // Envoyer la notification à tous les admins
    const result = await sendNotificationToAdmins({
      title: "📋 Nouvelle demande",
      body: bodyText,
      data: {
        type: "new_request",
        request_id: requestData.id,
        request_type: requestType,
        event_title: requestData.event_data?.title || null,
        source_url: requestData.source_url || null,
      },
    });

    if (result.success) {
      console.log(`✅ Notification envoyée à ${result.sent} admin(s) pour la demande ${requestData.id}`);
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

