import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  NotionEntityKind,
  NotionSyncDirection,
  NotionSyncJobRow,
} from "@/lib/notion/types";
import { getNotionSyncConfig } from "@/lib/notion/config";

export type EnqueueSyncJobInput = {
  entityKind: NotionEntityKind;
  entityId?: string | null;
  notionPageId?: string | null;
  direction: NotionSyncDirection;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  dedupeKey?: string | null;
};

function getServiceClient(supabase?: SupabaseClient) {
  return supabase ?? createServiceClient();
}

export async function enqueueSyncJob(
  input: EnqueueSyncJobInput,
  supabase?: SupabaseClient
) {
  const client = getServiceClient(supabase);
  const { data, error } = await client.rpc("enqueue_notion_sync_job", {
    p_entity_kind: input.entityKind,
    p_entity_id: input.entityId ?? null,
    p_notion_page_id: input.notionPageId ?? null,
    p_direction: input.direction,
    p_reason: input.reason ?? null,
    p_payload: input.payload ?? {},
    p_dedupe_key: input.dedupeKey ?? null,
  });
  if (error) throw error;
  return data as string | null;
}

export async function claimSyncJobs(
  maxJobs = 10,
  supabase?: SupabaseClient
) {
  const client = getServiceClient(supabase);
  const config = getNotionSyncConfig();
  const { data, error } = await client.rpc("claim_notion_sync_jobs", {
    p_worker_id: config.queueWorkerId,
    p_limit: maxJobs,
  });
  if (error) throw error;
  return ((data ?? []) as unknown) as NotionSyncJobRow[];
}

export async function completeSyncJob(
  jobId: string,
  {
    entityId,
    notionPageId,
    syncHash,
  }: {
    entityId?: string | null;
    notionPageId?: string | null;
    syncHash?: string | null;
  } = {},
  supabase?: SupabaseClient
) {
  const client = getServiceClient(supabase);
  const { error } = await client
    .from("notion_sync_jobs")
    .update({
      status: "completed",
      processed_at: new Date().toISOString(),
      error_message: null,
      payload: {
        entity_id: entityId ?? null,
        notion_page_id: notionPageId ?? null,
        sync_hash: syncHash ?? null,
      },
    })
    .eq("id", jobId);
  if (error) throw error;
}

export async function skipSyncJob(
  jobId: string,
  reason: string,
  supabase?: SupabaseClient
) {
  const client = getServiceClient(supabase);
  const { error } = await client
    .from("notion_sync_jobs")
    .update({
      status: "skipped",
      processed_at: new Date().toISOString(),
      error_message: reason,
    })
    .eq("id", jobId);
  if (error) throw error;
}

export async function failSyncJob(
  job: NotionSyncJobRow,
  errorMessage: string,
  supabase?: SupabaseClient
) {
  const client = getServiceClient(supabase);
  const attemptCount = (job.attempt_count ?? 0) + 1;
  const shouldRetry = attemptCount < 5;
  const nextDelayMinutes = Math.min(60, Math.max(1, attemptCount * 2));
  const availableAt = new Date(Date.now() + nextDelayMinutes * 60 * 1000).toISOString();

  const { error } = await client
    .from("notion_sync_jobs")
    .update({
      status: shouldRetry ? "pending" : "failed",
      error_message: errorMessage,
      available_at: shouldRetry ? availableAt : job.available_at,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", job.id);
  if (error) throw error;

  const { error: errorInsert } = await client.from("notion_sync_errors").insert({
    job_id: job.id,
    entity_kind: job.entity_kind,
    entity_id: job.entity_id,
    notion_page_id: job.notion_page_id,
    direction: job.direction,
    error_message: errorMessage,
    payload: job.payload ?? {},
  });
  if (errorInsert) throw errorInsert;
}

export async function enqueueFullBootstrap(
  {
    includeLocations = true,
    includeOrganizers = true,
  }: {
    includeLocations?: boolean;
    includeOrganizers?: boolean;
  } = {},
  supabase?: SupabaseClient
) {
  const client = getServiceClient(supabase);

  const [eventsResult, requestsResult, locationsResult, organizersResult] =
    await Promise.all([
      client.from("events").select("id", { head: false }),
      client
        .from("user_requests")
        .select("id", { head: false })
        .in("request_type", ["event_creation", "event_from_url"]),
      includeLocations
        ? client.from("locations").select("id", { head: false })
        : Promise.resolve({ data: [], error: null }),
      includeOrganizers
        ? client.from("organizers").select("id", { head: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (eventsResult.error) throw eventsResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (organizersResult.error) throw organizersResult.error;

  let enqueued = 0;

  for (const row of eventsResult.data ?? []) {
    await enqueueSyncJob(
      {
        entityKind: "event",
        entityId: row.id,
        direction: "to_notion",
        reason: "bootstrap",
        dedupeKey: `bootstrap:event:${row.id}`,
      },
      client
    );
    enqueued += 1;
  }

  for (const row of requestsResult.data ?? []) {
    await enqueueSyncJob(
      {
        entityKind: "request",
        entityId: row.id,
        direction: "to_notion",
        reason: "bootstrap",
        dedupeKey: `bootstrap:request:${row.id}`,
      },
      client
    );
    enqueued += 1;
  }

  for (const row of locationsResult.data ?? []) {
    await enqueueSyncJob(
      {
        entityKind: "location",
        entityId: row.id,
        direction: "to_notion",
        reason: "bootstrap",
        dedupeKey: `bootstrap:location:${row.id}`,
      },
      client
    );
    enqueued += 1;
  }

  for (const row of organizersResult.data ?? []) {
    await enqueueSyncJob(
      {
        entityKind: "organizer",
        entityId: row.id,
        direction: "to_notion",
        reason: "bootstrap",
        dedupeKey: `bootstrap:organizer:${row.id}`,
      },
      client
    );
    enqueued += 1;
  }

  return { enqueued };
}
