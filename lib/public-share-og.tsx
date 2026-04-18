import { ImageResponse } from "next/og";
import { OutLiveAppMark, OUTLIVE_BRAND } from "@/lib/outlive-brand";

export const publicShareImageSize = {
  width: 1200,
  height: 630,
};

export const publicShareImageContentType = "image/png";

type PublicShareImageOptions = {
  eyebrow: string;
  title: string;
  description?: string | null;
  metaItems?: Array<string | null | undefined>;
};

export function createPublicShareImage({
  eyebrow,
  title,
  description,
  metaItems = [],
}: PublicShareImageOptions) {
  const normalizedMetaItems = metaItems
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: OUTLIVE_BRAND.background,
          color: OUTLIVE_BRAND.foreground,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 14% 16%, rgba(222,51,51,0.28), transparent 25%), radial-gradient(circle at 88% 14%, rgba(255,255,255,0.08), transparent 18%), radial-gradient(circle at 70% 82%, rgba(222,51,51,0.14), transparent 24%), linear-gradient(180deg, #101012 0%, #0b0b0c 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: -110,
            top: -90,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: "rgba(222,51,51,0.18)",
            filter: "blur(92px)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: -90,
            bottom: -120,
            width: 360,
            height: 360,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.08)",
            filter: "blur(100px)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            width: "100%",
            height: "100%",
            padding: "56px 64px",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <OutLiveAppMark size={40} dotScale={0.45} exclamationScale={0.62} />
            <div
              style={{
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: -1.2,
              }}
            >
              OutLive
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              maxWidth: 900,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                width: "fit-content",
                borderRadius: 9999,
                border: "1px solid rgba(222,51,51,0.28)",
                background: "rgba(222,51,51,0.12)",
                padding: "10px 18px",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#ff9b9b",
              }}
            >
              {eyebrow}
            </div>

            <div
              style={{
                fontSize: 76,
                lineHeight: 1.02,
                fontWeight: 800,
                letterSpacing: -3.2,
              }}
            >
              {title}
            </div>

            {description ? (
              <div
                style={{
                  fontSize: 30,
                  lineHeight: 1.32,
                  color: "rgba(255,255,255,0.78)",
                  maxWidth: 920,
                }}
              >
                {description}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {normalizedMetaItems.map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderRadius: 9999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.05)",
                    padding: "12px 18px",
                    color: "rgba(255,255,255,0.76)",
                    fontSize: 20,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>

            <div
              style={{
                fontSize: 22,
                color: "rgba(255,255,255,0.56)",
              }}
            >
              outlive.fr
            </div>
          </div>
        </div>
      </div>
    ),
    publicShareImageSize,
  );
}
