import { NextResponse } from "next/server";
import { z } from "zod";

import type { AppError, InvalidBodyError } from "@/lib/api/app/schemas";

/** Messages zod en français pour ces routes seulement (l'API v1 garde les siens). */
const frenchMessages = z.locales.fr().localeError;

export type AppBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse<InvalidBodyError> };

/** Réponse d'erreur lue par l'app : `{ error }`, plus d'éventuels champs annexes. */
export function appError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json<AppError>({ error: message, ...extra }, { status });
}

/** Problèmes d'un corps invalide, un par champ. */
function bodyIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** Message de la réponse 400, affichable tel quel. */
function invalidBodyMessage(issues: Array<{ path: string; message: string }>) {
  const details = issues.map((issue) =>
    issue.path ? `${issue.path} : ${issue.message}` : issue.message,
  );
  return `Corps de la requête invalide : ${details.join(" ; ")}`;
}

/** 400 d'un corps invalide : message lisible et détail par champ. */
export function invalidBodyResponse(issues: Array<{ path: string; message: string }>) {
  return NextResponse.json<InvalidBodyError>(
    { error: invalidBodyMessage(issues), issues },
    { status: 400 },
  );
}

/** Valide un corps déjà lu (JSON, formulaire, paramètres de requête). */
export function parseAppBody<S extends z.ZodType>(
  schema: S,
  value: unknown,
): AppBodyResult<z.output<S>> {
  const parsed = schema.safeParse(value, { error: frenchMessages });
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return { ok: false, response: invalidBodyResponse(bodyIssues(parsed.error)) };
}

/** Lit le corps JSON de la requête et le valide. */
export async function readAppJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<AppBodyResult<z.output<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: invalidBodyResponse([{ path: "", message: "JSON attendu" }]),
    };
  }
  return parseAppBody(schema, body);
}
