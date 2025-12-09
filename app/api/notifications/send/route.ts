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
    // Vérifier le type d'authentification
    const authHeader = request.headers.get("authorization");
    const apiKey = request.headers.get("x-api-key");

    let user: { id: string; email?: string; user_metadata?: any; app_metadata?: any } | null = null;
    let isAdmin = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Mode JWT (depuis l'app mobile)
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
      // Pour les JWT, vérifier si l'utilisateur est admin
      isAdmin =
        user.user_metadata?.role === "admin" ||
        user.app_metadata?.role === "admin";
    } else if (apiKey === process.env.CRON_API_KEY) {
      // Mode clé API (depuis un cron ou script)
      // Avec la clé API, on considère que c'est un admin
      isAdmin = true;
      // Le userId sera extrait du body plus tard
    } else {
      // Mode cookies (depuis l'interface web admin)
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

    // Parser le body (une seule fois)
    const body = await request.json();
    const { userIds, userId, title, body: notificationBody, data } = body;

    // Pour le mode clé API, créer l'objet user depuis le body
    if (apiKey === process.env.CRON_API_KEY && userId) {
      user = { id: userId };
    }

    // Pour les requêtes admin (via cookies ou clé API), permettre d'envoyer à tous
    // Pour les JWT, vérifier si l'utilisateur est admin
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

    // Déterminer les destinataires
    let result;

    if (userId) {
      // Envoyer à un seul utilisateur
      result = await sendNotificationToUser(userId, {
        title,
        body: notificationBody,
        data,
      });
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // Envoyer à plusieurs utilisateurs
      result = await sendNotificationToUsers(userIds, {
        title,
        body: notificationBody,
        data,
      });
    } else {
      // Envoyer à tous les utilisateurs
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
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi de notification:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

