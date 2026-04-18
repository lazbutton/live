import { ImageResponse } from "next/og";
import { OutLiveAppMark, OUTLIVE_BRAND } from "@/lib/outlive-brand";

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
          background: OUTLIVE_BRAND.background,
          color: OUTLIVE_BRAND.foreground,
          fontFamily: "sans-serif",
        }}
      >
        <OutLiveAppMark size={512} />
      </div>
    ),
    size,
  );
}
