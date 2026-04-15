import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const FLOW_TO_PATH = {
  daily: "/api/cron/notifications/daily-events",
  weekly: "/api/cron/notifications/weekly-summary",
} as const;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const isAdmin =
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin";

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Accès refusé. Admin uniquement." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      flow?: keyof typeof FLOW_TO_PATH;
    };
    const flow = body.flow;

    if (!flow || !(flow in FLOW_TO_PATH)) {
      return NextResponse.json(
        {
          error: "Flux invalide",
          allowedFlows: Object.keys(FLOW_TO_PATH),
        },
        { status: 400 },
      );
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        {
          error: "CRON_SECRET manquant côté serveur",
          flow,
          targetPath: FLOW_TO_PATH[flow],
        },
        { status: 500 },
      );
    }

    const targetUrl = new URL(FLOW_TO_PATH[flow], request.url);
    const proxiedResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      cache: "no-store",
    });

    const rawText = await proxiedResponse.text();
    let proxiedJson: Record<string, any> | null = null;
    try {
      proxiedJson = rawText ? (JSON.parse(rawText) as Record<string, any>) : null;
    } catch {
      proxiedJson = null;
    }

    return NextResponse.json(
      {
        success:
          proxiedResponse.ok &&
          (typeof proxiedJson?.success === "boolean" ? proxiedJson.success : true),
        flow,
        proxy: {
          route: "/api/admin/notifications/debug",
          targetPath: FLOW_TO_PATH[flow],
          targetUrl: targetUrl.toString(),
          status: proxiedResponse.status,
          cronSecretConfigured: true,
        },
        ...(proxiedJson ?? { rawResponse: rawText }),
      },
      { status: proxiedResponse.status },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 },
    );
  }
}
