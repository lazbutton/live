import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Smartphone,
} from "lucide-react";

import { ArtistPageLogo } from "@/components/artists/artist-page-logo";
import { DownloadAppAutoOpen } from "@/components/public-share/download-app-auto-open";
import { buildPublicMetadata } from "@/lib/metadata";
import {
  getPublicStoreUrls,
  normalizeAppDeepLink,
  normalizeInternalPath,
} from "@/lib/mobile-app-links";

export const metadata: Metadata = buildPublicMetadata({
  title: "Télécharger OutLive",
  description:
    "Téléchargez OutLive pour ouvrir les artistes, événements et lieux directement dans l'application.",
  path: "/download-app",
  noIndex: true,
});

type PageProps = {
  searchParams: Promise<{
    from?: string;
    name?: string;
    deepLink?: string;
  }>;
};

function DownloadButton({
  href,
  label,
  caption,
}: {
  href: string;
  label: string;
  caption: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between gap-3 rounded-[20px] border border-white/12 bg-white/[0.04] px-4 py-3 text-left transition hover:border-white/24 hover:bg-white/[0.07] sm:gap-4 sm:rounded-[24px] sm:px-5 sm:py-4"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
          {caption}
        </div>
        <div className="mt-1 text-sm font-semibold text-white sm:text-base">
          {label}
        </div>
      </div>
      <ExternalLink className="h-5 w-5 shrink-0 text-white/45 transition group-hover:text-white/70" />
    </a>
  );
}

export default async function DownloadAppPage({ searchParams }: PageProps) {
  const { from, name, deepLink } = await searchParams;
  const safeReturnPath = normalizeInternalPath(from);
  const displayName = name?.trim() || null;
  const normalizedDeepLink = normalizeAppDeepLink(deepLink);
  const { appStoreUrl, playStoreUrl } = getPublicStoreUrls();
  const hasStoreLinks = Boolean(appStoreUrl || playStoreUrl);

  return (
    <main className="min-h-dvh overflow-hidden bg-[#0b0b0c] px-4 py-2 text-white sm:px-6 sm:py-6 lg:px-8">
      <DownloadAppAutoOpen deepLink={normalizedDeepLink} />
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-5xl flex-col sm:min-h-[calc(100dvh-3rem)]">
        <header className="flex shrink-0 items-center justify-between gap-2">
          <ArtistPageLogo />
          <Link
            href={safeReturnPath}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/78 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </header>

        <section className="mt-3 grid flex-1 gap-3 overflow-hidden lg:mt-8 lg:grid-cols-[minmax(0,1.08fr)_340px] lg:items-stretch lg:gap-6">
          <div className="flex min-h-0 flex-col justify-center gap-2.5 lg:gap-5">
            <div className="inline-flex w-fit rounded-full border border-[#de3333]/25 bg-[#de3333]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[#ff9b9b]">
              Télécharger l&apos;app
            </div>

            <div className="space-y-2 sm:space-y-3">
              <h1 className="max-w-3xl text-[1.7rem] font-semibold leading-tight tracking-tight text-white sm:text-[2.6rem] lg:text-5xl">
                {displayName
                  ? `Installez OutLive pour ouvrir ${displayName} directement dans l'app`
                  : "Installez OutLive pour ouvrir les artistes et événements dans l'app"}
              </h1>
              <p className="max-w-2xl text-[13px] leading-5 text-white/68 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Ouvrez artistes, événements, lieux et organisateurs directement
                dans l&apos;app OutLive.
              </p>
            </div>

            {hasStoreLinks ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {appStoreUrl ? (
                  <DownloadButton
                    href={appStoreUrl}
                    caption="iPhone"
                    label="Télécharger sur l’App Store"
                  />
                ) : null}
                {playStoreUrl ? (
                  <DownloadButton
                    href={playStoreUrl}
                    caption="Android"
                    label="Télécharger sur Google Play"
                  />
                ) : null}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.025] p-4 text-sm leading-6 text-white/68 sm:p-5">
                Les liens de téléchargement ne sont pas encore configurés sur
                ce site. Ajoutez les URLs App Store et Google Play pour activer
                le téléchargement direct depuis cette page.
              </div>
            )}

            <div className="lg:hidden">
              <p className="text-xs leading-4 text-white/56">
                Une fois installée, les liens OutLive ouvriront directement le
                bon contenu dans l&apos;app.
              </p>
            </div>
          </div>

          <aside className="hidden h-full rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:flex lg:flex-col lg:justify-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-white/84">
              <Smartphone className="h-7 w-7" />
            </div>

            <h2 className="mt-5 text-2xl font-semibold text-white">
              Une fois installée
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-white/65">
              Les liens OutLive ouvriront automatiquement le bon artiste, le
              bon événement ou le bon lieu directement dans l&apos;app.
            </p>

            <div className="mt-5 space-y-3">
              <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 p-3.5">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9b9b]" />
                <div className="text-sm text-white/72">
                  Téléchargement rapide depuis cette page
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 p-3.5">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9b9b]" />
                <div className="text-sm text-white/72">
                  Redirection automatique vers l&apos;app si elle est déjà installée
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
