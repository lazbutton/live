import { NextRequest } from "next/server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  AGENDA_CONFIG_COLUMNS,
  runAgendaScraping,
  type AgendaConfigRow,
} from "@/lib/scraping/agenda-pipeline";

// Plan Vercel Hobby : 60 s maximum ; le scan s'arrête proprement avant.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/organizer/scrape-agenda-stream
 *
 * Lance le scan de l'agenda d'un organisateur ou d'un lieu, avec suivi en
 * temps réel (Server-Sent Events).
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const body = await request.json();
        const { organizer_id, location_id, max_events } = body;

        if (!organizer_id && !location_id) {
          send({ type: "error", error: "organizer_id ou location_id requis" });
          controller.close();
          return;
        }

        const userRole = user.app_metadata?.role;
        if (userRole !== "admin") {
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
          if (userOrg.role !== "owner" && userOrg.role !== "editor") {
            send({ type: "error", error: "Seuls les propriétaires et éditeurs peuvent déclencher le scraping" });
            controller.close();
            return;
          }
        }

        const serviceSupabase = createServiceClient();
        let query = serviceSupabase.from("organizer_agenda_scraping_configs").select(AGENDA_CONFIG_COLUMNS).eq("enabled", true);
        query = organizer_id ? query.eq("organizer_id", organizer_id) : query.eq("location_id", location_id);
        const { data: configs, error: cfgError } = await query;

        if (cfgError) {
          send({ type: "error", error: cfgError.message });
          controller.close();
          return;
        }
        if (!configs || configs.length === 0) {
          send({ type: "error", error: "Aucune configuration d'agenda active trouvée" });
          controller.close();
          return;
        }

        send({ type: "start", configs: configs.length });

        const maxEvents =
          max_events !== null && max_events !== undefined && Number(max_events) > 0
            ? Number(max_events)
            : Number(process.env.SCRAPE_EVENTS_MAX_PER_CONFIG || "25");

        const summary = await runAgendaScraping({
          supabase: serviceSupabase,
          configs: configs as AgendaConfigRow[],
          maxNewPerConfig: maxEvents,
          maxNewTotal: maxEvents * configs.length,
          deadline: startedAt + 52_000,
          onEvent: send,
        });

        send({
          type: "complete",
          discovered: summary.discovered,
          created: summary.created,
          enriched: summary.created,
          skipped: summary.skippedKnown + summary.skippedPast + summary.skippedCancelled,
          errors: summary.errors,
          truncated: summary.truncated,
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
      Connection: "keep-alive",
    },
  });
}
