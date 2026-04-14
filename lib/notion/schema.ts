import type { NotionEntityKind } from "@/lib/notion/types";

export const NOTION_EVENT_SCHEMA = {
  kind: "event" as const,
  title: "Events",
  propertyNames: {
    title: "Title",
    status: "Status",
    date: "Date",
    endDate: "End date",
    category: "Category",
    price: "Price",
    presalePrice: "Presale price",
    subscriberPrice: "Subscriber price",
    isFull: "Is full",
    isFeatured: "Is featured",
    archived: "Archived",
    locationRelation: "Location",
    organizerRelations: "Organizers",
    organizerSummary: "Organizer summary",
    roomId: "Room ID",
    externalUrl: "External URL",
    externalUrlLabel: "External URL label",
    scrapingUrl: "Scraping URL",
    instagramUrl: "Instagram URL",
    facebookUrl: "Facebook URL",
    imageUrl: "Image URL",
    address: "Address",
    description: "Description",
    doorOpeningTime: "Door opening time",
    capacity: "Capacity",
    tagIds: "Tag IDs",
    eventId: "Live event ID",
    syncOrigin: "Sync origin",
    sourceUpdatedAt: "Source updated at",
    lastSyncedAt: "Last synced at",
    syncHash: "Sync hash",
    lastAction: "Action",
  },
} as const;

export const NOTION_REQUEST_SCHEMA = {
  kind: "request" as const,
  title: "Requests",
  propertyNames: {
    title: "Title",
    requestType: "Request type",
    status: "Status",
    lane: "Lane",
    eventDate: "Event date",
    endDate: "End date",
    category: "Category",
    locationRelation: "Location",
    locationSummary: "Location summary",
    organizerRelations: "Organizers",
    organizerSummary: "Organizer summary",
    sourceUrl: "Source URL",
    externalUrl: "External URL",
    externalUrlLabel: "External URL label",
    scrapingUrl: "Scraping URL",
    instagramUrl: "Instagram URL",
    facebookUrl: "Facebook URL",
    address: "Address",
    description: "Description",
    price: "Price",
    presalePrice: "Presale price",
    subscriberPrice: "Subscriber price",
    capacity: "Capacity",
    imageUrl: "Image URL",
    tagIds: "Tag IDs",
    moderationReason: "Moderation reason",
    contributorMessage: "Contributor message",
    internalNotes: "Internal notes",
    allowUserResubmission: "Allow resubmission",
    requestId: "Live request ID",
    convertedEventId: "Converted event ID",
    syncOrigin: "Sync origin",
    sourceUpdatedAt: "Source updated at",
    lastSyncedAt: "Last synced at",
    syncHash: "Sync hash",
    lastAction: "Action",
  },
} as const;

export const NOTION_LOCATION_SCHEMA = {
  kind: "location" as const,
  title: "Locations",
  propertyNames: {
    title: "Name",
    address: "Address",
    city: "City",
    imageUrl: "Image URL",
    locationId: "Live location ID",
    syncOrigin: "Sync origin",
    sourceUpdatedAt: "Source updated at",
    lastSyncedAt: "Last synced at",
    syncHash: "Sync hash",
  },
} as const;

export const NOTION_ORGANIZER_SCHEMA = {
  kind: "organizer" as const,
  title: "Organizers",
  propertyNames: {
    title: "Name",
    ownerKind: "Owner kind",
    websiteUrl: "Website URL",
    instagramUrl: "Instagram URL",
    facebookUrl: "Facebook URL",
    imageUrl: "Image URL",
    organizerId: "Live organizer ID",
    syncOrigin: "Sync origin",
    sourceUpdatedAt: "Source updated at",
    lastSyncedAt: "Last synced at",
    syncHash: "Sync hash",
  },
} as const;

export const NOTION_SCHEMAS = {
  event: NOTION_EVENT_SCHEMA,
  request: NOTION_REQUEST_SCHEMA,
  location: NOTION_LOCATION_SCHEMA,
  organizer: NOTION_ORGANIZER_SCHEMA,
} as const;

export function getNotionSchema(kind: NotionEntityKind) {
  switch (kind) {
    case "event":
      return NOTION_EVENT_SCHEMA;
    case "request":
      return NOTION_REQUEST_SCHEMA;
    case "location":
      return NOTION_LOCATION_SCHEMA;
    case "organizer":
      return NOTION_ORGANIZER_SCHEMA;
    default:
      return null;
  }
}
