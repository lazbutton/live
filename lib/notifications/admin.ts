import { sendAPNsNotification } from "./apns";
import { sendFCMNotification } from "./fcm";
import { createServiceClient } from "@/lib/supabase/service";
import { NotificationPayload, NotificationResult } from "./index";
import { createClient } from "@supabase/supabase-js";

type AdminAttemptDiagnostic = {
  platform: string;
  tokenPreview: string;
  tokenLength: number;
  status: "sent" | "failed";
  error?: string;
  isPlaceholder: boolean;
};

type AdminRecipientDiagnostic = {
  userId: string;
  email: string;
  tokenCount: number;
  attempts: AdminAttemptDiagnostic[];
};

const ADMIN_FLOW_NOTES = [
  "Flux admin: ignore les préférences utilisateur et le filtrage par catégories.",
  "Flux admin: envoie sur tous les tokens des comptes avec role=admin.",
];

function previewAdminToken(token: string) {
  return `${token.substring(0, 20)}...`;
}

async function listAllAuthUsers(adminClient: ReturnType<typeof createClient>) {
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
      diagnostics: {
        flow: "admin",
        routeNotes: [...ADMIN_FLOW_NOTES],
        payload: {
          title: payload.title,
          body: payload.body,
          type: typeof payload.data?.type === "string" ? payload.data.type : null,
          dataKeys: Object.keys(payload.data ?? {}),
        },
      },
    };
  }

  if (!allTokens || allTokens.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun token trouvé"],
      diagnostics: {
        flow: "admin",
        routeNotes: [...ADMIN_FLOW_NOTES],
        payload: {
          title: payload.title,
          body: payload.body,
          type: typeof payload.data?.type === "string" ? payload.data.type : null,
          dataKeys: Object.keys(payload.data ?? {}),
        },
      },
    };
  }

  // Récupérer les IDs des admins via une requête directe à auth.users
  // On utilise le client admin pour accéder à auth.users
  let allUsers;
  try {
    allUsers = await listAllAuthUsers(adminClient);
  } catch (usersError: any) {
    console.error("❌ Erreur lors de la récupération des utilisateurs:", usersError);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [usersError.message],
      diagnostics: {
        flow: "admin",
        routeNotes: [...ADMIN_FLOW_NOTES],
        payload: {
          title: payload.title,
          body: payload.body,
          type: typeof payload.data?.type === "string" ? payload.data.type : null,
          dataKeys: Object.keys(payload.data ?? {}),
        },
      },
    };
  }

  // Filtrer les admins
  const adminUserIds = new Set<string>();
  const adminUsers = new Map<string, { email: string }>();
  for (const user of allUsers) {
    const role = user.user_metadata?.role;
    if (role === "admin") {
      adminUserIds.add(user.id);
      adminUsers.set(user.id, {
        email: user.email || "N/A",
      });
    }
  }

  if (adminUserIds.size === 0) {
    console.log("ℹ️ Aucun utilisateur admin trouvé");
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun utilisateur admin trouvé"],
      diagnostics: {
        flow: "admin",
        routeNotes: [...ADMIN_FLOW_NOTES],
        payload: {
          title: payload.title,
          body: payload.body,
          type: typeof payload.data?.type === "string" ? payload.data.type : null,
          dataKeys: Object.keys(payload.data ?? {}),
        },
      },
    };
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
      diagnostics: {
        flow: "admin",
        routeNotes: [...ADMIN_FLOW_NOTES],
        payload: {
          title: payload.title,
          body: payload.body,
          type: typeof payload.data?.type === "string" ? payload.data.type : null,
          dataKeys: Object.keys(payload.data ?? {}),
        },
      },
    };
  }

  console.log(`📱 ${adminTokens.length} token(s) push trouvé(s) pour les admins`);

  const diagnostics = {
    flow: "admin",
    routeNotes: [...ADMIN_FLOW_NOTES],
    payload: {
      title: payload.title,
      body: payload.body,
      type: typeof payload.data?.type === "string" ? payload.data.type : null,
      dataKeys: Object.keys(payload.data ?? {}),
    },
    totals: {
      adminsFound: adminUserIds.size,
      adminsWithTokens: 0,
      adminsWithoutTokens: 0,
      tokensFound: adminTokens.length,
      tokensSent: 0,
      tokensFailed: 0,
    },
    admins: [] as AdminRecipientDiagnostic[],
  };

  const attemptsByAdmin = new Map<string, AdminRecipientDiagnostic>();
  for (const adminUserId of adminUserIds) {
    const adminTokenRows = adminTokens.filter((token) => token.user_id === adminUserId);
    const entry: AdminRecipientDiagnostic = {
      userId: adminUserId,
      email: adminUsers.get(adminUserId)?.email || "N/A",
      tokenCount: adminTokenRows.length,
      attempts: [],
    };
    attemptsByAdmin.set(adminUserId, entry);
    diagnostics.admins.push(entry);

    if (adminTokenRows.length > 0) {
      diagnostics.totals.adminsWithTokens += 1;
    } else {
      diagnostics.totals.adminsWithoutTokens += 1;
    }
  }

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
    diagnostics,
  };

  // Envoyer la notification à chaque admin selon la plateforme du token
  for (const tokenData of adminTokens) {
    try {
      let result:
        | { success: boolean; error?: string }
        | undefined;

      if (tokenData.platform === "ios") {
        if (tokenData.token.startsWith("ios_user_")) {
          results.failed++;
          const error =
            `Token iOS invalide pour admin ${tokenData.user_id}: format identifiant au lieu d'un vrai token APNs`;
          results.errors.push(error);
          diagnostics.totals.tokensFailed += 1;
          attemptsByAdmin.get(tokenData.user_id)?.attempts.push({
            platform: tokenData.platform,
            tokenPreview: previewAdminToken(tokenData.token),
            tokenLength: tokenData.token.length,
            status: "failed",
            error,
            isPlaceholder: true,
          });
          results.success = false;
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
        results.failed++;
        const error =
          `Plateforme non supportée pour admin ${tokenData.user_id}: ${tokenData.platform}`;
        results.errors.push(error);
        diagnostics.totals.tokensFailed += 1;
        attemptsByAdmin.get(tokenData.user_id)?.attempts.push({
          platform: tokenData.platform,
          tokenPreview: previewAdminToken(tokenData.token),
          tokenLength: tokenData.token.length,
          status: "failed",
          error,
          isPlaceholder: false,
        });
        results.success = false;
        continue;
      }

      // Traiter le résultat
      if (result) {
        if (result.success) {
          results.sent++;
          diagnostics.totals.tokensSent += 1;
          attemptsByAdmin.get(tokenData.user_id)?.attempts.push({
            platform: tokenData.platform,
            tokenPreview: previewAdminToken(tokenData.token),
            tokenLength: tokenData.token.length,
            status: "sent",
            isPlaceholder: false,
          });
        } else {
          results.failed++;
          const error = `Admin ${tokenData.user_id}: ${result.error || "Erreur inconnue"}`;
          results.errors.push(error);
          diagnostics.totals.tokensFailed += 1;
          attemptsByAdmin.get(tokenData.user_id)?.attempts.push({
            platform: tokenData.platform,
            tokenPreview: previewAdminToken(tokenData.token),
            tokenLength: tokenData.token.length,
            status: "failed",
            error,
            isPlaceholder: false,
          });
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
      const failureMessage = `Admin ${tokenData.user_id}: ${error.message || "Erreur inconnue"}`;
      results.errors.push(failureMessage);
      diagnostics.totals.tokensFailed += 1;
      attemptsByAdmin.get(tokenData.user_id)?.attempts.push({
        platform: tokenData.platform,
        tokenPreview: previewAdminToken(tokenData.token),
        tokenLength: tokenData.token.length,
        status: "failed",
        error: failureMessage,
        isPlaceholder: tokenData.token.startsWith("ios_user_"),
      });
      results.success = false;
    }
  }

  results.success = results.failed === 0;
  return results;
}

