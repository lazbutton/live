import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendNotificationToAll } from "@/lib/notifications";

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
    
    // Récupérer les événements approuvés de la semaine à venir avec leurs catégories
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
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
    
    // Grouper les événements par jour
    const eventsByDay: Record<string, typeof events> = {};
    events.forEach(event => {
      const eventDate = new Date(event.date).toISOString().split("T")[0];
      if (!eventsByDay[eventDate]) {
        eventsByDay[eventDate] = [];
      }
      eventsByDay[eventDate].push(event);
    });
    
    // Préparer le message de notification
    const dayCount = Object.keys(eventsByDay).length;
    const title = `Résumé de la semaine 📅`;
    const body = events.length === 1
      ? `${events[0].title} cette semaine !`
      : `${events.length} événement(s) prévu(s) cette semaine sur ${dayCount} jour(s). Ne manquez rien !`;
    
    // Extraire les IDs des événements pour les données de la notification
    const eventIds = events.map(e => e.id);
    
    // Grouper les événements par catégorie
    const eventsByCategory: Record<string, typeof events> = {};
    events.forEach(event => {
      // Ignorer les événements sans catégorie
      if (!event.category) {
        return;
      }
      const category = event.category;
      if (!eventsByCategory[category]) {
        eventsByCategory[category] = [];
      }
      eventsByCategory[category].push(event);
    });

    // Si aucune catégorie n'a d'événements, ne rien envoyer
    if (Object.keys(eventsByCategory).length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé cette semaine");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie cette semaine",
        eventsCount: 0,
        categoriesCount: 0,
      });
    }

    const results: any[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Envoyer une notification par catégorie (résumé hebdomadaire)
    for (const [category, categoryEvents] of Object.entries(eventsByCategory)) {
      const categoryEventIds = categoryEvents.map(e => e.id);
      const categoryTitle = `Résumé de la semaine 📅`;
      const categoryBody = `${categoryEvents.length} événement(s) prévu(s) cette semaine dans cette catégorie. Ne manquez rien !`;

      const result = await sendNotificationToAll({
        title: categoryTitle,
        body: categoryBody,
        data: {
          type: "weekly_summary",
          category,
          start_date: todayStart.split("T")[0],
          end_date: nextWeekEnd.split("T")[0],
          event_ids: categoryEventIds,
          events_count: categoryEvents.length,
        },
      });

      results.push({ category, ...result });
      totalSent += result.sent;
      totalFailed += result.failed;
    }
    
    const result = {
      success: totalFailed === 0,
      sent: totalSent,
      failed: totalFailed,
      errors: results.flatMap(r => r.errors || []),
    };
    
    console.log(`✅ Résumé hebdomadaire envoyé: ${result.sent} réussis, ${result.failed} échecs`);
    
    return NextResponse.json({
      success: result.success,
      message: `Résumé hebdomadaire envoyé pour ${events.length} événement(s) répartis sur ${Object.keys(eventsByCategory).length} catégorie(s)`,
      eventsCount: events.length,
      categoriesCount: Object.keys(eventsByCategory).length,
      daysCount: dayCount,
      notificationsSent: result.sent,
      notificationsFailed: result.failed,
      errors: result.errors.length > 0 ? result.errors : undefined,
      categoryResults: results,
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

