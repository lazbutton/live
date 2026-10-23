import { getSocialHandle, getSourceKind, hostOf, isSharedHost } from "@/lib/collecte/source-kind";
import { normalizeName } from "@/lib/events/import-prefill";

import { normalizeInstagramUrl } from "./artists";

/*
 * Règles communes aux lieux, salles et organisateurs créés par l'agent : lieux qui n'en sont pas
 * (« Adresse secrète »), noms proches (doublons), liens publics rangés et comparables.
 * Les noms enregistrés passent par le trigger format_entity_label : aucune règle de casse ici.
 */

/** « Adresse secrète », « lieu communiqué à la réservation », « lieu à confirmer » : jamais une fiche de lieu. */
const UNDISCLOSED_PLACE =
  /\b(adresse|lieu)x?s?\s+(tenue?s?\s+)?(secret|secrete|mystere|surprise|confidentiel|confidentielle|communique|communiquee|transmis|transmise|donne|donnee|envoye|envoyee|revele|revelee)s?\b|\b(adresse|lieu)x?\s+a\s+(confirmer|definir|venir|preciser|determiner|reveler)\b|\b(secret|surprise)\s+(location|place|spot)\b|\b(tba|tbc|tbd)\b/;

/** Ce qui n'est pas un lieu : en ligne, chez l'habitant, plusieurs lieux, en plein air… */
const NOT_A_PLACE =
  /^(en |a |sur |dans (la |le )?)?(ligne|online|visio|visioconference|zoom|domicile|chez l habitant|chez vous|plusieurs lieux|divers lieux|lieux? multiples?|lieux? divers|centre ville|plein air|exterieur|rue|ville|quartier|partout|itinerant|deambulation)$/;

/** Lieu tu ou introuvable (« Adresse Secrète ») : pas de fiche, le lieu annoncé reste dans l'événement. */
export function isUndisclosedPlace(value: string | null | undefined) {
  const key = normalizeName(value || "");
  return Boolean(key) && (UNDISCLOSED_PLACE.test(key) || NOT_A_PLACE.test(key));
}

/** Nom comparable sans article initial : « L'Improviste Bar » → « improviste bar », « Le 108 » → « 108 ». */
export function placeCore(value: string) {
  return normalizeName(value)
    .replace(/^(l|le|la|les)\s+/, "")
    .trim();
}

/** Morceaux d'un nom composé : « Théâtre d'Orléans - Salle Vitez », « L'Alliage (salle Yvremont) », « Le 108, salle C14 ». */
export function nameParts(value: string) {
  return value
    .split(/\s+[–—-]\s+|\s*[,(/|•]\s*|\)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Au plus une lettre ajoutée, retirée ou changée (faute de frappe). */
function withinOneEdit(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}

/**
 * Proximité de deux noms, pour écarter les doublons :
 * - `same` : identiques sans article, accents ni ponctuation (« Théâtre Gérard Philipe » = « Théâtre Gérard-Philipe »),
 *   ou collés (« Orlin's Comedy » = « Orlins Comedy ») ;
 * - `close` : l'un contient l'autre en mots entiers, s'il fait au moins 5 lettres (« L'Improviste » dans
 *   « L'Improviste Bar »), le nom collé de l'un commence l'autre (« Orlins Comedy Club »), ou une faute de frappe
 *   dans un nom d'au moins 8 lettres ;
 * - null : noms différents.
 */
export function nameProximity(left: string, right: string): "same" | "close" | null {
  const a = placeCore(left);
  const b = placeCore(right);
  if (!a || !b) return null;
  const compactA = a.replace(/ /g, "");
  const compactB = b.replace(/ /g, "");
  if (a === b || compactA === compactB) return "same";
  const [shortWords, longWords] = a.length <= b.length ? [a, b] : [b, a];
  if (shortWords.length >= 5 && ` ${longWords} `.includes(` ${shortWords} `)) return "close";
  const [shortCompact, longCompact] = compactA.length <= compactB.length ? [compactA, compactB] : [compactB, compactA];
  if (shortCompact.length >= 8 && (longCompact.startsWith(shortCompact) || withinOneEdit(compactA, compactB))) return "close";
  return null;
}

/* ------------------------------------------------------------------ */
/* Liens publics                                                       */
/* ------------------------------------------------------------------ */

export type PlaceLinks = { website_url: string | null; instagram_url: string | null; facebook_url: string | null };

/** Page Facebook : « https://www.facebook.com/<page>/ » (ou profile.php?id=…), jamais un événement ni une photo. */
export function normalizeFacebookUrl(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(raw)
        ? raw
        : `https://www.facebook.com/${raw.replace(/^@/, "").replace(/^((www|m|web|fr-fr)\.)?facebook\.com\/?/i, "")}`,
    );
  } catch {
    return null;
  }
  if (!/(^|\.)(facebook\.com|fb\.com)$/i.test(url.hostname)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const [first = "", second = "", third = ""] = segments;
  if (first === "profile.php") {
    const id = url.searchParams.get("id") || "";
    return /^\d+$/.test(id) ? `https://www.facebook.com/profile.php?id=${id}` : null;
  }
  if (first === "p" && second) return `https://www.facebook.com/p/${second}/`;
  if (first === "groups" && second) return `https://www.facebook.com/groups/${second}/`;
  if (first === "pages" && /^\d+$/.test(third)) return `https://www.facebook.com/${third}/`;
  if (!/^[\w.-]+$/.test(first) || /^(events|watch|photo|photos|photo\.php|story\.php|permalink\.php|share|sharer|reel|hashtag|login|plugins|pages)$/i.test(first)) {
    return null;
  }
  return `https://www.facebook.com/${first}/`;
}

/** Site web : http(s), sans ancre ni paramètres de suivi. */
function normalizeWebsiteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(url.hostname)) {
    return null;
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|igshid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/**
 * Liens rangés à leur place (un lien Instagram ou Facebook donné comme site va dans son champ) et vérifiés ;
 * `invalid` liste ceux qui ne désignent pas un compte ou un site (publication, événement, adresse illisible).
 */
export function normalizePlaceLinks(input: {
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
}): { links: PlaceLinks; invalid: string[] } {
  const links: PlaceLinks = { website_url: null, instagram_url: null, facebook_url: null };
  const invalid: string[] = [];
  const place = (raw: string | null | undefined, field: keyof PlaceLinks) => {
    const value = (raw || "").trim();
    if (!value) return;
    // « instagram.com/x » est une adresse, « le108.orleans » un identifiant Instagram.
    const url = /^https?:\/\//i.test(value)
      ? value
      : field === "website_url" || /^(www\.|m\.)?[\w-]+(\.[\w-]+)+\//i.test(value)
        ? `https://${value}`
        : null;
    const kind = url ? getSourceKind(url) : null;
    const target: keyof PlaceLinks =
      kind === "instagram" ? "instagram_url" : kind === "facebook" ? "facebook_url" : kind === "website" ? "website_url" : field;
    const normalized =
      target === "instagram_url"
        ? normalizeInstagramUrl(url || value)
        : target === "facebook_url"
          ? normalizeFacebookUrl(url || value)
          : normalizeWebsiteUrl(url || value);
    if (!normalized) invalid.push(value);
    else if (!links[target]) links[target] = normalized;
  };
  place(input.instagram_url, "instagram_url");
  place(input.facebook_url, "facebook_url");
  place(input.website_url, "website_url");
  return { links, invalid };
}

/** Clés comparables des liens : compte Instagram, page Facebook, domaine du site (page près pour une billetterie partagée). */
export function linkKeys(links: { website_url?: string | null; instagram_url?: string | null; facebook_url?: string | null }) {
  const keys: string[] = [];
  const instagram = normalizeInstagramUrl(links.instagram_url);
  if (instagram) keys.push(`instagram:${getSocialHandle(instagram)}`);
  const facebook = normalizeFacebookUrl(links.facebook_url);
  if (facebook) keys.push(`facebook:${facebook.replace(/^https:\/\/www\.facebook\.com\//, "").replace(/\/$/, "").toLowerCase()}`);
  const website = links.website_url ? normalizeWebsiteUrl(links.website_url) : null;
  if (website) {
    const host = hostOf(website);
    const firstSegment = new URL(website).pathname.split("/").filter(Boolean)[0] || "";
    keys.push(`site:${isSharedHost(host) ? `${host}/${firstSegment.toLowerCase()}` : host}`);
  }
  return keys;
}

/** Nature d'une clé de lien, pour le dire dans la réponse (« même compte Instagram »). */
export function linkKeyLabel(key: string) {
  return key.startsWith("instagram:") ? "même compte Instagram" : key.startsWith("facebook:") ? "même page Facebook" : "même site";
}
