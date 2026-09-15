import { NextRequest } from "next/server";

import { requireV1UserAuth } from "@/lib/api/v1/auth";
import { jsonError, zodIssues } from "@/lib/api/v1/errors";
import { searchParamsToObject } from "@/lib/api/v1/http";
import { createUserScopedClient } from "@/lib/api/v1/supabase";
import { submissionsQuerySchema } from "@/lib/api/v1/events/schemas";
import { listUserEventSubmissions } from "@/lib/api/v1/events/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireV1UserAuth(request);
    if (!auth.ok) return auth.response;

    const parsed = submissionsQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return jsonError(
        "validation_error",
        "Paramètres de requête invalides",
        400,
        zodIssues(parsed.error),
      );
    }

    const supabase = createUserScopedClient(auth.auth.token);
    const data = await listUserEventSubmissions(supabase, auth.auth.user.id, {
      status: parsed.data.status,
      limit: parsed.data.limit ?? 50,
    });

    return Response.json({ data });
  } catch (error) {
    console.error("Erreur GET /api/v1/events/submissions:", error);
    return jsonError(
      "internal_error",
      error instanceof Error ? error.message : "Erreur serveur",
      500,
    );
  }
}
