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

export async function requireMobileUserAuth(
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

  const provider = user.app_metadata?.provider?.toString().trim().toLowerCase();
  const isAnonymous =
    user.is_anonymous === true ||
    provider === "anonymous" ||
    isTruthy(user.user_metadata?.is_anonymous);

  if (isAnonymous) {
    return NextResponse.json(
      {
        error:
          "Connectez-vous avec un compte pour utiliser cette fonctionnalite.",
      },
      { status: 403 },
    );
  }

  if (isTruthy(user.user_metadata?.ugc_suspended)) {
    return NextResponse.json(
      {
        error:
          "Votre compte ne peut plus publier de contenu pour le moment.",
      },
      { status: 403 },
    );
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

  return {
    user,
    token,
  };
}
