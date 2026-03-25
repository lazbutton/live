import type { Metadata } from "next";

export const SITE_NAME = "OutLive";
export const DEFAULT_METADATA_DESCRIPTION =
  "Decouvrez les evenements, artistes, lieux et sorties a Orleans avec OutLive.";

const DEFAULT_SHARE_IMAGE_PATH = "/opengraph-image";

export function getSiteUrl() {
  let baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function getMetadataBase() {
  return new URL(getSiteUrl());
}

export function absoluteUrl(path: string = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function resolveMetadataImageUrl(image: string | null | undefined) {
  if (image && /^https?:\/\//i.test(image)) {
    return image;
  }

  if (image && image.startsWith("/")) {
    return absoluteUrl(image);
  }

  return absoluteUrl(DEFAULT_SHARE_IMAGE_PATH);
}

type BuildPublicMetadataOptions = {
  title: string;
  description?: string;
  path?: string;
  image?: string | null;
  imageAlt?: string;
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
  keywords?: string[];
};

export function buildPublicMetadata({
  title,
  description = DEFAULT_METADATA_DESCRIPTION,
  path = "/",
  image,
  imageAlt,
  type = "website",
  noIndex = false,
  keywords,
}: BuildPublicMetadataOptions): Metadata {
  const imageUrl = resolveMetadataImageUrl(image);
  const canonicalUrl = absoluteUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    keywords,
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : {
          index: true,
          follow: true,
        },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: "fr_FR",
      type,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: imageAlt || title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
