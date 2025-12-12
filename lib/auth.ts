import { supabase } from "./supabase/client";

export interface OrganizerInfo {
  id: string;
  organizer_id: string;
  role: "owner" | "editor" | "viewer";
  organizer?: {
    id: string;
    name: string;
    logo_url: string | null;
  };
}

export async function checkIsAdmin(supabaseClient?: any): Promise<boolean> {
  // Utiliser le client passé en paramètre ou le client browser par défaut
  const client = supabaseClient || supabase;
  
  const {
    data: { user },
  } = await client.auth.getUser();

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

/**
 * Vérifie si l'utilisateur connecté est organisateur
 * @param organizerId ID de l'organisateur spécifique (optionnel)
 * @returns true si l'utilisateur est organisateur
 */
export async function checkIsOrganizer(organizerId?: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  try {
    let query = supabase
      .from("user_organizers")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (organizerId) {
      query = query.eq("organizer_id", organizerId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Erreur lors de la vérification organisateur:", error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error("Erreur lors de la vérification organisateur:", error);
    return false;
  }
}

/**
 * Récupère la liste des organisateurs de l'utilisateur connecté
 * @returns Liste des organisateurs avec leurs informations
 */
export async function getUserOrganizers(): Promise<OrganizerInfo[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  try {
    // Récupérer les associations user_organizers
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from("user_organizers")
      .select("id, organizer_id, role, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (userOrgsError) {
      console.error("Erreur lors de la récupération des user_organizers:", userOrgsError);
      return [];
    }

    if (!userOrgs || userOrgs.length === 0) return [];

    // Récupérer tous les organizer_id
    const organizerIds = userOrgs.map((uo) => uo.organizer_id);

    // Récupérer les organisateurs classiques et les lieux-organisateurs séparément
    const [organizersResult, locationsResult] = await Promise.all([
      supabase
        .from("organizers")
        .select("id, name, logo_url")
        .in("id", organizerIds),
      supabase
        .from("locations")
        .select("id, name")
        .in("id", organizerIds)
        .eq("is_organizer", true),
    ]);

    // Créer des maps pour un accès rapide
    const organizersMap = new Map(
      (organizersResult.data || []).map((org) => [org.id, org])
    );
    const locationsMap = new Map(
      (locationsResult.data || []).map((loc) => [loc.id, loc])
    );

    // Construire le résultat en combinant les données
    return userOrgs.map((uo) => {
      // Chercher d'abord dans les organisateurs classiques
      const organizer = organizersMap.get(uo.organizer_id);
      if (organizer) {
        return {
          id: uo.id,
          organizer_id: uo.organizer_id,
          role: uo.role as "owner" | "editor" | "viewer",
          organizer: {
            id: organizer.id,
            name: organizer.name,
            logo_url: organizer.logo_url,
          },
        };
      }

      // Sinon, chercher dans les lieux-organisateurs
      const location = locationsMap.get(uo.organizer_id);
      if (location) {
        return {
          id: uo.id,
          organizer_id: uo.organizer_id,
          role: uo.role as "owner" | "editor" | "viewer",
          organizer: {
            id: location.id,
            name: location.name,
            logo_url: null, // Les lieux n'ont pas de logo_url dans la structure actuelle
          },
        };
      }

      // Si ni organizer ni location trouvé, retourner quand même l'association
      // (cas où l'organisateur aurait été supprimé mais l'association existe encore)
      return {
        id: uo.id,
        organizer_id: uo.organizer_id,
        role: uo.role as "owner" | "editor" | "viewer",
        organizer: undefined,
      };
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des organisateurs:", error);
    return [];
  }
}

/**
 * Vérifie si l'utilisateur a un rôle spécifique pour un organisateur
 * @param organizerId ID de l'organisateur
 * @param allowedRoles Rôles autorisés
 * @returns true si l'utilisateur a un des rôles autorisés
 */
export async function checkOrganizerRole(
  organizerId: string,
  allowedRoles: ("owner" | "editor" | "viewer")[]
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  try {
    const { data, error } = await supabase
      .from("user_organizers")
      .select("role")
      .eq("user_id", user.id)
      .eq("organizer_id", organizerId)
      .single();

    if (error || !data) return false;

    return allowedRoles.includes(data.role as "owner" | "editor" | "viewer");
  } catch (error) {
    console.error("Erreur lors de la vérification du rôle:", error);
    return false;
  }
}

/**
 * Vérifie les permissions organisateur et lance une erreur si non autorisé
 */
export async function requireOrganizer(organizerId?: string) {
  const isOrganizer = await checkIsOrganizer(organizerId);
  if (!isOrganizer) {
    throw new Error(
      "Accès refusé : permissions organisateur requises" +
        (organizerId ? ` pour l'organisateur ${organizerId}` : "")
    );
  }
}







