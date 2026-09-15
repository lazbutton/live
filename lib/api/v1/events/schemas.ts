import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidSchema = z
  .string()
  .regex(UUID_PATTERN, "UUID invalide")
  .openapi({ format: "uuid" });

const isoDateOrDateTimeSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Date ISO invalide (YYYY-MM-DD ou datetime)",
  })
  .openapi({
    description: "Date calendaire UTC (YYYY-MM-DD) ou datetime ISO-8601",
    example: "2026-09-14",
  });

function parseBooleanParam(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return value;
}

function parseStringList(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parts = Array.isArray(value)
    ? value.flatMap((item) => String(item).split(","))
    : String(value).split(",");
  const cleaned = parts.map((item) => item.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

const booleanQuery = z.preprocess(
  parseBooleanParam,
  z.boolean().optional(),
);

const uuidListQuery = z.preprocess(
  parseStringList,
  z.array(uuidSchema).optional(),
);

const limitQuery = z.preprocess(
  (value) => (value === undefined || value === "" ? 50 : Number(value)),
  z.number().int().min(1).max(100),
);

export const eventViewSchema = z.enum(["summary", "full"]).openapi({
  description: "summary = relations allégées, full = relations complètes",
});

export const eventSortSchema = z.enum(["date_asc", "date_desc"]);

export const eventListQuerySchema = z
  .object({
    cityId: uuidSchema.optional().openapi({
      description: "Filtrer sur une ville",
    }),
    cityIds: uuidListQuery.openapi({
      description: "Filtrer sur plusieurs villes (CSV ou paramètre répété)",
    }),
    locationId: uuidSchema.optional().openapi({
      description: "Filtrer sur le lieu de l'événement (venue)",
    }),
    locationIds: uuidListQuery.openapi({
      description:
        "Filtrer sur plusieurs lieux (CSV ou paramètre répété). Union dans la liste, intersection avec organizerId",
    }),
    organizerId: uuidSchema.optional().openapi({
      description:
        "Filtrer sur un organisateur (table organizers ou lieu utilisé comme organisateur)",
    }),
    organizerIds: uuidListQuery.openapi({
      description:
        "Filtrer sur plusieurs organisateurs (CSV ou paramètre répété). Union dans la liste, intersection avec locationId",
    }),
    startDate: isoDateOrDateTimeSchema.optional(),
    endDate: isoDateOrDateTimeSchema.optional(),
    includeOngoing: booleanQuery.openapi({
      description:
        "Inclure les événements déjà commencés mais pas encore terminés. Défaut: true",
    }),
    category: z.string().min(1).optional().openapi({
      description: "Identifiant de catégorie",
      example: "concert",
    }),
    tagId: uuidSchema.optional(),
    search: z.string().min(1).max(120).optional().openapi({
      description: "Recherche insensible à la casse sur le titre",
    }),
    featured: booleanQuery.openapi({
      description: "Uniquement les événements à la une",
    }),
    isFull: booleanQuery.openapi({
      description: "Filtrer selon le flag complet / sold out",
    }),
    hideFromHome: booleanQuery.openapi({
      description:
        "Si omis, les deux valeurs sont renvoyées. Sinon filtre exact sur hideFromHome",
    }),
    sort: eventSortSchema.optional().openapi({
      description: "Tri par date. Défaut: date_asc",
    }),
    limit: limitQuery.openapi({
      description: "Nombre d'éléments (1-100). Défaut: 50",
    }),
    cursor: z.string().min(1).optional().openapi({
      description: "Curseur de pagination renvoyé par la page précédente",
    }),
    view: eventViewSchema.optional(),
  })
  .openapi("EventListQuery");

export const featuredEventsQuerySchema = z
  .object({
    cityId: uuidSchema.optional(),
    cityIds: uuidListQuery,
    locationId: uuidSchema.optional(),
    locationIds: uuidListQuery,
    organizerId: uuidSchema.optional(),
    organizerIds: uuidListQuery,
    limit: z.preprocess(
      (value) => (value === undefined || value === "" ? 8 : Number(value)),
      z.number().int().min(1).max(50),
    ),
    view: eventViewSchema.optional(),
  })
  .openapi("FeaturedEventsQuery");

export const eventIdParamsSchema = z
  .object({
    id: uuidSchema,
  })
  .openapi("EventIdParams");

export const submissionsQuerySchema = z
  .object({
    status: z
      .enum(["pending", "approved", "rejected", "converted", "all"])
      .optional(),
    limit: z.preprocess(
      (value) => (value === undefined || value === "" ? 50 : Number(value)),
      z.number().int().min(1).max(100),
    ),
  })
  .openapi("EventSubmissionsQuery");

const citySchema = z
  .object({
    id: uuidSchema.nullable(),
    label: z.string().nullable(),
  })
  .openapi("EventCity");

const locationSchema = z
  .object({
    id: uuidSchema.nullable(),
    name: z.string().nullable(),
    address: z.string().nullable(),
    imageUrl: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    cityId: uuidSchema.nullable(),
    city: citySchema.nullable(),
  })
  .openapi("EventLocation");

const roomSchema = z
  .object({
    id: uuidSchema.nullable(),
    name: z.string().nullable(),
    locationId: uuidSchema.nullable(),
  })
  .openapi("EventRoom");

const organizerSchema = z
  .object({
    id: uuidSchema.nullable(),
    name: z.string(),
    kind: z.enum(["organizer", "location"]),
    iconUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    instagramUrl: z.string().nullable(),
    facebookUrl: z.string().nullable(),
  })
  .openapi("EventOrganizer");

const artistSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    slug: z.string().nullable(),
    imageUrl: z.string().nullable(),
    artistTypeLabel: z.string().nullable(),
    originCity: z.string().nullable(),
    roleLabel: z.string().nullable(),
    sortIndex: z.number().int().nullable(),
    shortDescription: z.string().nullable().optional(),
    websiteUrl: z.string().nullable().optional(),
    instagramUrl: z.string().nullable().optional(),
    soundcloudUrl: z.string().nullable().optional(),
    deezerUrl: z.string().nullable().optional(),
    tagIds: z.array(uuidSchema).optional(),
  })
  .openapi("EventArtist");

export const publicEventSchema = z
  .object({
    id: uuidSchema.openapi({ example: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }),
    title: z.string(),
    description: z.string().nullable(),
    date: z.string().openapi({ format: "date-time" }),
    endDate: z.string().nullable().openapi({ format: "date-time" }),
    endTime: z.string().nullable(),
    doorOpeningTime: z.string().nullable(),
    category: z.string().nullable(),
    imageUrl: z.string().nullable(),
    price: z.number().nullable(),
    priceMin: z.number().nullable(),
    priceMax: z.number().nullable(),
    isPayWhatYouWant: z.boolean(),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    capacity: z.number().int().nullable(),
    isFull: z.boolean(),
    isFeatured: z.boolean(),
    hideFromHome: z.boolean(),
    cityId: uuidSchema.nullable(),
    city: citySchema.nullable(),
    locationId: uuidSchema.nullable(),
    location: locationSchema.nullable(),
    room: roomSchema.nullable(),
    tagIds: z.array(uuidSchema),
    externalUrl: z.string().nullable(),
    externalUrlLabel: z.string().nullable(),
    instagramUrl: z.string().nullable(),
    facebookUrl: z.string().nullable(),
    organizers: z.array(organizerSchema),
    artists: z.array(artistSchema),
    communitySubmission: z.boolean(),
    communityAttributionOptIn: z.boolean(),
    communityContributorLabel: z.string().nullable(),
    createdAt: z.string().nullable().openapi({ format: "date-time" }),
    updatedAt: z.string().nullable().openapi({ format: "date-time" }),
  })
  .openapi("Event");

export const paginationSchema = z
  .object({
    limit: z.number().int(),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .openapi("EventPagination");

export const eventListResponseSchema = z
  .object({
    data: z.array(publicEventSchema),
    pagination: paginationSchema,
  })
  .openapi("EventListResponse");

export const eventItemResponseSchema = z
  .object({
    data: publicEventSchema,
  })
  .openapi("EventItemResponse");

export const createEventBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).optional().nullable(),
    date: isoDateOrDateTimeSchema,
    locationId: uuidSchema.optional().nullable(),
    locationName: z.string().trim().max(200).optional().nullable(),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    category: z.string().trim().min(1).max(80),
    price: z.number().nonnegative().optional().nullable(),
    address: z.string().trim().max(300).optional().nullable(),
    capacity: z.number().int().nonnegative().optional().nullable(),
    doorOpeningTime: z.string().trim().max(32).optional().nullable(),
    endTime: z.string().trim().max(32).optional().nullable(),
    endDate: isoDateOrDateTimeSchema.optional().nullable(),
    tagIds: z.array(uuidSchema).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).optional(),
    externalUrl: z.string().trim().max(2000).optional().nullable(),
    organizerNames: z.array(z.string().trim().min(1).max(120)).optional(),
    contributorDisplayName: z.string().trim().max(120).optional().nullable(),
    communityAttributionOptIn: z.boolean().optional(),
  })
  .openapi("CreateEventBody");

export const createEventFromUrlBodySchema = z
  .object({
    locationId: uuidSchema.optional().nullable(),
    locationName: z.string().trim().min(1).max(200),
    sourceUrl: z.string().trim().url(),
    contributorDisplayName: z.string().trim().max(120).optional().nullable(),
    communityAttributionOptIn: z.boolean().optional(),
  })
  .openapi("CreateEventFromUrlBody");

export const eventSubmissionSchema = z
  .object({
    id: uuidSchema,
    requestType: z.enum(["event_creation", "event_from_url"]),
    status: z.enum(["pending", "approved", "rejected", "converted"]),
    title: z.string().nullable(),
    eventData: z.record(z.string(), z.unknown()).nullable(),
    locationId: uuidSchema.nullable(),
    locationName: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    convertedEventId: uuidSchema.nullable(),
    contributorDisplayName: z.string().nullable(),
    communityAttributionOptIn: z.boolean(),
    moderationReason: z.string().nullable(),
    contributorMessage: z.string().nullable(),
    allowUserResubmission: z.boolean(),
    requestedAt: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    createdAt: z.string().nullable(),
  })
  .openapi("EventSubmission");

export const eventSubmissionListResponseSchema = z
  .object({
    data: z.array(eventSubmissionSchema),
  })
  .openapi("EventSubmissionListResponse");

export const createEventResponseSchema = z
  .object({
    data: z.object({
      id: uuidSchema,
      status: z.literal("pending"),
      requestType: z.enum(["event_creation", "event_from_url"]),
      message: z.string(),
    }),
  })
  .openapi("CreateEventResponse");

export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "validation_error",
        "unauthorized",
        "forbidden",
        "not_found",
        "conflict",
        "payload_too_large",
        "unprocessable_entity",
        "internal_error",
      ]),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi("ApiError");

export const extractFromImageBodySchema = z
  .object({
    image: z.string().optional().openapi({
      format: "binary",
      description: "Fichier image (affiche / flyer)",
    }),
    imageUrl: z.string().url().optional().openapi({
      description: "URL publique d'une image à analyser",
    }),
  })
  .openapi("ExtractEventFromImageBody");

export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type FeaturedEventsQuery = z.infer<typeof featuredEventsQuerySchema>;
export type PublicEvent = z.infer<typeof publicEventSchema>;
export type CreateEventBody = z.infer<typeof createEventBodySchema>;
export type CreateEventFromUrlBody = z.infer<typeof createEventFromUrlBodySchema>;
export type EventSubmission = z.infer<typeof eventSubmissionSchema>;
