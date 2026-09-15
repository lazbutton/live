import { NextRequest, NextResponse } from "next/server";

import { jsonError, zodIssues } from "@/lib/api/v1/errors";
import { publicGetOptions, withPublicGetCors } from "@/lib/api/v1/http";
import { createAnonClient } from "@/lib/api/v1/supabase";
import { eventIdParamsSchema } from "@/lib/api/v1/events/schemas";
import { getPublicEventById } from "@/lib/api/v1/events/service";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return publicGetOptions();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const parsed = eventIdParamsSchema.safeParse({ id });
    if (!parsed.success) {
      return withPublicGetCors(
        jsonError(
          "validation_error",
          "Identifiant invalide",
          400,
          zodIssues(parsed.error),
        ),
      );
    }

    const item = await getPublicEventById(createAnonClient(), parsed.data.id);
    if (!item) {
      return withPublicGetCors(
        jsonError("not_found", "Événement introuvable", 404),
      );
    }

    return withPublicGetCors(NextResponse.json({ data: item }));
  } catch (error) {
    console.error("Erreur GET /api/v1/events/[id]:", error);
    return withPublicGetCors(
      jsonError(
        "internal_error",
        error instanceof Error ? error.message : "Erreur serveur",
        500,
      ),
    );
  }
}
