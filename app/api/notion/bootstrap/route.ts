import { NextRequest, NextResponse } from "next/server";
import { requireNotionAdminRoute, ensureNotionSyncEnabled } from "@/lib/notion/route-helpers";
import { enqueueFullBootstrap } from "@/lib/notion/queue";
import { drainNotionSyncQueue } from "@/lib/notion/reconcile";
import { upsertNotionCheckpoint } from "@/lib/notion/checkpoints";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireNotionAdminRoute(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const includeLocations = body?.includeLocations !== false;
    const includeOrganizers = body?.includeOrganizers !== false;
    const drainNow = body?.drainNow === true;

    if (!dryRun) {
      const disabledResponse = ensureNotionSyncEnabled();
      if (disabledResponse) return disabledResponse;
    }

    const { supabase } = auth;

    const [eventsCount, requestsCount, locationsCount, organizersCount] =
      await Promise.all([
        supabase.from("events").select("*", { count: "exact", head: true }),
        supabase
          .from("user_requests")
          .select("*", { count: "exact", head: true })
          .in("request_type", ["event_creation", "event_from_url"]),
        includeLocations
          ? supabase.from("locations").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0, error: null }),
        includeOrganizers
          ? supabase.from("organizers").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0, error: null }),
      ]);

    if (eventsCount.error) throw eventsCount.error;
    if (requestsCount.error) throw requestsCount.error;
    if (locationsCount.error) throw locationsCount.error;
    if (organizersCount.error) throw organizersCount.error;

    const summary = {
      events: eventsCount.count ?? 0,
      requests: requestsCount.count ?? 0,
      locations: locationsCount.count ?? 0,
      organizers: organizersCount.count ?? 0,
    };

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        summary,
      });
    }

    const enqueueResult = await enqueueFullBootstrap(
      {
        includeLocations,
        includeOrganizers,
      },
      supabase
    );

    await upsertNotionCheckpoint(supabase, {
      checkpointKey: "notion:bootstrap:last_run",
      entityKind: "unknown",
      lastCompletedJobAt: new Date().toISOString(),
      metadata: {
        mode: "bootstrap",
        summary,
        enqueued: enqueueResult.enqueued,
      },
    });

    const drainResult = drainNow
      ? await drainNotionSyncQueue(supabase, { maxJobs: 25 })
      : null;

    return NextResponse.json({
      ok: true,
      summary,
      enqueueResult,
      drainResult,
    });
  } catch (error: any) {
    console.error("Erreur bootstrap Notion:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur bootstrap Notion" },
      { status: 500 }
    );
  }
}
