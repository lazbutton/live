# Guide rapide : Créer un admin en 2 minutes

## Étape 1 : Créer l'utilisateur (Dashboard)

1. **Dashboard Supabase** > **Authentication** > **Users**
2. Cliquez **Add user**
3. Remplissez :
   - Email : `admin@example.com`
   - Password : `VotreMotDePasse123!`
   - ✅ Cochez **Auto Confirm User**
4. Cliquez **Create user**

## Étape 2 : Ajouter le rôle admin (SQL Editor)

1. Dans le Dashboard, allez dans **SQL Editor**
2. Copiez-collez cette requête (remplacez l'email) :

```sql
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'admin@example.com';
```

3. Cliquez **Run** ou `Ctrl+Enter`

## Étape 3 : Vérifier

Exécutez cette requête pour vérifier :

```sql
SELECT 
  email,
  raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email = 'admin@example.com';
```

Vous devriez voir `admin` dans la colonne `role`.

## ✅ C'est fait !

Vous pouvez maintenant vous connecter à `/admin/login` avec :
- Email : `admin@example.com`
- Password : `VotreMotDePasse123!`

---

## Option : Utiliser la fonction SQL (après migration 004)

Si vous avez appliqué la migration `004_create_admin_function.sql`, vous pouvez simplement faire :

```sql
SELECT make_user_admin('admin@example.com');
```

Cela créera l'utilisateur ET le promouvra en admin en une seule commande (mais vous devrez définir le mot de passe séparément).


