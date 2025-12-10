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
    
    // Récupérer les événements approuvés de demain
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, location:locations(name, address), event_organizers(organizer:organizers(name))")
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
    
    // Envoyer la notification à tous les utilisateurs ayant activé les notifications
    const result = await sendNotificationToAll({
      title,
      body,
      data: {
        type: "upcoming_reminder",
        date: tomorrowStart.split("T")[0],
        event_ids: eventIds,
        events_count: events.length,
      },
    });
    
    console.log(`✅ Rappels envoyés: ${result.sent} réussis, ${result.failed} échecs`);
    
    return NextResponse.json({
      success: result.success,
      message: `Rappels envoyés pour ${events.length} événement(s)`,
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

