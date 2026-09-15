import { NextRequest, NextResponse } from "next/server";

import { requireV1UserAuth } from "@/lib/api/v1/auth";
import { jsonError, zodIssues } from "@/lib/api/v1/errors";
import { createEventFromUrlBodySchema } from "@/lib/api/v1/events/schemas";
import {
  createEventUserRequest,
  createdRequestSuccessMessage,
} from "@/lib/user-requests/create-event-request";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireV1UserAuth(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = createEventFromUrlBodySchema.safeParse(body);
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
        requestType: "event_from_url",
        locationId: parsed.data.locationId,
        locationName: parsed.data.locationName,
        sourceUrl: parsed.data.sourceUrl,
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
          requestType: "event_from_url",
          message: createdRequestSuccessMessage("event_from_url"),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erreur POST /api/v1/events/from-url:", error);
    return jsonError(
      "internal_error",
      error instanceof Error ? error.message : "Erreur serveur",
      500,
    );
  }
}
