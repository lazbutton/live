import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { appError, readAppJsonBody } from "@/lib/api/app/http";
import {
  registerPushTokenBodySchema,
  unregisterPushTokenBodySchema,
  type PushTokenResponse,
} from "@/lib/api/app/schemas";

/**
 * Un token push est celui d'un téléphone, où une seule session est ouverte : enregistré pour [userId], il quitte
 * les autres utilisateurs (l'invité devenu compte, le compte déconnecté sans avoir pu retirer son token), qui n'y
 * envoient plus rien ; sinon le téléphone recevrait un résumé par utilisateur. Service role : la RLS ne laisse
 * chacun toucher qu'à ses lignes. Un échec est journalisé, l'enregistrement tient.
 */
async function releaseFromOtherUsers(token: string, userId: string) {
  const { error } = await createServiceClient()
    .from("user_push_tokens")
    .delete()
    .eq("token", token)
    .neq("user_id", userId);
  if (error) {
    console.error("❌ Erreur lors du retrait du token des autres utilisateurs:", error);
  }
}

/**
 * POST /api/notifications/register-token
 * 
 * Enregistre ou met à jour un token de notification push pour l'utilisateur connecté, et le retire des autres
 * utilisateurs (`releaseFromOtherUsers`)
 * 
 * Headers (un des deux) :
 * - Authorization: Bearer <jwt_token> (pour l'app mobile)
 * - Cookie avec session Supabase (pour le navigateur)
 * 
 * Body : `registerPushTokenBodySchema` (lib/api/app/schemas.ts), voir docs/API_APP.md.
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
        return appError("Non autorisé", 401);
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
        return appError("Non autorisé", 401);
      }

      user = authUser;
    }

    const body = await readAppJsonBody(request, registerPushTokenBodySchema);
    if (!body.ok) return body.response;
    const { token, platform, deviceId, appVersion } = body.data;

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
      return appError("Erreur lors de la vérification du token", 500);
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
        return appError("Erreur lors de la mise à jour du token", 500);
      }

      await releaseFromOtherUsers(token, user.id);
      return NextResponse.json<PushTokenResponse>({
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
        return appError("Erreur lors de l'enregistrement du token", 500);
      }

      await releaseFromOtherUsers(token, user.id);
      return NextResponse.json<PushTokenResponse>({
        success: true,
        message: "Token enregistré",
      });
    }
  } catch (error: any) {
    console.error("❌ Erreur lors de l'enregistrement du token:", error);
    return appError(error?.message || "Erreur serveur", 500);
  }
}

/**
 * DELETE /api/notifications/register-token
 * 
 * Supprime un token de notification push pour l'utilisateur connecté (l'app, juste avant « Se déconnecter »)
 * 
 * Body : `unregisterPushTokenBodySchema` (lib/api/app/schemas.ts).
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
        return appError("Non autorisé", 401);
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
        return appError("Non autorisé", 401);
      }

      user = authUser;
    }

    const body = await readAppJsonBody(request, unregisterPushTokenBodySchema);
    if (!body.ok) return body.response;
    const { token } = body.data;

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
      return appError("Erreur lors de la suppression du token", 500);
    }

    return NextResponse.json<PushTokenResponse>({
      success: true,
      message: "Token supprimé",
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la suppression du token:", error);
    return appError(error?.message || "Erreur serveur", 500);
  }
}

