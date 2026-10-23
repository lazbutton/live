import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const currentTermsVersion = "2026-03-24-ugc-v1";

export type MobileUserAuthContext = {
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    is_anonymous?: boolean;
  };
  token: string;
};

function createTokenClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function isTruthy(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = value?.toString().trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/** JWT de la requête vérifié auprès de Supabase : la session, ou la réponse 401. */
async function verifyMobileToken(
  request: NextRequest,
): Promise<MobileUserAuthContext | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Token d'authentification manquant" },
      { status: 401 },
    );
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 });
  }

  const supabase = createTokenClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: "Token invalide ou expire", details: error?.message },
      { status: 401 },
    );
  }

  return { user, token };
}

function isAnonymousUser(user: MobileUserAuthContext["user"]) {
  const provider = user.app_metadata?.provider?.toString().trim().toLowerCase();
  return (
    user.is_anonymous === true ||
    provider === "anonymous" ||
    isTruthy(user.user_metadata?.is_anonymous)
  );
}

function suspendedResponse() {
  return NextResponse.json(
    {
      error:
        "Votre compte ne peut plus publier de contenu pour le moment.",
    },
    { status: 403 },
  );
}

/**
 * Compte réel de l'app, pas suspendu, qui a accepté la version en cours des conditions : ce
 * qu'exige l'envoi d'une contribution (et l'API v1). Sinon 401 (JWT) ou 403.
 */
export async function requireMobileUserAuth(
  request: NextRequest,
): Promise<MobileUserAuthContext | NextResponse> {
  const auth = await verifyMobileToken(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  if (isAnonymousUser(user)) {
    return NextResponse.json(
      {
        error:
          "Connectez-vous avec un compte pour utiliser cette fonctionnalite.",
      },
      { status: 403 },
    );
  }

  // La suspension vit dans app_metadata (écrit par le service seul) : un compte suspendu ne peut
  // pas la lever lui-même via updateUser (migration 20261023190000).
  if (isTruthy(user.app_metadata?.ugc_suspended)) {
    return suspendedResponse();
  }

  const acceptedVersion = user.user_metadata?.ugc_terms_accepted_version
    ?.toString()
    .trim();

  if (acceptedVersion !== currentTermsVersion) {
    return NextResponse.json(
      {
        error:
          "Veuillez accepter les conditions d'utilisation et les regles de la communaute.",
      },
      { status: 403 },
    );
  }

  return auth;
}

export type MobileSessionContext = MobileUserAuthContext & {
  /** Session invitée (anonyme) : pas encore de compte. */
  isGuest: boolean;
};

/**
 * Session de l'app, invitée (anonyme) ou compte, avant tout envoi : l'analyse d'affiche de
 * « Proposer », ouverte à tous (le compte et les conditions ne sont demandés qu'à l'envoi,
 * requireMobileUserAuth). Un compte suspendu reste refusé (403) ; sinon 401 (JWT).
 */
export async function requireMobileSession(
  request: NextRequest,
): Promise<MobileSessionContext | NextResponse> {
  const auth = await verifyMobileToken(request);
  if (auth instanceof NextResponse) return auth;

  if (isTruthy(auth.user.app_metadata?.ugc_suspended)) {
    return suspendedResponse();
  }
  return { ...auth, isGuest: isAnonymousUser(auth.user) };
}
