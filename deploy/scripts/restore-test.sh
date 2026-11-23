#!/bin/bash
# Restore test (ADR 0005 D7), run on Fares's computer, never on the server.
# Downloads ONE dump chosen by name, decrypts it, restores it into a throwaway database of the local
# PostgreSQL 17 (docker-compose.yml, `pnpm db:up`), checks it, and compares a content export with
# the local clone of tatamap-content.
#   AGE_IDENTITY=~/path/age-key.txt RCLONE_REMOTE=ovh:bucket/db CONTENT_CLONE=~/tatamap-content \
#     RCLONE_CONFIG=~/rclone.conf deploy/scripts/restore-test.sh tatamap-20261101T033000Z.dump.age
# The object is named on purpose, never "the newest": whoever can write to the bucket controls what
# sorts last. List with `rclone lsf "$RCLONE_REMOTE"`, pick a name whose date you expect (or a
# bucket version). The dump is restored by a role that is NOT a superuser, into a database it owns.
set -euo pipefail

: "${AGE_IDENTITY:?path of the age private key}" "${RCLONE_REMOTE:?rclone remote:path of the backups}" \
  "${CONTENT_CLONE:?local clone of tatamap-content}"
object="${1:-}"
[[ "$object" =~ ^tatamap-[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]] \
  || { echo "usage: restore-test.sh tatamap-<YYYYMMDDTHHMMSSZ>.dump.age" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> dump: $object"
rclone copyto "$RCLONE_REMOTE/$object" "$WORK/$object"
age -d -i "$AGE_IDENTITY" -o "$WORK/db.dump" "$WORK/$object"

cd "$ROOT"
pg() { docker compose exec -T db "$@"; }
# Throwaway role without superuser rights: SQL inside the dump cannot touch the rest of the server.
pg psql -U tatamap -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS tatamap_restore"
pg psql -U tatamap -d postgres -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS restore_user"
pg psql -U tatamap -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE restore_user LOGIN PASSWORD 'restore' NOSUPERUSER NOCREATEDB NOCREATEROLE"
pg psql -U tatamap -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE tatamap_restore OWNER restore_user"
pg pg_restore -U restore_user -d tatamap_restore --no-owner --no-privileges < "$WORK/db.dump"

q() { pg psql -U restore_user -d tatamap_restore -At -c "$1"; }
echo "last migration: $(q 'select migration_name from _prisma_migrations order by finished_at desc limit 1')"
echo "published techniques: $(q "select count(*) from \"Technique\" where status = 'published'")"

echo "==> content export vs $CONTENT_CLONE"
mkdir -p "$WORK/export"
DATABASE_URL="postgresql://restore_user:restore@localhost:${DB_PORT:-5432}/tatamap_restore" \
  CONTENT_DIR="$WORK/export" pnpm content:export >/dev/null
for item in positions.json tags.json techniques; do
  diff -r "$WORK/export/$item" "$CONTENT_CLONE/$item" && echo "same: $item"
done
echo "OK. Note today's date in deploy/README.md (last restore test)."
