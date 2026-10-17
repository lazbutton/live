import type { Metadata, Viewport } from "next";

import "./ajout.css";

/*
 * Écran mobile d'ajout rapide, installable comme application (PWA limitée à /ajout).
 * Palette propre à l'écran (ajout.css), claire ou sombre selon le téléphone.
 */

export const metadata: Metadata = {
  title: "Ajout rapide",
  description: "Ajouter un lieu, une structure ou un artiste à OutLive depuis son téléphone.",
  applicationName: "OutLive Ajout",
  manifest: "/ajout/app.webmanifest",
  appleWebApp: {
    capable: true,
    title: "OutLive Ajout",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/ajout/app-icon/192?v=3", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/ajout/app-icon/180?v=3", type: "image/png", sizes: "180x180" }],
  },
  alternates: { canonical: "/ajout" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function AjoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-app-shell="ajout" className="min-h-svh bg-background text-foreground">
      {children}
    </div>
  );
}
