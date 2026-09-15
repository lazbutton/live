import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

import { getSiteUrl } from "@/lib/metadata";

import {
  apiErrorSchema,
  createEventBodySchema,
  createEventFromUrlBodySchema,
  createEventResponseSchema,
  eventIdParamsSchema,
  eventItemResponseSchema,
  eventListQuerySchema,
  eventListResponseSchema,
  extractFromImageBodySchema,
  featuredEventsQuerySchema,
  publicEventSchema,
  eventSubmissionListResponseSchema,
  submissionsQuerySchema,
} from "./events/schemas";

const registry = new OpenAPIRegistry();

registry.register("Event", publicEventSchema);
registry.register("EventListResponse", eventListResponseSchema);
registry.register("EventItemResponse", eventItemResponseSchema);
registry.register("CreateEventBody", createEventBodySchema);
registry.register("CreateEventFromUrlBody", createEventFromUrlBodySchema);
registry.register("CreateEventResponse", createEventResponseSchema);
registry.register("EventSubmissionListResponse", eventSubmissionListResponseSchema);
registry.register("ApiError", apiErrorSchema);

registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description:
    "Access token Supabase. Header `Authorization: Bearer <access_token>`. Compte non anonyme, CGU UGC acceptées.",
});

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: apiErrorSchema,
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events",
  tags: ["Events"],
  summary: "Lister les événements publics",
  description:
    "Retourne uniquement les événements `approved`, non archivés et non masqués pour sécurité. Pagination par curseur (`date|id`). Par défaut: aujourd'hui → +13 jours, événements en cours inclus. `locationId` filtre le lieu (venue). `organizerId` filtre via `event_organizers` (organisateur ou lieu-organisateur). Les deux ensemble s'intersectent.",
  request: {
    query: eventListQuerySchema,
  },
  responses: {
    200: {
      description: "Liste paginée d'événements",
      content: {
        "application/json": {
          schema: eventListResponseSchema,
        },
      },
    },
    400: errorResponse("Paramètres de requête invalides"),
    500: errorResponse("Erreur serveur"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/featured",
  tags: ["Events"],
  summary: "Lister les événements à la une",
  description:
    "Événements `isFeatured=true`, à venir ou encore en cours, triés par date croissante.",
  request: {
    query: featuredEventsQuerySchema,
  },
  responses: {
    200: {
      description: "Liste des événements à la une",
      content: {
        "application/json": {
          schema: eventListResponseSchema,
        },
      },
    },
    400: errorResponse("Paramètres de requête invalides"),
    500: errorResponse("Erreur serveur"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/{id}",
  tags: ["Events"],
  summary: "Détail d'un événement public",
  description:
    "404 si l'événement n'est pas approuvé, est archivé, ou n'existe pas.",
  request: {
    params: eventIdParamsSchema,
  },
  responses: {
    200: {
      description: "Événement",
      content: {
        "application/json": {
          schema: eventItemResponseSchema,
        },
      },
    },
    400: errorResponse("Identifiant invalide"),
    404: errorResponse("Événement introuvable"),
    500: errorResponse("Erreur serveur"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/submissions",
  tags: ["Events"],
  summary: "Lister mes demandes d'événements",
  description:
    "Demandes `event_creation` et `event_from_url` de l'utilisateur authentifié.",
  security: [{ BearerAuth: [] }],
  request: {
    query: submissionsQuerySchema,
  },
  responses: {
    200: {
      description: "Demandes de l'utilisateur",
      content: {
        "application/json": {
          schema: eventSubmissionListResponseSchema,
        },
      },
    },
    400: errorResponse("Paramètres invalides"),
    401: errorResponse("Token manquant ou invalide"),
    403: errorResponse("Compte anonyme, suspendu, ou CGU non acceptées"),
    500: errorResponse("Erreur serveur"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/events",
  tags: ["Events"],
  summary: "Soumettre un événement à modération",
  description:
    "Crée une demande `user_requests` de type `event_creation` en statut `pending`. L'événement n'est pas publié immédiatement.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createEventBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Demande créée",
      content: {
        "application/json": {
          schema: createEventResponseSchema,
        },
      },
    },
    400: errorResponse("Payload invalide"),
    401: errorResponse("Token manquant ou invalide"),
    403: errorResponse("Compte anonyme, suspendu, ou CGU non acceptées"),
    500: errorResponse("Erreur serveur"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/events/from-url",
  tags: ["Events"],
  summary: "Soumettre un événement depuis une URL",
  description:
    "Crée une demande `user_requests` de type `event_from_url` en statut `pending`.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: createEventFromUrlBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Demande créée",
      content: {
        "application/json": {
          schema: createEventResponseSchema,
        },
      },
    },
    400: errorResponse("Payload invalide"),
    401: errorResponse("Token manquant ou invalide"),
    403: errorResponse("Compte anonyme, suspendu, ou CGU non acceptées"),
    500: errorResponse("Erreur serveur"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/events/extract-from-image",
  tags: ["Events"],
  summary: "Extraire un brouillon d'événement depuis une image",
  description:
    "Analyse une affiche ou un flyer (fichier `image` ou `imageUrl`) et renvoie un pré-remplissage. Ne crée pas l'événement.",
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: extractFromImageBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Champs extraits de l'image",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: { type: "object", additionalProperties: true },
              metadata: { type: "object", additionalProperties: true },
              warnings: {
                type: "array",
                items: { type: "object", additionalProperties: true },
              },
            },
          },
        },
      },
    },
    400: errorResponse("Image manquante ou invalide"),
    401: errorResponse("Token manquant ou invalide"),
    403: errorResponse("Compte anonyme, suspendu, ou CGU non acceptées"),
    413: errorResponse("Image trop volumineuse"),
    422: errorResponse("Pas assez d'informations lisibles"),
    500: errorResponse("Erreur serveur"),
  },
});

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "OutLive Events API",
      version: "1.0.0",
      description:
        "API publique des événements OutLive : lecture des événements approuvés et soumission communautaire (modération).",
      contact: {
        name: "OutLive",
        url: getSiteUrl(),
      },
    },
    servers: [
      {
        url: getSiteUrl(),
        description: "Serveur courant",
      },
    ],
    tags: [
      {
        name: "Events",
        description: "Catalogue public et soumissions utilisateur",
      },
    ],
  });
}
