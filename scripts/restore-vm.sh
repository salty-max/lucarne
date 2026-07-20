#!/usr/bin/env bash
#
# Rebuild state on a fresh box from the R2 backups written by scripts/backup.sh.
# Run it after bootstrap-vm.sh has cloned and built, and before first start.
#
#   bash scripts/restore-vm.sh              # newest snapshot
#   bash scripts/restore-vm.sh 20260720T1400Z   # a specific one
#
# Restoring the secrets bundle is what keeps recovery invisible to users: the
# VAPID keypair comes back (already-installed PWAs keep receiving pushes) and so
# do the tunnel credentials (the hostname keeps resolving — no DNS change).
#
# Prerequisites on the new box: rclone configured with the "r2" remote, and the
# backup passphrase. Both live in your password manager, not here.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lucarne}"
DB="${DB:-$APP_DIR/apps/api/local.db}"
REMOTE="${REMOTE:-r2:lucarne-backup}"
PASS_FILE="${PASS_FILE:-/etc/lucarne-backup.pass}"
WANT="${1:-latest}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }

# Matches backup.sh: a bucket-scoped R2 token rejects rclone's bucket probe.
rc() { rclone --s3-no-check-bucket "$@"; }

command -v rclone  >/dev/null || die "rclone is not installed (apt install rclone, then: rclone config)"
command -v sqlite3 >/dev/null || die "sqlite3 is not installed"
[ -r "$PASS_FILE" ] || die "cannot read $PASS_FILE — create it with the passphrase from your password manager"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --- database ---------------------------------------------------------------
if [ "$WANT" = latest ]; then src="$REMOTE/db/latest.db"; else src="$REMOTE/db/lucarne-$WANT.db"; fi
say "Fetching $src"
rc copyto "$src" "$tmp/lucarne.db" || die "no such snapshot — rclone lsf $REMOTE/db/"

sqlite3 "$tmp/lucarne.db" "pragma integrity_check;" | grep -qx ok \
  || die "downloaded snapshot is corrupt — try an older one"

rows=$(sqlite3 "$tmp/lucarne.db" "select count(*) from matches;")
subs=$(sqlite3 "$tmp/lucarne.db" "select count(*) from push_subscription;")
say "Snapshot looks sane: $rows matches, $subs push subscriptions"

# Never silently overwrite a database that is already here and may be newer.
if [ -f "$DB" ]; then
  mv "$DB" "$DB.replaced-$(date -u +%Y%m%dT%H%M%SZ)"
  say "Existing database moved aside, not deleted"
fi
mkdir -p "$(dirname "$DB")"
cp "$tmp/lucarne.db" "$DB"

# --- secrets ----------------------------------------------------------------
say "Fetching secrets bundle"
if rc copyto "$REMOTE/secrets.tar.gz.enc" "$tmp/secrets.tar.gz.enc" 2>/dev/null; then
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -in "$tmp/secrets.tar.gz.enc" -out "$tmp/secrets.tar.gz" \
    -pass "file:$PASS_FILE" || die "decryption failed — wrong passphrase in $PASS_FILE"

  mkdir -p "$tmp/secrets" && tar -C "$tmp/secrets" -xzf "$tmp/secrets.tar.gz"

  if [ -f "$tmp/secrets/env.local" ]; then
    install -m 600 "$tmp/secrets/env.local" "$APP_DIR/apps/api/.env.local"
    say "Restored apps/api/.env.local (same VAPID keypair — installed PWAs keep working)"
  fi
  if [ -d "$tmp/secrets/cloudflared" ]; then
    cp -r "$tmp/secrets/cloudflared" "$HOME/.cloudflared"
    chmod 700 "$HOME/.cloudflared"; chmod 600 "$HOME"/.cloudflared/* 2>/dev/null || true
    say "Restored tunnel credentials — 'sudo cloudflared service install' and DNS is unchanged"
  fi
else
  say "No secrets bundle found — you will need to write apps/api/.env.local by hand"
fi

cat <<EOF

  Restored. Do NOT run db:seed — the snapshot already carries the reference data,
  and seeding on top would be redundant work at best.

  Next:
    sudo systemctl start lucarne && journalctl -u lucarne -f
    sudo cloudflared service install

EOF
