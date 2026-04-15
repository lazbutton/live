import OpenAI from "openai";
import { isFacebookEventUrl } from "./event-url";
import { getZonedDateParts } from "@/lib/cron-timezone";

export interface FacebookScrapedEventData {
  title?: string;
  description?: string;
  date?: string;
  end_date?: string;
  category?: string;
  tags?: string[];
  external_url?: string;
  external_url_label?: string;
  scraping_url?: string;
  image_url?: string;
  location?: string;
  address?: string;
  organizer?: string;
  facebook_url?: string;
}

function toFloatingParisIsoString(timestamp?: number | null) {
  if (!timestamp) {
    return undefined;
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const parts = getZonedDateParts(date, "Europe/Paris");
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hours = String(parts.hour).padStart(2, "0");
  const minutes = String(parts.minute).padStart(2, "0");
  const seconds = String(parts.second).padStart(2, "0");

  // Le back-office manipule les dates d'événements comme des heures "murales"
  // (sans conversion de timezone à l'affichage). On sérialise donc ici l'heure
  // Europe/Paris avec les mêmes chiffres dans l'ISO, afin d'éviter le décalage
  // constaté lors de l'import Facebook.
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
}

function compactText(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : undefined;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => compactText(value)).filter(Boolean))] as string[];
}

function normalizeTag(value?: string | null) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/\s+/g, " ");

  return normalized ? normalized : undefined;
}

function uniqueTags(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => normalizeTag(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 8);
}

async function enrichFacebookTagsWithAI({
  title,
  description,
  categories,
  organizerNames,
  locationName,
  address,
  sourceUrl,
}: {
  title?: string;
  description?: string;
  categories: string[];
  organizerNames: string[];
  locationName?: string;
  address?: string;
  sourceUrl: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      tags: uniqueTags(categories),
      aiProcessed: false,
    };
  }

  const context = {
    title: compactText(title),
    description: compactText(description)?.slice(0, 2500),
    categories,
    organizers: organizerNames,
    location: compactText(locationName),
    address: compactText(address),
    sourceUrl,
  };

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Tu aides a enrichir des evenements Facebook avec des tags editoriaux. Tu retournes uniquement du JSON valide.",
        },
        {
          role: "user",
          content: `Genere 3 a 6 tags editoriaux courts et utiles pour un evenement.

Contraintes:
- Retourne uniquement un JSON de la forme {"tags":["tag1","tag2"]}.
- Tags en francais, en minuscules.
- Tags courts, concrets, exploitables en back-office.
- Evite les doublons, les hashtags et les phrases longues.
- Tu peux completer les categories existantes, pas seulement les repeter.
- N'invente pas des informations absentes.

Contexte evenement:
${JSON.stringify(context, null, 2)}`,
        },
      ],
      temperature: 0.3,
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let aiTags: string[] = [];

    try {
      let cleanResponse = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanResponse) as { tags?: unknown };
      if (Array.isArray(parsed.tags)) {
        aiTags = parsed.tags.map((tag) => String(tag));
      }
    } catch {
      aiTags = [];
    }

    return {
      tags: uniqueTags([...categories, ...aiTags]),
      aiProcessed: true,
    };
  } catch (error) {
    console.error("Erreur enrichissement IA tags Facebook:", error);
    return {
      tags: uniqueTags(categories),
      aiProcessed: false,
    };
  }
}

export async function scrapeFacebookEvent(url: string) {
  if (!isFacebookEventUrl(url)) {
    return {
      ok: false as const,
      error:
        "L'URL doit pointer vers un événement Facebook public valide.",
      status: 400,
    };
  }

  try {
    const { scrapeFbEvent } = await import("facebook-event-scraper");
    const event = await scrapeFbEvent(url);

    const categories = uniqueStrings(event.categories.map((category) => category.label));
    const organizerNames = uniqueStrings(event.hosts.map((host) => host.name));
    const locationName = compactText(event.location?.name);
    const locationAddress = compactText(event.location?.address);
    const cityName = compactText(event.location?.city?.name);
    const address = uniqueStrings([locationAddress, cityName]).join(", ") || undefined;
    const imageUrl = compactText(
      event.photo?.imageUri || event.photo?.url || event.photos[0]?.imageUri || event.photos[0]?.url,
    );
    const sourceUrl = compactText(event.url) || url;
    const ticketUrl = compactText(event.ticketUrl);
    const facebookHostUrl = compactText(event.hosts.find((host) => host.type === "Page")?.url);
    const aiTagsResult = await enrichFacebookTagsWithAI({
      title: event.name,
      description: event.description,
      categories,
      organizerNames,
      locationName,
      address,
      sourceUrl,
    });

    const data: FacebookScrapedEventData = {
      title: compactText(event.name),
      description: compactText(event.description),
      date: toFloatingParisIsoString(event.startTimestamp),
      end_date: toFloatingParisIsoString(event.endTimestamp),
      category: categories[0],
      tags: aiTagsResult.tags.length > 0 ? aiTagsResult.tags : undefined,
      external_url: ticketUrl || sourceUrl,
      external_url_label: ticketUrl ? "Billetterie" : "Voir sur Facebook",
      scraping_url: sourceUrl,
      image_url: imageUrl,
      location: locationName,
      address,
      organizer: organizerNames.length > 0 ? organizerNames.join(", ") : undefined,
      facebook_url: facebookHostUrl,
    };

    return {
      ok: true as const,
      data,
      metadata: {
        provider: "facebook-event-scraper",
        facebookEventId: event.id,
        sourceUrl,
        isOnline: event.isOnline,
        isCanceled: event.isCanceled,
        categories,
        tags: aiTagsResult.tags,
        aiProcessed: aiTagsResult.aiProcessed,
        siblingEventsCount: event.siblingEvents.length,
      },
    };
  } catch (error) {
    console.error("Erreur lors du scraping Facebook:", error);

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Impossible d'importer cet événement Facebook.",
      status: 500,
    };
  }
}
