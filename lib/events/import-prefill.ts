/*
 * Rapprochement d'un événement importé (page, affiche, post) avec les référentiels :
 * lieu, organisateurs, artistes, catégorie, tags. Module pur, utilisable côté
 * navigateur comme côté serveur (outils de l'agent).
 */

import { toDatetimeLocal } from "@/lib/date-utils";
import {
  extractImportedCategoryLabels,
  resolveImportedCategory,
} from "@/lib/events/category-resolution";
import { deriveGenericPriceRange } from "@/lib/events/price-utils";
import {
  type ImportedEventPayload,
  type ImportedEventWarning,
} from "@/lib/events/imported-event-payload";
import type {
  ArtistOption,
  CategoryOption,
  EventFormPrefill,
  EventStatus,
  LocationData,
  OrganizerOption,
} from "@/app/(admin)/admin/components/events/types";

type BuildEventPrefillFromImportArgs = {
  data: ImportedEventPayload;
  sourceUrl?: string;
  owner?: OrganizerOption;
  categories: CategoryOption[];
  locations: LocationData[];
  organizers: OrganizerOption[];
  /** Artistes existants, rapprochés des artistes détectés sur la page. */
  artists?: ArtistOption[];
  findOrCreateTagIds?: (rawTagNames: string[]) => Promise<string[]>;
  defaultStatus?: EventStatus;
};

function normalizeImportedTagLabel(value: string) {
  return value
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, " ")
    .replace(/[|/]/g, " ")
    .replace(/[,:;]+$/g, "")
    .trim();
}

export function parseImportedTags(rawTags: unknown): string[] {
  const sourceValues = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === "string"
      ? [rawTags]
      : [];

  const splitValues = sourceValues.flatMap((value) =>
    String(value)
      .split(/[,\n;]+/)
      .map((part) => normalizeImportedTagLabel(part)),
  );

  const deduped = new Map<string, string>();
  for (const tag of splitValues) {
    if (!tag || tag.length < 2 || tag.length > 40) continue;
    const normalizedKey = normalizeSearchValue(tag);
    if (!normalizedKey) continue;
    if (!deduped.has(normalizedKey)) {
      deduped.set(normalizedKey, tag);
    }
  }

  return Array.from(deduped.values());
}

export function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nom sans article initial ni ponctuation (« L’Astrolabe » → « astrolabe », « Le 108 » → « 108 »). */
function coreName(value: string) {
  return normalizeName(value).replace(/^(l|le|la|les)\s+/, "").trim();
}

/**
 * Morceaux d'un nom composé : « Astrolabe – Grande salle », « Le 108, salle C14 », « A / B »,
 * « Salle du CREDO au 108 » (salle d'un lieu connu).
 */
function nameSegments(raw: string) {
  return raw
    .split(/\s+[–—-]\s+|\s*[,•/|(]\s*|\)|\s+(?:au|aux|à la|chez)\s+|\s+à l['’]\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Communes de la métropole, sous leur nom normalisé (« Saint » ou « St »). */
const METROPOLE_COMMUNES =
  "orleans|boigny sur bionne|bou|chanteau|checy|combleux|fleury les aubrais|ingre|(la )?chapelle (saint|st) mesmin|mardie|marigny les usages|olivet|ormes|(saint|st) cyr en val|(saint|st) denis en val|(saint|st) hilaire (saint|st) mesmin|(saint|st) jean de braye|(saint|st) jean de la ruelle|(saint|st) jean le blanc|(saint|st) pryve (saint|st) mesmin|saran|semoy";

/**
 * Une ville seule ne désigne pas un lieu (« Orléans » ne doit pas donner « Théâtre d’Orléans »,
 * ni « Fleury-les-Aubrais » le bar « My Beers Fleury-les-Aubrais »).
 */
const CITY_ONLY = new RegExp(`^(\\d{5} )?(${METROPOLE_COMMUNES}|loiret|france|centre val de loire)( \\d{5})?$|^\\d{5}$`);

/** Adresse qui désigne une voie (« cours Victor Hugo 45100 Orléans »), pas seulement une ville (« 45770 Saran »). */
const STREET_WORD =
  /\b(rue|avenue|av|boulevard|bd|place|pl|cours|chemin|allee|impasse|quai|route|rte|square|passage|faubourg|fbg|mail|esplanade|parvis|promenade|rond point|ruelle|sentier|voie)\b/;

/** `needle` présent en mots entiers dans `hay`, s'il est assez long pour être distinctif. */
function containsWords(hay: string, needle: string) {
  return needle.length >= 5 && ` ${hay} `.includes(` ${needle} `);
}

function nameCandidates(values: Array<string | null | undefined>) {
  const raws = values.map((value) => (value || "").trim()).filter(Boolean);
  return [...new Set([...raws, ...raws.flatMap(nameSegments)])]
    .map((value) => ({ search: normalizeSearchValue(value), core: coreName(value) }))
    .filter((candidate) => candidate.core && !CITY_ONLY.test(candidate.core));
}

/** Meilleure fiche pour un nom : identique (avec ou sans article), sinon l'un contient l'autre. */
function matchByName<T extends { name: string }>(entries: T[], values: Array<string | null | undefined>) {
  const candidates = nameCandidates(values);
  const indexed = entries.map((entry) => ({ entry, search: normalizeSearchValue(entry.name), core: coreName(entry.name) }));
  for (const candidate of candidates) {
    const hit = indexed.find((item) => item.search === candidate.search || (item.core && item.core === candidate.core));
    if (hit) return hit.entry;
  }
  for (const candidate of candidates) {
    const hit = indexed.find(
      (item) => item.core && (containsWords(candidate.core, item.core) || containsWords(item.core, candidate.core)),
    );
    if (hit) return hit.entry;
  }
  return null;
}

export function resolveLocationFromImportedData(
  locations: LocationData[],
  locationName?: string | null,
  address?: string | null,
  /** Lieu de la source : reconnu aussi par une de ses salles (« Garage du 108 »). */
  ownerLocationId?: string | null,
) {
  const byName = matchByName(locations, [locationName, address]);
  if (byName) return byName;

  if (ownerLocationId) {
    const owner = locations.find((location) => location.id === ownerLocationId);
    const ownerCore = owner ? coreName(owner.name) : "";
    if (owner && ownerCore && nameCandidates([locationName, address]).some((candidate) => ` ${candidate.core} `.includes(` ${ownerCore} `))) {
      return owner;
    }
  }

  if (address) {
    const normalizedAddress = normalizeSearchValue(address);
    // L'adresse la plus courte, contenue dans l'autre, doit nommer une voie : « Orléans » (lieu sans
    // adresse précise) ou « 45770 Saran » ne désignent aucun lieu en particulier.
    const byAddress = locations.find((location) => {
      const locationAddress = normalizeSearchValue(location.address || "");
      const contained = !locationAddress
        ? ""
        : locationAddress.includes(normalizedAddress)
          ? normalizedAddress
          : normalizedAddress.includes(locationAddress)
            ? locationAddress
            : "";
      return Boolean(contained) && STREET_WORD.test(normalizeName(contained));
    });
    if (byAddress) return byAddress;
  }

  // Même numéro dans la même voie, avec ou sans code postal (« 37 place du Chatelet, Orléans »),
  // y compris quand le lieu annoncé n'est qu'une adresse (événements Facebook).
  const street = streetOf(address || "") || streetOf(locationName || "");
  const byStreet = street ? locations.find((location) => streetOf(location.address || "") === street) : undefined;
  if (byStreet) return byStreet;

  return null;
}

/** Numéro et voie d'une adresse (« 37 Place du Châtelet 45000 Orléans » → « 37 place du chatelet »). */
function streetOf(address: string) {
  const key = normalizeName(address.split(/,|\s(?=\d{5}\b)/)[0] || "");
  return /^\d+\s*(bis|ter)?\s+\S+\s+\S+/.test(key) ? key : "";
}

export function resolveOrganizerFromName(
  organizers: OrganizerOption[],
  organizerName?: string | null,
) {
  return matchByName(organizers, [organizerName]);
}

/** Nom comparable : sans accents, casse ni ponctuation (« Chica Super! » = « chica super »). */
export function normalizeName(value: string) {
  return normalizeSearchValue(value).replace(/[^a-z0-9]+/g, " ").trim();
}

/** Rapproche les artistes détectés des fiches existantes (correspondance exacte du nom). */
export function resolveArtistsFromNames(artists: ArtistOption[], rawNames: unknown) {
  const names = Array.isArray(rawNames) ? rawNames.filter((name): name is string => typeof name === "string") : [];
  const byName = new Map(artists.map((artist) => [normalizeName(artist.name), artist]));
  const matchedIds: string[] = [];
  const unmatched: string[] = [];
  for (const name of names) {
    const match = byName.get(normalizeName(name));
    if (match) {
      if (!matchedIds.includes(match.id)) matchedIds.push(match.id);
    } else if (name.trim()) {
      unmatched.push(name.trim());
    }
  }
  return { matchedIds, unmatched };
}

/** Tags existants correspondant aux suggestions d'un import (aucune création). */
export function matchExistingTagIds(rawTagNames: unknown, tags: Array<{ id: string; name: string }>) {
  const ids = parseImportedTags(rawTagNames)
    .map((name) => tags.find((tag) => normalizeSearchValue(tag.name) === normalizeSearchValue(name))?.id)
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export async function buildEventFormPrefillFromImport({
  data,
  sourceUrl,
  owner,
  categories,
  locations,
  organizers,
  artists = [],
  findOrCreateTagIds,
  defaultStatus,
}: BuildEventPrefillFromImportArgs): Promise<{
  prefill: EventFormPrefill;
  warnings: ImportedEventWarning[];
}> {
  const importedTags = parseImportedTags(data.tags as unknown);

  const resolvedTagIds = findOrCreateTagIds ? await findOrCreateTagIds(importedTags) : [];
  // Les demandes saisies dans l'app transmettent déjà des identifiants de tags.
  const tagIds = Array.from(
    new Set([
      ...resolvedTagIds,
      ...(Array.isArray(data.tag_ids) ? (data.tag_ids as unknown[]).filter((id): id is string => typeof id === "string") : []),
    ]),
  );

  const matchedLocation =
    (typeof data.location_id === "string"
      ? locations.find((location) => location.id === data.location_id) || null
      : null) ||
    resolveLocationFromImportedData(
      locations,
      data.location,
      data.address,
      owner?.type === "location" ? owner.id : null,
    );

  const resolvedLocationId =
    (typeof data.location_id === "string" && data.location_id) ||
    matchedLocation?.id ||
    (owner?.type === "location" ? owner.id : "");

  const organizerIds: string[] = [];
  const pushOrganizerId = (value?: string | null) => {
    if (value && !organizerIds.includes(value)) {
      organizerIds.push(value);
    }
  };

  if (owner) {
    pushOrganizerId(owner.id);
  }
  if (typeof data.organizer_id === "string") {
    pushOrganizerId(data.organizer_id);
  }
  if (typeof data.location_organizer_id === "string") {
    pushOrganizerId(data.location_organizer_id);
  }

  const matchedOrganizer = resolveOrganizerFromName(organizers, data.organizer);
  if (matchedOrganizer) {
    pushOrganizerId(matchedOrganizer.id);
  }

  // Une catégorie déjà exprimée par son identifiant est reprise telle quelle.
  const directCategory =
    typeof data.category === "string" ? categories.find((category) => category.id === data.category) : undefined;
  const resolvedCategory = directCategory
    ? { id: directCategory.id, matched: true, candidateLabels: [] as string[] }
    : resolveImportedCategory(
        categories,
        extractImportedCategoryLabels({
          category: typeof data.category === "string" ? data.category : null,
          metadata:
            typeof data.metadata === "object" && data.metadata != null
              ? (data.metadata as Record<string, unknown>)
              : undefined,
        }),
      );

  const warnings: ImportedEventWarning[] = [];
  const importedCategoryLabels = resolvedCategory.candidateLabels;

  if (
    (data.location || data.address) &&
    !matchedLocation &&
    !data.location_id
  ) {
    warnings.push({
      field: "location",
      message: "Lieu détecté mais introuvable dans la liste : choisis-le ou crée-le.",
      value:
        typeof data.location === "string" && data.location.trim()
          ? data.location.trim()
          : typeof data.address === "string"
            ? data.address.trim()
            : undefined,
    });
  }

  if (data.organizer && !matchedOrganizer && !data.organizer_id) {
    warnings.push({
      field: "organizer",
      message: "Organisateur détecté mais introuvable dans la liste.",
      value:
        typeof data.organizer === "string" ? data.organizer.trim() : undefined,
    });
  }

  const artistMatch = resolveArtistsFromNames(artists, data.artists);
  if (artistMatch.unmatched.length > 0) {
    warnings.push({
      field: "artists",
      message:
        artistMatch.unmatched.length > 1
          ? `Artistes détectés sans fiche : ${artistMatch.unmatched.join(", ")}. Crée-les depuis le champ Artistes si besoin.`
          : `Artiste détecté sans fiche : ${artistMatch.unmatched[0]}. Crée-le depuis le champ Artistes si besoin.`,
    });
  }

  if (data.is_cancelled === true) {
    warnings.push({ field: "status", message: "La page indique que l’événement est annulé." });
  }

  if (data.date && data.time_known === false) {
    warnings.push({ field: "date", message: "Seule la date a été trouvée : vérifie l’heure de début." });
  }

  if (importedCategoryLabels.length > 0 && !resolvedCategory.matched) {
    warnings.push({
      field: "category",
      message: "Catégorie détectée mais sans équivalent : choisis-la.",
      value: importedCategoryLabels.join(", "),
    });
  }

  const derivedPrices = deriveGenericPriceRange(data);
  const isPayWhatYouWant = data.is_pay_what_you_want === true;
  const prefill: EventFormPrefill = {
    form: {
      title: (data.title || "").toString(),
      description: (data.description || "").toString(),
      date: data.date ? toDatetimeLocal(String(data.date)) : "",
      end_date: data.end_date ? toDatetimeLocal(String(data.end_date)) : "",
      category: resolvedCategory.id,
      price_min:
        !isPayWhatYouWant && derivedPrices.priceMin != null
          ? String(derivedPrices.priceMin)
          : "",
      price_max:
        !isPayWhatYouWant && derivedPrices.priceMax != null
          ? String(derivedPrices.priceMax)
          : "",
      is_pay_what_you_want: isPayWhatYouWant,
      capacity:
        data.capacity != null
          ? String(data.capacity)
          : matchedLocation?.capacity != null
            ? String(matchedLocation.capacity)
            : "",
      is_full: Boolean(data.is_full),
      location_id: resolvedLocationId,
      room_id: "",
      door_opening_time: (data.door_opening_time || "").toString(),
      external_url: (data.external_url || sourceUrl || "").toString(),
      external_url_label: (data.external_url_label || "").toString(),
      scraping_url: sourceUrl || "",
      instagram_url:
        typeof data.instagram_url === "string" ? data.instagram_url : "",
      facebook_url:
        typeof data.facebook_url === "string" ? data.facebook_url : "",
      image_url: (data.image_url || "").toString(),
      ...(defaultStatus ? { status: defaultStatus } : {}),
    },
    organizerIds,
    artistIds: artistMatch.matchedIds,
    tagIds,
    additionalDates: Array.isArray(data.occurrences)
      ? (data.occurrences as Array<{ date?: string; end_date?: string }>)
          .filter((occurrence) => typeof occurrence?.date === "string")
          .map((occurrence) => ({
            date: toDatetimeLocal(String(occurrence.date)),
            end_date: occurrence.end_date ? toDatetimeLocal(String(occurrence.end_date)) : "",
          }))
          .filter((occurrence) => occurrence.date)
      : undefined,
  };

  if (prefill.additionalDates && prefill.additionalDates.length > 0) {
    warnings.push({
      field: "date",
      message: `${prefill.additionalDates.length + 1} séances détectées : les autres dates sont ajoutées, un événement sera créé pour chacune.`,
    });
  }

  return {
    prefill,
    warnings,
  };
}
