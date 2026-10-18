#!/usr/bin/env bash
#
# Régénère lib/supabase/database.types.ts depuis supabase/migrations/.
#
# Monte une base Supabase locale jetable (Supabase CLI + Docker), y applique les migrations,
# génère le type `Database` du schéma public, puis supprime la base. Ne contacte jamais la prod.
#
# Usage : npm run db:types   (Docker Desktop doit tourner)

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
output="$repo_root/lib/supabase/database.types.ts"

# La baseline (dump pg_dump de décembre 2025) passe en premier : les migrations 2025011x/2025012x,
# commitées avec elle, portent un nom antérieur mais modifient ses tables.
baseline="20251212120000_baseline.sql"
# Version de PostgREST du projet hébergé (supabase/.temp/rest-version après `supabase link`).
# Elle active le typage PostgREST 13 de supabase-js, comme le ferait `supabase gen types --linked`.
postgrest_version="13.0.5"

project_id="outlive-db-types"
db_container="supabase_db_$project_id"

for command_name in supabase docker; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande requise introuvable: $command_name" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas : lancez Docker Desktop puis relancez npm run db:types." >&2
  exit 1
fi

workdir="$(mktemp -d)"
cleanup() {
  supabase --workdir "$workdir" stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

# Projet Supabase minimal : base Postgres 17 seule (comme la prod), ports à part pour ne pas
# gêner un autre `supabase start`. Les migrations sont appliquées plus bas, avec psql.
mkdir -p "$workdir/supabase"
cat >"$workdir/supabase/config.toml" <<EOF
project_id = "$project_id"

[db]
port = 54422
major_version = 17

[db.migrations]
enabled = false

[db.seed]
enabled = false
EOF

# Un lancement interrompu peut avoir laissé la base : on repart d'une base vide.
supabase --workdir "$workdir" stop --no-backup >/dev/null 2>&1 || true
supabase --workdir "$workdir" db start

apply_migration() {
  echo "Migration $1"
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$db_container" \
    psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null
}

# `CREATE SCHEMA public;` du dump échoue sur une base Supabase, où le schéma existe déjà.
sed '/^CREATE SCHEMA public;$/d' "$migrations_dir/$baseline" | apply_migration "$baseline"
for file in "$migrations_dir"/[0-9]*_*.sql; do
  name="$(basename "$file")"
  [ "$name" = "$baseline" ] && continue
  apply_migration "$name" <"$file"
done

generated="$workdir/database.types.ts"
{
  echo "// Généré par \`npm run db:types\` depuis supabase/migrations/ : ne pas modifier à la main."
  echo
  supabase --workdir "$workdir" gen types typescript --local --schema public |
    awk -v version="$postgrest_version" '
      { print }
      /^export type Database = \{$/ && !done {
        print "  // Allows to automatically instantiate createClient with right options"
        print "  // instead of createClient<Database, { PostgrestVersion: '\''XX'\'' }>(URL, KEY)"
        print "  __InternalSupabase: {"
        print "    PostgrestVersion: \"" version "\""
        print "  }"
        done = 1
      }
    '
} >"$generated"

if ! grep -q "__InternalSupabase: {" "$generated"; then
  echo "Sortie inattendue de supabase gen types : $output n'a pas été modifié." >&2
  exit 1
fi

mv "$generated" "$output"
echo "Types écrits dans ${output#"$repo_root"/}."
