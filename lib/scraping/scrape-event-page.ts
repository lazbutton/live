import * as cheerio from "cheerio";
import OpenAI from "openai";

export interface ScrapedEventData {
  title?: string;
  description?: string;
  date?: string;
  end_date?: string;
  price?: string;
  presale_price?: string;
  subscriber_price?: string;
  location?: string;
  address?: string;
  image_url?: string;
  external_url?: string;
  organizer?: string;
  category?: string;
  tags?: string[];
  capacity?: string;
  door_opening_time?: string;
  is_full?: boolean;
}

export interface ScrapeEventPageArgs {
  url: string;
  organizer_id?: string | null;
  location_id?: string | null;
  /** Supabase client (server/service) used to load scraping configs + ai fields */
  supabase: any;
}

export async function scrapeEventPage({ url, organizer_id, location_id, supabase }: ScrapeEventPageArgs) {
  // Valider l'URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return {
      ok: false as const,
      error: "URL invalide",
      status: 400,
    };
  }

  // Scraper la page web
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  if (!response.ok) {
    return {
      ok: false as const,
      error: `Impossible d'accéder à l'URL: ${response.status} ${response.statusText}`,
      status: response.status,
    };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extraire les métadonnées Open Graph et Twitter Cards
  const metadata: Record<string, string> = {};

  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr("property")?.replace("og:", "");
    const content = $(el).attr("content");
    if (property && content) metadata[property] = content;
  });

  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name")?.replace("twitter:", "");
    const content = $(el).attr("content");
    if (name && content) metadata[name] = content;
  });

  // Extraire le texte principal
  $("script, style, nav, header, footer, aside, .cookie-banner, .cookie-consent, .gdpr-banner").remove();

  const mainContentSelectors = [
    "main",
    "article",
    "[role='main']",
    ".content",
    ".main-content",
    "#content",
    ".event-details",
    ".event-info",
    ".description",
  ];

  let mainText = "";
  for (const selector of mainContentSelectors) {
    const content = $(selector).first().text();
    if (content.length > mainText.length) mainText = content;
  }

  if (!mainText || mainText.length < 200) {
    mainText = $("body").text();
  }
  mainText = mainText.replace(/\s+/g, " ").trim().substring(0, 15000);

  const structuredContent: string[] = [];
  $("p, li, h1, h2, h3, h4, .description, .event-details, .price, .date, .location").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10 && text.length < 500) structuredContent.push(text);
  });

  const title = metadata.title || $("title").text() || $("h1").first().text() || "";
  const description = metadata.description || $('meta[name="description"]').attr("content") || $("p").first().text() || "";
  const imageUrl = metadata.image || $('meta[property="og:image"]').attr("content") || $("img").first().attr("src") || "";

  let normalizedImageUrl = imageUrl;
  if (imageUrl && !imageUrl.startsWith("http")) {
    normalizedImageUrl = new URL(imageUrl, parsedUrl.origin).href;
  }

  // Charger les configurations CSS personnalisées
  let customScrapingData: Partial<ScrapedEventData> = {};
  const configOwnerId = organizer_id || location_id;
  if (configOwnerId) {
    try {
      let query = supabase.from("organizer_scraping_configs").select("*");
      if (organizer_id) query = query.eq("organizer_id", organizer_id);
      else if (location_id) query = query.eq("location_id", location_id);

      const { data: configs, error: configError } = await query;
      if (!configError && configs && configs.length > 0) {
        for (const config of configs) {
          try {
            let selector = (config.css_selector || "").trim();

            // Correction automatique attributs sans crochets (copié du route existant)
            if (!selector.match(/^[.#\[:]/) && selector.includes("=") && !selector.includes("[")) {
              const equalIndex = selector.indexOf("=");
              if (equalIndex > 0) {
                const attrName = selector.substring(0, equalIndex).trim();
                const afterEqual = selector.substring(equalIndex + 1).trim();
                let attrValue: string | null = null;
                if (afterEqual.startsWith('"')) {
                  const endQuote = afterEqual.indexOf('"', 1);
                  if (endQuote > 0) attrValue = afterEqual.substring(1, endQuote);
                } else if (afterEqual.startsWith("'")) {
                  const endQuote = afterEqual.indexOf("'", 1);
                  if (endQuote > 0) attrValue = afterEqual.substring(1, endQuote);
                }

                if (attrValue !== null) {
                  if (attrName === "class" || attrName === "className") {
                    if (attrValue.match(/[\[\]()]/)) {
                      const allClasses = attrValue.split(/\s+/).filter((c: string) => c.trim());
                      selector =
                        allClasses.length === 1
                          ? `[class*="${allClasses[0]}"]`
                          : allClasses.map((c: string) => `[class*="${c.trim()}"]`).join("");
                    } else {
                      const classes = attrValue
                        .split(/\s+/)
                        .filter((c: string) => c.trim())
                        .map((c: string) => "." + c.trim().replace(/([.#:])/g, "\\$1"))
                        .join("");
                      selector = classes || `.${attrValue.replace(/\s+/g, "-")}`;
                    }
                  } else if (attrName === "id") {
                    selector = "#" + attrValue.replace(/([\[\](){}.#:,_])/g, "\\$1");
                  } else {
                    selector = `[${attrName}="${attrValue.replace(/"/g, '\\"')}"]`;
                  }
                } else {
                  selector = `[${selector.replace(/"/g, '\\"')}]`;
                }
              } else {
                selector = `[${selector.replace(/"/g, '\\"')}]`;
              }
            }

            const elements = $(selector);
            if (elements.length > 0) {
              let extractedValue: string | null = null;
              if (config.attribute === "textContent" || !config.attribute) extractedValue = elements.first().text().trim();
              else if (config.attribute === "innerHTML") extractedValue = elements.first().html() || null;
              else extractedValue = elements.first().attr(config.attribute) || null;

              if (extractedValue) {
                if (config.text_prefix && config.text_prefix.trim() !== "") {
                  const prefix = config.text_prefix.trim();
                  const prefixIndex = extractedValue.indexOf(prefix);
                  if (prefixIndex !== -1) extractedValue = extractedValue.substring(prefixIndex + prefix.length).trim();
                  else {
                    const lowerExtracted = extractedValue.toLowerCase();
                    const lowerPrefix = prefix.toLowerCase();
                    const lowerPrefixIndex = lowerExtracted.indexOf(lowerPrefix);
                    if (lowerPrefixIndex !== -1)
                      extractedValue = extractedValue.substring(lowerPrefixIndex + prefix.length).trim();
                    else extractedValue = null;
                  }
                }

                if (extractedValue) {
                  if (config.transform_function === "price") {
                    const priceMatch = extractedValue.match(/[\d.,]+/);
                    (customScrapingData as any)[config.event_field] = (priceMatch
                      ? priceMatch[0].replace(",", ".")
                      : extractedValue) as any;
                  } else {
                    (customScrapingData as any)[config.event_field] = extractedValue as any;
                  }
                }
              }
            }
          } catch {
            // ignore a single selector failure
          }
        }
      }
    } catch {
      // ignore config load failures
    }
  }

  // Champs IA activés
  let enabledAIFields: string[] = [];
  const aiHintsMap: Record<string, string | null> = {};

  try {
    let aiFieldsQuery = supabase.from("organizer_ai_fields").select("field_name, enabled, ai_hint").eq("enabled", true);
    if (organizer_id) aiFieldsQuery = aiFieldsQuery.eq("organizer_id", organizer_id).is("location_id", null);
    else if (location_id) aiFieldsQuery = aiFieldsQuery.eq("location_id", location_id).is("organizer_id", null);

    const { data: aiFieldsData } = await aiFieldsQuery;
    if (aiFieldsData && aiFieldsData.length > 0) {
      enabledAIFields = aiFieldsData.filter((f: any) => f.enabled).map((f: any) => f.field_name);
      aiFieldsData.forEach((f: any) => {
        if (f.ai_hint) aiHintsMap[f.field_name] = f.ai_hint;
      });
    } else {
      enabledAIFields = [
        "title",
        "description",
        "date",
        "end_date",
        "price",
        "presale_price",
        "subscriber_price",
        "location",
        "address",
        "image_url",
        "organizer",
        "category",
        "tags",
        "capacity",
        "door_opening_time",
        "is_full",
      ];
    }
  } catch {
    enabledAIFields = [
      "title",
      "description",
      "date",
      "end_date",
      "price",
      "presale_price",
      "subscriber_price",
      "location",
      "address",
      "image_url",
      "organizer",
      "category",
      "tags",
      "capacity",
      "door_opening_time",
      "is_full",
    ];
  }

  const contextForAI = `
URL: ${url}
Titre de la page: ${title}
Description: ${description}
Métadonnées Open Graph et Twitter Cards: ${JSON.stringify(metadata, null, 2)}
Contenu structuré (paragraphes, listes, titres): ${structuredContent.slice(0, 50).join("\n")}
Texte principal complet: ${mainText}
${Object.keys(customScrapingData).length > 0 ? `\nDonnées extraites via sélecteurs CSS personnalisés:\n${JSON.stringify(customScrapingData, null, 2)}` : ""}
`;

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      ok: true as const,
      data: {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        image_url: normalizedImageUrl || undefined,
        external_url: url,
      } satisfies ScrapedEventData,
      metadata: { scraped: true, ai_processed: false, url },
    };
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  const fieldsToExtract = enabledAIFields
    .map((fieldName, index) => {
      const fieldLabels: Record<string, string> = {
        title: "Le titre de l'événement (doit être accrocheur mais précis)",
        description:
          "Une description riche et détaillée (3-5 phrases minimum, incluant le contexte, l'ambiance, les points forts)",
        date: "Les dates et heures de début",
        end_date: "Les dates et heures de fin",
        price: "Les informations de prix (prix normal, réduit, gratuit, sur donation, etc.)",
        presale_price: "Le tarif prévente si mentionné (prix réduit avant une date limite)",
        subscriber_price: "Le tarif pour les abonnés si mentionné",
        location: "Le lieu exact",
        address: "L'adresse complète du lieu",
        image_url: "L'URL de l'image principale de l'événement",
        organizer: "L'organisateur ou les organisateurs",
        category:
          "La catégorie principale parmi: musique, théâtre, danse, sport, conférence, exposition, festival, concert, spectacle, atelier, autre",
        tags: "Des tags pertinents et variés (minimum 3-5 tags)",
        capacity: "La capacité si mentionnée",
        door_opening_time: "L'heure d'ouverture des portes si disponible",
        is_full: "Indique si l'événement est complet (sold out) - true ou false uniquement",
      };
      const baseLabel = fieldLabels[fieldName] || fieldName;
      const customHint = aiHintsMap[fieldName];
      const finalLabel = customHint ? `${baseLabel}. Indication spécifique: ${customHint}` : baseLabel;
      return `${index + 1}. ${finalLabel}`;
    })
    .join("\n");

  const jsonFields = enabledAIFields
    .map((fieldName) => {
      const fieldDefinitions: Record<string, string> = {
        title: '"title": "Titre précis et accrocheur de l\'événement"',
        description:
          '"description": "Description complète et détaillée de l\'événement, incluant contexte, programme, artistes/intervenants, ambiance attendue. Minimum 3-5 phrases bien structurées."',
        date: '"date": "Date et heure de début au format ISO 8601 avec fuseau horaire (ex: 2024-12-25T20:00:00+01:00)"',
        end_date: '"end_date": "Date et heure de fin au format ISO 8601 (optionnel mais important si disponible)"',
        price: '"price": "Prix numérique uniquement (0 pour gratuit, nombre décimal pour prix payant)"',
        location: '"location": "Nom officiel du lieu/venue"',
        address: '"address": "Adresse postale complète (numéro, rue, code postal, ville, pays si pertinent)"',
        image_url: '"image_url": "URL complète de l\'image principale de l\'événement"',
        organizer: '"organizer": "Nom de l\'organisateur, de l\'association, du collectif ou de l\'artiste principal"',
        category:
          '"category": "Catégorie principale (musique, théâtre, danse, sport, conférence, exposition, festival, concert, spectacle, atelier, autre)"',
        tags: '"tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]',
        capacity: '"capacity": "Capacité maximale en nombre (uniquement le chiffre)"',
        door_opening_time: '"door_opening_time": "Heure d\'ouverture des portes au format HH:mm (ex: 19:30)"',
        presale_price: '"presale_price": "Tarif prévente numérique uniquement (nombre décimal, null si non mentionné)"',
        subscriber_price: '"subscriber_price": "Tarif abonné numérique uniquement (nombre décimal, null si non mentionné)"',
        is_full:
          '"is_full": "Booléen indiquant si l\'événement est complet (true si sold out, false sinon, null si non mentionné)"',
      };
      return fieldDefinitions[fieldName] || `"${fieldName}": "Valeur extraite"`;
    })
    .join(",\n  ");

  const prompt = `Tu es un expert IA ultra-performant en extraction d'informations d'événements. Ta mission est d'analyser en profondeur une page web et d'extraire les informations pertinentes sur un événement avec une précision maximale.

CONTEXTE DE LA PAGE WEB:
${contextForAI}

ANALYSE REQUISE:
Analyse méthodiquement chaque élément du contenu pour extraire uniquement les champs suivants:
${fieldsToExtract}

${Object.keys(customScrapingData).length > 0 ? `\n⚠️ IMPORTANT: Les données suivantes ont déjà été extraites via des sélecteurs CSS personnalisés et ont la PRIORITÉ:\n${JSON.stringify(customScrapingData, null, 2)}\n\nTu ne dois PAS extraire ces champs à nouveau, sauf si nécessaire pour compléter des informations manquantes.\n` : ""}

FORMAT DE SORTIE JSON ATTENDU:
{
  ${jsonFields}
}

Retourne UNIQUEMENT le JSON valide, sans texte avant ou après, sans commentaires, sans markdown.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "Tu es un expert IA ultra-performant en extraction d'informations structurées depuis des pages web. Tu analyses en profondeur le contenu et retournes toujours du JSON valide, précis et complet.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_completion_tokens: 3000,
    response_format: { type: "json_object" },
  });

  const aiResponse = completion.choices[0]?.message?.content || "{}";

  let extractedData: ScrapedEventData = {};
  try {
    let cleanResponse = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanResponse = jsonMatch[0];
    extractedData = JSON.parse(cleanResponse);
    if (extractedData.title) extractedData.title = extractedData.title.trim().replace(/\s+/g, " ");
    if (extractedData.description) extractedData.description = extractedData.description.trim().replace(/\n{3,}/g, "\n\n");
    if (extractedData.tags && Array.isArray(extractedData.tags)) {
      extractedData.tags = [...new Set(extractedData.tags.map((tag: string) => tag.trim().toLowerCase()))];
    }
  } catch {
    extractedData = { title: title.trim() || undefined, description: description.trim() || undefined };
  }

  const filteredExtractedData: Partial<ScrapedEventData> = {};
  if (extractedData) {
    for (const field of enabledAIFields) {
      const cssValue = (customScrapingData as any)[field];
      const aiValue = (extractedData as any)[field];
      if (!cssValue && aiValue !== undefined) (filteredExtractedData as any)[field] = aiValue;
    }
    if (enabledAIFields.includes("tags") && extractedData.tags) filteredExtractedData.tags = extractedData.tags;
  }

  const result: ScrapedEventData = {
    title: (customScrapingData.title as string) || (filteredExtractedData.title as string) || title.trim() || undefined,
    description:
      (customScrapingData.description as string) ||
      (filteredExtractedData.description as string) ||
      description.trim() ||
      undefined,
    date: (customScrapingData.date as string) || (filteredExtractedData.date as string) || undefined,
    end_date: (customScrapingData.end_date as string) || (filteredExtractedData.end_date as string) || undefined,
    price: (customScrapingData.price as string) || (filteredExtractedData.price as string) || undefined,
    presale_price: (customScrapingData.presale_price as string) || (filteredExtractedData.presale_price as string) || undefined,
    subscriber_price: (customScrapingData.subscriber_price as string) || (filteredExtractedData.subscriber_price as string) || undefined,
    location: (customScrapingData.location as string) || (filteredExtractedData.location as string) || undefined,
    address: (customScrapingData.address as string) || (filteredExtractedData.address as string) || undefined,
    image_url: (customScrapingData.image_url as string) || normalizedImageUrl || (filteredExtractedData.image_url as string) || undefined,
    external_url: url,
    organizer: (customScrapingData.organizer as string) || (filteredExtractedData.organizer as string) || undefined,
    category: (customScrapingData.category as string) || (filteredExtractedData.category as string) || undefined,
    tags: filteredExtractedData.tags || undefined,
    capacity: (customScrapingData.capacity as string) || (filteredExtractedData.capacity as string) || undefined,
    door_opening_time:
      (customScrapingData.door_opening_time as string) || (filteredExtractedData.door_opening_time as string) || undefined,
    is_full: (customScrapingData.is_full as any) ?? (filteredExtractedData.is_full as any),
  };

  return {
    ok: true as const,
    data: result,
    metadata: { scraped: true, ai_processed: true, url },
  };
}





