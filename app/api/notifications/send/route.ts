import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToAll,
} from "@/lib/notifications";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * POST /api/notifications/send
 * 
 * Envoie des notifications push aux utilisateurs
 * 
 * Authentification:
 * - Via cookies (admin uniquement) - pour l'interface web
 * - Via JWT Bearer token - pour l'application mobile
 * 
 * Body:
 * {
 *   userIds?: string[] - IDs des utilisateurs (optionnel, si absent envoie à tous)
 *   userId?: string - ID d'un seul utilisateur (optionnel)
 *   title: string - Titre de la notification
 *   body: string - Corps de la notification
 *   data?: Record<string, any> - Données personnalisées
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");
    const isApiKeyMode = apiKey === process.env.CRON_API_KEY;
    const authMode =
      authHeader && authHeader.startsWith("Bearer ")
        ? "jwt"
        : isApiKeyMode
          ? "api_key"
          : "cookie";

    let parsedBody: Record<string, any>;
    try {
      parsedBody = (await request.json()) as Record<string, any>;
    } catch (parseError: any) {
      return NextResponse.json(
        {
          error: "Body JSON invalide",
          details: parseError?.message,
        },
        { status: 400 },
      );
    }

    const {
      userIds,
      userId,
      title,
      body: notificationBody,
      data,
    } = parsedBody;

    let user: { id: string; email?: string; user_metadata?: any; app_metadata?: any } | null = null;
    let isAdmin = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      const {
        data: { user: jwtUser },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !jwtUser) {
        return NextResponse.json(
          { error: "Token invalide ou expiré", details: authError?.message },
          { status: 401 }
        );
      }

      user = jwtUser;
      isAdmin =
        user.user_metadata?.role === "admin" ||
        user.app_metadata?.role === "admin";
    } else if (isApiKeyMode) {
      isAdmin = true;
      user = {
        id:
          typeof userId === "string" && userId.trim().length > 0
            ? userId.trim()
            : "cron-api-key",
      };
    } else {
      const supabase = await createServerClient();
      const {
        data: { user: cookieUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !cookieUser) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401 }
        );
      }

      user = cookieUser;
      isAdmin =
        user.user_metadata?.role === "admin" ||
        user.app_metadata?.role === "admin";
    }

    if (!user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Accès refusé. Admin uniquement." },
        { status: 403 }
      );
    }

    if (!title || !notificationBody) {
      return NextResponse.json(
        { error: "title et body sont requis" },
        { status: 400 }
      );
    }

    let result;
    let sender:
      | "sendNotificationToUser"
      | "sendNotificationToUsers"
      | "sendNotificationToAll";

    if (userId) {
      sender = "sendNotificationToUser";
      result = await sendNotificationToUser(userId, {
        title,
        body: notificationBody,
        data,
      });
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      sender = "sendNotificationToUsers";
      result = await sendNotificationToUsers(userIds, {
        title,
        body: notificationBody,
        data,
      });
    } else {
      sender = "sendNotificationToAll";
      result = await sendNotificationToAll({
        title,
        body: notificationBody,
        data,
      });
    }

    return NextResponse.json({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      diagnostics: result.diagnostics,
      flow: {
        route: "/api/notifications/send",
        path: "manual_user_send",
        authMode,
        sender,
        honorsPreferences: true,
        honorsCategories: true,
        latestTokenOnly: true,
        targetUserId: typeof userId === "string" ? userId : null,
        targetUserCount: Array.isArray(userIds) ? userIds.length : null,
      },
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi de notification:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

