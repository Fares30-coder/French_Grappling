#!/bin/bash
# One-time setup of a fresh Debian VPS (ADR 0005 D8, deploy/README.md steps 1 to 5). Idempotent:
# safe to run again after a change. Run as root, from a folder holding this script and tatamap-deploy:
#   scp deploy/scripts/{bootstrap-vps.sh,tatamap-deploy} <first user>@<host>:
#   ssh <first user>@<host> sudo ADMIN_KEY="$(cat ~/.ssh/id_ed25519.pub)" CI_KEY="ssh-ed25519 AAAA... tatamap-ci" \
#     bash bootstrap-vps.sh
# ADMIN_KEY: personal public key of the admin user (fares, sudo) and of deploy for push-content.sh.
# CI_KEY: public key of the CI (optional, bound to the forced command); add it later by running again.
# The SSH lock-down (AllowUsers fares deploy) only applies once fares has a key: keep the current
# session open until `ssh fares@<host>` works from another terminal.
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
. /etc/os-release
[ "$ID" = debian ] || { echo "Debian only (found $ID)" >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/tatamap-deploy" ] || { echo "tatamap-deploy must sit next to this script" >&2; exit 1; }

ADMIN_USER="${ADMIN_USER:-fares}"
ADMIN_KEY="${ADMIN_KEY:-}"
CI_KEY="${CI_KEY:-}"
key_re='^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+( .*)?$'
for k in "$ADMIN_KEY" "$CI_KEY"; do
  [ -z "$k" ] || [[ "$k" =~ $key_re ]] || { echo "not a public key: ${k:0:30}..." >&2; exit 1; }
done
export DEBIAN_FRONTEND=noninteractive

echo "==> packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw fail2ban python3-systemd unattended-upgrades \
  age rclone sudo >/dev/null

echo "==> docker (official repository)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null

echo "==> accounts"
# authorized_keys line: adds $2 to $1's keys unless already there.
add_key() {
  local user="$1" line="$2" home
  home="$(getent passwd "$user" | cut -d: -f6)"
  install -d -o "$user" -g "$user" -m 700 "$home/.ssh"
  touch "$home/.ssh/authorized_keys"
  grep -qxF "$line" "$home/.ssh/authorized_keys" || echo "$line" >> "$home/.ssh/authorized_keys"
  chown "$user:$user" "$home/.ssh/authorized_keys"; chmod 600 "$home/.ssh/authorized_keys"
}
id "$ADMIN_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$ADMIN_USER"
usermod -aG sudo "$ADMIN_USER"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
if [ -n "$ADMIN_KEY" ]; then
  add_key "$ADMIN_USER" "$ADMIN_KEY"
  # deploy runs docker compose: the admin pushes content as deploy (same rights as the docker group).
  add_key deploy "$ADMIN_KEY"
fi
[ -z "$CI_KEY" ] || add_key deploy "restrict,command=\"/usr/local/bin/tatamap-deploy\" $CI_KEY"
install -o root -g root -m 755 "$HERE/tatamap-deploy" /usr/local/bin/tatamap-deploy

echo "==> folders"
install -d -o deploy -g deploy -m 750 /opt/tatamap
install -d -o root -g deploy -m 750 /etc/tatamap
install -d -o deploy -g deploy -m 700 /var/backups/tatamap
if [ ! -f /opt/tatamap/.env ]; then
  # Secrets generated here, never typed; the rest (domain, email, prelaunch) is filled by hand.
  umask 077
  cat > /opt/tatamap/.env <<EOF
NODE_ENV=production
GHCR_OWNER=fares30-coder
SITE_DOMAIN=tatamap.fr
ACME_EMAIL=
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
WEB_ORIGINS=https://tatamap.fr
COOKIE_SECURE=true
TRUST_PROXY=1
LOG_LEVEL=info
CSP_PROFILE=adsense
CSP_HEADER=Content-Security-Policy-Report-Only
PRELAUNCH=on
PRELAUNCH_USER=
PRELAUNCH_HASH=
WEB_DIGEST=
API_DIGEST=
TOOLS_DIGEST=
EOF
  umask 022
  chown deploy:deploy /opt/tatamap/.env; chmod 600 /opt/tatamap/.env
fi
for f in backup.env rclone.conf; do
  [ -f "/etc/tatamap/$f" ] || install -o deploy -g deploy -m 600 /dev/null "/etc/tatamap/$f"
done

echo "==> backup timer (03:30, as deploy)"
cat > /etc/systemd/system/tatamap-backup.service <<'EOF'
[Unit]
Description=Tatamap encrypted database backup (ADR 0005 D7)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=deploy
ExecStart=/opt/tatamap/repo/deploy/scripts/backup.sh
EOF
cat > /etc/systemd/system/tatamap-backup.timer <<'EOF'
[Unit]
Description=Daily Tatamap backup

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=5m
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now tatamap-backup.timer >/dev/null

echo "==> automatic security updates (reboot at 04:30 if needed)"
cat > /etc/apt/apt.conf.d/52tatamap-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> fail2ban (sshd: 5 tries, 1 h ban)"
cat > /etc/fail2ban/jail.d/tatamap.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban

echo "==> firewall"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
for rule in 22/tcp 80/tcp 443/tcp 443/udp; do ufw allow "$rule" >/dev/null; done
ufw --force enable >/dev/null

echo "==> ssh"
admin_home="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"
if [ -s "$admin_home/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/10-tatamap.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
AllowUsers $ADMIN_USER deploy
EOF
  sshd -t
  systemctl reload ssh
  echo "ssh locked down: only $ADMIN_USER and deploy, keys only"
else
  echo "ssh NOT locked down: $ADMIN_USER has no key yet (run again with ADMIN_KEY)" >&2
fi

if ! passwd -S "$ADMIN_USER" | grep -q ' P '; then
  echo "reminder: give $ADMIN_USER a password for sudo (passwd $ADMIN_USER); ssh stays key-only" >&2
fi
cat <<EOF
bootstrap done. Next (deploy/README.md):
  - fill ACME_EMAIL, PRELAUNCH_USER, PRELAUNCH_HASH in /opt/tatamap/.env (as deploy)
  - fill /etc/tatamap/backup.env and /etc/tatamap/rclone.conf, then run backup.sh once by hand
  - run the CI deploy workflow
EOF
