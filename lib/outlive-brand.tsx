import * as React from "react";

export const OUTLIVE_BRAND = {
  background: "#1a1a1a",
  foreground: "#f4f4f4",
  accent: "#ea2f2f",
};

type OutLiveAppMarkProps = {
  size: number;
  dotScale?: number;
  exclamationScale?: number;
};

export function OutLiveAppMark({
  size,
  dotScale = 0.34,
  exclamationScale = 0.44,
}: OutLiveAppMarkProps) {
  const dotSize = size * dotScale;
  const exclamationWidth = size * 0.12;
  const exclamationHeight = size * exclamationScale;
  const exclamationBottomSize = size * 0.12;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: size * 0.16,
          top: size * 0.33,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize,
          background: OUTLIVE_BRAND.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: size * 0.22,
          top: size * 0.26,
          width: exclamationWidth,
          height: exclamationHeight,
          background: OUTLIVE_BRAND.foreground,
          clipPath: "polygon(8% 0%, 100% 0%, 86% 100%, 22% 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: size * 0.26,
          bottom: size * 0.25,
          width: exclamationBottomSize,
          height: exclamationBottomSize,
          background: OUTLIVE_BRAND.foreground,
        }}
      />
    </div>
  );
}
