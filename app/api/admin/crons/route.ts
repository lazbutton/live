import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import fs from "fs";
import path from "path";

/**
 * GET /api/admin/crons
 * 
 * Récupère la liste des crons configurés dans vercel.json
 */
export async function GET(request: NextRequest) {
  // Vérifier que l'utilisateur est admin
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Non authentifié" },
      { status: 401 }
    );
  }

  const role = user.user_metadata?.role;
  if (role !== "admin") {
    return NextResponse.json(
      { error: "Accès non autorisé" },
      { status: 403 }
    );
  }

  try {
    // Lire le fichier vercel.json
    const vercelJsonPath = path.join(process.cwd(), "vercel.json");
    const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));

    const crons = vercelJson.crons || [];

    // Enrichir avec des informations supplémentaires
    const cronsWithInfo = crons.map((cron: any) => {
      // Parser le schedule pour comprendre quand il s'exécute
      const scheduleParts = cron.schedule.split(" ");
      const [minute, hour, dayOfMonth, month, dayOfWeek] = scheduleParts;

      let scheduleDescription = "";
      
      if (minute !== "*" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
        // Format: minute hour * * *
        scheduleDescription = `Tous les jours à ${hour}:${minute.padStart(2, "0")}`;
      } else if (minute !== "*" && hour !== "*" && dayOfMonth === "*" && month === "*" && dayOfWeek !== "*") {
        // Format: minute hour * * dayOfWeek
        const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
        scheduleDescription = `Tous les ${days[parseInt(dayOfWeek)]}s à ${hour}:${minute.padStart(2, "0")}`;
      } else if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
        scheduleDescription = "Toutes les heures";
      } else {
        scheduleDescription = `Schedule: ${cron.schedule}`;
      }

      return {
        ...cron,
        scheduleDescription,
        name: getCronName(cron.path),
        description: getCronDescription(cron.path),
      };
    });

    return NextResponse.json({
      success: true,
      crons: cronsWithInfo,
    });
  } catch (error: any) {
    console.error("❌ Erreur lors de la lecture des crons:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur lors de la lecture des crons",
      },
      { status: 500 }
    );
  }
}

function getCronName(path: string): string {
  const names: Record<string, string> = {
    "/api/cron/scrape-events": "Scraping des événements",
    "/api/cron/cleanup": "Nettoyage de la base de données",
    "/api/cron/notifications/daily-events": "Notifications quotidiennes",
    "/api/cron/notifications/upcoming-reminders": "Rappels événements à venir",
    "/api/cron/notifications/weekly-summary": "Résumé hebdomadaire",
  "/api/cron/notifications/user-event-reminders": "Rappels événements utilisateurs",
  };
  return names[path] || path;
}

function getCronDescription(path: string): string {
  const descriptions: Record<string, string> = {
    "/api/cron/scrape-events": "Scrape automatiquement les événements des organisateurs configurés",
    "/api/cron/cleanup": "Nettoie les données anciennes (événements passés, logs, tokens invalides)",
    "/api/cron/notifications/daily-events": "Envoie des notifications sur les événements du jour",
    "/api/cron/notifications/upcoming-reminders": "Envoie des rappels pour les événements du lendemain",
    "/api/cron/notifications/weekly-summary": "Envoie un résumé des événements de la semaine",
    "/api/cron/notifications/user-event-reminders": "Envoie des rappels pour les événements du lendemain uniquement aux utilisateurs qui ont activé les notifications",
  };
  return descriptions[path] || "";
}

