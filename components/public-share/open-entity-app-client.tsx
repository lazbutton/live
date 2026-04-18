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
    }, 900);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(fallbackTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [deepLink, downloadFallbackPath]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b0b0c] px-4 py-6 text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/8 bg-white/[0.03] p-4 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#de3333]/25 bg-[#de3333]/10 text-[#ff9b9b]">
          <Smartphone className="h-6 w-6" />
        </div>
        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.28em] text-white/45">
          Ouverture en cours
        </p>
        <h1 className="mt-2 text-xl font-semibold leading-tight tracking-tight text-white sm:text-2xl">
          {displayName
            ? `Ouverture de ${displayName} dans OutLive`
            : `Ouverture de ${entityLabel(entity)} dans OutLive`}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/64">
          Si l&apos;app ne s&apos;ouvre pas, vous arriverez directement sur la page
          de téléchargement.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <a
            href={deepLink}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#de3333] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#c92b2b]"
          >
            <Smartphone className="h-4 w-4" />
            Ouvrir l&apos;app
          </a>
          <a
            href={downloadFallbackPath}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/82 transition hover:border-white/22 hover:bg-white/[0.07] hover:text-white"
          >
            <Download className="h-4 w-4" />
            Télécharger l&apos;app
          </a>
        </div>

        {(hasStoreLinks || returnPath) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-white/52">
            {returnPath ? (
              <a
                href={returnPath}
                className="inline-flex items-center gap-1.5 transition hover:text-white"
              >
                Continuer sur le site
              </a>
            ) : null}
            {hasStoreLinks ? (
              <a
                href={downloadFallbackPath}
                className="inline-flex items-center gap-1.5 transition hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Voir les stores
              </a>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
