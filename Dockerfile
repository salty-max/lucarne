# One image: the Hono server, serving the JSON API, the built SPA and the
# node-cron scheduler on one port. Mirrors Koyeb (this exact image runs there),
# and docker-compose runs it locally against a Postgres service.

FROM oven/bun:1.3.13 AS build
WORKDIR /app

# Install with the lockfile first, so a source-only change reuses the layer.
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# Build the SPA the server serves from ../web/dist.
COPY . .
RUN bun run --filter @lucarne/web build

FROM oven/bun:1.3.13
WORKDIR /app
ENV NODE_ENV=production
# Everything the server needs: deps, the api source, the built SPA, the shared
# package. Copied from the build stage so host node_modules never leak in.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/turbo.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist

WORKDIR /app/apps/api
EXPOSE 3000
# Apply migrations, seed a fresh DB (idempotent + guarded — see db/bootstrap.ts),
# then start. All three are safe on a restart: migrate and seed no-op when already
# applied, so only the first boot pays for them. Files are invoked directly (not
# `bun run <script>`) so bun doesn't echo the `$ bun …` command line to stderr.
CMD ["sh", "-c", "bun src/db/migrate.ts && bun src/db/bootstrap.ts && bun src/server.ts"]
