#!/usr/bin/env bash
#
# Pull-based deploy. The VM checks GitHub for new commits on main and updates
# itself; GitHub is never given a key to this box. Run from a systemd timer.
#
#   bash scripts/self-update.sh          # deploy if main moved
#   FORCE=1 bash scripts/self-update.sh  # rebuild and restart even if it didn't
#
# Order matters: snapshot, build, migrate, restart, verify. Anything that fails
# rolls back to the commit that was running, and a failed migration restores the
# snapshot — Drizzle migrations do not have a down path, so the copy is the only
# way back.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lucarne}"
BRANCH="${BRANCH:-main}"
DB="${DB:-$APP_DIR/apps/api/local.db}"
BUN="${BUN:-$HOME/.bun/bin/bun}"
PORT="${PORT:-3000}"

log()  { printf '[deploy] %s\n' "$*"; }
die()  { printf '[deploy] FAILED: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

# Never clobber work done directly on the box — surface it instead.
if [ -n "$(git status --porcelain)" ]; then
  die "working tree is dirty; refusing to deploy over local changes"
fi

git fetch --quiet origin "$BRANCH"
current=$(git rev-parse HEAD)
target=$(git rev-parse "origin/$BRANCH")

if [ "$current" = "$target" ] && [ -z "${FORCE:-}" ]; then
  exit 0        # nothing to do, and nothing to say about it
fi

log "$(git rev-parse --short HEAD) -> $(git rev-parse --short "origin/$BRANCH")"

# --- snapshot before touching anything --------------------------------------
snapshot="/var/tmp/lucarne-predeploy-$(date -u +%Y%m%dT%H%M%SZ).db"
if [ -f "$DB" ]; then
  sqlite3 "$DB" ".backup '$snapshot'"
  log "database snapshot: $snapshot"
fi

rollback() {
  log "rolling back to $(git rev-parse --short "$current")"
  git reset --hard --quiet "$current"
  if [ -f "$snapshot" ]; then
    cp "$snapshot" "$DB"
    log "database restored from the pre-deploy snapshot"
  fi
  "$BUN" install --frozen-lockfile >/dev/null 2>&1 || true
  "$BUN" run build >/dev/null 2>&1 || true
  sudo systemctl restart lucarne || true
}

# --- build, before anything is swapped in ------------------------------------
git merge --ff-only --quiet "origin/$BRANCH" \
  || die "cannot fast-forward — main was rewritten, resolve by hand"

if ! "$BUN" install --frozen-lockfile; then
  git reset --hard --quiet "$current"; die "bun install failed; nothing was changed"
fi

# A failed build has not restarted anything yet, so the old process is still
# serving the old dist — reverting the checkout is enough.
if ! "$BUN" run build; then
  git reset --hard --quiet "$current"
  "$BUN" install --frozen-lockfile >/dev/null 2>&1 || true
  "$BUN" run build >/dev/null 2>&1 || true
  die "build failed; still running $(git rev-parse --short HEAD)"
fi

if ! "$BUN" run db:migrate; then
  rollback; die "migration failed; rolled back"
fi

# --- restart and prove it actually serves ------------------------------------
sudo systemctl restart lucarne

verify() {
  # Deliberately narrower than scripts/healthcheck.sh: that one fails on things
  # like an empty backup bucket, which must not trigger a rollback.
  local waited=0 code
  while [ "$waited" -lt 30 ]; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/api/schedule" || true)
    [ "$code" = 200 ] && return 0
    sleep 2; waited=$((waited + 2))
  done
  return 1
}

if ! verify; then
  rollback; die "new version did not serve after 30s; rolled back"
fi

log "deployed $(git rev-parse --short HEAD)"

# Keep a couple of pre-deploy snapshots around, not every one ever taken.
ls -1t /var/tmp/lucarne-predeploy-*.db 2>/dev/null | tail -n +4 | xargs -r rm -f
