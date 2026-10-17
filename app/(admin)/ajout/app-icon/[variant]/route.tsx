import { ImageResponse } from "next/og";

import { OUTLIVE_BRAND, OutLiveAppMark } from "@/lib/outlive-brand";

/*
 * Icônes de l'application « OutLive Ajout » : la marque OutLive avec un « + »,
 * pour la distinguer de l'application publique sur l'écran d'accueil.
 * La variante « maskable » garde tout dans la zone sûre (cercle central de 80 %).
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
  const mark = Math.round(size * (maskable ? 0.7 : 1));
  const badge = Math.round(size * (maskable ? 0.18 : 0.22));
  const inset = Math.round(size * (maskable ? 0.2 : 0.08));
  const bar = Math.max(2, Math.round(badge * 0.16));

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
          background: OUTLIVE_BRAND.background,
        }}
      >
        <OutLiveAppMark size={mark} />
        <div
          style={{
            position: "absolute",
            left: inset,
            bottom: inset,
            width: badge,
            height: badge,
            borderRadius: badge,
            background: OUTLIVE_BRAND.foreground,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "absolute", width: badge * 0.56, height: bar, background: OUTLIVE_BRAND.background }} />
          <div style={{ position: "absolute", width: bar, height: badge * 0.56, background: OUTLIVE_BRAND.background }} />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}
