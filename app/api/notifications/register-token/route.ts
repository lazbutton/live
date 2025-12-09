import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/notifications/register-token
 * 
 * Enregistre ou met à jour un token de notification push pour l'utilisateur connecté
 * 
 * Headers (un des deux) :
 * - Authorization: Bearer <jwt_token> (pour l'app mobile)
 * - Cookie avec session Supabase (pour le navigateur)
 * 
 * Body:
 * {
 *   token: string - Token de notification push
 *   platform: 'ios' | 'android' | 'web' - Plateforme
 *   deviceId?: string - ID unique de l'appareil (optionnel)
 *   appVersion?: string - Version de l'app (optionnel)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier l'authentification (support cookies ou Bearer token)
    const authHeader = request.headers.get("authorization");
    let user;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Authentification via Bearer token (app mobile)
      const token = authHeader.replace("Bearer ", "");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      
      const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !authUser) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401 }
        );
      }

      user = authUser;
    } else {
      // Authentification via cookies (navigateur)
      const supabase = await createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !authUser) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401 }
        );
      }

      user = authUser;
    }

    // Parser le body
    const body = await request.json();
    const { token, platform, deviceId, appVersion } = body;

    if (!token || !platform) {
      return NextResponse.json(
        { error: "token et platform sont requis" },
        { status: 400 }
      );
    }

    if (!["ios", "android", "web"].includes(platform)) {
      return NextResponse.json(
        { error: "platform doit être 'ios', 'android' ou 'web'" },
        { status: 400 }
      );
    }

    // Créer un client Supabase pour les opérations sur la base de données
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader && authHeader.startsWith("Bearer ")
          ? { Authorization: authHeader }
          : undefined,
      },
    });

    // Vérifier si le token existe déjà pour cet utilisateur
    const { data: existingToken, error: checkError } = await supabase
      .from("user_push_tokens")
      .select("id")
      .eq("user_id", user.id)
      .eq("token", token)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = no rows returned, ce qui est OK
      console.error("❌ Erreur lors de la vérification du token:", checkError);
      return NextResponse.json(
        { error: "Erreur lors de la vérification du token" },
        { status: 500 }
      );
    }

    if (existingToken) {
      // Mettre à jour le token existant
      const { error: updateError } = await supabase
        .from("user_push_tokens")
        .update({
          platform,
          device_id: deviceId || null,
          app_version: appVersion || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingToken.id);

      if (updateError) {
        console.error("❌ Erreur lors de la mise à jour du token:", updateError);
        return NextResponse.json(
          { error: "Erreur lors de la mise à jour du token" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Token mis à jour",
      });
    } else {
      // Créer un nouveau token
      const { error: insertError } = await supabase
        .from("user_push_tokens")
        .insert({
          user_id: user.id,
          token,
          platform,
          device_id: deviceId || null,
          app_version: appVersion || null,
        });

      if (insertError) {
        console.error("❌ Erreur lors de l'insertion du token:", insertError);
        return NextResponse.json(
          { error: "Erreur lors de l'enregistrement du token" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Token enregistré",
      });
    }
  } catch (error: any) {
    console.error("❌ Erreur lors de l'enregistrement du token:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/register-token
 * 
 * Supprime un token de notification push pour l'utilisateur connecté
 * 
 * Body:
 * {
 *   token: string - Token à supprimer
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    // Vérifier l'authentification (support cookies ou Bearer token)
    const authHeader = request.headers.get("authorization");
    let user;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      // Authentification via Bearer token (app mobile)
      const token = authHeader.replace("Bearer ", "");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      
      const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !authUser) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401 }
        );
      }

      user = authUser;
    } else {
      // Authentification via cookies (navigateur)
      const supabase = await createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !authUser) {
        return NextResponse.json(
          { error: "Non autorisé" },
          { status: 401 }
        );
      }

      user = authUser;
    }

    // Parser le body
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "token est requis" },
        { status: 400 }
      );
    }

    // Utiliser le service client pour bypasser RLS (l'utilisateur est déjà authentifié)
    const supabase = createServiceClient();

    // Supprimer le token
    const { error: deleteError } = await supabase
      .from("user_push_tokens")
      .delete()
      .eq("user_id", user.id)
      .eq("token", token);

    if (deleteError) {
      console.error("❌ Erreur lors de la suppression du token:", deleteError);
      return NextResponse.json(
        { error: "Erreur lors de la suppression du token" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Token supprimé",
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la suppression du token:", error);
    return NextResponse.json(
      { error: error?.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

