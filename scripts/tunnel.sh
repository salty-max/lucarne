#!/usr/bin/env bash
#
# Opens a Cloudflare quick tunnel to the dev server and prints the https URL,
# with a QR code so a phone can reach it without typing a random hostname.
#
#   bash scripts/tunnel.sh          # the Vite dev server on :5173
#   PORT=3000 bash scripts/tunnel.sh
#
# Why this exists: iOS refuses service workers, notifications and the installable
# PWA over plain http, so the app cannot be tested on a phone against
# http://<mac>:5173 — it needs https, and a quick tunnel is the shortest way to
# get one without a certificate or a DNS record.
#
# It points at Vite rather than the API because Vite proxies /api to :3000, so
# one tunnel covers the app and its backend. vite.config.ts already allows
# .trycloudflare.com as a host; without that the dev server refuses the request.
#
# WARNING: this publishes your local dev server on the open internet for as long
# as it runs. The hostname is random but not secret, and there is no auth in
# front of it. Stop it when you are done — Ctrl-C, or it dies with the terminal.

set -uo pipefail

PORT="${PORT:-5173}"
TARGET="http://localhost:${PORT}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mx\033[0m %s\n' "$*" >&2; exit 1; }

command -v cloudflared >/dev/null || die "cloudflared is not installed (brew install cloudflared)"

# A tunnel to nothing serves 502s and looks like a tunnel problem, so check first.
if ! curl -fsS -o /dev/null --max-time 3 "$TARGET"; then
  die "nothing is answering on ${TARGET} — start the dev server first (bun run dev)"
fi

log="$(mktemp)"
cleanup() {
  [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null
  rm -f "$log"
}
trap cleanup EXIT INT TERM

say "Opening a tunnel to ${TARGET}"
cloudflared tunnel --url "$TARGET" >"$log" 2>&1 &
pid=$!

# cloudflared prints the hostname inside a banner a second or two in; poll for it
# rather than guessing at a sleep.
url=""
for _ in $(seq 1 40); do
  if ! kill -0 "$pid" 2>/dev/null; then
    sed 's/^/  /' "$log" >&2
    die "cloudflared exited before publishing a URL"
  fi
  url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1)
  [ -n "$url" ] && break
  sleep 0.5
done
[ -n "$url" ] || { sed 's/^/  /' "$log" >&2; die "no tunnel URL after 20s"; }

printf '\n  \033[1;33m%s\033[0m\n' "$url"

# Copy it, so the URL can be pasted into a browser or a message without being
# selected out of a terminal. Falls through the tools each platform has; a
# missing one is not worth failing over, since the URL is on screen anyway.
copied=""
if command -v pbcopy >/dev/null; then
  printf '%s' "$url" | pbcopy && copied="pbcopy"
elif command -v wl-copy >/dev/null; then
  printf '%s' "$url" | wl-copy && copied="wl-copy"
elif command -v xclip >/dev/null; then
  printf '%s' "$url" | xclip -selection clipboard && copied="xclip"
elif command -v xsel >/dev/null; then
  printf '%s' "$url" | xsel --clipboard --input && copied="xsel"
fi
if [ -n "$copied" ]; then
  printf '  \033[2mcopied to the clipboard (%s)\033[0m\n\n' "$copied"
else
  printf '\n'
fi

if command -v qrencode >/dev/null; then
  qrencode -t ANSIUTF8 -m 1 "$url"
else
  printf '  (brew install qrencode to get a QR code here)\n'
fi

cat <<EOF

  On the phone: open the link, then Share → Add to Home Screen. Notifications
  only work from the installed app, not from Safari.

  Ctrl-C to close the tunnel.

EOF

# Hand the terminal back to cloudflared so its own logs are visible and Ctrl-C
# reaches it.
wait "$pid"
