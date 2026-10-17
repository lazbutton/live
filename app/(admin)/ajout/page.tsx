import { extractFirstUrl } from "@/lib/collecte/quick-links";

import { QuickAddApp } from "./quick-add-app";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Lien reçu par le partage du téléphone (cible de partage du manifeste : title, text, url). */
function sharedLinkFrom(params: Awaited<SearchParams>) {
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  return extractFirstUrl(value("url")) || extractFirstUrl(value("text")) || extractFirstUrl(value("title"));
}

export default async function AjoutPage({ searchParams }: { searchParams: SearchParams }) {
  return <QuickAddApp sharedLink={sharedLinkFrom(await searchParams)} />;
}
