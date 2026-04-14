export type NotionEntityKind =
  | "unknown"
  | "event"
  | "request"
  | "location"
  | "organizer";

export type NotionSyncDirection = "to_notion" | "from_notion";

export type NotionSyncJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped";

export type NotionOwnerKind = "organizer" | "location";

export type NotionRichTextFragment = {
  plain_text?: string;
  href?: string | null;
  text?: {
    content?: string;
    link?: { url?: string | null } | null;
  };
};

export type NotionDateValue = {
  start: string;
  end?: string | null;
  time_zone?: string | null;
};

export type NotionPagePropertyValue = {
  id?: string;
  type: string;
  title?: NotionRichTextFragment[];
  rich_text?: NotionRichTextFragment[];
  number?: number | null;
  checkbox?: boolean;
  url?: string | null;
  date?: NotionDateValue | null;
  relation?: Array<{ id: string }>;
  select?: { name?: string | null } | null;
  status?: { name?: string | null } | null;
  multi_select?: Array<{ name?: string | null }>;
  formula?: {
    type?: string;
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: NotionDateValue | null;
  } | null;
  [key: string]: unknown;
};

export type NotionPage = {
  object?: string;
  id: string;
  url?: string;
  in_trash?: boolean;
  archived?: boolean;
  last_edited_time: string;
  parent?: {
    type?: string;
    data_source_id?: string;
    database_id?: string;
    page_id?: string;
    [key: string]: unknown;
  };
  properties: Record<string, NotionPagePropertyValue>;
};

export type NotionDataSourceProperty = {
  id?: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
};

export type NotionDataSource = {
  object?: string;
  id: string;
  title?: NotionRichTextFragment[];
  properties?: Record<string, NotionDataSourceProperty>;
};

export type NotionQueryResponse = {
  object?: string;
  results: NotionPage[];
  next_cursor?: string | null;
  has_more: boolean;
};

export type NotionWebhookPayload = {
  id?: string;
  type?: string;
  timestamp?: string;
  verification_token?: string;
  entity?: {
    id?: string;
    type?: string;
  };
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NotionSyncJobRow = {
  id: string;
  entity_kind: NotionEntityKind;
  entity_id: string | null;
  notion_page_id: string | null;
  direction: NotionSyncDirection;
  status: NotionSyncJobStatus;
  reason: string | null;
  payload: Record<string, unknown> | null;
  dedupe_key: string | null;
  attempt_count: number;
  available_at: string;
  locked_at: string | null;
  locked_by: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
};

export type NotionEventLinkRow = {
  event_id: string;
  notion_page_id: string;
  notion_page_url: string | null;
  live_updated_at: string | null;
  notion_last_edited_at: string | null;
  last_synced_at: string | null;
  last_sync_direction: NotionSyncDirection | null;
  last_sync_hash: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotionRequestLinkRow = {
  request_id: string;
  notion_page_id: string;
  notion_page_url: string | null;
  live_updated_at: string | null;
  notion_last_edited_at: string | null;
  last_synced_at: string | null;
  last_sync_direction: NotionSyncDirection | null;
  last_sync_hash: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotionLocationLinkRow = {
  location_id: string;
  notion_page_id: string;
  notion_page_url: string | null;
  live_updated_at: string | null;
  notion_last_edited_at: string | null;
  last_synced_at: string | null;
  last_sync_direction: NotionSyncDirection | null;
  last_sync_hash: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotionOrganizerLinkRow = {
  owner_kind: NotionOwnerKind;
  owner_id: string;
  notion_page_id: string;
  notion_page_url: string | null;
  live_updated_at: string | null;
  notion_last_edited_at: string | null;
  last_synced_at: string | null;
  last_sync_direction: NotionSyncDirection | null;
  last_sync_hash: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
