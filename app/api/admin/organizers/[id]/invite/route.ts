import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isOwnerOfOrganizer } from "@/lib/auth-helpers";

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
          await sendInvitationEmail(email, invitation.token, organizerData.name);
          
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
    await sendInvitationEmail(email, invitation.token, organizerData.name);

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
  organizerName: string
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

  // Générer le HTML de l'email (style inspiré de l'interface admin)
  const emailHTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Invitation à rejoindre ${organizerName}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header avec gradient (inspiré du style admin) -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                Invitation Organisateur
              </h1>
            </td>
          </tr>
          
          <!-- Contenu principal -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #1f2937; line-height: 1.6;">
                Bonjour,
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #1f2937; line-height: 1.6;">
                Vous avez été invité à rejoindre <strong style="color: #667eea; font-weight: 600;">${organizerName}</strong> en tant qu'organisateur sur la plateforme Live Orléans.
              </p>
              
              <p style="margin: 0 0 32px 0; font-size: 16px; color: #4b5563; line-height: 1.6;">
                En acceptant cette invitation, vous pourrez gérer les événements de cet organisateur, créer de nouveaux événements, et bien plus encore.
              </p>
              
              <!-- Badge d'information (style inspiré de l'admin) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 32px 0;">
                <tr>
                  <td style="background-color: #eff6ff; border-left: 4px solid #667eea; padding: 16px 20px; border-radius: 6px;">
                    <p style="margin: 0; font-size: 14px; color: #1e40af; line-height: 1.5;">
                      <strong style="display: block; margin-bottom: 4px;">💡 Que pouvez-vous faire ?</strong>
                      • Créer et modifier des événements<br>
                      • Gérer le contenu de l'organisateur<br>
                      • Suivre les statistiques
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Bouton CTA (style inspiré de l'admin) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 0 0 32px 0;">
                    <a href="${invitationUrl}" style="display: inline-block; padding: 16px 32px; background-color: #667eea; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);">
                      Créer mon compte et accepter
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Note importante (style inspiré de l'admin) -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 24px 0;">
                <tr>
                  <td style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 16px; border-radius: 6px;">
                    <p style="margin: 0; font-size: 14px; color: #92400e; line-height: 1.5;">
                      <strong>⏰ Important :</strong> Ce lien d'invitation expire dans <strong>7 jours</strong>. Assurez-vous de créer votre compte avant cette date.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Lien alternatif -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding-top: 24px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280;">
                      Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :
                    </p>
                    <p style="margin: 0; word-break: break-all;">
                      <a href="${invitationUrl}" style="color: #667eea; text-decoration: underline; font-size: 13px; word-break: break-all;">
                        ${invitationUrl}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280; line-height: 1.5;">
                Cet email a été envoyé automatiquement, merci de ne pas y répondre.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} Live Orléans - Tous droits réservés
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

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
          subject: `Invitation à rejoindre ${organizerName}`,
          html: emailHTML,
        });
        
        // Logger en développement pour confirmation
        if (process.env.NODE_ENV === "development") {
          console.log("\n" + "=".repeat(60));
          console.log("📧 EMAIL ENVOYÉ VIA RESEND");
          console.log("=".repeat(60));
          console.log(`To: ${email}`);
          console.log(`Subject: Invitation à rejoindre ${organizerName}`);
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
  console.log(`Subject: Invitation à rejoindre ${organizerName}`);
  console.log(`\nURL d'invitation:`);
  console.log(invitationUrl);
  if (!process.env.RESEND_API_KEY) {
    console.log("\n⚠️ RESEND_API_KEY non configuré dans .env.local");
    console.log("   Ajoutez RESEND_API_KEY=votre_clé pour envoyer de vrais emails");
  }
  console.log("\n" + "=".repeat(60) + "\n");
}

