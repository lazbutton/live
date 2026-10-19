import { NextRequest, NextResponse } from "next/server";

import { appError, parseAppBody } from "@/lib/api/app/http";
import {
  adminNewReportBodySchema,
  type AdminAlertResponse,
} from "@/lib/api/app/schemas";
import { sendNotificationToAdmins } from "@/lib/notifications/admin";
import { createServiceClient } from "@/lib/supabase/service";

const reasonLabels: Record<string, string> = {
  abuse: "Abus ou menace",
  harassment: "Harcèlement",
  hate: "Discours haineux",
  sexual: "Contenu sexuel",
  violence: "Violence choquante",
  spam: "Spam ou arnaque",
  illegal: "Contenu illégal",
  impersonation: "Usurpation",
  other: "Autre",
};

/**
 * POST /api/notifications/admin/new-report
 *
 * Notifie les admins d'un signalement de contenu. Body (JSON, sinon paramètres de requête) :
 * `adminNewReportBodySchema` (lib/api/app/schemas.ts), voir docs/API_APP.md.
 * Route publique : le signalement est relu en base par `reportId` et la notification est
 * construite depuis lui et son événement, jamais depuis le corps.
 */
export async function POST(request: NextRequest) {
  try {
    let body: any = {};

    try {
      body = await request.json();
    } catch {
      // Pas un corps JSON : `reportId` est lu dans les paramètres de requête.
    }

    if (typeof body !== "object" || body === null) {
      body = {};
    }

    if (!body.reportId) {
      const url = new URL(request.url);
      body.reportId = url.searchParams.get("reportId");
    }

    // Seul `reportId` sert, le reste du corps est ignoré.
    const parsed = parseAppBody(adminNewReportBodySchema, body);
    if (!parsed.ok) return parsed.response;

    const supabase = createServiceClient();
    const { data: report, error: reportError } = await supabase
      .from("content_reports")
      .select(
        "id, target_event_id, reporter_user_id, reported_user_id, reason_code, details, block_requested",
      )
      .eq("id", parsed.data.reportId)
      .single();

    if (reportError || !report) {
      console.error(
        "Erreur lors de la récupération du signalement:",
        reportError,
      );
      return appError("Impossible de récupérer le signalement", 404);
    }

    const { data: eventData } = await supabase
      .from("events")
      .select("title")
      .eq("id", report.target_event_id)
      .single();

    const eventTitle = eventData?.title || "";
    const reasonLabel = reasonLabels[report.reason_code] || report.reason_code;
    const blockRequested = Boolean(report.block_requested);
    const bodyTextParts = [
      reasonLabel,
      eventTitle ? `sur ${eventTitle}` : "sur un événement",
      blockRequested ? "blocage demandé" : null,
    ].filter(Boolean);

    const notificationResult = await sendNotificationToAdmins({
      title: "🚨 Nouveau signalement",
      body: bodyTextParts.join(" • "),
      data: {
        type: "new_content_report",
        report_id: report.id,
        event_id: report.target_event_id,
        event_title: eventTitle || null,
        reason_code: report.reason_code,
        reason_label: reasonLabel,
        message: report.details?.trim() || null,
        reporter_user_id: report.reporter_user_id,
        reported_user_id: report.reported_user_id,
        block_requested: blockRequested,
      },
    });

    if (notificationResult.success) {
      console.log(
        `✅ Notification report envoyée à ${notificationResult.sent} admin(s)`,
      );
    } else {
      console.error(
        "❌ Erreur lors de l'envoi des notifications report:",
        notificationResult.errors,
      );
    }

    return NextResponse.json<AdminAlertResponse>({
      success: notificationResult.success,
      sent: notificationResult.sent,
      failed: notificationResult.failed,
      errors: notificationResult.errors,
      flow: {
        route: "/api/notifications/admin/new-report",
        path: "admin_public_report_notification",
        sender: "sendNotificationToAdmins",
        honorsPreferences: false,
        honorsCategories: false,
        targetsAllAdminTokens: true,
      },
    });
  } catch (error: any) {
    console.error(
      "❌ Erreur lors de l'envoi de la notification admin pour un report:",
      error,
    );
    return appError(error?.message || "Erreur serveur", 500);
  }
}
