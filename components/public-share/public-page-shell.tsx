"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Calendar,
  Download,
  ExternalLink,
  MapPin,
  Smartphone,
} from "lucide-react";

import { ArtistPageLogo } from "@/components/artists/artist-page-logo";
import type {
  PublicEventListItem,
  PublicLinkItem,
} from "@/lib/public-share-data";

type PublicPageShellProps = {
  eyebrow: string;
  title: string;
  description?: string | null;
  metaItems?: Array<string | null | undefined>;
  imageUrl?: string | null;
  openInAppPath: string;
  downloadAppPath: string;
  children: ReactNode;
};

type PublicSectionProps = {
  title: string;
  description?: string | null;
  children: ReactNode;
};

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PublicPageShell({
  eyebrow,
  title,
  description,
  metaItems = [],
  imageUrl,
  openInAppPath,
  downloadAppPath,
  children,
}: PublicPageShellProps) {
  const normalizedMetaItems = metaItems.filter(
    (item): item is string => Boolean(item?.trim()),
  );

  return (
    <div className="min-h-screen overflow-hidden bg-[#0b0b0c] text-white">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 hidden sm:block">
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:mt-6 sm:px-6 lg:px-8">
          <div className="pointer-events-auto rounded-[24px] bg-[#0b0b0c]/72 px-3 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl sm:rounded-[28px] sm:px-4 sm:py-4 lg:px-5">
            <div className="flex items-center justify-center sm:justify-between">
              <ArtistPageLogo showCompactFloating={false} />

              <div className="hidden flex-wrap items-center gap-2 sm:flex sm:gap-3">
                <Link
                  href={openInAppPath}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(235,235,238,0.92)_100%)] px-4 py-2.5 text-sm font-semibold text-[#0f1012] shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition hover:scale-[1.01] hover:border-white/20 hover:bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(244,244,246,0.96)_100%)]"
                >
                  <Smartphone className="h-4 w-4" />
                  Ouvrir dans l&apos;app
                </Link>
                <Link
                  href={downloadAppPath}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-white/84 transition hover:border-white/24 hover:bg-white/[0.075] hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  Télécharger l&apos;app
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <header className="pointer-events-none fixed inset-x-0 bottom-0 z-40 sm:hidden">
        <div className="mx-auto max-w-7xl px-4 pb-4">
          <div
            className="pointer-events-auto rounded-[28px] border border-white/10 bg-[#0b0b0c]/78 px-4 pt-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            }}
          >
            <div className="flex flex-col items-center gap-3">
              <ArtistPageLogo showCompactFloating={false} />
              <div className="grid w-full grid-cols-2 gap-2">
                <Link
                  href={openInAppPath}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(235,235,238,0.92)_100%)] px-4 py-3 text-sm font-semibold text-[#0f1012] shadow-[0_12px_24px_rgba(0,0,0,0.22)] transition hover:scale-[1.01]"
                >
                  <Smartphone className="h-4 w-4" />
                  Ouvrir l&apos;app
                </Link>
                <Link
                  href={downloadAppPath}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.045] px-4 py-3 text-sm font-semibold text-white/84 transition hover:border-white/24 hover:bg-white/[0.075] hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-48 pt-10 sm:px-6 sm:pb-24 sm:pt-36 lg:px-8 lg:pt-32">
        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_380px] lg:items-center">
          <div className="space-y-5">
            <div className="inline-flex w-fit rounded-full border border-[#de3333]/25 bg-[#de3333]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.26em] text-[#ff9b9b]">
              {eyebrow}
            </div>

            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              {description ? (
                <p className="max-w-3xl text-base leading-8 text-white/70 sm:text-lg">
                  {description}
                </p>
              ) : null}
            </div>

            {normalizedMetaItems.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {normalizedMetaItems.map((item) => (
                  <div
                    key={item}
                    className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-sm text-white/78"
                  >
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative aspect-[1.05/1] overflow-hidden rounded-[36px] border border-white/10 bg-[#171719] shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
            {imageUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(222,51,51,0.35),_transparent_58%),linear-gradient(180deg,_#1a1a1d_0%,_#101012_100%)] text-6xl font-semibold tracking-[0.24em] text-white/22">
                {getInitials(title)}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0c] via-[#0b0b0c]/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <div className="rounded-[24px] border border-white/10 bg-black/26 px-4 py-3 backdrop-blur-xl">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                  Partage OutLive
                </div>
                <div className="mt-2 text-lg font-semibold leading-tight text-white">
                  Lien web riche + ouverture directe dans l&apos;app
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-12 space-y-10">{children}</div>
      </main>
    </div>
  );
}

export function PublicSection({
  title,
  description,
  children,
}: PublicSectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm leading-7 text-white/62">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PublicEventCard({ event }: { event: PublicEventListItem }) {
  return (
    <Link
      href={event.href}
      className="group block overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[#171719]">
        {event.imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-[1.04]"
            style={{ backgroundImage: `url(${event.imageUrl})` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(222,51,51,0.35),_transparent_58%),linear-gradient(180deg,_#1a1a1d_0%,_#101012_100%)] text-3xl font-semibold tracking-[0.24em] text-white/22">
            {getInitials(event.title)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0c] via-[#0b0b0c]/10 to-transparent" />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-[11px] uppercase tracking-[0.2em] text-white/48">
            {event.locationLabel || "Lieu OutLive"}
          </div>
          {event.categoryLabel ? (
            <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-white/55">
              {event.categoryLabel}
            </div>
          ) : null}
        </div>

        <div className="text-lg font-semibold leading-tight text-white">
          {event.title}
        </div>

        <div className="flex items-start gap-2 text-sm text-white/68">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{event.dateLabel}</span>
        </div>
      </div>
    </Link>
  );
}

export function PublicLinkCard({
  item,
  icon = <MapPin className="h-4 w-4" />,
}: {
  item: PublicLinkItem;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={item.href}
      className="group flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-4 transition hover:border-white/18 hover:bg-white/[0.05]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/24 text-white/74">
          {item.imageUrl ? (
            <div
              className="h-11 w-11 rounded-2xl bg-cover bg-center"
              style={{ backgroundImage: `url(${item.imageUrl})` }}
            />
          ) : (
            icon
          )}
        </div>

        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {item.title}
          </div>
          {item.subtitle ? (
            <div className="truncate text-sm text-white/58">{item.subtitle}</div>
          ) : null}
        </div>
      </div>

      <ExternalLink className="h-4 w-4 shrink-0 text-white/34 transition group-hover:text-white/66" />
    </Link>
  );
}
