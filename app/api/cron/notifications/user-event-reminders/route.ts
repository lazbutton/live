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
    
    // Récupérer la date de demain (jour calendaire suivant, pas "dans 24h")
    // Exemple: si aujourd'hui est le 15/01 à 19h, on veut les événements du 16/01 (de 00h00 à 23h59)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // Ajouter 1 jour calendaire
    tomorrow.setHours(0, 0, 0, 0); // Début du jour suivant (00:00:00)
    const tomorrowStart = tomorrow.toISOString();
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999); // Fin du jour suivant (23:59:59.999)
    const tomorrowEndStr = tomorrowEnd.toISOString();
    
    console.log(`📅 Recherche des événements du ${tomorrow.toLocaleDateString("fr-FR")} (${tomorrowStart} -> ${tomorrowEndStr})`);
    
    // Récupérer les événements approuvés de demain avec leurs détails
    // Utilisation de gte (>=) et lt (<) pour récupérer tous les événements du jour calendaire suivant
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address)")
      .eq("status", "approved")
      .gte("date", tomorrowStart)  // date >= début du jour suivant
      .lt("date", tomorrowEndStr);  // date < fin du jour suivant
    
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
    
    // Filtrer les événements avec catégorie
    const eventsWithCategory = events.filter(e => e.category);
    
    if (eventsWithCategory.length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé demain");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie demain",
        eventsCount: 0,
        notificationsSent: 0,
      });
    }

    // Récupérer toutes les notifications activées pour les événements de demain
    const eventIds = eventsWithCategory.map(e => e.id);
    const { data: allNotifications, error: notifError } = await supabase
      .from("event_notifications")
      .select("user_id, event_id")
      .in("event_id", eventIds)
      .eq("is_enabled", true);
    
    if (notifError) {
      console.error("❌ Erreur lors de la récupération des notifications:", notifError);
      return NextResponse.json(
        { 
          success: false, 
          error: notifError.message 
        },
        { status: 500 }
      );
    }
    
    if (!allNotifications || allNotifications.length === 0) {
      console.log("ℹ️ Aucun utilisateur n'a activé les notifications pour les événements de demain");
      return NextResponse.json({
        success: true,
        message: "Aucune notification activée",
        eventsCount: eventsWithCategory.length,
        notificationsSent: 0,
      });
    }
    
    // Grouper les événements par utilisateur
    const eventsByUser: Record<string, typeof eventsWithCategory> = {};
    allNotifications.forEach(notif => {
      const event = eventsWithCategory.find(e => e.id === notif.event_id);
      if (event) {
        if (!eventsByUser[notif.user_id]) {
          eventsByUser[notif.user_id] = [];
        }
        eventsByUser[notif.user_id].push(event);
      }
    });
    
    console.log(`📱 ${Object.keys(eventsByUser).length} utilisateur(s) avec notifications activées`);
    
    let totalSent = 0;
    let totalFailed = 0;
    const errors: string[] = [];
    
    // Envoyer une seule notification par utilisateur avec tous ses événements
    for (const [userId, userEvents] of Object.entries(eventsByUser)) {
      try {
        // Préparer le message groupé
        const eventTitles = userEvents.slice(0, 3).map(e => e.title).join(", ");
        const moreEvents = userEvents.length > 3 ? ` et ${userEvents.length - 3} autre(s)` : "";
        
        const title = "Rappels : Événements demain 🔔";
        const body = userEvents.length === 1
          ? `${userEvents[0].title} a lieu demain ! Ne le manquez pas.`
          : `${userEvents.length} événement(s) prévu(s) demain : ${eventTitles}${moreEvents}`;
        
        const eventIds = userEvents.map(e => e.id);
        const categories = [...new Set(userEvents.map(e => e.category).filter(Boolean))];
        
        const result = await sendNotificationToUser(userId, {
          title,
          body,
          data: {
            type: "user_event_reminder",
            event_ids: eventIds,
            events_count: userEvents.length,
            categories,
            date: tomorrowStart.split("T")[0],
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
    
    console.log(`✅ Rappels envoyés: ${totalSent} réussis, ${totalFailed} échecs`);
    
    return NextResponse.json({
      success: totalFailed === 0,
      message: `Rappels envoyés pour ${eventsWithCategory.length} événement(s) à ${Object.keys(eventsByUser).length} utilisateur(s)`,
      eventsCount: eventsWithCategory.length,
      usersNotified: Object.keys(eventsByUser).length,
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

