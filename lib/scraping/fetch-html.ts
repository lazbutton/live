/** Récupération robuste d'une page HTML pour le scraping (délai, taille, encodage). */

export const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

export class FetchHtmlError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FetchHtmlError";
    this.status = status;
  }
}

export type FetchedPage = {
  html: string;
  /** URL finale après redirections. */
  finalUrl: string;
};

function decode(bytes: ArrayBuffer, charset: string) {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export async function fetchHtml(url: string, options: { timeoutMs?: number } = {}): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": SCRAPER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.6,en;q=0.5",
      },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new FetchHtmlError(
        response.status === 404
          ? "Page introuvable (404) : le lien a peut-être changé."
          : `La page répond avec une erreur ${response.status}.`,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
      throw new FetchHtmlError("Ce lien ne mène pas à une page web.", 415);
    }

    const buffer = await response.arrayBuffer();
    const bytes = buffer.byteLength > MAX_HTML_BYTES ? buffer.slice(0, MAX_HTML_BYTES) : buffer;
    const headerCharset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
    let html = decode(bytes, headerCharset || "utf-8");

    // Pages en latin-1 sans en-tête : le charset est déclaré dans le HTML.
    if (!headerCharset) {
      const metaCharset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(html.slice(0, 4096))?.[1]?.toLowerCase();
      if (metaCharset && !["utf-8", "utf8"].includes(metaCharset)) {
        html = decode(bytes, metaCharset);
      }
    }

    return { html, finalUrl: response.url || url };
  } catch (error) {
    if (error instanceof FetchHtmlError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FetchHtmlError("La page met trop de temps à répondre.", 504);
    }
    throw new FetchHtmlError("La page est inaccessible depuis le serveur.", 502);
  } finally {
    clearTimeout(timer);
  }
}
