"use client";

import type { EventStatus } from "@/app/(admin)/admin/components/events/types";
import { AGENT_ACTOR } from "@/lib/agent/actor";
import { supabase } from "@/lib/supabase/client";

/*
 * Suivi de l'agent Claude dans l'admin : ses créations sont lues dans le journal
 * d'audit (actor_email = AGENT_ACTOR, voir lib/agent/audit.ts). Une ligne
 * event.create par événement annoncé : entity_id est sa première séance.
 */

/** Sans action de l'agent pendant ce délai, l'action suivante ouvre un nouveau passage. */
const PASS_GAP_MS = 2 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

type AgentLogRow = {
  action: string;
  metadata: { status?: unknown } | null;
  created_at: string;
};

export type AgentPass = {
  startedAt: string;
  endedAt: string;
  published: number;
  pending: number;
  artistsCreated: number;
  locationsCreated: number;
  organizersCreated: number;
};

/** Fiches créées par l'agent au fil d'une collecte, en plus des événements. */
const CREATIONS = ["artist.create", "location.create", "organizer.create"];

export type AgentPublishedEvent = {
  id: string;
  title: string;
  publishedAt: string;
  /** Fiche actuelle, null si l'événement a été supprimé depuis. */
  current: { date: string; status: EventStatus; locationName: string | null } | null;
};

export type AgentActivity = {
  lastPass: AgentPass | null;
  /** Les 5 derniers événements publiés directement par l'agent. */
  published: AgentPublishedEvent[];
};

function eventStatusOf(row: AgentLogRow) {
  return row.action === "event.create" ? row.metadata?.status : null;
}

/** Regroupe les actions les plus récentes (triées de la plus récente à la plus ancienne) en un passage. */
function getLastPass(rows: AgentLogRow[]): AgentPass | null {
  const pass: AgentLogRow[] = [];
  for (const row of rows) {
    const later = pass[pass.length - 1];
    if (later && Date.parse(later.created_at) - Date.parse(row.created_at) > PASS_GAP_MS) break;
    pass.push(row);
  }
  if (pass.length === 0) return null;

  return {
    startedAt: pass[pass.length - 1].created_at,
    endedAt: pass[0].created_at,
    published: pass.filter((row) => eventStatusOf(row) === "approved").length,
    pending: pass.filter((row) => eventStatusOf(row) === "pending").length,
    artistsCreated: pass.filter((row) => row.action === "artist.create").length,
    locationsCreated: pass.filter((row) => row.action === "location.create").length,
    organizersCreated: pass.filter((row) => row.action === "organizer.create").length,
  };
}

export async function fetchAgentActivity(): Promise<AgentActivity> {
  const [recentRes, publishedRes] = await Promise.all([
    supabase
      .from("admin_audit_log")
      .select("action, metadata, created_at")
      .eq("actor_email", AGENT_ACTOR)
      .in("action", ["event.create", ...CREATIONS])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("admin_audit_log")
      .select("entity_id, entity_label, created_at")
      .eq("actor_email", AGENT_ACTOR)
      .eq("action", "event.create")
      .eq("metadata->>status", "approved")
      .not("entity_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (recentRes.error) throw recentRes.error;
  if (publishedRes.error) throw publishedRes.error;

  const rows = ((recentRes.data || []) as AgentLogRow[]).filter((row) => {
    if (CREATIONS.includes(row.action)) return true;
    const status = eventStatusOf(row);
    return status === "approved" || status === "pending";
  });

  const publishedRows = (publishedRes.data || []) as Array<{
    entity_id: string;
    entity_label: string | null;
    created_at: string;
  }>;
  const currentById = new Map<string, any>();
  if (publishedRows.length > 0) {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, date, status, location:locations(name)")
      .in("id", publishedRows.map((row) => row.entity_id));
    if (error) throw error;
    for (const event of data || []) currentById.set(event.id, event);
  }

  return {
    lastPass: getLastPass(rows),
    published: publishedRows.map((row) => {
      const current = currentById.get(row.entity_id);
      const location = Array.isArray(current?.location) ? current.location[0] : current?.location;
      return {
        id: row.entity_id,
        title: current?.title || row.entity_label || "(Sans titre)",
        publishedAt: row.created_at,
        current: current
          ? { date: current.date, status: current.status as EventStatus, locationName: location?.name ?? null }
          : null,
      };
    }),
  };
}

/** Identifiants des événements créés par l'agent (entity_id des lignes event.create). */
export async function fetchAgentEventIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("entity_id")
      .eq("actor_email", AGENT_ACTOR)
      .eq("action", "event.create")
      .not("entity_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data || []) if (row.entity_id) ids.add(row.entity_id);
    if (!data || data.length < PAGE_SIZE) return ids;
  }
}
