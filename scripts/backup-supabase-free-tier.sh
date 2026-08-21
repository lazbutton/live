#!/usr/bin/env bash

set -euo pipefail
umask 077

for command_name in supabase pg_dump psql shasum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande requise introuvable: $command_name" >&2
    exit 1
  fi
done

backup_root="${1:-${OUTLIVE_BACKUP_ROOT:-$HOME/Documents/Backups/outlive}}"
timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
backup_dir="$backup_root/$timestamp"
storage_dir="$backup_dir/storage"

mkdir -p "$storage_dir"

run_native_supabase_dump() {
  bash <(supabase db dump --linked --dry-run "$@" 2>/dev/null)
}

echo "Sauvegarde Supabase vers $backup_dir"

run_native_supabase_dump --role-only >"$backup_dir/roles.sql"
run_native_supabase_dump >"$backup_dir/schema.sql"
run_native_supabase_dump \
  --data-only \
  --use-copy \
  -x "public.notion_sync_jobs" \
  -x "public.notion_sync_errors" \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes" \
  >"$backup_dir/data.sql"

# Le dry-run fournit un rôle temporaire et ses paramètres de connexion.
# Ils restent uniquement dans l'environnement du processus et ne sont jamais écrits.
eval "$(
  supabase db dump --linked --dry-run 2>/dev/null |
    awk '/^export PG/{print; if (++count == 5) exit}'
)"

psql -X -v ON_ERROR_STOP=1 \
  -c "set role postgres" \
  -c "\\copy (select * from public.notion_sync_jobs where status in ('pending','processing','failed')) to '$backup_dir/notion_sync_jobs_active.csv' with (format csv, header true)" \
  -c "\\copy public.notion_sync_errors to '$backup_dir/notion_sync_errors.csv' with (format csv, header true)"

psql -X -v ON_ERROR_STOP=1 -P pager=off \
  -c "set role postgres;
      select now() as captured_at,
             pg_size_pretty(pg_database_size(current_database())) as database_size;
      select schemaname || '.' || relname as table_name,
             pg_size_pretty(pg_total_relation_size(relid)) as total_size,
             n_live_tup as rows_estimate
      from pg_stat_user_tables
      order by pg_total_relation_size(relid) desc
      limit 20;
      select pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) as storage_size,
             count(*) as storage_objects
      from storage.objects;" \
  >"$backup_dir/inventory.txt"

for bucket in event-images locations-images organizers-images; do
  mkdir -p "$storage_dir/$bucket"
  supabase storage cp \
    -r \
    "ss:///$bucket" \
    "$storage_dir/$bucket" \
    --linked \
    --experimental \
    --jobs 4
done

shasum -a 256 \
  "$backup_dir/roles.sql" \
  "$backup_dir/schema.sql" \
  "$backup_dir/data.sql" \
  "$backup_dir/notion_sync_jobs_active.csv" \
  "$backup_dir/notion_sync_errors.csv" \
  >"$backup_dir/SHA256SUMS"

echo "Sauvegarde terminée: $backup_dir"
echo "Copiez ce dossier vers un stockage chiffré hors de la machine."
