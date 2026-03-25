"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function ArtistPageLogo() {
  const [showFloatingLogo, setShowFloatingLogo] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingLogo(window.scrollY > 72);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <>
      <Link href="/" className="flex items-center gap-1.5 text-lg sm:text-2xl">
        <div
          className="rounded-full flex-shrink-0"
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
          "fixed left-4 top-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-[#0b0b0c]/45 px-3 py-2 text-xl text-white backdrop-blur-md transition-all duration-300 sm:left-6 sm:top-6 lg:left-8",
          showFloatingLogo
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-95 opacity-0",
        ].join(" ")}
      >
        <div
          className="rounded-full flex-shrink-0"
          style={{
            width: "0.7em",
            height: "0.7em",
            backgroundColor: "#DE3333",
          }}
        />
        <span
          className="font-bold leading-none text-white"
          style={{ fontFamily: '"Special Gothic Expanded One", sans-serif' }}
        >
          !
        </span>
      </Link>
    </>
  );
}
