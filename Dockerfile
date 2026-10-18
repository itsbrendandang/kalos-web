# syntax=docker/dockerfile:1
#
# kalos-web image - Next.js 16 (App Router). Multi-stage: install -> build ->
# minimal runtime. The runtime stage copies `.next/standalone`, so it relies on
# `output: "standalone"` in next.config.ts and fails loudly without it.
#
# Built by kalos-engine's deploy/docker-compose.yaml (service `web`, build
# context this repo); deploy/RUNBOOK.md there covers the whole stack. Moved
# here from kalos-engine's deploy/Dockerfile.web so this repo owns its image.
#
# Auth (docs/AUTH.md): Better Auth on SQLite (better-sqlite3 13, prebuilt
# N-API binaries). The database lives on a VOLUME at /data (uid 10001, 0700
# dir, 0600 files) and the web service runs as a SINGLE replica.
# Build and runtime MUST share platform + libc (alpine/musl, same arch as
# production): Next's standalone trace copies only
# better-sqlite3/prebuilds/<platform>-<arch>.node of the build host, and the
# builder stage below fails if that file is missing. Cross-building with
# --platform works only if the builder also runs under that platform.

# ---------------------------------------------------------------------------
# deps - install once, reused by builder; kept separate so a source-only
# change doesn't invalidate the (slow) npm ci layer.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
# Next.js 16 requires Node >=20.9 (node_modules/next declares this in
# package-lock.json's package metadata once installed). node:22-alpine is the
# current LTS line, comfortably above that floor, and matches the Node
# version already in local dev use for this repo.
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: no dependency install hooks run. better-sqlite3 13 ships
# prebuilt binaries in its tarball (no node-gyp, no toolchain needed).
RUN npm ci --no-audit --no-fund --ignore-scripts

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are inlined into the client JS bundle AT BUILD
# TIME, not read when the container starts. The production image deliberately
# accepts NO build arg for the engine URL: the browser always calls the
# same-origin /api/engine proxy (app/api/engine/[...path]/route.ts), which
# runs server-side, attaches KALOS_ENGINE_TOKEN and forwards to the engine at
# KALOS_ENGINE_URL. That URL and token are RUNTIME environment variables on
# the `web` container, so changing the engine address needs a container
# restart, not an image rebuild. Baking NEXT_PUBLIC_API_URL into the image
# would route browsers around the proxy and its token. (Local dev can still
# set it outside Docker; see env.example.)
ARG NEXT_PUBLIC_DEMO_MODE=""
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build
RUN test -f .next/standalone/node_modules/better-sqlite3/prebuilds/linuxmusl-$(node -p 'process.arch').node \
 || { echo "better-sqlite3 musl prebuild missing from the standalone trace (build on the production platform)" >&2; exit 1; }

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AUTH_DB_PATH=/data/auth.db

RUN addgroup --system --gid 10001 kalos \
    && adduser --system --uid 10001 --ingroup kalos kalos \
    && mkdir -p /data && chown 10001:10001 /data && chmod 700 /data

# `output: "standalone"` traces the actual runtime dependency graph and
# copies only the node_modules a running server needs (not devDependencies,
# not the full workspace) into .next/standalone, alongside a generated
# server.js entrypoint. That pruned subset - not the full node_modules from
# the builder stage - is the entire size win standalone output buys, so only
# these three paths are copied into the runtime stage.
#
# App code is root-owned (read-only to the runtime user); only /data and
# Next's cache dir are writable by uid 10001.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Operator CLI for controlled onboarding (docs/AUTH.md); uses the traced
# better-sqlite3 from the standalone node_modules.
COPY --from=builder /app/scripts/create-org.mjs ./scripts/create-org.mjs
RUN mkdir -p .next/cache && chown 10001:10001 .next/cache

USER kalos
VOLUME ["/data"]
EXPOSE 3000

# Plain Node http GET - no curl in this image. `/` now redirects to /sign-in,
# so the probe is /api/health: public, and 200 only when the server is up AND
# the auth database answers.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
