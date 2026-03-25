"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Smartphone,
} from "lucide-react";

import {
  buildArtistDeepLink,
  buildDownloadAppPath,
  detectMobilePlatform,
  getPreferredStoreUrl,
} from "@/lib/mobile-app-links";

type OpenArtistAppClientProps = {
  artistId: string;
  artistName: string | null;
  returnPath: string;
};

export function OpenArtistAppClient({
  artistId,
  artistName,
  returnPath,
}: OpenArtistAppClientProps) {
  const pageHiddenRef = useRef(false);

  const deepLink = useMemo(() => buildArtistDeepLink(artistId), [artistId]);

  const downloadFallbackPath = useMemo(
    () =>
      buildDownloadAppPath({
        from: returnPath,
        name: artistName,
      }),
    [artistName, returnPath],
  );

  useEffect(() => {
    const platform = detectMobilePlatform(window.navigator.userAgent);
    const storeUrl = getPreferredStoreUrl(platform);
    const fallbackUrl = storeUrl || downloadFallbackPath;

    const handleVisibilityChange = () => {
      pageHiddenRef.current = document.visibilityState === "hidden";
    };

    const handlePageHide = () => {
      pageHiddenRef.current = true;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    const openTimer = window.setTimeout(() => {
      window.location.assign(deepLink);
    }, 80);

    const fallbackTimer = window.setTimeout(() => {
      if (pageHiddenRef.current || document.visibilityState === "hidden") {
        return;
      }

      window.location.replace(fallbackUrl);
    }, 1400);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(fallbackTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [deepLink, downloadFallbackPath]);

  return (
    <main className="min-h-screen bg-[#0b0b0c] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.035] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#de3333]/30 bg-[#de3333]/12 text-[#ff9b9b]">
            <Smartphone className="h-7 w-7" />
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
              Ouverture dans l&apos;app
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {artistName
                ? `Ouverture de ${artistName} dans OutLive`
                : "Ouverture de l'artiste dans OutLive"}
            </h1>
            <p className="max-w-xl text-sm leading-7 text-white/68 sm:text-base">
              Si l&apos;application ne s&apos;ouvre pas automatiquement, vous
              pouvez réessayer ou télécharger OutLive sur votre téléphone.
            </p>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href={deepLink}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#de3333] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#c92b2b]"
            >
              <Smartphone className="h-4 w-4" />
              Ouvrir l&apos;app
            </a>
            <Link
              href={downloadFallbackPath}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/82 transition hover:border-white/22 hover:bg-white/[0.07] hover:text-white"
            >
              <Download className="h-4 w-4" />
              Télécharger l&apos;app
            </Link>
          </div>

          <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-5">
            <p className="text-sm font-medium text-white/84">
              Pas encore installé ?
            </p>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Vous serez redirigé automatiquement vers la page de
              téléchargement si OutLive n&apos;est pas disponible sur cet
              appareil.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-white/56">
            <Link
              href={returnPath}
              className="inline-flex items-center gap-2 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Continuer sur le site
            </Link>
            <a
              href={deepLink}
              className="inline-flex items-center gap-2 transition hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Réessayer l&apos;ouverture
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
