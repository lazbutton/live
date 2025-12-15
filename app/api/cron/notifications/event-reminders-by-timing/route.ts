import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendNotificationToUser } from "@/lib/notifications";

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
 * GET /api/cron/notifications/event-reminders-by-timing
 * 
 * Cron job pour envoyer des rappels d'événements selon le timing choisi par l'utilisateur
 * Ce cron doit être exécuté toutes les heures pour vérifier les rappels à envoyer
 * Configuré pour s'exécuter toutes les heures (schedule: "0 * * * *")
 * 
 * Logique:
 * - Pour "1_day": vérifie les événements qui ont lieu dans 24h ± 1h
 * - Pour "3_hours": vérifie les événements qui ont lieu dans 3h ± 30min
 * - Pour "1_hour": vérifie les événements qui ont lieu dans 1h ± 15min
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
    
    console.log("🔔 Démarrage du cron de rappels d'événements par timing");
    
    const now = new Date();
    
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
        notificationsSent: 0,
      });
    }

    let totalSent = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    // Traiter chaque type de timing
    const timings = [
      { type: "1_day", windowStart: 23 * 60 * 60 * 1000, windowEnd: 25 * 60 * 60 * 1000, name: "1 jour" },
      { type: "3_hours", windowStart: 2.5 * 60 * 60 * 1000, windowEnd: 3.5 * 60 * 60 * 1000, name: "3 heures" },
      { type: "1_hour", windowStart: 45 * 60 * 1000, windowEnd: 75 * 60 * 1000, name: "1 heure" },
    ];

    for (const timing of timings) {
      // Calculer la fenêtre de temps pour ce timing
      const windowStartTime = new Date(now.getTime() + timing.windowStart);
      const windowEndTime = new Date(now.getTime() + timing.windowEnd);

      console.log(`📅 Vérification des rappels "${timing.name}" (événements entre ${windowStartTime.toISOString()} et ${windowEndTime.toISOString()})`);

      // Récupérer les notifications activées avec ce timing dont la date programmée est dans la fenêtre
      const { data: notifications, error: notifError } = await supabase
        .from("event_notifications")
        .select(`
          id,
          event_id,
          user_id,
          reminder_timing,
          event:events!inner(
            id,
            title,
            date,
            category,
            location:locations(name, address)
          )
        `)
        .eq("is_enabled", true)
        .eq("reminder_timing", timing.type)
        .gte("notification_scheduled_at", windowStartTime.toISOString())
        .lte("notification_scheduled_at", windowEndTime.toISOString());

      if (notifError) {
        console.error(`❌ Erreur lors de la récupération des notifications (${timing.type}):`, notifError);
        errors.push(`Erreur ${timing.type}: ${notifError.message}`);
        continue;
      }

      if (!notifications || notifications.length === 0) {
        console.log(`ℹ️ Aucune notification "${timing.name}" à envoyer`);
        continue;
      }

      console.log(`📋 ${notifications.length} notification(s) "${timing.name}" à traiter`);

      // Filtrer les notifications pour les événements approuvés et non complets
      const validNotifications = notifications.filter((n: any) => {
        const event = n.event;
        return event && event.date;
      });

      if (validNotifications.length === 0) {
        console.log(`ℹ️ Aucune notification "${timing.name}" valide (événements approuvés)`);
        continue;
      }

      // Grouper par utilisateur
      const notificationsByUser: Record<string, typeof validNotifications> = {};
      validNotifications.forEach((notif: any) => {
        if (!notificationsByUser[notif.user_id]) {
          notificationsByUser[notif.user_id] = [];
        }
        notificationsByUser[notif.user_id].push(notif);
      });

      // Envoyer une notification par utilisateur
      for (const [userId, userNotifications] of Object.entries(notificationsByUser)) {
        try {
          const events = userNotifications.map((n: any) => n.event);
          const eventIds = events.map((e: any) => e.id);

          // Préparer le message
          let title: string;
          let body: string;

          if (events.length === 1) {
            const event = events[0];
            const locationName = event.location?.name || event.location?.address || "le lieu";
            
            switch (timing.type) {
              case "1_day":
                title = `Rappel : ${event.title}`;
                body = `L'événement a lieu demain à ${locationName}`;
                break;
              case "3_hours":
                title = `Rappel : ${event.title}`;
                body = `L'événement a lieu dans 3h à ${locationName}`;
                break;
              case "1_hour":
                title = `Rappel : ${event.title}`;
                body = `L'événement a lieu dans 1h à ${locationName}`;
                break;
              default:
                title = `Rappel : ${event.title}`;
                body = `L'événement a lieu bientôt`;
            }
          } else {
            switch (timing.type) {
              case "1_day":
                title = "Rappels : Événements demain";
                body = `${events.length} événement(s) ont lieu demain. Ne les manquez pas !`;
                break;
              case "3_hours":
                title = "Rappels : Événements dans 3h";
                body = `${events.length} événement(s) ont lieu dans 3h. Ne les manquez pas !`;
                break;
              case "1_hour":
                title = "Rappels : Événements dans 1h";
                body = `${events.length} événement(s) ont lieu dans 1h. Ne les manquez pas !`;
                break;
              default:
                title = "Rappels : Événements à venir";
                body = `${events.length} événement(s) ont lieu bientôt. Ne les manquez pas !`;
            }
          }

          const result = await sendNotificationToUser(userId, {
            title,
            body,
            data: {
              type: "event_reminder",
              reminder_timing: timing.type,
              event_ids: eventIds,
              events_count: events.length,
            },
          });

          if (result.success && result.sent > 0) {
            totalSent++;
            // Désactiver la notification pour éviter de la renvoyer
            await supabase
              .from("event_notifications")
              .update({ is_enabled: false })
              .in(
                "id",
                userNotifications.map((n: any) => n.id)
              );
          } else {
            totalFailed++;
            if (result.errors.length > 0) {
              errors.push(`Utilisateur ${userId} (${timing.type}): ${result.errors[0]}`);
            }
          }
        } catch (error: any) {
          console.error(`❌ Erreur lors de l'envoi à l'utilisateur ${userId}:`, error);
          totalFailed++;
          errors.push(`Utilisateur ${userId} (${timing.type}): ${error.message}`);
        }
      }
    }

    console.log(`✅ Rappels envoyés: ${totalSent} réussis, ${totalFailed} échecs`);

    return NextResponse.json({
      success: totalFailed === 0,
      message: `Rappels envoyés: ${totalSent} réussis, ${totalFailed} échecs`,
      notificationsSent: totalSent,
      notificationsFailed: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
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


