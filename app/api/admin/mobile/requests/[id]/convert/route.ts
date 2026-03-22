import { NextRequest, NextResponse } from "next/server";
import { convertMobileAdminRequest } from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const item = await convertMobileAdminRequest(auth.supabase, id);

    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("Erreur API POST /api/admin/mobile/requests/[id]/convert:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
