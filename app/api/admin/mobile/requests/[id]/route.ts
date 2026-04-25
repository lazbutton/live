import { NextRequest, NextResponse } from "next/server";
import {
  rejectMobileAdminRequest,
  requestChangesMobileAdminRequest,
} from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";
import type { AdminModerationReason } from "@/lib/admin-requests-core";

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

    if (action !== "reject" && action !== "request_changes") {
      return NextResponse.json(
        { error: "Action non supportée" },
        { status: 400 }
      );
    }

    const internalNotes =
      typeof body.internalNotes === "string"
        ? body.internalNotes
        : typeof body.reason === "string"
          ? body.reason
          : "";
    const moderationReason =
      typeof body.moderationReason === "string" ? body.moderationReason : null;
    const contributorMessage =
      typeof body.contributorMessage === "string" ? body.contributorMessage : "";
    if (!moderationReason) {
      return NextResponse.json(
        { error: "moderationReason est requis" },
        { status: 400 }
      );
    }

    const reviewInput = {
      reviewedBy: auth.user.id,
      internalNotes,
      moderationReason: moderationReason as AdminModerationReason,
      contributorMessage,
    };
    const item =
      action === "request_changes"
        ? await requestChangesMobileAdminRequest(auth.supabase, id, reviewInput)
        : await rejectMobileAdminRequest(auth.supabase, id, reviewInput);

    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("Erreur API PATCH /api/admin/mobile/requests/[id]:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
