import { NextRequest, NextResponse } from "next/server";
import { listMobileAdminEvents, type MobileAdminEventStatusFilter } from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";

function resolveStatus(value: string | null): MobileAdminEventStatusFilter {
  if (value === "pending" || value === "approved" || value === "all") {
    return value;
  }
  return "all";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const searchParams = request.nextUrl.searchParams;
    const status = resolveStatus(searchParams.get("status"));
    const search = searchParams.get("search") || "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "80"), 1), 120);

    const items = await listMobileAdminEvents(auth.supabase, {
      status,
      search,
      limit,
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Erreur API /api/admin/mobile/events:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
