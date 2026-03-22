import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type AdminMobileAuthContext = {
  user: User;
  supabase: SupabaseClient;
  token: string | null;
  authMode: "jwt" | "cookie";
};

function isAdminUser(user: User | null) {
  if (!user) return false;
  return user.user_metadata?.role === "admin" || user.app_metadata?.role === "admin";
}

function createTokenClient(token: string) {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export async function requireAdminMobileAuth(
  request: NextRequest
): Promise<AdminMobileAuthContext | NextResponse> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
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
        { error: "Token invalide ou expiré", details: error?.message },
        { status: 401 }
      );
    }

    if (!isAdminUser(user)) {
      return NextResponse.json(
        { error: "Accès refusé. Admin uniquement." },
        { status: 403 }
      );
    }

    return {
      user,
      supabase,
      token,
      authMode: "jwt",
    };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  if (!isAdminUser(user)) {
    return NextResponse.json(
      { error: "Accès refusé. Admin uniquement." },
      { status: 403 }
    );
  }

  return {
    user,
    supabase,
    token: null,
    authMode: "cookie",
  };
}
