import { sendAPNsNotification } from "./apns";
import { sendFCMNotification } from "./fcm";
import { createServiceClient } from "@/lib/supabase/service";
import { NotificationPayload, NotificationResult } from "./index";
import { createClient } from "@supabase/supabase-js";

type AuthAdminClient = {
  auth: {
    admin: {
      listUsers: (params: {
        page: number;
        perPage: number;
      }) => Promise<{
        data: {
          users?: Array<{
            id: string;
            email?: string;
            user_metadata?: Record<string, any>;
            app_metadata?: Record<string, any>;
          }>;
        } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

async function listAllAuthUsers(adminClient: AuthAdminClient) {
  const users: Array<{
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
    app_metadata?: Record<string, any>;
  }> = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

/**
 * Envoie une notification à tous les utilisateurs admin
 * Ne vérifie PAS les préférences de catégories car c'est pour les admins
 *
 * Le résultat est renvoyé tel quel par des routes publiques (new-request, new-report,
 * new-feedback) et par /api/user-requests : il ne contient aucune donnée sur les admins
 * (ni identifiant, ni e-mail, ni token). Le détail par admin ne va que dans les journaux serveur.
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
    return { success: false, sent: 0, failed: 0, errors: [tokensError.message] };
  }

  if (!allTokens || allTokens.length === 0) {
    return { success: false, sent: 0, failed: 0, errors: ["Aucun token trouvé"] };
  }

  // Récupérer les IDs des admins via une requête directe à auth.users
  // On utilise le client admin pour accéder à auth.users
  let allUsers;
  try {
    allUsers = await listAllAuthUsers(adminClient);
  } catch (usersError: any) {
    console.error("❌ Erreur lors de la récupération des utilisateurs:", usersError);
    return { success: false, sent: 0, failed: 0, errors: [usersError.message] };
  }

  // Filtrer les admins
  const adminUserIds = new Set<string>();
  for (const user of allUsers) {
    if (user.app_metadata?.role === "admin") {
      adminUserIds.add(user.id);
    }
  }

  if (adminUserIds.size === 0) {
    console.log("ℹ️ Aucun utilisateur admin trouvé");
    return { success: false, sent: 0, failed: 0, errors: ["Aucun utilisateur admin trouvé"] };
  }

  // Filtrer les tokens pour ne garder que ceux des admins
  const adminTokens = allTokens.filter(
    (token) => adminUserIds.has(token.user_id)
  );

  if (adminTokens.length === 0) {
    console.log("ℹ️ Aucun token push trouvé pour les admins");
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun token push trouvé pour les admins"],
    };
  }

  console.log(`📱 ${adminTokens.length} token(s) push trouvé(s) pour les admins`);

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  /** `error` part dans la réponse ; l'admin concerné, seulement dans les journaux. */
  function recordFailure(userId: string, error: string) {
    results.failed++;
    results.errors.push(error);
    console.error(`❌ Envoi à l'admin ${userId} en échec: ${error}`);
  }

  // Envoyer la notification à chaque admin selon la plateforme du token
  for (const tokenData of adminTokens) {
    try {
      let result:
        | { success: boolean; error?: string }
        | undefined;

      if (tokenData.platform === "ios") {
        if (tokenData.token.startsWith("ios_user_")) {
          recordFailure(
            tokenData.user_id,
            "Token iOS invalide: format identifiant au lieu d'un vrai token APNs",
          );
          continue;
        }

        result = await sendAPNsNotification(
          tokenData.token,
          payload.title,
          payload.body,
          payload.data
        );
      } else if (tokenData.platform === "android") {
        result = await sendFCMNotification(
          tokenData.token,
          payload.title,
          payload.body,
          payload.data
        );
      } else {
        recordFailure(tokenData.user_id, `Plateforme non supportée: ${tokenData.platform}`);
        continue;
      }

      // Traiter le résultat
      if (result) {
        if (result.success) {
          results.sent++;
        } else {
          recordFailure(
            tokenData.user_id,
            `Envoi ${tokenData.platform}: ${result.error || "Erreur inconnue"}`,
          );

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
      recordFailure(
        tokenData.user_id,
        `Envoi ${tokenData.platform}: ${error.message || "Erreur inconnue"}`,
      );
    }
  }

  const adminsWithoutTokens = [...adminUserIds].filter(
    (userId) => !adminTokens.some((token) => token.user_id === userId),
  ).length;
  console.log(
    `📱 Alerte admin « ${payload.title} »: ${results.sent} envoi(s), ${results.failed} échec(s), ` +
      `${adminUserIds.size} admin(s) dont ${adminsWithoutTokens} sans token`,
  );

  results.success = results.failed === 0;
  return results;
}
