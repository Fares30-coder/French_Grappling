#!/bin/bash
# Deploys one release (ADR 0005 D4). Run on the VPS by tatamap-deploy.
#   deploy.sh <sha> <web digest> <api digest> <tools digest>   new release (digests built by the CI)
#   deploy.sh <sha>                                            rollback: digests of that sha as
#                                                              recorded by an earlier deploy here
# Images are pulled by digest (sha256:...), never by a mutable tag.
# Order: pull, local backup, migrations (a failure stops here, nothing in service is touched),
# restart, health check through Caddy.
set -euo pipefail

sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: deploy.sh <40-hex sha> [<web> <api> <tools digests>]" >&2; exit 2; }

APP_DIR="${APP_DIR:-/opt/tatamap}"
ENV_FILE="$APP_DIR/.env"
RELEASES="$APP_DIR/releases.log" # one line per successful deploy: "<sha> <web> <api> <tools>"
HERE="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$HERE/../compose.prod.yml"
DIGEST_RE='^sha256:[0-9a-f]{64}$'

if [ $# -eq 4 ]; then
  web_digest="$2"; api_digest="$3"; tools_digest="$4"
elif [ $# -eq 1 ]; then
  line="$(grep "^$sha " "$RELEASES" 2>/dev/null | tail -n 1 || true)"
  [ -n "$line" ] || { echo "no digests recorded for $sha: only a version deployed here can be rolled back" >&2; exit 2; }
  read -r _ web_digest api_digest tools_digest <<<"$line"
else
  echo "usage: deploy.sh <sha> [<web> <api> <tools digests>]" >&2; exit 2
fi
for d in "$web_digest" "$api_digest" "$tools_digest"; do
  [[ "$d" =~ $DIGEST_RE ]] || { echo "invalid image digest" >&2; exit 2; }
done

# A site locked by PRELAUNCH=on (the default) needs its credentials: fail here, clearly, not in Caddy.
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d "\"'"; }
if [ "$(env_value PRELAUNCH)" != off ]; then
  [ -n "$(env_value PRELAUNCH_USER)" ] && [ -n "$(env_value PRELAUNCH_HASH)" ] \
    || { echo "PRELAUNCH is on: PRELAUNCH_USER and PRELAUNCH_HASH must be set in $ENV_FILE" >&2; exit 1; }
fi

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# The shell wins over --env-file: these are the images every compose call below uses.
export WEB_DIGEST="$web_digest" API_DIGEST="$api_digest" TOOLS_DIGEST="$tools_digest"

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
# Only what is needed from .env: it is not sourced (a value with a `$` would be expanded by the shell).
SITE_DOMAIN="$(env_value SITE_DOMAIN)"
[[ "$SITE_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "SITE_DOMAIN missing or invalid in $ENV_FILE" >&2; exit 1; }
for _ in $(seq 1 30); do
  # Through Caddy, to the local port: checks the whole chain without depending on DNS.
  if curl -fsS --max-time 5 --resolve "$SITE_DOMAIN:443:127.0.0.1" "https://$SITE_DOMAIN/api/health" >/dev/null; then
    ok=1; break
  fi
  sleep 2
done
# Container logs stay on the server: this output ends up in the public CI log.
[ "${ok:-0}" = 1 ] || { echo "health check failed; read the logs on the server (docker compose logs api caddy)" >&2; compose ps >&2; exit 1; }

# Only now remember the release, so manual `docker compose` calls use the running version.
set_env() { if grep -q "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi; }
set_env WEB_DIGEST "$web_digest"; set_env API_DIGEST "$api_digest"; set_env TOOLS_DIGEST "$tools_digest"
echo "$sha $web_digest $api_digest $tools_digest" >> "$RELEASES"
docker image prune -f >/dev/null
echo "deployed $sha"
