export function isHttpImageUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function buildAdminProxyImageUrl(url: string, token: string | null) {
  const base = `/api/admin/images/proxy?url=${encodeURIComponent(url)}`;
  if (!token) return base;
  return `${base}&token=${encodeURIComponent(token)}&_cb=${Date.now()}`;
}

export function resolveCropSource(params: {
  source: string;
  proxyToken: string | null;
}) {
  const { source, proxyToken } = params;
  return isHttpImageUrl(source)
    ? buildAdminProxyImageUrl(source, proxyToken)
    : source;
}
