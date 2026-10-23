import OpenAI from "openai";

import { AI_MODEL_FULL, generationParams } from "@/lib/ai/openai-models";

import { getZonedDateParts } from "@/lib/cron-timezone";
import type {
  ImportedEventPayload,
  ImportedEventWarning,
} from "@/lib/events/imported-event-payload";
import { toParisWallClock } from "@/lib/scraping/dates";

/** Date ISO suivie d'un fuseau (`Z`, `+02:00`, `+0200`, `+02`) : la date sans le fuseau. */
const ISO_DATE_WITH_TIMEZONE =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(?:Z|[+-]\d{2}(?::?\d{2})?)$/i;

/**
 * Date lue sur l'affiche, rendue en heure murale de Paris sans fuseau (`2026-10-24T20:30:00`) :
 * le format de `events.date` et des dates que l'app envoie (docs/API_APP.md, conventions).
 * Une affiche ne porte pas de fuseau : celui que l'IA ajoute à une date ISO (`Z`, `+02:00`, ou
 * `+01:00` à tort en été) est ignoré, l'heure écrite est gardée. Texte en toutes lettres
 * (« samedi 24 octobre 20h30 ») : lu par `toParisWallClock`, comme au scraping. Texte illisible :
 * renvoyé tel quel.
 */
function normalizePosterDate(
  value: unknown,
  referenceDate: Date,
): { value: string; timeKnown?: boolean } | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const wallClock = toParisWallClock(
    trimmed.replace(ISO_DATE_WITH_TIMEZONE, "$1"),
    referenceDate,
  );
  return wallClock ?? { value: trimmed };
}

function normalizeExtractedPayload(
  payload: ImportedEventPayload,
  scrapedAt: Date,
): ImportedEventPayload {
  const normalized: ImportedEventPayload = { ...payload };

  if (normalized.title) {
    normalized.title = normalized.title.trim().replace(/\s+/g, " ");
  }

  if (normalized.description) {
    normalized.description = normalized.description
      .trim()
      .replace(/\n{3,}/g, "\n\n");
  }

  if (normalized.location) {
    normalized.location = normalized.location.trim();
  }

  if (normalized.address) {
    normalized.address = normalized.address.trim();
  }

  if (normalized.organizer) {
    normalized.organizer = normalized.organizer.trim();
  }

  if (normalized.category) {
    normalized.category = normalized.category.trim();
  }

  if (Array.isArray(normalized.tags)) {
    normalized.tags = [
      ...new Set(
        normalized.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  if (typeof normalized.festival_name === "string") {
    normalized.festival_name = normalized.festival_name.trim() || undefined;
  }

  if (Array.isArray(normalized.festival_venues)) {
    const venues = [
      ...new Set(
        normalized.festival_venues
          .map((venue) => (typeof venue === "string" ? venue.trim() : ""))
          .filter(Boolean),
      ),
    ];
    normalized.festival_venues = venues.length ? venues : undefined;
  }

  if (typeof normalized.door_opening_time === "string") {
    normalized.door_opening_time = normalized.door_opening_time.trim();
  }

  // Année manquante : celle du jour à Paris.
  const scrapedParts = getZonedDateParts(scrapedAt);
  const referenceDate = new Date(
    Date.UTC(scrapedParts.year, scrapedParts.month - 1, scrapedParts.day),
  );
  const start = normalizePosterDate(normalized.date, referenceDate);
  normalized.date = start?.value;
  normalized.end_date = normalizePosterDate(
    normalized.end_date,
    referenceDate,
  )?.value;
  // Seule la date est écrite : l'heure (00:00) est à vérifier.
  if (start?.timeKnown === false) {
    normalized.time_known = false;
  }

  return normalized;
}

function countMeaningfulFields(payload: ImportedEventPayload) {
  const keys: Array<keyof ImportedEventPayload> = [
    "title",
    "description",
    "date",
    "end_date",
    "location",
    "address",
    "organizer",
    "category",
    "price",
    "external_url",
  ];

  return keys.reduce<number>((count, key) => {
    const value = payload[key];
    if (typeof value === "string") {
      return value.trim() ? count + 1 : count;
    }

    return value != null ? count + 1 : count;
  }, 0);
}

async function buildImageDataUrl({
  imageFile,
  imageUrl,
}: {
  imageFile?: File | null;
  imageUrl?: string | null;
}) {
  if (imageFile) {
    const fileName = imageFile.name?.trim().toLowerCase() || "";
    const extension = fileName.includes(".") ? fileName.split(".").pop() || "" : "";
    const inferredMimeType =
      imageFile.type ||
      (extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : extension === "png"
          ? "image/png"
          : extension === "webp"
            ? "image/webp"
            : extension === "gif"
              ? "image/gif"
              : extension === "heic" || extension === "heif"
                ? "image/jpeg"
                : "");

    if (!inferredMimeType.startsWith("image/")) {
      return {
        ok: false as const,
        error: "Le fichier fourni n'est pas une image.",
        status: 400,
      };
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());
    return {
      ok: true as const,
      dataUrl: `data:${inferredMimeType};base64,${buffer.toString("base64")}`,
      sourceImageUrl: imageUrl || undefined,
    };
  }

  const rawUrl = (imageUrl || "").trim();
  if (!rawUrl) {
    return {
      ok: false as const,
      error: "Aucune image fournie.",
      status: 400,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return {
      ok: false as const,
      error: "URL d'image invalide.",
      status: 400,
    };
  }

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      Accept: "image/*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    return {
      ok: false as const,
      error: `Impossible de charger l'image: ${response.status} ${response.statusText}`,
      status: response.status,
    };
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    return {
      ok: false as const,
      error: "L'URL fournie ne renvoie pas une image exploitable.",
      status: 400,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: true as const,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    sourceImageUrl: rawUrl,
  };
}

export async function extractEventFromImage({
  imageFile,
  imageUrl,
}: {
  imageFile?: File | null;
  imageUrl?: string | null;
}) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      ok: false as const,
      error: "OPENAI_API_KEY est absent. Impossible d'analyser l'image.",
      status: 500,
    };
  }

  const image = await buildImageDataUrl({ imageFile, imageUrl });
  if (!image.ok) {
    return image;
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });
  const scrapedAt = new Date();
  const scrapedYear = getZonedDateParts(scrapedAt).year;

  const prompt = `Tu analyses une affiche, un flyer ou un visuel d'evenement. Lis toute l'image avec attention, y compris les petits textes, les horaires, les liens, les prix et les mentions secondaires.

Extrais uniquement les informations vraiment visibles ou raisonnablement deduites depuis l'image. N'invente rien.

Retourne un JSON avec seulement les champs utiles parmi:
- title
- description
- date
- end_date
- category
- price
- presale_price
- subscriber_price
- capacity
- door_opening_time
- external_url
- external_url_label
- image_url
- is_full
- location
- address
- organizer
- instagram_url
- facebook_url
- tags
- festival_name
- festival_venues

Contraintes:
- title: nom principal de l'evenement.
- description: resume utile et structure a partir du texte visible, sans halluciner.
- date et end_date: date et heure ecrites sur l'affiche (heure de Paris), format YYYY-MM-DDTHH:mm, sans fuseau (ni Z ni decalage) ; YYYY-MM-DD seul si l'heure n'est pas indiquee.
- si une date n'affiche pas l'annee, utilise ${scrapedYear}.
- category: une seule categorie parmi musique, theatre, danse, sport, conference, exposition, festival, concert, spectacle, atelier, autre.
- price, presale_price, subscriber_price: valeurs numeriques seulement.
- capacity: nombre uniquement si explicitement visible.
- door_opening_time: format HH:mm.
- is_full: true uniquement si l'image indique explicitement complet, sold out ou equivalent.
- tags: 3 a 8 tags utiles en minuscules si possible.
- festival_name: nom du festival dont l'evenement fait partie, seulement si l'affiche le dit (« dans le cadre du festival X », « Festival X - soiree Y »), sans numero d'edition ni annee. Vide pour l'affiche d'un festival entier, ou quand un festival est seulement cite (un prix recu a Cannes).
- festival_venues: affiche d'un festival entier seulement : les lieux ou il se tient, tels qu'ecrits, un par element (« Dropkick », « Le 108 », « L'Astrolabe »).
- image_url: renseigne-la uniquement si tu vois une URL d'image publique ou si elle est deja evidente. Sinon laisse ce champ vide.

Retourne uniquement du JSON valide, sans texte avant ou apres.`;

  const completion = await openai.chat.completions.create({
    model: AI_MODEL_FULL,
    messages: [
      {
        role: "system",
        content:
          "Tu es un expert en extraction structuree d'informations d'evenements a partir d'images. Tu lis toute l'image et tu retournes toujours un JSON valide, concis et fiable.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: image.dataUrl,
              detail: "high",
            },
          },
        ],
      },
    ],
    ...generationParams(AI_MODEL_FULL, { temperature: 0.2, maxTokens: 2500 }),
    response_format: { type: "json_object" },
  });

  const aiResponse = completion.choices[0]?.message?.content || "{}";

  let extractedData: ImportedEventPayload = {};
  try {
    let cleanResponse = aiResponse
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[0];
    }

    extractedData = JSON.parse(cleanResponse) as ImportedEventPayload;
  } catch {
    return {
      ok: false as const,
      error: "La reponse de l'analyse image n'est pas exploitable.",
      status: 502,
    };
  }

  const normalizedData = normalizeExtractedPayload(extractedData, scrapedAt);
  if (!normalizedData.image_url && image.sourceImageUrl) {
    normalizedData.image_url = image.sourceImageUrl;
  }

  const warnings: ImportedEventWarning[] = [];

  if (!normalizedData.title) {
    warnings.push({
      field: "title",
      message: "Le titre n'a pas pu etre determine avec certitude.",
    });
  }

  if (!normalizedData.date) {
    warnings.push({
      field: "date",
      message: "La date de debut n'a pas pu etre determinee avec certitude.",
    });
  }

  if (!normalizedData.location) {
    warnings.push({
      field: "location",
      message: "Le lieu n'a pas pu etre determine avec certitude.",
    });
  }

  if (countMeaningfulFields(normalizedData) < 2) {
    return {
      ok: false as const,
      error:
        "L'image ne contient pas assez d'informations lisibles pour pre-remplir automatiquement l'evenement.",
      status: 422,
      warnings,
    };
  }

  return {
    ok: true as const,
    data: normalizedData,
    metadata: {
      ai_processed: true,
      source: "image",
      source_image_url: image.sourceImageUrl || null,
    },
    warnings,
  };
}
