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
    
    // Filtrer les événements avec catégorie
    const eventsWithCategory = events.filter(e => e.category);
    
    if (eventsWithCategory.length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie aujourd'hui",
        eventsCount: 0,
        notificationsSent: 0,
      });
    }

    // Récupérer tous les utilisateurs avec leurs préférences de catégories
    // Note: On doit utiliser createServiceClient pour bypass RLS
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
      console.log("ℹ️ Aucun utilisateur éligible pour les événements d'aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun utilisateur éligible",
        eventsCount: eventsWithCategory.length,
        notificationsSent: 0,
      });
    }

    console.log(`📱 ${Object.keys(eventsByUser).length} utilisateur(s) éligible(s)`);

    let totalSent = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    // Envoyer une seule notification par utilisateur avec tous ses événements
    for (const [userId, userEvents] of Object.entries(eventsByUser)) {
      try {
        const eventIds = userEvents.map(e => e.id);
        const eventTitles = userEvents.slice(0, 3).map(e => e.title).join(", ");
        const moreEvents = userEvents.length > 3 ? ` et ${userEvents.length - 3} autre(s)` : "";
        
        const title = "Événements du jour 📅";
        const body = userEvents.length === 1
          ? `${userEvents[0].title} a lieu aujourd'hui !`
          : `${userEvents.length} événement(s) prévu(s) aujourd'hui : ${eventTitles}${moreEvents}`;
        
        const categories = [...new Set(userEvents.map(e => e.category).filter(Boolean))];

        const result = await sendNotificationToUser(userId, {
          title,
          body,
          data: {
            type: "daily_events",
            date: todayStart.split("T")[0],
            event_ids: eventIds,
            events_count: userEvents.length,
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

