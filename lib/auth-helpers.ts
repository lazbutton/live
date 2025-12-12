import { checkIsAdmin, checkIsOrganizer, getUserOrganizers, OrganizerInfo } from "./auth";

export type UserType = "admin" | "organizer" | "admin_and_organizer" | "none";

/**
 * Détermine le type d'utilisateur (admin, organisateur, ou les deux)
 */
export async function getUserType(): Promise<UserType> {
  const [isAdmin, isOrganizer] = await Promise.all([
    checkIsAdmin(),
    checkIsOrganizer(),
  ]);

  if (isAdmin && isOrganizer) return "admin_and_organizer";
  if (isAdmin) return "admin";
  if (isOrganizer) return "organizer";
  return "none";
}

/**
 * Vérifie si l'utilisateur peut éditer un événement
 * @param eventId ID de l'événement
 * @returns true si l'utilisateur peut éditer
 */
export async function canEditEvent(eventId: string): Promise<boolean> {
  const isAdmin = await checkIsAdmin();
  if (isAdmin) return true;

  const { supabase } = await import("./supabase/client");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  try {
    // Récupérer les organisateurs de l'événement
    const { data: eventOrganizers } = await supabase
      .from("event_organizers")
      .select("organizer_id, location_id")
      .eq("event_id", eventId);

    if (!eventOrganizers || eventOrganizers.length === 0) return false;

    // Récupérer les organisateurs de l'utilisateur avec rôle owner ou editor
    const { data: userOrgs } = await supabase
      .from("user_organizers")
      .select("organizer_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "editor"]);

    if (!userOrgs || userOrgs.length === 0) return false;

    const userOrganizerIds = new Set(userOrgs.map((uo) => uo.organizer_id));

    // Vérifier si l'un des organisateurs de l'événement est géré par l'utilisateur
    // Prendre en compte à la fois les organisateurs classiques et les lieux-organisateurs
    return eventOrganizers.some((eo) => {
      // Vérifier les organisateurs classiques
      if (eo.organizer_id && userOrganizerIds.has(eo.organizer_id)) {
        return true;
      }
      // Vérifier les lieux-organisateurs (location_id dans event_organizers
      // qui correspond à un organizer_id dans user_organizers)
      if (eo.location_id && userOrganizerIds.has(eo.location_id)) {
        return true;
      }
      return false;
    });
  } catch (error) {
    console.error("Erreur lors de la vérification de permission:", error);
    return false;
  }
}

/**
 * Vérifie si l'utilisateur peut supprimer un événement
 * @param eventId ID de l'événement
 * @returns true si l'utilisateur peut supprimer
 */
export async function canDeleteEvent(eventId: string): Promise<boolean> {
  const isAdmin = await checkIsAdmin();
  if (isAdmin) return true;

  // Seuls les owners peuvent supprimer
  const { supabase } = await import("./supabase/client");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  try {
    // Vérifier que l'événement est en statut pending
    const { data: eventData } = await supabase
      .from("events")
      .select("status")
      .eq("id", eventId)
      .single();

    if (!eventData || eventData.status !== "pending") return false;

    // Récupérer les organisateurs de l'événement
    const { data: eventOrganizers } = await supabase
      .from("event_organizers")
      .select("organizer_id, location_id")
      .eq("event_id", eventId);

    if (!eventOrganizers || eventOrganizers.length === 0) return false;

    // Récupérer les organisateurs de l'utilisateur avec rôle owner uniquement
    const { data: userOrgs } = await supabase
      .from("user_organizers")
      .select("organizer_id")
      .eq("user_id", user.id)
      .eq("role", "owner");

    if (!userOrgs || userOrgs.length === 0) return false;

    const userOrganizerIds = new Set(userOrgs.map((uo) => uo.organizer_id));

    // Vérifier si l'un des organisateurs de l'événement est géré par l'utilisateur en tant qu'owner
    // Prendre en compte à la fois les organisateurs classiques et les lieux-organisateurs
    return eventOrganizers.some((eo) => {
      // Vérifier les organisateurs classiques
      if (eo.organizer_id && userOrganizerIds.has(eo.organizer_id)) {
        return true;
      }
      // Vérifier les lieux-organisateurs
      if (eo.location_id && userOrganizerIds.has(eo.location_id)) {
        return true;
      }
      return false;
    });
  } catch (error) {
    console.error("Erreur lors de la vérification de permission:", error);
    return false;
  }
}

/**
 * Vérifie si l'utilisateur peut modifier un organisateur
 * @param organizerId ID de l'organisateur
 * @returns true si l'utilisateur peut modifier
 */
export async function canEditOrganizer(organizerId: string): Promise<boolean> {
  const isAdmin = await checkIsAdmin();
  if (isAdmin) return true;

  const { checkOrganizerRole } = await import("./auth");
  return checkOrganizerRole(organizerId, ["owner"]);
}

/**
 * Vérifie si l'utilisateur est propriétaire (owner) d'un organisateur
 * @param organizerId ID de l'organisateur
 * @param supabaseClient Client Supabase optionnel (REQUIS pour les API routes, optionnel pour les composants client)
 * @returns true si l'utilisateur est owner
 */
export async function isOwnerOfOrganizer(organizerId: string, supabaseClient?: any): Promise<boolean> {
  const isAdmin = await checkIsAdmin(supabaseClient);
  if (isAdmin) return true;

  let supabase = supabaseClient;

  // Si pas de client passé, utiliser le client browser (pour les composants client)
  if (!supabase) {
    const { supabase: clientSupabase } = await import("./supabase/client");
    supabase = clientSupabase;
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { data } = await supabase
      .from("user_organizers")
      .select("role")
      .eq("organizer_id", organizerId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .single();

    return !!data;
  } catch (error) {
    console.error("Erreur lors de la vérification du propriétaire:", error);
    return false;
  }
}

/**
 * Récupère l'organisateur actif de l'utilisateur (le premier par défaut)
 * @param organizerId ID de l'organisateur spécifique (optionnel)
 * @returns Informations de l'organisateur ou null
 */
export async function getActiveOrganizer(
  organizerId?: string
): Promise<OrganizerInfo | null> {
  const organizers = await getUserOrganizers();
  if (organizers.length === 0) return null;

  if (organizerId) {
    return organizers.find((org) => org.organizer_id === organizerId) || null;
  }

  return organizers[0] || null;
}

