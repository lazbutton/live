# Guide pour créer un utilisateur admin

## Méthode 1 : Via le Dashboard Supabase (Recommandé - avec mot de passe)

1. **Connectez-vous au Dashboard Supabase**
   - Allez sur https://app.supabase.com
   - Sélectionnez votre projet

2. **Créez un nouvel utilisateur avec mot de passe**
   - Allez dans **Authentication** > **Users**
   - Cliquez sur **Add user** (ou **Invite user**)
   - Remplissez le formulaire :
     - **Email** : l'adresse email de l'admin
     - **Password** : choisissez un mot de passe sécurisé
     - **Auto Confirm User** : cochez cette case pour activer directement le compte
     - **Send Invite Email** : décochez si vous voulez juste créer l'utilisateur
   - Cliquez sur **Create user**

3. **Ajoutez le rôle admin via SQL (si User Metadata n'est pas visible)**
   - Notez l'**email** de l'utilisateur créé
   - Allez dans **SQL Editor** dans le Dashboard
   - Exécutez cette requête (remplacez l'email) :
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
   WHERE email = 'votre-email@example.com';
   ```
   
   OU si vous avez appliqué la migration 004 :
   ```sql
   SELECT make_user_admin('votre-email@example.com');
   ```

### Alternative : User Metadata dans le Dashboard

Si vous voyez les métadonnées dans l'interface :
- Cliquez sur l'utilisateur
- Cherchez l'onglet **Metadata**, **User Metadata**, ou **raw_user_meta_data**
- Cliquez sur **Edit** ou le crayon
- Ajoutez la clé `role` avec la valeur `admin`

## Méthode 2 : Via le SQL Editor

1. **Ouvrez le SQL Editor** dans le Dashboard Supabase
2. **Exécutez la fonction** après avoir appliqué la migration 004 :

```sql
-- Remplacer par l'email de votre utilisateur
SELECT make_user_admin('votre-email@example.com');
```

## Méthode 3 : Via l'API Admin (Programmation)

### JavaScript/TypeScript - Créer un utilisateur avec mot de passe + admin

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'VOTRE_SUPABASE_URL'
const serviceRoleKey = 'VOTRE_SERVICE_ROLE_KEY' // ⚠️ Gardez cette clé secrète !

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Créer un utilisateur avec mot de passe et rôle admin
const { data, error } = await adminClient.auth.admin.createUser({
  email: 'admin@example.com',
  password: 'MotDePasseSecurise123!',
  email_confirm: true, // Confirmer l'email automatiquement
  user_metadata: {
    role: 'admin'
  }
})

if (error) {
  console.error('Erreur lors de la création:', error)
} else {
  console.log('Utilisateur admin créé:', data.user.email)
}
```

### JavaScript/TypeScript - Promouvoir un utilisateur existant

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'VOTRE_SUPABASE_URL'
const serviceRoleKey = 'VOTRE_SERVICE_ROLE_KEY' // ⚠️ Gardez cette clé secrète !

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Trouver l'utilisateur par email
const { data: { users } } = await adminClient.auth.admin.listUsers()
const user = users.find(u => u.email === 'votre-email@example.com')

if (user) {
  // Promouvoir en admin
  const { data, error } = await adminClient.auth.admin.updateUserById(
    user.id,
    {
      user_metadata: { role: 'admin' }
    }
  )
  
  if (error) {
    console.error('Erreur:', error)
  } else {
    console.log('Utilisateur promu admin:', data.user.email)
  }
}
```

### Python - Créer un utilisateur avec mot de passe + admin

```python
from supabase import create_client, Client

supabase_url = "VOTRE_SUPABASE_URL"
service_role_key = "VOTRE_SERVICE_ROLE_KEY"  # ⚠️ Gardez cette clé secrète !

admin_client: Client = create_client(supabase_url, service_role_key)

# Créer un utilisateur avec mot de passe et rôle admin
response = admin_client.auth.admin.create_user({
    "email": "admin@example.com",
    "password": "MotDePasseSecurise123!",
    "email_confirm": True,  # Confirmer l'email automatiquement
    "user_metadata": {
        "role": "admin"
    }
})

if response.user:
    print(f"Utilisateur admin créé: {response.user.email}")
else:
    print(f"Erreur: {response}")
```

### Python - Promouvoir un utilisateur existant

```python
from supabase import create_client, Client

supabase_url = "VOTRE_SUPABASE_URL"
service_role_key = "VOTRE_SERVICE_ROLE_KEY"  # ⚠️ Gardez cette clé secrète !

admin_client: Client = create_client(supabase_url, service_role_key)

# Trouver l'utilisateur par email
users = admin_client.auth.admin.list_users()
user = next((u for u in users.users if u.email == "votre-email@example.com"), None)

if user:
    # Promouvoir en admin
    response = admin_client.auth.admin.update_user_by_id(
        user.id,
        {"user_metadata": {"role": "admin"}}
    )
    print(f"Utilisateur {user.email} promu admin")
```

## Vérification

Pour vérifier qu'un utilisateur est admin :

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'votre-email@example.com';
```

La colonne `role` doit afficher `admin`.

## Important

- ⚠️ La `service_role_key` donne un accès complet à votre base de données. Ne l'exposez jamais côté client !
- Utilisez la `service_role_key` uniquement dans des environnements backend sécurisés
- Pour le développement local, privilégiez la méthode 1 (Dashboard) ou 2 (SQL Editor)

