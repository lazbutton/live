import type { Metadata } from "next";

import { OpenEntityAppClient } from "@/components/public-share/open-entity-app-client";
import { buildPublicMetadata } from "@/lib/metadata";
import { getEventSharePageData, type EventSharePageData } from "@/lib/public-share-data";

function normalizeMetadataText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ") : null;
}

function truncateMetadataText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildEventMetadataTitle(data: EventSharePageData) {
  const baseTitle = normalizeMetadataText(data.title) || "Événement OutLive";
  const context = [data.dateLabel, data.locationLabel, ...data.tagLabels.slice(0, 2)]
    .filter(Boolean)
    .join(" · ");

  if (!context) {
    return truncateMetadataText(baseTitle, 150);
  }

  const separator = " · ";
  const maxLength = 150;
  const reservedLength = context.length + separator.length;
  const availableForTitle = Math.max(36, maxLength - reservedLength);
  const shortenedTitle = truncateMetadataText(baseTitle, availableForTitle);

  return truncateMetadataText(`${shortenedTitle}${separator}${context}`, maxLength);
}

function buildEventMetadataDescription(data: EventSharePageData) {
  const contextParts = [data.dateLabel, data.locationLabel].filter(Boolean);
  const tagLabels = data.tagLabels.slice(0, 4);
  const metadataLead = [
    contextParts.length > 0 ? contextParts.join(" · ") : null,
    tagLabels.length > 0 ? `Tags: ${tagLabels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const normalizedDescription = normalizeMetadataText(data.description);

  if (!metadataLead && !normalizedDescription) {
    return `Téléchargez OutLive pour ouvrir ${data.title} dans l'application.`;
  }

  if (!normalizedDescription) {
    return truncateMetadataText(metadataLead, 220);
  }

  if (!metadataLead) {
    return truncateMetadataText(normalizedDescription, 220);
  }

  return truncateMetadataText(`${metadataLead}. ${normalizedDescription}`, 220);
}

function buildEventMetadataKeywords(data: EventSharePageData) {
  return Array.from(
    new Set(
      [
        data.title,
        data.locationLabel,
        data.categoryLabel,
        data.dateLabel,
        ...data.tagLabels,
        "OutLive",
        "événement",
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params;
  const data = await getEventSharePageData(eventId);

  if (!data) {
    return buildPublicMetadata({
      title: "Ouvrir dans l'app OutLive",
      description: "Téléchargez OutLive pour ouvrir cet événement dans l'application.",
      path: `/open/event/${eventId}`,
      image: `/event/${eventId}/opengraph-image`,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: buildEventMetadataTitle(data),
    description: buildEventMetadataDescription(data),
    path: data.sharePath,
    image: data.imageUrl || `/event/${eventId}/opengraph-image`,
    imageAlt: data.imageUrl
      ? `Image de l'événement ${data.title}`
      : `Aperçu OutLive de ${data.title}`,
    type: "article",
    noIndex: true,
    keywords: buildEventMetadataKeywords(data),
  });
}

export default async function OpenEventAppPage({ params }: PageProps) {
  const { eventId } = await params;
  const data = await getEventSharePageData(eventId);

  return (
    <OpenEntityAppClient
      entity="event"
      identifier={eventId}
      displayName={data?.title ?? null}
    />
  );
}
