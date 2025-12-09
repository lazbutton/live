import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/notifications/users
 * 
 * Récupère la liste des utilisateurs avec leurs tokens push
 * Admin uniquement
 */
export async function GET(request: NextRequest) {
  try {
    // Vérifier l'authentification (admin uniquement)
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    // Vérifier que l'utilisateur est admin
    const isAdmin =
      user.user_metadata?.role === "admin" ||
      user.app_metadata?.role === "admin";

    if (!isAdmin) {
      return NextResponse.json(
        { error: "Accès refusé. Admin uniquement." },
        { status: 403 }
      );
    }

    // Récupérer les utilisateurs avec leurs tokens et leurs préférences de notifications
    // Ne récupérer que ceux qui ont activé les notifications (enabled = true)
    const serviceClient = createServiceClient();
    
    // D'abord, récupérer les user_ids qui ont activé les notifications
    const { data: enabledUsers, error: prefsError } = await serviceClient
      .from("user_notification_preferences")
      .select("user_id")
      .eq("is_enabled", true);

    if (prefsError) {
      console.warn("⚠️ Erreur lors de la récupération des préférences:", prefsError);
      // Continuer même si la table n'existe pas encore
    }

    const enabledUserIds = enabledUsers?.map((u: any) => u.user_id) || [];

    // Si aucun utilisateur n'a activé les notifications, retourner une liste vide
    if (enabledUserIds.length === 0) {
      return NextResponse.json({
        users: [],
        total: 0,
      });
    }

    // Récupérer les tokens uniquement pour les utilisateurs qui ont activé les notifications
    const { data: tokens, error: tokensError } = await serviceClient
      .from("user_push_tokens")
      .select("user_id, platform, token, device_id, app_version, updated_at")
      .in("user_id", enabledUserIds)
      .order("updated_at", { ascending: false });

    if (tokensError) {
      console.error("❌ Erreur lors de la récupération des tokens:", tokensError);
      return NextResponse.json(
        { error: "Erreur lors de la récupération des utilisateurs", details: tokensError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Tokens récupérés: ${tokens?.length || 0}`);

    // Récupérer les informations utilisateur via l'API Admin
    const userIds = [...new Set((tokens || []).map((t: any) => t.user_id).filter(Boolean))];
    const usersMap = new Map<
      string,
      {
        id: string;
        email: string | null;
        name: string | null;
        tokens: Array<{
          platform: string;
          token: string;
          device_id: string | null;
          app_version: string | null;
          updated_at: string;
        }>;
      }
    >();

    // Initialiser la map avec les IDs d'utilisateur
    for (const userId of userIds) {
      usersMap.set(userId, {
        id: userId,
        email: null,
        name: null,
        tokens: [],
      });
    }

    // Utiliser l'API REST Admin de Supabase directement
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Récupérer les informations utilisateur
    for (const userId of userIds) {
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          headers: {
            'apikey': serviceRoleKey!,
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const userData = await response.json();
          const userInfo = usersMap.get(userId);
          if (userInfo && userData) {
            userInfo.email = userData.email || null;
            userInfo.name =
              userData.user_metadata?.name ||
              userData.user_metadata?.full_name ||
              null;
          }
        }
      } catch (err) {
        console.warn(`Impossible de récupérer les infos utilisateur pour ${userId}:`, err);
      }
    }

    // Grouper les tokens par utilisateur
    (tokens || []).forEach((tokenData: any) => {
      const userId = tokenData.user_id;
      if (!userId) {
        console.warn("⚠️ Token sans user_id trouvé:", tokenData);
        return;
      }
      
      const user = usersMap.get(userId);
      if (user) {
        user.tokens.push({
          platform: tokenData.platform,
          token: tokenData.token ? tokenData.token.substring(0, 20) + "..." : "Token invalide", // Masquer une partie du token pour la sécurité
          device_id: tokenData.device_id,
          app_version: tokenData.app_version,
          updated_at: tokenData.updated_at,
        });
      } else {
        console.warn(`⚠️ Utilisateur ${userId} trouvé dans tokens mais pas dans usersMap`);
        // Créer l'utilisateur même s'il n'a pas été trouvé dans l'API auth
        usersMap.set(userId, {
          id: userId,
          email: null,
          name: null,
          tokens: [{
            platform: tokenData.platform,
            token: tokenData.token ? tokenData.token.substring(0, 20) + "..." : "Token invalide",
            device_id: tokenData.device_id,
            app_version: tokenData.app_version,
            updated_at: tokenData.updated_at,
          }],
        });
      }
    });

    const users = Array.from(usersMap.values()).filter((u) => u.tokens.length > 0);

    console.log(`✅ Utilisateurs finaux: ${users.length}, tokens traités: ${tokens?.length || 0}`);

    return NextResponse.json({
      users,
      total: users.length,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la récupération des utilisateurs:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

