#!/usr/bin/env bash
#
# Dev entrypoint: runs the turbo dev servers (api + web) and, once the web server
# is up, opens a Cloudflare quick tunnel and prints its URL + QR so a phone can
# reach it. `bun run dev` calls this.
#
#   bun run dev              # servers + tunnel
#   NO_TUNNEL=1 bun run dev  # servers only, nothing published
#
# WARNING: the tunnel publishes your local dev server on the open internet for
# as long as dev runs. The hostname is random but not secret, and there is no
# auth in front of it. Quick tunnels also mint a NEW hostname each run, so an
# installed iOS PWA (tied to its origin) breaks between sessions — fine for a
# quick "open on my phone" check, not for a stable test install.

set -uo pipefail

WEB="http://localhost:5173"

# The tunnel runs in the background: wait for the web server, then open it. Kept
# to a targeted pkill on our own tunnel so Ctrl-C leaves no orphaned cloudflared
# and never touches an unrelated one.
tunnel_pid=""
cleanup() {
  [ -n "$tunnel_pid" ] && kill "$tunnel_pid" 2>/dev/null
  pkill -f "cloudflared tunnel --url ${WEB}" 2>/dev/null
}
trap cleanup EXIT INT TERM

if [ -z "${NO_TUNNEL:-}" ] && command -v cloudflared >/dev/null; then
  (
    # Poll rather than sleep a guess; give up quietly if the server never comes
    # up so a broken build does not also spew tunnel errors.
    for _ in $(seq 1 60); do
      curl -fsS -o /dev/null --max-time 2 "$WEB" 2>/dev/null && exec bash scripts/tunnel.sh
      sleep 1
    done
    echo "  (web server did not come up in 60s — tunnel skipped)" >&2
  ) &
  tunnel_pid=$!
elif [ -z "${NO_TUNNEL:-}" ]; then
  echo "  (cloudflared not installed — running without a tunnel; brew install cloudflared)" >&2
fi

# turbo in the foreground so its logs are the main output and Ctrl-C reaches it.
exec turbo run dev
