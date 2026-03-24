import { NextRequest, NextResponse } from "next/server";

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

    if (!body.reportId) {
      const url = new URL(request.url);
      body.reportId = url.searchParams.get("reportId");
    }

    if (!body.reportId || typeof body.reportId !== "string") {
      return NextResponse.json(
        { error: "reportId requis" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const { data: report, error: reportError } = await supabase
      .from("content_reports")
      .select(
        "id, target_event_id, reported_user_id, reason_code, details, block_requested",
      )
      .eq("id", body.reportId)
      .single();

    if (reportError || !report) {
      console.error(
        "Erreur lors de la récupération du signalement:",
        reportError,
      );
      return NextResponse.json(
        { error: "Impossible de récupérer le signalement" },
        { status: 404 },
      );
    }

    let eventTitle = typeof body.eventTitle === "string" ? body.eventTitle : "";

    if (!eventTitle && report.target_event_id) {
      const { data: eventData } = await supabase
        .from("events")
        .select("title")
        .eq("id", report.target_event_id)
        .single();

      eventTitle = eventData?.title || "";
    }

    const reasonCode =
      typeof body.reasonCode === "string" && body.reasonCode.length > 0
        ? body.reasonCode
        : report.reason_code;
    const reasonLabel =
      typeof body.reasonLabel === "string" && body.reasonLabel.length > 0
        ? body.reasonLabel
        : reasonLabels[reasonCode] || reasonCode;
    const blockRequested =
      typeof body.blockRequested === "boolean"
        ? body.blockRequested
        : Boolean(report.block_requested);
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
        event_id: body.eventId || report.target_event_id || null,
        event_title: eventTitle || null,
        reason_code: reasonCode,
        reason_label: reasonLabel,
        message:
          (typeof body.message === "string" && body.message.trim()) ||
          report.details ||
          null,
        reporter_user_id:
          (typeof body.userId === "string" && body.userId) || null,
        reported_user_id:
          (typeof body.reportedUserId === "string" && body.reportedUserId) ||
          report.reported_user_id ||
          null,
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

    return NextResponse.json({
      success: notificationResult.success,
      sent: notificationResult.sent,
      failed: notificationResult.failed,
      errors: notificationResult.errors,
    });
  } catch (error: any) {
    console.error(
      "❌ Erreur lors de l'envoi de la notification admin pour un report:",
      error,
    );
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 },
    );
  }
}
