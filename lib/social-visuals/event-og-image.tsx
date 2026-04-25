import { ImageResponse } from "next/og";

import { OutLiveAppMark, OUTLIVE_BRAND } from "@/lib/outlive-brand";
import type { EventSharePageData } from "@/lib/public-share-data";
import { publicShareImageSize } from "@/lib/public-share-og";

const fallbackTitle = "Événement OutLive";
const fallbackDescription =
  "Découvrez l'événement partagé sur OutLive avec une prévisualisation riche.";

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ") : null;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolveHeroImage(data: EventSharePageData | null) {
  return (
    cleanText(data?.imageUrl) ||
    cleanText(data?.locationLink?.imageUrl) ||
    cleanText(data?.organizers[0]?.imageUrl) ||
    cleanText(data?.hub?.imageUrl)
  );
}

function resolveMainMeta(data: EventSharePageData | null) {
  return [data?.dateLabel, data?.locationLabel].map(cleanText).filter(Boolean).join(" · ");
}

function resolveDetailPills(data: EventSharePageData | null) {
  if (!data) return ["OutLive", "Événement"];

  return [
    cleanText(data.categoryLabel),
    cleanText(data.priceLabel),
    ...data.tagLabels.map(cleanText).filter(Boolean).slice(0, 2),
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function resolveSignature(data: EventSharePageData | null) {
  const organizers = data?.organizers
    .map((organizer) => cleanText(organizer.title))
    .filter(Boolean)
    .slice(0, 2);

  if (organizers && organizers.length > 0) {
    return `Organisé par ${organizers.join(" · ")}`;
  }

  return "outlive.fr";
}

type EventOgImageOptions = {
  data: EventSharePageData | null;
};

export function createEventOgImage({ data }: EventOgImageOptions) {
  const title = truncateText(cleanText(data?.title) || fallbackTitle, 78);
  const description = truncateText(cleanText(data?.description) || fallbackDescription, 150);
  const heroImage = resolveHeroImage(data);
  const mainMeta = resolveMainMeta(data);
  const detailPills = resolveDetailPills(data);
  const signature = resolveSignature(data);

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "radial-gradient(circle at 12% 10%, rgba(234,47,47,0.32), transparent 25%), radial-gradient(circle at 88% 90%, rgba(255,255,255,0.10), transparent 22%), linear-gradient(135deg, #0b0b0d 0%, #19191d 56%, #0f0f12 100%)",
          color: OUTLIVE_BRAND.foreground,
          display: "flex",
          fontFamily: "Inter, Arial, sans-serif",
          height: "100%",
          overflow: "hidden",
          padding: 54,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 40,
            display: "flex",
            height: "100%",
            overflow: "hidden",
            position: "relative",
            width: "100%",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.035)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "42px 44px",
              width: "55%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: 14,
                }}
              >
                <OutLiveAppMark size={42} dotScale={0.45} exclamationScale={0.62} />
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: 30,
                    fontWeight: 900,
                    letterSpacing: -0.8,
                  }}
                >
                  OutLive
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(234,47,47,0.38)",
                  borderRadius: 999,
                  color: "#ffb0b0",
                  display: "flex",
                  fontSize: 15,
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  padding: "9px 14px",
                  textTransform: "uppercase",
                }}
              >
                Événement
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                width: "100%",
              }}
            >
              {mainMeta ? (
                <div
                  style={{
                    color: "rgba(255,255,255,0.70)",
                    display: "flex",
                    fontSize: 25,
                    fontWeight: 800,
                    lineHeight: 1.16,
                  }}
                >
                  {mainMeta}
                </div>
              ) : null}

              <div
                style={{
                  color: "#ffffff",
                  display: "flex",
                  fontSize: title.length > 54 ? 58 : 66,
                  fontWeight: 950,
                  letterSpacing: -3,
                  lineHeight: 0.94,
                  textTransform: "uppercase",
                }}
              >
                {title}
              </div>

              <div
                style={{
                  color: "rgba(255,255,255,0.72)",
                  display: "flex",
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.28,
                  maxWidth: 560,
                }}
              >
                {description}
              </div>
            </div>

            <div
              style={{
                alignItems: "flex-end",
                display: "flex",
                gap: 16,
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  maxWidth: 430,
                }}
              >
                {detailPills.map((pill) => (
                  <div
                    key={pill}
                    style={{
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.13)",
                      borderRadius: 999,
                      color: "rgba(255,255,255,0.82)",
                      display: "flex",
                      fontSize: 17,
                      fontWeight: 800,
                      padding: "9px 14px",
                    }}
                  >
                    {pill}
                  </div>
                ))}
              </div>

              <div
                style={{
                  color: "rgba(255,255,255,0.52)",
                  display: "flex",
                  fontSize: 17,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  maxWidth: 220,
                  textAlign: "right",
                }}
              >
                {signature}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              display: "flex",
              flex: 1,
              position: "relative",
            }}
          >
            {heroImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                src={heroImage}
                style={{
                  height: "100%",
                  objectFit: "cover",
                  width: "100%",
                }}
              />
            ) : (
              <div
                style={{
                  alignItems: "center",
                  background:
                    "radial-gradient(circle at 30% 20%, rgba(234,47,47,0.42), transparent 26%), linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))",
                  color: "rgba(255,255,255,0.52)",
                  display: "flex",
                  fontSize: 44,
                  fontWeight: 950,
                  height: "100%",
                  justifyContent: "center",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  width: "100%",
                }}
              >
                OutLive
              </div>
            )}

            <div
              style={{
                background:
                  "linear-gradient(90deg, rgba(11,11,13,0.82) 0%, rgba(11,11,13,0.20) 34%, rgba(11,11,13,0) 100%)",
                display: "flex",
                inset: 0,
                position: "absolute",
              }}
            />
          </div>
        </div>
      </div>
    ),
    publicShareImageSize,
  );
}
