import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";

interface ScrapedEventData {
  title?: string;
  description?: string;
  date?: string;
  end_date?: string;
  price?: string;
  location?: string;
  address?: string;
  image_url?: string;
  external_url?: string;
  organizer?: string;
  category?: string;
  tags?: string[]; // Liste de noms de tags
  capacity?: string;
  door_opening_time?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur est admin
    const userRole = user.user_metadata?.role;
    if (userRole !== "admin") {
      return NextResponse.json(
        { error: "Accès refusé. Administrateur requis." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { url, organizer_id, location_id } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "URL requise" },
        { status: 400 }
      );
    }

    // Valider l'URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "URL invalide" },
        { status: 400 }
      );
    }

    // Scraper la page web
    console.log(`Scraping URL: ${url}`);
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Impossible d'accéder à l'URL: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extraire les métadonnées Open Graph et Twitter Cards
    const metadata: Record<string, string> = {};
    
    // Open Graph
    $('meta[property^="og:"]').each((_, el) => {
      const property = $(el).attr("property")?.replace("og:", "");
      const content = $(el).attr("content");
      if (property && content) {
        metadata[property] = content;
      }
    });

    // Twitter Cards
    $('meta[name^="twitter:"]').each((_, el) => {
      const name = $(el).attr("name")?.replace("twitter:", "");
      const content = $(el).attr("content");
      if (name && content) {
        metadata[name] = content;
      }
    });

    // Extraire le texte principal (supprimer scripts, styles, etc.)
    $("script, style, nav, header, footer, aside, .cookie-banner, .cookie-consent, .gdpr-banner").remove();
    
    // Extraire le contenu principal de manière plus intelligente
    const mainContentSelectors = [
      "main",
      "article",
      "[role='main']",
      ".content",
      ".main-content",
      "#content",
      ".event-details",
      ".event-info",
      ".description"
    ];
    
    let mainText = "";
    for (const selector of mainContentSelectors) {
      const content = $(selector).first().text();
      if (content.length > mainText.length) {
        mainText = content;
      }
    }
    
    // Si aucun contenu principal trouvé, prendre tout le body
    if (!mainText || mainText.length < 200) {
      mainText = $("body").text();
    }
    
    mainText = mainText.replace(/\s+/g, " ").trim().substring(0, 15000);
    
    // Extraire également les éléments structurés (listes, paragraphes)
    const structuredContent: string[] = [];
    $("p, li, h1, h2, h3, h4, .description, .event-details, .price, .date, .location").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10 && text.length < 500) {
        structuredContent.push(text);
      }
    });

    // Extraire le titre
    const title =
      metadata.title ||
      $("title").text() ||
      $("h1").first().text() ||
      "";

    // Extraire la description
    const description =
      metadata.description ||
      $('meta[name="description"]').attr("content") ||
      $("p").first().text() ||
      "";

    // Extraire l'image
    const imageUrl =
      metadata.image ||
      $('meta[property="og:image"]').attr("content") ||
      $("img").first().attr("src") ||
      "";

    // Normaliser l'URL de l'image si elle est relative
    let normalizedImageUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith("http")) {
      normalizedImageUrl = new URL(imageUrl, parsedUrl.origin).href;
    }

    // Charger les configurations de scraping personnalisées si organizer_id ou location_id est fourni
    let customScrapingData: Partial<ScrapedEventData> = {};
    const configOwnerId = organizer_id || location_id;
    if (configOwnerId) {
      try {
        let query = supabase
          .from("organizer_scraping_configs")
          .select("*");
        
        if (organizer_id) {
          query = query.eq("organizer_id", organizer_id);
        } else if (location_id) {
          query = query.eq("location_id", location_id);
        }
        
        const { data: configs, error: configError } = await query;

        if (!configError && configs && configs.length > 0) {
          console.log(`✅ ${configs.length} configuration(s) CSS trouvée(s) pour l'organisateur`);
          
          // Appliquer chaque configuration CSS
          for (const config of configs) {
            try {
              // Normaliser le sélecteur CSS si nécessaire (ajouter des crochets pour les attributs)
              let selector = config.css_selector.trim();
              
              // Si le sélecteur ressemble à un attribut HTML sans crochets (ex: itemprop="name" ou class="...")
              // Essayer de le corriger automatiquement
              // Vérifier d'abord si ça commence par un nom d'attribut suivi de = et de guillemets
              // Utiliser une approche manuelle pour extraire la valeur entre guillemets (plus robuste)
              if (!selector.match(/^[.#\[:]/) && selector.includes('=') && !selector.includes('[')) {
                const equalIndex = selector.indexOf('=');
                if (equalIndex > 0) {
                  const attrName = selector.substring(0, equalIndex).trim();
                  const afterEqual = selector.substring(equalIndex + 1).trim();
                  
                  // Extraire la valeur entre guillemets (simple ou double)
                  let attrValue: string | null = null;
                  if (afterEqual.startsWith('"')) {
                    const endQuote = afterEqual.indexOf('"', 1);
                    if (endQuote > 0) {
                      attrValue = afterEqual.substring(1, endQuote);
                    }
                  } else if (afterEqual.startsWith("'")) {
                    const endQuote = afterEqual.indexOf("'", 1);
                    if (endQuote > 0) {
                      attrValue = afterEqual.substring(1, endQuote);
                    }
                  }
                  
                  if (attrValue !== null) {
                    // Si c'est un attribut class, utiliser le sélecteur de classe CSS standard
                    if (attrName === 'class' || attrName === 'className') {
                      // Vérifier si la valeur contient des caractères spéciaux qui posent problème en CSS
                      // Si elle contient des crochets, parenthèses complexes, utiliser un sélecteur d'attribut
                      if (attrValue.match(/[\[\]()]/)) {
                        // Utiliser un sélecteur d'attribut CSS pour les classes avec caractères spéciaux
                        // Chercher un élément qui a toutes les classes dans son attribut class
                        const allClasses = attrValue.split(/\s+/).filter((c: string) => c.trim());
                        if (allClasses.length === 1) {
                          // Une seule classe : utiliser [class*="..."] pour une correspondance partielle
                          selector = `[class*="${allClasses[0]}"]`;
                        } else {
                          // Plusieurs classes : utiliser [class*="..."] avec la première classe
                          // ou combiner avec un sélecteur plus spécifique
                          selector = allClasses.map((c: string) => `[class*="${c.trim()}"]`).join('');
                        }
                        console.log(`🔧 Sélecteur class (attribut) corrigé: "${config.css_selector}" -> "${selector}"`);
                      } else {
                        // Convertir les classes en sélecteur CSS standard (remplacer les espaces par des points)
                        const classes = attrValue.split(/\s+/).filter((c: string) => c.trim()).map((c: string) => {
                          // Échapper uniquement les caractères vraiment problématiques
                          return '.' + c.trim().replace(/([.#:])/g, '\\$1');
                        }).join('');
                        selector = classes || `.${attrValue.replace(/\s+/g, '-')}`;
                        console.log(`🔧 Sélecteur class corrigé: "${config.css_selector}" -> "${selector}"`);
                      }
                    } else if (attrName === 'id') {
                      // Pour l'ID, utiliser le sélecteur d'ID CSS standard
                      selector = '#' + attrValue.replace(/([\[\](){}.#:,_])/g, '\\$1');
                      console.log(`🔧 Sélecteur id corrigé: "${config.css_selector}" -> "${selector}"`);
                    } else {
                      // Pour les autres attributs, utiliser la syntaxe d'attribut CSS
                      selector = `[${attrName}="${attrValue.replace(/"/g, '\\"')}"]`;
                      console.log(`🔧 Sélecteur attribut corrigé: "${config.css_selector}" -> "${selector}"`);
                    }
                  } else {
                    // Fallback: essayer un format plus général en ajoutant des crochets
                    selector = `[${selector.replace(/"/g, '\\"')}]`;
                    console.log(`🔧 Sélecteur générique corrigé (fallback): "${config.css_selector}" -> "${selector}"`);
                  }
                } else {
                  // Fallback: essayer un format plus général en ajoutant des crochets
                  selector = `[${selector.replace(/"/g, '\\"')}]`;
                  console.log(`🔧 Sélecteur générique corrigé (fallback 2): "${config.css_selector}" -> "${selector}"`);
                }
              }
              
              const elements = $(selector);
              if (elements.length > 0) {
                let extractedValue: string | null = null;
                
                // Extraire la valeur selon l'attribut
                if (config.attribute === "textContent" || !config.attribute) {
                  extractedValue = elements.first().text().trim();
                } else if (config.attribute === "innerHTML") {
                  extractedValue = elements.first().html() || null;
                } else {
                  extractedValue = elements.first().attr(config.attribute) || null;
                }

                if (extractedValue) {
                  // Si text_prefix est défini, extraire la valeur après ce texte
                  if (config.text_prefix && config.text_prefix.trim() !== "") {
                    const prefix = config.text_prefix.trim();
                    const prefixIndex = extractedValue.indexOf(prefix);
                    if (prefixIndex !== -1) {
                      // Extraire le texte après le préfixe
                      extractedValue = extractedValue.substring(prefixIndex + prefix.length).trim();
                    } else {
                      // Le préfixe n'a pas été trouvé, on peut essayer de chercher de manière insensible à la casse
                      const lowerExtracted = extractedValue.toLowerCase();
                      const lowerPrefix = prefix.toLowerCase();
                      const lowerPrefixIndex = lowerExtracted.indexOf(lowerPrefix);
                      if (lowerPrefixIndex !== -1) {
                        extractedValue = extractedValue.substring(lowerPrefixIndex + prefix.length).trim();
                      } else {
                        // Préfixe non trouvé, on garde la valeur originale ou on la met à null
                        extractedValue = null;
                      }
                    }
                  }

                  if (extractedValue) {
                    // Appliquer la transformation si nécessaire
                    if (config.transform_function === "price" && extractedValue) {
                      // Extraire uniquement les chiffres
                      const priceMatch = extractedValue.match(/[\d.,]+/);
                      customScrapingData[config.event_field as keyof ScrapedEventData] = (priceMatch ? priceMatch[0].replace(",", ".") : extractedValue) as any;
                    } else {
                      customScrapingData[config.event_field as keyof ScrapedEventData] = extractedValue as any;
                    }
                  }
                }
              }
            } catch (err) {
              console.warn(`⚠️ Erreur lors de l'extraction avec le sélecteur "${config.css_selector}":`, err);
            }
          }
          
          console.log("📊 Données extraites via CSS:", customScrapingData);
        }
      } catch (error) {
        console.warn("⚠️ Erreur lors du chargement des configurations CSS:", error);
      }
    }

    // Charger les champs IA configurés pour cet organisateur/lieu AVANT l'appel à l'IA
    let enabledAIFields: string[] = [];
    // Créer un map pour stocker les indications IA par champ (accessible dans tout le scope)
    const aiHintsMap: Record<string, string | null> = {};
    
    try {
      let aiFieldsQuery = supabase
        .from("organizer_ai_fields")
        .select("field_name, enabled, ai_hint")
        .eq("enabled", true);
      
      if (organizer_id) {
        aiFieldsQuery = aiFieldsQuery.eq("organizer_id", organizer_id).is("location_id", null);
      } else if (location_id) {
        aiFieldsQuery = aiFieldsQuery.eq("location_id", location_id).is("organizer_id", null);
      }
      
      const { data: aiFieldsData } = await aiFieldsQuery;
      
      if (aiFieldsData && aiFieldsData.length > 0) {
        enabledAIFields = aiFieldsData
          .filter((f: any) => f.enabled)
          .map((f: any) => f.field_name);
        
        // Stocker les indications IA
        aiFieldsData.forEach((f: any) => {
          if (f.ai_hint) {
            aiHintsMap[f.field_name] = f.ai_hint;
          }
        });
        
        console.log("📋 Champs IA activés:", enabledAIFields);
        console.log("💡 Indications IA:", aiHintsMap);
      } else {
        // Par défaut, tous les champs sont activés si aucune configuration n'existe
        enabledAIFields = ["title", "description", "date", "end_date", "price", "location", "address", "image_url", "organizer", "category", "tags", "capacity", "door_opening_time"];
        console.log("📋 Utilisation des champs IA par défaut (tous activés)");
      }
    } catch (error) {
      console.warn("⚠️ Erreur lors du chargement des champs IA, utilisation par défaut:", error);
      enabledAIFields = ["title", "description", "date", "end_date", "price", "location", "address", "image_url", "organizer", "category", "tags", "capacity", "door_opening_time"];
    }

    // Préparer le contexte enrichi pour l'IA
    const contextForAI = `
URL: ${url}
Titre de la page: ${title}
Description: ${description}
Métadonnées Open Graph et Twitter Cards: ${JSON.stringify(metadata, null, 2)}
Contenu structuré (paragraphes, listes, titres): ${structuredContent.slice(0, 50).join("\n")}
Texte principal complet: ${mainText}
${Object.keys(customScrapingData).length > 0 ? `\nDonnées extraites via sélecteurs CSS personnalisés:\n${JSON.stringify(customScrapingData, null, 2)}` : ""}
`;

    // Utiliser OpenAI pour extraire les informations d'événement
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      // Si pas d'OpenAI, retourner les données basiques scrapées
      console.warn("OPENAI_API_KEY non configurée, utilisation des données basiques");
      return NextResponse.json({
        data: {
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          image_url: normalizedImageUrl || undefined,
          external_url: url,
        },
        metadata: {
          scraped: true,
          ai_processed: false,
        },
      });
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    });

    // Construire le prompt en fonction des champs activés (déjà chargés ci-dessus)
    const fieldsToExtract = enabledAIFields.map((fieldName, index) => {
      const fieldLabels: Record<string, string> = {
        title: "Le titre de l'événement (doit être accrocheur mais précis)",
        description: "Une description riche et détaillée (3-5 phrases minimum, incluant le contexte, l'ambiance, les points forts)",
        date: "Les dates et heures de début",
        end_date: "Les dates et heures de fin",
        price: "Les informations de prix (prix normal, réduit, gratuit, sur donation, etc.)",
        location: "Le lieu exact",
        address: "L'adresse complète du lieu",
        image_url: "L'URL de l'image principale de l'événement",
        organizer: "L'organisateur ou les organisateurs",
        category: "La catégorie principale parmi: musique, théâtre, danse, sport, conférence, exposition, festival, concert, spectacle, atelier, autre",
        tags: "Des tags pertinents et variés (minimum 3-5 tags)",
        capacity: "La capacité si mentionnée",
        door_opening_time: "L'heure d'ouverture des portes si disponible",
      };
      
      // Ajouter l'indication personnalisée si elle existe
      const baseLabel = fieldLabels[fieldName] || fieldName;
      const customHint = aiHintsMap[fieldName];
      const finalLabel = customHint ? `${baseLabel}. Indication spécifique: ${customHint}` : baseLabel;
      
      return `${index + 1}. ${finalLabel}`;
    }).join("\n");

    const jsonFields = enabledAIFields.map(fieldName => {
      const fieldDefinitions: Record<string, string> = {
        title: '"title": "Titre précis et accrocheur de l\'événement"',
        description: '"description": "Description complète et détaillée de l\'événement, incluant contexte, programme, artistes/intervenants, ambiance attendue. Minimum 3-5 phrases bien structurées."',
        date: '"date": "Date et heure de début au format ISO 8601 avec fuseau horaire (ex: 2024-12-25T20:00:00+01:00)"',
        end_date: '"end_date": "Date et heure de fin au format ISO 8601 (optionnel mais important si disponible)"',
        price: '"price": "Prix numérique uniquement (0 pour gratuit, nombre décimal pour prix payant)"',
        location: '"location": "Nom officiel du lieu/venue"',
        address: '"address": "Adresse postale complète (numéro, rue, code postal, ville, pays si pertinent)"',
        image_url: '"image_url": "URL complète de l\'image principale de l\'événement"',
        organizer: '"organizer": "Nom de l\'organisateur, de l\'association, du collectif ou de l\'artiste principal"',
        category: '"category": "Catégorie principale (musique, théâtre, danse, sport, conférence, exposition, festival, concert, spectacle, atelier, autre)"',
        tags: '"tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]',
        capacity: '"capacity": "Capacité maximale en nombre (uniquement le chiffre)"',
        door_opening_time: '"door_opening_time": "Heure d\'ouverture des portes au format HH:mm (ex: 19:30)"',
      };
      return fieldDefinitions[fieldName] || `"${fieldName}": "Valeur extraite"`;
    }).join(",\n  ");

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

RÈGLES CRITIQUES D'EXTRACTION:
✅ PRÉCISION MAXIMALE:
- Analyse TOUS les textes, métadonnées, et éléments structurés
- Détecte les dates dans tous formats (français, anglais, format ISO)
- Identifie les prix même s'ils sont écrits en toutes lettres ou avec symboles
- Extrait l'adresse complète même si elle est fragmentée

✅ DATES ET HEURES:
- Convertis TOUTES les dates en ISO 8601 avec fuseau horaire
- Détecte automatiquement le fuseau horaire (France = +01:00 en hiver, +02:00 en été)
- Si seulement une date est trouvée, assume que c'est la date de début
- Pour les événements sur plusieurs jours, utilise la date de début et la date de fin

✅ PRIX:
- Détecte "gratuit", "entrée libre", "sur donation", "payant"
- Extrait les prix numériques même s'ils sont dans du texte
- Gère les prix réduits (prend le prix normal ou le prix moyen)
- Retourne uniquement le nombre (ex: 25.50, pas "25,50€" ou "25.50 euros")

✅ LIEU ET ADRESSE:
- Extrait le nom du lieu même s'il est dans différentes parties de la page
- Combine les informations d'adresse fragmentées
- Inclus code postal et ville
- Prépare l'adresse complète pour géolocalisation

✅ ORGANISATEUR:
- Identifie l'organisateur principal (association, collectif, artiste, lieu)
- Privilégie les mentions explicites "organisé par", "présenté par"
- Peut extraire plusieurs organisateurs (prendre le principal)

✅ CATÉGORIE:
- Analyse le contenu pour déterminer la catégorie la plus appropriée
- Utilise les mots-clés du texte et des métadonnées
- Catégories possibles: musique, théâtre, danse, sport, conférence, exposition, festival, concert, spectacle, atelier, autre

✅ TAGS:
- Extrait minimum 3-5 tags pertinents
- Tags peuvent inclure: genre musical (rock, jazz, electro, classique, etc.), type d'événement (concert, festival, conférence, etc.), public visé (famille, adulte, enfants), ambiance (en plein air, intimiste, etc.), caractéristiques (gratuit, payant, sur inscription, etc.)
- Utilise des tags courants et descriptifs

✅ DESCRIPTION:
- Écrit une description riche de 3-5 phrases minimum
- Inclus: contexte de l'événement, qui/quoi, où, quand, pourquoi c'est intéressant
- Mentionne les artistes/intervenants si présents
- Décrit l'ambiance et le style attendu
- Formule de manière engageante mais factuelle

⚠️ GESTION DES CAS LIMITES:
- Si une information est ambiguë, utilise le contexte pour faire le meilleur choix
- Si plusieurs valeurs sont possibles (ex: plusieurs prix), prends la plus représentative
- Si l'information est vraiment absente, utilise null ou omets le champ
- Pour les dates, si seulement le jour est mentionné sans heure, assume 20:00 (début de soirée) sauf indication contraire

🎯 OBJECTIF:
Extraire TOUTES les informations disponibles avec la plus grande précision possible. Sois exhaustif et précis.

Retourne UNIQUEMENT le JSON valide, sans texte avant ou après, sans commentaires, sans markdown.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Modèle GPT-4o (gpt-5.1 n'existe pas encore)
      messages: [
        {
          role: "system",
          content: "Tu es un expert IA ultra-performant en extraction d'informations structurées depuis des pages web. Tu analyses en profondeur le contenu et retournes toujours du JSON valide, précis et complet. Tu es méthodique et exhaustif dans ton analyse. Tu utilises toutes tes capacités avancées de compréhension du contexte et d'extraction d'informations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2, // Température plus basse pour plus de précision et cohérence
      max_completion_tokens: 3000, // Plus de tokens pour des descriptions plus riches et complètes (GPT-5.1 utilise max_completion_tokens au lieu de max_tokens)
      response_format: { type: "json_object" }, // Force le format JSON pour une meilleure fiabilité
    });

    const aiResponse = completion.choices[0]?.message?.content || "{}";
    
    // Parser la réponse JSON de l'IA
    let extractedData: ScrapedEventData = {};
    try {
      // Nettoyer la réponse pour retirer les markdown code blocks si présents
      let cleanResponse = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      
      // Extraire le JSON si la réponse contient du texte autour
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }
      
      extractedData = JSON.parse(cleanResponse);
      
      // Validation et nettoyage des données extraites
      if (extractedData.title) {
        extractedData.title = extractedData.title.trim().replace(/\s+/g, " ");
      }
      if (extractedData.description) {
        extractedData.description = extractedData.description.trim().replace(/\n{3,}/g, "\n\n");
      }
      if (extractedData.tags && Array.isArray(extractedData.tags)) {
        // Nettoyer et dédupliquer les tags
        extractedData.tags = [...new Set(extractedData.tags.map((tag: string) => tag.trim().toLowerCase()))];
      }
      
      console.log("✅ Données extraites par l'IA (GPT-4o):", JSON.stringify(extractedData, null, 2));
    } catch (parseError) {
      console.error("❌ Erreur lors du parsing de la réponse IA:", parseError);
      console.error("Réponse IA brute:", aiResponse);
      // En cas d'erreur, utiliser les données basiques scrapées
      extractedData = {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
      };
    }

    // Filtrer les données extraites par l'IA pour ne garder que les champs activés
    // et qui n'ont pas été extraits via CSS
    const filteredExtractedData: Partial<ScrapedEventData> = {};
    if (extractedData) {
      for (const field of enabledAIFields) {
        // Ne pas utiliser l'IA pour un champ s'il a été extrait via CSS
        const cssValue = customScrapingData[field as keyof ScrapedEventData];
        const aiValue = extractedData[field as keyof ScrapedEventData];
        
        if (!cssValue && aiValue !== undefined) {
          filteredExtractedData[field as keyof ScrapedEventData] = aiValue as any;
        }
      }
      
      // Les tags sont toujours extraits par l'IA si activés
      if (enabledAIFields.includes("tags") && extractedData.tags) {
        filteredExtractedData.tags = extractedData.tags;
      }
    }
    
    console.log("🤖 Données IA filtrées selon la configuration:", filteredExtractedData);

    // Combiner les données : CSS personnalisé > IA (filtrée) > Scraping basique
    const result: ScrapedEventData = {
      // Données extraites via CSS personnalisé ont la priorité, puis IA filtrée selon configuration
      title: (customScrapingData.title as string) || (filteredExtractedData.title as string) || title.trim() || undefined,
      description: (customScrapingData.description as string) || (filteredExtractedData.description as string) || description.trim() || undefined,
      date: (customScrapingData.date as string) || (filteredExtractedData.date as string) || undefined,
      end_date: (customScrapingData.end_date as string) || (filteredExtractedData.end_date as string) || undefined,
      price: (customScrapingData.price as string) || (filteredExtractedData.price as string) || undefined,
      location: (customScrapingData.location as string) || (filteredExtractedData.location as string) || undefined,
      address: (customScrapingData.address as string) || (filteredExtractedData.address as string) || undefined,
      image_url: (customScrapingData.image_url as string) || normalizedImageUrl || (filteredExtractedData.image_url as string) || undefined,
      external_url: url,
      organizer: (customScrapingData.organizer as string) || (filteredExtractedData.organizer as string) || undefined,
      category: (customScrapingData.category as string) || (filteredExtractedData.category as string) || undefined,
      tags: filteredExtractedData.tags || undefined, // Les tags sont extraits par l'IA si activés
      capacity: (customScrapingData.capacity as string) || (filteredExtractedData.capacity as string) || undefined,
      door_opening_time: (customScrapingData.door_opening_time as string) || (filteredExtractedData.door_opening_time as string) || undefined,
    };

    return NextResponse.json({
      data: result,
      metadata: {
        scraped: true,
        ai_processed: !!openaiApiKey,
        url,
      },
    });
  } catch (error) {
    console.error("Erreur lors du scraping:", error);
    return NextResponse.json(
      {
        error: "Erreur lors du scraping",
        details: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
