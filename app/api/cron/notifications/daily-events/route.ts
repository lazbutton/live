import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  claimNotificationDelivery,
  getEffectiveNotificationCategoryIds,
  getEnabledNotificationUsers,
  sendNotificationToUser,
} from "@/lib/notifications";
import {
  addDaysToLocalDate,
  formatHourMinute,
  getIsoLocalDate,
  getIsoLocalTime,
  getZonedDateParts,
  isWithinScheduledWindow,
  zonedTimeToUtc,
} from "@/lib/cron-timezone";

const DAILY_FLOW = {
  route: "/api/cron/notifications/daily-events",
  path: "cron_daily_events",
  authMode: "cron_secret",
  sender: "sendNotificationToUser",
  honorsPreferences: true,
  honorsCategories: true,
  latestTokenOnly: true,
};
const MAX_ROUTE_DIAGNOSTICS = 25;

type DailyDigestEventRow = {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  category: string | null;
};

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
 * Cron job pour envoyer la passe quotidienne des notifications par categories suivies.
 * L'heure effective reste pilotee par `notification_settings.notification_time`.
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
    
    const now = new Date();
    const nowInParis = getZonedDateParts(now);
    const todayInParis = {
      year: nowInParis.year,
      month: nowInParis.month,
      day: nowInParis.day,
    };
    const tomorrowInParis = addDaysToLocalDate(todayInParis, 1);
    const todayStart = zonedTimeToUtc({
      ...todayInParis,
      hour: 0,
      minute: 0,
      second: 0,
    }).toISOString();
    const tomorrowStart = zonedTimeToUtc({
      ...tomorrowInParis,
      hour: 0,
      minute: 0,
      second: 0,
    }).toISOString();
    const todayLabel = getIsoLocalDate(todayInParis);

    console.log(
      `🕒 Référence Europe/Paris: ${todayLabel} ${getIsoLocalTime(nowInParis)}`,
    );
    
    // Récupérer les événements approuvés du jour avec leurs catégories (exclure les événements complets)
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
      .or("is_full.is.null,is_full.eq.false") // Exclure les événements complets
      .gte("date", todayStart)
      .lt("date", tomorrowStart)
      .order("date", { ascending: true });
    
    if (eventsError) {
      console.error("❌ Erreur lors de la récupération des événements:", eventsError);
      return NextResponse.json(
        { 
          success: false, 
          error: eventsError.message 
        },
        { status: 500 }
      );
    }
    
    const relevantEvents = ((events ?? []) as DailyDigestEventRow[]).filter((event) => {
      const start = new Date(event.date);
      const end = event.end_date ? new Date(event.end_date) : null;
      if (end && !Number.isNaN(end.getTime())) {
        return end >= now;
      }
      return !Number.isNaN(start.getTime()) && start >= now;
    });

    if (relevantEvents.length === 0) {
      console.log("ℹ️ Aucun événement aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement aujourd'hui",
        eventsCount: 0,
        flow: DAILY_FLOW,
      });
    }
    
    console.log(`📋 ${relevantEvents.length} événement(s) pertinent(s) trouvé(s) pour aujourd'hui`);
    
    // Filtrer les événements avec catégorie
    const eventsWithCategory = relevantEvents.filter(
      (event): event is DailyDigestEventRow & { category: string } =>
        typeof event.category === "string" && event.category.length > 0,
    );
    
    if (eventsWithCategory.length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie aujourd'hui",
        eventsCount: 0,
        notificationsSent: 0,
        flow: DAILY_FLOW,
      });
    }

    // Vérifier si les notifications globales sont activées
    const { data: globalSettings } = await supabase
      .from("notification_settings")
      .select("is_active, notification_time")
      .maybeSingle();

    if (!globalSettings || !globalSettings.is_active) {
      console.log("ℹ️ Les notifications globales sont désactivées");
      return NextResponse.json({
        success: true,
        message: "Notifications globales désactivées",
        eventsCount: eventsWithCategory.length,
        notificationsSent: 0,
        flow: DAILY_FLOW,
      });
    }

    // Vérifier si l'heure actuelle correspond à l'heure configurée (pour les utilisateurs "daily")
    const currentHour = nowInParis.hour;
    const currentMinute = nowInParis.minute;
    
    if (globalSettings.notification_time) {
      const [configuredHour, configuredMinute] = globalSettings.notification_time.split(":").map(Number);
      const sendWindowMinutes = Number(process.env.CRON_SEND_WINDOW_MINUTES ?? 15);
      const isInTimeWindow = isWithinScheduledWindow({
        currentHour,
        currentMinute,
        scheduledHour: configuredHour,
        scheduledMinute: configuredMinute,
        windowMinutes: sendWindowMinutes,
      });
      
      if (!isInTimeWindow) {
        console.log(
          `ℹ️ Pas dans la fenêtre d'envoi Paris. Heure actuelle: ${formatHourMinute(currentHour, currentMinute)}, Heure configurée: ${formatHourMinute(configuredHour, configuredMinute)}, Fenêtre: ±${sendWindowMinutes} min`,
        );
        return NextResponse.json({
          success: true,
          message: "Pas dans la fenêtre d'envoi",
          eventsCount: eventsWithCategory.length,
          notificationsSent: 0,
          flow: DAILY_FLOW,
          debug: {
            timezone: "Europe/Paris",
            currentTime: formatHourMinute(currentHour, currentMinute),
            configuredTime: formatHourMinute(configuredHour, configuredMinute),
            sendWindowMinutes,
          },
        });
      }
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
        eventsCount: eventsWithCategory.length,
        notificationsSent: 0,
        flow: DAILY_FLOW,
      });
    }

    // Grouper les événements par utilisateur selon leurs préférences
    const eventsByUser: Record<string, typeof eventsWithCategory> = {};

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

      const userEvents = eventsWithCategory.filter(
        (event) => userCategoryIds.includes(event.category),
      );
      if (userEvents.length > 0) {
        eventsByUser[user.user_id] = userEvents;
      }
    });

    if (Object.keys(eventsByUser).length === 0) {
      console.log(
        `ℹ️ Aucun utilisateur éligible pour les événements d'aujourd'hui (users=${enabledUsers.length}, sans_categories=${usersWithoutCategories}, sans_tokens=${usersWithoutTokens})`,
      );
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur éligible",
        eventsCount: eventsWithCategory.length,
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
        const eventIds = userEvents.map((event) => event.id);
        const eventTitles = userEvents
          .slice(0, 3)
          .map((event) => event.title)
          .join(", ");
        const moreEvents = userEvents.length > 3 ? ` et ${userEvents.length - 3} autre(s)` : "";
        
        const title = "Événements du jour 📅";
        const body = userEvents.length === 1
          ? `${userEvents[0].title} a lieu aujourd'hui !`
          : `${userEvents.length} événement(s) prévu(s) aujourd'hui : ${eventTitles}${moreEvents}`;
        
        const categories = [...new Set(userEvents.map((event) => event.category))];

        const deliveryKey = `daily_events:${todayLabel}:${userId}`;
        const claim = await claimNotificationDelivery({
          userId,
          payload: {
            title,
            body,
            data: {
              type: "daily_events",
              date: todayLabel,
              event_ids: eventIds,
              events_count: userEvents.length,
              categories,
            },
          },
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
              categories,
              deliveryKey,
            });
          }
          continue;
        }

        const result = await sendNotificationToUser(userId, {
          title,
          body,
          data: {
            type: "daily_events",
            date: todayLabel,
            event_ids: eventIds,
            events_count: userEvents.length,
            categories,
          },
        }, {
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
            categories,
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
      message: `Notifications envoyées pour ${eventsWithCategory.length} événement(s)`,
      eventsCount: eventsWithCategory.length,
      usersEligible: Object.keys(eventsByUser).length,
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

