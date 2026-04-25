import { ImageResponse } from "next/og";

import type { EventSharePageData } from "@/lib/public-share-data";
import { publicShareImageSize } from "@/lib/public-share-og";

const fallbackTitle = "Événement OutLive";
const posterBackground = "#274c77";
const posterText = "#ffffff";
const posterMutedText = "rgba(255,255,255,0.66)";
const posterDivider = "rgba(255,255,255,0.18)";

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ") : null;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function wrapPosterTitle(title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean) return ["OUTLIVE"];

  const words = clean.split(" ");
  if (words.length <= 3 && clean.length <= 28) {
    return [clean];
  }

  const lines: string[] = [];
  let currentLine = "";
  const maxCharsPerLine = clean.length > 40 ? 15 : 18;
  let nextWordIndex = 0;

  while (nextWordIndex < words.length && lines.length < 3) {
    const word = words[nextWordIndex] ?? "";
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine || currentLine.length === 0) {
      currentLine = candidate;
      nextWordIndex += 1;
      continue;
    }

    lines.push(currentLine);
    currentLine = "";
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const remainingWords = words.slice(nextWordIndex);
  if (remainingWords.length > 0 && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${remainingWords.join(" ")}`.trim();
  }

  return lines.slice(0, 3);
}

function resolveTagsLabel(data: EventSharePageData | null) {
  const tags = data?.tagLabels.map(cleanText).filter(Boolean).slice(0, 4) ?? [];
  return tags.join(", ");
}

function resolveCategoryLabel(data: EventSharePageData | null) {
  return cleanText(data?.categoryLabel) || "Événement";
}

function resolvePriceLabel(data: EventSharePageData | null) {
  return cleanText(data?.priceLabel) || "";
}

function resolveVenueLabel(data: EventSharePageData | null) {
  return cleanText(data?.locationLabel) || "Lieu à confirmer";
}

function resolveDateLabel(data: EventSharePageData | null) {
  return cleanText(data?.dateLabel) || "Date à confirmer";
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
  const titleLines = wrapPosterTitle(truncateText(cleanText(data?.title) || fallbackTitle, 76));
  const categoryLabel = resolveCategoryLabel(data);
  const priceLabel = resolvePriceLabel(data);
  const tagsLabel = resolveTagsLabel(data);
  const venueLabel = truncateText(resolveVenueLabel(data), 58);
  const dateLabel = truncateText(resolveDateLabel(data), 64);
  const signature = resolveSignature(data);

  return new ImageResponse(
    (
      <div
        style={{
          background: "#111827",
          color: posterText,
          display: "flex",
          fontFamily: "Inter, Arial, sans-serif",
          height: "100%",
          overflow: "hidden",
          padding: 42,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: posterBackground,
            border: `2px solid ${posterText}`,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              borderBottom: `2px solid ${posterDivider}`,
              display: "flex",
              justifyContent: "space-between",
              padding: "24px 34px 20px",
              width: "100%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                gap: 12,
              }}
            >
              <div
                style={{
                  backgroundColor: "#DE3333",
                  borderRadius: 999,
                  display: "flex",
                  height: 14,
                  width: 14,
                }}
              />
              <div
                style={{
                  color: posterText,
                  display: "flex",
                  fontSize: 29,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                OutLive !
              </div>
            </div>

            <div
              style={{
                color: posterText,
                display: "flex",
                fontSize: 28,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {dateLabel}
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              borderBottom: `2px solid ${posterDivider}`,
              display: "flex",
              justifyContent: "space-between",
              padding: "24px 38px",
              width: "100%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                maxWidth: 560,
              }}
            >
              <div
                style={{
                  border: `2px solid ${posterDivider}`,
                  color: posterText,
                  display: "flex",
                  fontSize: 21,
                  fontWeight: 900,
                  letterSpacing: "0.05em",
                  padding: "9px 17px",
                  textTransform: "uppercase",
                }}
              >
                {categoryLabel}
              </div>
              {priceLabel ? (
                <div
                  style={{
                    background: posterText,
                    color: posterBackground,
                    display: "flex",
                    fontSize: 22,
                    fontWeight: 950,
                    padding: "9px 17px",
                  }}
                >
                  {priceLabel}
                </div>
              ) : null}
            </div>

            <div
              style={{
                color: posterText,
                display: "flex",
                fontSize: 25,
                fontWeight: 800,
                lineHeight: 1.2,
                maxWidth: 470,
                textAlign: "right",
              }}
            >
              {tagsLabel || "OutLive"}
            </div>
          </div>

          <div
            style={{
              borderBottom: `2px solid ${posterDivider}`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minHeight: 214,
              padding: "30px 38px 34px",
              width: "100%",
            }}
          >
            <div
              style={{
                color: posterText,
                display: "flex",
                flexDirection: "column",
                fontSize: titleLines.length > 2 ? 68 : 78,
                fontWeight: 950,
                letterSpacing: "-0.055em",
                lineHeight: 0.88,
                textTransform: "uppercase",
              }}
            >
              {titleLines.map((line, index) => (
                <div key={`${line}-${index}`} style={{ display: "flex" }}>
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderBottom: `2px solid ${posterDivider}`,
              display: "flex",
              width: "100%",
            }}
          >
            <div
              style={{
                borderRight: `2px solid ${posterDivider}`,
                display: "flex",
                flexDirection: "column",
                padding: "25px 38px",
                width: "50%",
              }}
            >
              <div
                style={{
                  color: posterMutedText,
                  display: "flex",
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  marginBottom: 10,
                  textTransform: "uppercase",
                }}
              >
                Lieu
              </div>
              <div
                style={{
                  color: posterText,
                  display: "flex",
                  fontSize: 33,
                  fontWeight: 950,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.06,
                  textTransform: "uppercase",
                }}
              >
                {venueLabel}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "25px 38px",
                width: "50%",
              }}
            >
              <div
                style={{
                  color: posterMutedText,
                  display: "flex",
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  marginBottom: 10,
                  textTransform: "uppercase",
                }}
              >
                Horaires
              </div>
              <div
                style={{
                  color: posterText,
                  display: "flex",
                  fontSize: 33,
                  fontWeight: 950,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.06,
                }}
              >
                {dateLabel}
              </div>
            </div>
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "flex-end",
              padding: "16px 38px",
              width: "100%",
            }}
          >
            <div
              style={{
                color: posterMutedText,
                display: "flex",
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1.2,
                textAlign: "right",
              }}
            >
              {signature}
            </div>
          </div>
        </div>
      </div>
    ),
    publicShareImageSize,
  );
}
