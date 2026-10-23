import { z } from "zod";

import { normalizeSearchValue, resolveLocationFromImportedData } from "@/lib/events/import-prefill";
import type { AgendaUnreadableReason } from "@/lib/scraping/agenda";
import { scanAgendaPage } from "@/lib/scraping/agenda-scan";

import { findOrCreateArtist } from "./artists";
import { AGENT_ACTOR, loadAgentReferences, type AgentContext } from "./context";
import { createAgentEventFromInput, findAgendaDuplicates, importAgentEventUrls, type AgendaDuplicate } from "./events";
import { findOrCreateLocation } from "./locations";
import { findOrCreateOrganizer } from "./organizers";
import { isUndisclosedPlace } from "./places";
import { getAgentSource, listAgentSources, markAgentSourceReviewed } from "./sources";

/*
 * Outils exposés à Claude par le serveur MCP de l'admin (local ou HTTP).
 * Aucun outil ne supprime quoi que ce soit, ni ne modifie un événement, un lieu, une salle ou un organisateur.
 */

export type AgentToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type AgentTool<Schema extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  input: Schema;
  annotations: AgentToolAnnotations;
  run: (ctx: AgentContext, args: z.output<Schema>) => Promise<unknown>;
};

function defineTool<Schema extends z.ZodType>(tool: AgentTool<Schema>) {
  return tool as unknown as AgentTool;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
const localDate = (description: string) =>
  z.string().regex(LOCAL_DATE, "Format attendu : AAAA-MM-JJTHH:mm (heure de Paris, sans fuseau)").describe(description);

const artistInput = z.object({
  name: z.string().min(1).describe("Nom de scène."),
  instagram_url: z.string().optional().describe("Compte Instagram (lien ou @identifiant)."),
  image_url: z.string().url().optional().describe("Photo de l'artiste (lien direct vers l'image)."),
  origin_city: z.string().optional().describe("Ville d'origine."),
  short_description: z.string().optional().describe("Présentation courte, en français."),
  artist_type_label: z.string().optional().describe("Type : « DJ », « Groupe », « Chanteuse »…"),
});

const listSources = defineTool({
  name: "list_sources",
  title: "Sources à revoir",
  description:
    "Sources de collecte : sites, comptes Instagram et Facebook des lieux et organisateurs suivis. " +
    "Par défaut, seulement celles à revoir, les plus en retard d'abord. Pour un site ou une page Facebook, " +
    "`scan_url` est la page à lire avec scan_agenda ; pour Instagram, ouvre `url` dans le navigateur.",
  input: z.object({
    due_only: z.boolean().default(true).describe("Seulement les sources à revoir (vrai par défaut)."),
    kind: z.enum(["all", "website", "social"]).default("all").describe("website = sites ; social = Instagram et Facebook."),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (ctx, args) => {
    const sources = await listAgentSources(ctx, { dueOnly: args.due_only, kind: args.kind });
    return { count: sources.length, sources };
  },
});

/** Repli quand scan_agenda ne sait pas lire une page : l'agent la lit lui-même. */
function unreadableNextStep(reason: AgendaUnreadableReason, pageUrl: string) {
  const read =
    reason === "blocked" || reason === "empty"
      ? `Ouvre ${pageUrl} dans le navigateur (WebFetch risque d'être bloqué ou de ne pas voir l'agenda dessiné en JavaScript)`
      : `Lis ${pageUrl} avec WebFetch ou dans le navigateur`;
  return (
    `${read}. Pour chaque événement à venir : import_urls s'il a sa propre page lisible, sinon create_event avec ` +
    "source_id et source_url (sa page, ou cette page d'agenda). Marque la source revue seulement après cette lecture, " +
    "avec le nombre d'événements créés (0 si la page n'annonce vraiment rien) ; si la page reste illisible, ne la " +
    "marque pas et signale-la."
  );
}

const scanAgenda = defineTool({
  name: "scan_agenda",
  title: "Scanner un agenda",
  description:
    "Lit la page d'agenda d'un site, d'une billetterie (Socoop comprise) ou les événements à venir d'une page " +
    "Facebook publique, et liste les événements trouvés en signalant ceux déjà importés (`known`), passés " +
    "(`past`, d'après une date indicative : une exposition déjà ouverte peut y figurer) ou annulés (`cancelled`). " +
    "`to_import` contient les URL à passer à import_urls. Si l'adresse ne mène à rien, le lien « Agenda » du site " +
    "est suivi et renvoyé dans `agenda_url` (à signaler pour corriger la source). `unreadable` : la page n'a rien " +
    "donné d'exploitable (bloquée, agenda en texte seul, liens qui ne sont pas des événements) et `to_import` est " +
    "vide ; un résultat vide ne veut pas dire qu'elle n'annonce rien : lis-la toi-même (voir `unreadable.next_step`) " +
    "avant de marquer la source revue. Agenda On sort ! d'Orléans Métropole (sortir.orleans-metropole.fr) : lu par " +
    "son API sur le mois à venir ; seule la scène locale et indépendante est gardée (concerts, spectacles, danse, " +
    "expositions, cinéma, festivals) : jeune public, institutions (mairies, médiathèques, musées, tourisme, Scène " +
    "nationale), conférences, musique classique, loisirs et tributes sont comptés dans `excluded`. Chaque événement " +
    "donne son lieu (`venue`, `address`) et son organisateur ; les doublons probables (même titre le même jour, même " +
    "lieu à deux heures près, publié deux fois) sont signalés dans `duplicate_of` et sortis de `to_import`. " +
    "`unknown_venues` : lieux des événements à importer qui n'ont pas de fiche ; crée avec upsert_location ceux qui ont " +
    "une adresse précise avant import_urls. Aucune écriture.",
  input: z
    .object({
      source_id: z.string().optional().describe("Source à scanner (list_sources) : sa page d'agenda est utilisée."),
      url: z.string().url().optional().describe("Ou directement l'adresse d'une page d'agenda."),
    })
    .refine((value) => Boolean(value.source_id || value.url), "Donne source_id ou url."),
  annotations: { readOnlyHint: true, openWorldHint: true },
  run: async (ctx, args) => {
    const source = args.source_id ? await getAgentSource(ctx, args.source_id) : null;
    if (args.source_id && !source) throw new Error("Source introuvable.");
    const url = args.url || source?.scan_url;
    if (!url) throw new Error("Cette source n'a pas de site à scanner : ouvre-la dans le navigateur.");
    const scan = await scanAgendaPage(ctx.supabase, {
      url,
      organizerId: source?.owner?.type === "organizer" ? source.owner.id : null,
      locationId: source?.owner?.type === "location" ? source.owner.id : null,
    });
    // Agenda partagé par des dizaines d'organisateurs, dont beaucoup sont déjà suivis par ailleurs.
    const duplicates =
      scan.method === "onsort" ? await findAgendaDuplicates(ctx, scan.events) : new Map<string, AgendaDuplicate>();
    // Page inexploitable : rien à importer d'office (liens « Accueil », « Youtube »…), la page est à relire.
    const toImport = scan.unreadable
      ? []
      : scan.events.filter((event) => !event.known && !event.past && !event.cancelled && !duplicates.has(event.url));
    const excluded = Object.values(scan.excluded || {}).reduce((total, count) => total + count, 0);
    // Lieux annoncés sans fiche (On sort !), hors lieux tus (« Adresse secrète ») : à créer avant l'import.
    const locations = toImport.some((event) => event.venue) ? (await loadAgentReferences(ctx)).locations : [];
    const unknownVenues = new Map<string, { venue: string; address?: string; events: number }>();
    for (const event of toImport) {
      if (!event.venue || isUndisclosedPlace(event.venue)) continue;
      if (resolveLocationFromImportedData(locations, event.venue, event.address)) continue;
      const key = normalizeSearchValue(event.venue);
      const entry = unknownVenues.get(key) || { venue: event.venue, address: event.address, events: 0 };
      entry.events += 1;
      unknownVenues.set(key, entry);
    }
    return {
      source: source ? { id: source.id, name: source.name } : null,
      url,
      agenda_url: scan.agendaUrl,
      method: scan.method,
      pages_visited: scan.pagesVisited,
      errors: scan.errors.length ? scan.errors : undefined,
      unreadable: scan.unreadable
        ? { ...scan.unreadable, next_step: unreadableNextStep(scan.unreadable.reason, scan.agendaUrl || url) }
        : undefined,
      counts: {
        found: scan.events.length,
        excluded: scan.excluded ? excluded : undefined,
        known: scan.events.filter((event) => event.known).length,
        duplicates: scan.method === "onsort" ? duplicates.size : undefined,
        past: scan.events.filter((event) => event.past).length,
        cancelled: scan.events.filter((event) => event.cancelled).length,
        to_import: toImport.length,
      },
      excluded: excluded ? scan.excluded : undefined,
      to_import: toImport.map((event) => event.url),
      unknown_venues: unknownVenues.size ? [...unknownVenues.values()] : undefined,
      events: scan.events.map(({ url: eventUrl, title, date, known, past, cancelled, venue, address, organizer }) => ({
        url: eventUrl,
        title,
        date,
        venue,
        address,
        organizer,
        known,
        past,
        cancelled,
        duplicate_of: duplicates.get(eventUrl),
      })),
    };
  },
});

const importUrls = defineTool({
  name: "import_urls",
  title: "Importer des pages d'événements",
  description:
    "Lit des pages d'événements (site, billetterie, événement Facebook public), rapproche lieu, organisateurs, " +
    "artistes et catégorie, écarte les doublons puis crée les événements. Publication directe si la source est " +
    "suivie et la fiche complète (heure, lieu, catégorie, affiche) ; sinon en attente de validation. Statut " +
    "`to_check` : la date est douteuse (page qui se contredit, titre qui annonce un autre jour), rien n'est créé ; " +
    "relis la page et utilise create_event avec la bonne date. Pour les posts Instagram, utilise plutôt " +
    "create_event. Si `remaining` est renvoyé, rappelle l'outil avec ces URL. La salle annoncée avec le lieu " +
    "(« Théâtre d'Orléans - Salle Vitez ») est rattachée à la séance (`room`, `room_created`). Lieu sans fiche : " +
    "`location_unmatched` ; crée-le avant l'import (upsert_location) plutôt qu'après.",
  input: z.object({
    urls: z.array(z.string().url()).min(1).max(25).describe("Pages d'événements à importer (une page = un événement)."),
    source_id: z.string().optional().describe("Source suivie d'où viennent ces pages (list_sources)."),
    owner_id: z.string().optional().describe("Lieu ou organisateur à rattacher si aucune source n'est connue."),
    location_id: z
      .string()
      .optional()
      .describe(
        "Lieu de tous ces événements (search ou upsert_location), quand les pages ne le donnent pas ou se trompent " +
          "(« Adresse secrète » alors que le titre nomme le lieu).",
      ),
    room: z.string().optional().describe("Salle de ce lieu pour tous ces événements (créée si le lieu ne l'a pas)."),
    create_missing_artists: z
      .boolean()
      .default(true)
      .describe("Créer les fiches des artistes musicaux absents, pour les concerts et DJ sets (vrai par défaut)."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  run: (ctx, args) =>
    importAgentEventUrls(ctx, {
      urls: args.urls,
      sourceId: args.source_id,
      ownerId: args.owner_id,
      venue: { locationId: args.location_id, room: args.room },
      createMissingArtists: args.create_missing_artists,
    }),
});

const createEvent = defineTool({
  name: "create_event",
  title: "Créer un événement lu",
  description:
    "Crée un événement à partir de ce que tu as lu toi-même (post Instagram, page Facebook, affiche). Indique " +
    "`source_id` et `source_url` : un événement d'une source suivie dont la fiche est complète (heure, lieu, " +
    "catégorie, affiche) est publié directement, sinon il attend une validation. Lieu, organisateurs, artistes, " +
    "catégorie et tags sont rapprochés des fiches existantes ; les artistes musicaux absents sont créés (concerts " +
    "et DJ sets seulement). Lieu ou organisateur sans fiche : crée-le d'abord (upsert_location, upsert_organizer) " +
    "et passe son identifiant. Doublons écartés. Post Instagram : sans `image_url`, l'affiche du post est reprise " +
    "automatiquement. Exposition déjà ouverte : `start` = ouverture, `end` = dernier jour.",
  input: z.object({
    source_id: z.string().optional().describe("Source suivie d'où vient l'événement (list_sources)."),
    source_url: z.string().url().optional().describe("Lien du post ou de la page lue."),
    title: z.string().min(2).describe("Titre court et propre, en casse normale, sans emoji, ni date, ni lieu."),
    start: localDate("Début, heure de Paris : 2026-11-20T20:30 (ou 2026-11-20 si l'heure est inconnue)."),
    end: localDate("Fin éventuelle, même format.").optional(),
    additional_dates: z
      .array(z.object({ start: localDate("Début de la séance."), end: localDate("Fin de la séance.").optional() }))
      .optional()
      .describe("Autres séances du même événement (une fiche par séance)."),
    location: z.string().optional().describe("Nom du lieu tel qu'annoncé."),
    location_id: z.string().optional().describe("Identifiant du lieu s'il est connu (search, upsert_location)."),
    room: z
      .string()
      .optional()
      .describe(
        "Salle du lieu où a lieu la séance (« Salle Vitez », « Plateau Barrault », « Grande salle »), pour un lieu à " +
          "plusieurs salles : rattachée, ou créée si le lieu ne l'a pas encore (search donne ses salles connues).",
      ),
    address: z.string().optional(),
    organizers: z
      .array(z.string())
      .optional()
      .describe("Organisateurs (noms ou identifiants : search, upsert_organizer)."),
    artists: z
      .array(z.union([z.string(), artistInput]))
      .optional()
      .describe(
        "Artistes musicaux programmés (musiciens, groupes, DJ ; ni compagnie, ni humoriste, ni animateur) : noms, " +
          "ou objets avec compte Instagram et photo pour créer leur fiche.",
      ),
    category: z.string().optional().describe("Catégorie (voir la liste ci-dessus)."),
    tags: z.array(z.string()).optional().describe("Tags existants uniquement (aucun n'est créé)."),
    description: z.string().optional().describe("Description en français, reformulée à partir du texte lu."),
    image_url: z
      .string()
      .url()
      .optional()
      .describe("Affiche : lien direct vers l'image (copiée dans le stockage). Facultatif pour un post Instagram."),
    ticket_url: z.string().url().optional().describe("Billetterie."),
    price_min: z.number().min(0).optional(),
    price_max: z.number().min(0).optional(),
    is_free: z.boolean().optional(),
    is_pay_what_you_want: z.boolean().optional().describe("Prix libre."),
    is_full: z.boolean().optional().describe("Complet."),
    is_cancelled: z.boolean().optional().describe("Annulé : rien n'est créé."),
    is_young_audience: z
      .boolean()
      .optional()
      .describe(
        "Jeune public : pensé pour les enfants ou les familles (conte, spectacle « dès 3 ans », atelier 7-10 ans, " +
          "boum). Repéré aussi d'après le titre et la description.",
      ),
    door_opening_time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("Ouverture des portes (HH:mm)."),
    create_missing_artists: z.boolean().default(true),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: (ctx, args) => {
    const { source_id, source_url, create_missing_artists, ...event } = args;
    return createAgentEventFromInput(ctx, {
      event,
      sourceId: source_id,
      sourceUrl: source_url,
      createMissingArtists: create_missing_artists,
    });
  },
});

const upsertArtist = defineTool({
  name: "upsert_artist",
  title: "Trouver ou créer un artiste",
  description:
    "Retrouve la fiche d'un artiste (par nom ou compte Instagram) ou la crée avec ses informations " +
    "(photo copiée dans le stockage). Artistes musicaux uniquement (musiciens, groupes, DJ). Ne modifie jamais " +
    "une fiche existante.",
  input: artistInput,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: (ctx, args) => findOrCreateArtist(ctx, args, { create: true }),
});

const followInput = z
  .boolean()
  .default(false)
  .describe(
    "Suivre sa source de collecte (relue à chaque collecte, publication directe) : seulement si l'utilisateur l'a " +
      "demandé. Faux par défaut : la source créée avec la fiche reste en pause, l'utilisateur l'active dans l'admin.",
  );

const upsertLocation = defineTool({
  name: "upsert_location",
  title: "Trouver ou créer un lieu",
  description:
    "Retrouve un lieu (nom, adresse, salle d'un lieu connu) ou le crée avec son adresse, géocodée par la Base " +
    "Adresse Nationale : l'adresse enregistrée est celle de la BAN, la ville en découle. Refusé (`refused`, avec la " +
    "raison) : « Adresse secrète » ou lieu à confirmer, adresse absente, réduite à une ville, introuvable ou " +
    "incertaine, et nom proche d'un lieu de la même ville (doublon probable). `exists` : la fiche existante " +
    "(`matched_by`) ; `room` y désigne une salle à passer à create_event. Une salle n'est pas un lieu. Ne modifie " +
    "jamais une fiche existante. Passe ensuite l'identifiant à create_event (location_id) ou import_urls.",
  input: z.object({
    name: z.string().min(2).describe("Nom du lieu tel qu'il se présente (« L'Improviste Bar »), sans ville."),
    address: z
      .string()
      .optional()
      .describe("Adresse complète, lue sur le site du lieu : numéro, rue, code postal et ville (« 119 rue de Bourgogne, 45000 Orléans »)."),
    website_url: z.string().optional().describe("Site du lieu."),
    instagram_url: z.string().optional().describe("Compte Instagram (lien ou @identifiant)."),
    facebook_url: z.string().optional().describe("Page Facebook."),
    short_description: z.string().optional().describe("Présentation courte, en français."),
    capacity: z.number().int().min(1).optional().describe("Nombre de places."),
    is_organizer: z
      .boolean()
      .default(false)
      .describe("Lieu qui programme lui-même ses événements (bar, salle, tiers-lieu) : il peut en être l'organisateur."),
    follow: followInput,
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  run: (ctx, args) => findOrCreateLocation(ctx, args),
});

const upsertOrganizer = defineTool({
  name: "upsert_organizer",
  title: "Trouver ou créer un organisateur",
  description:
    "Retrouve un organisateur (même compte Instagram, page Facebook ou site, ou nom proche, lieux-organisateurs " +
    "compris) ou le crée : association, collectif, compagnie, programmateur qui organise l'événement. Il faut au " +
    "moins un lien (site, Instagram ou Facebook) lu sur ses pages. `exists` avec `type: \"location\"` : c'est un " +
    "lieu. Ne modifie jamais une fiche existante. Passe ensuite son identifiant dans `organizers` de create_event.",
  input: z.object({
    name: z.string().min(2).describe("Nom de la structure tel qu'elle l'écrit (« Orlin's Comedy »)."),
    website_url: z.string().optional().describe("Site de la structure (pas celui d'un lieu ou d'une billetterie)."),
    instagram_url: z.string().optional().describe("Compte Instagram (lien ou @identifiant)."),
    facebook_url: z.string().optional().describe("Page Facebook."),
    short_description: z.string().optional().describe("Présentation courte, en français."),
    follow: followInput,
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: (ctx, args) => findOrCreateOrganizer(ctx, args),
});

const search = defineTool({
  name: "search",
  title: "Chercher dans l'admin",
  description:
    "Cherche des lieux (avec leurs salles), organisateurs, artistes, catégories ou tags par nom (sans accents ni casse).",
  input: z.object({
    type: z.enum(["location", "organizer", "artist", "category", "tag"]),
    query: z.string().optional().describe("Texte à chercher ; vide = les premiers par ordre alphabétique."),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (ctx, args) => {
    const references = await loadAgentReferences(ctx);
    const roomsOf = (locationId: string) =>
      references.rooms.filter((room) => room.location_id === locationId).map((room) => room.name);
    const pools: Record<typeof args.type, Array<Record<string, unknown> & { id: string; name: string }>> = {
      location: references.locations.map((location) => ({
        id: location.id,
        name: location.name,
        address: location.address ?? null,
        ...(roomsOf(location.id).length ? { rooms: roomsOf(location.id) } : {}),
      })),
      organizer: references.organizers.map((organizer) => ({ id: organizer.id, name: organizer.name, type: organizer.type })),
      artist: references.artists.map((artist) => ({ id: artist.id, name: artist.name })),
      category: references.categories.map((category) => ({ id: category.id, name: category.name })),
      tag: references.tags.map((tag) => ({ id: tag.id, name: tag.name })),
    };
    const query = normalizeSearchValue(args.query || "");
    const matches = pools[args.type]
      .filter((entry) => !query || normalizeSearchValue(entry.name).includes(query))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
    return { count: matches.length, results: matches.slice(0, args.limit) };
  },
});

const markSourceReviewed = defineTool({
  name: "mark_source_reviewed",
  title: "Marquer une source revue",
  description:
    "Marque une source comme revue : elle quitte la liste « À revoir » jusqu'à sa prochaine échéance. À appeler " +
    "après avoir traité chaque source, même sans nouvel événement.",
  input: z.object({
    source_id: z.string(),
    imported_count: z.number().int().min(0).default(0).describe("Nombre d'événements créés depuis cette source."),
  }),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  run: (ctx, args) => markAgentSourceReviewed(ctx, args.source_id, args.imported_count),
});

const recentActivity = defineTool({
  name: "recent_activity",
  title: "Activité récente de l'agent",
  description:
    "Ce que l'agent a créé récemment (événements publiés ou en attente, artistes, lieux, salles, organisateurs, " +
    "avec l'état de leur source de collecte) et le nombre total d'événements en attente de validation. Utile pour le " +
    "récapitulatif de fin de collecte.",
  input: z.object({ hours: z.number().min(1).max(168).default(24).describe("Fenêtre en heures (24 par défaut).") }),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (ctx, args) => {
    const since = new Date(Date.now() - args.hours * 3_600_000).toISOString();
    const [logRes, pendingRes] = await Promise.all([
      ctx.supabase
        .from("admin_audit_log")
        .select("action, entity_id, entity_label, metadata, created_at")
        .eq("actor_email", AGENT_ACTOR)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      ctx.supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    if (logRes.error) throw logRes.error;
    const rows = (logRes.data || []) as Array<{
      action: string;
      entity_id: string | null;
      entity_label: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>;
    const events = rows.filter((row) => row.action === "event.create");
    return {
      since,
      published: events
        .filter((row) => row.metadata?.status === "approved")
        .map((row) => ({ id: row.entity_id, title: row.entity_label, at: row.created_at })),
      pending: events
        .filter((row) => row.metadata?.status !== "approved")
        .map((row) => ({ id: row.entity_id, title: row.entity_label, missing: row.metadata?.missing ?? [], at: row.created_at })),
      artists_created: rows
        .filter((row) => row.action === "artist.create")
        .map((row) => ({ id: row.entity_id, name: row.entity_label })),
      locations_created: rows
        .filter((row) => row.action === "location.create")
        .map((row) => ({
          id: row.entity_id,
          name: row.entity_label,
          address: row.metadata?.address ?? null,
          source: row.metadata?.source_status ?? undefined,
        })),
      rooms_created: rows
        .filter((row) => row.action === "room.create")
        .map((row) => ({ id: row.entity_id, name: row.entity_label, location: row.metadata?.location ?? null })),
      organizers_created: rows
        .filter((row) => row.action === "organizer.create")
        .map((row) => ({ id: row.entity_id, name: row.entity_label, source: row.metadata?.source_status ?? undefined })),
      pending_total: pendingRes.count ?? null,
      review_path: "/admin/events?status=pending",
      sources_path: "/admin/intake",
    };
  },
});

export const AGENT_TOOLS: AgentTool[] = [
  listSources,
  scanAgenda,
  importUrls,
  createEvent,
  upsertArtist,
  upsertLocation,
  upsertOrganizer,
  search,
  markSourceReviewed,
  recentActivity,
];

/** Schéma JSON d'entrée d'un outil (format MCP). */
export function toolInputSchema(tool: AgentTool) {
  const schema = z.toJSONSchema(tool.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** Descriptions enrichies au moment de la liste (catégories actives pour create_event). */
export async function describeAgentTools(ctx: AgentContext) {
  let categories: string[] = [];
  try {
    categories = (await loadAgentReferences(ctx)).categories.map((category) => category.name);
  } catch {
    // Liste indisponible : la catégorie reste rapprochée par son nom.
  }
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description:
      tool.name === "create_event" && categories.length
        ? `${tool.description} Catégories : ${categories.join(", ")}.`
        : tool.description,
    inputSchema: toolInputSchema(tool),
    annotations: { title: tool.title, ...tool.annotations },
  }));
}
