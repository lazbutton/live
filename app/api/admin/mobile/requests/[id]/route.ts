import { NextRequest, NextResponse } from "next/server";
import { rejectMobileAdminRequest } from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : null;

    if (action !== "reject") {
      return NextResponse.json(
        { error: "Seule l'action reject est supportée" },
        { status: 400 }
      );
    }

    const reason = typeof body.reason === "string" ? body.reason : "";
    const item = await rejectMobileAdminRequest(auth.supabase, id, {
      reviewedBy: auth.user.id,
      reason,
    });

    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("Erreur API PATCH /api/admin/mobile/requests/[id]:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
