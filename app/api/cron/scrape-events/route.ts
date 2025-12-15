import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import * as cheerio from "cheerio";
import { scrapeEventPage } from "@/lib/scraping/scrape-event-page";

/**
 * Vérifie que la requête vient bien de Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.error("❌ CRON_SECRET n'est pas défini dans les variables d'environnement");
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/scrape-events
 * 
 * Cron job pour scraper automatiquement les événements des organisateurs
 * Configuré pour s'exécuter toutes les heures (schedule: "0 * * * *")
 */
export async function GET(request: NextRequest) {
  // Vérifier que la requête vient bien de Vercel Cron
  if (!verifyCronRequest(request)) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServiceClient();
    
    console.log("🔄 Démarrage du cron de scraping des événements");

    // Charger toutes les configs d'agenda activées (organizer + location-organizer)
    const { data: agendaConfigs, error: cfgError } = await supabase
      .from("organizer_agenda_scraping_configs")
      .select("id, organizer_id, location_id, enabled, agenda_url, event_link_selector, event_link_attribute, next_page_selector, next_page_attribute, max_pages")
      .eq("enabled", true);

    if (cfgError) {
      console.error("❌ Erreur lors de la récupération des configurations d'agenda:", cfgError);
      return NextResponse.json({ success: false, error: cfgError.message }, { status: 500 });
    }

    if (!agendaConfigs || agendaConfigs.length === 0) {
      console.log("ℹ️ Aucune configuration d'agenda active trouvée");
      return NextResponse.json({
        success: true,
        message: "Aucune configuration d'agenda active",
        configs: 0,
        discoveredUrls: 0,
        createdRequests: 0,
        enrichedRequests: 0,
        errors: 0,
      });
    }

    const MAX_TOTAL_EVENTS = Number(process.env.SCRAPE_EVENTS_MAX_TOTAL || "200");
    const MAX_EVENTS_PER_CONFIG = Number(process.env.SCRAPE_EVENTS_MAX_PER_CONFIG || "50");

    let discoveredUrls = 0;
    let createdRequests = 0;
    let enrichedRequests = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    async function fetchHtml(pageUrl: string) {
      const res = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.text();
    }

    function normalizeUrl(href: string, base: string) {
      try {
        return new URL(href, base).href;
      } catch {
        return null;
      }
    }

    async function discoverEventUrlsFromAgenda(cfg: any) {
      const visited = new Set<string>();
      const found = new Set<string>();

      let currentUrl: string | null = cfg.agenda_url;
      let page = 0;
      const maxPages = Math.max(1, Math.min(200, Number(cfg.max_pages || 10)));

      while (currentUrl && page < maxPages) {
        if (visited.has(currentUrl)) break;
        visited.add(currentUrl);
        page += 1;

        const html = await fetchHtml(currentUrl);
        const $ = cheerio.load(html);

        // event links
        const attr = (cfg.event_link_attribute || "href").trim() || "href";
        $(cfg.event_link_selector).each((_, el) => {
          const raw = ($(el).attr(attr) || "").trim();
          if (!raw) return;
          const u = normalizeUrl(raw, currentUrl!);
          if (u) found.add(u);
        });

        // next page
        if (!cfg.next_page_selector) break;
        const nextAttr = (cfg.next_page_attribute || "href").trim() || "href";
        const nextRaw = ($(cfg.next_page_selector).first().attr(nextAttr) || "").trim();
        if (!nextRaw) break;
        const nextUrl = normalizeUrl(nextRaw, currentUrl);
        if (!nextUrl || visited.has(nextUrl)) break;
        currentUrl = nextUrl;
      }

      return [...found];
    }

    for (const cfg of agendaConfigs) {
      if (createdRequests + enrichedRequests >= MAX_TOTAL_EVENTS) break;

      const ownerLabel = cfg.organizer_id ? `organizer:${cfg.organizer_id}` : `location:${cfg.location_id}`;
      console.log(`📋 Agenda scrape ${ownerLabel} -> ${cfg.agenda_url}`);

      try {
        const urls = await discoverEventUrlsFromAgenda(cfg);
        const limited = urls.slice(0, MAX_EVENTS_PER_CONFIG);
        discoveredUrls += limited.length;

        // Insert missing requests (idempotent by source_url or event_data.scraping_url)
        for (const eventUrl of limited) {
          if (createdRequests >= MAX_TOTAL_EVENTS) break;

          // Vérifier si l'URL existe déjà dans source_url ou dans event_data.scraping_url
          const { data: existingBySourceUrl } = await supabase
            .from("user_requests")
            .select("id, status, event_data")
            .eq("request_type", "event_from_url")
            .eq("source_url", eventUrl)
            .maybeSingle();

          // Si pas trouvé par source_url, vérifier dans event_data.scraping_url
          let existing = existingBySourceUrl;
          if (!existing) {
            const { data: allRequests } = await supabase
              .from("user_requests")
              .select("id, status, event_data, source_url")
              .eq("request_type", "event_from_url");
            
            if (allRequests) {
              existing = allRequests.find((req: any) => {
                const eventData = req.event_data || {};
                return eventData.scraping_url === eventUrl || eventData.external_url === eventUrl;
              }) || null;
            }
          }

          let requestId = existing?.id as string | undefined;

          // Si l'URL existe déjà, ne pas créer de nouvelle demande
          if (existing) {
            console.log(`⏭️ URL déjà utilisée, ignorée: ${eventUrl}`);
            continue;
          }

          // location_name optional
          let locationName: string | null = null;
          if (cfg.location_id) {
            const { data: loc } = await supabase.from("locations").select("name").eq("id", cfg.location_id).maybeSingle();
            locationName = (loc?.name as string) || null;
          }

          // Toujours ajouter l'organizer_id dans event_data
          const initialEventData: any = {
            scraping_url: eventUrl, // Stocker l'URL de scraping dans event_data
          };
          if (cfg.organizer_id) initialEventData.organizer_id = cfg.organizer_id;
          if (cfg.location_id) initialEventData.location_id = cfg.location_id;

          const { data: inserted, error: insErr } = await supabase
            .from("user_requests")
            .insert([
              {
                request_type: "event_from_url",
                status: "pending",
                source_url: eventUrl,
                location_id: cfg.location_id || null,
                location_name: locationName,
                requested_by: null,
                event_data: initialEventData,
              },
            ])
            .select("id")
            .single();

          if (insErr) throw insErr;
          requestId = inserted?.id;
          createdRequests += 1;

          // Enrichir immédiatement après création
          if (!requestId) continue;

          if (enrichedRequests >= MAX_TOTAL_EVENTS) break;

          const scrapeRes = await scrapeEventPage({
            url: eventUrl,
            organizer_id: cfg.organizer_id || null,
            location_id: cfg.location_id || null,
            supabase,
          });

          if (scrapeRes.ok) {
            // Récupérer les données existantes
            const { data: currentData } = await supabase
              .from("user_requests")
              .select("event_data")
              .eq("id", requestId)
              .single();

            const mergedEventData: any = { ...(currentData?.event_data || {}) };
            // S'assurer que l'organizer_id est toujours présent
            if (cfg.organizer_id) mergedEventData.organizer_id = cfg.organizer_id;
            if (cfg.location_id) mergedEventData.location_id = cfg.location_id;
            // S'assurer que scraping_url est présent
            if (!mergedEventData.scraping_url) {
              mergedEventData.scraping_url = eventUrl;
            }
            Object.assign(mergedEventData, scrapeRes.data);

            await supabase
              .from("user_requests")
              .update({ event_data: mergedEventData })
              .eq("id", requestId);

            enrichedRequests += 1;
          }
        }
      } catch (e: any) {
        errors += 1;
        const msg = `${ownerLabel}: ${e?.message || "Erreur inconnue"}`;
        console.error(`❌ ${msg}`);
        errorDetails.push(msg);
      }
    }

    console.log(
      `✅ Cron scrape-events terminé: configs=${agendaConfigs.length}, discovered=${discoveredUrls}, created=${createdRequests}, enriched=${enrichedRequests}, errors=${errors}`
    );

    return NextResponse.json({
      success: errors === 0,
      message: "Scraping agendas terminé",
      configs: agendaConfigs.length,
      discoveredUrls,
      createdRequests,
      enrichedRequests,
      errors,
      limits: {
        maxTotal: MAX_TOTAL_EVENTS,
        maxPerConfig: MAX_EVENTS_PER_CONFIG,
      },
      errorDetails: errors ? errorDetails : undefined,
    });
    
  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du cron:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}








