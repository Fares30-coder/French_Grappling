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
# Same port as `pnpm db:up`: DB_PORT of the root .env when set there.
db_port="${DB_PORT:-$(sed -n 's/^DB_PORT=//p' .env 2>/dev/null | tail -n 1)}"
DATABASE_URL="postgresql://restore_user:restore@localhost:${db_port:-5432}/tatamap_restore" \
  CONTENT_DIR="$WORK/export" pnpm content:export >/dev/null
# Compared on substance: the files of the content repo are not all in the export's canonical form
# (48.0 written by the Python tools, key order, chain order).
norm='walk(if type == "number" then . + 0
  elif type == "array" and length > 0 and (.[0] | type == "object" and has("to")) then sort_by(.to, .type)
  else . end)'
same() { cmp -s <(jq -S "$norm" "$1") <(jq -S "$norm" "$2"); }
bad=0
for f in positions.json tags.json; do
  same "$WORK/export/$f" "$CONTENT_CLONE/$f" || { echo "differs: $f"; bad=1; }
done
for name in $( (cd "$WORK/export/techniques" && ls; cd "$CONTENT_CLONE/techniques" && ls) | sort -u); do
  [ -f "$WORK/export/techniques/$name" ] && [ -f "$CONTENT_CLONE/techniques/$name" ] \
    || { echo "only on one side: techniques/$name"; bad=1; continue; }
  same "$WORK/export/techniques/$name" "$CONTENT_CLONE/techniques/$name" || { echo "differs: techniques/$name"; bad=1; }
done
[ "$bad" = 0 ] || { echo "FAILED: the restored content is not the content of $CONTENT_CLONE" >&2; exit 1; }
echo "OK: same content as $CONTENT_CLONE. Note today's date in deploy/README.md (last restore test)."
