import { NextRequest, NextResponse } from "next/server";

import { appError, parseAppBody } from "@/lib/api/app/http";
import {
  adminNewFeedbackBodySchema,
  type AdminAlertResponse,
} from "@/lib/api/app/schemas";
import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/notifications/admin/new-feedback
 *
 * Notifie les admins d'un nouveau feedback. Gardée pour les anciens builds de l'app (1.0.3 à
 * 1.0.6), dont le formulaire de feedback l'appelait après l'insertion dans `feedbacks`.
 * Body (JSON, sinon paramètres de requête) : `adminNewFeedbackBodySchema`
 * (lib/api/app/schemas.ts), voir docs/API_APP.md.
 * Route publique : le feedback est relu en base par `feedbackId`, avec le nom de son objet
 * (`feedback_objects`), et la notification est construite depuis eux, jamais depuis le corps.
 */
export async function POST(request: NextRequest) {
  try {
    let body: any = {};

    try {
      body = await request.json();
    } catch {
      // Pas un corps JSON : `feedbackId` est lu dans les paramètres de requête.
    }

    if (typeof body !== "object" || body === null) {
      body = {};
    }

    if (!body.feedbackId) {
      const url = new URL(request.url);
      body.feedbackId = url.searchParams.get("feedbackId");
    }

    // Seul `feedbackId` sert, le reste du corps est ignoré.
    const parsed = parseAppBody(adminNewFeedbackBodySchema, body);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceClient();
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedbacks")
      .select("id, description, user_id, feedback_object_id")
      .eq("id", parsed.data.feedbackId)
      .single();

    if (feedbackError || !feedback) {
      console.error("❌ Erreur lors de la récupération du feedback:", feedbackError);
      return appError(
        "Impossible de récupérer le feedback depuis la base de données",
        404,
        { details: feedbackError },
      );
    }

    // Le type affiché : nom de l'objet du feedback, celui que les anciens builds envoyaient dans
    // `feedbackType`.
    const { data: feedbackObject } = await supabase
      .from("feedback_objects")
      .select("name")
      .eq("id", feedback.feedback_object_id)
      .single();

    const feedbackType = feedbackObject?.name || null;
    const feedbackDescription = feedback.description || "Nouveau feedback";

    // Tronquer le message à 100 caractères pour la notification
    const truncatedMessage = feedbackDescription.length > 100
      ? feedbackDescription.substring(0, 97) + "..."
      : feedbackDescription;

    const result = await sendNotificationToAdmins({
      title: "💬 Nouveau feedback",
      body: `${feedbackType || "feedback"}: ${truncatedMessage}`,
      data: {
        type: "new_feedback",
        feedback_id: feedback.id,
        feedback_type: feedbackType,
        message: truncatedMessage,
        user_id: feedback.user_id || null,
        feedback_object_id: feedback.feedback_object_id || null,
      },
    });

    if (result.success) {
      console.log(`✅ Notification envoyée à ${result.sent} admin(s) pour le feedback ${feedback.id}`);
    } else {
      console.error(`❌ Erreur lors de l'envoi des notifications:`, result.errors);
    }

    return NextResponse.json<AdminAlertResponse>({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      flow: {
        route: "/api/notifications/admin/new-feedback",
        path: "admin_public_feedback_notification",
        sender: "sendNotificationToAdmins",
        honorsPreferences: false,
        honorsCategories: false,
        targetsAllAdminTokens: true,
      },
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de l'envoi de la notification admin:", error);
    return appError(error?.message || "Erreur serveur", 500);
  }
}
