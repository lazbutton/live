import { NextRequest, NextResponse } from "next/server";
import { appError, parseAppBody } from "@/lib/api/app/http";
import {
  adminNewRequestBodySchema,
  adminNewRequestRowSchema,
  type AdminAlertResponse,
} from "@/lib/api/app/schemas";
import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import { createServiceClient } from "@/lib/supabase/service";

type RequestData = {
  id: string;
  request_type?: string | null;
  event_data?: unknown;
  source_url?: string | null;
};

/** `id` d'une ligne au format du trigger SQL (retiré), s'il est exploitable. */
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
 * - `adminNewRequestBodySchema` : app et page de test du back-office, demande relue en base ;
 * - `adminNewRequestRowSchema` : ligne `user_requests`, format du trigger SQL
 *   `notify_admins_new_request_trigger`, retiré (plus aucun appelant).
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

    let requestData: RequestData;
    let fallback: { requestType?: string | null; eventTitle?: string | null } = {};

    if (isRowId(body.id)) {
      // Format du trigger SQL (retiré) : la ligne de la demande, sans relecture.
      const row = parseAppBody(adminNewRequestRowSchema, body);
      if (!row.ok) return row.response;
      requestData = {
        id: row.data.id,
        request_type: row.data.request_type || row.data.requestType,
        event_data: row.data.event_data,
        source_url: row.data.source_url || row.data.sourceUrl,
      };
      fallback = row.data;
    } else {
      const parsed = parseAppBody(adminNewRequestBodySchema, body);
      if (!parsed.ok) return parsed.response;
      fallback = parsed.data;

      const supabase = createServiceClient();
      const { data: fetchedData, error: requestError } = await supabase
        .from("user_requests")
        .select("id, request_type, event_data, source_url, requested_at")
        .eq("id", parsed.data.requestId)
        .single();

      if (requestError || !fetchedData) {
        console.error("❌ Erreur lors de la récupération de la demande:", requestError);
        return appError(
          "Impossible de récupérer la demande depuis la base de données",
          404,
          { details: requestError },
        );
      }
      requestData = fetchedData;
    }

    const requestType = requestData.request_type || fallback.requestType;
    const eventTitle = eventDataTitle(requestData.event_data);

    // Construire le message de notification
    const title = eventTitle || fallback.eventTitle || "Nouvelle demande";
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
      diagnostics: result.diagnostics,
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

