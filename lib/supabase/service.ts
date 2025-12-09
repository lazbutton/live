import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec service_role pour les opérations backend
 * ⚠️ À utiliser uniquement côté serveur, jamais côté client
 */
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Debug: logger les variables disponibles (sans exposer la clé complète)
  if (!supabaseUrl || !supabaseServiceKey) {
    const missing = [];
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    
    console.error("❌ Variables d'environnement manquantes:", missing.join(", "));
    console.error("💡 Astuce: Vérifiez que:");
    console.error("   1. La variable existe dans .env.local");
    console.error("   2. Le serveur de développement a été redémarré après l'ajout de la variable");
    console.error("   3. Le nom de la variable est exactement: SUPABASE_SERVICE_ROLE_KEY");
    console.error("   Voir docs/ENV_SETUP.md pour plus d'informations");
    
    throw new Error(
      `Variables d'environnement manquantes: ${missing.join(", ")}. ` +
      `Ajoutez-la dans .env.local et redémarrez le serveur (npm run dev). ` +
      `Voir docs/ENV_SETUP.md pour les instructions.`
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

