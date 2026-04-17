"use client";

import { useEffect, useMemo } from "react";
import { Download, ExternalLink, Smartphone } from "lucide-react";

import {
  type AppOpenEntity,
  buildArtistDeepLink,
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
}: OpenEntityAppClientProps) {
  const deepLink = useMemo(
    () => buildEntityDeepLink(entity, identifier),
    [entity, identifier],
  );
  const { appStoreUrl, playStoreUrl } = getPublicStoreUrls();
  const hasStoreLinks = Boolean(appStoreUrl || playStoreUrl);

  useEffect(() => {
    const platform = detectMobilePlatform(window.navigator.userAgent);
    if (!platform) {
      return;
    }

    const openTimer = window.setTimeout(() => {
      window.location.assign(deepLink);
    }, 80);

    return () => {
      window.clearTimeout(openTimer);
    };
  }, [deepLink]);

  return (
    <main className="min-h-screen bg-[#0b0b0c] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center justify-center">
        <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.035] p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#de3333]/30 bg-[#de3333]/12 text-[#ff9b9b]">
            <Smartphone className="h-7 w-7" />
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
              Télécharger l&apos;app
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {displayName
                ? `Téléchargez OutLive pour ouvrir ${displayName}`
                : `Téléchargez OutLive pour ouvrir ${entityLabel(entity)}`}
            </h1>
            <p className="max-w-xl text-sm leading-7 text-white/68 sm:text-base">
              Installez OutLive sur iPhone ou Android pour ouvrir ce contenu
              directement dans l&apos;application.
            </p>
          </div>

          {hasStoreLinks ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {appStoreUrl ? (
                <a
                  href={appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-4 rounded-[24px] border border-white/12 bg-white/[0.04] px-5 py-4 text-left transition hover:border-white/24 hover:bg-white/[0.07]"
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
                  className="group flex items-center justify-between gap-4 rounded-[24px] border border-white/12 bg-white/[0.04] px-5 py-4 text-left transition hover:border-white/24 hover:bg-white/[0.07]"
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
            <div className="mt-8 rounded-[24px] border border-dashed border-white/12 bg-white/[0.025] p-5 text-sm text-white/62">
              Les liens de téléchargement iOS et Android ne sont pas encore
              configurés sur ce site.
            </div>
          )}

          <div className="mt-6 inline-flex items-center gap-2 text-sm text-white/52">
            <Download className="h-4 w-4" />
            L&apos;app essaiera de s&apos;ouvrir automatiquement sur mobile si elle est déjà installée.
          </div>
        </div>
      </div>
    </main>
  );
}
