/*
 * Liens collés ou partagés depuis le téléphone (écran /ajout) : compte Instagram,
 * page Facebook ou site. Module pur, utilisé côté navigateur comme côté serveur.
 */

import { getAddressLabel, getSourceKind, type SourceKind } from "./source-kind";

export type QuickLink = {
  url: string;
  kind: SourceKind;
  /** Compte ou page (« chafouin_orleans ») ; vide pour un site ou une publication. */
  handle: string;
  /** Adresse lisible : « @chafouin_orleans », « facebook.com/ledropkick », « le108.org ». */
  label: string;
  /** Publication, reel ou événement plutôt qu'un compte : la collecte ne pourra pas le suivre. */
  isPost: boolean;
};

const TRACKING_PARAM = /^(utm_.*|fbclid|igsh|igshid|mibextid|si|ref|locale|__.*)$/i;
const INSTAGRAM_POST_SEGMENTS = new Set(["p", "reel", "reels", "tv", "explore"]);
const FACEBOOK_POST_SEGMENTS = new Set(["events", "groups", "share", "watch", "photo", "photo.php", "story.php", "permalink.php"]);
/** Mots retirés d'un identifiant pour proposer un nom : « java_pop_orleans » → « Java Pop ». */
const HANDLE_NOISE = new Set(["orleans", "orléans", "loiret", "45", "officiel", "official", "offi"]);

/** Premier lien d'un texte partagé (« Regarde ce profil https://… »). */
export function extractFirstUrl(text: string | null | undefined): string | null {
  const match = (text || "").match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;!?]+$/, "") : null;
}

function toUrl(raw: string): URL | null {
  let value = raw.trim();
  const embedded = extractFirstUrl(value);
  if (embedded) value = embedded;
  else if (/^@[a-z0-9._]{1,30}$/i.test(value)) value = `https://www.instagram.com/${value.slice(1)}/`;
  else if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) value = `https://${value}`;
  else return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** « @handle », « instagram.com/handle?igsh=… », lien Facebook ou site → lien propre et sa nature. */
export function normalizeQuickLink(raw: string | null | undefined): QuickLink | null {
  const parsed = toUrl(raw || "");
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return null;
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
  }
  parsed.hash = "";

  const kind = getSourceKind(parsed.toString());
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (kind === "instagram") {
    const first = (segments[0] || "").toLowerCase();
    const handle = first === "stories" ? (segments[1] || "").toLowerCase() : first;
    if (!handle || INSTAGRAM_POST_SEGMENTS.has(handle)) {
      return { url: `https://www.instagram.com${parsed.pathname}`, kind, handle: "", label: "publication Instagram", isPost: true };
    }
    return { url: `https://www.instagram.com/${handle}/`, kind, handle, label: `@${handle}`, isPost: false };
  }

  if (kind === "facebook") {
    const first = segments[0] || "";
    if (first === "profile.php") {
      const id = parsed.searchParams.get("id");
      const url = id ? `https://www.facebook.com/profile.php?id=${id}` : "https://www.facebook.com/";
      return { url, kind, handle: id || "", label: id ? `facebook.com/profile.php?id=${id}` : "facebook.com", isPost: !id };
    }
    if (!first || FACEBOOK_POST_SEGMENTS.has(first.toLowerCase())) {
      return { url: `https://www.facebook.com${parsed.pathname}`, kind, handle: "", label: "publication Facebook", isPost: true };
    }
    const path = first === "pages" ? segments.slice(0, 3).join("/") : first;
    return {
      url: `https://www.facebook.com/${path}`,
      kind,
      handle: first === "pages" ? "" : first.toLowerCase(),
      label: `facebook.com/${path}`,
      isPost: false,
    };
  }

  const url = parsed.pathname === "/" && !parsed.search ? parsed.origin : parsed.toString();
  return { url, kind, handle: "", label: getAddressLabel(url, kind), isPost: false };
}

/** Nom proposé à partir d'un compte : « java_pop_orleans » → « Java Pop ». Vide pour un site. */
export function guessNameFromLink(link: QuickLink | null): string {
  if (!link?.handle || link.isPost || /^\d+$/.test(link.handle)) return "";
  const words = link.handle.split(/[._-]+/).filter(Boolean);
  const meaningful = words.filter((word) => !HANDLE_NOISE.has(word.toLowerCase()));
  return (meaningful.length ? meaningful : words)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Colonne de la fiche où ranger le lien. */
export function linkColumn(kind: SourceKind): "instagram_url" | "facebook_url" | "website_url" {
  return kind === "instagram" ? "instagram_url" : kind === "facebook" ? "facebook_url" : "website_url";
}
