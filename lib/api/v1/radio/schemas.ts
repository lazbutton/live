import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { uuidSchema } from "../events/schemas";

extendZodWithOpenApi(z);

/*
 * « Ce qui passe » sur une radio : `GET /api/v1/radio/{stationId}/live`. Contrat entre live-admin et
 * l'app (`../live/docs/RADIO_CAMPUS.md`, § 4), recopié dans docs/API_APP.md, « Radio ». Une réponse
 * peut gagner un champ, jamais en perdre ni en renommer.
 */

const parisDateTime = (example: string) =>
  z.string().openapi({
    format: "date-time",
    description: "Heure de Paris étiquetée UTC, comme events.date : se lit sans conversion.",
    example,
  });

const familySchema = z.enum(["musique", "parole"]);

const showImageSchema = z.string().nullable().openapi({
  description:
    "Le visuel gardé de l'émission, carré, dans le stockage d'OutLive ; null : l'app dessine sa pochette (la charte de la radio).",
  example: null,
});

export const radioLiveStationSchema = z
  .object({
    id: uuidSchema,
    name: z.string().openapi({ example: "Radio Campus Orléans" }),
    frequency: z.string().openapi({ example: "88.3" }),
    streamUrl: z.string().openapi({ example: "https://streams.labomedia.org:8443/stream_rco" }),
    streamUrlLight: z.string().nullable().openapi({
      description: "Flux léger, s'il existe (l'app le prend en données mobiles).",
    }),
  })
  .openapi("RadioLiveStation");

export const radioLiveShowSchema = z
  .object({
    id: uuidSchema,
    name: z.string().openapi({ example: "Kawaï Campus Club" }),
    style: z.string().nullable(),
    family: familySchema,
    startsAt: parisDateTime("2026-10-23T19:00:00+00:00"),
    endsAt: parisDateTime("2026-10-23T20:00:00+00:00"),
    imageUrl: showImageSchema,
  })
  .openapi("RadioLiveShow");

export const radioLiveNextSchema = z
  .object({
    id: uuidSchema,
    name: z.string().openapi({ example: "Blockchain" }),
    style: z.string().nullable(),
    family: familySchema,
    startsAt: parisDateTime("2026-10-23T20:00:00+00:00"),
    imageUrl: showImageSchema,
  })
  .openapi("RadioLiveNext");

export const radioTrackSchema = z
  .object({
    title: z.string().openapi({ example: "To Ki Me Ki" }),
    artist: z.string().nullable().openapi({ example: "Akiko Yano" }),
  })
  .openapi("RadioTrack");

export const radioRecentTrackSchema = z
  .object({
    at: parisDateTime("2026-10-23T11:28:00+00:00"),
    title: z.string(),
    artist: z.string().nullable(),
  })
  .openapi("RadioRecentTrack");

export const radioLiveResponseSchema = z
  .object({
    station: radioLiveStationSchema,
    show: radioLiveShowSchema.nullable().openapi({
      description: "L'émission en cours selon la grille ; null entre deux émissions, ou si le serveur diffuse un morceau pendant un créneau.",
    }),
    track: radioTrackSchema.nullable().openapi({
      description: "Le morceau en cours entre deux émissions, nettoyé ; null pendant une émission, pour un jingle, ou si le serveur ne répond pas.",
    }),
    next: radioLiveNextSchema.nullable().openapi({ description: "La prochaine émission de la grille (7 jours)." }),
    recentTracks: z.array(radioRecentTrackSchema).openapi({
      description: "Entre deux émissions : les quatre morceaux d'avant, du plus récent au plus ancien (sans les jingles).",
    }),
    updatedAt: parisDateTime("2026-10-23T19:12:04+00:00"),
  })
  .openapi("RadioLiveResponse");

export const radioStationIdParamsSchema = z.object({
  stationId: uuidSchema.openapi({ description: "Id de la station (radio_stations.id)." }),
});

export type RadioLiveResponse = z.infer<typeof radioLiveResponseSchema>;
export type RadioLiveShow = z.infer<typeof radioLiveShowSchema>;
export type RadioTrack = z.infer<typeof radioTrackSchema>;
export type RadioRecentTrack = z.infer<typeof radioRecentTrackSchema>;
