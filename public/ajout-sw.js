/*
 * Service worker de l'écran mobile /ajout (portée /ajout).
 * Réseau d'abord pour la page, copie gardée pour l'ouvrir sans réseau ;
 * fichiers /_next/static (immuables) servis depuis le cache.
 * Les ajouts eux-mêmes partent toujours au réseau : la saisie reste en brouillon sur le téléphone.
 */

const CACHE = "outlive-ajout-v1";
const PAGE = "/ajout";
const MAX_ASSETS = 120;

const OFFLINE_HTML = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pas de réseau</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;background:#fff;color:#171717}
  p{color:#737373;max-width:22rem;line-height:1.5}
  @media (prefers-color-scheme:dark){body{background:#0a0a0a;color:#ededed}p{color:#a3a3a3}}
</style></head>
<body><main><h1>Pas de réseau</h1><p>Ta saisie reste gardée sur ce téléphone. Rouvre l'écran dès que le réseau revient.</p></main></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("outlive-ajout-") && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function trimAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((request) => new URL(request.url).pathname.startsWith("/_next/static/"));
  await Promise.all(assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map((request) => cache.delete(request)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && url.pathname === PAGE && !url.search) {
            const cache = await caches.open(CACHE);
            await cache.put(PAGE, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(PAGE);
          return cached || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          trimAssets(cache).catch(() => {});
        }
        return response;
      })(),
    );
  }
});
