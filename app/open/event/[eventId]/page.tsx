import type { Metadata } from "next";

import { OpenEntityAppClient } from "@/components/public-share/open-entity-app-client";
import { buildPublicMetadata } from "@/lib/metadata";
import { normalizeInternalPath } from "@/lib/mobile-app-links";

export const metadata: Metadata = buildPublicMetadata({
  title: "Ouvrir dans l'app OutLive",
  description: "Redirection vers l'application OutLive.",
  path: "/open/event",
  noIndex: true,
});

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    from?: string;
    name?: string;
  }>;
};

export default async function OpenEventAppPage({
  params,
  searchParams,
}: PageProps) {
  const { eventId } = await params;
  const { from, name } = await searchParams;

  return (
    <OpenEntityAppClient
      entity="event"
      identifier={eventId}
      displayName={name?.trim() || null}
      returnPath={normalizeInternalPath(from)}
    />
  );
}
