#!/usr/bin/env bash
#
# Essaie l'Edge Function delete-user sur une pile Supabase locale jetable
# (supabase/functions/delete-user/README.md, « Ce qui est supprimé »).
#
# Monte une pile Supabase (base, Auth, Storage, PostgREST, Edge Runtime ; Supabase CLI + Docker), y applique
# toutes les migrations comme scripts/db-test.sh, crée des comptes, des propositions, des événements et des
# fichiers, appelle la fonction comme l'app, vérifie ce qui part et ce qui reste, puis supprime la pile. Ne
# contacte jamais la prod.
#
# Usage : npm run test:delete-user   (Docker Desktop doit tourner)

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
baseline="20251212120000_baseline.sql"

# Son propre projet et ses propres ports : la pile peut tourner à côté de celles de db-test.sh et db-types.sh.
project_id="outlive-delete-user-test"
api="http://127.0.0.1:54521"
db_container="supabase_db_$project_id"
storage_container="supabase_storage_$project_id"
public_url="$api/storage/v1/object/public/event-images"

for command_name in supabase docker curl python3 openssl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande requise introuvable: $command_name" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas : lancez Docker Desktop puis relancez npm run test:delete-user." >&2
  exit 1
fi

workdir="$(mktemp -d)"
cleanup() {
  docker start "$storage_container" >/dev/null 2>&1 || true
  supabase --workdir "$workdir" stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

mkdir -p "$workdir/supabase/functions/delete-user"
cp "$repo_root/supabase/functions/delete-user/index.ts" "$workdir/supabase/functions/delete-user/"
cat >"$workdir/supabase/config.toml" <<EOF
project_id = "$project_id"

[api]
port = 54521
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]

[db]
port = 54522
shadow_port = 54520
major_version = 17

[db.pooler]
enabled = false

[db.migrations]
enabled = false

[db.seed]
enabled = false

[realtime]
enabled = false

[studio]
enabled = false

[inbucket]
enabled = false

[storage]
enabled = true

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"

[auth.email]
enable_confirmations = false

[edge_runtime]
enabled = true
inspector_port = 54583

[analytics]
enabled = false

# Comme en prod (README.md de la fonction, « Déploiement ») : la fonction vérifie le jeton elle-même.
[functions.delete-user]
verify_jwt = false
EOF

supabase --workdir "$workdir" stop --no-backup >/dev/null 2>&1 || true
supabase --workdir "$workdir" start -x realtime,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor

sql() {
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$db_container" \
    psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

sed '/^CREATE SCHEMA public;$/d' "$migrations_dir/$baseline" | sql >/dev/null
for file in "$migrations_dir"/[0-9]*_*.sql; do
  [ "$(basename "$file")" = "$baseline" ] && continue
  sql >/dev/null <"$file"
done
sql -c "NOTIFY pgrst, 'reload schema'"
echo "Migrations appliquées."

eval "$(supabase --workdir "$workdir" status -o env 2>/dev/null | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
anon_key="$ANON_KEY"
service_key="$SERVICE_ROLE_KEY"

failed=0
check() { # check <libellé> <attendu> <obtenu>
  if [ "$2" = "$3" ]; then
    echo "ok $1"
  else
    echo "ÉCHEC $1 : attendu « $2 », obtenu « $3 »"
    failed=1
  fi
}

json_field() { python3 -c 'import sys, json; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

# Un compte de la pile, avec un mot de passe tiré au hasard, gardé dans la pile jetable le temps de l'essai.
new_user() { # new_user <e-mail> <app_metadata en JSON> → id
  local password
  password="$(openssl rand -hex 16)"
  echo "$1 $password" >>"$workdir/passwords"
  curl -s -X POST "$api/auth/v1/admin/users" \
    -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$password\",\"email_confirm\":true,\"app_metadata\":$2}" | json_field id
}

token_of() { # token_of <e-mail> → jeton de session
  local password
  password="$(awk -v email="$1" '$1 == email { print $2 }' "$workdir/passwords")"
  curl -s -X POST "$api/auth/v1/token?grant_type=password" -H "apikey: $anon_key" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$password\"}" | json_field access_token
}

upload() { # upload <nom dans le bucket event-images>
  local encoded code
  encoded="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$api/storage/v1/object/event-images/$encoded" \
    -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: image/jpeg' \
    --data-binary 'jpeg')"
  if [ "$code" != 200 ]; then
    echo "Envoi de $1 refusé (HTTP $code)." >&2
    exit 1
  fi
}

call_delete_user() { # call_delete_user <jeton, ou vide> <corps JSON> → code HTTP
  local auth=()
  [ -n "$1" ] && auth=(-H "Authorization: Bearer $1")
  curl -s -o /dev/null -w '%{http_code}' -X POST "$api/functions/v1/delete-user" \
    -H "apikey: $anon_key" -H 'Content-Type: application/json' ${auth[@]+"${auth[@]}"} -d "$2"
}

files_in_bucket() {
  sql -c "select coalesce(string_agg(name, ' ' order by name collate \"C\"), '') from storage.objects where bucket_id = 'event-images'"
}

# --- Les comptes, les fichiers, les propositions et les événements -------------------------------------------

sql -c "insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true) on conflict (id) do nothing"
sql -c "insert into public.categories (name) values ('Concert') on conflict do nothing"

user_a="$(new_user a@essai.local '{"ugc_suspended": true}')"
user_b="$(new_user b@essai.local '{}')"
user_c="$(new_user c@essai.local '{}')"
user_d="$(new_user d@essai.local '{}')"
user_e="$(new_user e@essai.local '{}')"
user_admin="$(new_user admin@essai.local '{"role": "admin"}')"

for name in \
  'events/1_a-proposition.jpg' 'events/2_a-publiee.jpg' 'events/3_a-attente.jpg' 'events/4_partagee.jpg' \
  'events/5_b-proposition.jpg' 'events/7_a special (1).jpg' 'events/8_a-refusee.jpg' 'events/9_a-publiee-bis.jpg' \
  'events/12_a-evenement-refuse.jpg' 'admin-racine.jpg' 'admin-popups/popup.jpg' \
  'cards/v2/a-attente.webp' 'cards/v2/a-refuse.webp' 'cards/v2/partagee.webp' 'cards/v2/admin.webp' \
  'events/10_c-proposition.jpg' 'events/11_c-attente.jpg' 'events/13_d-proposition.jpg' 'events/14_e-attente.jpg'; do
  upload "$name"
done
# Les affiches de l'app sont au compte qui les envoie (owner_id), comme en vrai.
sql -c "update storage.objects set owner = '$user_a', owner_id = '$user_a' where name ~ '^events/[0-9]+_a'"
sql -c "update storage.objects set owner = '$user_c', owner_id = '$user_c' where name ~ '^events/1[01]_c'"

# A (suspendu) : des propositions dans tous les états, dont certaines qui visent des fichiers qui ne sont pas les
# siens (la proposition d'un autre, le back-office, une vignette, un chemin qui remonte) ; des événements en
# attente (l'un avec une affiche et une vignette partagées avec un événement publié de B), un refusé, des publiés.
sql -v a="$user_a" -v b="$user_b" -v c="$user_c" -v d="$user_d" -v e="$user_e" -v pub="$public_url" <<'EOF'
insert into public.user_requests (request_type, status, requested_by, event_data) values
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A en attente', 'image_url', :'pub' || '/events/1_a-proposition.jpg')),
  ('event_creation', 'converted', :'a', jsonb_build_object('title', 'A publiée', 'image_url', :'pub' || '/events/2_a-publiee.jpg')),
  ('event_creation', 'rejected',  :'a', jsonb_build_object('title', 'A refusée', 'image_url', :'pub' || '/events/8_a-refusee.jpg')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A encodée', 'image_url', :'pub' || '/events/7_a%20special%20(1).jpg?t=1')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A vise B', 'image_url', :'pub' || '/events/5_b-proposition.jpg')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A vise la racine', 'image_url', :'pub' || '/admin-racine.jpg')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A vise un popup', 'image_url', :'pub' || '/admin-popups/popup.jpg')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A vise une vignette', 'image_url', :'pub' || '/cards/v2/admin.webp')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A remonte', 'image_url', :'pub' || '/events/../admin-racine.jpg')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A ailleurs', 'image_url', 'https://example.org/affiche.jpg')),
  ('event_creation', 'pending',   :'a', jsonb_build_object('title', 'A sans affiche')),
  ('event_from_url', 'pending',   :'a', null),
  ('event_creation', 'pending',   :'b', jsonb_build_object('title', 'B en attente', 'image_url', :'pub' || '/events/5_b-proposition.jpg')),
  ('event_creation', 'pending',   :'c', jsonb_build_object('title', 'C en attente', 'image_url', :'pub' || '/events/10_c-proposition.jpg')),
  ('event_creation', 'pending',   :'d', jsonb_build_object('title', 'D en attente', 'image_url', :'pub' || '/events/13_d-proposition.jpg'));

insert into public.events (id, title, date, category, status, created_by, image_url) values
  ('00000000-0000-0000-0000-0000000000e2', 'E2 A publié', now() + interval '10 days', 'Concert', 'approved', :'a', :'pub' || '/events/2_a-publiee.jpg'),
  ('00000000-0000-0000-0000-0000000000e3', 'E3 A en attente', now() + interval '10 days', 'Concert', 'pending', :'a', :'pub' || '/events/3_a-attente.jpg'),
  ('00000000-0000-0000-0000-0000000000e4', 'E4 A en attente, affiche partagée', now() + interval '10 days', 'Concert', 'pending', :'a', :'pub' || '/events/4_partagee.jpg'),
  ('00000000-0000-0000-0000-0000000000e5', 'E5 B publié, affiche partagée', now() + interval '10 days', 'Concert', 'approved', :'b', :'pub' || '/events/4_partagee.jpg'),
  ('00000000-0000-0000-0000-0000000000e6', 'E6 A publié bis', now() + interval '10 days', 'Concert', 'approved', :'a', :'pub' || '/events/9_a-publiee-bis.jpg'),
  ('00000000-0000-0000-0000-0000000000e7', 'E7 back-office', now() + interval '10 days', 'Concert', 'approved', null, :'pub' || '/admin-racine.jpg'),
  ('00000000-0000-0000-0000-0000000000e8', 'E8 A refusé', now() + interval '10 days', 'Concert', 'rejected', :'a', :'pub' || '/events/12_a-evenement-refuse.jpg'),
  ('00000000-0000-0000-0000-0000000000e9', 'E9 C en attente', now() + interval '10 days', 'Concert', 'pending', :'c', :'pub' || '/events/11_c-attente.jpg'),
  ('00000000-0000-0000-0000-0000000000ea', 'EA E en attente', now() + interval '10 days', 'Concert', 'pending', :'e', :'pub' || '/events/14_e-attente.jpg');

update public.events
set community_submission = true, community_attribution_opt_in = true, community_contributor_label = 'Alice'
where id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e6',
             '00000000-0000-0000-0000-0000000000e8');
update public.events
set community_submission = true, community_attribution_opt_in = true, community_contributor_label = 'Bob'
where id = '00000000-0000-0000-0000-0000000000e5';

-- Les vignettes, posées après l'insertion (qui les remet à null).
update public.events
set image_card_url = :'pub' || '/cards/v2/a-attente.webp', image_width = 10, image_height = 10, image_color = '#000000'
where id = '00000000-0000-0000-0000-0000000000e3';
update public.events
set image_card_url = :'pub' || '/cards/v2/a-refuse.webp', image_width = 10, image_height = 10, image_color = '#000000'
where id = '00000000-0000-0000-0000-0000000000e8';
update public.events
set image_card_url = :'pub' || '/cards/v2/partagee.webp', image_width = 10, image_height = 10, image_color = '#000000'
where id in ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e5');
update public.events
set image_card_url = :'pub' || '/cards/v2/admin.webp', image_width = 10, image_height = 10, image_color = '#000000'
where id = '00000000-0000-0000-0000-0000000000e7';
EOF

published_ids="'00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e6'"

# --- Les refus ---------------------------------------------------------------------------------------------

token_a="$(token_of a@essai.local)"
check "suspendu, la RLS ne lui laisse supprimer aucun de ses événements en attente" "[]" \
  "$(curl -s -X DELETE "$api/rest/v1/events?created_by=eq.$user_a&status=eq.pending" -H "apikey: $anon_key" \
    -H "Authorization: Bearer $token_a" -H 'Prefer: return=representation')"
check "sans jeton : 401" 401 "$(call_delete_user '' '{}')"
token_d="$(token_of d@essai.local)"
check "le compte d'un autre : 403" 403 "$(call_delete_user "$token_d" "{\"userId\":\"$user_b\"}")"
check "le compte d'un autre reste" 1 "$(sql -c "select count(*) from auth.users where id = '$user_b'")"

# --- A, suspendu, supprime son compte -------------------------------------------------------------------------

e5_updated_at="$(sql -c "select updated_at from public.events where id = '00000000-0000-0000-0000-0000000000e5'")"
check "A : 200" 200 "$(call_delete_user "$token_a" '{}')"
check "A : le compte est supprimé" 0 "$(sql -c "select count(*) from auth.users where id = '$user_a'")"
check "A : ses événements en attente et refusé sont supprimés" 0 \
  "$(sql -c "select count(*) from public.events where id in ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e8')")"
check "A : ses événements publiés restent, sans auteur ni nom public" \
  "E2 A publié|||false|true E6 A publié bis|||false|true" \
  "$(sql -c "select string_agg(concat_ws('|', title, coalesce(created_by::text, ''), coalesce(community_contributor_label, ''), community_attribution_opt_in::text, community_submission::text), ' ' order by title) from public.events where id in ($published_ids)")"
check "A : le nom public de B reste, sa ligne n'est pas réécrite" "Bob|true|$e5_updated_at" \
  "$(sql -c "select concat_ws('|', community_contributor_label, community_attribution_opt_in::text, updated_at) from public.events where id = '00000000-0000-0000-0000-0000000000e5'")"
check "A : ses propositions sont supprimées, pas celle de B" "0|1" \
  "$(sql -c "select count(*) filter (where event_data->>'title' like 'A %') || '|' || count(*) filter (where requested_by = '$user_b') from public.user_requests")"
check "A : les fichiers qui restent" \
  "admin-popups/popup.jpg admin-racine.jpg cards/v2/admin.webp cards/v2/partagee.webp events/10_c-proposition.jpg events/11_c-attente.jpg events/13_d-proposition.jpg events/14_e-attente.jpg events/2_a-publiee.jpg events/4_partagee.jpg events/5_b-proposition.jpg events/9_a-publiee-bis.jpg" \
  "$(files_in_bucket)"
check "A : une affiche effacée ne se charge plus" non \
  "$([ "$(curl -s -o /dev/null -w '%{http_code}' "$public_url/events/1_a-proposition.jpg")" = 200 ] && echo oui || echo non)"
check "A : une affiche gardée se charge toujours" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$public_url/events/2_a-publiee.jpg")"

# --- Une erreur de la base : rien n'est supprimé, la demande peut être refaite -----------------------------------

sql -c "revoke select on public.user_requests from service_role"
check "D, base en erreur : 500" 500 "$(call_delete_user "$token_d" '{}')"
check "D, base en erreur : le compte reste" 1 "$(sql -c "select count(*) from auth.users where id = '$user_d'")"
sql -c "grant select on public.user_requests to service_role"
check "D, refait : 200" 200 "$(call_delete_user "$token_d" '{}')"
check "D, refait : le compte et l'affiche de sa proposition sont supprimés" "0|false" \
  "$(sql -c "select (select count(*) from auth.users where id = '$user_d') || '|' || exists (select 1 from storage.objects where name = 'events/13_d-proposition.jpg')")"

# --- Un admin supprime le compte de E ----------------------------------------------------------------------------

token_admin="$(token_of admin@essai.local)"
check "admin pour E : 200" 200 "$(call_delete_user "$token_admin" "{\"userId\":\"$user_e\"}")"
check "admin pour E : le compte, l'événement en attente et son affiche sont supprimés" "0|0|false" \
  "$(sql -c "select (select count(*) from auth.users where id = '$user_e') || '|' || (select count(*) from public.events where id = '00000000-0000-0000-0000-0000000000ea') || '|' || exists (select 1 from storage.objects where name = 'events/14_e-attente.jpg')")"
check "admin pour E : l'admin reste" 1 "$(sql -c "select count(*) from auth.users where id = '$user_admin'")"

# --- Storage ne répond plus : le compte est supprimé quand même ----------------------------------------------

token_c="$(token_of c@essai.local)"
docker stop "$storage_container" >/dev/null
check "C, Storage arrêté : 200" 200 "$(call_delete_user "$token_c" '{}')"
docker start "$storage_container" >/dev/null
check "C, Storage arrêté : le compte et l'événement en attente sont supprimés" "0|0" \
  "$(sql -c "select (select count(*) from auth.users where id = '$user_c') || '|' || (select count(*) from public.events where id = '00000000-0000-0000-0000-0000000000e9')")"
check "C, Storage arrêté : ses fichiers restent, encore à son nom" "2|2" \
  "$(sql -c "select count(*) || '|' || count(*) filter (where owner_id = '$user_c') from storage.objects where name ~ '^events/1[01]_c'")"

if [ "$failed" -ne 0 ]; then
  echo "delete-user : des vérifications échouent." >&2
  exit 1
fi
echo "delete-user : tout passe."
