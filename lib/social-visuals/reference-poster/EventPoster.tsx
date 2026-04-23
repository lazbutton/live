import { Fragment, forwardRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

import { createPosterTheme } from "./defaultPosterData";
import type { PartialPosterTheme, PosterDetailRow, PosterData } from "./types";

export interface EventPosterProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  capturePadding?: number;
  data: PosterData;
  theme?: PartialPosterTheme;
  width?: number | string;
}

const sansFont =
  '"Space Grotesk", "Inter", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
const landingLogoFont =
  '"Special Gothic Expanded One", "Space Grotesk", "Inter", sans-serif';

function renderMultilineText(value: string) {
  return value.split(/\r?\n/).map((line, index) => (
    <Fragment key={`${line}-${index}`}>
      {index > 0 ? <br /> : null}
      {line || "\u00A0"}
    </Fragment>
  ));
}

function toDimension(value: number | string) {
  return typeof value === "number" ? `${value}px` : value;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  return {
    blue: Number.parseInt(value.slice(4, 6), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    red: Number.parseInt(value.slice(0, 2), 16),
  };
}

function toRgba(hex: string, alpha: number) {
  const { blue, green, red } = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function channelToLinear(value: number) {
  const normalized = value / 255;

  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string) {
  const { blue, green, red } = hexToRgb(hex);

  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  );
}

function contrastRatio(first: string, second: string) {
  const luminanceA = relativeLuminance(first);
  const luminanceB = relativeLuminance(second);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);

  return (lighter + 0.05) / (darker + 0.05);
}

function chooseReadableTextColor(background: string) {
  const light = "#ffffff";
  const dark = "#0f172a";

  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

function buildPillStyle(borderColor: string, textColor: string): CSSProperties {
  return {
    border: `1px solid ${borderColor}`,
    color: textColor,
    display: "inline-flex",
    padding: "7px 16px",
    textTransform: "uppercase",
    fontSize: "0.98rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
  };
}

function buildInversePillStyle(backgroundColor: string, textColor: string): CSSProperties {
  return {
    background: backgroundColor,
    border: `1px solid ${backgroundColor}`,
    color: textColor,
    display: "inline-flex",
    padding: "7px 16px",
    whiteSpace: "nowrap",
    fontSize: "1.02rem",
    fontWeight: 900,
    letterSpacing: "0.03em",
    lineHeight: 1.1,
  };
}

function LandingWordmark({ textColor }: { textColor: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: 10,
      }}
    >
      <div
        style={{
          backgroundColor: "#DE3333",
          borderRadius: 999,
          flexShrink: 0,
          height: 13,
          width: 13,
        }}
      />
      <span
        style={{
          color: textColor,
          fontFamily: landingLogoFont,
          fontSize: "1.28rem",
          fontWeight: 700,
          letterSpacing: "0.01em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        OutLive !
      </span>
    </div>
  );
}

function renderTableValue(
  value: string,
  variant: PosterDetailRow["leftStyle"],
  borderColor: string,
  textColor: string,
) {
  if (variant === "pill") {
    return <span style={buildPillStyle(borderColor, textColor)}>{value}</span>;
  }

  return (
    <span
      style={{
        color: textColor,
        display: "block",
        fontSize: "1.08rem",
        fontWeight: 600,
        lineHeight: 1.35,
      }}
    >
      {value}
    </span>
  );
}

export const EventPoster = forwardRef<HTMLDivElement, EventPosterProps>(
  function EventPoster(
    {
      capturePadding = 56,
      data,
      style,
      theme,
      width = 960,
      ...props
    },
    ref,
  ) {
    const colors = createPosterTheme(theme);
    const tableTextColor = chooseReadableTextColor(colors.bgCard);
    const dividerColor = toRgba(tableTextColor, 0.12);
    const mutedTextColor = toRgba(tableTextColor, 0.55);
    const leadingDetail = data.details[0];
    const trailingDetails = data.details.slice(1);
    const resolvedWidth = toDimension(width);
    const resolvedHeight =
      typeof width === "number" ? `${Math.round((width * 4) / 3)}px` : undefined;
    const contentWidth = typeof width === "number" ? Math.max(width - capturePadding * 2, 0) : undefined;
    const heroSectionHeight =
      typeof contentWidth === "number" ? `${Math.round((contentWidth * 2) / 3)}px` : undefined;

    const outerStyle: CSSProperties = {
      aspectRatio: "3 / 4",
      backgroundColor: colors.bgCard,
      boxSizing: "border-box",
      color: tableTextColor,
      display: "grid",
      fontFamily: sansFont,
      gridTemplateRows: "auto minmax(0, 1fr)",
      height: resolvedHeight,
      overflow: "hidden",
      padding: capturePadding,
      width: resolvedWidth,
      ...style,
    };

    return (
      <div ref={ref} style={outerStyle} {...props}>
        <header
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <LandingWordmark textColor={tableTextColor} />
          <span
            style={{
              color: tableTextColor,
              fontSize: "1.24rem",
              fontWeight: 700,
              letterSpacing: "0.02em",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
            }}
          >
            {data.topDate}
          </span>
        </header>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            justifyContent: "space-between",
            minHeight: 0,
            padding: "10px 0 24px",
          }}
        >
          <section
            style={{
              background: toRgba(tableTextColor, 0.04),
              flexShrink: 0,
              height: heroSectionHeight,
              overflow: "hidden",
              position: "relative",
              border: `1px solid ${dividerColor}`,
              aspectRatio: heroSectionHeight ? undefined : "3 / 2",
              width: "100%",
            }}
          >
            {data.heroImage.src ? (
              <div
                aria-label={data.heroImage.alt || undefined}
                role="img"
                style={{
                  backgroundImage: `url(${JSON.stringify(data.heroImage.src)})`,
                  backgroundPosition: `${data.heroImage.focusX}% ${data.heroImage.focusY}%`,
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "cover",
                  height: "100%",
                  width: "100%",
                }}
              />
            ) : (
              <div
                style={{
                  alignItems: "center",
                  background: `linear-gradient(135deg, ${toRgba(tableTextColor, 0.22)} 0%, ${toRgba(tableTextColor, 0.08)} 100%)`,
                  color: tableTextColor,
                  display: "flex",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  height: "100%",
                  justifyContent: "center",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  width: "100%",
                }}
              >
                Ajoutez une photo
              </div>
            )}
          </section>

          <section
            style={{
              background: toRgba(tableTextColor, 0.01),
              border: `1px solid ${dividerColor}`,
              color: tableTextColor,
              flexShrink: 0,
              fontSize: "1.1rem",
              fontWeight: 600,
            }}
          >
            {leadingDetail ? (
              <div
                style={{
                  alignItems: "center",
                  borderBottom: `1px solid ${dividerColor}`,
                  display: "flex",
                  gap: 16,
                  justifyContent: "space-between",
                  padding: "18px 32px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 14,
                  }}
                >
                  <div>
                    {renderTableValue(
                      leadingDetail.left,
                      leadingDetail.leftStyle,
                      dividerColor,
                      tableTextColor,
                    )}
                  </div>
                  {leadingDetail.leftSecondary ? (
                    <span
                      style={{
                        ...buildInversePillStyle(tableTextColor, colors.bgCard),
                      }}
                    >
                      {leadingDetail.leftSecondary}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    color: tableTextColor,
                    fontSize: "1.22rem",
                    fontWeight: 700,
                    lineHeight: 1.3,
                    maxWidth: "58%",
                    overflow: "hidden",
                    textAlign: "right",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {leadingDetail.right || "\u00A0"}
                </div>
              </div>
            ) : null}

            <div
              style={{
                borderBottom: `1px solid ${dividerColor}`,
                display: "grid",
                gridTemplateColumns: "1fr",
                padding: "26px 32px 28px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    color: tableTextColor,
                    fontSize: "4.45rem",
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                    lineHeight: 0.88,
                    textTransform: "uppercase",
                  }}
                >
                  {renderMultilineText(data.eventTitle)}
                </div>
              </div>
            </div>

            <div
              style={{
                borderBottom: `1px solid ${dividerColor}`,
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <div style={{ borderRight: `1px solid ${dividerColor}`, padding: "20px 32px" }}>
                <div
                  style={{
                    color: mutedTextColor,
                    fontSize: "0.82rem",
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  Lieu
                </div>
                <div
                  style={{
                    color: tableTextColor,
                    fontSize: "1.92rem",
                    fontWeight: 900,
                    lineHeight: 1.05,
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  {data.venue.name}
                </div>
                <p
                  style={{
                    color: mutedTextColor,
                    fontSize: "1.08rem",
                    fontWeight: 600,
                    lineHeight: 1.4,
                    margin: 0,
                    whiteSpace: "pre-line",
                  }}
                >
                  {data.venue.address}
                </p>
              </div>

              <div style={{ padding: "20px 32px" }}>
                <div
                  style={{
                    color: mutedTextColor,
                    fontSize: "0.82rem",
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  {data.door.label}
                </div>
                <div
                  style={{
                    color: tableTextColor,
                    fontSize: "1.92rem",
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.12,
                    whiteSpace: "pre-line",
                  }}
                >
                  {data.door.time}
                </div>
              </div>
            </div>

            {trailingDetails.map((row, index) => (
              <div
                key={`${row.left}-${row.right}-${index}`}
                style={{
                  borderBottom:
                    index === trailingDetails.length - 1 ? "none" : `1px solid ${dividerColor}`,
                  display: "flex",
                  gap: 24,
                  justifyContent: "space-between",
                  padding: "18px 32px",
                }}
              >
                <div>
                  {renderTableValue(row.left, row.leftStyle, dividerColor, tableTextColor)}
                </div>
                <div>
                  {renderTableValue(row.right, row.rightStyle, dividerColor, tableTextColor)}
                </div>
              </div>
            ))}

            {data.footer.trim() ? (
              <div
                style={{
                  borderTop: `1px solid ${dividerColor}`,
                  padding: "12px 32px 13px",
                }}
              >
                <div
                  style={{
                    color: mutedTextColor,
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    lineHeight: 1.35,
                    textAlign: "right",
                  }}
                >
                  {`Organisé par ${data.footer}`}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    );
  },
);
