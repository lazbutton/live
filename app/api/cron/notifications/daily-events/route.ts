import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  claimNotificationDelivery,
  getEffectiveNotificationCategoryIds,
  getEnabledNotificationUsers,
  sendNotificationToUser,
} from "@/lib/notifications";
import {
  categoryIdsOf,
  dayRange,
  digestBody,
  digestData,
  digestTitle,
  planDailyDigest,
  tonightRange,
} from "@/lib/notifications/digest";
import { loadDigestCategories, loadDigestEvents } from "@/lib/notifications/digest-events";
import {
  getIsoLocalDate,
  getIsoLocalTime,
  getZonedDateParts,
} from "@/lib/cron-timezone";

const DAILY_FLOW = {
  route: "/api/cron/notifications/daily-events",
  path: "cron_daily_events",
  authMode: "cron_secret",
  sender: "sendNotificationToUser",
  honorsPreferences: true,
  honorsCategories: true,
  latestTokenOnly: true,
  scheduleMode: "vercel_hobby_daily",
  schedulePrecision: "hour",
};
const MAX_ROUTE_DIAGNOSTICS = 25;

/**
 * Vérifie que la requête vient bien de Vercel Cron
 */
function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("❌ CRON_SECRET n'est pas défini dans les variables d'environnement");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * GET /api/cron/notifications/daily-events
 *
 * Le résumé du matin (U9, `lib/notifications/digest.ts`) : à chaque utilisateur en `daily`, « 3 événements
 * ce soir dans tes catégories » (de 18 h à 6 h, comme « Ce soir » dans l'app) ; rien ce soir, ce qui reste
 * aujourd'hui ; rien du tout, pas de message. Les événements sont ceux de l'accueil de l'app
 * (`app_events_in_range`, heure de Paris). Toucher la notification ouvre l'accueil sur cette période et ces
 * catégories (données : `docs/API_APP.md`, « Résumés poussés »).
 * Sur Vercel Hobby, l'horaire est pilote par vercel.json avec une precision a l'heure.
 */
export async function GET(request: NextRequest) {
  // Vérifier que la requête vient bien de Vercel Cron
  if (!verifyCronRequest(request)) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServiceClient();
    console.log("📅 Démarrage du cron de notifications pour les événements du jour");

    const nowInParis = getZonedDateParts(new Date());
    const todayInParis = {
      year: nowInParis.year,
      month: nowInParis.month,
      day: nowInParis.day,
    };
    const todayLabel = getIsoLocalDate(todayInParis);

    console.log(
      `🕒 Référence Europe/Paris: ${todayLabel} ${getIsoLocalTime(nowInParis)}`,
    );

    // Ce soir, et toute la journée (repli) : ce qui y commence, comme l'accueil de l'app le montre.
    let tonightEvents;
    let todayEvents;
    let categories;
    try {
      [tonightEvents, todayEvents, categories] = await Promise.all([
        loadDigestEvents(tonightRange(todayInParis)),
        loadDigestEvents(dayRange(todayInParis)),
        loadDigestCategories(),
      ]);
    } catch (eventsError: any) {
      console.error("❌ Erreur lors de la récupération des événements:", eventsError);
      return NextResponse.json(
        {
          success: false,
          error: eventsError?.message || "Impossible de récupérer les événements",
        },
        { status: 500 },
      );
    }

    if (todayEvents.length === 0 && tonightEvents.length === 0) {
      console.log("ℹ️ Aucun événement aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement aujourd'hui",
        eventsCount: 0,
        flow: DAILY_FLOW,
      });
    }

    const eventsCount = new Set([...tonightEvents, ...todayEvents].map((event) => event.id)).size;
    console.log(
      `📋 ${eventsCount} événement(s) aujourd'hui, dont ${tonightEvents.length} ce soir`,
    );

    // Vérifier si les notifications globales sont activées
    const { data: globalSettings } = await supabase
      .from("notification_settings")
      .select("is_active")
      .maybeSingle();

    if (!globalSettings || !globalSettings.is_active) {
      console.log("ℹ️ Les notifications globales sont désactivées");
      return NextResponse.json({
        success: true,
        message: "Notifications globales désactivées",
        eventsCount,
        notificationsSent: 0,
        flow: DAILY_FLOW,
      });
    }

    let enabledUsers;

    try {
      enabledUsers = await getEnabledNotificationUsers({ frequency: "daily" });
    } catch (prefsError: any) {
      console.error("❌ Erreur lors de la récupération des préférences notifications daily:", prefsError);
      return NextResponse.json(
        {
          success: false,
          error: prefsError?.message || "Impossible de récupérer les utilisateurs éligibles",
        },
        { status: 500 },
      );
    }

    if (!enabledUsers || enabledUsers.length === 0) {
      console.log("ℹ️ Aucun utilisateur n'a activé les notifications");
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur avec notifications activées",
        eventsCount,
        notificationsSent: 0,
        flow: DAILY_FLOW,
      });
    }

    // Le résumé de chaque utilisateur, selon ses catégories
    const digestByUser = new Map<string, NonNullable<ReturnType<typeof planDailyDigest>>>();

    let usersWithoutCategories = 0;
    let usersWithoutTokens = 0;

    enabledUsers.forEach((user) => {
      const userCategoryIds = getEffectiveNotificationCategoryIds(user);
      if (userCategoryIds.length === 0) {
        usersWithoutCategories++;
        return;
      }

      if (!Array.isArray(user.user_push_tokens) || user.user_push_tokens.length === 0) {
        usersWithoutTokens++;
        return;
      }

      const plan = planDailyDigest(tonightEvents, todayEvents, userCategoryIds, categories);
      if (plan) {
        digestByUser.set(user.user_id, plan);
      }
    });

    if (digestByUser.size === 0) {
      console.log(
        `ℹ️ Aucun utilisateur éligible pour les événements d'aujourd'hui (users=${enabledUsers.length}, sans_categories=${usersWithoutCategories}, sans_tokens=${usersWithoutTokens})`,
      );
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur éligible",
        eventsCount,
        notificationsSent: 0,
        flow: DAILY_FLOW,
        debug: {
          enabledUsers: enabledUsers.length,
          usersWithoutCategories,
          usersWithoutTokens,
          eligibleUsers: 0,
        },
      });
    }

    console.log(
      `📱 ${digestByUser.size} utilisateur(s) éligible(s) sur ${enabledUsers.length} (sans_categories=${usersWithoutCategories}, sans_tokens=${usersWithoutTokens})`,
    );

    let totalSent = 0;
    let totalFailed = 0;
    let skippedAlreadySent = 0;
    const errors: string[] = [];
    const deliveryDiagnostics: Array<Record<string, any>> = [];

    // Envoyer une seule notification par utilisateur avec tous ses événements
    for (const [userId, plan] of digestByUser) {
      try {
        const userEvents = plan.events;
        const categoryIds = categoryIdsOf(userEvents, categories);
        const title = digestTitle(userEvents.length, plan.period);
        const body = digestBody(userEvents.map((event) => event.title));
        const data = digestData({
          period: plan.period,
          date: todayLabel,
          categoryIds,
          eventIds: userEvents.map((event) => event.id),
        });

        const deliveryKey = `daily_events:${todayLabel}:${userId}`;
        const claim = await claimNotificationDelivery({
          userId,
          payload: { title, body, data },
          deliveryDate: todayLabel,
          deliveryKey,
          flowType: "daily_events",
        });

        if (!claim.claimed || !claim.logId) {
          skippedAlreadySent++;
          if (deliveryDiagnostics.length < MAX_ROUTE_DIAGNOSTICS) {
            deliveryDiagnostics.push({
              userId,
              status: "skipped",
              reason:
                claim.reason === "in_progress"
                  ? "Notification déjà réservée par une autre exécution en cours"
                  : "Notification déjà envoyée pour ce digest quotidien",
              eventsCount: userEvents.length,
              period: plan.period,
              categories: categoryIds,
              deliveryKey,
            });
          }
          continue;
        }

        const result = await sendNotificationToUser(userId, { title, body, data }, {
          notificationLogId: claim.logId,
        });

        if (result.success && result.sent > 0) {
          totalSent++;
        } else {
          totalFailed++;
          if (result.errors.length > 0) {
            errors.push(`Utilisateur ${userId}: ${result.errors[0]}`);
          }
        }

        if (deliveryDiagnostics.length < MAX_ROUTE_DIAGNOSTICS) {
          deliveryDiagnostics.push({
            userId,
            status: result.success && result.sent > 0 ? "sent" : "failed",
            eventsCount: userEvents.length,
            period: plan.period,
            categories: categoryIds,
            deliveryKey,
            reclaimedStaleClaim: claim.reclaimedStale ?? false,
            diagnostics: result.diagnostics,
          });
        }
      } catch (error: any) {
        console.error(`❌ Erreur lors de l'envoi à l'utilisateur ${userId}:`, error);
        totalFailed++;
        errors.push(`Utilisateur ${userId}: ${error.message}`);
        if (deliveryDiagnostics.length < MAX_ROUTE_DIAGNOSTICS) {
          deliveryDiagnostics.push({
            userId,
            status: "failed",
            reason: error.message || "Erreur inconnue",
          });
        }
      }
    }

    const result = {
      success: totalFailed === 0,
      sent: totalSent,
      failed: totalFailed,
      errors: errors.length > 0 ? errors : [],
    };

    console.log(`✅ Notifications envoyées: ${result.sent} réussies, ${result.failed} échecs`);

    return NextResponse.json({
      success: result.success,
      message: `Notifications envoyées pour ${eventsCount} événement(s)`,
      eventsCount,
      usersEligible: digestByUser.size,
      enabledUsers: enabledUsers.length,
      notificationsSent: result.sent,
      notificationsFailed: result.failed,
      notificationsSkipped: skippedAlreadySent,
      errors: result.errors.length > 0 ? result.errors : undefined,
      flow: DAILY_FLOW,
      debug: {
        enabledUsers: enabledUsers.length,
        usersWithoutCategories,
        usersWithoutTokens,
        eligibleUsers: digestByUser.size,
        deliveryDiagnostics,
      },
    });

  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du cron:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}
