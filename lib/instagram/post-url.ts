const INSTAGRAM_POST_HOST_PATTERN =
  /(^|\.)(instagram\.com|instagr\.am)$/i;

const INSTAGRAM_POST_PATH_PATTERN = /^\/(p|reel|tv)\/[^/]+/i;

export function isInstagramPostUrl(value: string) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    if (!INSTAGRAM_POST_HOST_PATTERN.test(parsed.hostname)) {
      return false;
    }
    return INSTAGRAM_POST_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Affiche d'un post (première image d'un carrousel) : `/p/<code>/media/?size=l` redirige vers
 * l'image sans connexion, alors que les liens signés du CDN ne peuvent pas être recopiés.
 */
export function instagramPostImageUrl(value: string | null | undefined) {
  if (!value || !isInstagramPostUrl(value)) return null;
  const code = new URL(value.trim()).pathname.split("/").filter(Boolean)[1];
  return code ? `https://www.instagram.com/p/${code}/media/?size=l` : null;
}
