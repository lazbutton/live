import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import fs from "fs";
import path from "path";

/**
 * POST /api/admin/crons/trigger
 * 
 * Déclenche manuellement un cron
 * 
 * Body:
 * {
 *   path: string - Le chemin du cron à déclencher (ex: "/api/cron/scrape-events")
 * }
 */
export async function POST(request: NextRequest) {
  // Vérifier que l'utilisateur est admin
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 }
    );
  }

  const role = user.user_metadata?.role;
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Accès non autorisé" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { path } = body;

    if (!path) {
      return NextResponse.json(
        { error: "Le chemin du cron est requis" },
        { status: 400 }
      );
    }

    // Vérifier que le cron existe
    const vercelJsonPath = path.join(process.cwd(), "vercel.json");
    const vercelJsonContent = fs.readFileSync(vercelJsonPath, "utf-8");
    const vercelJson = JSON.parse(vercelJsonContent);
    const cron = vercelJson.crons?.find((c: any) => c.path === path);

    if (!cron) {
      return NextResponse.json(
        { error: "Cron introuvable" },
        { status: 404 }
      );
    }

    // Construire l'URL du cron
    // En production, utiliser l'URL de la requête actuelle
    const origin = request.headers.get("origin") || request.headers.get("host");
    const protocol = origin?.includes("localhost") ? "http" : "https";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (origin ? `${protocol}://${origin}` : "http://localhost:3000");
    const cronUrl = `${baseUrl}${path}`;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET n'est pas configuré" },
        { status: 500 }
      );
    }

    // Appeler le cron avec le header Authorization
    const response = await fetch(cronUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Erreur lors de l'exécution du cron",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cron déclenché avec succès",
      result: data,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors du déclenchement du cron:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur lors du déclenchement du cron",
      },
      { status: 500 }
    );
  }
}

