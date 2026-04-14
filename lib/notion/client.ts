import { Client, APIResponseError } from "@notionhq/client";
import { createHmac } from "crypto";
import { getNotionSyncConfig } from "@/lib/notion/config";
import {
  safeTimingEqual,
} from "@/lib/notion/utils";
import type {
  NotionDataSource,
  NotionPage,
  NotionQueryResponse,
} from "@/lib/notion/types";

let cachedClient: Client | null = null;

type NotionCreatePageArgs = Parameters<Client["pages"]["create"]>[0];
type NotionUpdatePageArgs = Parameters<Client["pages"]["update"]>[0];
type NotionPagePropertiesRequest = NonNullable<NotionCreatePageArgs["properties"]>;
type NotionQueryDataSourceArgs = Parameters<Client["dataSources"]["query"]>[0];

export function getNotionClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getNotionSyncConfig();
  cachedClient = new Client({
    auth: config.notionApiKey,
    notionVersion: config.notionApiVersion,
  });
  return cachedClient;
}

export function verifyNotionWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined
) {
  if (!signatureHeader) return false;
  const config = getNotionSyncConfig();
  const computed = `sha256=${createHmac("sha256", config.webhookVerificationToken)
    .update(rawBody)
    .digest("hex")}`;
  return safeTimingEqual(computed, signatureHeader);
}

export function isNotionVerificationPayload(payload: unknown): payload is {
  verification_token: string;
} {
  if (!payload || typeof payload !== "object") return false;
  return typeof (payload as { verification_token?: unknown }).verification_token === "string";
}

export async function retrieveNotionPage(pageId: string) {
  const client = getNotionClient();
  const response = await client.pages.retrieve({ page_id: pageId });
  return response as unknown as NotionPage;
}

export async function createNotionPage(input: {
  dataSourceId: string;
  properties: NotionPagePropertiesRequest;
}) {
  const client = getNotionClient();
  const response = await client.pages.create({
    parent: {
      data_source_id: input.dataSourceId,
      type: "data_source_id",
    },
    properties: input.properties,
  });
  return response as unknown as NotionPage;
}

export async function updateNotionPage(
  pageId: string,
  properties: NonNullable<NotionUpdatePageArgs["properties"]>
) {
  const client = getNotionClient();
  const response = await client.pages.update({
    page_id: pageId,
    properties,
  });
  return response as unknown as NotionPage;
}

export async function archiveNotionPage(pageId: string) {
  const client = getNotionClient();
  const response = await client.pages.update({
    page_id: pageId,
    in_trash: true,
  });
  return response as unknown as NotionPage;
}

export async function queryNotionDataSource(input: {
  dataSourceId: string;
  filter?: NotionQueryDataSourceArgs["filter"];
  sorts?: NotionQueryDataSourceArgs["sorts"];
  startCursor?: string;
  pageSize?: number;
}) {
  const client = getNotionClient();
  const response = await client.dataSources.query({
    data_source_id: input.dataSourceId,
    filter: input.filter,
    sorts: input.sorts,
    start_cursor: input.startCursor,
    page_size: input.pageSize,
  });
  return response as unknown as NotionQueryResponse;
}

export async function retrieveNotionDataSource(dataSourceId: string) {
  const client = getNotionClient();
  const response = await client.dataSources.retrieve({
    data_source_id: dataSourceId,
  });
  return response as unknown as NotionDataSource;
}

export function isNotionApiError(error: unknown): error is APIResponseError {
  return error instanceof APIResponseError;
}

export function shouldRetryNotionError(error: unknown) {
  if (!isNotionApiError(error)) return false;
  return (
    error.status === 429 ||
    error.status === 500 ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  );
}
