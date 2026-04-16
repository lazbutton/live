import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { sendNotificationToAdmins } from "@/lib/notifications/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type CreateEventCreationRequestBody = {
  requestType: "event_creation";
  eventData: Record<string, any>;
  contributorDisplayName?: string | null;
  communityAttributionOptIn?: boolean;
};

type CreateEventFromUrlRequestBody = {
  requestType: "event_from_url";
  locationId?: string | null;
  locationName: string;
  sourceUrl: string;
  contributorDisplayName?: string | null;
  communityAttributionOptIn?: boolean;
};

type CreateUserRequestBody =
  | CreateEventCreationRequestBody
  | CreateEventFromUrlRequestBody;

function createUserScopedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function buildNotificationBody(payload: {
  requestType: string;
  eventTitle?: string | null;
}) {
  const requestTypeLabel =
    payload.requestType === "event_from_url" ? "depuis URL" : "complète";
  const title =
    payload.eventTitle?.toString().trim() || "Nouvelle demande";

  if (title !== "Nouvelle demande") {
    return `Nouvelle demande ${requestTypeLabel}: ${title}`;
  }

  return `Nouvelle demande ${requestTypeLabel} d'événement`;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token d'authentification manquant" },
        { status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createUserScopedClient(token);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Token invalide ou expiré", details: authError?.message },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | CreateUserRequestBody
      | null;

    if (!body || typeof body.requestType !== "string") {
      return NextResponse.json(
        { error: "requestType est requis" },
        { status: 400 },
      );
    }

    let createdRequest:
      | {
          id: string;
          request_type: string;
          event_data?: Record<string, any> | null;
          source_url?: string | null;
        }
      | null = null;

    if (body.requestType === "event_creation") {
      if (!body.eventData || typeof body.eventData !== "object") {
        return NextResponse.json(
          { error: "eventData est requis pour event_creation" },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("user_requests")
        .insert({
          request_type: "event_creation",
          requested_by: user.id,
          event_data: body.eventData,
          status: "pending",
          contributor_display_name:
            body.contributorDisplayName?.trim() || null,
          community_attribution_opt_in:
            body.communityAttributionOptIn ?? false,
        })
        .select("id, request_type, event_data, source_url")
        .single();

      if (error || !data) {
        return NextResponse.json(
          {
            error:
              error?.message ||
              "Impossible de créer la demande event_creation",
          },
          { status: 400 },
        );
      }

      createdRequest = data;
    } else if (body.requestType === "event_from_url") {
      if (
        typeof body.locationName !== "string" ||
        body.locationName.trim().length === 0 ||
        typeof body.sourceUrl !== "string" ||
        body.sourceUrl.trim().length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "locationName et sourceUrl sont requis pour event_from_url",
          },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("user_requests")
        .insert({
          request_type: "event_from_url",
          requested_by: user.id,
          location_id: body.locationId?.trim().length
            ? body.locationId!.trim()
            : null,
          location_name: body.locationName.trim(),
          source_url: body.sourceUrl.trim(),
          status: "pending",
          contributor_display_name:
            body.contributorDisplayName?.trim() || null,
          community_attribution_opt_in:
            body.communityAttributionOptIn ?? false,
        })
        .select("id, request_type, event_data, source_url")
        .single();

      if (error || !data) {
        return NextResponse.json(
          {
            error:
              error?.message ||
              "Impossible de créer la demande event_from_url",
          },
          { status: 400 },
        );
      }

      createdRequest = data;
    } else {
      return NextResponse.json(
        { error: "requestType non supporté" },
        { status: 400 },
      );
    }

    const notificationResult = await sendNotificationToAdmins({
      title: "📋 Nouvelle demande",
      body: buildNotificationBody({
        requestType: createdRequest.request_type,
        eventTitle: createdRequest.event_data?.title?.toString(),
      }),
      data: {
        type: "new_request",
        request_id: createdRequest.id,
        request_type: createdRequest.request_type,
        event_title: createdRequest.event_data?.title?.toString() ?? null,
        source_url: createdRequest.source_url ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      request_id: createdRequest.id,
      status: "pending",
      message:
        createdRequest.request_type === "event_from_url"
          ? "Demande de création d'événement depuis URL soumise avec succès. Elle sera examinée par un administrateur."
          : "Demande de création d'événement soumise avec succès. Elle sera examinée par un administrateur.",
      notification: {
        success: notificationResult.success,
        sent: notificationResult.sent,
        failed: notificationResult.failed,
        errors: notificationResult.errors,
        diagnostics: notificationResult.diagnostics,
      },
      flow: {
        route: "/api/user-requests",
        path: "create_user_request_and_notify_admins",
        authMode: "jwt",
        sender: "sendNotificationToAdmins",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 },
    );
  }
}
