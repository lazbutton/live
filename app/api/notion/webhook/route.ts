import { NextRequest, NextResponse } from "next/server";
import {
  isNotionVerificationPayload,
  verifyNotionWebhookSignature,
} from "@/lib/notion/client";
import { createServiceClient } from "@/lib/supabase/service";
import { getEntityKindForDataSourceId, getNotionSyncConfig } from "@/lib/notion/config";
import { enqueueSyncJob } from "@/lib/notion/queue";
import { drainNotionSyncQueue, resyncDataSourcePageIds } from "@/lib/notion/reconcile";
import { upsertNotionCheckpoint } from "@/lib/notion/checkpoints";
import type { NotionWebhookPayload } from "@/lib/notion/types";

function getWebhookDataSourceId(payload: NotionWebhookPayload) {
  const candidate =
    (typeof payload.data?.data_source_id === "string" && payload.data.data_source_id) ||
    (payload.entity?.type === "data_source" ? payload.entity.id : null) ||
    null;
  return candidate;
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody) as NotionWebhookPayload;

    if (isNotionVerificationPayload(payload)) {
      console.info(
        "Notion webhook verification token received. Set NOTION_WEBHOOK_VERIFICATION_TOKEN=%s",
        payload.verification_token
      );

      await upsertNotionCheckpoint(supabase, {
        checkpointKey: "notion:webhook:verification",
        entityKind: "unknown",
        lastWebhookReceivedAt: new Date().toISOString(),
        metadata: {
          verification_token_received: true,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          verificationTokenReceived: true,
        },
        { status: 200 }
      );
    }

    const config = getNotionSyncConfig();
    const signature = request.headers.get("x-notion-signature");
    if (!verifyNotionWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Signature Notion invalide" }, { status: 401 });
    }

    if (!config.enabled) {
      return NextResponse.json({ ok: true, skipped: "sync_disabled" }, { status: 202 });
    }

    const dataSourceId = getWebhookDataSourceId(payload);
    const entityKind = getEntityKindForDataSourceId(dataSourceId);
    const webhookReceivedAt = new Date().toISOString();

    if (payload.entity?.type === "page" && payload.entity.id) {
      await enqueueSyncJob(
        {
          entityKind: entityKind === "unknown" ? "unknown" : entityKind,
          notionPageId: payload.entity.id,
          direction: "from_notion",
          reason: payload.type ?? "webhook_page_change",
          dedupeKey: `webhook:page:${payload.entity.id}`,
          payload: {
            webhook_id: payload.id ?? null,
            webhook_type: payload.type ?? null,
            timestamp: payload.timestamp ?? null,
          },
        },
        supabase
      );
    } else if (dataSourceId && entityKind !== "unknown") {
      await resyncDataSourcePageIds(supabase, entityKind, { limit: 25 });
    } else {
      return NextResponse.json(
        {
          ok: true,
          ignored: true,
          reason: "unsupported_webhook_entity",
        },
        { status: 202 }
      );
    }

    await upsertNotionCheckpoint(supabase, {
      checkpointKey: `notion:webhook:${entityKind}`,
      entityKind,
      lastWebhookReceivedAt: webhookReceivedAt,
      metadata: {
        webhook_id: payload.id ?? null,
        webhook_type: payload.type ?? null,
        data_source_id: dataSourceId,
      },
    });

    const drainResult = await drainNotionSyncQueue(supabase, { maxJobs: 5 });

    return NextResponse.json({
      ok: true,
      entityKind,
      drainResult,
    });
  } catch (error: any) {
    console.error("Erreur webhook Notion:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur webhook Notion" },
      { status: 500 }
    );
  }
}
