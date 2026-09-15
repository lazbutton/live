import { NextRequest } from "next/server";

import { jsonError, zodIssues } from "@/lib/api/v1/errors";
import {
  publicGetJson,
  publicGetOptions,
  searchParamsToObject,
  withPublicGetCors,
} from "@/lib/api/v1/http";
import { createAnonClient } from "@/lib/api/v1/supabase";
import { featuredEventsQuerySchema } from "@/lib/api/v1/events/schemas";
import { listFeaturedEvents } from "@/lib/api/v1/events/service";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return publicGetOptions();
}

export async function GET(request: NextRequest) {
  try {
    const parsed = featuredEventsQuerySchema.safeParse(
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

    const data = await listFeaturedEvents(createAnonClient(), parsed.data);
    return publicGetJson({
      data,
      pagination: {
        limit: parsed.data.limit ?? 8,
        nextCursor: null,
        hasMore: false,
      },
    });
  } catch (error) {
    console.error("Erreur GET /api/v1/events/featured:", error);
    return withPublicGetCors(
      jsonError(
        "internal_error",
        error instanceof Error ? error.message : "Erreur serveur",
        500,
      ),
    );
  }
}
