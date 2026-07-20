#!/usr/bin/env bash
#
# Is this deployment actually working? Answers in one command, so "it responds"
# never gets mistaken for "it works".
#
#   bash scripts/healthcheck.sh                       # against localhost:3000
#   bash scripts/healthcheck.sh https://lucarne.fr    # against the public origin
#
# HTTP checks run anywhere. The local checks (database freshness, systemd units)
# are skipped when the box isn't the one being probed.

set -uo pipefail

BASE="${1:-http://localhost:3000}"
DB="${DB:-/opt/lucarne/apps/api/local.db}"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; pass=$((pass + 1)); }
no()   { printf '  \033[31m✗\033[0m %s\n' "$*"; fail=$((fail + 1)); }
skip() { printf '  \033[90m–\033[0m %s\n' "$*"; }

# curl already writes 000 when it cannot connect, so don't append another on failure.
code() {
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null)
  printf '%s' "${c:-000}"
}

printf '\n\033[1mHTTP — %s\033[0m\n' "$BASE"

c=$(code "$BASE/")
[ "$c" = 200 ] && ok "index responds" || no "index responds (HTTP $c)"

# The SPA fallback is what makes a deep link survive a cold load; a 404 here
# means every shared match URL is broken even though the app "works".
c=$(code "$BASE/match/1")
[ "$c" = 200 ] && ok "deep link falls back to the SPA" || no "deep link (HTTP $c — SPA fallback broken)"

body=$(curl -fsS --max-time 10 "$BASE/api/schedule" 2>/dev/null || true)
days=$(printf '%s' "$body" | grep -o '"key"' | wc -l | tr -d ' ')
fixtures=$(printf '%s' "$body" | grep -o '"kickoff"' | wc -l | tr -d ' ')
if [ "${fixtures:-0}" -gt 0 ]; then ok "/api/schedule returns $fixtures fixture(s) over $days day(s)"
elif [ "${days:-0}" -gt 0 ]; then ok "/api/schedule returns $days empty day(s) — plausible off-season"
else no "/api/schedule returned nothing at all"; fi

comps=$(curl -fsS --max-time 10 "$BASE/api/competitions" 2>/dev/null | grep -o '"slug"' | wc -l | tr -d ' ')
[ "${comps:-0}" -ge 10 ] && ok "/api/competitions returns $comps" \
  || no "/api/competitions returned ${comps:-0}, expected >= 10 (seed missing?)"

# Regression guard: /api/logs leaked the whole run history before it was put
# behind authorizeCron. Unauthenticated access must stay refused.
c=$(code "$BASE/api/logs")
[ "$c" = 401 ] && ok "/api/logs refuses unauthenticated access" \
  || no "/api/logs returned $c, expected 401 — run history is exposed"

printf '\n\033[1mBox\033[0m\n'

if [ -r "$DB" ]; then
  # run_log.at is a Unix epoch in milliseconds.
  age=$(sqlite3 "$DB" "select cast((strftime('%s','now') * 1000 - max(at)) / 3600000 as int) from run_log;" 2>/dev/null || echo "")
  if [ -z "$age" ]; then no "run_log is empty — the scheduler has never run"
  elif [ "$age" -le 2 ]; then ok "scheduler ran ${age}h ago"
  else no "scheduler last ran ${age}h ago — cron may be dead"; fi

  subs=$(sqlite3 "$DB" "select count(*) from push_subscription;" 2>/dev/null || echo 0)
  ok "$subs push subscription(s), $(sqlite3 "$DB" 'select count(*) from matches;' 2>/dev/null) matches stored"
else
  skip "database checks (no $DB here)"
fi

if command -v systemctl >/dev/null; then
  systemctl is-active --quiet lucarne && ok "lucarne.service active" || no "lucarne.service is not active"
  if systemctl list-timers lucarne-backup.timer --all >/dev/null 2>&1; then
    systemctl is-active --quiet lucarne-backup.timer \
      && ok "backup timer active" || no "backup timer is not active — no snapshots being taken"
  else
    no "backup timer not installed — the database is not being backed up"
  fi
else
  skip "systemd checks (not this box)"
fi

if command -v rclone >/dev/null && rclone listremotes 2>/dev/null | grep -q '^r2:'; then
  last=$(rclone lsf "${REMOTE:-r2:lucarne-backup}/db/" --include 'lucarne-*.db' 2>/dev/null | sort -r | head -1)
  [ -n "$last" ] && ok "most recent snapshot: $last" || no "no snapshots in R2"
else
  skip "R2 checks (no r2 remote configured)"
fi

printf '\n%d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
