import type { NotionEntityKind } from "@/lib/notion/types";

type RequiredConfig = {
  enabled: boolean;
  notionApiKey: string;
  notionApiVersion: string;
  webhookVerificationToken: string;
  requestsDataSourceId: string;
  eventsDataSourceId: string;
};

type OptionalConfig = {
  locationsDataSourceId: string | null;
  organizersDataSourceId: string | null;
  syncWebhookToken: string | null;
  queueWorkerId: string;
  syncActorUserId: string | null;
};

export type NotionSyncConfig = RequiredConfig & OptionalConfig;

const DEFAULT_NOTION_API_VERSION = "2026-03-11";

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireEnv(name: string) {
  const value = normalizeEnvValue(process.env[name]);
  if (!value) {
    throw new Error(`Variable d'environnement manquante: ${name}`);
  }
  return value;
}

export function getNotionSyncConfig(): NotionSyncConfig {
  return {
    enabled:
      normalizeEnvValue(process.env.NOTION_SYNC_ENABLED)?.toLowerCase() !==
      "false",
    notionApiKey: requireEnv("NOTION_API_KEY"),
    notionApiVersion:
      normalizeEnvValue(process.env.NOTION_API_VERSION) ??
      DEFAULT_NOTION_API_VERSION,
    webhookVerificationToken: requireEnv("NOTION_WEBHOOK_VERIFICATION_TOKEN"),
    eventsDataSourceId: requireEnv("NOTION_EVENTS_DATA_SOURCE_ID"),
    requestsDataSourceId: requireEnv("NOTION_REQUESTS_DATA_SOURCE_ID"),
    locationsDataSourceId:
      normalizeEnvValue(process.env.NOTION_LOCATIONS_DATA_SOURCE_ID),
    organizersDataSourceId:
      normalizeEnvValue(process.env.NOTION_ORGANIZERS_DATA_SOURCE_ID),
    syncWebhookToken: normalizeEnvValue(process.env.NOTION_SYNC_WEBHOOK_TOKEN),
    syncActorUserId: normalizeEnvValue(process.env.NOTION_SYNC_ACTOR_USER_ID),
    queueWorkerId:
      normalizeEnvValue(process.env.NOTION_SYNC_WORKER_ID) ??
      "live-admin-web",
  };
}

export function getDataSourceIdForKind(kind: NotionEntityKind) {
  const config = getNotionSyncConfig();

  switch (kind) {
    case "event":
      return config.eventsDataSourceId;
    case "request":
      return config.requestsDataSourceId;
    case "location":
      return config.locationsDataSourceId;
    case "organizer":
      return config.organizersDataSourceId;
    default:
      return null;
  }
}

export function canSyncKind(kind: NotionEntityKind) {
  return Boolean(getDataSourceIdForKind(kind));
}

export function getEntityKindForDataSourceId(dataSourceId: string | null | undefined) {
  const normalized = dataSourceId?.trim();
  if (!normalized) return "unknown" as const;

  const config = getNotionSyncConfig();
  if (normalized === config.eventsDataSourceId) return "event" as const;
  if (normalized === config.requestsDataSourceId) return "request" as const;
  if (normalized === config.locationsDataSourceId) return "location" as const;
  if (normalized === config.organizersDataSourceId) return "organizer" as const;
  return "unknown" as const;
}
