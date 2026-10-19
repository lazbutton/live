import { NextRequest, NextResponse } from "next/server";
import { appError, parseAppBody } from "@/lib/api/app/http";
import {
  adminNewRequestBodySchema,
  adminNewRequestRowSchema,
  type AdminAlertResponse,
} from "@/lib/api/app/schemas";
import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import { createServiceClient } from "@/lib/supabase/service";

/** `id` d'une ligne envoyée par le trigger SQL, s'il est exploitable. */
function isRowId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    !value.includes("{{") &&
    !value.includes("$1")
  );
}

function eventDataTitle(eventData: unknown) {
  return typeof eventData === "object" && eventData !== null
    ? (eventData as { title?: unknown }).title
    : undefined;
}

/**
 * POST /api/notifications/admin/new-request
 * 
 * Envoie une notification push à tous les admins lorsqu'une nouvelle demande est créée
 * 
 * Body (JSON, sinon paramètres de requête), voir docs/API_APP.md :
 * - `adminNewRequestBodySchema` : app et page de test du back-office (`requestId`) ;
 * - `adminNewRequestRowSchema` : ligne envoyée par le trigger SQL `notify_admins_new_request_trigger` (`id`).
 * Route publique : dans les deux cas, la demande est relue en base et le texte de la notification
 * vient d'elle, jamais du corps.
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

    if (typeof body !== "object" || body === null) {
      body = {};
    }

    // Aussi vérifier les paramètres de requête si le body est vide
    if (!body.requestId) {
      const url = new URL(request.url);
      body.requestId = url.searchParams.get("requestId");
      body.requestType = url.searchParams.get("requestType") || body.requestType;
      body.eventTitle = url.searchParams.get("eventTitle") || body.eventTitle;
      body.sourceUrl = url.searchParams.get("sourceUrl") || body.sourceUrl;
    }

    // Id de la demande : `id` pour le trigger SQL, `requestId` pour l'app. Le reste du corps est
    // ignoré : la notification est construite depuis la demande relue en base.
    let requestId: string;
    if (isRowId(body.id)) {
      const row = parseAppBody(adminNewRequestRowSchema, body);
      if (!row.ok) return row.response;
      requestId = row.data.id;
    } else {
      const parsed = parseAppBody(adminNewRequestBodySchema, body);
      if (!parsed.ok) return parsed.response;
      requestId = parsed.data.requestId;
    }

    const supabase = createServiceClient();
    const { data: requestData, error: requestError } = await supabase
      .from("user_requests")
      .select("id, request_type, event_data, source_url, requested_at")
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      console.error("❌ Erreur lors de la récupération de la demande:", requestError);
      return appError(
        "Impossible de récupérer la demande depuis la base de données",
        404,
        { details: requestError },
      );
    }

    const requestType = requestData.request_type;
    const eventTitle = eventDataTitle(requestData.event_data);

    // Construire le message de notification
    const title = eventTitle || "Nouvelle demande";
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
        event_title: eventTitle || null,
        source_url: requestData.source_url || null,
      },
    });

    if (result.success) {
      console.log(`✅ Notification envoyée à ${result.sent} admin(s) pour la demande ${requestData.id}`);
    } else {
      console.error(`❌ Erreur lors de l'envoi des notifications:`, result.errors);
    }

    return NextResponse.json<AdminAlertResponse>({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      flow: {
        route: "/api/notifications/admin/new-request",
        path: "admin_public_request_notification",
        sender: "sendNotificationToAdmins",
        honorsPreferences: false,
        honorsCategories: false,
        targetsAllAdminTokens: true,
      },
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi de la notification admin:", error);
    return appError(error?.message || "Erreur serveur", 500);
  }
}

