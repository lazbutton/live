import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToAll,
} from "@/lib/notifications";

/**
 * POST /api/notifications/send
 * 
 * Envoie des notifications push aux utilisateurs
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

    // Parser le body
    const body = await request.json();
    const { userIds, userId, title, body: notificationBody, data } = body;

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

