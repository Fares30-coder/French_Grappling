#!/bin/bash
# Restore test (ADR 0005 D7), run on Fares's computer, never on the server.
# Downloads the latest dump, decrypts it, restores it into a throwaway database of the local
# PostgreSQL 17 (docker-compose.yml, `pnpm db:up`), checks it, and compares a content export with
# the local clone of tatamap-content.
#   AGE_IDENTITY=~/path/age-key.txt RCLONE_REMOTE=ovh:bucket/db CONTENT_CLONE=~/tatamap-content \
#     RCLONE_CONFIG=~/rclone.conf deploy/scripts/restore-test.sh
set -euo pipefail

: "${AGE_IDENTITY:?path of the age private key}" "${RCLONE_REMOTE:?rclone remote:path of the backups}" \
  "${CONTENT_CLONE:?local clone of tatamap-content}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

latest="$(rclone lsf "$RCLONE_REMOTE" | sort | tail -n 1)"
[ -n "$latest" ] || { echo "no backup found" >&2; exit 1; }
echo "==> latest dump: $latest"
rclone copy "$RCLONE_REMOTE/$latest" "$WORK"
age -d -i "$AGE_IDENTITY" -o "$WORK/db.dump" "$WORK/$latest"

cd "$ROOT"
pg() { docker compose exec -T db "$@"; }
pg dropdb -U tatamap --if-exists tatamap_restore
pg createdb -U tatamap tatamap_restore
pg pg_restore -U tatamap -d tatamap_restore --no-owner < "$WORK/db.dump"

q() { pg psql -U tatamap -d tatamap_restore -At -c "$1"; }
echo "last migration: $(q 'select migration_name from _prisma_migrations order by finished_at desc limit 1')"
echo "published techniques: $(q "select count(*) from \"Technique\" where status = 'published'")"

echo "==> content export vs $CONTENT_CLONE"
mkdir -p "$WORK/export"
DATABASE_URL="postgresql://tatamap:tatamap@localhost:${DB_PORT:-5432}/tatamap_restore" \
  CONTENT_DIR="$WORK/export" pnpm content:export >/dev/null
for item in positions.json tags.json techniques; do
  diff -r "$WORK/export/$item" "$CONTENT_CLONE/$item" && echo "same: $item"
done
echo "OK. Note today's date in deploy/README.md (last restore test)."
