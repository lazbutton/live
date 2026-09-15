import { NextResponse } from "next/server";

import { getSiteUrl } from "@/lib/metadata";
import { withPublicGetCors, publicGetOptions } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return publicGetOptions();
}

export function GET() {
  const origin = getSiteUrl();

  return withPublicGetCors(
    NextResponse.json({
      name: "OutLive Events API",
      version: "1.0.0",
      docs: `${origin}/swagger`,
      docsAlt: `${origin}/docs/api`,
      openapi: `${origin}/api/v1/openapi.json`,
      endpoints: {
        events: `${origin}/api/v1/events`,
        featured: `${origin}/api/v1/events/featured`,
        eventById: `${origin}/api/v1/events/{id}`,
        submissions: `${origin}/api/v1/events/submissions`,
        create: `${origin}/api/v1/events`,
        createFromUrl: `${origin}/api/v1/events/from-url`,
        extractFromImage: `${origin}/api/v1/events/extract-from-image`,
      },
    }),
  );
}
