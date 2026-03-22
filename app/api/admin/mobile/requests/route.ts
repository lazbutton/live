import { NextRequest, NextResponse } from "next/server";
import { listMobileAdminRequests } from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";
import type { AdminRequestLane } from "@/lib/admin-requests-core";

function resolveLane(value: string | null): AdminRequestLane {
  if (
    value === "ready" ||
    value === "to_process" ||
    value === "from_url" ||
    value === "blocked" ||
    value === "processed"
  ) {
    return value;
  }
  return "ready";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const searchParams = request.nextUrl.searchParams;
    const lane = resolveLane(searchParams.get("lane"));
    const search = searchParams.get("search") || "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "80"), 1), 120);

    const items = await listMobileAdminRequests(auth.supabase, {
      lane,
      search,
      limit,
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Erreur API /api/admin/mobile/requests:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
