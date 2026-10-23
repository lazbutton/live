/*
 * Radio : les lectures chez la radio et chez Labomedia. Des GET seulement, avec un User-Agent qui nomme
 * OutLive, un délai et une taille bornés.
 */

/** En ASCII : un en-tête HTTP n'accepte pas « é ». */
export const RADIO_USER_AGENT = "OutLive/1.0 (+https://www.outlive.fr; agenda culturel d'Orleans, lecture seule)";

const MAX_BYTES = 5 * 1024 * 1024;

export type RadioFetch = typeof fetch;

export class RadioHttpError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "RadioHttpError";
    this.status = status;
  }
}

export type RadioGetOptions = {
  fetchImpl?: RadioFetch;
  timeoutMs: number;
  accept?: string;
  headers?: Record<string, string>;
};

/** Un GET ; la réponse est rendue telle quelle (304 compris), après vérification de sa taille annoncée. */
export async function radioGet(url: string, options: RadioGetOptions): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "User-Agent": RADIO_USER_AGENT,
        Accept: options.accept ?? "*/*",
        ...options.headers,
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    throw new RadioHttpError(`${url} : ${error instanceof Error ? error.message : String(error)}`, null);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new RadioHttpError(`${url} : réponse trop grande (${length} octets)`, response.status);
  }
  return response;
}

/** Le corps d'une réponse 2xx en texte ; une autre réponse est une erreur. */
export async function readText(url: string, response: Response): Promise<string> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new RadioHttpError(`${url} : HTTP ${response.status}`, response.status);
  }
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new RadioHttpError(`${url} : réponse trop grande`, response.status);
  return text;
}

/** Du JSON, avec une seconde chance pour celui d'Icecast 2.4 (caractères de contrôle laissés dans les titres). */
export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/[\u0000-\u001f]+/g, " "));
  }
}
