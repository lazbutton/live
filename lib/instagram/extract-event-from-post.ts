import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import OpenAI from "openai";

import type { ImportedEventPayload } from "@/lib/events/imported-event-payload";

const execFileAsync = promisify(execFile);

type InstagramInstaloaderRaw = {
  shortcode?: string;
  caption?: string;
  caption_first_line?: string;
  owner_username?: string | null;
  owner_full_name?: string | null;
  taken_at_utc?: string | null;
  is_video?: boolean;
  typename?: string;
  likes?: number;
  comments?: number;
  location_name?: string | null;
  location_slug?: string | null;
  hashtags?: string[];
  mentions?: string[];
  image_urls?: string[];
  video_urls?: string[];
  external_url?: string;
};

type ExtractResult =
  | {
      ok: true;
      data: ImportedEventPayload;
      metadata: Record<string, unknown>;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function buildBasePayloadFromInstagram(
  url: string,
  raw: InstagramInstaloaderRaw,
): ImportedEventPayload {
  const caption = normalizeString(raw.caption);
  const firstLine = normalizeString(raw.caption_first_line);
  const imageUrls = normalizeStringArray(raw.image_urls);
  const hashtags = normalizeStringArray(raw.hashtags).map((tag) =>
    tag.replace(/^#/, "").toLowerCase(),
  );
  const ownerUsername = normalizeString(raw.owner_username);
  const locationName = normalizeString(raw.location_name);

  return {
    title: firstLine || undefined,
    description: caption || undefined,
    date: normalizeString(raw.taken_at_utc) || undefined,
    location: locationName || undefined,
    organizer: ownerUsername || undefined,
    image_url: imageUrls[0] || undefined,
    external_url: url,
    tags: hashtags.length > 0 ? hashtags : undefined,
  };
}

async function runInstaloader(url: string) {
  const localPythonPath = path.join(
    process.cwd(),
    ".venv",
    "bin",
    "python",
  );
  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "instagram_extract_instaloader.py",
  );

  let stdout = "";
  let lastError: unknown = null;
  for (const pythonBin of [localPythonPath, "python3"]) {
    try {
      const result = await execFileAsync(pythonBin, [scriptPath, url], {
        timeout: 25_000,
        maxBuffer: 1024 * 1024 * 4,
      });
      stdout = result.stdout;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!stdout) {
    throw new Error(
      lastError instanceof Error
        ? lastError.message
        : "Impossible d'exécuter Instaloader.",
    );
  }

  const parsed = JSON.parse(stdout || "{}") as {
    ok?: boolean;
    error?: string;
    code?: string;
    data?: InstagramInstaloaderRaw;
  };

  if (!parsed.ok || !parsed.data) {
    throw new Error(parsed.error || "Extraction Instagram impossible.");
  }

  return parsed.data;
}

async function enrichWithOpenAI(
  url: string,
  raw: InstagramInstaloaderRaw,
  basePayload: ImportedEventPayload,
) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return basePayload;
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_completion_tokens: 1800,
    messages: [
      {
        role: "system",
        content:
          "Tu extrais des informations d'evenement depuis un post Instagram. Retourne uniquement un JSON valide.",
      },
      {
        role: "user",
        content: `Analyse ce post Instagram et retourne seulement les champs utiles pour pre-remplir un evenement.

URL: ${url}
Donnees brutes:
${JSON.stringify(raw, null, 2)}

Retourne un JSON avec des champs eventuels parmi:
title, description, date, end_date, category, price, location, address, organizer, image_url, external_url, instagram_url, tags

Regles:
- N'invente rien.
- Si l'info manque, n'ajoute pas le champ.
- date/end_date doivent etre en ISO si possible.
- Garde le francais pour le texte si tu reformules.
`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "{}";
  const aiPayload = JSON.parse(content) as ImportedEventPayload;
  return {
    ...basePayload,
    ...aiPayload,
    external_url: basePayload.external_url,
    image_url: normalizeString(aiPayload.image_url) || basePayload.image_url,
    instagram_url:
      normalizeString(aiPayload.instagram_url) || basePayload.external_url,
  } satisfies ImportedEventPayload;
}

export async function extractEventFromInstagramPost(
  url: string,
): Promise<ExtractResult> {
  try {
    const raw = await runInstaloader(url);
    const basePayload = buildBasePayloadFromInstagram(url, raw);
    const enrichedPayload = await enrichWithOpenAI(url, raw, basePayload);

    return {
      ok: true,
      data: enrichedPayload,
      metadata: {
        source: "instagram_post",
        extractor: "instaloader",
        shortcode: normalizeString(raw.shortcode) || null,
        owner_username: normalizeString(raw.owner_username) || null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 422,
      error:
        error instanceof Error
          ? error.message
          : "Impossible d'extraire le post Instagram.",
    };
  }
}
