#!/usr/bin/env bash
#
# Bootstrap Lucarne on a fresh always-on Linux box (tested against Oracle Cloud
# Ubuntu 24.04 on Ampere ARM64). Idempotent: safe to re-run after a failure or
# to pull a new revision.
#
#   curl -fsSL https://raw.githubusercontent.com/salty-max/lucarne/main/scripts/bootstrap-vm.sh | bash
#   # or, once cloned:  bash scripts/bootstrap-vm.sh
#
# It never writes secrets. It stops after the build and asks you to fill in
# apps/api/.env.local yourself; run it again to finish migrate + seed + systemd.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lucarne}"
APP_USER="${APP_USER:-$(id -un)}"
REPO="${REPO:-https://github.com/salty-max/lucarne.git}"
BUN="$HOME/.bun/bin/bun"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }

# --- 0. Swap, if the box is small -------------------------------------------
# The Vite build peaks well above 1 GB. The Always Free AMD micro shape has
# exactly 1 GB and will OOM-kill the build without swap; Ampere (6-24 GB) skips this.
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3500 ] && [ ! -f /swapfile ]; then
  say "Only ${mem_mb} MB RAM — adding 2 GB of swap so the web build survives"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# --- 1. Packages + Bun -------------------------------------------------------
say "Installing base packages"
sudo apt-get update -qq
sudo apt-get install -y -qq git unzip curl sqlite3

if [ ! -x "$BUN" ]; then
  say "Installing Bun"
  curl -fsSL https://bun.sh/install | bash
fi
"$BUN" --version >/dev/null || die "bun did not install correctly"

# --- 2. Code ----------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  say "Updating $APP_DIR"
  git -C "$APP_DIR" pull --ff-only
else
  say "Cloning into $APP_DIR"
  sudo mkdir -p "$APP_DIR"
  sudo chown "$APP_USER":"$APP_USER" "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

say "Installing dependencies and building the SPA"
"$BUN" install
"$BUN" run build

# --- 3. Secrets (yours to write) --------------------------------------------
ENV_FILE="$APP_DIR/apps/api/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/apps/api/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  cat <<EOF

  Created $ENV_FILE from the template, with placeholder values.

  REBUILDING a reclaimed instance? Don't fill this in by hand — restore it:

    sudo apt-get install -y rclone
    rclone config                                  # remote "r2", from your password manager
    sudo install -m 600 /dev/null /etc/lucarne-backup.pass && sudo vi /etc/lucarne-backup.pass
    bash scripts/restore-vm.sh                     # database + secrets, then re-run this script

  FIRST install? Fill it in now — API_FOOTBALL_KEY, CRON_SECRET, VAPID_* — then
  re-run this script. Keep the VAPID keypair somewhere safe: regenerate it and
  every already-installed PWA silently stops receiving notifications.

    openssl rand -hex 32     # a fine CRON_SECRET

EOF
  exit 0
fi

if grep -qE '"(your_|generate_a_)' "$ENV_FILE"; then
  die "$ENV_FILE still has placeholder values — fill it in, then re-run."
fi
chmod 600 "$ENV_FILE"

# --- 4. Database -------------------------------------------------------------
# Seed before the first start: the fixture sync refuses to run without competitions.
# A restored snapshot already carries them, so only seed a genuinely empty database
# — re-seeding a restore is wasted work, and migrations must still run either way.
DB_FILE="$APP_DIR/apps/api/local.db"
restored=0
if [ -f "$DB_FILE" ] && [ "$(sqlite3 "$DB_FILE" "select count(*) from competitions;" 2>/dev/null || echo 0)" -gt 0 ]; then
  restored=1
fi

say "Applying migrations"
"$BUN" run db:migrate

if [ "$restored" -eq 1 ]; then
  say "Existing database detected ($(sqlite3 "$DB_FILE" 'select count(*) from matches;') matches) — skipping seed"
else
  say "Seeding reference data (broadcasters, competitions, rights rules)"
  "$BUN" run db:seed
fi

# --- 5. systemd --------------------------------------------------------------
say "Installing the lucarne service"
sudo tee /etc/systemd/system/lucarne.service >/dev/null <<EOF
[Unit]
Description=Lucarne (API + SPA + scheduler)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/apps/api
EnvironmentFile=$ENV_FILE
ExecStart=$BUN src/server.ts
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now lucarne
sleep 3
sudo systemctl is-active --quiet lucarne || die "service failed to start — journalctl -u lucarne -n 50"

# --- 6. Backup timer ---------------------------------------------------------
# Only wired up once rclone and the passphrase exist, so a first install doesn't
# spend every 15 minutes writing failures into the journal.
if command -v rclone >/dev/null && [ -r /etc/lucarne-backup.pass ]; then
  say "Installing the 15-minute backup timer"
  sudo tee /etc/systemd/system/lucarne-backup.service >/dev/null <<EOF
[Unit]
Description=Lucarne backup to R2
After=network-online.target

[Service]
Type=oneshot
User=$APP_USER
Environment=APP_DIR=$APP_DIR
# Pin the rclone config explicitly. Under systemd, HOME is not always what an
# interactive shell would give you, and rclone silently has no remotes without
# it — the backup would then fail every 15 minutes into the journal.
Environment=RCLONE_CONFIG=$HOME/.config/rclone/rclone.conf
ExecStart=/bin/bash $APP_DIR/scripts/backup.sh
EOF
  sudo tee /etc/systemd/system/lucarne-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Lucarne backup every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now lucarne-backup.timer
  sudo systemctl start lucarne-backup.service   # prove it works now, not in 15 minutes
  sudo systemctl is-failed --quiet lucarne-backup.service \
    && die "first backup failed — journalctl -u lucarne-backup -n 30" || true
  say "Backups running — $(sudo -u "$APP_USER" rclone lsf "${REMOTE:-r2:lucarne-backup}/db/" 2>/dev/null | wc -l) snapshot(s) in R2"
else
  say "Backups NOT configured (no rclone / no /etc/lucarne-backup.pass) — see README"
fi

say "Up. Checking it answers locally:"
curl -fsS -o /dev/null -w '  GET /api/schedule -> %{http_code}\n' http://localhost:3000/api/schedule
curl -fsS -o /dev/null -w '  GET /              -> %{http_code}\n' http://localhost:3000/

cat <<EOF

  Done. Next: expose it with a Cloudflare Tunnel (no inbound ports needed) —
  see the "Deploy" section of README.md, step 4.

  Logs:    journalctl -u lucarne -f
  Restart: sudo systemctl restart lucarne

EOF
