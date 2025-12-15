import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isProbablyHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isAllowedContentType(contentType: string | null) {
  if (!contentType) return false;
  return (
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" // certains serveurs renvoient ça pour des images
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    const token = url.searchParams.get("token");

    if (!target || !isProbablyHttpUrl(target)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    // Auth admin (même logique que les autres routes admin: role=admin dans user_metadata)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
    }

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // Auth via access token (utile pour <img src=...> qui ne peut pas envoyer de header Authorization)
    const { data: userData } = await client.auth.getUser(token || undefined);
    const role = userData?.user?.user_metadata?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(target, {
      // Certains serveurs refusent sans UA/Referer; on met un UA simple.
      headers: {
        "User-Agent": "live-admin/1.0 (+image-proxy)",
        Accept: "image/*,*/*;q=0.8",
      },
      // Pas de credentials côté serveur
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type");
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json(
        { error: `Unsupported content-type: ${contentType}` },
        { status: 415 }
      );
    }

    const body = await upstream.arrayBuffer();
    const res = new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType || "image/*",
        // Autoriser l'utilisation dans canvas/html-to-image
        "Access-Control-Allow-Origin": "*",
        // Cache côté navigateur (tu peux ajuster)
        "Cache-Control": "public, max-age=86400",
      },
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("abort")) {
      return NextResponse.json({ error: "Upstream timeout" }, { status: 504 });
    }
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}


