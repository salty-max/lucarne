#!/usr/bin/env bash
# Seed a fresh Lucarne deployment in one shot:
#   1. reference data (competitions, broadcasters, broadcast rules)
#   2. the full-season fixture calendar
#   3. post-match details, looped until the backlog is drained
#
# The details drain is budget-gated + request-capped server-side, so it must be
# called repeatedly until it reports `matches: 0` — this script does that for you.
#
# Usage:
#   scripts/seed-prod.sh <base-url> <cron-secret>
#   URL=https://…code.run CRON_SECRET=… scripts/seed-prod.sh
set -euo pipefail

URL="${1:-${URL:-}}"
SECRET="${2:-${CRON_SECRET:-}}"

if [ -z "$URL" ] || [ -z "$SECRET" ]; then
  echo "usage: $0 <base-url> <cron-secret>   (or set URL and CRON_SECRET)" >&2
  exit 2
fi
URL="${URL%/}" # drop a trailing slash so "$URL$path" is clean

AUTH="Authorization: Bearer $SECRET"
MAX_PASSES=300 # safety net so a server-side bug can't loop forever

# curl one endpoint. Prints the response body on stdout; returns non-zero (with a
# message on stderr) on any non-2xx, so callers can `|| exit`.
call() {
  local method="$1" path="$2" out status
  if ! out="$(curl -sS -X "$method" -H "$AUTH" -w $'\n%{http_code}' "$URL$path")"; then
    echo "✗ $method $path — curl failed (network / bad URL?)" >&2
    return 1
  fi
  status="${out##*$'\n'}" # last line = the HTTP status
  out="${out%$'\n'*}"      # everything before it = the body
  case "$status" in
    2*) printf '%s' "$out"; return 0 ;;
    401) echo "✗ 401 Unauthorized — the CRON_SECRET does not match." >&2; return 1 ;;
    *)
      echo "✗ $method $path → HTTP $status" >&2
      printf '%s\n' "$out" >&2
      return 1
      ;;
  esac
}

# Pull an integer field out of a small JSON object (avoids a jq dependency).
json_int() {
  sed -n "s/.*\"$1\":\(-\{0,1\}[0-9]\{1,\}\).*/\1/p"
}

echo "→ 1/3  seed — reference data (competitions, broadcasters, rules)"
call POST /api/admin/seed >/dev/null || exit 1
echo "  ✓ done"

echo "→ 2/3  resync — full-season fixture calendar"
call GET /api/cron/resync >/dev/null || exit 1
echo "  ✓ done"

echo "→ 3/3  backfill — post-match details (looping until drained)"
pass=0
while :; do
  pass=$((pass + 1))
  resp="$(call POST /api/admin/backfill-details)" || exit 1
  matches="$(printf '%s' "$resp" | json_int matches)"
  budget="$(printf '%s' "$resp" | json_int budgetRemaining)"
  echo "  pass $pass — matches: ${matches:-0}  budget: ${budget:-?}"
  if [ "${matches:-0}" = "0" ]; then
    break
  fi
  if [ "$pass" -ge "$MAX_PASSES" ]; then
    echo "  ⚠ stopped after $MAX_PASSES passes (still matches>0 — check the budget)" >&2
    break
  fi
  sleep 2
done

echo "✓ seeding complete in $pass backfill pass(es)."
