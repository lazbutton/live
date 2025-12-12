import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isOwnerOfOrganizer } from "@/lib/auth-helpers";

// GET : Récupérer les utilisateurs d'un organisateur
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Vérifier que l'utilisateur est admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id: organizerId } = await params;

    const role = user.user_metadata?.role;
    const isAdmin = role === "admin";

    // Vérifier que l'utilisateur est admin ou owner de l'organisateur
    if (!isAdmin) {
      const isOwner = await isOwnerOfOrganizer(organizerId, supabase);
      if (!isOwner) {
        return NextResponse.json({ error: "Accès refusé : vous devez être propriétaire de cet organisateur" }, { status: 403 });
      }
    }

    // Récupérer les utilisateurs associés à cet organisateur
    const { data, error } = await supabase
      .from("user_organizers")
      .select(
        `
        id,
        user_id,
        role,
        created_at,
        updated_at
      `
      )
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erreur lors de la récupération:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Récupérer les emails des utilisateurs
    const userIds = (data || []).map((u: any) => u.user_id);
    let usersWithEmails = data || [];

    if (userIds.length > 0) {
      try {
        const { data: emailsData, error: emailsError } = await supabase.rpc(
          "get_user_emails",
          { user_ids: userIds }
        );

        if (!emailsError && emailsData) {
          const emailMap = new Map(
            emailsData.map((e: any) => [e.user_id, e.email])
          );
          usersWithEmails = (data || []).map((u: any) => ({
            ...u,
            email: emailMap.get(u.user_id) || null,
          }));
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des emails:", error);
        // Continuer sans les emails si la fonction n'existe pas
      }
    }

    return NextResponse.json({ users: usersWithEmails });
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST : Ajouter un utilisateur à un organisateur
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Vérifier que l'utilisateur est admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id: organizerId } = await params;

    const role = user.user_metadata?.role;
    const isAdmin = role === "admin";

    // Vérifier que l'utilisateur est admin ou owner de l'organisateur
    if (!isAdmin) {
      const isOwner = await isOwnerOfOrganizer(organizerId, supabase);
      if (!isOwner) {
        return NextResponse.json({ error: "Accès refusé : vous devez être propriétaire de cet organisateur" }, { status: 403 });
      }
    }
    const body = await request.json();
    const { user_email, role: userRole } = body;

    if (!user_email || !userRole) {
      return NextResponse.json(
        { error: "user_email et role sont requis" },
        { status: 400 }
      );
    }

    // Pour lier un utilisateur, on peut soit utiliser l'email soit l'ID utilisateur
    // Si c'est un email, on doit récupérer l'ID depuis auth.users via une fonction SQL
    // Sinon, on assume que c'est déjà un UUID
    
    let userId: string;
    
    // Vérifier si c'est un email ou un UUID
    if (user_email.includes('@')) {
      // C'est un email, on doit créer une fonction SQL pour récupérer l'ID
      // Pour l'instant, on retourne une erreur et on demande l'ID utilisateur
      return NextResponse.json(
        { 
          error: "Veuillez utiliser l'ID utilisateur (UUID) plutôt que l'email. Vous pouvez le trouver dans Supabase Dashboard > Authentication > Users." 
        },
        { status: 400 }
      );
    } else {
      // C'est probablement un UUID
      userId = user_email;
    }

    // Vérifier si la liaison existe déjà
    const { data: existing } = await supabase
      .from("user_organizers")
      .select("id, role")
      .eq("user_id", userId)
      .eq("organizer_id", organizerId)
      .single();

    if (existing) {
      // Récupérer l'ancien rôle pour l'audit
      const oldRole = existing.role || null;

      // Mettre à jour le rôle
      const { data, error } = await supabase
        .from("user_organizers")
        .update({ role: userRole })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;

      // Enregistrer dans l'audit log
      const supabaseAdmin = createServiceClient();
      await supabaseAdmin
        .from("organizer_audit_log")
        .insert({
          organizer_id: organizerId,
          action: "role_changed",
          performed_by: user.id,
          target_user_id: userId,
          old_value: oldRole,
          new_value: userRole,
        });

      return NextResponse.json({ success: true, data });
    } else {
      // Créer la liaison
      const { data, error } = await supabase
        .from("user_organizers")
        .insert({
          user_id: userId,
          organizer_id: organizerId,
          role: userRole,
        })
        .select()
        .single();

      if (error) throw error;

      // Enregistrer dans l'audit log
      const supabaseAdmin = createServiceClient();
      await supabaseAdmin
        .from("organizer_audit_log")
        .insert({
          organizer_id: organizerId,
          action: "user_added",
          performed_by: user.id,
          target_user_id: userId,
          new_value: userRole,
        });

      return NextResponse.json({ success: true, data });
    }
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

// DELETE : Retirer un utilisateur d'un organisateur
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    // Vérifier que l'utilisateur est admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id: organizerId } = await params;

    const role = user.user_metadata?.role;
    const isAdmin = role === "admin";

    // Vérifier que l'utilisateur est admin ou owner de l'organisateur
    if (!isAdmin) {
      const isOwner = await isOwnerOfOrganizer(organizerId, supabase);
      if (!isOwner) {
        return NextResponse.json({ error: "Accès refusé : vous devez être propriétaire de cet organisateur" }, { status: 403 });
      }
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { error: "user_id est requis" },
        { status: 400 }
      );
    }

    // Récupérer l'utilisateur avant suppression pour l'audit
    const { data: userOrg } = await supabase
      .from("user_organizers")
      .select("role")
      .eq("user_id", userId)
      .eq("organizer_id", organizerId)
      .single();

    const { error } = await supabase
      .from("user_organizers")
      .delete()
      .eq("user_id", userId)
      .eq("organizer_id", organizerId);

    if (error) throw error;

    // Enregistrer dans l'audit log
    if (userOrg) {
      const supabaseAdmin = createServiceClient();
      await supabaseAdmin
        .from("organizer_audit_log")
        .insert({
          organizer_id: organizerId,
          action: "user_removed",
          performed_by: user.id,
          target_user_id: userId,
          old_value: userOrg.role,
        });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

