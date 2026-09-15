import { NextResponse } from "next/server";

import { withPublicGetCors, publicGetOptions } from "@/lib/api/v1/http";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return publicGetOptions();
}

export function GET() {
  const document = buildOpenApiDocument();
  return withPublicGetCors(NextResponse.json(document));
}
