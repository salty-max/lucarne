#!/usr/bin/env bash
#
# Start (or restart) a local Postgres for dev, then print its DATABASE_URL.
# Pairs with `bun run dev` on the host — the port is published to localhost, so
# no container-to-container networking is needed and DATABASE_URL is just
# localhost:5432.
#
#   bash scripts/db.sh          # start Postgres
#   bash scripts/db.sh stop     # stop it (data is kept)
#   bash scripts/db.sh reset    # stop + wipe the data dir, then start fresh
#
# Uses Apple's `container` (macOS 26, Apple silicon) if present, else Docker —
# the run/start/stop verbs are the same across both. There is no compose here on
# purpose: `container` does not support compose, and one Postgres does not need
# it.

set -uo pipefail

NAME="lucarne-pg"
PORT="5432"
DATA="$PWD/.pgdata"
URL="postgres://lucarne:lucarne@localhost:${PORT}/lucarne"

# Prefer apple/container; fall back to docker.
if command -v container >/dev/null; then RT=container
elif command -v docker >/dev/null; then RT=docker
else
  echo "neither 'container' nor 'docker' is installed" >&2
  exit 1
fi

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

case "${1:-start}" in
  stop)
    "$RT" stop "$NAME" 2>/dev/null && say "stopped $NAME (data kept in .pgdata)"
    exit 0
    ;;
  reset)
    "$RT" stop "$NAME" 2>/dev/null
    "$RT" rm "$NAME" 2>/dev/null
    rm -rf "$DATA"
    say "wiped $NAME and .pgdata"
    ;;
esac

mkdir -p "$DATA"

say "Starting Postgres via $RT"
# Run fresh, or start the existing container if the name is already taken.
"$RT" run -d --name "$NAME" \
  -p "${PORT}:5432" \
  -e POSTGRES_USER=lucarne \
  -e POSTGRES_PASSWORD=lucarne \
  -e POSTGRES_DB=lucarne \
  -v "${DATA}:/var/lib/postgresql/data" \
  postgres:16-alpine >/dev/null 2>&1 || "$RT" start "$NAME" >/dev/null 2>&1 || {
  echo "could not start $NAME — is the $RT service running?" >&2
  exit 1
}

# Wait for the published port to accept connections before handing back.
say "Waiting for Postgres to accept connections"
for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/localhost/${PORT}") 2>/dev/null; then
    exec 3>&- 3<&-
    break
  fi
  sleep 1
done

cat <<EOF

  Postgres is up.

    export DATABASE_URL="${URL}"
    bun run --cwd apps/api db:migrate                 # first time / after schema changes
    SQLITE_SRC=apps/api/local.db bun run --cwd apps/api db:migrate-from-sqlite   # once, to copy old data
    bun run dev

EOF
