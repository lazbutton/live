/*
 * Photos d'artistes sous licence libre (U33 ; ../live/docs/fonctionnalites/lieux.md, « Règles »), prises sur Wikimedia
 * Commons : l'image (P18) de la fiche Wikidata de l'artiste. La fiche est trouvée par le nom de l'artiste
 * dans Wikidata, sinon par MusicBrainz, qui relie les musiciens à la leur. Seules CC BY, CC BY-SA, CC0 et le
 * domaine public passent ; l'auteur, la licence et la page Commons accompagnent la photo
 * (artists.image_credit, image_license, image_source_url) pour être affichés avec elle.
 * Pas de Deezer : ses conditions interdisent de reprendre ses photos d'artistes.
 * Mode d'emploi : docs/ARTIST_PHOTOS.md ; script : scripts/artist-photos.mjs.
 */

/** Wikimedia et MusicBrainz demandent un User-Agent qui dit qui appelle. */
export const USER_AGENT = "OutLive/1.0 (+https://www.outlive.fr)";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";
/** Largeur de la copie : une des tailles de vignette que Commons sert d'office, loin des 2 Mo du stockage. */
const PHOTO_WIDTH = 1280;
/** En deçà, la photo serait floue sur la page d'un artiste. */
const MIN_WIDTH = 400;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);
/** Identifiants qu'a une fiche Wikidata de musicien : MusicBrainz, Discogs, Spotify, Deezer, Apple Music. */
const MUSIC_IDS = ["P434", "P1953", "P1902", "P2722", "P2850"];
/** Mots d'une description d'artiste de scène (fr ou en) : sans eux, un homonyme passerait. */
const PERFORMER =
  /(chant|music|rap|\bdj\b|compos|groupe|group|band|singer|danse|dance|chor[ée]graph|com[ée]di|humor|acteu|actri|actor|actress|artist|cirque|circus|clown|jongl|juggl|magic|th[ée][aâ]tr|metteu|stage director|compagnie|company|collecti|orchest|quatuor|quartet|trio|duo|jazz|pian|guitar|violon|violin|batteu|drummer|percussion|slam|po[èe]te|poet|conteu|storyteller|marionnet|puppet|drag|produc|beatmaker)/i;

/** Un lieu, pas un artiste (« Plan K » : « salle de danse et ancienne raffinerie de sucre à Molenbeek »). */
const PLACE =
  /\b(salle|lieu|b[âa]timent|venue|building|raffinerie|cin[ée]ma|mus[ée]e|museum|commune|village|quartier|stade|festival|concert hall|nightclub|discoth[èe]que)\b/i;

export type JsonGetter = (url: string) => Promise<unknown>;

export type ArtistPhoto = {
  /** Fiche Wikidata (« Q… ») et, quand elle est connue, fiche MusicBrainz de l'artiste. */
  wikidataId: string;
  musicbrainzId: string | null;
  /** Ce que Wikidata dit de l'artiste, pour vérifier que c'est le bon avant d'écrire. */
  description: string | null;
  /** Fichier Commons (« Nom.jpg ») et adresse de sa vignette de 1 280 px de large (ou de l'original). */
  file: string;
  imageUrl: string;
  width: number;
  height: number;
  credit: string;
  license: string;
  sourceUrl: string;
};

export type ArtistPhotoResult =
  | { status: "found"; photo: ArtistPhoto }
  | { status: "not_found" | "ambiguous" | "no_image" | "refused" | "error"; detail: string };

/** Nom comparable : sans accents, casse ni ponctuation (« Leïla Ka » = « leila ka »). */
export function comparableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Licence acceptée, telle qu'affichée (« CC BY-SA 4.0 », « CC0 », « Domaine public »), sinon null. */
export function freeLicense(shortName?: string | null, code?: string | null): string | null {
  const name = (shortName ?? "").replace(/\s+/g, " ").trim();
  const id = (code ?? "").trim().toLowerCase();
  if (/^cc0\b/i.test(name) || id === "cc0") return "CC0";
  if (/^(public domain|domaine public|pd\b)/i.test(name) || id === "pd" || id.startsWith("pd-")) return "Domaine public";
  const fromName = name.match(/^CC BY(-SA)? (\d\.\d)( [a-z]{2,3})?$/i);
  if (fromName) return `CC BY${fromName[1] ? "-SA" : ""} ${fromName[2]}${fromName[3]?.toLowerCase() ?? ""}`;
  const fromCode = id.match(/^cc-by(-sa)?-(\d\.\d)(?:-([a-z]{2,3}))?$/);
  if (fromCode) return `CC BY${fromCode[1] ? "-SA" : ""} ${fromCode[2]}${fromCode[3] ? ` ${fromCode[3]}` : ""}`;
  return null;
}

/** Texte d'un champ HTML de Commons (auteur, crédit). */
export function htmlToText(value?: string | null) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

const lastCall = new Map<string, number>();
/** MusicBrainz : une requête par seconde au plus. */
const MIN_INTERVAL_MS: Record<string, number> = { "musicbrainz.org": 1100 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Une photo de plus de 15 Mo n'est pas une photo d'artiste qu'on veut copier. */
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

/** Sans les paramètres de suivi (utm_*) que l'API de Commons ajoute aux adresses des fichiers. */
function withoutTracking(raw: string) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
  return url.toString();
}

/**
 * Télécharge une photo de Commons (upload.wikimedia.org seulement), en se présentant comme Wikimedia le
 * demande : avec un User-Agent de navigateur, les téléchargements en série finissent en HTTP 429.
 */
export async function downloadCommonsPhoto(url: string): Promise<Buffer> {
  if (new URL(url).hostname !== "upload.wikimedia.org") throw new Error("Adresse hors de Wikimedia Commons");
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("Photo trop lourde (plus de 15 Mo)");
      return buffer;
    }
    await response.body?.cancel();
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(10_000 * attempt);
      continue;
    }
    throw new Error(`Photo inaccessible (HTTP ${response.status})`);
  }
}

/** GET JSON, au rythme demandé par chaque service ; 429 et 503 (service saturé) sont retentés deux fois. */
export async function getJson(url: string): Promise<unknown> {
  const host = new URL(url).hostname;
  for (let attempt = 1; ; attempt += 1) {
    const wait = (lastCall.get(host) ?? 0) + (MIN_INTERVAL_MS[host] ?? 100) - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return response.json();
    await response.body?.cancel();
    if ((response.status === 429 || response.status === 503) && attempt < 3) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`${host} : HTTP ${response.status}`);
  }
}

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
type WikidataEntity = {
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Claim[]>;
};
type Candidate = { id: string; description: string | null; image: string | null; musicbrainzIds: string[]; performer: boolean };

/** Fiches Wikidata dont le libellé ou un alias est exactement le nom de l'artiste. */
async function searchWikidata(get: JsonGetter, name: string) {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: "fr",
    uselang: "fr",
    type: "item",
    limit: "10",
    format: "json",
  });
  const data = (await get(`${WIKIDATA_API}?${params}`)) as {
    search?: Array<{ id: string; label?: string; aliases?: string[]; match?: { text?: string } }>;
  };
  const key = comparableName(name);
  return (data.search ?? [])
    .filter((result) => [result.match?.text, result.label, ...(result.aliases ?? [])].some((text) => text && comparableName(text) === key))
    .map((result) => result.id);
}

async function loadCandidates(get: JsonGetter, ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "descriptions|claims",
    languages: "fr|en",
    format: "json",
  });
  const data = (await get(`${WIKIDATA_API}?${params}`)) as { entities?: Record<string, WikidataEntity> };
  return ids.map((id) => {
    const entity = data.entities?.[id] ?? {};
    const values = (property: string) =>
      (entity.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value).filter((value) => value != null);
    const description = entity.descriptions?.fr?.value ?? entity.descriptions?.en?.value ?? null;
    const image = values("P18").find((value): value is string => typeof value === "string") ?? null;
    return {
      id,
      description,
      image,
      musicbrainzIds: values("P434").filter((value): value is string => typeof value === "string"),
      performer:
        MUSIC_IDS.some((property) => values(property).length > 0) ||
        (PERFORMER.test(description ?? "") && !PLACE.test(description ?? "")),
    };
  });
}

/** Artistes MusicBrainz du même nom et leur fiche Wikidata. */
async function searchMusicBrainz(get: JsonGetter, name: string) {
  const query = `artist:"${name.replace(/["\\]/g, "\\$&")}"`;
  const data = (await get(`${MUSICBRAINZ_API}/artist?query=${encodeURIComponent(query)}&fmt=json&limit=5`)) as {
    artists?: Array<{ id: string; name: string; score?: number; aliases?: Array<{ name: string }> }>;
  };
  const key = comparableName(name);
  const exact = (data.artists ?? []).filter(
    (artist) =>
      (artist.score ?? 0) >= 90 &&
      [artist.name, ...(artist.aliases ?? []).map((alias) => alias.name)].some((text) => comparableName(text) === key),
  );
  const found: Array<{ id: string; wikidataId: string | null }> = [];
  for (const artist of exact.slice(0, 3)) {
    const detail = (await get(`${MUSICBRAINZ_API}/artist/${artist.id}?inc=url-rels&fmt=json`)) as {
      relations?: Array<{ type?: string; url?: { resource?: string } }>;
    };
    const link = (detail.relations ?? []).find((relation) => relation.type === "wikidata")?.url?.resource ?? "";
    found.push({ id: artist.id, wikidataId: link.match(/\/(Q\d+)$/)?.[1] ?? null });
  }
  return found;
}

type CommonsMetadata = Record<string, { value?: string }>;

/** Photo d'un fichier Commons, ou la raison de la refuser. */
async function loadCommonsFile(
  get: JsonGetter,
  file: string,
): Promise<Omit<ArtistPhoto, "wikidataId" | "musicbrainzId" | "description"> | { refused: string }> {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(PHOTO_WIDTH),
    iiextmetadatafilter: "Artist|Credit|LicenseShortName|License",
    format: "json",
  });
  const data = (await get(`${COMMONS_API}?${params}`)) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: Array<{
            url: string;
            thumburl?: string;
            descriptionurl: string;
            width: number;
            height: number;
            mime: string;
            extmetadata?: CommonsMetadata;
          }>;
        }
      >;
    };
  };
  const info = Object.values(data.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info) return { refused: "fichier introuvable sur Commons" };
  if (!PHOTO_TYPES.has(info.mime)) return { refused: `pas une photo (${info.mime})` };
  if (info.width < MIN_WIDTH) return { refused: `trop petite (${info.width} px de large)` };
  const metadata = info.extmetadata ?? {};
  const license = freeLicense(metadata.LicenseShortName?.value, metadata.License?.value);
  if (!license) return { refused: `licence refusée (${metadata.LicenseShortName?.value ?? "inconnue"})` };
  const credit = htmlToText(metadata.Artist?.value) || htmlToText(metadata.Credit?.value);
  if (!credit && license.startsWith("CC BY")) return { refused: "auteur inconnu, crédit impossible" };
  return {
    file,
    imageUrl: withoutTracking(info.width > PHOTO_WIDTH && info.thumburl ? info.thumburl : info.url),
    width: info.width,
    height: info.height,
    credit: credit || "Auteur inconnu",
    license,
    sourceUrl: info.descriptionurl,
  };
}

/**
 * Photo libre d'un artiste. Prudente : un nom porté par plusieurs artistes de scène (« ambiguous »), une
 * fiche sans mot de la scène dans sa description ni identifiant musical (« not_found ») ou une licence
 * non libre (« refused ») ne donnent rien. Le résultat se relit avant d'écrire (scripts/artist-photos.mjs).
 */
export async function findArtistPhoto(name: string, { get = getJson }: { get?: JsonGetter } = {}): Promise<ArtistPhotoResult> {
  try {
    let candidates = (await loadCandidates(get, await searchWikidata(get, name))).filter((candidate) => candidate.performer);
    let musicbrainzId: string | null = null;
    if (candidates.length === 0) {
      // Musicien que Wikidata connaît sous un autre libellé : MusicBrainz donne sa fiche.
      const linked = (await searchMusicBrainz(get, name)).filter((artist) => artist.wikidataId);
      if (linked.length > 1) return { status: "ambiguous", detail: `${linked.length} artistes MusicBrainz de ce nom` };
      if (linked.length === 1) {
        candidates = await loadCandidates(get, [linked[0].wikidataId!]);
        musicbrainzId = linked[0].id;
      }
    }
    if (candidates.length === 0) return { status: "not_found", detail: "ni Wikidata ni MusicBrainz" };
    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        detail: candidates.map((candidate) => `${candidate.id} (${candidate.description ?? "sans description"})`).join(", "),
      };
    }
    const [candidate] = candidates;
    if (!candidate.image) return { status: "no_image", detail: `${candidate.id} (${candidate.description ?? "sans description"}) sans image` };
    const file = await loadCommonsFile(get, candidate.image);
    if ("refused" in file) return { status: "refused", detail: `${candidate.image} : ${file.refused}` };
    return {
      status: "found",
      photo: {
        wikidataId: candidate.id,
        musicbrainzId: musicbrainzId ?? candidate.musicbrainzIds[0] ?? null,
        description: candidate.description,
        ...file,
      },
    };
  } catch (error) {
    return { status: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}
