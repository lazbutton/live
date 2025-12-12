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
 * Configuré pour s'exécuter tous les dimanches à 10h (schedule: "0 10 * * 0")
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
    
    // Récupérer la date de début (aujourd'hui) et de fin (dans 7 jours)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);
    const nextWeekEnd = nextWeek.toISOString();
    
    // Récupérer les événements approuvés de la semaine à venir avec leurs catégories (exclure les événements complets)
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
      .or("is_full.is.null,is_full.eq.false") // Exclure les événements complets
      .gte("date", todayStart)
      .lt("date", nextWeekEnd)
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
    
    if (!events || events.length === 0) {
      console.log("ℹ️ Aucun événement cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun événement cette semaine",
        eventsCount: 0,
      });
    }
    
    console.log(`📋 ${events.length} événement(s) trouvé(s) pour cette semaine`);
    
    // Filtrer les événements avec catégorie
    const eventsWithCategory = events.filter(e => e.category);
    
    if (eventsWithCategory.length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie cette semaine",
        eventsCount: 0,
        notificationsSent: 0,
      });
    }

    // Récupérer tous les utilisateurs avec leurs préférences de catégories
    const { data: enabledUsers, error: prefsError } = await supabase
      .from("user_notification_preferences")
      .select("user_id, category_ids")
      .eq("is_enabled", true);

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
      // Si l'utilisateur n'a pas de préférences de catégories, il reçoit tous les événements
      if (!user.category_ids || user.category_ids.length === 0) {
        eventsByUser[user.user_id] = eventsWithCategory;
      } else {
        // Filtrer les événements selon les catégories préférées
        const userEvents = eventsWithCategory.filter(e => 
          e.category && user.category_ids.includes(e.category)
        );
        if (userEvents.length > 0) {
          eventsByUser[user.user_id] = userEvents;
        }
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

        const result = await sendNotificationToUser(userId, {
          title,
          body,
          data: {
            type: "weekly_summary",
            start_date: todayStart.split("T")[0],
            end_date: nextWeekEnd.split("T")[0],
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

