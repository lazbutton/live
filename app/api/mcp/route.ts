import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAgentContext } from "@/lib/agent/context";
import { handleMcpMessage, type JsonRpcMessage } from "@/lib/agent/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Serveur MCP de l'admin, transport HTTP (« Streamable HTTP », sans session).
 * Réservé aux clients munis du jeton OUTLIVE_AGENT_TOKEN (en-tête Authorization: Bearer).
 * En-tête facultatif « X-Outlive-Dry-Run: 1 » : simulation, rien n'est écrit.
 */

function isAuthorized(request: NextRequest, expected: string) {
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const token = process.env.OUTLIVE_AGENT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Serveur MCP désactivé : définis OUTLIVE_AGENT_TOKEN pour l'activer." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, token)) {
    return NextResponse.json(
      { error: "Jeton manquant ou invalide." },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="outlive-admin"' } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } }, { status: 400 });
  }

  const dryRun = request.headers.get("x-outlive-dry-run") === "1";
  // Une fonction Vercel est coupée à 60 s : les traitements par lot s'arrêtent avant.
  const deadline = Date.now() + 50_000;
  const createContext = () => createAgentContext({ dryRun, deadline });

  if (Array.isArray(body)) {
    const responses = (
      await Promise.all(body.map((message) => handleMcpMessage(message as JsonRpcMessage, createContext)))
    ).filter(Boolean);
    return responses.length ? NextResponse.json(responses) : new NextResponse(null, { status: 202 });
  }

  const response = await handleMcpMessage(body as JsonRpcMessage, createContext);
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 });
}

/** Pas de flux SSE ni de session : seules les requêtes POST sont acceptées. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
