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
 * GET /api/cron/notifications/daily-events
 * 
 * Cron job pour envoyer des notifications sur les événements du jour
 * Configuré pour s'exécuter tous les jours à 8h du matin (schedule: "0 8 * * *")
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
    
    // Récupérer la date d'aujourd'hui (début et fin de journée)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndStr = todayEnd.toISOString();
    
    // Récupérer les événements approuvés du jour avec leurs catégories
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
      .gte("date", todayStart)
      .lt("date", todayEndStr)
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
      console.log("ℹ️ Aucun événement aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement aujourd'hui",
        eventsCount: 0,
      });
    }
    
    console.log(`📋 ${events.length} événement(s) trouvé(s) pour aujourd'hui`);
    
    // Préparer le message de notification
    const eventTitles = events.slice(0, 5).map(e => e.title).join(", ");
    const moreEvents = events.length > 5 ? ` et ${events.length - 5} autre(s)` : "";
    
    const title = "Événements du jour 📅";
    const body = events.length === 1
      ? `${events[0].title} a lieu aujourd'hui !`
      : `${events.length} événement(s) prévu(s) aujourd'hui : ${eventTitles}${moreEvents}`;
    
    // Extraire les IDs des événements pour les données de la notification
    const eventIds = events.map(e => e.id);
    
    // Grouper les événements par catégorie pour envoyer des notifications personnalisées
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
      console.log("ℹ️ Aucun événement avec catégorie trouvé aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie aujourd'hui",
        eventsCount: 0,
        categoriesCount: 0,
      });
    }

    const results: any[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    // Envoyer une notification par catégorie pour respecter les préférences utilisateur
    for (const [category, categoryEvents] of Object.entries(eventsByCategory)) {
      const categoryEventIds = categoryEvents.map(e => e.id);
      const categoryTitles = categoryEvents.slice(0, 3).map(e => e.title).join(", ");
      const moreCategoryEvents = categoryEvents.length > 3 ? ` et ${categoryEvents.length - 3} autre(s)` : "";
      
      const categoryTitle = "Événements du jour 📅";
      const categoryBody = categoryEvents.length === 1
        ? `${categoryEvents[0].title} a lieu aujourd'hui !`
        : `${categoryEvents.length} événement(s) prévu(s) aujourd'hui : ${categoryTitles}${moreCategoryEvents}`;

      const result = await sendNotificationToAll({
        title: categoryTitle,
        body: categoryBody,
        data: {
          type: "daily_events",
          category,
          date: todayStart.split("T")[0],
          event_ids: categoryEventIds,
          events_count: categoryEvents.length,
        },
      });

      results.push({ category, ...result });
      totalSent += result.sent;
      totalFailed += result.failed;
    }
    
    // Résultat combiné
    const result = {
      success: totalFailed === 0,
      sent: totalSent,
      failed: totalFailed,
      errors: results.flatMap(r => r.errors || []),
    };
    
    console.log(`✅ Notifications envoyées: ${result.sent} réussies, ${result.failed} échecs`);
    
    return NextResponse.json({
      success: result.success,
      message: `Notifications envoyées pour ${events.length} événement(s)`,
      eventsCount: events.length,
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

