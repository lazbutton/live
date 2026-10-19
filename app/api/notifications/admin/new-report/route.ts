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
 */
export async function POST(request: NextRequest) {
  try {
    let body: any = {};

    try {
      body = await request.json();
    } catch {
      const url = new URL(request.url);
      body = {
        reportId: url.searchParams.get("reportId"),
        eventId: url.searchParams.get("eventId"),
        eventTitle: url.searchParams.get("eventTitle"),
        reasonCode: url.searchParams.get("reasonCode"),
        reasonLabel: url.searchParams.get("reasonLabel"),
        message: url.searchParams.get("message"),
        userId: url.searchParams.get("userId"),
        reportedUserId: url.searchParams.get("reportedUserId"),
        blockRequested: url.searchParams.get("blockRequested") === "true",
      };
    }

    if (typeof body !== "object" || body === null) {
      body = {};
    }

    if (!body.reportId) {
      const url = new URL(request.url);
      body.reportId = url.searchParams.get("reportId");
    }

    const parsed = parseAppBody(adminNewReportBodySchema, body);
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;

    const supabase = createServiceClient();
    const { data: report, error: reportError } = await supabase
      .from("content_reports")
      .select(
        "id, target_event_id, reported_user_id, reason_code, details, block_requested",
      )
      .eq("id", input.reportId)
      .single();

    if (reportError || !report) {
      console.error(
        "Erreur lors de la récupération du signalement:",
        reportError,
      );
      return appError("Impossible de récupérer le signalement", 404);
    }

    let eventTitle = input.eventTitle ?? "";

    if (!eventTitle && report.target_event_id) {
      const { data: eventData } = await supabase
        .from("events")
        .select("title")
        .eq("id", report.target_event_id)
        .single();

      eventTitle = eventData?.title || "";
    }

    const reasonCode = input.reasonCode || report.reason_code;
    const reasonLabel =
      input.reasonLabel || reasonLabels[reasonCode] || reasonCode;
    const blockRequested =
      input.blockRequested ?? Boolean(report.block_requested);
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
        event_id: input.eventId || report.target_event_id || null,
        event_title: eventTitle || null,
        reason_code: reasonCode,
        reason_label: reasonLabel,
        message: input.message?.trim() || report.details || null,
        reporter_user_id: input.userId || null,
        reported_user_id:
          input.reportedUserId || report.reported_user_id || null,
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
      diagnostics: notificationResult.diagnostics,
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
