import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          background: "#0b0b0c",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 25% 22%, rgba(222,51,51,0.35), transparent 28%), radial-gradient(circle at 78% 78%, rgba(255,255,255,0.08), transparent 22%)",
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: 9999,
              background: "#DE3333",
            }}
          />
          <div
            style={{
              fontSize: 240,
              lineHeight: 1,
              fontWeight: 900,
              marginTop: -16,
            }}
          >
            !
          </div>
        </div>
      </div>
    ),
    size,
  );
}
