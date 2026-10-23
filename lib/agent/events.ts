import { getSourceKind } from "@/lib/collecte/source-kind";
import { fromDatetimeLocal } from "@/lib/date-utils";
import { splitArtistNames } from "@/lib/events/artist-names";
import {
  buildEventFormPrefillFromImport,
  matchExistingTagIds,
  normalizeName,
  resolveLocationFromImportedData,
  resolveOrganizerFromName,
} from "@/lib/events/import-prefill";
import { festivalFiche, isFestivalCategory } from "@/lib/events/festivals";
import type { ImportedEventPayload } from "@/lib/events/imported-event-payload";
import { fetchPotentialDuplicateEvents } from "@/lib/events/potential-duplicates";
import { toNullablePrice } from "@/lib/events/price-utils";
import { isYoungAudience } from "@/lib/events/young-audience";
import { isFacebookEventUrl } from "@/lib/facebook/event-url";
import { scrapeFacebookEvent } from "@/lib/facebook/scrape-facebook-event";
import { instagramPostImageUrl, isInstagramPostUrl } from "@/lib/instagram/post-url";
import { urlMatchKey, urlMatchKeys } from "@/lib/scraping/agenda";
import { parisToday, titleDateConflict } from "@/lib/scraping/dates";
import { onSortEventUid } from "@/lib/scraping/on-sort";
import { scrapeEventPage } from "@/lib/scraping/scrape-event-page";

import { findOrCreateArtist, type AgentArtistInput } from "./artists";
import { logAgentAction } from "./audit";
import { hasTimeLeft, invalidateAgentReferences, loadAgentReferences, type AgentContext } from "./context";
import { copyImageToStorage } from "./images";
import { announcedRoom, findOrCreateRoom, findRoom } from "./locations";
import { resolveKnownSource, type AgentSource } from "./sources";

/*
 * Création d'événements par l'agent. Règle de publication :
 * - source suivie (active) ET fiche complète (heure, lieu, catégorie, affiche)
 *   → publié directement ;
 * - sinon → en attente de validation dans l'admin.
 * Les doublons (même page, même créneau au même lieu, même titre le même jour) sont écartés ;
 * deux séances à la même heure dans deux salles d'un même lieu n'en sont pas.
 * Une date douteuse (page qui se contredit, titre qui annonce un autre jour) n'est pas créée :
 * l'agent relit la page et passe par create_event (statut « to_check »).
 * Salle : demandée (`room`), sinon annoncée avec le lieu (« Théâtre d'Orléans - Salle Vitez ») ; créée
 * dans le lieu si elle n'y est pas encore.
 */

export type AgentEventStatus = "published" | "pending" | "duplicate" | "to_check" | "skipped" | "error";

export type AgentEventResult = {
  status: AgentEventStatus;
  url?: string | null;
  title?: string;
  start?: string;
  event_ids?: string[];
  occurrences?: number;
  /** Ce qui manque pour une publication directe (événement laissé en attente). */
  missing?: string[];
  reason?: string;
  duplicate_of?: { id: string; title: string | null; date: string | null };
  source?: string | null;
  location?: string | null;
  /** Salle du lieu où a lieu la séance (rooms). */
  room?: string;
  /** Salle créée dans le lieu pour cette séance. */
  room_created?: boolean;
  /** Salle demandée sans lieu connu : ignorée. */
  room_unmatched?: string;
  /** Lieu annoncé sans fiche correspondante (à créer ou à préciser via search). */
  location_unmatched?: string;
  /** Lieu annoncé et son adresse, gardés dans l'adresse de l'événement en attente. */
  announced_venue?: string;
  category?: string | null;
  /** Jeune public (events.is_young_audience). */
  young_audience?: boolean;
  artists?: string[];
  artists_created?: string[];
  artists_unmatched?: string[];
  /** Noms écartés à la création (événement non musical, titre, prénom seul, atelier…), avec la raison. */
  artists_skipped?: Array<{ name: string; reason: string }>;
  /** Correction appliquée à la date lue (année d'après le jour de la semaine…). */
  date_note?: string;
  /** Festival auquel l'événement est rattaché (il le nomme, ses dates le couvrent) : l'équipe peut défaire. */
  festival?: string;
  /** Fait partie d'un festival qui n'est pas dans l'app : à signaler, et à proposer de créer. */
  festival_unknown?: string;
  /** Festival du même nom dans l'app, mais à d'autres dates : non rattaché. */
  festival_out_of_dates?: string;
  /** Festival créé : ses lieux, reconnus dans son texte (le premier est celui de la fiche). */
  festival_venues?: string[];
  /** Lieux du festival sans fiche (à créer avec upsert_location, puis à ajouter dans l'admin). */
  festival_venues_unmatched?: string[];
  dry_run?: boolean;
};

/** Événement lu par l'agent lui-même (post Instagram, page Facebook, affiche…). */
export type AgentEventInput = {
  title: string;
  /** Début, heure de Paris : « 2026-11-20T20:30 » (ou « 2026-11-20 » si l'heure est inconnue). */
  start: string;
  end?: string;
  additional_dates?: Array<{ start: string; end?: string }>;
  location?: string;
  location_id?: string;
  /** Salle du lieu (« Salle Vitez ») : rattachée à la séance, créée si le lieu ne l'a pas encore. */
  room?: string;
  address?: string;
  organizers?: string[];
  artists?: Array<string | AgentArtistInput>;
  category?: string;
  tags?: string[];
  description?: string;
  image_url?: string;
  ticket_url?: string;
  price_min?: number;
  price_max?: number;
  is_free?: boolean;
  is_pay_what_you_want?: boolean;
  is_full?: boolean;
  is_cancelled?: boolean;
  /** Jeune public : pensé pour les enfants ou les familles. */
  is_young_audience?: boolean;
  door_opening_time?: string;
  /** Festival dont l'événement fait partie, tel qu'annoncé (« dans le cadre du festival … »). */
  festival?: string;
  /** Pour un festival entier : les lieux qu'il nomme. */
  festival_venues?: string[];
};

type DuplicateMatch = { id: string; title: string | null; date: string | null; reason: string };

const DUPLICATE_SELECT = "id, title, date, end_date, category, scraping_url, external_url, instagram_url, facebook_url";

/** Ce que la règle des festivals lit d'un doublon possible (`festivalFiche`). */
type DuplicateCandidate = { id: string; date: string; end_date?: string | null; category?: string | null };

function titleTokens(value: string) {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

/** Titres équivalents : identiques, l'un contenu dans l'autre, ou mots largement communs. */
function similarTitles(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeName(left || "");
  const b = normalizeName(right || "");
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  if (shorter.length >= 6 && (a.includes(b) || b.includes(a))) return true;
  const tokensA = new Set(titleTokens(a));
  const tokensB = new Set(titleTokens(b));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  const common = [...tokensA].filter((token) => tokensB.has(token)).length;
  return common / (tokensA.size + tokensB.size - common) >= 0.6;
}

/** « Maison des associations, 46 ter rue Sainte-Catherine, Orléans » : nom du lieu annoncé et adresse. */
function announcedVenueOf(name: unknown, address: unknown) {
  const venue = typeof name === "string" ? name.trim() : "";
  const street = typeof address === "string" ? address.trim() : "";
  if (!venue) return street || null;
  if (!street || normalizeName(street).includes(normalizeName(venue))) return venue;
  return normalizeName(venue).includes(normalizeName(street)) ? venue : `${venue}, ${street}`;
}

function sameDay(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.slice(0, 10) === right.slice(0, 10));
}

async function findDuplicateEvent(
  ctx: AgentContext,
  { urls, title, start, end, locationId, room, venueWindowMinutes, notDuplicate }: {
    urls: Array<string | null | undefined>;
    title: string;
    /** Début au format du formulaire (« AAAA-MM-JJTHH:mm », heure de Paris). */
    start: string;
    end?: string;
    locationId?: string;
    /** Salle de la séance, si elle est connue (`id` vide : salle pas encore créée). */
    room?: { id: string | null } | null;
    /** Agenda partagé : même lieu à cet écart près (en minutes) = même événement, quel que soit le titre. */
    venueWindowMinutes?: number;
    /**
     * Ce qui ne peut pas être un doublon : un festival et un événement qui n'en est pas un (Fulgurances et sa
     * soirée Micro, même lieu, même heure, titres proches).
     */
    notDuplicate: (candidate: DuplicateCandidate) => boolean;
  },
): Promise<DuplicateMatch | null> {
  const startIso = fromDatetimeLocal(start);
  const day = start.slice(0, 10);
  // Même lieu mais une autre salle connue des deux côtés : une autre séance (trois salles au Théâtre d'Orléans).
  const otherRoom = (roomId: string | null | undefined) => Boolean(room && roomId && roomId !== room.id);

  // Même page déjà importée, pour un événement du même jour ou au même titre
  // (un post peut annoncer plusieurs événements différents).
  const keys = new Set(urls.flatMap((url) => urlMatchKeys(url)));
  if (keys.size > 0) {
    const { data } = await ctx.supabase.from("events").select(DUPLICATE_SELECT);
    for (const row of (data || []) as any[]) {
      if (notDuplicate(row)) continue;
      const urlMatch = [row.scraping_url, row.external_url, row.instagram_url, row.facebook_url].some(
        (value) => typeof value === "string" && urlMatchKeys(value).some((key) => keys.has(key)),
      );
      if (urlMatch && (sameDay(row.date, startIso) || similarTitles(row.title, title))) {
        return { id: row.id, title: row.title, date: row.date, reason: "Page déjà importée" };
      }
    }
  }

  // Agenda partagé (On sort !) : un spectacle y est souvent annoncé à une heure un peu différente de celle
  // du lieu (ouverture des portes) et sous un autre titre.
  if (locationId && venueWindowMinutes) {
    const startMs = Date.parse(startIso);
    const margin = venueWindowMinutes * 60_000;
    const { data: nearby } = await ctx.supabase
      .from("events")
      .select("id, title, date, end_date, category, room_id")
      .eq("location_id", locationId)
      .eq("archived", false)
      .gte("date", new Date(startMs - margin).toISOString())
      .lte("date", new Date(startMs + margin).toISOString());
    const near = ((nearby || []) as Array<DuplicateCandidate & { title: string | null; room_id: string | null }>).find(
      (event) => !otherRoom(event.room_id) && !notDuplicate(event),
    );
    if (near) return { id: near.id, title: near.title, date: near.date, reason: "Même lieu, à deux heures près" };
  }

  // Même lieu, même horaire (même début : l'heure de fin manque souvent d'un côté, comme sur On sort !).
  if (locationId) {
    const overlapping = await fetchPotentialDuplicateEvents({
      supabase: ctx.supabase,
      locationId,
      startValue: startIso,
      endValue: end ? fromDatetimeLocal(end) : startIso,
    }).catch(() => []);
    const sameSlot = overlapping.filter(
      (event) =>
        (event.matchKind === "exact" || Date.parse(event.date) === Date.parse(startIso)) && !notDuplicate(event),
    );
    const rooms = new Map<string, string | null>();
    if (room && sameSlot.length) {
      const { data } = await ctx.supabase.from("events").select("id, room_id").in("id", sameSlot.map((event) => event.id));
      for (const row of (data || []) as Array<{ id: string; room_id: string | null }>) rooms.set(row.id, row.room_id);
    }
    const exact = sameSlot.find((event) => !otherRoom(rooms.get(event.id)));
    if (exact) return { id: exact.id, title: exact.title, date: exact.date, reason: "Même lieu, même horaire" };
  }

  // Même titre le même jour, où que ce soit.
  const { data: sameDayEvents } = await ctx.supabase
    .from("events")
    .select("id, title, date, end_date, category")
    .gte("date", `${day}T00:00:00.000Z`)
    .lte("date", `${day}T23:59:59.999Z`);
  const similar = ((sameDayEvents || []) as any[]).find(
    (event) => !notDuplicate(event) && similarTitles(event.title, title),
  );
  if (similar) return { id: similar.id, title: similar.title, date: similar.date, reason: "Même titre le même jour" };

  return null;
}

/** Doublon probable repéré au scan : événement existant (`id`) ou autre entrée du même agenda (`url`). */
export type AgendaDuplicate = { id?: string; url?: string; title: string | null; date: string | null; reason: string };

/** Agenda partagé (On sort !) : même lieu à deux heures près = même événement, quel que soit le titre. */
export const SHARED_AGENDA_VENUE_WINDOW_MINUTES = 120;

/**
 * Doublons probables d'un agenda partagé (On sort !) avant tout import, en une requête : titre
 * équivalent à celui d'un événement existant le même jour (ou pendant une exposition en cours),
 * événement existant au même lieu à deux heures près, ou entrée déjà vue le même jour sous un titre
 * équivalent (un événement publié deux fois dans l'agenda).
 * import_urls applique de toute façon findDuplicateEvent à chaque fiche.
 */
export async function findAgendaDuplicates(
  ctx: AgentContext,
  events: Array<{ url: string; title: string | null; date: string | null; known?: boolean; venue?: string; address?: string }>,
): Promise<Map<string, AgendaDuplicate>> {
  const duplicates = new Map<string, AgendaDuplicate>();
  const dated = events.filter((event): event is typeof event & { title: string; date: string } =>
    Boolean(event.title && event.date),
  );
  if (dated.length === 0) return duplicates;

  const days = dated.map((event) => event.date.slice(0, 10)).sort();
  const [first, last] = [days[0], days[days.length - 1]];
  const { data } = await ctx.supabase
    .from("events")
    .select("id, title, date, end_date, location_id, archived")
    .lte("date", `${last}T23:59:59.999Z`)
    .or(`date.gte.${first}T00:00:00.000Z,end_date.gte.${first}T00:00:00.000Z`);
  const existing = (data || []) as Array<{
    id: string;
    title: string | null;
    date: string | null;
    end_date: string | null;
    location_id: string | null;
    archived: boolean | null;
  }>;
  const locations = dated.some((event) => event.venue) ? (await loadAgentReferences(ctx)).locations : [];
  const margin = SHARED_AGENDA_VENUE_WINDOW_MINUTES * 60_000;

  const seen: Array<{ url: string; title: string; date: string; venue?: string }> = [];
  // Publié deux fois dans l'agenda (par le lieu et par la compagnie) : titre équivalent le même jour ;
  // même lieu annoncé à la même heure (souvent un plateau : deux groupes, une soirée).
  const sameDayTitle = (left: { title: string; date: string }, right: typeof left) =>
    left.date.slice(0, 10) === right.date.slice(0, 10) && similarTitles(left.title, right.title);
  const sameSlot = (left: { date: string; venue?: string }, right: typeof left) =>
    Boolean(left.venue && right.venue && left.date === right.date && normalizeName(left.venue) === normalizeName(right.venue));
  for (const event of dated) {
    const day = event.date.slice(0, 10);
    if (!event.known) {
      const sameTitle = existing.find(
        (row) =>
          row.date &&
          row.date.slice(0, 10) <= day &&
          day <= (row.end_date || row.date).slice(0, 10) &&
          similarTitles(row.title, event.title),
      );
      const location =
        !sameTitle && event.venue ? resolveLocationFromImportedData(locations, event.venue, event.address) : null;
      const start = Date.parse(fromDatetimeLocal(event.date.slice(0, 16)));
      // Comme à l'import : un événement archivé ne bloque pas un autre au même lieu.
      const sameVenue = location
        ? existing.find(
            (row) =>
              !row.archived &&
              row.location_id === location.id &&
              row.date &&
              Math.abs(Date.parse(row.date) - start) <= margin,
          )
        : undefined;
      const twin = sameTitle || sameVenue ? undefined : seen.find((other) => sameDayTitle(other, event));
      const slot = sameTitle || sameVenue || twin ? undefined : seen.find((other) => sameSlot(other, event));
      if (sameTitle) {
        duplicates.set(event.url, { id: sameTitle.id, title: sameTitle.title, date: sameTitle.date, reason: "Même titre le même jour" });
      } else if (sameVenue) {
        duplicates.set(event.url, {
          id: sameVenue.id,
          title: sameVenue.title,
          date: sameVenue.date,
          reason: "Même lieu, à deux heures près",
        });
      } else if (twin) {
        duplicates.set(event.url, { url: twin.url, title: twin.title, date: twin.date, reason: "Deux fois dans l'agenda" });
      } else if (slot) {
        duplicates.set(event.url, {
          url: slot.url,
          title: slot.title,
          date: slot.date,
          reason: "Même lieu, même heure dans l'agenda (plateau ?)",
        });
      }
      if (sameTitle || sameVenue || twin || slot) continue;
    }
    seen.push(event);
  }
  return duplicates;
}

/** Prévient les comptes organisateurs, comme lors d'une validation manuelle. */
async function notifyOrganizersOfPublication(ctx: AgentContext, eventId: string, title: string) {
  try {
    const { data: links } = await ctx.supabase
      .from("event_organizers")
      .select("organizer_id, location_id")
      .eq("event_id", eventId);
    const organizerIds = ((links || []) as any[])
      .map((row) => row.organizer_id || row.location_id)
      .filter(Boolean);
    if (organizerIds.length === 0) return;
    const { data: members } = await ctx.supabase
      .from("user_organizers")
      .select("user_id")
      .in("organizer_id", organizerIds);
    const userIds = [...new Set(((members || []) as any[]).map((row) => row.user_id).filter(Boolean))];
    if (userIds.length === 0) return;
    await ctx.supabase.from("organizer_notifications").insert(
      userIds.map((userId) => ({
        user_id: userId,
        event_id: eventId,
        type: "event_approved",
        title: "Événement publié",
        message: `Votre événement "${title}" est maintenant visible sur la plateforme.`,
        read: false,
        metadata: { new_status: "approved", via: "agent" },
      })),
    );
  } catch (error) {
    console.warn("Notification des organisateurs ignorée:", error);
  }
}

/**
 * Crée un événement (une fiche par séance) à partir de données importées, après
 * rapprochement avec les lieux, organisateurs, artistes, catégories et tags.
 */
export async function createAgentEvent(
  ctx: AgentContext,
  args: {
    data: ImportedEventPayload;
    sourceUrl: string | null;
    /** Source suivie d'où vient l'événement (publication directe possible). */
    source: AgentSource | null;
    /** Lieu ou organisateur à rattacher quand aucune source n'est connue. */
    ownerId?: string | null;
    /** Organisateurs supplémentaires (identifiants). */
    extraOrganizerIds?: string[];
    /** Détails des artistes à créer (compte Instagram, photo…), par nom normalisé. */
    artistDetails?: Map<string, AgentArtistInput>;
    createMissingArtists: boolean;
  },
): Promise<AgentEventResult> {
  const { data, sourceUrl, source } = args;
  const references = await loadAgentReferences(ctx);
  const ownerId = source?.owner?.id || args.ownerId || null;
  const owner = ownerId ? references.organizers.find((entry) => entry.id === ownerId) : undefined;
  const base: AgentEventResult = {
    status: "skipped",
    url: sourceUrl,
    title: typeof data.title === "string" ? data.title.trim() : undefined,
    source: source?.name ?? null,
    dry_run: ctx.dryRun || undefined,
  };

  if (data.is_cancelled === true) return { ...base, reason: "Annoncé annulé" };

  // Plateaux « A + B » et mentions « 1ère partie » : un nom par artiste, quelle que soit la source.
  const artistNames = splitArtistNames(data.artists);
  const { prefill, warnings, festival } = await buildEventFormPrefillFromImport({
    data: { ...data, artists: artistNames },
    sourceUrl: sourceUrl || undefined,
    owner,
    categories: references.categories,
    locations: references.locations,
    organizers: references.organizers,
    artists: references.artists,
    festivals: references.festivals,
    findOrCreateTagIds: async (names) => matchExistingTagIds(names, references.tags),
    defaultStatus: "pending",
  });
  const form = prefill.form || {};
  const festivalLocationIds = prefill.festivalLocationIds || [];
  // Lieu annoncé mais inconnu : on ne retombe pas sur le lieu de la source (événement « hors les murs ») ; un
  // festival garde le premier de ses lieux reconnus.
  const locationWarning = warnings.find((warning) => warning.field === "location");
  if (locationWarning && typeof data.location_id !== "string" && festivalLocationIds.length === 0) form.location_id = "";
  // Titre déjà nettoyé par le préremplissage (date, lieu répété, capitales : lib/collecte/event-text.ts) ;
  // la date écrite dans le titre lu sert encore au contrôle des séances.
  const rawTitle = typeof data.title === "string" ? data.title.trim() : "";
  const title = (form.title || "").trim();
  if (!title) return { ...base, reason: "Titre introuvable" };
  if (!form.date) return { ...base, title, reason: "Date introuvable" };

  // Séances à venir ou en cours (une exposition ouverte jusqu'au 7 mars s'ajoute encore), chacune avec son
  // lien de billetterie quand la page en donne un par séance.
  const today = parisToday();
  const slots = [
    { date: form.date, end_date: form.end_date || "", external_url: "" },
    ...(prefill.additionalDates || []).map((slot) => ({
      date: slot.date,
      end_date: slot.end_date || "",
      external_url: (slot.external_url || "").trim(),
    })),
  ].filter(
    (slot, index, all) =>
      slot.date && (slot.end_date || slot.date).slice(0, 10) >= today && all.findIndex((other) => other.date === slot.date) === index,
  );
  if (slots.length === 0) return { ...base, title, start: form.date, reason: "Déjà passé" };
  const start = slots[0].date;
  const end = slots[0].end_date || undefined;

  // Date douteuse : rien n'est créé, l'agent relit la page et utilise create_event avec la bonne date.
  const dateWarning =
    (typeof data.date_warning === "string" && data.date_warning) ||
    titleDateConflict(rawTitle, [form.date, ...(prefill.additionalDates || []).map((slot) => slot.date)]);
  if (dateWarning) return { ...base, status: "to_check", title, start, reason: `Date à vérifier : ${dateWarning}` };

  const organizerIds = [...(prefill.organizerIds || [])];
  for (const id of args.extraOrganizerIds || []) if (!organizerIds.includes(id)) organizerIds.push(id);

  const location = form.location_id ? references.locations.find((entry) => entry.id === form.location_id) || null : null;
  // Salle : demandée (`room`), sinon annoncée avec le nom du lieu (« Théâtre d'Orléans - Salle Vitez »).
  const requestedRoom = typeof data.room === "string" ? data.room.trim() : "";
  const roomName = location
    ? requestedRoom || announcedRoom(references.rooms, location, [data.location as string | undefined]).name
    : null;
  const knownRoom = location && roomName ? findRoom(references.rooms, location.id, roomName) : null;

  // Page de la source elle-même (agenda en texte seul, profil) : elle annonce plusieurs événements,
  // parfois le même spectacle à plusieurs dates. Son adresse ne désigne pas un événement : restent
  // les règles « même lieu, même horaire » et « même titre le même jour ».
  const sourcePageKey = urlMatchKey(sourceUrl);
  const fromSourcePage = Boolean(
    sourcePageKey && [source?.url, source?.scan_url].some((value) => urlMatchKey(value) === sourcePageKey),
  );
  // Un festival n'est le doublon que d'un festival ; un autre événement, jamais d'un festival (`festivalFiche` :
  // une séance rangée en Festival reste un événement). Sans fin connue d'un côté ou de l'autre, pas de règle.
  const importFiche = festivalFiche({ category: form.category, date: form.date || "", end_date: form.end_date }, references.categories);
  const duplicate = await findDuplicateEvent(ctx, {
    urls: fromSourcePage ? [] : [sourceUrl, data.instagram_url as string, data.facebook_url as string],
    title,
    start,
    end,
    locationId: form.location_id || undefined,
    room: roomName ? { id: knownRoom?.id ?? null } : null,
    venueWindowMinutes: sourceUrl && onSortEventUid(sourceUrl) ? SHARED_AGENDA_VENUE_WINDOW_MINUTES : undefined,
    notDuplicate: (candidate) => {
      const candidateFiche = importFiche === null ? null : festivalFiche(candidate, references.categories);
      return candidateFiche !== null && candidateFiche !== importFiche;
    },
  });
  if (duplicate) {
    return {
      ...base,
      status: "duplicate",
      title,
      start,
      reason: duplicate.reason,
      duplicate_of: { id: duplicate.id, title: duplicate.title, date: duplicate.date },
    };
  }

  const category = form.category ? references.categories.find((entry) => entry.id === form.category) || null : null;

  // Artistes : fiches existantes, sinon création (artistes musicaux de concerts ou DJ sets uniquement,
  // jamais au nom du titre de l'événement).
  const artistIds = [...(prefill.artistIds || [])];
  const matchedNames = new Set(
    references.artists.filter((artist) => artistIds.includes(artist.id)).map((artist) => normalizeName(artist.name)),
  );
  const artistsCreated: string[] = [];
  const artistsUnmatched: string[] = [];
  const artistsSkipped: Array<{ name: string; reason: string }> = [];
  for (const name of artistNames) {
    if (matchedNames.has(normalizeName(name))) continue;
    const detail = args.artistDetails?.get(normalizeName(name)) || { name };
    const result = await findOrCreateArtist(ctx, detail, {
      create: args.createMissingArtists,
      event: { title, category: category?.name ?? null },
    });
    if (result.id && !artistIds.includes(result.id)) artistIds.push(result.id);
    if (result.created) artistsCreated.push(result.name);
    else if (!result.id && args.createMissingArtists && result.skipped) artistsSkipped.push({ name: result.name, reason: result.skipped });
    else if (!result.id) artistsUnmatched.push(name);
  }

  // Post Instagram : son affiche, même sans lien d'image (les liens signés du CDN ne se recopient pas).
  const imageSource =
    instagramPostImageUrl(form.image_url) ||
    form.image_url ||
    instagramPostImageUrl(sourceUrl) ||
    instagramPostImageUrl(data.instagram_url as string | undefined);
  const image = imageSource
    ? await copyImageToStorage(ctx, imageSource, { bucket: "event-images" })
    : { url: "", copied: false };

  const room = location && roomName ? await findOrCreateRoom(ctx, location, roomName) : null;
  // Lieu annoncé sans fiche : gardé dans l'adresse de l'événement pour la validation (le formulaire de
  // l'admin la remplace par celle du lieu choisi).
  const announcedVenue = location ? null : announcedVenueOf(locationWarning?.value || data.location, data.address);
  const description = (form.description || "").trim();
  const sourceTags = Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const youngAudience =
    data.is_young_audience === true ||
    isYoungAudience({ title, description, tags: sourceTags, category: category?.name });
  const missing = [
    data.time_known === false ? "heure" : null,
    !location ? "lieu" : null,
    !category ? "catégorie" : null,
    !image.url ? "affiche" : null,
  ].filter((value): value is string => Boolean(value));
  const publish = Boolean(source && source.status === "active") && missing.length === 0;
  const status = publish ? "approved" : "pending";

  const isPayWhatYouWant = Boolean(form.is_pay_what_you_want);
  const priceMin = toNullablePrice(form.price_min);
  const priceMax = toNullablePrice(form.price_max);
  const row = {
    title,
    description: description || null,
    category: form.category || "",
    price: isPayWhatYouWant ? null : priceMin,
    price_min: isPayWhatYouWant ? null : priceMin,
    price_max: isPayWhatYouWant || priceMax === null || priceMin === null || priceMax <= priceMin ? null : priceMax,
    is_pay_what_you_want: isPayWhatYouWant,
    capacity: form.capacity ? Number.parseInt(form.capacity, 10) || null : null,
    is_full: Boolean(form.is_full),
    location_id: location?.id || null,
    room_id: room?.id || null,
    door_opening_time: (form.door_opening_time || "").trim() || null,
    external_url: (form.external_url || "").trim() || null,
    external_url_label: (form.external_url_label || "").trim() || null,
    instagram_url: (form.instagram_url || "").trim() || null,
    facebook_url: (form.facebook_url || "").trim() || null,
    scraping_url: (form.scraping_url || "").trim() || null,
    image_url: image.url || null,
    status,
    is_featured: false,
    hide_from_home: false,
    tag_ids: prefill.tagIds || [],
    address: location?.address || announcedVenue || null,
    latitude: location?.latitude || null,
    longitude: location?.longitude || null,
    is_young_audience: youngAudience,
    created_by: null,
    ...(form.festival_id ? { festival_id: form.festival_id } : {}),
  };
  const result: AgentEventResult = {
    ...base,
    status: publish ? "published" : "pending",
    title,
    start,
    occurrences: slots.length,
    missing: missing.length ? missing : undefined,
    reason: publish
      ? undefined
      : !source
        ? "Source non suivie : à valider dans l'admin"
        : source.status !== "active"
          ? "Source en pause : à valider dans l'admin"
          : `Fiche incomplète (${missing.join(", ")}) : à compléter et valider dans l'admin`,
    location: location?.name ?? null,
    room: room?.name,
    room_created: room?.created || undefined,
    room_unmatched: !location && requestedRoom ? requestedRoom : undefined,
    location_unmatched: !location && locationWarning?.value ? locationWarning.value : undefined,
    announced_venue: announcedVenue || undefined,
    category: category?.name ?? null,
    young_audience: youngAudience || undefined,
    artists: references.artists.filter((artist) => artistIds.includes(artist.id)).map((artist) => artist.name),
    artists_created: artistsCreated.length ? artistsCreated : undefined,
    artists_unmatched: artistsUnmatched.length ? artistsUnmatched : undefined,
    artists_skipped: artistsSkipped.length ? artistsSkipped : undefined,
    date_note: typeof data.date_note === "string" ? data.date_note : undefined,
    festival: festival.attached?.title,
    festival_unknown: festival.unknownName ?? undefined,
    festival_out_of_dates: festival.outOfDates?.title,
    festival_venues: festivalLocationIds.length
      ? festivalLocationIds.map((id) => references.locations.find((entry) => entry.id === id)?.name ?? id)
      : undefined,
    festival_venues_unmatched: festival.unmatchedVenues.length ? festival.unmatchedVenues : undefined,
  };
  if (ctx.dryRun) return result;

  const eventIds: string[] = [];
  for (const slot of slots) {
    const { data: created, error } = await ctx.supabase
      .from("events")
      .insert([
        {
          ...row,
          date: fromDatetimeLocal(slot.date) || slot.date,
          end_date: slot.end_date ? fromDatetimeLocal(slot.end_date) || null : null,
          external_url: slot.external_url || row.external_url,
        },
      ])
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message || "Événement non créé");
    eventIds.push(created.id);

    if (organizerIds.length) {
      const { error: organizerError } = await ctx.supabase.from("event_organizers").insert(
        organizerIds.map((id) =>
          references.organizers.find((organizer) => organizer.id === id)?.type === "location"
            ? { event_id: created.id, location_id: id, organizer_id: null }
            : { event_id: created.id, organizer_id: id, location_id: null },
        ),
      );
      if (organizerError) throw new Error(organizerError.message);
    }
    if (artistIds.length) {
      const { error: artistError } = await ctx.supabase.from("event_artists").insert(
        artistIds.map((artistId, index) => ({
          event_id: created.id,
          artist_id: artistId,
          sort_index: index,
          role_label: null,
        })),
      );
      if (artistError) throw new Error(artistError.message);
    }
    // Un festival : ses lieux, dans l'ordre de son texte (le premier est celui de la fiche).
    if (festivalLocationIds.length) {
      const { error: festivalLocationsError } = await ctx.supabase.from("festival_locations").insert(
        festivalLocationIds.map((locationId, sortIndex) => ({
          festival_id: created.id,
          location_id: locationId,
          sort_index: sortIndex,
        })),
      );
      if (festivalLocationsError) throw new Error(festivalLocationsError.message);
    }
    if (publish) await notifyOrganizersOfPublication(ctx, created.id, title);
  }

  // Un festival créé : les événements suivants de la collecte s'y rattachent.
  if (isFestivalCategory(form.category, references.categories)) invalidateAgentReferences(ctx);

  await logAgentAction(ctx, {
    action: "event.create",
    entityType: "event",
    entityId: eventIds[0],
    entityLabel: title,
    metadata: {
      status,
      source_id: source?.id ?? null,
      source_url: sourceUrl,
      occurrences: eventIds.length,
      missing,
      ...(festival.attached ? { festival_id: festival.attached.id, festival: festival.attached.title } : {}),
      ...(festival.unknownName ? { festival_unknown: festival.unknownName } : {}),
    },
  });

  return { ...result, event_ids: eventIds };
}

/** Données lues par l'agent → format d'import commun. */
function toImportedPayload(input: AgentEventInput, sourceUrl: string | null): ImportedEventPayload {
  const kind = sourceUrl ? getSourceKind(sourceUrl) : "website";
  const artists = (input.artists || [])
    .map((artist) => (typeof artist === "string" ? artist : artist?.name))
    .filter((name): name is string => typeof name === "string" && Boolean(name.trim()));
  return {
    title: input.title,
    description: input.description,
    date: input.start,
    end_date: input.end,
    time_known: /T\d{1,2}:\d{2}/.test(input.start || ""),
    occurrences: (input.additional_dates || []).map((slot) => ({ date: slot.start, end_date: slot.end })),
    location: input.location,
    location_id: input.location_id,
    room: input.room,
    address: input.address,
    artists,
    category: input.category,
    tags: input.tags,
    image_url: input.image_url,
    external_url: input.ticket_url,
    external_url_label: input.ticket_url ? "Billetterie" : undefined,
    price_min: input.is_free ? 0 : input.price_min,
    price_max: input.is_free ? undefined : input.price_max,
    is_pay_what_you_want: input.is_pay_what_you_want,
    is_full: input.is_full,
    is_cancelled: input.is_cancelled,
    is_young_audience: input.is_young_audience,
    door_opening_time: input.door_opening_time,
    festival_name: input.festival,
    festival_venues: input.festival_venues,
    instagram_url: kind === "instagram" ? sourceUrl ?? undefined : undefined,
    facebook_url: kind === "facebook" ? sourceUrl ?? undefined : undefined,
  };
}

/** Événement lu par l'agent dans le navigateur (post, page, affiche). */
export async function createAgentEventFromInput(
  ctx: AgentContext,
  {
    event,
    sourceId,
    sourceUrl,
    createMissingArtists = true,
  }: { event: AgentEventInput; sourceId?: string | null; sourceUrl?: string | null; createMissingArtists?: boolean },
) {
  const references = await loadAgentReferences(ctx);
  const source = await resolveKnownSource(ctx, { sourceId, url: sourceUrl });
  const extraOrganizerIds = (event.organizers || [])
    .map((value) => references.organizers.find((organizer) => organizer.id === value) || resolveOrganizerFromName(references.organizers, value))
    .filter((organizer): organizer is NonNullable<typeof organizer> => Boolean(organizer))
    .map((organizer) => organizer.id);
  const artistDetails = new Map<string, AgentArtistInput>();
  for (const artist of event.artists || []) {
    if (artist && typeof artist === "object" && artist.name) artistDetails.set(normalizeName(artist.name), artist);
  }
  return createAgentEvent(ctx, {
    data: toImportedPayload(event, sourceUrl || null),
    sourceUrl: sourceUrl || null,
    source,
    extraOrganizerIds,
    artistDetails,
    createMissingArtists,
  });
}

/** Lieu (et salle) imposés aux pages importées : la page ne le donne pas, ou se trompe (« Adresse secrète »). */
export type AgentVenueOverride = { locationId?: string | null; room?: string | null };

/** Lit une page d'événement (site, billetterie, événement Facebook) puis crée l'événement. */
export async function importAgentEventFromUrl(
  ctx: AgentContext,
  {
    url,
    source,
    ownerId,
    venue,
    createMissingArtists = true,
  }: {
    url: string;
    source: AgentSource | null;
    ownerId?: string | null;
    venue?: AgentVenueOverride;
    createMissingArtists?: boolean;
  },
): Promise<AgentEventResult> {
  if (isInstagramPostUrl(url)) {
    return {
      status: "error",
      url,
      reason: "Post Instagram : lis-le dans le navigateur puis utilise create_event avec ce que tu as lu.",
    };
  }

  let data: ImportedEventPayload;
  if (isFacebookEventUrl(url)) {
    const scraped = await scrapeFacebookEvent(url);
    if (!scraped.ok) return { status: "error", url, reason: scraped.error };
    data = scraped.data as ImportedEventPayload;
  } else {
    const owner = source?.owner || null;
    const effectiveOwnerId = owner?.id || ownerId || null;
    const references = effectiveOwnerId ? await loadAgentReferences(ctx) : null;
    const ownerType = owner?.type || references?.organizers.find((entry) => entry.id === effectiveOwnerId)?.type;
    const scraped = await scrapeEventPage({
      url,
      organizer_id: ownerType === "organizer" ? effectiveOwnerId : null,
      location_id: ownerType === "location" ? effectiveOwnerId : null,
      supabase: ctx.supabase,
    });
    if (!scraped.ok) return { status: "error", url, reason: scraped.error };
    data = scraped.data as unknown as ImportedEventPayload;
  }
  if (venue?.locationId) data = { ...data, location_id: venue.locationId };
  if (venue?.room) data = { ...data, room: venue.room };

  return createAgentEvent(ctx, { data, sourceUrl: url, source, ownerId, createMissingArtists });
}

/** Importe plusieurs pages d'événements (3 en parallèle), dans le temps imparti. */
export async function importAgentEventUrls(
  ctx: AgentContext,
  {
    urls,
    sourceId,
    ownerId,
    venue,
    createMissingArtists = true,
  }: {
    urls: string[];
    sourceId?: string | null;
    ownerId?: string | null;
    venue?: AgentVenueOverride;
    createMissingArtists?: boolean;
  },
) {
  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (venue?.locationId && !(await loadAgentReferences(ctx)).locations.some((location) => location.id === venue.locationId)) {
    throw new Error("Lieu introuvable : location_id doit venir de search ou d'upsert_location.");
  }
  const fixedSource = sourceId ? await resolveKnownSource(ctx, { sourceId }) : null;
  const results: AgentEventResult[] = [];
  const remaining: string[] = [];
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(3, unique.length) }, async () => {
      while (cursor < unique.length) {
        const url = unique[cursor];
        cursor += 1;
        // Une page prend jusqu'à ~20 s (lecture + IA) : au-delà de l'échéance, on rend la main.
        if (!hasTimeLeft(ctx, 20_000)) {
          remaining.push(url);
          continue;
        }
        try {
          const source = fixedSource || (await resolveKnownSource(ctx, { url }));
          results.push(await importAgentEventFromUrl(ctx, { url, source, ownerId, venue, createMissingArtists }));
        } catch (error) {
          results.push({ status: "error", url, reason: error instanceof Error ? error.message : "Erreur inconnue" });
        }
      }
    }),
  );

  const count = (status: AgentEventStatus) => results.filter((result) => result.status === status).length;
  return {
    summary: {
      published: count("published"),
      pending: count("pending"),
      duplicates: count("duplicate"),
      to_check: count("to_check"),
      skipped: count("skipped"),
      errors: count("error"),
    },
    results,
    remaining: remaining.length ? remaining : undefined,
    dry_run: ctx.dryRun || undefined,
  };
}
