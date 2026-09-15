import { NextResponse } from "next/server";

const PUBLIC_GET_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function withPublicGetCors(response: NextResponse) {
  for (const [key, value] of Object.entries(PUBLIC_GET_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function publicGetJson(body: unknown, init?: ResponseInit) {
  return withPublicGetCors(NextResponse.json(body, init));
}

export const PARTNER_FEED_CACHE_CONTROL =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=600";

export function publicCachedGetJson(body: unknown, init?: ResponseInit) {
  const response = publicGetJson(body, init);
  response.headers.set("Cache-Control", PARTNER_FEED_CACHE_CONTROL);
  response.headers.set("CDN-Cache-Control", PARTNER_FEED_CACHE_CONTROL);
  response.headers.set("Vercel-CDN-Cache-Control", PARTNER_FEED_CACHE_CONTROL);
  return response;
}

export function publicGetOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_GET_CORS_HEADERS,
  });
}

export function searchParamsToObject(searchParams: URLSearchParams) {
  const result: Record<string, string | string[]> = {};

  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }

  return result;
}
