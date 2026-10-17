/*
 * Manifeste de l'application « OutLive Ajout » : portée limitée à /ajout pour ne pas
 * rendre le reste du site installable. Sur Android, l'application installée apparaît
 * dans le menu Partager (Instagram, Facebook, navigateur) et reçoit le lien partagé.
 */

const manifest = {
  id: "/ajout",
  name: "OutLive Ajout",
  short_name: "Ajout",
  description: "Ajouter un lieu, une structure ou un artiste à OutLive ; l'IA récupère ensuite leurs événements.",
  lang: "fr",
  dir: "ltr",
  start_url: "/ajout",
  scope: "/ajout",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0a0a0a",
  theme_color: "#0a0a0a",
  icons: [
    { src: "/ajout/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/ajout/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/ajout/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  share_target: {
    action: "/ajout",
    method: "GET",
    params: { title: "title", text: "text", url: "url" },
  },
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
