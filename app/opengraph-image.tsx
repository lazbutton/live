import { ImageResponse } from "next/og";
import { OutLiveAppMark, OUTLIVE_BRAND } from "@/lib/outlive-brand";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
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
              "radial-gradient(circle at 14% 18%, rgba(222,51,51,0.28), transparent 26%), radial-gradient(circle at 88% 14%, rgba(255,255,255,0.08), transparent 20%), radial-gradient(circle at 72% 78%, rgba(222,51,51,0.14), transparent 24%), linear-gradient(180deg, #101012 0%, #0b0b0c 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: -140,
            top: -90,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: "rgba(222,51,51,0.18)",
            filter: "blur(90px)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: -110,
            bottom: -120,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.07)",
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
            padding: "58px 64px",
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
              maxWidth: 840,
            }}
          >
            <div
              style={{
                fontSize: 88,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: -3.2,
              }}
            >
              Orleans bouge.
            </div>
            <div
              style={{
                fontSize: 38,
                lineHeight: 1.25,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              Evenements, lieux et artistes a suivre sur OutLive.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "rgba(255,255,255,0.64)",
              fontSize: 24,
            }}
          >
            <div>OutLive</div>
            <div>Agenda culturel et sorties</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
