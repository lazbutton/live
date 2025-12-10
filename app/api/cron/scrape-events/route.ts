import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

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
 * GET /api/cron/scrape-events
 * 
 * Cron job pour scraper automatiquement les événements des organisateurs
 * Configuré pour s'exécuter toutes les heures (schedule: "0 * * * *")
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
    
    console.log("🔄 Démarrage du cron de scraping des événements");
    
    // Récupérer tous les organisateurs avec une configuration de scraping
    const { data: organizers, error: orgError } = await supabase
      .from("organizers")
      .select("id, name, scraping_config")
      .not("scraping_config", "is", null);
    
    if (orgError) {
      console.error("❌ Erreur lors de la récupération des organisateurs:", orgError);
      return NextResponse.json(
        { 
          success: false, 
          error: orgError.message 
        },
        { status: 500 }
      );
    }
    
    if (!organizers || organizers.length === 0) {
      console.log("ℹ️ Aucun organisateur avec configuration de scraping trouvé");
      return NextResponse.json({
        success: true,
        message: "Aucun organisateur à scraper",
        scraped: 0,
        errors: 0,
        total: 0,
      });
    }
    
    console.log(`📋 ${organizers.length} organisateur(s) à scraper`);
    
    let scraped = 0;
    let errors = 0;
    const errorDetails: string[] = [];
    
    // Scraper les événements pour chaque organisateur
    for (const organizer of organizers) {
      try {
        console.log(`📋 Scraping pour ${organizer.name} (${organizer.id})...`);
        
        // TODO: Implémenter votre logique de scraping ici
        // Par exemple, appeler l'endpoint /api/events/scrape avec l'ID de l'organisateur
        
        // Exemple d'appel interne à votre API de scraping :
        // const scrapeResponse = await fetch(
        //   `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/events/scrape`,
        //   {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ organizerId: organizer.id }),
        //   }
        // );
        
        scraped++;
      } catch (error: any) {
        console.error(`❌ Erreur lors du scraping pour ${organizer.name}:`, error);
        errors++;
        errorDetails.push(`${organizer.name}: ${error.message || "Erreur inconnue"}`);
      }
    }
    
    console.log(`✅ Cron terminé: ${scraped} réussis, ${errors} échecs`);
    
    return NextResponse.json({
      success: errors === 0,
      message: `Scraping terminé pour ${organizers.length} organisateurs`,
      scraped,
      errors,
      total: organizers.length,
      errorDetails: errors > 0 ? errorDetails : undefined,
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

