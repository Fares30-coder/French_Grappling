#!/bin/bash
# Daily encrypted database backup (ADR 0005 D7). Run by a systemd timer at 03:30 as `deploy`.
#   backup.sh              dump, encrypt, keep 7 local files, upload, prune remote, ping
#   backup.sh --local-only dump and encrypt only (used by deploy.sh before a migration)
# The dump is encrypted with the PUBLIC age key: the server cannot read its own backups.
# Config in /etc/tatamap/backup.env (chmod 600): AGE_RECIPIENT, RCLONE_REMOTE (e.g. "ovh:bucket/db"),
# PING_URL; the S3 credentials are in /etc/tatamap/rclone.conf.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tatamap}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tatamap}"
HERE="$(cd "$(dirname "$0")" && pwd)"
local_only=0
[ "${1:-}" = "--local-only" ] && local_only=1

set -a; . /etc/tatamap/backup.env; set +a
export RCLONE_CONFIG="${RCLONE_CONFIG:-/etc/tatamap/rclone.conf}"

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/tatamap-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
tmp="$file.part"
trap 'rm -f "$tmp"' EXIT

# pg_dump runs inside the db container: same version as the server. pipefail catches a failed dump.
docker compose --env-file "$APP_DIR/.env" -f "$HERE/../compose.prod.yml" \
  exec -T db pg_dump -U tatamap -Fc tatamap | age -r "$AGE_RECIPIENT" -o "$tmp"
[ -s "$tmp" ] || { echo "empty backup" >&2; exit 1; }
mv "$tmp" "$file"

# Keep the 7 newest local files.
ls -1t "$BACKUP_DIR"/tatamap-*.dump.age | tail -n +8 | xargs -r rm -f

[ "$local_only" = 1 ] && { echo "local backup: $file"; exit 0; }

rclone copy "$file" "$RCLONE_REMOTE"
rclone delete --min-age 35d "$RCLONE_REMOTE"
curl -fsS --max-time 10 "$PING_URL" >/dev/null
echo "backup done: $file"
