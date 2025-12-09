import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/notifications/logs
 * 
 * Récupère les logs de notifications
 * Admin uniquement
 * 
 * Query params:
 * - limit: nombre de logs à récupérer (défaut: 50)
 * - offset: offset pour la pagination (défaut: 0)
 * - userId: filtrer par utilisateur (optionnel)
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification (admin uniquement)
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur est admin
    const isAdmin =
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin";

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Accès refusé. Admin uniquement." },
        { status: 403 }
      );
    }

    // Récupérer les paramètres de requête
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const userId = searchParams.get("userId");

    // Construire la requête (avec service client pour accès aux logs)
    const serviceClient = createServiceClient();
    let query = serviceClient
      .from("notification_logs")
      .select("*", { count: "exact" })
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      console.error("❌ Erreur lors de la récupération des logs:", error);
      return NextResponse.json(
        { error: "Erreur lors de la récupération des logs" },
        { status: 500 }
      );
    }

    // Récupérer les informations utilisateur via l'API Admin REST
    const userIds = [...new Set((logs || []).map((log: any) => log.user_id).filter(Boolean))];
    const usersMap = new Map<string, { id: string; email: string | null; name: string | null }>();

    // Utiliser l'API REST Admin de Supabase directement
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    for (const userId of userIds) {
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: {
            'apikey': serviceRoleKey!,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const userData = await response.json();
          if (userData) {
            usersMap.set(userId, {
              id: userData.id,
              email: userData.email || null,
              name:
                userData.user_metadata?.name ||
                userData.user_metadata?.full_name ||
                null,
            });
          }
        }
      } catch (err) {
        console.warn(`Impossible de récupérer les infos utilisateur pour ${userId}:`, err);
      }
    }

    // Formater les logs pour inclure les informations utilisateur
    const formattedLogs = (logs || []).map((log: any) => ({
      id: log.id,
      title: log.title,
      body: log.body,
      event_ids: log.event_ids || [],
      sent_at: log.sent_at,
      created_at: log.created_at,
      user: usersMap.get(log.user_id) || null,
    }));

    return NextResponse.json({
      logs: formattedLogs,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération des logs:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

