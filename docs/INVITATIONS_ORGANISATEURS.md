# Guide : Système d'invitations organisateurs

Ce guide explique le système d'invitation par email pour ajouter des utilisateurs aux organisateurs.

## 📋 Vue d'ensemble

Le système permet aux admins d'inviter des utilisateurs à rejoindre un organisateur via email. L'utilisateur reçoit un email avec un lien qui lui permet de :
1. Créer son compte (s'il n'existe pas)
2. Définir son mot de passe
3. Accepter automatiquement l'invitation et être lié à l'organisateur

## 🚀 Utilisation depuis l'admin

### Inviter un utilisateur

1. Allez dans **Admin** > **Organisateurs**
2. Cliquez sur un organisateur pour le modifier
3. Dans la section "Utilisateurs associés", cliquez sur **"Ajouter un utilisateur"**
4. Saisissez l'**email** de l'utilisateur
5. Sélectionnez le **rôle** (Owner, Editor, ou Viewer)
6. Cliquez sur **"Envoyer l'invitation"**

Un email sera envoyé à l'utilisateur avec un lien pour créer son compte.

## 📧 Configuration de l'envoi d'emails

### Option 1 : Utiliser les emails Supabase (Recommandé pour le développement)

Supabase envoie automatiquement des emails de confirmation. Pour utiliser ce système :

1. **Configurer les emails dans Supabase Dashboard** :
   - Allez dans **Authentication** > **Email Templates**
   - Configurez les templates d'email selon vos besoins
   - Activez l'envoi d'emails

2. **Pour l'instant**, l'URL d'invitation est loggée dans la console (voir ci-dessous)

### Option 2 : Intégrer un service d'email (Production)

Pour la production, intégrez un service d'email comme **Resend**, **SendGrid**, ou **AWS SES**.

#### Exemple avec Resend

1. **Installer Resend** :
```bash
npm install resend
```

2. **Ajouter la clé API dans `.env.local`** :
```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

3. **Mettre à jour `app/api/admin/organizers/[id]/invite/route.ts`** :

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendInvitationEmail(
  email: string,
  token: string,
  organizerName: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const invitationUrl = `${baseUrl}/organizer/invite/accept?token=${token}`;

  await resend.emails.send({
    from: 'noreply@votredomaine.com',
    to: email,
    subject: `Invitation à rejoindre ${organizerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Invitation à rejoindre ${organizerName}</h1>
        <p>Vous avez été invité à rejoindre <strong>${organizerName}</strong> en tant qu'organisateur.</p>
        <p>Cliquez sur le bouton ci-dessous pour créer votre compte et accepter l'invitation :</p>
        <a href="${invitationUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
          Accepter l'invitation
        </a>
        <p style="color: #666; font-size: 12px;">Ce lien expire dans 7 jours.</p>
        <p style="color: #666; font-size: 12px;">Si le bouton ne fonctionne pas, copiez ce lien : ${invitationUrl}</p>
      </div>
    `,
  });
}
```

## 🔄 Workflow d'invitation

### 1. Admin envoie l'invitation

- L'admin saisit un email dans l'interface
- Une invitation est créée dans la table `organizer_invitations`
- Un email est envoyé (ou loggé en dev)

### 2. Utilisateur reçoit l'email

- L'email contient un lien : `/organizer/invite/accept?token=...`
- Le token est unique et expire après 7 jours

### 3. Utilisateur accepte l'invitation

- Il clique sur le lien
- Si le compte n'existe pas : il crée son compte avec un mot de passe
- Si le compte existe : il se connecte
- L'invitation est acceptée automatiquement
- La liaison `user_organizers` est créée
- L'utilisateur est redirigé vers `/organizer`

## 📝 Structure de la base de données

### Table `organizer_invitations`

```sql
- id: uuid (PK)
- organizer_id: uuid (FK → organizers)
- email: text
- role: text (owner, editor, viewer)
- token: uuid (unique)
- invited_by: uuid (FK → auth.users)
- accepted_at: timestamp (null si pas encore acceptée)
- expires_at: timestamp (7 jours par défaut)
- created_at: timestamp
- updated_at: timestamp
```

## 🔧 Migrations à appliquer

1. **Appliquer la migration** `20250114000001_add_organizer_invitations.sql` :
   - Crée la table `organizer_invitations`
   - Crée les fonctions SQL nécessaires
   - Configure les politiques RLS

## ⚙️ Variables d'environnement

Ajoutez dans `.env.local` :

```env
# URL de base de l'application (pour les liens d'invitation)
NEXT_PUBLIC_APP_URL=http://localhost:3000
# ou en production :
# NEXT_PUBLIC_APP_URL=https://votredomaine.com
```

## 🧪 Test en développement

En développement, l'URL d'invitation est loggée dans la console serveur :

```
=== INVITATION EMAIL ===
To: utilisateur@example.com
Subject: Invitation à rejoindre Nom Organisateur
URL: http://localhost:3000/organizer/invite/accept?token=xxxx-xxxx-xxxx
========================
```

Copiez cette URL dans votre navigateur pour tester le flux.

## 🎯 Fonctionnalités

- ✅ Invitation par email
- ✅ Création de compte automatique
- ✅ Lien d'invitation unique avec token
- ✅ Expiration automatique (7 jours)
- ✅ Vérification que l'invitation n'est pas déjà acceptée
- ✅ Vérification que l'email correspond
- ✅ Redirection automatique vers l'interface organisateur

## 🔒 Sécurité

- Les tokens sont uniques et générés aléatoirement
- Les invitations expirent après 7 jours
- Vérification que l'email correspond à l'utilisateur connecté
- Seuls les admins peuvent créer des invitations
- Les politiques RLS protègent les données

## 🐛 Dépannage

### L'email n'est pas reçu

1. Vérifiez les logs de la console (en développement)
2. Vérifiez la configuration du service d'email
3. Vérifiez que `NEXT_PUBLIC_APP_URL` est correctement configuré

### L'invitation est expirée

Les invitations expirent après 7 jours. L'admin peut renvoyer une invitation.

### L'utilisateur existe déjà

Si l'utilisateur existe déjà avec cet email, il pourra se connecter directement et accepter l'invitation.

## 📚 API Endpoints

- `POST /api/admin/organizers/[id]/invite` - Envoyer une invitation
- `GET /api/organizer/invite/verify?token=...` - Vérifier une invitation
- `POST /api/organizer/invite/accept` - Accepter une invitation



