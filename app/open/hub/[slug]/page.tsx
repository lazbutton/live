import type { Metadata } from "next";

import { OpenEntityAppClient } from "@/components/public-share/open-entity-app-client";
import { buildPublicMetadata } from "@/lib/metadata";
import { normalizeInternalPath } from "@/lib/mobile-app-links";

export const metadata: Metadata = buildPublicMetadata({
  title: "Ouvrir dans l'app OutLive",
  description: "Redirection vers l'application OutLive.",
  path: "/open/hub",
  noIndex: true,
});

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    from?: string;
    name?: string;
  }>;
};

export default async function OpenHubAppPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { from, name } = await searchParams;

  return (
    <OpenEntityAppClient
      entity="hub"
      identifier={slug}
      displayName={name?.trim() || null}
      returnPath={normalizeInternalPath(from)}
    />
  );
}
