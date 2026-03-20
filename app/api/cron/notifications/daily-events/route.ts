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
 * Cron job pour envoyer la passe quotidienne des notifications par categories suivies.
 * L'heure effective reste pilotee par `notification_settings.notification_time`.
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
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndStr = todayEnd.toISOString();
    
    // Récupérer les événements approuvés du jour avec leurs catégories (exclure les événements complets)
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, title, date, end_date, category, location:locations(name, address), event_organizers(organizer:organizers(name))")
      .eq("status", "approved")
      .or("is_full.is.null,is_full.eq.false") // Exclure les événements complets
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
    
    const relevantEvents = (events || []).filter((event: any) => {
      const start = new Date(event.date);
      const end = event.end_date ? new Date(event.end_date) : null;
      if (end && !Number.isNaN(end.getTime())) {
        return end >= now;
      }
      return !Number.isNaN(start.getTime()) && start >= now;
    });

    if (relevantEvents.length === 0) {
      console.log("ℹ️ Aucun événement aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement aujourd'hui",
        eventsCount: 0,
      });
    }
    
    console.log(`📋 ${relevantEvents.length} événement(s) pertinent(s) trouvé(s) pour aujourd'hui`);
    
    // Préparer le message de notification
    const eventTitles = relevantEvents.slice(0, 5).map(e => e.title).join(", ");
    const moreEvents = relevantEvents.length > 5 ? ` et ${relevantEvents.length - 5} autre(s)` : "";
    
    const title = "Événements du jour 📅";
    const body = relevantEvents.length === 1
      ? `${relevantEvents[0].title} a lieu aujourd'hui !`
      : `${relevantEvents.length} événement(s) prévu(s) aujourd'hui : ${eventTitles}${moreEvents}`;
    
    // Extraire les IDs des événements pour les données de la notification
    const eventIds = relevantEvents.map(e => e.id);
    
    // Filtrer les événements avec catégorie
    const eventsWithCategory = relevantEvents.filter(e => e.category);
    
    if (eventsWithCategory.length === 0) {
      console.log("ℹ️ Aucun événement avec catégorie trouvé aujourd'hui");
      return NextResponse.json({
        success: true,
        message: "Aucun événement avec catégorie aujourd'hui",
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

    // Vérifier si l'heure actuelle correspond à l'heure configurée (pour les utilisateurs "daily")
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    if (globalSettings.notification_time) {
      const [configuredHour, configuredMinute] = globalSettings.notification_time.split(":").map(Number);
      // Vérifier si on est dans la bonne fenêtre (à l'heure configurée, avec une marge de 5 minutes)
      const isInTimeWindow = currentHour === configuredHour && Math.abs(currentMinute - configuredMinute) <= 5;
      
      if (!isInTimeWindow) {
        console.log(`ℹ️ Pas dans la fenêtre d'envoi. Heure actuelle: ${currentHour}:${currentMinute}, Heure configurée: ${configuredHour}:${configuredMinute}`);
        return NextResponse.json({
          success: true,
          message: "Pas dans la fenêtre d'envoi",
          eventsCount: eventsWithCategory.length,
          notificationsSent: 0,
        });
      }
    }

    // Récupérer tous les utilisateurs avec leurs préférences de catégories et fréquence
    // Note: On doit utiliser createServiceClient pour bypass RLS
    const { data: enabledUsers, error: prefsError } = await supabase
      .from("user_notification_preferences")
      .select("user_id, category_ids, frequency")
      .eq("is_enabled", true)
      .in("frequency", ["daily"]); // Seulement les utilisateurs avec fréquence "daily"

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
    let skippedAlreadySent = 0;
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

        const { count: alreadySentCount, error: logCheckError } = await supabase
          .from("notification_logs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("title", title)
          .gte("sent_at", todayStart)
          .lt("sent_at", todayEndStr);

        if (logCheckError) {
          console.warn(`⚠️ Impossible de vérifier l'anti-doublon daily pour ${userId}:`, logCheckError);
        }

        if ((alreadySentCount ?? 0) > 0) {
          skippedAlreadySent++;
          continue;
        }

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
      message: `Notifications envoyées pour ${eventsWithCategory.length} événement(s)`,
      eventsCount: eventsWithCategory.length,
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

