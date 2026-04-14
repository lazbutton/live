import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotionEntityKind } from "@/lib/notion/types";

export async function upsertNotionCheckpoint(
  supabase: SupabaseClient,
  input: {
    checkpointKey: string;
    entityKind: NotionEntityKind;
    lastNotionCursor?: string | null;
    lastWebhookReceivedAt?: string | null;
    lastCompletedJobAt?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("notion_sync_checkpoints").upsert(
    {
      checkpoint_key: input.checkpointKey,
      entity_kind: input.entityKind,
      last_notion_cursor: input.lastNotionCursor ?? null,
      last_webhook_received_at: input.lastWebhookReceivedAt ?? null,
      last_completed_job_at: input.lastCompletedJobAt ?? null,
      metadata: input.metadata ?? {},
    },
    {
      onConflict: "checkpoint_key",
    }
  );
  if (error) throw error;
}
