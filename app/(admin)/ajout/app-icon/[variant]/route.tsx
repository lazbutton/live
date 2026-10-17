import { ImageResponse } from "next/og";

import { OUTLIVE_BRAND } from "@/lib/outlive-brand";

/*
 * Icônes de l'application « OutLive Ajout » : le point rouge et le « ! » du logo OutLive
 * (barre penchée, point carré détaché en dessous), avec un « + » pour la distinguer de
 * l'application publique. La variante « maskable » resserre le dessin dans la zone sûre
 * (cercle central de 80 %) que les lanceurs Android peuvent rogner.
 */

const VARIANTS: Record<string, { size: number; maskable?: boolean }> = {
  "180": { size: 180 },
  "192": { size: 192 },
  "512": { size: 512 },
  maskable: { size: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const spec = VARIANTS[(await params).variant];
  if (!spec) return new Response("Icône inconnue", { status: 404 });

  const { size, maskable } = spec;
  // Dessin dans une zone carrée centrée : toute l'icône, ou 70 % pour la variante maskable.
  const box = size * (maskable ? 0.7 : 1);
  const offset = (size - box) / 2;
  const at = (ratio: number) => offset + box * ratio;
  const len = (ratio: number) => box * ratio;

  const dot = len(0.32);
  const bar = { left: at(0.63), top: at(0.24), width: len(0.15), height: len(0.36) };
  const point = len(0.12);
  const badge = len(0.21);
  const stroke = Math.max(2, badge * 0.15);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: OUTLIVE_BRAND.background }}>
        <div
          style={{
            position: "absolute",
            left: at(0.15),
            top: at(0.5) - dot / 2,
            width: dot,
            height: dot,
            borderRadius: dot,
            background: OUTLIVE_BRAND.accent,
          }}
        />
        {/* « ! » : barre en biseau puis point carré, séparés par un vide. */}
        <div
          style={{
            position: "absolute",
            ...bar,
            background: OUTLIVE_BRAND.foreground,
            clipPath: "polygon(6% 0%, 100% 0%, 84% 100%, 22% 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: at(0.645),
            top: bar.top + bar.height + len(0.06),
            width: point,
            height: point,
            background: OUTLIVE_BRAND.foreground,
          }}
        />
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
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
