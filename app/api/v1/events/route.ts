import { NextRequest, NextResponse } from "next/server";

import { requireV1UserAuth } from "@/lib/api/v1/auth";
import { jsonError, zodIssues } from "@/lib/api/v1/errors";
import {
  publicGetJson,
  publicGetOptions,
  searchParamsToObject,
  withPublicGetCors,
} from "@/lib/api/v1/http";
import { createAnonClient } from "@/lib/api/v1/supabase";
import { toEventDataPayload } from "@/lib/api/v1/events/mapper";
import { listPublicEvents } from "@/lib/api/v1/events/service";
import {
  createEventBodySchema,
  eventListQuerySchema,
} from "@/lib/api/v1/events/schemas";
import {
  createEventUserRequest,
  createdRequestSuccessMessage,
} from "@/lib/user-requests/create-event-request";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return publicGetOptions();
}

export async function GET(request: NextRequest) {
  try {
    const parsed = eventListQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );

    if (!parsed.success) {
      return withPublicGetCors(
        jsonError(
          "validation_error",
          "Paramètres de requête invalides",
          400,
          zodIssues(parsed.error),
        ),
      );
    }

    const result = await listPublicEvents(createAnonClient(), parsed.data);
    return publicGetJson(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CURSOR") {
      return withPublicGetCors(
        jsonError("validation_error", "Curseur de pagination invalide", 400),
      );
    }

    console.error("Erreur GET /api/v1/events:", error);
    return withPublicGetCors(
      jsonError(
        "internal_error",
        error instanceof Error ? error.message : "Erreur serveur",
        500,
      ),
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireV1UserAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = createEventBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        "validation_error",
        "Payload invalide",
        400,
        zodIssues(parsed.error),
      );
    }

    const created = await createEventUserRequest({
      accessToken: auth.auth.token,
      userId: auth.auth.user.id,
      input: {
        requestType: "event_creation",
        eventData: toEventDataPayload(parsed.data),
        contributorDisplayName: parsed.data.contributorDisplayName,
        communityAttributionOptIn: parsed.data.communityAttributionOptIn,
      },
    });

    if (!created.ok) {
      return jsonError("validation_error", created.message, created.status);
    }

    return NextResponse.json(
      {
        data: {
          id: created.request.id,
          status: "pending",
          requestType: "event_creation",
          message: createdRequestSuccessMessage("event_creation"),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erreur POST /api/v1/events:", error);
    return jsonError(
      "internal_error",
      error instanceof Error ? error.message : "Erreur serveur",
      500,
    );
  }
}
