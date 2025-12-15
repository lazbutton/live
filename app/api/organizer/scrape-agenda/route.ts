import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import * as cheerio from "cheerio";
import { scrapeEventPage } from "@/lib/scraping/scrape-event-page";

/**
 * POST /api/organizer/scrape-agenda
 * 
 * Déclenche le scraping de l'agenda pour un organisateur ou lieu spécifique
 * 
 * Body:
 * {
 *   organizer_id?: string - ID de l'organisateur
 *   location_id?: string - ID du lieu-organisateur
 * }
 */
export async function POST(request: NextRequest) {
  // Vérifier l'authentification
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { organizer_id, location_id } = body;

    if (!organizer_id && !location_id) {
      return NextResponse.json(
        { error: "organizer_id ou location_id requis" },
        { status: 400 }
      );
    }

    // Vérifier si l'utilisateur est admin
    const userRole = user.user_metadata?.role || user.app_metadata?.role;
    const isAdmin = userRole === "admin";

    // Si l'utilisateur n'est pas admin, vérifier qu'il a accès à cet organisateur (owner ou editor)
    if (!isAdmin) {
      const { data: userOrg, error: accessError } = await supabase
        .from("user_organizers")
        .select("role")
        .eq("user_id", user.id)
        .eq("organizer_id", organizer_id || location_id)
        .single();

      if (accessError || !userOrg) {
        return NextResponse.json(
          { error: "Accès non autorisé à cet organisateur" },
          { status: 403 }
        );
      }

      const role = userOrg.role;
      if (role !== "owner" && role !== "editor") {
        return NextResponse.json(
          { error: "Seuls les propriétaires et éditeurs peuvent déclencher le scraping" },
          { status: 403 }
        );
      }
    }

    // Utiliser le service client pour les opérations
    const serviceSupabase = createServiceClient();

    // Charger les configs d'agenda pour cet organisateur/lieu
    let query = serviceSupabase
      .from("organizer_agenda_scraping_configs")
      .select("id, organizer_id, location_id, enabled, agenda_url, event_link_selector, event_link_attribute, next_page_selector, next_page_attribute, max_pages")
      .eq("enabled", true);

    if (organizer_id) {
      query = query.eq("organizer_id", organizer_id);
    } else if (location_id) {
      query = query.eq("location_id", location_id);
    }

    const { data: agendaConfigs, error: cfgError } = await query;

    if (cfgError) {
      console.error("❌ Erreur lors de la récupération des configurations d'agenda:", cfgError);
      return NextResponse.json({ success: false, error: cfgError.message }, { status: 500 });
    }

    if (!agendaConfigs || agendaConfigs.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Aucune configuration d'agenda active trouvée pour cet organisateur",
      }, { status: 404 });
    }

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
      const ownerLabel = cfg.organizer_id ? `organizer:${cfg.organizer_id}` : `location:${cfg.location_id}`;
      console.log(`📋 Agenda scrape ${ownerLabel} -> ${cfg.agenda_url}`);

      try {
        const urls = await discoverEventUrlsFromAgenda(cfg);
        const limited = urls.slice(0, MAX_EVENTS_PER_CONFIG);
        discoveredUrls += limited.length;

        // Insert missing requests (idempotent by source_url or event_data.scraping_url)
        for (const eventUrl of limited) {
          // Vérifier si l'URL existe déjà dans source_url ou dans event_data.scraping_url
          const { data: existingBySourceUrl } = await serviceSupabase
            .from("user_requests")
            .select("id, status, event_data")
            .eq("request_type", "event_from_url")
            .eq("source_url", eventUrl)
            .maybeSingle();

          // Si pas trouvé par source_url, vérifier dans event_data.scraping_url
          let existing = existingBySourceUrl;
          if (!existing) {
            const { data: allRequests } = await serviceSupabase
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
            const { data: loc } = await serviceSupabase.from("locations").select("name").eq("id", cfg.location_id).maybeSingle();
            locationName = (loc?.name as string) || null;
          }

          // Toujours ajouter l'organizer_id dans event_data
          const initialEventData: any = {
            scraping_url: eventUrl, // Stocker l'URL de scraping dans event_data
          };
          if (cfg.organizer_id) initialEventData.organizer_id = cfg.organizer_id;
          if (cfg.location_id) initialEventData.location_id = cfg.location_id;

          const { data: inserted, error: insErr } = await serviceSupabase
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

          const scrapeRes = await scrapeEventPage({
            url: eventUrl,
            organizer_id: cfg.organizer_id || null,
            location_id: cfg.location_id || null,
            supabase: serviceSupabase,
          });

          if (scrapeRes.ok) {
            // Récupérer les données existantes
            const { data: currentData } = await serviceSupabase
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

            await serviceSupabase
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
      `✅ Scrape agenda terminé: configs=${agendaConfigs.length}, discovered=${discoveredUrls}, created=${createdRequests}, enriched=${enrichedRequests}, errors=${errors}`
    );

    return NextResponse.json({
      success: errors === 0,
      message: "Scraping de l'agenda terminé",
      configs: agendaConfigs.length,
      discoveredUrls,
      createdRequests,
      enrichedRequests,
      errors,
      errorDetails: errors ? errorDetails : undefined,
    });
    
  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du scraping:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}

