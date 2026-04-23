type InvitationRole = "owner" | "editor" | "viewer";

type BuildInvitationEmailParams = {
  baseUrl: string;
  invitationUrl: string;
  organizerName: string;
  recipientEmail: string;
  role: InvitationRole;
};

const BRAND = {
  background: "#0b0b0c",
  panel: "#161618",
  panelSoft: "#1d1d20",
  border: "#2a2a2f",
  foreground: "#f4f4f4",
  muted: "#b7b7c2",
  accent: "#ea2f2f",
  accentSoft: "#2a1313",
  accentText: "#ffb1b1",
  successSoft: "#121d17",
  successBorder: "#214330",
  successText: "#b8f0ca",
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roleLabel(role: InvitationRole) {
  switch (role) {
    case "owner":
      return "propriétaire";
    case "editor":
      return "éditeur";
    case "viewer":
      return "visualiseur";
    default:
      return "membre";
  }
}

function roleSummary(role: InvitationRole) {
  switch (role) {
    case "owner":
      return "Vous pourrez gérer l’équipe, les événements et les paramètres de cet espace.";
    case "editor":
      return "Vous pourrez gérer les événements et mettre à jour le contenu selon vos droits.";
    case "viewer":
      return "Vous pourrez consulter l’espace organisateur et suivre son activité selon vos droits.";
    default:
      return "Vous pourrez accéder à l’espace organisateur selon les permissions de votre rôle.";
  }
}

function buildPreheader(organizerName: string, role: InvitationRole) {
  return `Invitation OutLive : rejoignez ${organizerName} en tant que ${roleLabel(role)}.`;
}

export function buildInvitationEmail({
  baseUrl,
  invitationUrl,
  organizerName,
  recipientEmail,
  role,
}: BuildInvitationEmailParams) {
  const safeOrganizerName = escapeHtml(organizerName);
  const safeRecipientEmail = escapeHtml(recipientEmail);
  const safeInvitationUrl = escapeHtml(invitationUrl);
  const safeIconUrl = escapeHtml(`${baseUrl.replace(/\/+$/, "")}/icon`);
  const safeRoleLabel = escapeHtml(roleLabel(role));
  const safeRoleSummary = escapeHtml(roleSummary(role));
  const preheader = escapeHtml(buildPreheader(organizerName, role));
  const subject = `OutLive · Invitation pour ${organizerName}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.foreground};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${preheader}
  </div>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BRAND.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;">
          <tr>
            <td align="center" style="padding-bottom:18px;">
              <img src="${safeIconUrl}" alt="OutLive" width="44" height="44" style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;">
              <div style="margin-top:10px;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.foreground};">
                OutLive
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:${BRAND.panel};border:1px solid ${BRAND.border};border-radius:28px;padding:32px 28px;">
              <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:${BRAND.accentSoft};border:1px solid rgba(234,47,47,0.32);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:${BRAND.accentText};">
                Invitation équipe
              </div>

              <h1 style="margin:18px 0 10px;font-size:32px;line-height:1.1;letter-spacing:-0.03em;color:${BRAND.foreground};">
                Rejoignez ${safeOrganizerName}
              </h1>

              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:${BRAND.muted};">
                Vous avez été invité à rejoindre l’espace organisateur OutLive de <strong style="color:${BRAND.foreground};font-weight:700;">${safeOrganizerName}</strong> en tant que <strong style="color:${BRAND.foreground};font-weight:700;">${safeRoleLabel}</strong>.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;">
                <tr>
                  <td style="background:${BRAND.panelSoft};border:1px solid ${BRAND.border};border-radius:18px;padding:18px 18px 16px;">
                    <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;color:${BRAND.accentText};margin-bottom:8px;">
                      Votre accès
                    </div>
                    <div style="font-size:16px;line-height:1.6;color:${BRAND.foreground};font-weight:600;">
                      ${safeRoleLabel}
                    </div>
                    <div style="margin-top:6px;font-size:14px;line-height:1.6;color:${BRAND.muted};">
                      ${safeRoleSummary}
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;">
                <tr>
                  <td style="background:${BRAND.successSoft};border:1px solid ${BRAND.successBorder};border-radius:18px;padding:18px;">
                    <div style="font-size:14px;line-height:1.7;color:${BRAND.successText};">
                      Utilisez bien l’adresse <strong>${safeRecipientEmail}</strong> pour créer votre compte ou vous connecter avant d’accepter l’invitation.
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 28px;">
                <tr>
                  <td align="center" style="padding-top:8px;">
                    <a href="${safeInvitationUrl}" style="display:inline-block;padding:16px 26px;background:${BRAND.accent};color:#ffffff;text-decoration:none;border-radius:16px;font-size:16px;font-weight:700;letter-spacing:-0.01em;">
                      Créer mon compte et accepter
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
                <tr>
                  <td style="background:${BRAND.panelSoft};border:1px solid ${BRAND.border};border-radius:18px;padding:18px;">
                    <div style="font-size:14px;line-height:1.7;color:${BRAND.muted};">
                      <strong style="color:${BRAND.foreground};">Important :</strong> ce lien expire dans <strong style="color:${BRAND.foreground};">7 jours</strong>. Si vous avez déjà un compte avec cette adresse email, connectez-vous puis ouvrez de nouveau ce lien.
                    </div>
                  </td>
                </tr>
              </table>

              <div style="padding-top:20px;border-top:1px solid ${BRAND.border};">
                <div style="font-size:13px;line-height:1.6;color:${BRAND.muted};margin-bottom:10px;">
                  Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
                </div>
                <a href="${safeInvitationUrl}" style="font-size:13px;line-height:1.7;color:${BRAND.accentText};text-decoration:underline;word-break:break-all;">
                  ${safeInvitationUrl}
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 10px 0;text-align:center;font-size:12px;line-height:1.7;color:#8b8b96;">
              Email automatique OutLive, merci de ne pas y répondre.<br>
              © ${new Date().getFullYear()} OutLive
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `OutLive · Invitation pour ${organizerName}`,
    "",
    `Vous avez été invité à rejoindre l’espace organisateur de ${organizerName} en tant que ${roleLabel(role)}.`,
    roleSummary(role),
    "",
    `Adresse à utiliser : ${recipientEmail}`,
    "Utilisez cette même adresse email pour créer votre compte ou vous connecter avant d’accepter l’invitation.",
    "",
    "Le lien expire dans 7 jours.",
    `Invitation : ${invitationUrl}`,
  ].join("\n");

  return { subject, html, text };
}
