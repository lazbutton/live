/*
 * Radio : le titre en cours, lu dans le JSON du serveur Icecast (`status-json.xsl`, chez Labomedia
 * pour Radio Campus Orléans). Une source (un objet) ou plusieurs (un tableau) : celle du flux de la
 * station, reconnue à son point de montage (`/stream_rco` pour `…/stream_rco_dab.mp3`).
 */

type IcecastSource = {
  listenurl?: unknown;
  title?: unknown;
};

function mountPath(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || null;
  } catch {
    return null;
  }
}

/**
 * Le titre que le serveur diffuse sur le flux de la station : null si la source n'a pas de titre,
 * undefined si le JSON ne contient pas cette source (serveur arrêté, flux absent).
 */
export function pickIcecastTitle(status: unknown, streamUrl: string): string | null | undefined {
  const icestats =
    status && typeof status === "object" ? (status as Record<string, unknown>).icestats : undefined;
  const raw = icestats && typeof icestats === "object" ? (icestats as Record<string, unknown>).source : undefined;
  const sources = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
    (source): source is IcecastSource => Boolean(source) && typeof source === "object",
  );
  if (!sources.length) return undefined;

  const wanted = mountPath(streamUrl);
  const source =
    sources.find((candidate) => wanted && mountPath(candidate.listenurl) === wanted) ??
    sources.find((candidate) => wanted && mountPath(candidate.listenurl)?.startsWith(wanted)) ??
    (sources.length === 1 ? sources[0] : undefined);
  if (!source) return undefined;

  const title = typeof source.title === "string" ? source.title.replace(/\s+/g, " ").trim() : "";
  return title || null;
}
