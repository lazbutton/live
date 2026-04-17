"use client";

import { useEffect, useMemo, useRef } from "react";
import { Download, ExternalLink, Smartphone } from "lucide-react";

import {
  type AppOpenEntity,
  buildArtistDeepLink,
  buildDownloadAppPath,
  buildEventDeepLink,
  buildHubDeepLink,
  buildLocationDeepLink,
  buildOrganizerDeepLink,
  detectMobilePlatform,
  getPublicStoreUrls,
} from "@/lib/mobile-app-links";

type OpenEntityAppClientProps = {
  entity: AppOpenEntity;
  identifier: string;
  displayName: string | null;
  returnPath?: string;
};

function buildEntityDeepLink(entity: AppOpenEntity, identifier: string) {
  switch (entity) {
    case "artist":
      return buildArtistDeepLink(identifier);
    case "event":
      return buildEventDeepLink(identifier);
    case "location":
      return buildLocationDeepLink(identifier);
    case "organizer":
      return buildOrganizerDeepLink(identifier);
    case "hub":
      return buildHubDeepLink(identifier);
    default:
      return buildEventDeepLink(identifier);
  }
}

function entityLabel(entity: AppOpenEntity) {
  switch (entity) {
    case "artist":
      return "l'artiste";
    case "event":
      return "l'événement";
    case "location":
      return "le lieu";
    case "organizer":
      return "l'organisateur";
    case "hub":
      return "le hub";
    default:
      return "ce contenu";
  }
}

export function OpenEntityAppClient({
  entity,
  identifier,
  displayName,
  returnPath,
}: OpenEntityAppClientProps) {
  const pageHiddenRef = useRef(false);
  const deepLink = useMemo(
    () => buildEntityDeepLink(entity, identifier),
    [entity, identifier],
  );
  const { appStoreUrl, playStoreUrl } = getPublicStoreUrls();
  const hasStoreLinks = Boolean(appStoreUrl || playStoreUrl);
  const downloadFallbackPath = useMemo(
    () =>
      buildDownloadAppPath({
        from: returnPath,
        name: displayName,
      }),
    [displayName, returnPath],
  );

  useEffect(() => {
    const platform = detectMobilePlatform(window.navigator.userAgent);
    if (!platform) {
      window.location.replace(downloadFallbackPath);
      return;
    }

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

      window.location.replace(downloadFallbackPath);
    }, 1400);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(fallbackTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [deepLink, downloadFallbackPath]);

  return (
    <main className="min-h-dvh overflow-hidden bg-[#0b0b0c] px-4 py-4 text-white sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-xl items-center justify-center sm:min-h-[calc(100vh-5rem)]">
        <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.035] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-[32px] sm:p-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#de3333]/30 bg-[#de3333]/12 text-[#ff9b9b]">
            <Smartphone className="h-7 w-7" />
          </div>

          <div className="mt-5 space-y-2 sm:mt-6 sm:space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
              Télécharger l&apos;app
            </p>
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              {displayName
                ? `Téléchargez OutLive pour ouvrir ${displayName}`
                : `Téléchargez OutLive pour ouvrir ${entityLabel(entity)}`}
            </h1>
            <p className="mx-auto max-w-md text-sm leading-6 text-white/68 sm:max-w-xl sm:text-base sm:leading-7">
              Installez OutLive pour ouvrir ce contenu directement dans
              l&apos;application.
            </p>
          </div>

          {hasStoreLinks ? (
            <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
              {appStoreUrl ? (
                <a
                  href={appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-4 rounded-[22px] border border-white/12 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-white/24 hover:bg-white/[0.07] sm:rounded-[24px] sm:px-5 sm:py-4"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
                      iPhone
                    </div>
                    <div className="mt-1 text-base font-semibold text-white">
                      Télécharger sur l&apos;App Store
                    </div>
                  </div>
                  <ExternalLink className="h-5 w-5 shrink-0 text-white/45 transition group-hover:text-white/70" />
                </a>
              ) : null}
              {playStoreUrl ? (
                <a
                  href={playStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-4 rounded-[22px] border border-white/12 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-white/24 hover:bg-white/[0.07] sm:rounded-[24px] sm:px-5 sm:py-4"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
                      Android
                    </div>
                    <div className="mt-1 text-base font-semibold text-white">
                      Télécharger sur Google Play
                    </div>
                  </div>
                  <ExternalLink className="h-5 w-5 shrink-0 text-white/45 transition group-hover:text-white/70" />
                </a>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-[22px] border border-dashed border-white/12 bg-white/[0.025] p-4 text-sm text-white/62 sm:mt-8 sm:rounded-[24px] sm:p-5">
              Les liens de téléchargement iOS et Android ne sont pas encore
              configurés sur ce site.
            </div>
          )}

          <div className="mt-5 inline-flex max-w-md items-center justify-center gap-2 text-center text-xs leading-5 text-white/52 sm:mt-6 sm:text-sm">
            <Download className="h-4 w-4" />
            L&apos;app essaiera de s&apos;ouvrir automatiquement sur mobile si elle est déjà installée.
          </div>
        </div>
      </div>
    </main>
  );
}
