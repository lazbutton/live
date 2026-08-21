#!/usr/bin/env python3
import json
import re
import sys
from urllib.parse import urlparse


def _error(message: str, code: str = "runtime_error") -> None:
    print(json.dumps({"ok": False, "error": message, "code": code}))
    sys.exit(1)


def _extract_shortcode(url: str) -> str:
    parsed = urlparse(url)
    path = (parsed.path or "").strip("/")
    parts = [part for part in path.split("/") if part]
    if len(parts) < 2:
        raise ValueError("URL Instagram invalide")
    if parts[0] not in {"p", "reel", "tv"}:
        raise ValueError("L'URL doit cibler un post, reel ou tv Instagram")
    shortcode = parts[1].strip()
    if not re.match(r"^[A-Za-z0-9_-]+$", shortcode):
        raise ValueError("Shortcode Instagram invalide")
    return shortcode


def main() -> None:
    if len(sys.argv) < 2:
        _error("URL Instagram manquante", "missing_url")

    url = sys.argv[1].strip()
    if not url:
        _error("URL Instagram vide", "missing_url")

    try:
        shortcode = _extract_shortcode(url)
    except ValueError as exc:
        _error(str(exc), "invalid_url")

    try:
        import instaloader  # type: ignore
    except Exception:
        _error(
            "Le module Python instaloader est introuvable. Installe-le avec: pip3 install instaloader",
            "missing_instaloader",
        )

    try:
        loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
        )
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
    except Exception as exc:
        _error(f"Impossible de charger le post Instagram: {exc}", "post_unavailable")

    caption = (post.caption or "").strip()
    caption_first_line = caption.splitlines()[0].strip() if caption else ""
    owner_username = getattr(post.owner_profile, "username", None)
    owner_full_name = getattr(post.owner_profile, "full_name", None)
    location_name = post.location.name if post.location else None
    location_slug = post.location.slug if post.location else None

    image_urls = []
    video_urls = []
    try:
        if post.typename == "GraphSidecar":
            for node in post.get_sidecar_nodes():
                if node.is_video:
                    if node.video_url:
                        video_urls.append(node.video_url)
                    if node.display_url:
                        image_urls.append(node.display_url)
                else:
                    if node.display_url:
                        image_urls.append(node.display_url)
        elif post.is_video:
            if post.video_url:
                video_urls.append(post.video_url)
            if post.url:
                image_urls.append(post.url)
        else:
            if post.url:
                image_urls.append(post.url)
    except Exception:
        if post.url:
            image_urls.append(post.url)

    payload = {
        "ok": True,
        "data": {
            "shortcode": post.shortcode,
            "caption": caption,
            "caption_first_line": caption_first_line,
            "owner_username": owner_username,
            "owner_full_name": owner_full_name,
            "taken_at_utc": post.date_utc.isoformat() if post.date_utc else None,
            "is_video": bool(post.is_video),
            "typename": post.typename,
            "likes": post.likes,
            "comments": post.comments,
            "location_name": location_name,
            "location_slug": location_slug,
            "hashtags": sorted(list(post.caption_hashtags or [])),
            "mentions": sorted(list(post.caption_mentions or [])),
            "image_urls": image_urls,
            "video_urls": video_urls,
            "external_url": url,
        },
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
