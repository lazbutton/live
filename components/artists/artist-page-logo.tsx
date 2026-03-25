"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ArtistPageLogoProps = {
  showCompactFloating?: boolean;
};

export function ArtistPageLogo({
  showCompactFloating = true,
}: ArtistPageLogoProps) {
  const [showFloatingLogo, setShowFloatingLogo] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingLogo(window.scrollY > 96);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <>
      <Link
        href="/"
        className="relative z-10 inline-flex items-center gap-1.5 text-base sm:text-2xl"
      >
        <div
          className="shrink-0 rounded-full"
          style={{
            width: "0.7em",
            height: "0.7em",
            backgroundColor: "#DE3333",
          }}
        />
        <span
          className="font-bold text-white"
          style={{ fontFamily: '"Special Gothic Expanded One", sans-serif' }}
        >
          OutLive !
        </span>
      </Link>

      <Link
        href="/"
        aria-label="Retour accueil OutLive"
        className={[
          "fixed left-4 top-4 z-50 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0b0c]/62 px-3.5 py-2 text-sm text-white shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-all duration-300 sm:left-6 sm:top-6 lg:left-8",
          showCompactFloating && showFloatingLogo
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-95 opacity-0",
        ].join(" ")}
      >
        <div
          className="shrink-0 rounded-full"
          style={{
            width: "0.62em",
            height: "0.62em",
            backgroundColor: "#DE3333",
          }}
        />
        <span
          className="font-bold leading-none text-white"
          style={{ fontFamily: '"Special Gothic Expanded One", sans-serif' }}
        >
          OutLive !
        </span>
      </Link>
    </>
  );
}
