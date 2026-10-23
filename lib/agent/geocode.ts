import { normalizeName } from "@/lib/events/import-prefill";

/*
 * Géocodage des adresses de lieux par la Base Adresse Nationale, servie par la Géoplateforme de l'IGN
 * (data.geopf.fr/geocodage : le service d'api-adresse.data.gouv.fr, qui s'y annonce décommissionné et y
 * renvoie). Recherche rapprochée d'Orléans, comme le champ d'adresse de l'admin.
 *
 * L'adresse enregistrée est le libellé de la BAN (« 119 Rue de Bourgogne 45000 Orléans ») : le trigger
 * sync_location_city en tire la ville par le code postal. Une adresse sans code postal donnerait une ville
 * fausse (« place sainte beuve orleans », corrigée par la migration 20261021230000).
 */

const BAN_SEARCH_URL = "https://data.geopf.fr/geocodage/search/";
const ORLEANS = { lat: 47.9029, lon: 1.9093 };
/** En dessous, la BAN devine : « Centre-ville, Orléans » → 0,51, « Parc Pasteur, Orléans » → « Rue Pasteur », 0,65. */
export const MIN_GEOCODE_SCORE = 0.7;

/** Mots d'une voie (« rue », « place »…) : un segment qui en contient un fait partie de l'adresse. */
const STREET_WORD =
  /\b(rue|r|avenue|av|boulevard|bd|place|pl|cours|chemin|allee|impasse|quai|route|rte|square|passage|faubourg|fbg|mail|esplanade|parvis|promenade|rond point|ruelle|sentier|voie|lieu dit|hameau|zac|za|zi)\b/;

export type GeocodedAddress = {
  /** Libellé de la BAN, enregistré tel quel : « 119 Rue de Bourgogne 45000 Orléans ». */
  label: string;
  latitude: number;
  longitude: number;
  housenumber: string | null;
  street: string | null;
  postcode: string;
  city: string;
  /** housenumber (numéro), street (voie seule) ou locality (lieu-dit). */
  type: string;
  score: number;
};

export type GeocodeResult = { ok: true; address: GeocodedAddress } | { ok: false; reason: string };

/** Nom comparable, « St » et « Ste » développés (« St Jean de Braye » = « Saint-Jean-de-Braye »). */
function placeKey(value: string) {
  return normalizeName(value)
    .replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte");
}

/**
 * Adresse à chercher : sans le nom du lieu en tête (« L'Improviste Bar, 119 rue de Bourgogne… » tombe de
 * 0,98 à 0,65), « St » et « Ste » développés (« St Jean de Braye » n'est pas trouvé).
 */
export function addressQuery(address: string) {
  const segments = address
    .replace(/\s+/g, " ")
    .split(/\s*[,;\n]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  // Segments de tête sans numéro ni mot de voie : nom du lieu, de la salle (« Théâtre Gérard-Philipe »).
  while (segments.length > 1 && !/\d/.test(segments[0]) && !STREET_WORD.test(normalizeName(segments[0]))) {
    segments.shift();
  }
  return segments
    .join(", ")
    .replace(/\bste\b\.?/gi, "Sainte")
    .replace(/\bst\b\.?/gi, "Saint");
}

/** Code postal écrit dans l'adresse (5 chiffres), s'il y en a un. */
function postcodeOf(value: string) {
  return /\b(\d{5})\b/.exec(value)?.[1] ?? null;
}

/**
 * Cherche une adresse dans la BAN et dit si elle est assez sûre pour créer un lieu : un numéro, une voie ou un
 * lieu-dit (pas une ville seule), un score d'au moins 0,7, dans la ville ou le code postal écrits dans l'adresse.
 * Lève une erreur si la BAN ne répond pas : rien ne doit être créé sans coordonnées.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const query = addressQuery(address || "");
  if (!query) return { ok: false, reason: "Adresse manquante" };

  const url = `${BAN_SEARCH_URL}?${new URLSearchParams({
    q: query.slice(0, 200),
    limit: "5",
    lat: String(ORLEANS.lat),
    lon: String(ORLEANS.lon),
  })}`;
  let data: { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }> };
  try {
    const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    throw new Error(
      `Base Adresse Nationale injoignable (${error instanceof Error ? error.message : "erreur"}) : rien n'est créé, réessaie plus tard.`,
    );
  }

  const best = (data.features || [])[0];
  const properties = (best?.properties || {}) as Record<string, unknown>;
  const [longitude, latitude] = best?.geometry?.coordinates || [];
  const label = typeof properties.label === "string" ? properties.label : "";
  if (!best || !label || typeof latitude !== "number" || typeof longitude !== "number") {
    return { ok: false, reason: "Adresse introuvable dans la Base Adresse Nationale : vérifie-la sur le site du lieu." };
  }
  const type = String(properties.type || "");
  const score = typeof properties.score === "number" ? properties.score : 0;
  const city = String(properties.city || "");
  const postcode = String(properties.postcode || "");
  if (type === "municipality") {
    return { ok: false, reason: `Adresse trop vague : « ${label} » est une ville ; il faut le numéro et la rue du lieu.` };
  }
  if (score < MIN_GEOCODE_SCORE) {
    return {
      ok: false,
      reason: `Adresse incertaine : la BAN propose « ${label} » sans en être sûre ; vérifie l'adresse sur le site du lieu.`,
    };
  }
  // La ville ou le code postal écrits doivent être ceux trouvés (« Salle des fêtes, Saran » donnait Férolles) ;
  // la ville suffit (« place Sainte-Beuve, 45000 Orléans » est au 45100).
  const writtenPostcode = postcodeOf(query);
  const cityNamed = Boolean(city) && ` ${placeKey(query)} `.includes(` ${placeKey(city)} `);
  if (!cityNamed && writtenPostcode !== postcode) {
    return {
      ok: false,
      reason: writtenPostcode
        ? `La BAN situe cette adresse à ${postcode} ${city}, pas au ${writtenPostcode} : vérifie l'adresse.`
        : `Adresse sans ville reconnue (la BAN propose « ${label} ») : ajoute le code postal et la ville.`,
    };
  }

  return {
    ok: true,
    address: {
      label,
      latitude,
      longitude,
      housenumber: typeof properties.housenumber === "string" ? properties.housenumber : null,
      street: typeof properties.street === "string" ? properties.street : typeof properties.name === "string" ? properties.name : null,
      postcode,
      city,
      type,
      score,
    },
  };
}
