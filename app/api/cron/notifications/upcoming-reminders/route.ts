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
 * GET /api/cron/notifications/upcoming-reminders
 * 
 * Cron job pour envoyer des rappels sur les événements à venir (demain)
 * Configuré pour s'exécuter tous les jours à 18h (schedule: "0 18 * * *")
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
    
    console.log("🔔 Démarrage du cron de rappels pour les événements à venir");
    
    // Récupérer la date de demain (début et fin de journée)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowStart = tomorrow.toISOString();
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const tomorrowEndStr = tomorrowEnd.toISOString();
    
    // Récupérer les événements approuvés de demain avec leurs catégories
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
      .gte("date", tomorrowStart)
      .lt("date", tomorrowEndStr)
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
    
    if (!events || events.length === 0) {
      console.log("ℹ️ Aucun événement demain");
      return NextResponse.json({
        success: true,
        message: "Aucun événement demain",
        eventsCount: 0,
      });
    }
    
    console.log(`📋 ${events.length} événement(s) trouvé(s) pour demain`);
    
    // Préparer le message de notification
    const eventTitles = events.slice(0, 3).map(e => e.title).join(", ");
    const moreEvents = events.length > 3 ? ` et ${events.length - 3} autre(s)` : "";
    
    const title = "Événements demain 🔔";
    const body = events.length === 1
      ? `N'oubliez pas : ${events[0].title} demain !`
      : `${events.length} événement(s) prévu(s) demain : ${eventTitles}${moreEvents}`;
    
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
      console.log("ℹ️ Aucun événement avec catégorie trouvé demain");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie demain",
        eventsCount: 0,
        categoriesCount: 0,
      });
    }

    const results: any[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Envoyer une notification par catégorie
    for (const [category, categoryEvents] of Object.entries(eventsByCategory)) {
      const categoryEventIds = categoryEvents.map(e => e.id);
      const categoryTitles = categoryEvents.slice(0, 2).map(e => e.title).join(", ");
      const moreCategoryEvents = categoryEvents.length > 2 ? ` et ${categoryEvents.length - 2} autre(s)` : "";
      
      const categoryTitle = "Événements demain 🔔";
      const categoryBody = categoryEvents.length === 1
        ? `N'oubliez pas : ${categoryEvents[0].title} demain !`
        : `${categoryEvents.length} événement(s) prévu(s) demain : ${categoryTitles}${moreCategoryEvents}`;

      const result = await sendNotificationToAll({
        title: categoryTitle,
        body: categoryBody,
        data: {
          type: "upcoming_reminder",
          category,
          date: tomorrowStart.split("T")[0],
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
    
    console.log(`✅ Rappels envoyés: ${result.sent} réussis, ${result.failed} échecs`);
    
    return NextResponse.json({
      success: result.success,
      message: `Rappels envoyés pour ${events.length} événement(s) répartis sur ${Object.keys(eventsByCategory).length} catégorie(s)`,
      eventsCount: events.length,
      categoriesCount: Object.keys(eventsByCategory).length,
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

