import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  createEventUserRequest,
  createdRequestSuccessMessage,
  type CreateEventRequestInput,
} from "@/lib/user-requests/create-event-request";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type LegacyCreateEventCreationRequestBody = {
  requestType: "event_creation";
  eventData: Record<string, unknown>;
  contributorDisplayName?: string | null;
  communityAttributionOptIn?: boolean;
};

type LegacyCreateEventFromUrlRequestBody = {
  requestType: "event_from_url";
  locationId?: string | null;
  locationName: string;
  sourceUrl: string;
  contributorDisplayName?: string | null;
  communityAttributionOptIn?: boolean;
};

type LegacyCreateUserRequestBody =
  | LegacyCreateEventCreationRequestBody
  | LegacyCreateEventFromUrlRequestBody;

function createUserScopedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
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
      | LegacyCreateUserRequestBody
      | null;

    if (!body || typeof body.requestType !== "string") {
      return NextResponse.json(
        { error: "requestType est requis" },
        { status: 400 },
      );
    }

    let input: CreateEventRequestInput;

    if (body.requestType === "event_creation") {
      if (!body.eventData || typeof body.eventData !== "object") {
        return NextResponse.json(
          { error: "eventData est requis pour event_creation" },
          { status: 400 },
        );
      }
      input = {
        requestType: "event_creation",
        eventData: body.eventData,
        contributorDisplayName: body.contributorDisplayName,
        communityAttributionOptIn: body.communityAttributionOptIn,
      };
    } else if (body.requestType === "event_from_url") {
      input = {
        requestType: "event_from_url",
        locationId: body.locationId,
        locationName: body.locationName,
        sourceUrl: body.sourceUrl,
        contributorDisplayName: body.contributorDisplayName,
        communityAttributionOptIn: body.communityAttributionOptIn,
      };
    } else {
      return NextResponse.json(
        { error: "requestType non supporté" },
        { status: 400 },
      );
    }

    const created = await createEventUserRequest({
      accessToken: token,
      userId: user.id,
      input,
    });

    if (!created.ok) {
      return NextResponse.json(
        { error: created.message },
        { status: created.status },
      );
    }

    return NextResponse.json({
      success: true,
      request_id: created.request.id,
      status: "pending",
      message: createdRequestSuccessMessage(created.request.request_type),
      notification: {
        success: created.notification.success,
        sent: created.notification.sent,
        failed: created.notification.failed,
        errors: created.notification.errors,
        diagnostics: created.notification.diagnostics,
      },
      flow: {
        route: "/api/user-requests",
        path: "create_user_request_and_notify_admins",
        authMode: "jwt",
        sender: "sendNotificationToAdmins",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
