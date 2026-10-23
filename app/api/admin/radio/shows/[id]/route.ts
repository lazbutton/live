import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/auth";
import { adminRadioShowUpdateSchema, updateAdminRadioShow } from "@/lib/radio/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/radio/shows/[id]
 *
 * Corps : `{ family?: "musique" | "parole", organizerId?: uuid | null }`. La famille et le collectif
 * d'une émission ; l'import ne les touche plus ensuite. Admin seulement, écrit par la clé service role.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = adminRadioShowUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Corps de la requête invalide" }, { status: 400 });
  }

  try {
    const show = await updateAdminRadioShow(createServiceClient(), id, parsed.data);
    if (!show) return NextResponse.json({ error: "Émission introuvable" }, { status: 404 });
    return NextResponse.json({ show });
  } catch (error: unknown) {
    console.error("Erreur PATCH /api/admin/radio/shows/[id]:", error);
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
    // 23503 : l'organisateur choisi n'existe plus.
    const message = code === "23503" ? "Organisateur introuvable" : "Modification impossible";
    return NextResponse.json({ error: message }, { status: code === "23503" ? 400 : 500 });
  }
}
