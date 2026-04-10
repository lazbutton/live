import { isValid, parse } from "date-fns";
import { fr } from "date-fns/locale";
import OpenAI from "openai";

import { getZonedDateParts, zonedTimeToUtc } from "@/lib/cron-timezone";
import type {
  ImportedEventPayload,
  ImportedEventWarning,
} from "@/lib/events/imported-event-payload";

const DATE_PATTERNS_WITH_YEAR = [
  "d/M/yyyy HH:mm",
  "d/M/yyyy H:mm",
  "d-M-yyyy HH:mm",
  "d-M-yyyy H:mm",
  "d.M.yyyy HH:mm",
  "d.M.yyyy H:mm",
  "d/M/yyyy",
  "d-M-yyyy",
  "d.M.yyyy",
  "d MMMM yyyy HH:mm",
  "d MMMM yyyy H:mm",
  "d MMM yyyy HH:mm",
  "d MMM yyyy H:mm",
  "d MMMM yyyy",
  "d MMM yyyy",
  "EEEE d MMMM yyyy HH:mm",
  "EEEE d MMMM yyyy H:mm",
  "EEEE d MMM yyyy HH:mm",
  "EEEE d MMM yyyy H:mm",
  "EEEE d MMMM yyyy",
  "EEEE d MMM yyyy",
  "EEE d MMMM yyyy HH:mm",
  "EEE d MMMM yyyy H:mm",
  "EEE d MMM yyyy HH:mm",
  "EEE d MMM yyyy H:mm",
  "EEE d MMMM yyyy",
  "EEE d MMM yyyy",
];

const DATE_PATTERNS_WITHOUT_YEAR = [
  "d/M HH:mm",
  "d/M H:mm",
  "d-M HH:mm",
  "d-M H:mm",
  "d.M HH:mm",
  "d.M H:mm",
  "d/M",
  "d-M",
  "d.M",
  "d MMMM HH:mm",
  "d MMMM H:mm",
  "d MMM HH:mm",
  "d MMM H:mm",
  "d MMMM",
  "d MMM",
  "EEEE d MMMM HH:mm",
  "EEEE d MMMM H:mm",
  "EEEE d MMM HH:mm",
  "EEEE d MMM H:mm",
  "EEEE d MMMM",
  "EEEE d MMM",
  "EEE d MMMM HH:mm",
  "EEE d MMMM H:mm",
  "EEE d MMM HH:mm",
  "EEE d MMM H:mm",
  "EEE d MMMM",
  "EEE d MMM",
];

function sanitizeScrapedDateValue(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+[•–-]\s+/g, " ")
    .replace(/\s+à\s+/gi, " ")
    .replace(/\b([a-zàâçéèêëîïôûùüÿœæ]{3,})\./giu, "$1")
    .replace(/(\d{1,2})\s*h\s*(\d{2})/gi, "$1:$2")
    .replace(/(\d{1,2})\s*h\b/gi, "$1:00");
}

function hasExplicitYear(value: string) {
  return /\b(19|20)\d{2}\b/.test(value);
}

function parseScrapedDateValue(value: string, referenceDate: Date) {
  const patterns = hasExplicitYear(value)
    ? DATE_PATTERNS_WITH_YEAR
    : DATE_PATTERNS_WITHOUT_YEAR;

  for (const pattern of patterns) {
    const parsed = parse(value, pattern, referenceDate, { locale: fr });
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeScrapedDate(value: string | undefined, scrapedAt: Date) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed;
  }

  const cleaned = sanitizeScrapedDateValue(trimmed);
  const scrapedParts = getZonedDateParts(scrapedAt);
  const referenceDate = new Date(
    Date.UTC(
      scrapedParts.year,
      scrapedParts.month - 1,
      scrapedParts.day,
      0,
      0,
      0,
    ),
  );
  const parsed = parseScrapedDateValue(cleaned, referenceDate);

  if (!parsed) {
    return trimmed;
  }

  const utcDate = zonedTimeToUtc({
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
    hour: parsed.getHours(),
    minute: parsed.getMinutes(),
    second: parsed.getSeconds(),
  });

  return utcDate.toISOString();
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

  if (typeof normalized.door_opening_time === "string") {
    normalized.door_opening_time = normalized.door_opening_time.trim();
  }

  normalized.date = normalizeScrapedDate(
    typeof normalized.date === "string" ? normalized.date : undefined,
    scrapedAt,
  );
  normalized.end_date = normalizeScrapedDate(
    typeof normalized.end_date === "string" ? normalized.end_date : undefined,
    scrapedAt,
  );

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
    if (!imageFile.type.startsWith("image/")) {
      return {
        ok: false as const,
        error: "Le fichier fourni n'est pas une image.",
        status: 400,
      };
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());
    return {
      ok: true as const,
      dataUrl: `data:${imageFile.type || "image/jpeg"};base64,${buffer.toString("base64")}`,
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

Contraintes:
- title: nom principal de l'evenement.
- description: resume utile et structure a partir du texte visible, sans halluciner.
- date et end_date: format ISO 8601 complet si possible.
- si une date n'affiche pas l'annee, utilise ${scrapedYear}.
- category: une seule categorie parmi musique, theatre, danse, sport, conference, exposition, festival, concert, spectacle, atelier, autre.
- price, presale_price, subscriber_price: valeurs numeriques seulement.
- capacity: nombre uniquement si explicitement visible.
- door_opening_time: format HH:mm.
- is_full: true uniquement si l'image indique explicitement complet, sold out ou equivalent.
- tags: 3 a 8 tags utiles en minuscules si possible.
- image_url: renseigne-la uniquement si tu vois une URL d'image publique ou si elle est deja evidente. Sinon laisse ce champ vide.

Retourne uniquement du JSON valide, sans texte avant ou apres.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
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
    temperature: 0.2,
    max_completion_tokens: 2500,
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
