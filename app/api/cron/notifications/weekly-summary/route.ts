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
 * GET /api/cron/notifications/weekly-summary
 *
 * Cron job pour envoyer un résumé hebdomadaire des événements à venir
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

    const now = new Date();
    const weekDay = now.getDay() === 0 ? 7 : now.getDay();
    if (weekDay !== 1) {
      return NextResponse.json({
        success: true,
        message: "La passe hebdomadaire ne s'exécute que le lundi",
        notificationsSent: 0,
      });
    }

    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartIso = weekStart.toISOString();

    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    nextWeekStart.setHours(0, 0, 0, 0);
    const nextWeekStartIso = nextWeekStart.toISOString();

    const weekEnd = new Date(nextWeekStart.getTime() - 1);
    
    // Récupérer les événements approuvés de la semaine à venir avec leurs catégories (exclure les événements complets)
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
      .or("is_full.is.null,is_full.eq.false") // Exclure les événements complets
      .gte("date", weekStartIso)
      .lt("date", nextWeekStartIso)
      .order("date", { ascending: true })
      .limit(20); // Limiter à 20 événements pour ne pas surcharger la notification
    
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
    
    const relevantEvents = (events || []).filter((event: any) => {
      const start = new Date(event.date);
      const end = event.end_date ? new Date(event.end_date) : null;
      if (end && !Number.isNaN(end.getTime())) {
        return end >= now;
      }
      return !Number.isNaN(start.getTime()) && start >= now;
    });

    if (relevantEvents.length === 0) {
      console.log("ℹ️ Aucun événement cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun événement cette semaine",
        eventsCount: 0,
      });
    }
    
    console.log(`📋 ${relevantEvents.length} événement(s) pertinent(s) trouvé(s) pour cette semaine`);
    
    // Filtrer les événements avec catégorie
    const eventsWithCategory = relevantEvents.filter(e => e.category);
    
    if (eventsWithCategory.length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie cette semaine",
        eventsCount: 0,
        notificationsSent: 0,
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
      });
    }

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (globalSettings.notification_time) {
      const [configuredHour, configuredMinute] = globalSettings.notification_time.split(":").map(Number);
      const isInTimeWindow = currentHour === configuredHour && Math.abs(currentMinute - configuredMinute) <= 5;

      if (!isInTimeWindow) {
        console.log(
          `ℹ️ Pas dans la fenêtre d'envoi hebdomadaire. Heure actuelle: ${currentHour}:${currentMinute}, Heure configurée: ${configuredHour}:${configuredMinute}`,
        );
        return NextResponse.json({
          success: true,
          message: "Pas dans la fenêtre d'envoi hebdomadaire",
          eventsCount: eventsWithCategory.length,
          notificationsSent: 0,
        });
      }
    }

    // Récupérer tous les utilisateurs avec leurs préférences de catégories et fréquence "weekly"
    const { data: enabledUsers, error: prefsError } = await supabase
      .from("user_notification_preferences")
      .select("user_id, category_ids, frequency")
      .eq("is_enabled", true)
      .eq("frequency", "weekly"); // Seulement les utilisateurs avec fréquence "weekly"

    if (prefsError || !enabledUsers || enabledUsers.length === 0) {
      console.log("ℹ️ Aucun utilisateur n'a activé les notifications");
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur avec notifications activées",
        eventsCount: eventsWithCategory.length,
        notificationsSent: 0,
      });
    }

    // Grouper les événements par utilisateur selon leurs préférences
    const eventsByUser: Record<string, typeof eventsWithCategory> = {};
    
    enabledUsers.forEach((user: any) => {
      if (!Array.isArray(user.category_ids) || user.category_ids.length === 0) return;

      const userEvents = eventsWithCategory.filter(
        (e) => e.category && user.category_ids.includes(e.category),
      );
      if (userEvents.length > 0) {
        eventsByUser[user.user_id] = userEvents;
      }
    });

    if (Object.keys(eventsByUser).length === 0) {
      console.log("ℹ️ Aucun utilisateur éligible pour les événements de cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur éligible",
        eventsCount: eventsWithCategory.length,
        notificationsSent: 0,
      });
    }

    console.log(`📱 ${Object.keys(eventsByUser).length} utilisateur(s) éligible(s)`);

    // Grouper les événements par jour pour chaque utilisateur
    let totalSent = 0;
    let totalFailed = 0;
    let skippedAlreadySent = 0;
    const errors: string[] = [];

    // Envoyer une seule notification par utilisateur avec tous ses événements
    for (const [userId, userEvents] of Object.entries(eventsByUser)) {
      try {
        const eventIds = userEvents.map(e => e.id);
        
        // Grouper par jour pour le message
        const eventsByDay: Record<string, typeof userEvents> = {};
        userEvents.forEach(event => {
          const eventDate = new Date(event.date).toISOString().split("T")[0];
          if (!eventsByDay[eventDate]) {
            eventsByDay[eventDate] = [];
          }
          eventsByDay[eventDate].push(event);
        });
        
        const dayCount = Object.keys(eventsByDay).length;
        const categories = [...new Set(userEvents.map(e => e.category).filter(Boolean))];
        
        const title = "Résumé de la semaine 📅";
        const body = userEvents.length === 1
          ? `${userEvents[0].title} cette semaine !`
          : `${userEvents.length} événement(s) prévu(s) cette semaine sur ${dayCount} jour(s). Ne manquez rien !`;

        const { count: alreadySentCount, error: logCheckError } = await supabase
          .from("notification_logs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("title", title)
          .gte("sent_at", weekStartIso)
          .lt("sent_at", nextWeekStartIso);

        if (logCheckError) {
          console.warn(`⚠️ Impossible de vérifier l'anti-doublon weekly pour ${userId}:`, logCheckError);
        }

        if ((alreadySentCount ?? 0) > 0) {
          skippedAlreadySent++;
          continue;
        }

        const result = await sendNotificationToUser(userId, {
          title,
          body,
          data: {
            type: "weekly_summary",
            start_date: weekStartIso.split("T")[0],
            end_date: weekEnd.toISOString().split("T")[0],
            event_ids: eventIds,
            events_count: userEvents.length,
            days_count: dayCount,
            categories,
          },
        });

        if (result.success && result.sent > 0) {
          totalSent++;
        } else {
          totalFailed++;
          if (result.errors.length > 0) {
            errors.push(`Utilisateur ${userId}: ${result.errors[0]}`);
          }
        }
      } catch (error: any) {
        console.error(`❌ Erreur lors de l'envoi à l'utilisateur ${userId}:`, error);
        totalFailed++;
        errors.push(`Utilisateur ${userId}: ${error.message}`);
      }
    }
    
    const result = {
      success: totalFailed === 0,
      sent: totalSent,
      failed: totalFailed,
      errors: errors.length > 0 ? errors : [],
    };
    
    console.log(`✅ Résumé hebdomadaire envoyé: ${result.sent} réussis, ${result.failed} échecs`);
    
    console.log(`✅ Résumé hebdomadaire envoyé: ${result.sent} réussis, ${result.failed} échecs`);
    
    return NextResponse.json({
      success: result.success,
      message: `Résumé hebdomadaire envoyé pour ${eventsWithCategory.length} événement(s) à ${Object.keys(eventsByUser).length} utilisateur(s)`,
      eventsCount: eventsWithCategory.length,
      usersNotified: Object.keys(eventsByUser).length,
      notificationsSent: result.sent,
      notificationsFailed: result.failed,
      notificationsSkipped: skippedAlreadySent,
      errors: result.errors.length > 0 ? result.errors : undefined,
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

