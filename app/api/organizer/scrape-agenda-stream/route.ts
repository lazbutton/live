import { NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import * as cheerio from "cheerio";
import { scrapeEventPage } from "@/lib/scraping/scrape-event-page";

/**
 * POST /api/organizer/scrape-agenda-stream
 * 
 * Déclenche le scraping de l'agenda avec Server-Sent Events pour les mises à jour en temps réel
 */
export async function POST(request: NextRequest) {
  // Vérifier l'authentification
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Non authentifié" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const body = await request.json();
        const { organizer_id, location_id, max_events } = body;

        if (!organizer_id && !location_id) {
          send({ type: "error", error: "organizer_id ou location_id requis" });
          controller.close();
          return;
        }

        // Vérifier si l'utilisateur est admin
        const userRole = user.user_metadata?.role || user.app_metadata?.role;
        const isAdmin = userRole === "admin";

        // Si l'utilisateur n'est pas admin, vérifier qu'il a accès à cet organisateur
        if (!isAdmin) {
          const { data: userOrg, error: accessError } = await supabase
            .from("user_organizers")
            .select("role")
            .eq("user_id", user.id)
            .eq("organizer_id", organizer_id || location_id)
            .single();

          if (accessError || !userOrg) {
            send({ type: "error", error: "Accès non autorisé à cet organisateur" });
            controller.close();
            return;
          }

          const role = userOrg.role;
          if (role !== "owner" && role !== "editor") {
            send({ type: "error", error: "Seuls les propriétaires et éditeurs peuvent déclencher le scraping" });
            controller.close();
            return;
          }
        }

        const serviceSupabase = createServiceClient();
        const MAX_EVENTS_PER_CONFIG = max_events !== null && max_events !== undefined 
          ? Number(max_events) 
          : Number(process.env.SCRAPE_EVENTS_MAX_PER_CONFIG || "50");

        // Charger les configs d'agenda
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
          send({ type: "error", error: cfgError.message });
          controller.close();
          return;
        }

        if (!agendaConfigs || agendaConfigs.length === 0) {
          send({ type: "error", error: "Aucune configuration d'agenda active trouvée" });
          controller.close();
          return;
        }

        send({ type: "start", configs: agendaConfigs.length });

        async function fetchHtml(pageUrl: string) {
          const res = await fetch(pageUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

            const attr = (cfg.event_link_attribute || "href").trim() || "href";
            $(cfg.event_link_selector).each((_, el) => {
              const raw = ($(el).attr(attr) || "").trim();
              if (!raw) return;
              const u = normalizeUrl(raw, currentUrl!);
              if (u) found.add(u);
            });

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

        let totalDiscovered = 0;
        let totalCreated = 0;
        let totalEnriched = 0;
        let totalErrors = 0;

        for (const cfg of agendaConfigs) {
          const ownerLabel = cfg.organizer_id ? `organizer:${cfg.organizer_id}` : `location:${cfg.location_id}`;
          send({ type: "config_start", label: ownerLabel, url: cfg.agenda_url });

          try {
            const urls = await discoverEventUrlsFromAgenda(cfg);
            const limited = MAX_EVENTS_PER_CONFIG > 0 
              ? urls.slice(0, MAX_EVENTS_PER_CONFIG) 
              : urls;
            totalDiscovered += limited.length;
            send({ type: "urls_discovered", count: limited.length, total: totalDiscovered });

            for (const eventUrl of limited) {
              // Vérifier si l'URL existe déjà
              const { data: existingBySourceUrl } = await serviceSupabase
                .from("user_requests")
                .select("id, status, event_data")
                .eq("request_type", "event_from_url")
                .eq("source_url", eventUrl)
                .maybeSingle();

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

              if (existing) {
                send({ type: "url_skipped", url: eventUrl });
                continue;
              }

              // Créer la demande
              let locationName: string | null = null;
              if (cfg.location_id) {
                const { data: loc } = await serviceSupabase.from("locations").select("name").eq("id", cfg.location_id).maybeSingle();
                locationName = (loc?.name as string) || null;
              }

              const initialEventData: any = {
                scraping_url: eventUrl,
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

              totalCreated += 1;
              send({ 
                type: "request_created", 
                url: eventUrl,
                count: totalCreated,
                title: initialEventData.title || "Nouvelle demande"
              });

              // Enrichir
              const scrapeRes = await scrapeEventPage({
                url: eventUrl,
                organizer_id: cfg.organizer_id || null,
                location_id: cfg.location_id || null,
                supabase: serviceSupabase,
              });

              if (scrapeRes.ok) {
                const { data: currentData } = await serviceSupabase
                  .from("user_requests")
                  .select("event_data")
                  .eq("id", inserted.id)
                  .single();

                const mergedEventData: any = { ...(currentData?.event_data || {}) };
                if (cfg.organizer_id) mergedEventData.organizer_id = cfg.organizer_id;
                if (cfg.location_id) mergedEventData.location_id = cfg.location_id;
                if (!mergedEventData.scraping_url) {
                  mergedEventData.scraping_url = eventUrl;
                }
                Object.assign(mergedEventData, scrapeRes.data);

                await serviceSupabase
                  .from("user_requests")
                  .update({ event_data: mergedEventData })
                  .eq("id", inserted.id);

                totalEnriched += 1;
                send({ 
                  type: "request_enriched", 
                  url: eventUrl,
                  title: mergedEventData.title || "Événement enrichi"
                });
              }
            }
          } catch (e: any) {
            totalErrors += 1;
            send({ type: "error", error: `${ownerLabel}: ${e?.message || "Erreur inconnue"}` });
          }
        }

        send({ 
          type: "complete", 
          discovered: totalDiscovered,
          created: totalCreated,
          enriched: totalEnriched,
          errors: totalErrors
        });
        controller.close();
      } catch (error: any) {
        send({ type: "error", error: error.message || "Erreur inconnue" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

