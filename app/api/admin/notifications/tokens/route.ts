import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/admin/notifications/tokens
 * 
 * Récupère les tokens push des admins pour le diagnostic
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Créer un client admin pour accéder à auth.users
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Récupérer tous les tokens push
    const { data: allTokens, error: tokensError } = await supabase
      .from("user_push_tokens")
      .select("user_id, token, platform, updated_at, created_at")
      .order("updated_at", { ascending: false });

    if (tokensError) {
      return NextResponse.json(
        { error: tokensError.message },
        { status: 500 }
      );
    }

    // Récupérer tous les utilisateurs
    const { data: allUsers, error: usersError } = await adminClient.auth.admin.listUsers();

    if (usersError) {
      return NextResponse.json(
        { error: usersError.message },
        { status: 500 }
      );
    }

    // Filtrer les admins
    const adminUserIds = new Set<string>();
    const adminUsers: Array<{ id: string; email: string; role: string }> = [];
    
    if (allUsers?.users) {
      for (const user of allUsers.users) {
        const role = user.user_metadata?.role;
        if (role === "admin") {
          adminUserIds.add(user.id);
          adminUsers.push({
            id: user.id,
            email: user.email || "N/A",
            role: role || "N/A",
          });
        }
      }
    }

    // Filtrer les tokens des admins
    const adminTokens = (allTokens || []).filter((token) => adminUserIds.has(token.user_id));
    
    // Grouper par admin
    const tokensByAdmin = adminUsers.map((admin) => {
      const userTokens = adminTokens.filter((t) => t.user_id === admin.id);
      return {
        admin: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
        },
        tokens: userTokens.map((t) => ({
          platform: t.platform,
          token_preview: t.token.substring(0, 20) + "...",
          token_length: t.token.length,
          updated_at: t.updated_at,
          created_at: t.created_at,
        })),
        ios_count: userTokens.filter((t) => t.platform === "ios").length,
        android_count: userTokens.filter((t) => t.platform === "android").length,
        total_count: userTokens.length,
      };
    });

    return NextResponse.json({
      success: true,
      stats: {
        total_admins: adminUsers.length,
        total_tokens: adminTokens.length,
        ios_tokens: adminTokens.filter((t) => t.platform === "ios").length,
        android_tokens: adminTokens.filter((t) => t.platform === "android").length,
        web_tokens: adminTokens.filter((t) => t.platform === "web").length,
      },
      admins: tokensByAdmin,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération des tokens:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

