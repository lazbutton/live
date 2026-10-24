# Edge Function : delete-user

Cette Edge Function supprime un compte utilisateur, avec ce que la suppression de l'utilisateur laisserait derrière
elle, grâce aux permissions admin de la clé secrète. L'app l'appelle depuis « Supprimer mon compte » (`GdprRepository`
de `../live`) ; un admin peut aussi l'appeler pour un autre compte (`userId`).

## 🗑️ Ce qui est supprimé

Dans cet ordre, avec la clé secrète : la RLS ne s'applique pas, donc un compte suspendu, qui ne peut pas supprimer
lui-même ses événements en attente (`can_use_ugc_features()`), est traité comme les autres.

1. Ses événements encore en attente (`events.created_by`, `status = 'pending'`). L'app les supprime déjà avant
   l'appel ; la fonction n'en trouve alors plus, sauf pour un compte suspendu.
2. Sur ses autres événements (publiés ou refusés), le nom public de l'attribution (« Proposé par … »,
   `community_contributor_label`) et l'accord (`community_attribution_opt_in`).
3. Dans le bucket `event-images`, les affiches de ses propositions (`user_requests.requested_by`,
   `event_data->>'image_url'`) et de ses événements en attente, et les vignettes de ceux-ci, que plus rien
   n'utilise : ni un événement restant (`image_url`, `image_card_url`), ni la proposition d'un autre compte. Une URL
   est reconnue à son chemin, quel que soit l'hôte. Seulement dans `events/` (où l'app dépose les affiches) et
   `cards/` (les vignettes, `docs/EVENT_IMAGE_CARDS.md`) : jamais un fichier du back-office, même si une ligne du
   compte pointe dessus.
4. L'utilisateur (`auth.admin.deleteUser`). Les clés étrangères vers `auth.users` emportent le reste en base :
   propositions, favoris, suivis, masqués, préférences et jetons de notification, signalements, auteurs bloqués
   (`ON DELETE CASCADE`) ; `events.created_by` passe à `NULL`.

Restent ses événements publiés et refusés, sans auteur ni nom public, avec leur affiche.

Une erreur de la base (la lecture des propositions, les étapes 1 et 2) arrête tout avant l'étape 4 : réponse 500,
le compte est encore là et la demande peut être refaite. Les fichiers (étape 3) sont effacés au mieux : une lecture
en erreur garde le fichier, et un fichier qui résiste (Storage en panne…) n'empêche pas la suppression du compte ;
il est noté dans les journaux de la fonction (« Posters not removed ») et reste sans lien avec un compte, parmi les
orphelins que liste `npm run storage:audit`.

Essayer la fonction après un changement : `npm run test:delete-user` (`scripts/delete-user-test.sh`), sur une pile
Supabase locale jetable (Supabase CLI + Docker, jamais la prod) : toutes les migrations, des comptes, des
propositions, des événements et des fichiers, puis ce qui part et ce qui reste, compte suspendu, affiche partagée,
fichier du back-office visé par une proposition, erreur de la base, Storage arrêté et admin compris.

## 🔒 Sécurité

- ✅ Vérifie elle-même le jeton de l'utilisateur (`auth.getUser()`), d'où le déploiement sans « Verify JWT »
- ✅ Vérifie que l'utilisateur demande la suppression de son propre compte (sauf si admin)
- ✅ Utilise la clé secrète du projet pour les permissions admin
- ✅ Gère les erreurs CORS

## 📋 Les clés

Rien à configurer : Supabase injecte les clés dans l'environnement de la fonction. Elle prend la clé publishable et
la clé secrète nommées `default` (`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`) dès qu'elles existent, sinon
les clés legacy (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), qui cessent de marcher une fois désactivées dans
Settings → API Keys.

## 🚀 Déploiement

```bash
# Depuis la racine du projet
supabase functions deploy delete-user --no-verify-jwt
```

Sans `--no-verify-jwt`, la plateforme vérifie le jeton avant la fonction, et cette vérification casse le jour où le
projet passe aux « JWT Signing Keys » (doc de Supabase, « JWT Signing Keys », « Getting started »). La fonction
refuse d'elle-même une requête sans jeton valide (401).

## 📡 Utilisation depuis Flutter

```dart
final response = await SupabaseService.client.functions.invoke(
  'delete-user',
  body: {'userId': userId}, // Optionnel, utilise l'utilisateur authentifié par défaut
  headers: {
    'Authorization': 'Bearer ${SupabaseService.client.auth.currentSession?.accessToken}',
  },
);
```

## 📧 Une demande par e-mail

La politique de confidentialité (`components/privacy-policy/account-deletion-section.tsx`) promet de supprimer le
compte comme le fait l'app. « Delete user » du tableau de bord de Supabase ne fait que l'étape 4 : il laisse les
affiches, les événements en attente et le nom public. Un admin appelle donc la fonction pour le compte (`userId`,
dans Authentication → Users), avec le jeton de sa propre session (les identifiants du back-office) :

```bash
read -r -p 'E-mail admin : ' ADMIN_EMAIL; read -r -s -p 'Mot de passe : ' ADMIN_PASSWORD; echo
TOKEN=$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email: $email, password: $password}' |
  curl -s -X POST 'https://<ref>.supabase.co/auth/v1/token?grant_type=password' \
    -H 'apikey: <clé publishable>' -H 'Content-Type: application/json' -d @- | jq -r .access_token)
curl -s -X POST 'https://<ref>.supabase.co/functions/v1/delete-user' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"userId": "<id du compte>"}'
```

Réponse attendue : `{"success":true,…}`.

## 🔄 Webhook (Optionnel)

Cette fonction peut aussi être appelée via un webhook Supabase qui écoute les événements de suppression.
