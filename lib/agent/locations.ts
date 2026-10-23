import { normalizeName } from "@/lib/events/import-prefill";

import { tidyArtistName } from "./artists";
import { logAgentAction } from "./audit";
import {
  invalidateAgentReferences,
  loadAgentReferences,
  type AgentContext,
  type AgentLocation,
  type AgentRoom,
} from "./context";
import { geocodeAddress, type GeocodedAddress, type GeocodeResult } from "./geocode";
import {
  isUndisclosedPlace,
  linkKeyLabel,
  linkKeys,
  nameParts,
  nameProximity,
  normalizePlaceLinks,
  placeCore,
} from "./places";
import { settleCreatedOwnerSource, type CreatedOwnerSource } from "./sources";

/*
 * Lieux et salles créés par l'agent de collecte, comme dans l'admin : nom, adresse choisie dans la Base
 * Adresse Nationale (libellé et coordonnées), liens publics. Les triggers font le reste : nom mis en forme
 * (format_entity_label), ville tirée de l'adresse (sync_location_city), source de collecte pour un
 * lieu-organisateur qui a un lien (mise en pause ici, voir settleCreatedOwnerSource).
 *
 * Pas de fiche pour un lieu tu (« Adresse secrète »), sans adresse ou que la BAN ne trouve pas. Doublons
 * écartés : nom proche dans la même ville (à une autre adresse connue, ce n'est pas le même lieu), même
 * adresse (numéro et voie), nom d'une salle connue. Une fiche existante n'est jamais modifiée.
 */

export type AgentLocationInput = {
  name: string;
  address?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  short_description?: string | null;
  capacity?: number | null;
  /** Le lieu programme lui-même ses événements : il peut être choisi comme organisateur. */
  is_organizer?: boolean;
  /** Suivre sa source de collecte (lieu-organisateur avec un lien) ; en pause sinon. */
  follow?: boolean;
};

export type AgentLocationResult = {
  status: "created" | "exists" | "refused";
  id?: string | null;
  name: string;
  address?: string | null;
  city?: string | null;
  /** Fiche existante : ce qui la désigne (« même adresse », « nom proche »…). */
  matched_by?: string;
  /** Salle reconnue dans le nom demandé (« Théâtre d'Orléans - Salle Vitez ») : à passer à create_event. */
  room?: string;
  reason?: string;
  /** Lieux au nom proche dans d'autres villes : ce ne sont pas des doublons. */
  homonyms?: Array<{ id: string; name: string; city: string | null }>;
  source?: CreatedOwnerSource | { status: string } | null;
  dry_run?: boolean;
};

/** Ville comparable (« St-Jean-de-Braye » = « Saint-Jean-de-Braye »). */
function cityKey(label: string) {
  return normalizeName(label).replace(/\bst\b/g, "saint");
}

/** Ville écrite après le code postal d'une adresse (« 119 Rue de Bourgogne 45000 Orléans » → orleans). */
function writtenCityKey(address: string | null | undefined) {
  return cityKey(/\b\d{5}\s+([^,\d]+?)\s*$/.exec(address || "")?.[1] || "");
}

/** Ville d'une fiche : sa ville rattachée, sinon celle écrite après le code postal de son adresse. */
function cityKeyOf(location: AgentLocation) {
  return location.city?.label ? cityKey(location.city.label) : writtenCityKey(location.address);
}

/** Fiche de la ville donnée, ou dont la ville n'est pas connue (sans ville donnée : toutes). */
function inCity(location: AgentLocation, city: string | null) {
  const locationCity = cityKeyOf(location);
  return !city || !locationCity || locationCity === city;
}

/** Numéro et voie (« 119 rue de bourgogne »), si l'adresse en a un. */
function streetKeyOf(address: string | null | undefined) {
  const key = normalizeName((address || "").split(/,|\s(?=\d{5}\b)/)[0] || "");
  return /^\d+\s*(bis|ter)?\s+\S+\s+\S+/.test(key) ? key : "";
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** Numéro et voie d'une adresse de la BAN (« 119 rue de bourgogne »), vide pour une voie sans numéro. */
function geocodedStreetKey(address: GeocodedAddress) {
  return address.housenumber ? normalizeName(`${address.housenumber} ${address.street || ""}`) : "";
}

/** Même adresse : même numéro dans la même voie et la même ville, ou au même point de la BAN. */
function sameAddress(location: AgentLocation, address: GeocodedAddress) {
  const street = geocodedStreetKey(address);
  if (!street) return false;
  if (streetKeyOf(location.address) === street && inCity(location, cityKey(address.city))) return true;
  return (
    location.latitude != null &&
    location.longitude != null &&
    distanceMeters({ latitude: Number(location.latitude), longitude: Number(location.longitude) }, address) < 3
  );
}

/* ------------------------------------------------------------------ */
/* Salles                                                              */
/* ------------------------------------------------------------------ */

/** Salle comparable : sans article ni « salle » en tête (« Salle Vitez » = « Vitez » ; « Plateau Vitez » reste à part). */
export function roomCore(name: string) {
  return normalizeName(name)
    .replace(/^(l|le|la|les)\s+/, "")
    .replace(/^salle\s+((de|du|des|d)\s+)?/, "")
    .trim();
}

/** Morceau d'un lieu annoncé qui désigne une salle (« Salle Vitez », « Grande salle », « Plateau Barrault », « studio 2 »). */
const ROOM_WORD =
  /^((grande|petite) (salle|scene)|(la |le |l )?(salle|plateau|studio|auditorium|amphitheatre|amphi|chapiteau|foyer))\b/;

/** « salle C14 » → « Salle C14 » ; un nom en capitales passe en casse normale (« SALLE VITEZ » → « Salle Vitez »). */
export function tidyRoomName(name: string) {
  const tidy = tidyArtistName(name.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, ""));
  return tidy ? tidy.charAt(0).toUpperCase() + tidy.slice(1) : "";
}

/** Salle connue d'un lieu, d'après son nom exact (sans article ni « salle » en tête). */
export function findRoom(rooms: AgentRoom[], locationId: string, name: string) {
  const core = roomCore(name);
  return core ? (rooms.find((room) => room.location_id === locationId && roomCore(room.name) === core) ?? null) : null;
}

/**
 * Salle annoncée dans le nom du lieu lu (« Théâtre d'Orléans - Salle Vitez », « L'Alliage (salle Yvremont) ») :
 * une salle connue du lieu, sinon un morceau qui commence par « salle », « plateau », « studio »… à côté du nom du
 * lieu lui-même.
 */
export function announcedRoom(
  rooms: AgentRoom[],
  location: { id: string; name: string },
  announced: Array<string | null | undefined>,
): { room: AgentRoom | null; name: string | null } {
  for (const value of announced) {
    const parts = value ? nameParts(value) : [];
    if (parts.length < 2) continue;
    const others = parts.filter((part) => !nameProximity(part, location.name));
    // Le lieu lui-même doit être nommé à côté de la salle, sinon le morceau peut être un autre lieu.
    if (others.length === parts.length) continue;
    for (const part of others) {
      const room = findRoom(rooms, location.id, part);
      if (room) return { room, name: room.name };
    }
    const candidate = others.find((part) => ROOM_WORD.test(normalizeName(part)));
    if (candidate) return { room: null, name: tidyRoomName(candidate) };
  }
  return { room: null, name: null };
}

export type AgentRoomResult = { id: string | null; name: string; created: boolean };

/** Salles en cours de création, par appel d'outil : deux pages importées en parallèle (import_urls) n'en créent qu'une. */
const roomsInProgress = new WeakMap<AgentContext, Map<string, Promise<AgentRoomResult | null>>>();

/** Salle d'un lieu connu : retrouvée par son nom, sinon créée si `create`. Une salle existante n'est jamais modifiée. */
export async function findOrCreateRoom(
  ctx: AgentContext,
  location: { id: string; name: string },
  rawName: string,
  { create = true }: { create?: boolean } = {},
): Promise<AgentRoomResult | null> {
  const name = tidyRoomName(rawName || "");
  if (!name || !roomCore(name)) return null;
  const key = `${location.id} ${roomCore(name)}`;
  const inProgress = roomsInProgress.get(ctx) ?? new Map<string, Promise<AgentRoomResult | null>>();
  roomsInProgress.set(ctx, inProgress);
  const pending = inProgress.get(key);
  if (pending) return pending.then((room) => room && { ...room, created: false });
  const result = findOrCreateRoomOnce(ctx, location, name, create);
  if (create) inProgress.set(key, result);
  return result;
}

async function findOrCreateRoomOnce(
  ctx: AgentContext,
  location: { id: string; name: string },
  name: string,
  create: boolean,
): Promise<AgentRoomResult | null> {
  const references = await loadAgentReferences(ctx);
  const existing = findRoom(references.rooms, location.id, name);
  if (existing) return { id: existing.id, name: existing.name, created: false };
  // Le lieu lui-même, ou un lieu tu, n'est pas une salle.
  if (!create || nameProximity(name, location.name) === "same" || isUndisclosedPlace(name)) return null;
  if (ctx.dryRun) return { id: null, name, created: true };

  const { data, error } = await ctx.supabase
    .from("rooms")
    .insert({ location_id: location.id, name })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message || "Salle non créée");
  invalidateAgentReferences(ctx);
  await logAgentAction(ctx, {
    action: "room.create",
    entityType: "room",
    entityId: data.id,
    entityLabel: data.name,
    metadata: { location_id: location.id, location: location.name },
  });
  return { id: data.id, name: data.name, created: true };
}

/* ------------------------------------------------------------------ */
/* Lieux                                                               */
/* ------------------------------------------------------------------ */

function existingResult(location: AgentLocation, matchedBy: string, extra: Partial<AgentLocationResult> = {}): AgentLocationResult {
  return {
    status: "exists",
    id: location.id,
    name: location.name,
    address: location.address,
    city: location.city?.label ?? null,
    matched_by: matchedBy,
    ...extra,
  };
}

/**
 * Lieu existant pour ce nom dans la ville donnée (sans ville : un seul lieu de ce nom) : même nom (sans article,
 * accents ni ponctuation), nom composé dont un morceau est un lieu connu (« Le 108 – salle C14 » → Le 108,
 * salle « Salle C14 »), salle connue (« Salle Vitez » → Théâtre d'Orléans).
 */
function findByName(locations: AgentLocation[], rooms: AgentRoom[], name: string, city: string | null) {
  const same = locations.filter((location) => nameProximity(location.name, name) === "same" && inCity(location, city));
  if (same.length === 1 || (same.length > 1 && city)) return existingResult(same[0], "même nom");
  if (same.length > 1) return null;

  const parts = nameParts(name);
  if (parts.length > 1) {
    for (const part of parts) {
      const location = locations.find((entry) => nameProximity(entry.name, part) === "same" && inCity(entry, city));
      if (!location) continue;
      const rest = parts.filter((other) => other !== part);
      const room = rest.map((other) => findRoom(rooms, location.id, other)).find(Boolean);
      const roomName = room?.name || rest.find((other) => ROOM_WORD.test(normalizeName(other)));
      return existingResult(location, "nom du lieu", roomName ? { room: room?.name || tidyRoomName(roomName) } : {});
    }
  }

  if (placeCore(name).length < 5) return null;
  for (const room of rooms.filter((entry) => roomCore(entry.name) === roomCore(name))) {
    const location = locations.find((entry) => entry.id === room.location_id && inCity(entry, city));
    if (location) return existingResult(location, "salle de ce lieu", { room: room.name });
  }
  return null;
}

/**
 * Retrouve un lieu (nom, adresse, salle) ou le crée avec son adresse de la Base Adresse Nationale.
 * Refusé : nom ou adresse tus (« Adresse secrète »), adresse absente, vague (une ville), introuvable ou
 * incertaine, nom proche d'un lieu de la même ville (doublon probable, rien n'est créé).
 */
export async function findOrCreateLocation(ctx: AgentContext, input: AgentLocationInput): Promise<AgentLocationResult> {
  const name = (input.name || "").replace(/\s+/g, " ").trim();
  const base = { name, dry_run: ctx.dryRun || undefined };
  if (!name) return { ...base, status: "refused", reason: "Nom manquant" };
  if (isUndisclosedPlace(name) || isUndisclosedPlace(input.address)) {
    return {
      ...base,
      status: "refused",
      reason: "Lieu tu ou à confirmer (« Adresse secrète ») : pas de fiche ; le lieu annoncé reste dans l'événement.",
    };
  }

  const references = await loadAgentReferences(ctx);
  const address = (input.address || "").trim();
  // BAN injoignable : rien n'est créé (pas de lieu sans coordonnées), une fiche existante reste retrouvée.
  const geocoded: GeocodeResult | null = address
    ? await geocodeAddress(address).catch((error: Error) => ({ ok: false as const, reason: error.message }))
    : null;
  const place = geocoded?.ok ? geocoded.address : null;
  const city = place ? cityKey(place.city) : null;

  // Fiche existante : retrouvée même sans adresse, ou avec une adresse que la BAN ne trouve pas (dans la ville
  // écrite, s'il y en a une : « Salle des fêtes » d'Ingré n'est pas celle de Saran).
  const byName = findByName(references.locations, references.rooms, name, city || writtenCityKey(address) || null);
  if (byName) return { ...byName, dry_run: base.dry_run };
  if (!address) {
    return { ...base, status: "refused", reason: "Adresse manquante : un lieu se crée avec son adresse (numéro, rue, code postal, ville)." };
  }
  if (!place) return { ...base, status: "refused", reason: geocoded && !geocoded.ok ? geocoded.reason : "Adresse introuvable" };
  if (placeCore(name) === placeCore(place.city)) {
    return { ...base, status: "refused", reason: `« ${name} » est le nom de la ville : donne le nom du lieu.` };
  }

  // Même adresse : le même lieu sous un autre nom, ou une salle de ce lieu.
  const atAddress = references.locations.find((location) => sameAddress(location, place));
  if (atAddress) {
    return existingResult(atAddress, `même adresse (${place.label})`, {
      reason: "Une salle de ce lieu se rattache à la séance par `room` dans create_event.",
      dry_run: base.dry_run,
    });
  }

  // Nom proche dans la même ville : doublon, sauf si les deux adresses connues désignent deux numéros différents.
  const homonyms: NonNullable<AgentLocationResult["homonyms"]> = [];
  const street = geocodedStreetKey(place);
  for (const location of references.locations) {
    const proximity = nameProximity(location.name, name);
    if (!proximity) continue;
    if (!inCity(location, city)) {
      homonyms.push({ id: location.id, name: location.name, city: location.city?.label ?? null });
      continue;
    }
    const otherStreet = streetKeyOf(location.address);
    if (proximity === "close" && otherStreet && street && otherStreet !== street) continue;
    return existingResult(location, proximity === "same" ? "même nom" : "nom proche", {
      reason: proximity === "close" ? `Nom proche de « ${location.name} » dans la même ville : rien n'est créé.` : undefined,
      dry_run: base.dry_run,
    });
  }

  const { links, invalid } = normalizePlaceLinks(input);
  // Un lien déjà porté par un autre lieu : le même lieu sous un autre nom.
  const keys = linkKeys(links);
  for (const location of references.locations) {
    const shared = linkKeys(location).find((key) => keys.includes(key));
    if (shared) return existingResult(location, linkKeyLabel(shared), { dry_run: base.dry_run });
  }

  const isOrganizer = Boolean(input.is_organizer);
  const hasLink = Boolean(links.website_url || links.instagram_url || links.facebook_url);
  const created: AgentLocationResult = {
    ...base,
    status: "created",
    id: null,
    address: place.label,
    city: place.city,
    homonyms: homonyms.length ? homonyms : undefined,
    reason: invalid.length ? `Liens ignorés (ni un compte ni un site) : ${invalid.join(", ")}` : undefined,
    source: isOrganizer && hasLink ? { status: input.follow ? "active" : "paused" } : undefined,
  };
  if (ctx.dryRun) return created;

  const capacity = typeof input.capacity === "number" && input.capacity > 0 ? Math.round(input.capacity) : null;
  const { data, error } = await ctx.supabase
    .from("locations")
    .insert({
      name,
      address: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      ...links,
      short_description: input.short_description?.trim() || null,
      capacity,
      is_organizer: isOrganizer,
    })
    .select("id, name, address, city:cities(label)")
    .single();
  if (error || !data) throw new Error(error?.message || "Lieu non créé");
  // Nom mis en forme par format_entity_label, ville tirée de l'adresse par sync_location_city.
  const row = data as unknown as { id: string; name: string; address: string; city: { label: string } | Array<{ label: string }> | null };
  const cityLabel = (Array.isArray(row.city) ? row.city[0]?.label : row.city?.label) ?? null;
  invalidateAgentReferences(ctx);

  const source = isOrganizer && hasLink ? await settleCreatedOwnerSource(ctx, { type: "location", id: row.id }, Boolean(input.follow)) : null;
  await logAgentAction(ctx, {
    action: "location.create",
    entityType: "location",
    entityId: row.id,
    entityLabel: row.name,
    metadata: {
      address: row.address,
      city: cityLabel,
      is_organizer: isOrganizer,
      ...links,
      source_id: source?.id ?? null,
      source_status: source?.status ?? null,
    },
  });
  return { ...created, id: row.id, name: row.name, address: row.address, city: cityLabel ?? place.city, source: source ?? undefined };
}
