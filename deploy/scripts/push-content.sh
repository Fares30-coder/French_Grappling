#!/bin/bash
# Sends the site content to the VPS and imports it (ADR 0005 D5). Run on Fares's computer.
# The content never goes through GitHub or an image. Only positions, tags and techniques are sent
# (not marketing/, not references/, not .git).
# Connects as `deploy` (owner of /opt/tatamap, docker group) with Fares's personal key, installed by
# bootstrap-vps.sh; `fares` cannot read /opt/tatamap (750) nor its .env (600).
#   DEPLOY_TARGET=deploy@<host> deploy/scripts/push-content.sh ~/tatamap-content
set -euo pipefail

: "${DEPLOY_TARGET:?ssh target, e.g. deploy@<host>}"
src="${1:?path of the local clone of tatamap-content}"
[ -f "$src/positions.json" ] && [ -d "$src/techniques" ] || { echo "not a content folder: $src" >&2; exit 1; }

remote=/opt/tatamap/content
ssh "$DEPLOY_TARGET" "mkdir -p $remote"
# No --chmod: the rsync of macOS (openrsync) does not have it. Permissions are set on the server.
rsync -az --delete -e ssh \
  "$src/positions.json" "$src/tags.json" "$src/techniques" "$DEPLOY_TARGET:$remote/"
ssh "$DEPLOY_TARGET" "chmod -R u=rwX,go=rX $remote"

# Validates everything before writing, upserts by slug: safe to run twice.
ssh "$DEPLOY_TARGET" "cd /opt/tatamap && docker compose --env-file .env -f repo/deploy/compose.prod.yml \
  run --rm -T -v $remote:/content:ro -e CONTENT_DIR=/content tools pnpm content:import"
