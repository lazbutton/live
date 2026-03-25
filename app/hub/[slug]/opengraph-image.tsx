import {
  createPublicShareImage,
  publicShareImageContentType,
  publicShareImageSize,
} from "@/lib/public-share-og";
import { getHubSharePageData } from "@/lib/public-share-data";

export const size = publicShareImageSize;
export const contentType = publicShareImageContentType;

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function HubOpenGraphImage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHubSharePageData(slug);

  return createPublicShareImage({
    eyebrow: "Hub",
    title: data?.title || "OutLive",
    description:
      data?.description ||
      "Découvrez ce hub multi-événements sur OutLive.",
    metaItems: data
      ? [
          data.dateLabel,
          data.cityLabel,
          `${data.events.length} événement${data.events.length > 1 ? "s" : ""}`,
        ]
      : ["OutLive", "Hub"],
  });
}
