import { sendAPNsNotification } from "./apns";
import { sendFCMNotification } from "./fcm";
import { createServiceClient } from "@/lib/supabase/service";

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}

/**
 * Envoie une notification à un utilisateur spécifique
 * Récupère automatiquement tous les tokens de l'utilisateur et envoie selon la plateforme
 */
export async function sendNotificationToUser(
  userId: string,
  payload: NotificationPayload
): Promise<NotificationResult> {
  const supabase = createServiceClient();

  // Vérifier que l'utilisateur a activé les notifications
  const { data: preferences, error: prefsError } = await supabase
    .from("user_notification_preferences")
    .select("is_enabled")
    .eq("user_id", userId)
    .single();

  if (prefsError || !preferences || !preferences.is_enabled) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["L'utilisateur n'a pas activé les notifications"],
    };
  }

  // Récupérer tous les tokens de l'utilisateur
  const { data: tokens, error } = await supabase
    .from("user_push_tokens")
    .select("token, platform")
    .eq("user_id", userId);

  if (error) {
    console.error("❌ Erreur lors de la récupération des tokens:", error);
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [error.message],
    };
  }

  if (!tokens || tokens.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun token trouvé pour cet utilisateur"],
    };
  }

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // Envoyer à chaque token selon sa plateforme
  for (const tokenData of tokens) {
    let result;

    if (tokenData.platform === "ios") {
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
      // Web push notifications (à implémenter si nécessaire)
      console.warn(`⚠️ Plateforme "${tokenData.platform}" non supportée`);
      results.failed++;
      results.errors.push(
        `Plateforme "${tokenData.platform}" non supportée`
      );
      continue;
    }

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push(result.error || "Erreur inconnue");

      // Si le token est invalide, le supprimer de la base
      if (
        result.error?.includes("Token invalide") ||
        result.error?.includes("BadDeviceToken") ||
        result.error?.includes("Unregistered") ||
        result.error?.includes("registration-token-not-registered")
      ) {
        await supabase
          .from("user_push_tokens")
          .delete()
          .eq("token", tokenData.token);
        console.log(`🗑️ Token invalide supprimé: ${tokenData.token}`);
      }
    }
  }

  // Logger la notification
  if (results.sent > 0) {
    await logNotification(userId, payload, results);
  }

  results.success = results.failed === 0;
  return results;
}

/**
 * Envoie une notification à plusieurs utilisateurs
 */
export async function sendNotificationToUsers(
  userIds: string[],
  payload: NotificationPayload
): Promise<NotificationResult> {
  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  for (const userId of userIds) {
    const result = await sendNotificationToUser(userId, payload);
    results.sent += result.sent;
    results.failed += result.failed;
    results.errors.push(...result.errors);
  }

  results.success = results.failed === 0;
  return results;
}

/**
 * Envoie une notification à tous les utilisateurs ayant un token ET ayant activé les notifications
 */
export async function sendNotificationToAll(
  payload: NotificationPayload
): Promise<NotificationResult> {
  const supabase = createServiceClient();

  // Récupérer uniquement les utilisateurs qui ont activé les notifications
  const { data: enabledUsers, error: prefsError } = await supabase
    .from("user_notification_preferences")
    .select("user_id")
    .eq("is_enabled", true);

  if (prefsError || !enabledUsers || enabledUsers.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun utilisateur n'a activé les notifications"],
    };
  }

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
  };

  // Envoyer à chaque utilisateur (sendNotificationToUser vérifie déjà les préférences et récupère les tokens)
  for (const userData of enabledUsers) {
    const result = await sendNotificationToUser(userData.user_id, payload);
    results.sent += result.sent;
    results.failed += result.failed;
    results.errors.push(...result.errors);
  }

  results.success = results.failed === 0;
  return results;
}

/**
 * Log une notification dans la base de données
 */
async function logNotification(
  userId: string,
  payload: NotificationPayload,
  result: NotificationResult
): Promise<void> {
  const supabase = createServiceClient();

  // Extraire les event_ids depuis les données si présents
  const eventIds = payload.data?.event_ids
    ? (Array.isArray(payload.data.event_ids)
        ? payload.data.event_ids
        : [payload.data.event_ids]
      ).filter((id): id is string => typeof id === "string")
    : undefined;

  const { error } = await supabase.from("notification_logs").insert({
    user_id: userId,
    title: payload.title,
    body: payload.body,
    event_ids: eventIds,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    console.error("❌ Erreur lors du log de la notification:", error);
  }
}

