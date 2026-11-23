#!/bin/bash
# Deploys the images tagged <sha> (ADR 0005 D4). Run on the VPS by tatamap-deploy.
# Order: pull, local backup, migrations (a failure stops here, nothing in service is touched),
# restart, health check through Caddy.
set -euo pipefail

sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <40-hex sha>" >&2; exit 2; }

APP_DIR="${APP_DIR:-/opt/tatamap}"
ENV_FILE="$APP_DIR/.env"
HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$HERE/../compose.prod.yml"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# The shell wins over --env-file: this is the tag every compose call below uses.
export TAG="$sha"

echo "==> pull $sha"
compose pull

echo "==> start the database and take a local backup"
compose up -d --wait db
"$HERE/backup.sh" --local-only

echo "==> migrations"
compose run --rm tools pnpm --filter @tatamap/api exec prisma migrate deploy

echo "==> restart"
compose up -d --remove-orphans

echo "==> health check"
set -a; . "$ENV_FILE"; set +a
for _ in $(seq 1 30); do
  # Through Caddy, to the local port: checks the whole chain without depending on DNS.
  if curl -fsS --max-time 5 --resolve "$SITE_DOMAIN:443:127.0.0.1" "https://$SITE_DOMAIN/api/health" >/dev/null; then
    ok=1; break
  fi
  sleep 2
done
[ "${ok:-0}" = 1 ] || { echo "health check failed" >&2; compose logs --tail 50 api caddy >&2; exit 1; }

# Only now remember the tag, so manual `docker compose` calls use the running version.
if grep -q '^TAG=' "$ENV_FILE"; then sed -i "s/^TAG=.*/TAG=$sha/" "$ENV_FILE"; else echo "TAG=$sha" >> "$ENV_FILE"; fi
docker image prune -f >/dev/null
echo "deployed $sha"
