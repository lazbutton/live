"use client";

import { useEffect, useRef } from "react";

import {
  detectMobilePlatform,
  normalizeAppDeepLink,
} from "@/lib/mobile-app-links";

type DownloadAppAutoOpenProps = {
  deepLink: string | null;
};

export function DownloadAppAutoOpen({
  deepLink,
}: DownloadAppAutoOpenProps) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    const normalizedDeepLink = normalizeAppDeepLink(deepLink);
    if (attemptedRef.current || !normalizedDeepLink) {
      return;
    }

    const platform = detectMobilePlatform(window.navigator.userAgent);
    if (!platform) {
      return;
    }

    attemptedRef.current = true;

    const openTimer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.assign(normalizedDeepLink);
      }
    }, 120);

    return () => {
      window.clearTimeout(openTimer);
    };
  }, [deepLink]);

  return null;
}
