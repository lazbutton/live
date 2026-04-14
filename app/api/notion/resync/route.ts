import { NextRequest, NextResponse } from "next/server";
import { requireNotionAdminRoute, ensureNotionSyncEnabled } from "@/lib/notion/route-helpers";
import {
  drainNotionSyncQueue,
  importNotionPageToLive,
  resyncDataSourcePageIds,
  syncSingleEntityToNotion,
} from "@/lib/notion/reconcile";
import { exportEntityToNotionPayload } from "@/lib/notion/domain";
import { retrieveNotionPage } from "@/lib/notion/client";
import { getEntityKindForDataSourceId } from "@/lib/notion/config";
import { upsertNotionCheckpoint } from "@/lib/notion/checkpoints";
import type { NotionEntityKind } from "@/lib/notion/types";

function normalizeEntityKind(value: unknown): NotionEntityKind {
  if (
    value === "event" ||
    value === "request" ||
    value === "location" ||
    value === "organizer"
  ) {
    return value;
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireNotionAdminRoute(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    if (!dryRun) {
      const disabledResponse = ensureNotionSyncEnabled();
      if (disabledResponse) return disabledResponse;
    }

    const entityKind = normalizeEntityKind(body?.entityKind);
    const entityId =
      typeof body?.entityId === "string" ? body.entityId.trim() : "";
    const notionPageId =
      typeof body?.notionPageId === "string" ? body.notionPageId.trim() : "";
    const drainNow = body?.drainNow === true;
    const limit = Math.min(Math.max(Number(body?.limit ?? 25), 1), 100);
    const action =
      typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "manual_resync";

    const { supabase } = auth;

    if (dryRun) {
      if (entityKind !== "unknown" && entityId) {
        const preview = await exportEntityToNotionPayload(
          supabase,
          entityKind,
          entityId
        );
        return NextResponse.json({
          ok: true,
          dryRun: true,
          mode: "to_notion",
          preview,
        });
      }

      if (notionPageId) {
        const page = await retrieveNotionPage(notionPageId);
        const detectedKind = getEntityKindForDataSourceId(
          page.parent?.data_source_id ?? page.parent?.database_id ?? null
        );
        return NextResponse.json({
          ok: true,
          dryRun: true,
          mode: "from_notion",
          notionPageId,
          detectedKind,
          page,
        });
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        mode: action === "scan_all" ? "scan_all" : "scan",
        entityKind,
        limit,
      });
    }

    let result: Record<string, unknown>;

    if (action === "drain") {
      result = {
        mode: "drain_only",
      };
    } else if (action === "scan_all") {
      const scanResults: Record<string, unknown> = {};
      for (const kind of ["event", "request", "location", "organizer"] as const) {
        try {
          scanResults[kind] = await resyncDataSourcePageIds(supabase, kind, {
            limit,
          });
        } catch (error: any) {
          scanResults[kind] = {
            error: error?.message || "scan_failed",
          };
        }
      }
      result = {
        mode: "scan_all",
        scanResults,
      };
    } else if (entityKind !== "unknown" && entityId) {
      const jobId = await syncSingleEntityToNotion(
        supabase,
        entityKind,
        entityId,
        reason
      );
      result = {
        mode: "to_notion",
        entityKind,
        entityId,
        jobId,
      };
    } else if (entityKind !== "unknown" && notionPageId) {
      const jobId = await importNotionPageToLive(
        supabase,
        notionPageId,
        entityKind
      );
      result = {
        mode: "from_notion",
        entityKind,
        notionPageId,
        jobId,
      };
    } else if (entityKind !== "unknown") {
      const scanResult = await resyncDataSourcePageIds(supabase, entityKind, {
        limit,
      });
      result = {
        mode: "scan_data_source",
        entityKind,
        scanResult,
      };
    } else {
      return NextResponse.json(
        { error: "entityKind est requis et doit être supporté" },
        { status: 400 }
      );
    }

    await upsertNotionCheckpoint(supabase, {
      checkpointKey: `notion:resync:${entityKind}`,
      entityKind,
      lastCompletedJobAt: new Date().toISOString(),
      metadata: result,
    });

    const drainResult = drainNow
      ? await drainNotionSyncQueue(supabase, { maxJobs: limit })
      : null;

    return NextResponse.json({
      ok: true,
      result,
      drainResult,
    });
  } catch (error: any) {
    console.error("Erreur resync Notion:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur resync Notion" },
      { status: 500 }
    );
  }
}
