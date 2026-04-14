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

type NotificationPreferenceRow = {
  user_id: string;
  is_enabled?: boolean;
  frequency?: string | null;
  category_ids?: string[] | null;
};

type NotificationCategoryPreferenceRow = {
  user_id?: string;
  category_id: string | null;
};

type NotificationTokenRow = {
  user_id?: string;
  token: string;
  platform: string;
  updated_at?: string | null;
};

export interface EnabledNotificationUser {
  user_id: string;
  is_enabled?: boolean;
  frequency?: string | null;
  category_ids?: string[] | null;
  user_notification_categories?: NotificationCategoryPreferenceRow[] | null;
  user_push_tokens?: NotificationTokenRow[] | null;
}

function uniqueStringValues(values: unknown[]): string[] {
  return [...new Set(
    values.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
  )];
}

function getPayloadCategoryIds(payload: NotificationPayload): string[] {
  const categories: unknown[] = [];

  if (Array.isArray(payload.data?.categories)) {
    categories.push(...payload.data.categories);
  }

  if (typeof payload.data?.category === "string") {
    categories.push(payload.data.category);
  }

  return uniqueStringValues(categories);
}

// Tant que le mobile écrit encore dans `user_notification_categories`, on garde
// un fallback serveur pour éviter de perdre les envois produit.
export function getEffectiveNotificationCategoryIds(
  preferences: Pick<EnabledNotificationUser, "category_ids" | "user_notification_categories">,
): string[] {
  const explicitCategoryIds = uniqueStringValues(
    Array.isArray(preferences.category_ids) ? preferences.category_ids : [],
  );

  if (explicitCategoryIds.length > 0) {
    return explicitCategoryIds;
  }

  return uniqueStringValues(
    (preferences.user_notification_categories ?? []).map((row) => row?.category_id),
  );
}

function payloadMatchesUserNotificationCategories(
  preferences: Pick<EnabledNotificationUser, "category_ids" | "user_notification_categories">,
  payload: NotificationPayload,
): boolean {
  const payloadCategoryIds = getPayloadCategoryIds(payload);
  if (payloadCategoryIds.length === 0) {
    return true;
  }

  const userCategoryIds = getEffectiveNotificationCategoryIds(preferences);
  if (userCategoryIds.length === 0) {
    return false;
  }

  return payloadCategoryIds.some((categoryId) => userCategoryIds.includes(categoryId));
}

function buildEnabledNotificationUsers(
  preferences: NotificationPreferenceRow[],
  categoryRows: NotificationCategoryPreferenceRow[],
  tokenRows: NotificationTokenRow[],
): EnabledNotificationUser[] {
  const users = new Map<string, EnabledNotificationUser>();

  for (const preference of preferences) {
    users.set(preference.user_id, {
      ...preference,
      user_notification_categories: [],
      user_push_tokens: [],
    });
  }

  for (const categoryRow of categoryRows) {
    if (!categoryRow.user_id) continue;
    const user = users.get(categoryRow.user_id);
    if (!user) continue;
    user.user_notification_categories?.push({ category_id: categoryRow.category_id });
  }

  for (const tokenRow of tokenRows) {
    if (!tokenRow.user_id) continue;
    const user = users.get(tokenRow.user_id);
    if (!user) continue;
    user.user_push_tokens?.push({
      token: tokenRow.token,
      platform: tokenRow.platform,
      updated_at: tokenRow.updated_at,
    });
  }

  return [...users.values()];
}

async function getNotificationPreferencesForUser(
  userId: string,
): Promise<Pick<EnabledNotificationUser, "is_enabled" | "category_ids" | "user_notification_categories"> | null> {
  const supabase = createServiceClient();

  const [{ data: preference, error: preferenceError }, { data: categoryRows, error: categoryError }] =
    await Promise.all([
      supabase
        .from("user_notification_preferences")
        .select("is_enabled, category_ids")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_notification_categories")
        .select("category_id")
        .eq("user_id", userId),
    ]);

  if (preferenceError) {
    throw preferenceError;
  }

  if (categoryError) {
    throw categoryError;
  }

  if (!preference) {
    return null;
  }

  return {
    is_enabled: preference.is_enabled,
    category_ids: preference.category_ids,
    user_notification_categories: (categoryRows ?? []) as NotificationCategoryPreferenceRow[],
  };
}

export async function getEnabledNotificationUsers(options: {
  frequency?: "daily" | "weekly";
} = {}): Promise<EnabledNotificationUser[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from("user_notification_preferences")
    .select("user_id, is_enabled, frequency, category_ids")
    .eq("is_enabled", true);

  if (options.frequency) {
    query = query.eq("frequency", options.frequency);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const preferences = (data ?? []) as NotificationPreferenceRow[];
  if (preferences.length === 0) {
    return [];
  }

  const userIds = preferences.map((preference) => preference.user_id);

  const [{ data: categoryRows, error: categoryError }, { data: tokenRows, error: tokenError }] =
    await Promise.all([
      supabase
        .from("user_notification_categories")
        .select("user_id, category_id")
        .in("user_id", userIds),
      supabase
        .from("user_push_tokens")
        .select("user_id, token, platform, updated_at")
        .in("user_id", userIds),
    ]);

  if (categoryError) {
    throw categoryError;
  }

  if (tokenError) {
    throw tokenError;
  }

  return buildEnabledNotificationUsers(
    preferences,
    (categoryRows ?? []) as NotificationCategoryPreferenceRow[],
    (tokenRows ?? []) as NotificationTokenRow[],
  );
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

  let preferences;

  try {
    preferences = await getNotificationPreferencesForUser(userId);
  } catch (prefsError: any) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [prefsError?.message || "Impossible de récupérer les préférences utilisateur"],
    };
  }

  if (!preferences || !preferences.is_enabled) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["L'utilisateur n'a pas activé les notifications"],
    };
  }

  const payloadCategoryIds = getPayloadCategoryIds(payload);
  const userCategoryIds = getEffectiveNotificationCategoryIds(preferences);

  if (payloadCategoryIds.length > 0) {
    if (userCategoryIds.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        errors: ["L'utilisateur n'a pas configuré de catégories de notifications"],
      };
    }

    const matchingCategories = payloadCategoryIds.filter((categoryId) =>
      userCategoryIds.includes(categoryId),
    );

    if (matchingCategories.length === 0) {
      return {
        success: false,
        sent: 0,
        failed: 0,
        errors: ["L'utilisateur n'a pas activé les notifications pour ces catégories"],
      };
    }
  }

  // Récupérer uniquement le dernier token de l'utilisateur (le plus récent)
  const { data: tokens, error } = await supabase
    .from("user_push_tokens")
    .select("token, platform")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

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

  // Utiliser uniquement le dernier token (le plus récent)
  // Si plusieurs tokens existent, on prend le plus récemment mis à jour
  const tokenData = tokens[0]; // On a limité à 1, donc on prend le premier
  
  console.log(`📱 Utilisation du dernier token pour l'utilisateur ${userId}: ${tokenData.platform} (${tokenData.token.substring(0, 20)}...)`);

  // Envoyer la notification au dernier token
  let result;

  if (tokenData.platform === "ios") {
    // Ignorer les tokens qui commencent par "ios_user_" (identifiants, pas de vrais tokens APNs)
    if (tokenData.token.startsWith("ios_user_")) {
      console.warn(
        `⚠️ Token iOS invalide (format identifiant): ${tokenData.token}. L'application mobile doit obtenir et enregistrer le vrai token APNs depuis l'appareil iOS.`
      );
      console.warn(
        `   💡 Pour obtenir le vrai token APNs dans Flutter iOS, utilisez flutter_apns ou UNUserNotificationCenter.`
      );
      
      results.failed++;
      results.errors.push(
        `Token iOS invalide (format identifiant au lieu d'un vrai token APNs): ${tokenData.token}. L'application doit enregistrer le vrai token APNs obtenu depuis l'appareil iOS.`
      );
      results.success = false;
    } else {
      result = await sendAPNsNotification(
        tokenData.token,
        payload.title,
        payload.body,
        payload.data
      );
    }
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
    results.success = false;
  }

  // Traiter le résultat (seulement si on a un résultat)
  if (result) {
    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push(result.error || "Erreur inconnue");
      results.success = false;

      // Si le token est invalide, le supprimer de la base
      const shouldDeleteToken =
        result.error?.includes("Token invalide") ||
        result.error?.includes("BadDeviceToken") ||
        result.error?.includes("Unregistered") ||
        result.error?.includes("registration-token-not-registered") ||
        result.error?.includes("400") || // Erreur 400 = généralement DeviceTokenNotForTopic (bundle ID mismatch)
        result.error?.includes("Requête invalide");

      if (shouldDeleteToken) {
        await supabase
          .from("user_push_tokens")
          .delete()
          .eq("token", tokenData.token);
        console.log(`🗑️ Token invalide supprimé (${result.error}): ${tokenData.token.substring(0, 20)}...`);
      }
    }
  }

  // Logger la notification
  if (results.sent > 0) {
    await logNotification(userId, payload);
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
  let enabledUsers: EnabledNotificationUser[];

  try {
    enabledUsers = await getEnabledNotificationUsers();
  } catch (error: any) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [error?.message || "Impossible de récupérer les utilisateurs éligibles"],
    };
  }

  if (enabledUsers.length === 0) {
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

  const usersToNotify = enabledUsers.filter((userData) =>
    payloadMatchesUserNotificationCategories(userData, payload),
  );

  console.log(`📊 ${usersToNotify.length} utilisateur(s) éligible(s) sur ${enabledUsers.length} avec notifications activées`);

  // Envoyer à chaque utilisateur éligible (sendNotificationToUser vérifie déjà les préférences et récupère les tokens)
  for (const userData of usersToNotify) {
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
  payload: NotificationPayload
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

