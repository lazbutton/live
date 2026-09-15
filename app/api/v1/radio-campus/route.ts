import { jsonError } from "@/lib/api/v1/errors";
import {
  publicCachedGetJson,
  publicGetOptions,
  withPublicGetCors,
} from "@/lib/api/v1/http";
import { getCachedRadioCampusFeed } from "@/lib/api/v1/events/radio-campus";

export const revalidate = 60;
export const preferredRegion = "cdg1";

export function OPTIONS() {
  return publicGetOptions();
}

export async function GET() {
  try {
    const payload = await getCachedRadioCampusFeed();
    return publicCachedGetJson(payload);
  } catch (error) {
    console.error("Erreur GET /api/v1/radio-campus:", error);
    return withPublicGetCors(
      jsonError(
        "internal_error",
        error instanceof Error ? error.message : "Erreur serveur",
        500,
      ),
    );
  }
}
