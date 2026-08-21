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
