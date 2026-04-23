import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isOwnerOfOrganizer } from "@/lib/auth-helpers";
import { buildInvitationEmail } from "@/lib/email/outlive-invitation-email";

// POST : Envoyer une invitation par email
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Extraire les params en premier
    const { id: organizerId } = await params;
    
    const supabase = await createClient();
    
    // Vérifier que l'utilisateur est admin ou owner
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    
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
    const { email, role: userRole } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Email invalide" },
        { status: 400 }
      );
    }

    if (!userRole || !["owner", "editor", "viewer"].includes(userRole)) {
      return NextResponse.json(
        { error: "Rôle invalide" },
        { status: 400 }
      );
    }

    // Vérifier que l'organisateur existe (organisateur classique ou lieu-organisateur)
    const { data: organizer, error: orgError } = await supabase
      .from("organizers")
      .select("id, name")
      .eq("id", organizerId)
      .single();

    // Si pas trouvé dans organizers, chercher dans locations (lieu-organisateur)
    let organizerData = organizer;
    if (orgError || !organizer) {
      const { data: location, error: locError } = await supabase
        .from("locations")
        .select("id, name")
        .eq("id", organizerId)
        .eq("is_organizer", true)
        .single();

      if (locError || !location) {
        return NextResponse.json(
          { error: "Organisateur non trouvé" },
          { status: 404 }
        );
      }

      organizerData = location;
    }

    if (!organizerData) {
      return NextResponse.json(
        { error: "Organisateur non trouvé" },
        { status: 404 }
      );
    }

    // Vérifier si une invitation existe déjà
    const { data: existingInvitation } = await supabase
      .from("organizer_invitations")
      .select("id, accepted_at, expires_at")
      .eq("organizer_id", organizerId)
      .eq("email", email.toLowerCase())
      .single();

    if (existingInvitation) {
      // Si l'invitation n'est pas acceptée et n'est pas expirée, renvoyer le même token
      if (!existingInvitation.accepted_at && new Date(existingInvitation.expires_at) > new Date()) {
        const { data: invitation, error: inviteFetchError } = await supabase
          .from("organizer_invitations")
          .select("token")
          .eq("id", existingInvitation.id)
          .single();

        if (inviteFetchError || !invitation) {
          console.error("Erreur lors de la récupération de l'invitation:", inviteFetchError);
          // Continuer pour créer une nouvelle invitation
        } else {
          // Envoyer l'email
          await sendInvitationEmail(
            email,
            invitation.token,
            organizerData.name,
            userRole,
          );
          
          return NextResponse.json({
            success: true,
            message: "Invitation renvoyée",
            token: invitation.token,
          });
        }
      }
    }

    // Créer une nouvelle invitation
    const { data: invitation, error: inviteError } = await supabase
      .from("organizer_invitations")
      .insert({
        organizer_id: organizerId,
        email: email.toLowerCase(),
        role: userRole,
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 jours
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Erreur lors de la création de l'invitation:", inviteError);
      return NextResponse.json(
        { error: "Erreur lors de la création de l'invitation" },
        { status: 500 }
      );
    }

    // Envoyer l'email d'invitation
    await sendInvitationEmail(
      email,
      invitation.token,
      organizerData.name,
      userRole,
    );

    // Enregistrer dans l'audit log
    const supabaseAdmin = createServiceClient();
    await supabaseAdmin
      .from("organizer_audit_log")
      .insert({
        organizer_id: organizerId,
        action: "invitation_sent",
        performed_by: user.id,
        target_user_email: email.toLowerCase(),
        new_value: userRole,
        metadata: { invitation_id: invitation.id },
      });

    return NextResponse.json({
      success: true,
      message: "Invitation envoyée",
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expires_at: invitation.expires_at,
      },
    });
  } catch (error: any) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: error.message || "Erreur serveur" },
      { status: 500 }
    );
  }
}

// Fonction pour envoyer l'email d'invitation
async function sendInvitationEmail(
  email: string,
  token: string,
  organizerName: string,
  role: "owner" | "editor" | "viewer",
) {
  // Construire l'URL d'invitation
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  
  if (!baseUrl) {
    // En production sur Vercel
    if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else {
      // Développement local
      baseUrl = "http://localhost:3000";
    }
  }
  
  const invitationUrl = `${baseUrl}/organizer/invite/accept?token=${token}`;

  const emailContent = buildInvitationEmail({
    baseUrl,
    invitationUrl,
    organizerName,
    recipientEmail: email,
    role,
  });

  // Essayer d'envoyer l'email avec Resend si la clé API est configurée
  if (process.env.RESEND_API_KEY) {
    try {
      // Import dynamique avec gestion d'erreur
      const resendModule = await import("resend").catch(() => null);
      
      if (resendModule) {
        const { Resend } = resendModule;
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "noreply@votredomaine.com",
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
        
        // Logger en développement pour confirmation
        if (process.env.NODE_ENV === "development") {
          console.log("\n" + "=".repeat(60));
          console.log("📧 EMAIL ENVOYÉ VIA RESEND");
          console.log("=".repeat(60));
          console.log(`To: ${email}`);
          console.log(`Subject: ${emailContent.subject}`);
          console.log(`From: ${process.env.RESEND_FROM_EMAIL || "noreply@votredomaine.com"}`);
          console.log("\n" + "=".repeat(60) + "\n");
        }
        return; // Email envoyé avec succès
      } else {
        console.warn("⚠️ Resend module non disponible, fallback sur console log");
      }
    } catch (error) {
      console.error("❌ Erreur lors de l'envoi de l'email via Resend:", error);
      // Continuer pour afficher l'URL en fallback
    }
  }
  
  // Fallback : logger l'URL dans la console (développement ou Resend non configuré)
  console.log("\n" + "=".repeat(60));
  console.log("📧 INVITATION EMAIL (FALLBACK - CONSOLE)");
  console.log("=".repeat(60));
  console.log(`To: ${email}`);
  console.log(`Subject: ${emailContent.subject}`);
  console.log(`\nURL d'invitation:`);
  console.log(invitationUrl);
  if (!process.env.RESEND_API_KEY) {
    console.log("\n⚠️ RESEND_API_KEY non configuré dans .env.local");
    console.log("   Ajoutez RESEND_API_KEY=votre_clé pour envoyer de vrais emails");
  }
  console.log("\n" + "=".repeat(60) + "\n");
}

