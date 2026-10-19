import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { appError, readAppJsonBody } from "@/lib/api/app/http";
import {
  createUserRequestBodySchema,
  type CreateUserRequestResponse,
} from "@/lib/api/app/schemas";
import {
  createEventUserRequest,
  createdRequestSuccessMessage,
} from "@/lib/user-requests/create-event-request";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createUserScopedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

/**
 * POST /api/user-requests
 *
 * Demande de création d'événement envoyée par l'app (formulaire, affiche seule ou lien).
 * Body : `createUserRequestBodySchema` (lib/api/app/schemas.ts), voir docs/API_APP.md.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return appError("Token d'authentification manquant", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createUserScopedClient(token);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return appError("Token invalide ou expiré", 401, {
        details: authError?.message,
      });
    }

    const body = await readAppJsonBody(request, createUserRequestBodySchema);
    if (!body.ok) return body.response;

    const created = await createEventUserRequest({
      accessToken: token,
      userId: user.id,
      input: body.data,
    });

    if (!created.ok) {
      return appError(created.message, created.status);
    }

    return NextResponse.json<CreateUserRequestResponse>({
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
    return appError(message, 500);
  }
}
