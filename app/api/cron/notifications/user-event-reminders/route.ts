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
 * GET /api/cron/notifications/user-event-reminders
 * 
 * Cron job pour envoyer des rappels sur les événements du lendemain
 * uniquement aux utilisateurs qui ont activé les notifications pour ces événements
 * Configuré pour s'exécuter tous les jours à 19h (schedule: "0 19 * * *")
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
    
    console.log("🔔 Démarrage du cron de rappels pour les événements activés par les utilisateurs");
    
    // Récupérer la date de demain (début et fin de journée)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowStart = tomorrow.toISOString();
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const tomorrowEndStr = tomorrowEnd.toISOString();
    
    // Récupérer les événements approuvés de demain avec leurs détails
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address)")
      .eq("status", "approved")
      .gte("date", tomorrowStart)
      .lt("date", tomorrowEndStr);
    
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
        notificationsSent: 0,
      });
    }
    
    console.log(`📋 ${events.length} événement(s) trouvé(s) pour demain`);
    
    // Pour chaque événement, récupérer les utilisateurs qui ont activé les notifications
    let totalSent = 0;
    let totalFailed = 0;
    const errors: string[] = [];
    const eventResults: Array<{ eventId: string; eventTitle: string; sent: number; failed: number }> = [];

    for (const event of events) {
      // Ignorer les événements sans catégorie
      if (!event.category) {
        console.log(`⚠️ Événement ${event.id} sans catégorie, ignoré`);
        continue;
      }

      // Récupérer les utilisateurs qui ont activé les notifications pour cet événement
      const { data: eventNotifications, error: notifError } = await supabase
        .from("event_notifications")
        .select("user_id")
        .eq("event_id", event.id)
        .eq("is_enabled", true);
      
      if (notifError) {
        console.error(`❌ Erreur lors de la récupération des notifications pour l'événement ${event.id}:`, notifError);
        errors.push(`Erreur pour l'événement ${event.title}: ${notifError.message}`);
        continue;
      }
      
      if (!eventNotifications || eventNotifications.length === 0) {
        console.log(`ℹ️ Aucun utilisateur n'a activé les notifications pour l'événement ${event.title}`);
        eventResults.push({
          eventId: event.id,
          eventTitle: event.title,
          sent: 0,
          failed: 0,
        });
        continue;
      }
      
      console.log(`📱 ${eventNotifications.length} utilisateur(s) avec notifications activées pour "${event.title}"`);
      
      let eventSent = 0;
      let eventFailed = 0;
      
      // Envoyer une notification à chaque utilisateur
      for (const notif of eventNotifications) {
        try {
          // Préparer le message personnalisé
          const location = Array.isArray(event.location) ? event.location[0] : event.location;
          const locationInfo = location?.name 
            ? ` à ${location.name}${location.address ? ` (${location.address})` : ""}`
            : "";
          
          const title = "Rappel : Événement demain 🔔";
          const body = `${event.title}${locationInfo} a lieu demain ! Ne le manquez pas.`;
          
          const result = await sendNotificationToUser(notif.user_id, {
            title,
            body,
            data: {
              type: "user_event_reminder",
              event_id: event.id,
              category: event.category,
              date: tomorrowStart.split("T")[0],
            },
          });
          
          if (result.success && result.sent > 0) {
            eventSent++;
            totalSent++;
          } else {
            eventFailed++;
            totalFailed++;
            if (result.errors.length > 0) {
              errors.push(`${event.title} - ${result.errors[0]}`);
            }
          }
        } catch (error: any) {
          console.error(`❌ Erreur lors de l'envoi à l'utilisateur ${notif.user_id}:`, error);
          eventFailed++;
          totalFailed++;
          errors.push(`${event.title} - Erreur: ${error.message}`);
        }
      }
      
      eventResults.push({
        eventId: event.id,
        eventTitle: event.title,
        sent: eventSent,
        failed: eventFailed,
      });
    }
    
    console.log(`✅ Rappels envoyés: ${totalSent} réussis, ${totalFailed} échecs`);
    
    return NextResponse.json({
      success: totalFailed === 0,
      message: `Rappels envoyés pour ${events.length} événement(s)`,
      eventsCount: events.length,
      notificationsSent: totalSent,
      notificationsFailed: totalFailed,
      errors: errors.length > 0 ? errors : undefined,
      eventResults,
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

