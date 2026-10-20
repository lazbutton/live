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
  digestBody,
  digestData,
  digestTitle,
  inCategories,
  weekRange,
} from "@/lib/notifications/digest";
import { loadDigestCategories, loadDigestEvents } from "@/lib/notifications/digest-events";
import {
  addDaysToLocalDate,
  getIsoLocalDate,
  getIsoLocalTime,
  getLocalWeekday,
  getZonedDateParts,
} from "@/lib/cron-timezone";

const WEEKLY_FLOW = {
  route: "/api/cron/notifications/weekly-summary",
  path: "cron_weekly_summary",
  authMode: "cron_secret",
  sender: "sendNotificationToUser",
  honorsPreferences: true,
  honorsCategories: true,
  latestTokenOnly: true,
  scheduleMode: "vercel_hobby_weekly",
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
 * GET /api/cron/notifications/weekly-summary
 *
 * Le résumé de la semaine (U9, `lib/notifications/digest.ts`) : le lundi, à chaque utilisateur en `weekly`,
 * « 12 événements cette semaine dans tes catégories » (ceux qui commencent du lundi au dimanche, comme
 * l'accueil de l'app les montre : `app_events_in_range`, heure de Paris). Toucher la notification ouvre
 * l'accueil sur la semaine et ces catégories (données : `docs/API_APP.md`, « Résumés poussés »).
 * Convention produit: la passe hebdomadaire part en debut de semaine, le lundi.
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
    console.log("📊 Démarrage du cron de résumé hebdomadaire");

    const nowInParis = getZonedDateParts(new Date());
    const todayInParis = {
      year: nowInParis.year,
      month: nowInParis.month,
      day: nowInParis.day,
    };
    const weekDay = getLocalWeekday(todayInParis);

    console.log(
      `🕒 Référence Europe/Paris: ${getIsoLocalDate(todayInParis)} ${getIsoLocalTime(nowInParis)}`,
    );

    if (weekDay !== 1) {
      console.log(`ℹ️ Skip weekly: jour courant=${weekDay}, la passe hebdomadaire reste limitée au lundi`);
      return NextResponse.json({
        success: true,
        message: "La passe hebdomadaire ne s'exécute que le lundi",
        notificationsSent: 0,
        flow: WEEKLY_FLOW,
        debug: {
          timezone: "Europe/Paris",
          weekday: weekDay,
        },
      });
    }

    const weekStartLocal = addDaysToLocalDate(todayInParis, -(weekDay - 1));
    const weekEndLocal = addDaysToLocalDate(weekStartLocal, 6);
    const weekStartLabel = getIsoLocalDate(weekStartLocal);
    const weekEndLabel = getIsoLocalDate(weekEndLocal);

    // Ce qui commence cette semaine, comme l'accueil de l'app le montre (sans limite : le compte de
    // chacun dépend de ses catégories).
    let weekEvents;
    let categories;
    try {
      [weekEvents, categories] = await Promise.all([
        loadDigestEvents(weekRange(weekStartLocal)),
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

    if (weekEvents.length === 0) {
      console.log("ℹ️ Aucun événement cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun événement cette semaine",
        eventsCount: 0,
        flow: WEEKLY_FLOW,
      });
    }

    const eventsCount = weekEvents.length;
    console.log(`📋 ${eventsCount} événement(s) cette semaine`);

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
        flow: WEEKLY_FLOW,
      });
    }

    let enabledUsers;

    try {
      enabledUsers = await getEnabledNotificationUsers({ frequency: "weekly" });
    } catch (prefsError: any) {
      console.error("❌ Erreur lors de la récupération des préférences notifications weekly:", prefsError);
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
        flow: WEEKLY_FLOW,
      });
    }

    // Grouper les événements par utilisateur selon leurs préférences
    const eventsByUser: Record<string, typeof weekEvents> = {};

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

      const userEvents = inCategories(weekEvents, userCategoryIds, categories);
      if (userEvents.length > 0) {
        eventsByUser[user.user_id] = userEvents;
      }
    });

    if (Object.keys(eventsByUser).length === 0) {
      console.log(
        `ℹ️ Aucun utilisateur éligible pour les événements de cette semaine (users=${enabledUsers.length}, sans_categories=${usersWithoutCategories}, sans_tokens=${usersWithoutTokens})`,
      );
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur éligible",
        eventsCount,
        notificationsSent: 0,
        flow: WEEKLY_FLOW,
        debug: {
          enabledUsers: enabledUsers.length,
          usersWithoutCategories,
          usersWithoutTokens,
          eligibleUsers: 0,
        },
      });
    }

    console.log(
      `📱 ${Object.keys(eventsByUser).length} utilisateur(s) éligible(s) sur ${enabledUsers.length} (sans_categories=${usersWithoutCategories}, sans_tokens=${usersWithoutTokens})`,
    );

    let totalSent = 0;
    let totalFailed = 0;
    let skippedAlreadySent = 0;
    const errors: string[] = [];
    const deliveryDiagnostics: Array<Record<string, any>> = [];

    // Envoyer une seule notification par utilisateur avec tous ses événements
    for (const [userId, userEvents] of Object.entries(eventsByUser)) {
      try {
        const categoryIds = categoryIdsOf(userEvents, categories);
        const title = digestTitle(userEvents.length, "week");
        const body = digestBody(userEvents.map((event) => event.title));
        const data = digestData({
          period: "week",
          date: weekStartLabel,
          endDate: weekEndLabel,
          categoryIds,
          eventIds: userEvents.map((event) => event.id),
        });

        const deliveryKey = `weekly_summary:${weekStartLabel}:${userId}`;
        const claim = await claimNotificationDelivery({
          userId,
          payload: { title, body, data },
          deliveryDate: weekStartLabel,
          deliveryKey,
          flowType: "weekly_summary",
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
                  : "Notification hebdomadaire déjà envoyée pour cette semaine",
              eventsCount: userEvents.length,
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
    
    console.log(`✅ Résumé hebdomadaire envoyé: ${result.sent} réussis, ${result.failed} échecs`);

    return NextResponse.json({
      success: result.success,
      message: `Résumé hebdomadaire envoyé pour ${eventsCount} événement(s) à ${Object.keys(eventsByUser).length} utilisateur(s)`,
      eventsCount,
      usersNotified: Object.keys(eventsByUser).length,
      enabledUsers: enabledUsers.length,
      notificationsSent: result.sent,
      notificationsFailed: result.failed,
      notificationsSkipped: skippedAlreadySent,
      errors: result.errors.length > 0 ? result.errors : undefined,
      flow: WEEKLY_FLOW,
      debug: {
        enabledUsers: enabledUsers.length,
        usersWithoutCategories,
        usersWithoutTokens,
        eligibleUsers: Object.keys(eventsByUser).length,
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

