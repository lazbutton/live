#!/usr/bin/env bash
#
# Lance les tests SQL de supabase/tests/ sur une base Supabase locale jetable.
#
# Monte une base Postgres 17 de Supabase (Supabase CLI + Docker, comme scripts/db-types.sh), y applique
# toutes les migrations, exécute chaque fichier supabase/tests/*.test.sql avec psql (chacun dans une
# transaction annulée), puis supprime la base. Ne contacte jamais la prod.
#
# Usage : npm run db:test   (Docker Desktop doit tourner)
#         npm run db:test -- supabase/tests/app_calendar.test.sql   (un seul fichier)

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
tests_dir="$repo_root/supabase/tests"
baseline="20251212120000_baseline.sql"

project_id="outlive-db-test"
db_container="supabase_db_$project_id"

for command_name in supabase docker; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande requise introuvable: $command_name" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas : lancez Docker Desktop puis relancez npm run db:test." >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  test_files=("$@")
else
  test_files=("$tests_dir"/*.test.sql)
fi

workdir="$(mktemp -d)"
cleanup() {
  supabase --workdir "$workdir" stop --no-backup >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

# Même base que scripts/db-types.sh, sur un autre port et un autre projet : les deux scripts peuvent
# tourner ensemble.
mkdir -p "$workdir/supabase"
cat >"$workdir/supabase/config.toml" <<EOF
project_id = "$project_id"

[db]
port = 54432
major_version = 17

[db.migrations]
enabled = false

[db.seed]
enabled = false
EOF

supabase --workdir "$workdir" stop --no-backup >/dev/null 2>&1 || true
supabase --workdir "$workdir" db start

run_sql() {
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$db_container" \
    psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

sed '/^CREATE SCHEMA public;$/d' "$migrations_dir/$baseline" | run_sql >/dev/null
for file in "$migrations_dir"/[0-9]*_*.sql; do
  [ "$(basename "$file")" = "$baseline" ] && continue
  run_sql >/dev/null <"$file"
done
echo "Migrations appliquées."

failed=0
for file in "${test_files[@]}"; do
  echo "== $(basename "$file")"
  # Les NOTICE « ok … » des tests s'affichent ; la première erreur arrête le fichier.
  if ! docker exec -i -e PGOPTIONS="-c client_min_messages=notice" "$db_container" \
    psql -X -q -t -v ON_ERROR_STOP=1 -U postgres -d postgres <"$file" 2>&1 |
    sed -n 's/^.*NOTICE:  //p; s/^.*ERROR:  /ERREUR : /p' >"$workdir/out.txt"; then
    failed=1
  fi
  cat "$workdir/out.txt"
  if grep -q '^ERREUR' "$workdir/out.txt"; then
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "Des tests SQL échouent." >&2
  exit 1
fi
echo "Tests SQL : tout passe."
