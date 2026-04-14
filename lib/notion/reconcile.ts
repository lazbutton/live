import type { SupabaseClient } from "@supabase/supabase-js";
import {
  archiveNotionPage,
  createNotionPage,
  queryNotionDataSource,
  retrieveNotionPage,
  updateNotionPage,
} from "@/lib/notion/client";
import { getDataSourceIdForKind, getEntityKindForDataSourceId } from "@/lib/notion/config";
import {
  applyNotionEventToLive,
  applyNotionRequestToLive,
  exportEntityToNotionPayload,
  upsertEventLink,
  upsertLocationLink,
  upsertOrganizerLink,
  upsertRequestLink,
} from "@/lib/notion/domain";
import { getEventLinkByNotionPageId } from "@/lib/notion/mappers/events";
import { getRequestLinkByNotionPageId } from "@/lib/notion/mappers/requests";
import {
  getLocationLinkByNotionPageId,
  getOrganizerLinkByNotionPageId,
  mapNotionLocationPageToLive,
  mapNotionOrganizerPageToLive,
} from "@/lib/notion/mappers/references";
import type { NotionEntityKind, NotionPage, NotionSyncJobRow } from "@/lib/notion/types";
import {
  compareHashes,
  computeSyncHash,
  isLastWriteWinning,
  normalizeIsoString,
} from "@/lib/notion/utils";
import {
  claimSyncJobs,
  completeSyncJob,
  enqueueSyncJob,
  failSyncJob,
  skipSyncJob,
} from "@/lib/notion/queue";

async function syncLiveEntityToNotion(
  supabase: SupabaseClient,
  job: NotionSyncJobRow
) {
  const action =
    typeof job.payload?.action === "string" ? job.payload.action.trim() : "";

  if (action === "delete") {
    if (!job.notion_page_id) {
      await skipSyncJob(job.id, "Suppression Notion ignorée faute de notion_page_id", supabase);
      return;
    }

    await archiveNotionPage(job.notion_page_id);
    await completeSyncJob(
      job.id,
      {
        entityId: job.entity_id,
        notionPageId: job.notion_page_id,
      },
      supabase
    );
    return;
  }

  if (!job.entity_id) {
    throw new Error("entity_id manquant pour une synchro vers Notion");
  }

  const prepared = await exportEntityToNotionPayload(
    supabase,
    job.entity_kind,
    job.entity_id
  );

  if (!prepared) {
    await skipSyncJob(job.id, "Entité introuvable ou non exportable", supabase);
    return;
  }

  if (compareHashes(job.payload?.sync_hash as string | null | undefined, prepared.syncHash)) {
    await skipSyncJob(job.id, "Le payload demandé est déjà synchronisé", supabase);
    return;
  }

  if (prepared.notionPageId && compareHashes(prepared.syncHash, job.payload?.sync_hash as string | null | undefined)) {
    await skipSyncJob(job.id, "Aucun changement live nouveau à pousser", supabase);
    return;
  }

  if (prepared.notionPageId && compareHashes(prepared.syncHash, (await getExistingLinkHash(supabase, prepared.entityKind, prepared.entityId)))) {
    await skipSyncJob(job.id, "Aucun changement live nouveau à pousser", supabase);
    return;
  }

  const dataSourceId = getDataSourceIdForKind(job.entity_kind);
  if (!dataSourceId) {
    await skipSyncJob(job.id, `Aucun data source Notion configuré pour ${job.entity_kind}`, supabase);
    return;
  }

  const liveWins = isLastWriteWinning(
    prepared.liveUpdatedAt,
    prepared.notionLastEditedAt
  );
  if (liveWins === "notion" && prepared.notionPageId) {
    await skipSyncJob(
      job.id,
      "Une modification Notion plus récente existe déjà",
      supabase
    );
    return;
  }

  let notionPage;
  if (prepared.notionPageId) {
    notionPage = await updateNotionPage(prepared.notionPageId, prepared.properties);
  } else {
    notionPage = await createNotionPage({
      dataSourceId,
      properties: prepared.properties,
    });
  }

  await persistEntityLink(supabase, prepared.entityKind, {
    entityId: prepared.entityId,
    notionPageId: notionPage.id,
    notionPageUrl: notionPage.url ?? null,
    liveUpdatedAt: prepared.liveUpdatedAt,
    notionLastEditedAt: notionPage.last_edited_time,
    syncHash: prepared.syncHash,
    direction: "to_notion",
  });

  await completeSyncJob(
    job.id,
    {
      entityId: prepared.entityId,
      notionPageId: notionPage.id,
      syncHash: prepared.syncHash,
    },
    supabase
  );
}

async function syncNotionPageToLive(
  supabase: SupabaseClient,
  job: NotionSyncJobRow
) {
  const notionPageId = job.notion_page_id;
  if (!notionPageId) {
    throw new Error("notion_page_id manquant pour une synchro depuis Notion");
  }

  const page = await retrieveNotionPage(notionPageId);
  const entityKind =
    job.entity_kind !== "unknown"
      ? job.entity_kind
      : getEntityKindForDataSourceId(
          page.parent?.data_source_id ?? page.parent?.database_id ?? null
        );

  if (entityKind === "unknown") {
    await skipSyncJob(job.id, "Data source Notion inconnu", supabase);
    return;
  }

  switch (entityKind) {
    case "event":
      await applyNotionEventJob(supabase, job, page);
      return;
    case "request":
      await applyNotionRequestJob(supabase, job, page);
      return;
    case "location":
      await applyNotionLocationJob(supabase, job, page);
      return;
    case "organizer":
      await applyNotionOrganizerJob(supabase, job, page);
      return;
    default:
      await skipSyncJob(job.id, "Type d'entité non géré", supabase);
  }
}

async function applyNotionEventJob(
  supabase: SupabaseClient,
  job: NotionSyncJobRow,
  page: NotionPage
) {
  const link = await getEventLinkByNotionPageId(supabase, page.id);
  const { mapNotionEventPageToLive } = await import("@/lib/notion/mappers/events");
  const mapped = await mapNotionEventPageToLive(supabase, page);

  if (link && compareHashes(link.last_sync_hash, mapped.syncHash)) {
    await skipSyncJob(job.id, "Aucun changement effectif détecté", supabase);
    return;
  }

  if (link && link.live_updated_at && link.notion_last_edited_at) {
    const winner = isLastWriteWinning(link.live_updated_at, page.last_edited_time);
    if (winner === "live") {
      await enqueueSyncJob(
        {
          entityKind: "event",
          entityId: link.event_id,
          direction: "to_notion",
          reason: "conflict_live_wins",
          dedupeKey: `conflict:event:${link.event_id}`,
        },
        supabase
      );
      await skipSyncJob(job.id, "Conflit résolu en faveur de live", supabase);
      return;
    }
  }

  const eventId = await applyNotionEventToLive(supabase, {
    liveEventId: mapped.liveEventId ?? link?.event_id ?? null,
    updates: mapped.updates,
    organizerRefs: mapped.organizerRefs,
    action: getActionFromJobOrPage(job, page),
  });

  const updatedEvent = await import("@/lib/notion/mappers/events").then((module) =>
    module.fetchEventById(supabase, eventId)
  );

  await persistEntityLink(supabase, "event", {
    entityId: eventId,
    notionPageId: page.id,
    notionPageUrl: page.url ?? null,
    liveUpdatedAt: updatedEvent?.updated_at ?? new Date().toISOString(),
    notionLastEditedAt: page.last_edited_time,
    syncHash: mapped.syncHash ?? computeSyncHash(mapped.updates),
    direction: "from_notion",
  });

  await completeSyncJob(
    job.id,
    {
      entityId: eventId,
      notionPageId: page.id,
      syncHash: mapped.syncHash ?? null,
    },
    supabase
  );
}

async function applyNotionRequestJob(
  supabase: SupabaseClient,
  job: NotionSyncJobRow,
  page: NotionPage
) {
  const link = await getRequestLinkByNotionPageId(supabase, page.id);
  const { mapNotionRequestPageToLive } = await import("@/lib/notion/mappers/requests");
  const mapped = await mapNotionRequestPageToLive(supabase, page);

  if (link && compareHashes(link.last_sync_hash, mapped.syncHash)) {
    await skipSyncJob(job.id, "Aucun changement effectif détecté", supabase);
    return;
  }

  if (link && link.live_updated_at && link.notion_last_edited_at) {
    const winner = isLastWriteWinning(link.live_updated_at, page.last_edited_time);
    if (winner === "live") {
      await enqueueSyncJob(
        {
          entityKind: "request",
          entityId: link.request_id,
          direction: "to_notion",
          reason: "conflict_live_wins",
          dedupeKey: `conflict:request:${link.request_id}`,
        },
        supabase
      );
      await skipSyncJob(job.id, "Conflit résolu en faveur de live", supabase);
      return;
    }
  }

  const requestId = await applyNotionRequestToLive(supabase, {
    liveRequestId: mapped.liveRequestId ?? link?.request_id ?? null,
    requestType: mapped.requestType,
    updates: mapped.updates,
    action: mapped.action ?? getActionFromJobOrPage(job, page),
  });

  const updatedRequest = await import("@/lib/notion/mappers/requests").then((module) =>
    module.fetchRequestById(supabase, requestId)
  );

  await persistEntityLink(supabase, "request", {
    entityId: requestId,
    notionPageId: page.id,
    notionPageUrl: page.url ?? null,
    liveUpdatedAt: updatedRequest?.updated_at ?? new Date().toISOString(),
    notionLastEditedAt: page.last_edited_time,
    syncHash: mapped.syncHash ?? computeSyncHash(mapped.updates),
    direction: "from_notion",
  });

  await completeSyncJob(
    job.id,
    {
      entityId: requestId,
      notionPageId: page.id,
      syncHash: mapped.syncHash ?? null,
    },
    supabase
  );
}

async function applyNotionLocationJob(
  supabase: SupabaseClient,
  job: NotionSyncJobRow,
  page: NotionPage
) {
  const link = await getLocationLinkByNotionPageId(supabase, page.id);
  const mapped = mapNotionLocationPageToLive(page);
  const locationId = mapped.liveLocationId ?? link?.location_id ?? null;

  if (!locationId) {
    await skipSyncJob(
      job.id,
      "Création de lieu depuis Notion non supportée sans mapping initial",
      supabase
    );
    return;
  }

  const updatePayload: Record<string, unknown> = {};
  if (mapped.name) updatePayload.name = mapped.name;
  if (mapped.address !== undefined) updatePayload.address = mapped.address;
  if (mapped.imageUrl !== undefined) updatePayload.image_url = mapped.imageUrl;

  const { error } = await supabase
    .from("locations")
    .update(updatePayload)
    .eq("id", locationId);
  if (error) throw error;

  const { data: updatedLocation, error: locationError } = await supabase
    .from("locations")
    .select("updated_at")
    .eq("id", locationId)
    .maybeSingle();
  if (locationError) throw locationError;

  await persistEntityLink(supabase, "location", {
    entityId: locationId,
    notionPageId: page.id,
    notionPageUrl: page.url ?? null,
    liveUpdatedAt: updatedLocation?.updated_at ?? new Date().toISOString(),
    notionLastEditedAt: page.last_edited_time,
    syncHash: mapped.syncHash ?? computeSyncHash(updatePayload),
    direction: "from_notion",
  });

  await completeSyncJob(job.id, { entityId: locationId, notionPageId: page.id }, supabase);
}

async function applyNotionOrganizerJob(
  supabase: SupabaseClient,
  job: NotionSyncJobRow,
  page: NotionPage
) {
  const link = await getOrganizerLinkByNotionPageId(supabase, page.id);
  const mapped = mapNotionOrganizerPageToLive(page);
  const ownerKind = mapped.ownerKind ?? link?.owner_kind ?? "organizer";
  const ownerId = mapped.liveOrganizerId ?? link?.owner_id ?? null;

  if (!ownerId) {
    await skipSyncJob(
      job.id,
      "Création d’organisateur depuis Notion non supportée sans mapping initial",
      supabase
    );
    return;
  }

  const table = ownerKind === "location" ? "locations" : "organizers";
  const updatePayload: Record<string, unknown> = {
    name: mapped.name ?? null,
  };

  if (ownerKind === "organizer") {
    updatePayload.website_url = mapped.websiteUrl ?? null;
    updatePayload.instagram_url = mapped.instagramUrl ?? null;
    updatePayload.facebook_url = mapped.facebookUrl ?? null;
    updatePayload.logo_url = mapped.imageUrl ?? null;
  } else {
    updatePayload.website_url = mapped.websiteUrl ?? null;
    updatePayload.image_url = mapped.imageUrl ?? null;
  }

  const { error } = await supabase.from(table).update(updatePayload).eq("id", ownerId);
  if (error) throw error;

  const { data: updatedOwner, error: ownerError } = await supabase
    .from(table)
    .select("updated_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (ownerError) throw ownerError;

  await persistEntityLink(supabase, "organizer", {
    entityId: ownerId,
    ownerKind,
    notionPageId: page.id,
    notionPageUrl: page.url ?? null,
    liveUpdatedAt: updatedOwner?.updated_at ?? new Date().toISOString(),
    notionLastEditedAt: page.last_edited_time,
    syncHash: mapped.syncHash ?? computeSyncHash(updatePayload),
    direction: "from_notion",
  });

  await completeSyncJob(job.id, { entityId: ownerId, notionPageId: page.id }, supabase);
}

function getActionFromJobOrPage(job: NotionSyncJobRow, page: NotionPage) {
  const payloadAction =
    typeof job.payload?.action === "string" ? job.payload.action : null;
  if (payloadAction) return payloadAction;
  return null;
}

async function getExistingLinkHash(
  supabase: SupabaseClient,
  entityKind: NotionEntityKind,
  entityId: string
) {
  if (entityKind === "event") {
    const link = await import("@/lib/notion/mappers/events").then((module) =>
      module.getEventLinkByLiveId(supabase, entityId)
    );
    return link?.last_sync_hash ?? null;
  }

  if (entityKind === "request") {
    const link = await import("@/lib/notion/mappers/requests").then((module) =>
      module.getRequestLinkByLiveId(supabase, entityId)
    );
    return link?.last_sync_hash ?? null;
  }

  if (entityKind === "location") {
    const link = await import("@/lib/notion/mappers/references").then((module) =>
      module.getLocationLinkByLiveId(supabase, entityId)
    );
    return link?.last_sync_hash ?? null;
  }

  if (entityKind === "organizer") {
    const organizerLink = await import("@/lib/notion/mappers/references").then(
      (module) => module.getOrganizerLinkByLiveId(supabase, "organizer", entityId)
    );
    if (organizerLink?.last_sync_hash) return organizerLink.last_sync_hash;
    const locationLink = await import("@/lib/notion/mappers/references").then(
      (module) => module.getOrganizerLinkByLiveId(supabase, "location", entityId)
    );
    return locationLink?.last_sync_hash ?? null;
  }

  return null;
}

async function persistEntityLink(
  supabase: SupabaseClient,
  entityKind: NotionEntityKind,
  input: {
    entityId: string;
    notionPageId: string;
    notionPageUrl?: string | null;
    liveUpdatedAt?: string | null;
    notionLastEditedAt?: string | null;
    syncHash?: string | null;
    direction?: "to_notion" | "from_notion";
    ownerKind?: "organizer" | "location";
  }
) {
  switch (entityKind) {
    case "event":
      await upsertEventLink(supabase, {
        eventId: input.entityId,
        notionPageId: input.notionPageId,
        notionPageUrl: input.notionPageUrl,
        liveUpdatedAt: input.liveUpdatedAt,
        notionLastEditedAt: input.notionLastEditedAt,
        syncHash: input.syncHash,
        direction: input.direction,
      });
      return;
    case "request":
      await upsertRequestLink(supabase, {
        requestId: input.entityId,
        notionPageId: input.notionPageId,
        notionPageUrl: input.notionPageUrl,
        liveUpdatedAt: input.liveUpdatedAt,
        notionLastEditedAt: input.notionLastEditedAt,
        syncHash: input.syncHash,
        direction: input.direction,
      });
      return;
    case "location":
      await upsertLocationLink(supabase, {
        locationId: input.entityId,
        notionPageId: input.notionPageId,
        notionPageUrl: input.notionPageUrl,
        liveUpdatedAt: input.liveUpdatedAt,
        notionLastEditedAt: input.notionLastEditedAt,
        syncHash: input.syncHash,
        direction: input.direction,
      });
      return;
    case "organizer":
      await upsertOrganizerLink(supabase, {
        ownerKind: input.ownerKind ?? "organizer",
        ownerId: input.entityId,
        notionPageId: input.notionPageId,
        notionPageUrl: input.notionPageUrl,
        liveUpdatedAt: input.liveUpdatedAt,
        notionLastEditedAt: input.notionLastEditedAt,
        syncHash: input.syncHash,
        direction: input.direction,
      });
      return;
    default:
      return;
  }
}

export async function processSyncJob(
  supabase: SupabaseClient,
  job: NotionSyncJobRow
) {
  if (job.direction === "to_notion") {
    await syncLiveEntityToNotion(supabase, job);
    return;
  }

  if (job.direction === "from_notion") {
    await syncNotionPageToLive(supabase, job);
    return;
  }

  throw new Error(`Direction de synchro non supportée: ${job.direction}`);
}

export async function drainNotionSyncQueue(
  supabase: SupabaseClient,
  {
    maxJobs = 10,
  }: {
    maxJobs?: number;
  } = {}
) {
  const jobs = await claimSyncJobs(maxJobs, supabase);
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      await processSyncJob(supabase, job);
      processed += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue";
      if (message.includes("Aucun changement effectif détecté")) {
        skipped += 1;
      } else {
        failed += 1;
      }
      await failSyncJob(job, message, supabase);
    }
  }

  return {
    claimed: jobs.length,
    processed,
    failed,
    skipped,
  };
}

export async function syncSingleEntityToNotion(
  supabase: SupabaseClient,
  entityKind: NotionEntityKind,
  entityId: string,
  reason = "manual_resync"
) {
  const jobId = await enqueueSyncJob(
    {
      entityKind,
      entityId,
      direction: "to_notion",
      reason,
      dedupeKey: `manual:${entityKind}:${entityId}`,
    },
    supabase
  );
  return jobId;
}

export async function importNotionPageToLive(
  supabase: SupabaseClient,
  notionPageId: string,
  entityKind: NotionEntityKind
) {
  const jobId = await enqueueSyncJob(
    {
      entityKind,
      notionPageId,
      direction: "from_notion",
      reason: "manual_import",
      dedupeKey: `manual_import:${entityKind}:${notionPageId}`,
    },
    supabase
  );
  return jobId;
}

export async function resyncDataSourcePageIds(
  supabase: SupabaseClient,
  entityKind: NotionEntityKind,
  {
    limit = 100,
  }: {
    limit?: number;
  } = {}
) {
  const dataSourceId = getDataSourceIdForKind(entityKind);
  if (!dataSourceId) {
    throw new Error(`Aucun data source configuré pour ${entityKind}`);
  }

  const response = await queryNotionDataSource({
    dataSourceId,
    pageSize: Math.min(Math.max(limit, 1), 100),
  });

  let enqueued = 0;
  for (const page of response.results ?? []) {
    await enqueueSyncJob(
      {
        entityKind,
        notionPageId: page.id,
        direction: "from_notion",
        reason: "resync_page_scan",
        dedupeKey: `resync_scan:${entityKind}:${page.id}`,
      },
      supabase
    );
    enqueued += 1;
  }

  return {
    enqueued,
    hasMore: response.has_more,
    nextCursor: response.next_cursor ?? null,
  };
}
