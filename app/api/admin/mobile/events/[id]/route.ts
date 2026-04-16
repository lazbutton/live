import { NextRequest, NextResponse } from "next/server";
import {
  approveMobileEvent,
  getMobileAdminEventById,
  quickEditMobileEvent,
  toggleMobileEventFeatured,
  toggleMobileEventFull,
} from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const item = await getMobileAdminEventById(auth.supabase, id);

    if (!item) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("Erreur API GET /api/admin/mobile/events/[id]:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

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

    if (!action) {
      return NextResponse.json({ error: "action est requis" }, { status: 400 });
    }

    let item;

    switch (action) {
      case "approve":
        item = await approveMobileEvent(auth.supabase, id);
        break;
      case "toggleFull":
        item = await toggleMobileEventFull(auth.supabase, id);
        break;
      case "toggleFeatured":
        item = await toggleMobileEventFeatured(auth.supabase, id);
        break;
      case "quickEdit":
        item = await quickEditMobileEvent(auth.supabase, id, {
          title: typeof body.title === "string" ? body.title : undefined,
          date: typeof body.date === "string" ? body.date : undefined,
          locationId:
            typeof body.locationId === "string"
              ? body.locationId
              : body.locationId === null
                ? null
                : undefined,
          externalUrl:
            typeof body.externalUrl === "string"
              ? body.externalUrl
              : body.externalUrl === null
                ? null
                : undefined,
          externalUrlLabel:
            typeof body.externalUrlLabel === "string"
              ? body.externalUrlLabel
              : body.externalUrlLabel === null
                ? null
                : undefined,
          price:
            typeof body.price === "number"
              ? body.price
              : body.price === null
                ? null
                : undefined,
          isPayWhatYouWant:
            typeof body.isPayWhatYouWant === "boolean"
              ? body.isPayWhatYouWant
              : undefined,
        });
        break;
      default:
        return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
    }

    return NextResponse.json({ item });
  } catch (error: any) {
    console.error("Erreur API PATCH /api/admin/mobile/events/[id]:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}
