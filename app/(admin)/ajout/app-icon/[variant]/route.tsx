import { ImageResponse } from "next/og";

import { OUTLIVE_BRAND } from "@/lib/outlive-brand";

/*
 * Icônes de l'application « OutLive Ajout » : le point rouge et le « ! » du logo « OutLive ! »,
 * dans sa police (Special Gothic Expanded One), avec un « + » pour la distinguer de
 * l'application publique. La variante « maskable » resserre le dessin dans la zone sûre
 * (cercle central de 80 %) que les lanceurs Android rognent. Les icônes sont générées à la compilation.
 */

const VARIANTS: Record<string, { size: number; maskable?: boolean }> = {
  "180": { size: 180 },
  "192": { size: 192 },
  "512": { size: 512 },
  maskable: { size: 512, maskable: true },
};

const BRAND_FONT = "Special Gothic Expanded One";

/** Police du logo réduite au seul « ! » (Google Fonts sert du TrueType hors navigateur). */
async function loadBrandFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(BRAND_FONT)}&text=${encodeURIComponent("!")}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

const fontData = loadBrandFont();

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const spec = VARIANTS[(await params).variant];
  if (!spec) return new Response("Icône inconnue", { status: 404 });

  const font = await fontData;
  if (!font) console.warn("Icône /ajout : police du logo indisponible, « ! » dans la police par défaut.");
  const { size, maskable } = spec;
  // Dessin dans une zone carrée centrée : toute l'icône, ou 70 % pour la variante maskable.
  const box = size * (maskable ? 0.7 : 1);
  const offset = (size - box) / 2;
  const at = (ratio: number) => offset + box * ratio;
  const len = (ratio: number) => box * ratio;

  const dot = len(0.3);
  const badge = len(0.2);
  const stroke = Math.max(2, badge * 0.15);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: OUTLIVE_BRAND.background }}>
        <div
          style={{
            position: "absolute",
            left: at(0.17),
            top: at(0.5) - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot,
            background: OUTLIVE_BRAND.accent,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: at(0.52),
            top: at(0.18),
            width: len(0.36),
            height: len(0.64),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: BRAND_FONT,
            fontSize: len(0.62),
            lineHeight: 1,
            color: OUTLIVE_BRAND.foreground,
          }}
        >
          !
        </div>
        <div
          style={{
            position: "absolute",
            left: at(0.07),
            top: at(0.93) - badge,
            width: badge,
            height: badge,
            borderRadius: badge,
            background: OUTLIVE_BRAND.foreground,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "absolute", width: badge * 0.54, height: stroke, background: OUTLIVE_BRAND.background }} />
          <div style={{ position: "absolute", width: stroke, height: badge * 0.54, background: OUTLIVE_BRAND.background }} />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: font ? [{ name: BRAND_FONT, data: font, weight: 400, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
