import { createHash, timingSafeEqual } from "crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}

export function computeSyncHash(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function compareHashes(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a === b;
}

export function parseIsoTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

export function isLastWriteWinning(
  liveUpdatedAt: string | null | undefined,
  notionUpdatedAt: string | null | undefined
) {
  const liveTimestamp = parseIsoTimestamp(liveUpdatedAt);
  const notionTimestamp = parseIsoTimestamp(notionUpdatedAt);

  if (!Number.isFinite(liveTimestamp) && !Number.isFinite(notionTimestamp)) {
    return "equal" as const;
  }
  if (!Number.isFinite(liveTimestamp)) {
    return "notion" as const;
  }
  if (!Number.isFinite(notionTimestamp)) {
    return "live" as const;
  }
  if (liveTimestamp === notionTimestamp) {
    return "equal" as const;
  }
  return liveTimestamp > notionTimestamp ? "live" as const : "notion" as const;
}

export function normalizeIsoString(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function buildWebhookAuthHeader(token: string | null | undefined) {
  const normalized = token?.trim();
  if (!normalized) return null;
  return `Bearer ${normalized}`;
}

export function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
