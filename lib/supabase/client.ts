"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase URL ou clé anonyme manquantes. Veuillez configurer les variables d'environnement."
  );
}

// Utiliser createBrowserClient de @supabase/ssr pour la synchronisation automatique des cookies
// Cela permet de synchroniser la session entre le client et le serveur
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);







