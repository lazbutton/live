import { NextRequest, NextResponse } from "next/server";

import { requireMobileUserAuth } from "@/lib/mobile-user-auth";

import { jsonError } from "./errors";

export async function requireV1UserAuth(request: NextRequest) {
  const result = await requireMobileUserAuth(request);

  if (result instanceof NextResponse) {
    const status = result.status;
    const payload = (await result.json().catch(() => ({}))) as {
      error?: string;
      details?: unknown;
    };
    const message =
      typeof payload.error === "string" ? payload.error : "Non autorisé";
    const code = status === 403 ? "forbidden" : "unauthorized";

    return {
      ok: false as const,
      response: jsonError(code, message, status, payload.details),
    };
  }

  return {
    ok: true as const,
    auth: result,
  };
}
