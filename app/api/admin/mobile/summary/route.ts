import { NextRequest, NextResponse } from "next/server";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";
import { fetchMobileAdminSummary } from "@/lib/admin-mobile";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const summary = await fetchMobileAdminSummary(auth.supabase);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error("Erreur API /api/admin/mobile/summary:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
