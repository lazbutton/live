import {
  createPublicShareImage,
  publicShareImageContentType,
  publicShareImageSize,
} from "@/lib/public-share-og";
import { getEventSharePageData } from "@/lib/public-share-data";

export const size = publicShareImageSize;
export const contentType = publicShareImageContentType;

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EventOpenGraphImage({ params }: PageProps) {
  const { id } = await params;
  const data = await getEventSharePageData(id);

  return createPublicShareImage({
    eyebrow: "Événement",
    title: data?.title || "OutLive",
    description:
      data?.description ||
      "Découvrez l'événement partagé sur OutLive avec une prévisualisation web riche.",
    metaItems: data
      ? [data.dateLabel, data.locationLabel, data.categoryLabel]
      : ["OutLive", "Événement"],
  });
}
