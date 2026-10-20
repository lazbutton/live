import { cleanEventDescription, cleanEventTitle } from "@/lib/collecte/event-text";

/*
 * Titres et descriptions des événements déjà en base, repassés par les règles de la collecte
 * (event-text.ts). Utilisé par scripts/clean-event-texts.mjs : simulation (liste avant → après),
 * puis écriture des seuls champs qui changent, tracée dans le journal d'audit.
 */

export type EventTextRow = {
  id: string;
  title: string | null;
  description: string | null;
  date: string | null;
  status: string | null;
  categoryName: string | null;
  locationName: string | null;
  /** Adresse : celle du lieu, ou le lieu annoncé d'un événement en attente (« Église Saint-Paterne, … »). */
  address: string | null;
  artistNames: string[];
};

export type EventTextChange = {
  id: string;
  date: string | null;
  status: string | null;
  title: { before: string; after: string } | null;
  description: { before: string; after: string } | null;
};

/** Changements à appliquer, sans rien écrire. */
export function planEventTextCleanup(
  rows: EventTextRow[],
  { knownNames, fields = ["title", "description"] }: { knownNames: string[]; fields?: Array<"title" | "description"> },
): EventTextChange[] {
  const changes: EventTextChange[] = [];
  for (const row of rows) {
    const title = row.title ?? "";
    const description = row.description ?? "";
    const newTitle = fields.includes("title")
      ? cleanEventTitle(title, {
          venues: [row.locationName, row.address?.split(",")[0]],
          category: row.categoryName,
          knownNames: [...knownNames, ...row.artistNames],
        })
      : title;
    const newDescription = fields.includes("description") && description ? cleanEventDescription(description) : description;
    const titleChange = newTitle && newTitle !== title ? { before: title, after: newTitle } : null;
    const descriptionChange = newDescription !== description ? { before: description, after: newDescription } : null;
    if (titleChange || descriptionChange) {
      changes.push({ id: row.id, date: row.date, status: row.status, title: titleChange, description: descriptionChange });
    }
  }
  return changes;
}

type Client = { from: (table: string) => any };

async function readAll<T>(query: () => any, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Événements non archivés (publiés ou en attente) et noms connus, lus avec la clé de service. */
export async function loadEventTextRows(supabase: Client) {
  const [events, categories, ...names] = await Promise.all([
    readAll<any>(() =>
      supabase
        .from("events")
        .select("id, title, description, date, status, category, address, location:locations(name), event_artists(artist:artists(name))")
        .eq("archived", false)
        .in("status", ["approved", "pending"])
        .order("date", { ascending: true }),
    ),
    readAll<{ id: string; name: string }>(() => supabase.from("categories").select("id, name")),
    ...["artists", "locations", "organizers", "tags"].map((table) =>
      readAll<{ name: string | null }>(() => supabase.from(table).select("name")),
    ),
  ]);
  const categoryNames = new Map(categories.map((row) => [row.id, row.name]));
  const rows: EventTextRow[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date,
    status: event.status,
    categoryName: event.category ? (categoryNames.get(event.category) ?? null) : null,
    locationName: event.location?.name ?? null,
    address: event.address ?? null,
    artistNames: ((event.event_artists || []) as any[]).map((link) => link.artist?.name).filter(Boolean),
  }));
  const knownNames = names.flat().map((row) => row.name).filter((name): name is string => Boolean(name));
  return { rows, knownNames };
}

/** Écrit les changements (un événement à la fois) et les trace dans le journal d'audit. */
export async function applyEventTextChanges(supabase: Client, changes: EventTextChange[], actor: string) {
  let updated = 0;
  const errors: Array<{ id: string; error: string }> = [];
  for (const change of changes) {
    const patch: Record<string, string | null> = {};
    if (change.title) patch.title = change.title.after;
    if (change.description) patch.description = change.description.after || null;
    const { error } = await supabase.from("events").update(patch).eq("id", change.id);
    if (error) {
      errors.push({ id: change.id, error: error.message });
      continue;
    }
    updated += 1;
    const { error: auditError } = await supabase.from("admin_audit_log").insert({
      actor_user_id: null,
      actor_email: actor,
      action: "event.text_cleanup",
      entity_type: "event",
      entity_id: change.id,
      entity_label: change.title?.after ?? null,
      metadata: {
        title_before: change.title?.before ?? null,
        title_after: change.title?.after ?? null,
        description_changed: Boolean(change.description),
        via: "script",
      },
    });
    if (auditError) console.warn(`Journal d'audit non enregistré pour ${change.id} : ${auditError.message}`);
  }
  return { updated, errors };
}

/** Rapport lisible : titres (avant → après, regroupés), puis chaque description modifiée en entier. */
export function formatCleanupReport(changes: EventTextChange[]) {
  const titles = new Map<string, { after: string; count: number }>();
  for (const change of changes) {
    if (!change.title) continue;
    const key = JSON.stringify([change.title.before, change.title.after]);
    titles.set(key, { after: change.title.after, count: (titles.get(key)?.count ?? 0) + 1 });
  }
  const descriptions = new Map<string, { after: string; count: number }>();
  for (const change of changes) {
    if (!change.description) continue;
    const entry = descriptions.get(change.description.before);
    descriptions.set(change.description.before, { after: change.description.after, count: (entry?.count ?? 0) + 1 });
  }
  const lines = [
    `# Titres et descriptions : ${changes.length} événements à corriger`,
    "",
    `## Titres (${[...titles.values()].reduce((sum, entry) => sum + entry.count, 0)} événements, ${titles.size} titres distincts)`,
    "",
    ...[...titles.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "fr"))
      .map(([key, entry]) => `- ${JSON.parse(key)[0]}  →  **${entry.after}**${entry.count > 1 ? ` (×${entry.count})` : ""}`),
    "",
    `## Descriptions (${[...descriptions.values()].reduce((sum, entry) => sum + entry.count, 0)} événements, ${descriptions.size} textes distincts)`,
  ];
  for (const [before, entry] of descriptions) {
    lines.push("", `### ${entry.count > 1 ? `×${entry.count} ` : ""}${before.slice(0, 60).replace(/\s+/g, " ")}…`, "", "Avant :", "", "```", before, "```", "", "Après :", "", "```", entry.after, "```");
  }
  return lines.join("\n");
}
