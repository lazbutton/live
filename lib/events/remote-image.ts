export function isHttpImageUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function buildAdminProxyImageUrl(url: string) {
  return `/api/admin/images/proxy?url=${encodeURIComponent(url)}`;
}

export async function fetchAdminProxiedImageObjectUrl(params: {
  source: string;
  accessToken: string;
}) {
  const { source, accessToken } = params;
  const response = await fetch(buildAdminProxyImageUrl(source), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    // Avoid forwarding large site cookies; the bearer token is enough here.
    credentials: "omit",
  });

  if (!response.ok) {
    throw new Error(`Proxy image request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function resolveCropSource(params: {
  source: string;
}) {
  const { source } = params;
  return isHttpImageUrl(source)
    ? buildAdminProxyImageUrl(source)
    : source;
}

/**
 * Télécharge une image distante en passant par le proxy admin : la plupart des
 * sites (billetteries, CMS) n'autorisent pas la lecture directe depuis le navigateur.
 */
export async function fetchRemoteImageBlob(url: string): Promise<Blob> {
  const response = await fetch(buildAdminProxyImageUrl(url), { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(
      response.status === 415
        ? "Le lien ne pointe pas vers une image."
        : `Image distante inaccessible (${response.status}).`,
    );
  }
  return response.blob();
}
