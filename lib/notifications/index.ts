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
  diagnostics?: Record<string, any>;
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

type NotificationTokenPreview = {
  platform: string;
  tokenPreview: string;
  tokenLength: number;
  updatedAt?: string | null;
  isPlaceholder: boolean;
};

type NotificationUserDiagnostic = {
  userId: string;
  status: "sent" | "blocked" | "failed";
  reason?: string;
  errors: string[];
  hasPreferences: boolean;
  preferencesEnabled: boolean;
  payloadCategoryIds: string[];
  userCategoryIds: string[];
  matchedCategoryIds: string[];
  tokenCount: number;
  selectedToken?: NotificationTokenPreview | null;
  tokens: NotificationTokenPreview[];
};

type NotificationDispatchTotals = {
  usersEvaluated: number;
  usersEligible: number;
  usersBlocked: number;
  usersSent: number;
  usersFailed: number;
  usersWithTokens: number;
  usersWithoutTokens: number;
  usersWithoutCategories: number;
  usersCategoryMismatch: number;
  usersWithoutPreferences: number;
  usersWithDisabledPreferences: number;
};

type NotificationDispatchDiagnostics = {
  flow: "user";
  mode: "single" | "multiple" | "broadcast";
  routeNotes: string[];
  payload: {
    title: string;
    body: string;
    type: string | null;
    categoryIds: string[];
    dataKeys: string[];
  };
  totals: NotificationDispatchTotals;
  users: NotificationUserDiagnostic[];
  truncatedUsers: number;
};

const MAX_DIAGNOSTIC_USERS = 25;
const USER_FLOW_NOTES = [
  "Flux utilisateur: vérifie user_notification_preferences.is_enabled.",
  "Flux utilisateur: applique le filtrage par catégories si data.categories ou data.category est présent.",
  "Flux utilisateur: envoie uniquement vers le token le plus récemment mis à jour.",
];

function previewToken(tokenRow: NotificationTokenRow): NotificationTokenPreview {
  return {
    platform: tokenRow.platform,
    tokenPreview: `${tokenRow.token.substring(0, 20)}...`,
    tokenLength: tokenRow.token.length,
    updatedAt: tokenRow.updated_at,
    isPlaceholder: tokenRow.token.startsWith("ios_user_"),
  };
}

function createNotificationDispatchDiagnostics(
  mode: NotificationDispatchDiagnostics["mode"],
  payload: NotificationPayload,
): NotificationDispatchDiagnostics {
  return {
    flow: "user",
    mode,
    routeNotes: [...USER_FLOW_NOTES],
    payload: {
      title: payload.title,
      body: payload.body,
      type: typeof payload.data?.type === "string" ? payload.data.type : null,
      categoryIds: getPayloadCategoryIds(payload),
      dataKeys: Object.keys(payload.data ?? {}),
    },
    totals: {
      usersEvaluated: 0,
      usersEligible: 0,
      usersBlocked: 0,
      usersSent: 0,
      usersFailed: 0,
      usersWithTokens: 0,
      usersWithoutTokens: 0,
      usersWithoutCategories: 0,
      usersCategoryMismatch: 0,
      usersWithoutPreferences: 0,
      usersWithDisabledPreferences: 0,
    },
    users: [],
    truncatedUsers: 0,
  };
}

function pushDiagnosticUser(
  diagnostics: NotificationDispatchDiagnostics,
  userDiagnostic: NotificationUserDiagnostic,
) {
  if (diagnostics.users.length < MAX_DIAGNOSTIC_USERS) {
    diagnostics.users.push(userDiagnostic);
  } else {
    diagnostics.truncatedUsers += 1;
  }
}

function mergeDispatchDiagnostics(
  target: NotificationDispatchDiagnostics,
  source: NotificationDispatchDiagnostics,
) {
  const totalKeys = Object.keys(target.totals) as Array<keyof NotificationDispatchTotals>;
  for (const key of totalKeys) {
    target.totals[key] += source.totals[key];
  }

  for (const userDiagnostic of source.users) {
    pushDiagnosticUser(target, userDiagnostic);
  }
  target.truncatedUsers += source.truncatedUsers;
}

function recordDiagnosticUser(
  diagnostics: NotificationDispatchDiagnostics,
  userDiagnostic: NotificationUserDiagnostic,
  options: {
    eligible?: boolean;
    blocked?: boolean;
    failed?: boolean;
    sent?: boolean;
    withTokens?: boolean;
    withoutTokens?: boolean;
    withoutCategories?: boolean;
    categoryMismatch?: boolean;
    withoutPreferences?: boolean;
    disabledPreferences?: boolean;
  } = {},
) {
  diagnostics.totals.usersEvaluated += 1;
  if (options.eligible) diagnostics.totals.usersEligible += 1;
  if (options.blocked) diagnostics.totals.usersBlocked += 1;
  if (options.failed) diagnostics.totals.usersFailed += 1;
  if (options.sent) diagnostics.totals.usersSent += 1;
  if (options.withTokens) diagnostics.totals.usersWithTokens += 1;
  if (options.withoutTokens) diagnostics.totals.usersWithoutTokens += 1;
  if (options.withoutCategories) diagnostics.totals.usersWithoutCategories += 1;
  if (options.categoryMismatch) diagnostics.totals.usersCategoryMismatch += 1;
  if (options.withoutPreferences) diagnostics.totals.usersWithoutPreferences += 1;
  if (options.disabledPreferences) diagnostics.totals.usersWithDisabledPreferences += 1;

  pushDiagnosticUser(diagnostics, userDiagnostic);
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
  const diagnostics = createNotificationDispatchDiagnostics("single", payload);
  const payloadCategoryIds = diagnostics.payload.categoryIds;
  const userDiagnostic: NotificationUserDiagnostic = {
    userId,
    status: "blocked",
    errors: [],
    hasPreferences: false,
    preferencesEnabled: false,
    payloadCategoryIds,
    userCategoryIds: [],
    matchedCategoryIds: [],
    tokenCount: 0,
    selectedToken: null,
    tokens: [],
  };

  let preferences;

  try {
    preferences = await getNotificationPreferencesForUser(userId);
  } catch (prefsError: any) {
    userDiagnostic.status = "failed";
    userDiagnostic.reason = "Impossible de récupérer les préférences utilisateur";
    userDiagnostic.errors = [
      prefsError?.message || "Impossible de récupérer les préférences utilisateur",
    ];

    recordDiagnosticUser(diagnostics, userDiagnostic, {
      failed: true,
    });

    return {
      success: false,
      sent: 0,
      failed: 1,
      errors: [prefsError?.message || "Impossible de récupérer les préférences utilisateur"],
      diagnostics,
    };
  }

  if (!preferences) {
    userDiagnostic.reason = "Aucune préférence de notification trouvée";
    recordDiagnosticUser(diagnostics, userDiagnostic, {
      blocked: true,
      withoutPreferences: true,
    });

    return {
      success: false,
      sent: 0,
      failed: 1,
      errors: ["Aucune préférence de notification trouvée pour cet utilisateur"],
      diagnostics,
    };
  }

  userDiagnostic.hasPreferences = true;
  userDiagnostic.preferencesEnabled = Boolean(preferences.is_enabled);
  userDiagnostic.userCategoryIds = getEffectiveNotificationCategoryIds(preferences);
  userDiagnostic.matchedCategoryIds = payloadCategoryIds.filter((categoryId) =>
    userDiagnostic.userCategoryIds.includes(categoryId),
  );

  if (!preferences.is_enabled) {
    userDiagnostic.reason = "Les notifications sont désactivées pour cet utilisateur";
    recordDiagnosticUser(diagnostics, userDiagnostic, {
      blocked: true,
      disabledPreferences: true,
    });

    return {
      success: false,
      sent: 0,
      failed: 1,
      errors: ["L'utilisateur n'a pas activé les notifications"],
      diagnostics,
    };
  }

  if (payloadCategoryIds.length > 0) {
    if (userDiagnostic.userCategoryIds.length === 0) {
      userDiagnostic.reason =
        "Le payload cible des catégories, mais l'utilisateur n'en a configuré aucune";
      recordDiagnosticUser(diagnostics, userDiagnostic, {
        blocked: true,
        withoutCategories: true,
      });

      return {
        success: false,
        sent: 0,
        failed: 1,
        errors: ["L'utilisateur n'a pas configuré de catégories de notifications"],
        diagnostics,
      };
    }

    if (userDiagnostic.matchedCategoryIds.length === 0) {
      userDiagnostic.reason =
        "Les catégories du payload ne correspondent à aucune catégorie suivie par l'utilisateur";
      recordDiagnosticUser(diagnostics, userDiagnostic, {
        blocked: true,
        categoryMismatch: true,
      });

      return {
        success: false,
        sent: 0,
        failed: 1,
        errors: ["L'utilisateur n'a pas activé les notifications pour ces catégories"],
        diagnostics,
      };
    }
  }

  const { data: tokens, error } = await supabase
    .from("user_push_tokens")
    .select("token, platform, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("❌ Erreur lors de la récupération des tokens:", error);
    userDiagnostic.status = "failed";
    userDiagnostic.reason = "Impossible de récupérer les tokens push";
    userDiagnostic.errors = [error.message];
    recordDiagnosticUser(diagnostics, userDiagnostic, {
      failed: true,
    });

    return {
      success: false,
      sent: 0,
      failed: 1,
      errors: [error.message],
      diagnostics,
    };
  }

  if (!tokens || tokens.length === 0) {
    userDiagnostic.reason = "Aucun token push trouvé pour cet utilisateur";
    recordDiagnosticUser(diagnostics, userDiagnostic, {
      blocked: true,
      withoutTokens: true,
    });

    return {
      success: false,
      sent: 0,
      failed: 1,
      errors: ["Aucun token trouvé pour cet utilisateur"],
      diagnostics,
    };
  }

  userDiagnostic.tokenCount = tokens.length;
  userDiagnostic.tokens = tokens.map((tokenRow) => previewToken(tokenRow));

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
    diagnostics,
  };

  const tokenData = tokens[0];
  userDiagnostic.selectedToken = previewToken(tokenData);
  
  console.log(`📱 Utilisation du dernier token pour l'utilisateur ${userId}: ${tokenData.platform} (${tokenData.token.substring(0, 20)}...)`);

  let result;

  if (tokenData.platform === "ios") {
    if (tokenData.token.startsWith("ios_user_")) {
      console.warn(
        `⚠️ Token iOS invalide (format identifiant): ${tokenData.token}. L'application mobile doit obtenir et enregistrer le vrai token APNs depuis l'appareil iOS.`
      );
      console.warn(
        `   💡 Pour obtenir le vrai token APNs dans Flutter iOS, utilisez flutter_apns ou UNUserNotificationCenter.`
      );
      
      results.failed++;
      userDiagnostic.status = "failed";
      userDiagnostic.reason =
        "Le dernier token iOS est un identifiant placeholder, pas un vrai token APNs";
      userDiagnostic.errors = [
        `Token iOS invalide (format identifiant au lieu d'un vrai token APNs): ${tokenData.token}. L'application doit enregistrer le vrai token APNs obtenu depuis l'appareil iOS.`,
      ];
      results.errors.push(...userDiagnostic.errors);
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
    console.warn(`⚠️ Plateforme "${tokenData.platform}" non supportée`);
    results.failed++;
    userDiagnostic.status = "failed";
    userDiagnostic.reason = `Plateforme "${tokenData.platform}" non supportée`;
    userDiagnostic.errors = [`Plateforme "${tokenData.platform}" non supportée`];
    results.errors.push(...userDiagnostic.errors);
    results.success = false;
  }

  if (result) {
    if (result.success) {
      results.sent++;
      userDiagnostic.status = "sent";
      userDiagnostic.reason = "Notification envoyée";
    } else {
      results.failed++;
      userDiagnostic.status = "failed";
      userDiagnostic.reason = result.error || "Erreur inconnue";
      userDiagnostic.errors = [result.error || "Erreur inconnue"];
      results.errors.push(...userDiagnostic.errors);
      results.success = false;

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

  if (results.sent > 0) {
    recordDiagnosticUser(diagnostics, userDiagnostic, {
      eligible: true,
      sent: true,
      withTokens: true,
    });
  } else {
    recordDiagnosticUser(diagnostics, userDiagnostic, {
      eligible: true,
      failed: true,
      withTokens: true,
    });
  }

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
  const diagnostics = createNotificationDispatchDiagnostics("multiple", payload);
  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
    diagnostics,
  };

  for (const userId of userIds) {
    const result = await sendNotificationToUser(userId, payload);
    results.sent += result.sent;
    results.failed += result.failed;
    results.errors.push(...result.errors);
    if (result.diagnostics) {
      mergeDispatchDiagnostics(diagnostics, result.diagnostics as NotificationDispatchDiagnostics);
    }
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
  const diagnostics = createNotificationDispatchDiagnostics("broadcast", payload);
  let enabledUsers: EnabledNotificationUser[];

  try {
    enabledUsers = await getEnabledNotificationUsers();
  } catch (error: any) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: [error?.message || "Impossible de récupérer les utilisateurs éligibles"],
      diagnostics,
    };
  }

  if (enabledUsers.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      errors: ["Aucun utilisateur n'a activé les notifications"],
      diagnostics,
    };
  }

  const results: NotificationResult = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [],
    diagnostics,
  };

  const usersToNotify: EnabledNotificationUser[] = [];
  const payloadCategoryIds = diagnostics.payload.categoryIds;

  for (const userData of enabledUsers) {
    const userCategoryIds = getEffectiveNotificationCategoryIds(userData);
    const matchedCategoryIds = payloadCategoryIds.filter((categoryId) =>
      userCategoryIds.includes(categoryId),
    );
    const tokenCandidates = (userData.user_push_tokens ?? []).map((tokenRow) =>
      previewToken(tokenRow),
    );

    if (!payloadMatchesUserNotificationCategories(userData, payload)) {
      recordDiagnosticUser(
        diagnostics,
        {
          userId: userData.user_id,
          status: "blocked",
          reason:
            userCategoryIds.length === 0
              ? "Le payload cible des catégories, mais cet utilisateur n'en a configuré aucune"
              : "Les catégories du payload ne correspondent à aucune catégorie suivie",
          errors: [],
          hasPreferences: true,
          preferencesEnabled: Boolean(userData.is_enabled),
          payloadCategoryIds,
          userCategoryIds,
          matchedCategoryIds,
          tokenCount: tokenCandidates.length,
          selectedToken: tokenCandidates[0] ?? null,
          tokens: tokenCandidates,
        },
        {
          blocked: true,
          withTokens: tokenCandidates.length > 0,
          withoutTokens: tokenCandidates.length === 0,
          withoutCategories: userCategoryIds.length === 0,
          categoryMismatch: userCategoryIds.length > 0,
        },
      );
      continue;
    }

    usersToNotify.push(userData);
  }

  console.log(`📊 ${usersToNotify.length} utilisateur(s) éligible(s) sur ${enabledUsers.length} avec notifications activées`);

  for (const userData of usersToNotify) {
    const result = await sendNotificationToUser(userData.user_id, payload);
    results.sent += result.sent;
    results.failed += result.failed;
    results.errors.push(...result.errors);
    if (result.diagnostics) {
      mergeDispatchDiagnostics(diagnostics, result.diagnostics as NotificationDispatchDiagnostics);
    }
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

