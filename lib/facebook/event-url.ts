export function isFacebookEventUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (hostname !== "facebook.com" && hostname !== "fb.me") {
      return false;
    }

    const pathname = url.pathname.toLowerCase();
    return (
      pathname.includes("/events/") ||
      pathname.includes("/share/e/") ||
      pathname.startsWith("/e/") ||
      url.searchParams.has("event_id")
    );
  } catch {
    return false;
  }
}
