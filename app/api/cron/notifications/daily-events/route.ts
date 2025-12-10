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
    
    // Récupérer les événements approuvés du jour
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, location:locations(name, address), event_organizers(organizer:organizers(name))")
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
    
    // Envoyer la notification à tous les utilisateurs ayant activé les notifications
    const result = await sendNotificationToAll({
      title,
      body,
      data: {
        type: "daily_events",
        date: todayStart.split("T")[0],
        event_ids: eventIds,
        events_count: events.length,
      },
    });
    
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

