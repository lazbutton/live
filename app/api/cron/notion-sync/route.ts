import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { drainNotionSyncQueue } from "@/lib/notion/reconcile";
import { getNotionSyncConfig } from "@/lib/notion/config";
import { upsertNotionCheckpoint } from "@/lib/notion/checkpoints";

function verifyCronRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET n'est pas défini");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const config = getNotionSyncConfig();
  if (!config.enabled) {
    return NextResponse.json({ ok: true, skipped: "sync_disabled" });
  }

  try {
    const supabase = createServiceClient();
    const result = await drainNotionSyncQueue(supabase, { maxJobs: 25 });

    await upsertNotionCheckpoint(supabase, {
      checkpointKey: "notion:queue:last_drain",
      entityKind: "unknown",
      lastCompletedJobAt: new Date().toISOString(),
      metadata: result,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: any) {
    console.error("Erreur cron notion-sync:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur cron Notion" },
      { status: 500 }
    );
  }
}
