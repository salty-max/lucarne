#!/usr/bin/env bash
#
# Snapshot everything that must outlive the box, to Cloudflare R2.
#
# The database is ~1.5 MB, so this takes a full consistent copy rather than
# replicating a WAL — simpler, and cheap enough to run every 15 minutes.
# Two objects are kept:
#
#   db/lucarne-<timestamp>.db   rotating snapshots (+ a "latest" pointer)
#   secrets.tar.gz.enc          .env.local + cloudflared credentials, AES-256
#
# Restoring both onto a fresh instance is what makes reclamation a non-event:
# same VAPID keypair (installed PWAs keep working), same tunnel credentials
# (DNS never moves). See scripts/restore-vm.sh.
#
# Setup, once:
#   rclone config              # remote named "r2", type s3, provider Cloudflare
#   sudo install -m 600 /dev/null /etc/lucarne-backup.pass
#   sudo vi /etc/lucarne-backup.pass          # one long random line
#
# Keep THREE things in your password manager. Everything else is recoverable:
#   1. the R2 access key id + secret
#   2. the contents of /etc/lucarne-backup.pass
#   3. (belt and braces) the VAPID keypair

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lucarne}"
DB="${DB:-$APP_DIR/apps/api/local.db}"
REMOTE="${REMOTE:-r2:lucarne-backup}"
PASS_FILE="${PASS_FILE:-/etc/lucarne-backup.pass}"
KEEP="${KEEP:-48}"          # snapshots to retain; 48 x 15 min = 12 h of history

die() { printf 'backup: %s\n' "$*" >&2; exit 1; }

[ -f "$DB" ]        || die "no database at $DB"
[ -r "$PASS_FILE" ] || die "cannot read $PASS_FILE"
command -v rclone   >/dev/null || die "rclone is not installed"
command -v sqlite3  >/dev/null || die "sqlite3 is not installed"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

# --- database ---------------------------------------------------------------
# .backup takes a crash-consistent copy while the server keeps writing;
# copying the file directly can capture a torn page mid-transaction.
sqlite3 "$DB" ".backup '$tmp/lucarne.db'"
sqlite3 "$tmp/lucarne.db" "pragma integrity_check;" | grep -qx ok \
  || die "snapshot failed integrity_check — not uploading"

rclone copyto "$tmp/lucarne.db" "$REMOTE/db/lucarne-$stamp.db"
rclone copyto "$tmp/lucarne.db" "$REMOTE/db/latest.db"

# --- secrets ----------------------------------------------------------------
# Small and near-static, but they are the difference between a 10-minute
# recovery and re-enrolling every device by hand. Re-uploaded each run so the
# tunnel credentials stay in sync; encrypted so R2 never sees plaintext.
stage="$tmp/secrets"
mkdir -p "$stage"
[ -f "$APP_DIR/apps/api/.env.local" ] && cp "$APP_DIR/apps/api/.env.local" "$stage/env.local"
[ -d "$HOME/.cloudflared" ] && cp -r "$HOME/.cloudflared" "$stage/cloudflared"

if [ -n "$(ls -A "$stage")" ]; then
  tar -C "$stage" -czf "$tmp/secrets.tar.gz" .
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -in "$tmp/secrets.tar.gz" -out "$tmp/secrets.tar.gz.enc" \
    -pass "file:$PASS_FILE"
  rclone copyto "$tmp/secrets.tar.gz.enc" "$REMOTE/secrets.tar.gz.enc"
else
  printf 'backup: warning — no secrets found to back up\n' >&2
fi

# --- rotation ---------------------------------------------------------------
mapfile -t old < <(rclone lsf "$REMOTE/db/" --include 'lucarne-*.db' | sort -r | tail -n "+$((KEEP + 1))")
for f in "${old[@]:-}"; do
  [ -n "$f" ] && rclone deletefile "$REMOTE/db/$f"
done

printf 'backup: ok — db/lucarne-%s.db (%s), %d snapshots retained\n' \
  "$stamp" "$(du -h "$tmp/lucarne.db" | cut -f1)" \
  "$(rclone lsf "$REMOTE/db/" --include 'lucarne-*.db' | wc -l)"
