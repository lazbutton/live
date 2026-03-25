import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ExternalLink,
  Globe,
  MapPin,
  Ticket,
  Users,
} from "lucide-react";

import {
  PublicEventCard,
  PublicLinkCard,
  PublicPageShell,
  PublicSection,
} from "@/components/public-share/public-page-shell";
import { buildPublicMetadata } from "@/lib/metadata";
import { buildDownloadAppPath, buildHubOpenPath } from "@/lib/mobile-app-links";
import { getHubSharePageData } from "@/lib/public-share-data";

export const revalidate = 300;

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function ExternalActionCard({
  href,
  label,
  caption,
  icon,
}: {
  href: string;
  label: string;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.035] px-4 py-4 transition hover:border-white/18 hover:bg-white/[0.05]"
    >
      <div className="flex items-center gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/24 text-white/74">
          {icon}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
            {caption}
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{label}</div>
        </div>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-white/34 transition group-hover:text-white/66" />
    </a>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHubSharePageData(slug);

  if (!data) {
    return buildPublicMetadata({
      title: "Hub | OutLive",
      description: "Page publique d'un hub OutLive.",
      path: `/hub/${slug}`,
      image: `/hub/${slug}/opengraph-image`,
    });
  }

  return buildPublicMetadata({
    title: data.title,
    description:
      data.description ||
      `Découvrez le hub ${data.title} sur OutLive.`,
    path: data.sharePath,
    image: `${data.sharePath}/opengraph-image`,
    imageAlt: `Aperçu OutLive de ${data.title}`,
    keywords: [data.title, data.cityLabel || "", "OutLive", "hub"].filter(Boolean),
  });
}

export default async function HubSharePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHubSharePageData(slug);

  if (!data) {
    notFound();
  }

  const openInAppPath = buildHubOpenPath(data.slug, {
    from: data.sharePath,
    name: data.title,
  });
  const downloadAppPath = buildDownloadAppPath({
    from: data.sharePath,
    name: data.title,
  });

  return (
    <PublicPageShell
      eyebrow="Hub"
      title={data.title}
      description={
        data.description ||
        "Hub public OutLive avec aperçu riche, événements liés et ouverture directe dans l’application."
      }
      metaItems={[
        data.dateLabel,
        data.cityLabel,
        `${data.events.length} événement${data.events.length > 1 ? "s" : ""}`,
      ]}
      imageUrl={data.imageUrl}
      openInAppPath={openInAppPath}
      downloadAppPath={downloadAppPath}
    >
      {data.ticketUrl || data.officialUrl ? (
        <PublicSection
          title="Accès rapides"
          description="Les liens officiels connus pour ce hub."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {data.ticketUrl ? (
              <ExternalActionCard
                href={data.ticketUrl}
                caption="Billetterie"
                label="Réserver"
                icon={<Ticket className="h-4 w-4" />}
              />
            ) : null}
            {data.officialUrl ? (
              <ExternalActionCard
                href={data.officialUrl}
                caption="Site"
                label="Site officiel"
                icon={<Globe className="h-4 w-4" />}
              />
            ) : null}
          </div>
        </PublicSection>
      ) : null}

      <PublicSection
        title="Programme"
        description="Les événements actuellement reliés à ce hub sur OutLive."
      >
        {data.events.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.events.map((event) => (
              <PublicEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm text-white/62">
            Aucun événement public n&apos;est encore rattaché à ce hub.
          </div>
        )}
      </PublicSection>

      {data.locations.length > 0 ? (
        <PublicSection
          title="Lieux"
          description="Les lieux mis en avant dans ce hub."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.locations.map((location) => (
              <PublicLinkCard
                key={location.id}
                item={location}
                icon={<MapPin className="h-4 w-4" />}
              />
            ))}
          </div>
        </PublicSection>
      ) : null}

      {data.organizers.length > 0 ? (
        <PublicSection
          title="Organisateurs"
          description="Les équipes et partenaires associés à ce hub."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.organizers.map((organizer) => (
              <PublicLinkCard
                key={`${organizer.id}-${organizer.title}`}
                item={organizer}
                icon={<Users className="h-4 w-4" />}
              />
            ))}
          </div>
        </PublicSection>
      ) : null}

      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-white/68">
        Le partage de ce hub utilise une URL web publique afin d&apos;afficher une
        vraie preview riche dans les apps de messagerie et d&apos;ouvrir
        directement OutLive quand c&apos;est possible.
      </section>
    </PublicPageShell>
  );
}
