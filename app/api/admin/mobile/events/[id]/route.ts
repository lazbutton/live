import { NextRequest, NextResponse } from "next/server";
import {
  approveMobileEvent,
  getMobileAdminEventById,
  quickEditMobileEvent,
  toggleMobileEventFeatured,
  toggleMobileEventFull,
  type MobileAdminEventItem,
} from "@/lib/admin-mobile";
import { requireAdminMobileAuth } from "@/lib/admin-mobile-auth";
import { appError, readAppJsonBody } from "@/lib/api/app/http";
import {
  adminEventActionBodySchema,
  type AdminEventActionResponse,
} from "@/lib/api/app/schemas";

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

/**
 * PATCH /api/admin/mobile/events/[id]
 *
 * Actions rapides de l'app (approuver, complet, à la une, édition rapide).
 * Body : `adminEventActionBodySchema` (lib/api/app/schemas.ts), voir docs/API_APP.md.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdminMobileAuth(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await readAppJsonBody(request, adminEventActionBodySchema);
    if (!body.ok) return body.response;
    const input = body.data;

    let item: MobileAdminEventItem;

    switch (input.action) {
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
        // `null` laisse le titre, la date et « prix libre » inchangés, comme une clé absente.
        item = await quickEditMobileEvent(auth.supabase, id, {
          title: input.title ?? undefined,
          date: input.date ?? undefined,
          locationId: input.locationId,
          externalUrl: input.externalUrl,
          externalUrlLabel: input.externalUrlLabel,
          price: input.price,
          isPayWhatYouWant: input.isPayWhatYouWant ?? undefined,
        });
        break;
    }

    return NextResponse.json<AdminEventActionResponse>({ item });
  } catch (error: any) {
    console.error("Erreur API PATCH /api/admin/mobile/events/[id]:", error);
    return appError(error?.message || "Erreur serveur", 500);
  }
}
