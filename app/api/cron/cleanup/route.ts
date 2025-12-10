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
 * GET /api/cron/cleanup
 * 
 * Cron job pour nettoyer la base de données
 * Configuré pour s'exécuter tous les jours à 3h du matin (schedule: "0 3 * * *")
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
    
    console.log("🧹 Démarrage du cron de nettoyage");
    
    const results: Record<string, number> = {};
    
    // 1. Supprimer les événements passés depuis plus de 30 jours
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .lt("date", thirtyDaysAgo.toISOString())
        .eq("status", "approved");
      
      if (eventsError) throw eventsError;
      
      results.eventsDeleted = deletedEvents || 0;
      console.log(`🗑️ ${results.eventsDeleted} événement(s) supprimé(s)`);
    } catch (error: any) {
      console.error("❌ Erreur lors de la suppression des événements:", error);
      results.eventsError = error.message;
    }
    
    // 2. Supprimer les logs de notifications anciens (plus de 90 jours)
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const { count: deletedLogs, error: logsError } = await supabase
        .from("notification_logs")
        .delete()
        .lt("sent_at", ninetyDaysAgo.toISOString());
      
      if (logsError) throw logsError;
      
      results.notificationLogsDeleted = deletedLogs || 0;
      console.log(`🗑️ ${results.notificationLogsDeleted} log(s) de notification(s) supprimé(s)`);
    } catch (error: any) {
      console.error("❌ Erreur lors de la suppression des logs:", error);
      results.logsError = error.message;
    }
    
    // 3. Supprimer les tokens de push invalides (tokens qui ont échoué plusieurs fois)
    // Note: Cette logique nécessiterait de suivre les échecs dans une table séparée
    // Pour l'instant, on peut simplement supprimer les tokens très anciens (> 1 an sans mise à jour)
    try {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const { count: deletedTokens, error: tokensError } = await supabase
        .from("user_push_tokens")
        .delete()
        .lt("updated_at", oneYearAgo.toISOString());
      
      if (tokensError) throw tokensError;
      
      results.tokensDeleted = deletedTokens || 0;
      console.log(`🗑️ ${results.tokensDeleted} token(s) supprimé(s)`);
    } catch (error: any) {
      console.error("❌ Erreur lors de la suppression des tokens:", error);
      results.tokensError = error.message;
    }
    
    console.log("✅ Nettoyage terminé");
    
    return NextResponse.json({
      success: true,
      message: "Nettoyage terminé",
      results,
    });
    
  } catch (error: any) {
    console.error("❌ Erreur lors de l'exécution du cron de nettoyage:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erreur inconnue",
      },
      { status: 500 }
    );
  }
}

