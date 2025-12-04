import { supabase } from "./supabase/client";

export async function checkIsAdmin(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  // Vérifier le rôle admin dans les métadonnées utilisateur
  const role = user.user_metadata?.role;
  return role === "admin";
}

export async function requireAdmin() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    throw new Error("Accès refusé : permissions administrateur requises");
  }
}


