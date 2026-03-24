import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const allowedStatuses = new Set([
  "pending",
  "under_review",
  "actioned",
  "dismissed",
]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (user.user_metadata?.role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const nextStatus =
      typeof body.status === "string" && body.status.trim().length > 0
        ? body.status.trim()
        : undefined;
    if (nextStatus !== undefined && !allowedStatuses.has(nextStatus)) {
      return NextResponse.json(
        { error: "Statut de modération invalide" },
        { status: 400 },
      );
    }

    const eventSafetyHidden =
      typeof body.eventSafetyHidden === "boolean"
        ? body.eventSafetyHidden
        : undefined;
    const userUgcSuspended =
      typeof body.userUgcSuspended === "boolean"
        ? body.userUgcSuspended
        : undefined;
    const adminNote =
      body.adminNote === undefined
        ? undefined
        : typeof body.adminNote === "string"
          ? body.adminNote.trim() || null
          : null;

    if (
      nextStatus === undefined &&
      eventSafetyHidden === undefined &&
      userUgcSuspended === undefined &&
      adminNote === undefined
    ) {
      return NextResponse.json(
        { error: "Aucune modification demandée" },
        { status: 400 },
      );
    }

    const supabaseAdmin = createServiceClient();
    const { data: report, error: reportError } = await supabaseAdmin
      .from("content_reports")
      .select(
        "id, status, target_event_id, reported_user_id, reviewed_at, reviewed_by",
      )
      .eq("id", id)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { error: "Signalement introuvable" },
        { status: 404 },
      );
    }

    if (eventSafetyHidden !== undefined) {
      if (!report.target_event_id) {
        return NextResponse.json(
          { error: "Aucun événement lié à ce signalement" },
          { status: 400 },
        );
      }

      const { error: eventError } = await supabaseAdmin
        .from("events")
        .update({ is_safety_hidden: eventSafetyHidden })
        .eq("id", report.target_event_id);

      if (eventError) {
        console.error(
          "Erreur lors de la mise à jour du masquage sécurité:",
          eventError,
        );
        return NextResponse.json(
          { error: eventError.message || "Impossible de mettre à jour l'événement" },
          { status: 500 },
        );
      }
    }

    if (userUgcSuspended !== undefined) {
      if (!report.reported_user_id) {
        return NextResponse.json(
          { error: "Aucun utilisateur signalé lié à ce report" },
          { status: 400 },
        );
      }

      const { data: reportedUser, error: getUserError } =
        await supabaseAdmin.auth.admin.getUserById(report.reported_user_id);

      if (getUserError || !reportedUser.user) {
        return NextResponse.json(
          { error: "Utilisateur signalé introuvable" },
          { status: 404 },
        );
      }

      const currentMetadata = reportedUser.user.user_metadata || {};
      const updatedMetadata = { ...currentMetadata };

      updatedMetadata.ugc_suspended = userUgcSuspended;

      if (userUgcSuspended) {
        updatedMetadata.ugc_suspension_reason =
          typeof adminNote === "string" && adminNote.length > 0
            ? adminNote
            : "Suspendu par l'équipe de modération";
        updatedMetadata.ugc_suspended_at = new Date().toISOString();
        updatedMetadata.ugc_suspended_by = user.id;
      } else {
        delete updatedMetadata.ugc_suspension_reason;
        delete updatedMetadata.ugc_suspended_at;
        delete updatedMetadata.ugc_suspended_by;
      }

      const { error: suspendError } = await supabaseAdmin.auth.admin.updateUserById(
        report.reported_user_id,
        {
          user_metadata: updatedMetadata,
        },
      );

      if (suspendError) {
        console.error(
          "Erreur lors de la mise à jour de la suspension UGC:",
          suspendError,
        );
        return NextResponse.json(
          { error: suspendError.message || "Impossible de mettre à jour l'utilisateur" },
          { status: 500 },
        );
      }
    }

    const reportUpdates: Record<string, unknown> = {};

    if (nextStatus !== undefined) {
      reportUpdates.status = nextStatus;

      if (nextStatus === "actioned" || nextStatus === "dismissed") {
        reportUpdates.reviewed_at = new Date().toISOString();
        reportUpdates.reviewed_by = user.id;
      } else {
        reportUpdates.reviewed_at = null;
        reportUpdates.reviewed_by = null;
      }
    }

    if (adminNote !== undefined) {
      reportUpdates.admin_note = adminNote;
    }

    let updatedReport = null;
    if (Object.keys(reportUpdates).length > 0) {
      const { data, error: updateError } = await supabaseAdmin
        .from("content_reports")
        .update(reportUpdates)
        .eq("id", id)
        .select(
          "id, status, target_event_id, reported_user_id, reviewed_at, reviewed_by, admin_note",
        )
        .single();

      if (updateError) {
        console.error("Erreur lors de la mise à jour du signalement:", updateError);
        return NextResponse.json(
          {
            error:
              updateError.message ||
              "Impossible de mettre à jour le signalement",
          },
          { status: 500 },
        );
      }

      updatedReport = data;
    }

    return NextResponse.json({
      success: true,
      report: updatedReport,
    });
  } catch (error: any) {
    console.error("Erreur API /api/admin/moderation/reports/[id]:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 },
    );
  }
}
