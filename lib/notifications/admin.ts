import { sendAPNsNotification } from "./apns";
import { createServiceClient } from "@/lib/supabase/service";
import { NotificationPayload, NotificationResult } from "./index";
import { createClient } from "@supabase/supabase-js";

/**
 * Envoie une notification à tous les utilisateurs admin
 * Ne vérifie PAS les préférences de catégories car c'est pour les admins
 */
export async function sendNotificationToAdmins(
  payload: NotificationPayload
): Promise<NotificationResult> {
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
    .select("user_id, token, platform");

  if (tokensError) {
    console.error("❌ Erreur lors de la récupération des tokens:", tokensError);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [tokensError.message],
    };
  }

  if (!allTokens || allTokens.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun token trouvé"],
    };
  }

  // Récupérer les IDs des admins via une requête directe à auth.users
  // On utilise le client admin pour accéder à auth.users
  const { data: allUsers, error: usersError } = await adminClient.auth.admin.listUsers();

  if (usersError) {
    console.error("❌ Erreur lors de la récupération des utilisateurs:", usersError);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [usersError.message],
    };
  }

  // Filtrer les admins
  const adminUserIds = new Set<string>();
  if (allUsers?.users) {
    for (const user of allUsers.users) {
      const role = user.user_metadata?.role;
      if (role === "admin") {
        adminUserIds.add(user.id);
      }
    }
  }

  if (adminUserIds.size === 0) {
    console.log("ℹ️ Aucun utilisateur admin trouvé");
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun utilisateur admin trouvé"],
    };
  }

  // Filtrer les tokens pour ne garder que ceux des admins ET uniquement iOS (APNs)
  const adminTokens = allTokens.filter(
    (token) => adminUserIds.has(token.user_id) && token.platform === "ios"
  );

  if (adminTokens.length === 0) {
    console.log("ℹ️ Aucun token iOS (APNs) trouvé pour les admins");
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun token iOS (APNs) trouvé pour les admins"],
    };
  }

  console.log(`📱 ${adminTokens.length} token(s) iOS trouvé(s) pour les admins`);

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // Envoyer la notification à chaque admin (uniquement iOS/APNs)
  for (const tokenData of adminTokens) {
    try {
      if (tokenData.token.startsWith("ios_user_")) {
        results.failed++;
        results.errors.push(
          `Token iOS invalide pour admin ${tokenData.user_id}: format identifiant au lieu d'un vrai token APNs`
        );
        results.success = false;
        continue;
      }

      const result = await sendAPNsNotification(
        tokenData.token,
        payload.title,
        payload.body,
        payload.data
      );

      // Traiter le résultat
      if (result) {
        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`Admin ${tokenData.user_id}: ${result.error || "Erreur inconnue"}`);
          results.success = false;

          // Si le token est invalide, le supprimer
          const shouldDeleteToken =
            result.error?.includes("Token invalide") ||
            result.error?.includes("BadDeviceToken") ||
            result.error?.includes("Unregistered") ||
            result.error?.includes("registration-token-not-registered") ||
            result.error?.includes("400") ||
            result.error?.includes("Requête invalide");

          if (shouldDeleteToken) {
            await supabase
              .from("user_push_tokens")
              .delete()
              .eq("token", tokenData.token);
            console.log(`🗑️ Token invalide supprimé pour admin ${tokenData.user_id}: ${tokenData.token.substring(0, 20)}...`);
          }
        }
      }
    } catch (error: any) {
      console.error(`❌ Erreur lors de l'envoi à l'admin ${tokenData.user_id}:`, error);
      results.failed++;
      results.errors.push(`Admin ${tokenData.user_id}: ${error.message || "Erreur inconnue"}`);
      results.success = false;
    }
  }

  results.success = results.failed === 0;
  return results;
}

