import { NextResponse } from "next/server";

import { isAdminUser } from "@/lib/auth";
import { loadAdminRadio } from "@/lib/radio/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/radio
 *
 * Le back-office de la radio (`/admin/radio`) : stations, émissions (actives ou non, famille,
 * collectif, dernier épisode), organisateurs pour choisir un collectif. Admin seulement ; lu par la clé
 * service role (la RLS cache une station désactivée).
 */
export async function GET() {
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

  try {
    return NextResponse.json(await loadAdminRadio(createServiceClient()));
  } catch (error: unknown) {
    console.error("Erreur GET /api/admin/radio:", error);
    return NextResponse.json({ error: "Lecture de la radio impossible" }, { status: 500 });
  }
}
