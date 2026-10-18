import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";

import {
  DEFAULT_METADATA_DESCRIPTION,
  SITE_NAME,
  absoluteUrl,
  getMetadataBase,
} from "@/lib/metadata";

import "./globals.css";

// Add Special Gothic Expanded One font via link in head

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  description: DEFAULT_METADATA_DESCRIPTION,
  keywords: [
    "OutLive",
    "Orleans",
    "evenements",
    "sorties",
    "artistes",
    "concerts",
    "agenda culturel",
  ],
  referrer: "origin-when-cross-origin",
  category: "events",
  alternates: {
    canonical: absoluteUrl("/"),
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    title: SITE_NAME,
    description: DEFAULT_METADATA_DESCRIPTION,
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    locale: "fr_FR",
    type: "website",
    images: [
      {
        url: absoluteUrl("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: "OutLive",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_METADATA_DESCRIPTION,
    images: [absoluteUrl("/opengraph-image")],
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/icon", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
    >
      <body suppressHydrationWarning className="antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var html = document.documentElement;
                var media = window.matchMedia('(prefers-color-scheme: dark)');
                function readPreference() {
                  try {
                    var saved = localStorage.getItem('theme');
                    return saved === 'light' || saved === 'dark' ? saved : 'system';
                  } catch (e) {
                    return 'system';
                  }
                }
                function apply() {
                  var preference = readPreference();
                  var isDark = preference === 'dark' || (preference === 'system' && media.matches);
                  html.classList.toggle('dark', isDark);
                  html.style.colorScheme = isDark ? 'dark' : 'light';
                }
                apply();
                // Sans préférence enregistrée, on suit le thème du système en direct.
                media.addEventListener('change', function() {
                  if (readPreference() === 'system') apply();
                });
              })();
            `,
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
