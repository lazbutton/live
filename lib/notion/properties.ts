import type {
  NotionDateValue,
  NotionPage,
  NotionPagePropertyValue,
  NotionRichTextFragment,
} from "@/lib/notion/types";
import type { Client } from "@notionhq/client";
import type { RichTextItemRequest } from "@notionhq/client/build/src/api-endpoints/common";

const NOTION_TEXT_LIMIT = 2000;

type NotionPagePropertiesRequest = NonNullable<
  Parameters<Client["pages"]["create"]>[0]["properties"]
>;
type NotionPropertyRequest = NotionPagePropertiesRequest[string];

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function truncateText(value: string) {
  if (value.length <= NOTION_TEXT_LIMIT) return value;
  return value.slice(0, NOTION_TEXT_LIMIT - 1).trimEnd() + "…";
}

function buildTextFragments(
  value: string | null | undefined
): RichTextItemRequest[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return [
    {
      type: "text" as const,
      text: {
        content: truncateText(normalized),
      },
    },
  ];
}

function readFragmentsText(fragments: NotionRichTextFragment[] | undefined) {
  if (!fragments || fragments.length === 0) return null;
  const text = fragments
    .map((fragment) => fragment.plain_text ?? fragment.text?.content ?? "")
    .join("")
    .trim();
  return text || null;
}

function getProperty(page: NotionPage, propertyName: string) {
  return page.properties?.[propertyName] as NotionPagePropertyValue | undefined;
}

export function buildTitleProperty(
  value: string | null | undefined
): Extract<NotionPropertyRequest, { title: unknown }> {
  const normalized = normalizeText(value) ?? "(sans titre)";
  return {
    title: buildTextFragments(normalized),
  };
}

export function buildRichTextProperty(
  value: string | null | undefined
): Extract<NotionPropertyRequest, { rich_text: unknown }> {
  return {
    rich_text: buildTextFragments(value),
  };
}

export function buildNumberProperty(
  value: number | null | undefined
): Extract<NotionPropertyRequest, { number: unknown }> {
  return {
    number: typeof value === "number" && Number.isFinite(value) ? value : null,
  };
}

export function buildCheckboxProperty(
  value: boolean | null | undefined
): Extract<NotionPropertyRequest, { checkbox: unknown }> {
  return {
    checkbox: value === true,
  };
}

export function buildDateProperty(
  value: NotionDateValue | null | undefined
): Extract<NotionPropertyRequest, { date: unknown }> {
  return {
    date: value ?? null,
  };
}

export function buildUrlProperty(
  value: string | null | undefined
): Extract<NotionPropertyRequest, { url: unknown }> {
  const normalized = normalizeText(value);
  if (!normalized) {
    return {
      url: null,
    };
  }

  try {
    const url = new URL(normalized);
    return {
      url: url.toString(),
    };
  } catch {
    return {
      url: null,
    };
  }
}

export function buildRelationProperty(
  ids: string[]
): Extract<NotionPropertyRequest, { relation: unknown }> {
  return {
    relation: ids.filter(Boolean).map((id) => ({ id })),
  };
}

export function getTitleValue(page: NotionPage, propertyName: string) {
  return readFragmentsText(getProperty(page, propertyName)?.title);
}

export function getRichTextValue(page: NotionPage, propertyName: string) {
  return readFragmentsText(getProperty(page, propertyName)?.rich_text);
}

export function getStringValue(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property) return null;

  switch (property.type) {
    case "title":
      return readFragmentsText(property.title);
    case "rich_text":
      return readFragmentsText(property.rich_text);
    case "url":
      return normalizeText(property.url ?? null);
    case "select":
      return normalizeText(property.select?.name ?? null);
    case "status":
      return normalizeText(property.status?.name ?? null);
    case "number":
      return typeof property.number === "number"
        ? property.number.toString()
        : null;
    case "checkbox":
      return property.checkbox ? "true" : "false";
    default:
      return null;
  }
}

export function getNumberValue(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property) return null;

  if (property.type === "number") {
    return typeof property.number === "number" ? property.number : null;
  }

  const raw = getStringValue(page, propertyName);
  if (!raw) return null;

  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getCheckboxValue(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property) return false;

  if (property.type === "checkbox") {
    return property.checkbox === true;
  }

  const raw = getStringValue(page, propertyName);
  if (!raw) return false;
  return ["true", "1", "yes", "oui"].includes(raw.toLowerCase());
}

export function getUrlValue(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property) return null;

  if (property.type === "url") {
    return normalizeText(property.url ?? null);
  }

  const raw = getStringValue(page, propertyName);
  if (!raw) return null;

  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

export function getDateValue(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property || property.type !== "date") return null;
  return property.date ?? null;
}

export function getDateStartOrStringValue(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property) return null;

  if (property.type === "date") {
    return property.date?.start ?? null;
  }

  return getStringValue(page, propertyName);
}

export function getRelationIds(page: NotionPage, propertyName: string) {
  const property = getProperty(page, propertyName);
  if (!property || property.type !== "relation") return [];
  return (property.relation ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id));
}
