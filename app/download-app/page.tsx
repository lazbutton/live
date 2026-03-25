import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Smartphone,
} from "lucide-react";

import { ArtistPageLogo } from "@/components/artists/artist-page-logo";
import { buildPublicMetadata } from "@/lib/metadata";
import {
  getPublicStoreUrls,
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
      className="group flex items-center justify-between gap-4 rounded-[24px] border border-white/12 bg-white/[0.04] px-5 py-4 text-left transition hover:border-white/24 hover:bg-white/[0.07]"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
          {caption}
        </div>
        <div className="mt-1 text-base font-semibold text-white">
          {label}
        </div>
      </div>
      <ExternalLink className="h-5 w-5 shrink-0 text-white/45 transition group-hover:text-white/70" />
    </a>
  );
}

export default async function DownloadAppPage({ searchParams }: PageProps) {
  const { from, name } = await searchParams;
  const safeReturnPath = normalizeInternalPath(from);
  const displayName = name?.trim() || null;
  const { appStoreUrl, playStoreUrl } = getPublicStoreUrls();
  const hasStoreLinks = Boolean(appStoreUrl || playStoreUrl);

  return (
    <main className="min-h-screen bg-[#0b0b0c] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <ArtistPageLogo />
          <Link
            href={safeReturnPath}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/78 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </header>

        <section className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_380px] lg:items-start">
          <div className="space-y-6">
            <div className="inline-flex w-fit rounded-full border border-[#de3333]/25 bg-[#de3333]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.26em] text-[#ff9b9b]">
              Télécharger l&apos;app
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {displayName
                  ? `Installez OutLive pour ouvrir ${displayName} directement dans l'app`
                  : "Installez OutLive pour ouvrir les artistes et événements dans l'app"}
              </h1>
              <p className="max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
                Ouvrez les profils artistes, les événements, les lieux et les
                organisateurs directement dans l&apos;expérience mobile OutLive.
              </p>
            </div>

            {hasStoreLinks ? (
              <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="rounded-[28px] border border-dashed border-white/12 bg-white/[0.025] p-6 text-white/68">
                Les liens de téléchargement ne sont pas encore configurés sur
                ce site. Ajoutez les URLs App Store et Google Play pour activer
                le téléchargement direct depuis cette page.
              </div>
            )}
          </div>

          <aside className="rounded-[32px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-white/84">
              <Smartphone className="h-7 w-7" />
            </div>

            <h2 className="mt-6 text-2xl font-semibold text-white">
              Une fois installée
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/65">
              Les liens OutLive ouvriront automatiquement le bon artiste, le
              bon événement ou le bon lieu directement dans l&apos;app.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 p-4">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9b9b]" />
                <div className="text-sm text-white/72">
                  Téléchargement rapide depuis cette page
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 p-4">
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
