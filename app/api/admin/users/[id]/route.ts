import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

// DELETE : Supprimer un utilisateur
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Extraire l'ID depuis params (Next.js 15+)
    const { id } = await params;
    
    // Vérifier l'authentification de l'admin
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = user.user_metadata?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Empêcher la suppression de soi-même
    if (user.id === id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    // Utiliser le service role key pour supprimer l'utilisateur
    const supabaseAdmin = createServiceClient();

    // Vérifier que l'utilisateur existe et récupérer son email pour le message
    const { data: userToDelete, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(id);

    if (getUserError || !userToDelete.user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    // Supprimer l'utilisateur
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteError) {
      console.error("Erreur lors de la suppression de l'utilisateur:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Erreur lors de la suppression de l'utilisateur" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Utilisateur ${userToDelete.user.email} supprimé avec succès`,
    });
  } catch (error: any) {
    console.error("Erreur API /api/admin/users/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

