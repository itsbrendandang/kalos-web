# syntax=docker/dockerfile:1
#
# kalos-web image - Next.js 16 (App Router). Multi-stage: install -> build ->
# minimal runtime. The runtime stage copies `.next/standalone`, so it relies on
# `output: "standalone"` in next.config.ts and fails loudly without it.
#
# Built by kalos-engine's deploy/docker-compose.yaml (service `web`, build
# context this repo); deploy/RUNBOOK.md there covers the whole stack. Moved
# here from kalos-engine's deploy/Dockerfile.web so this repo owns its image.

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
RUN npm ci

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* variables are inlined into the client JS bundle AT BUILD
# TIME by the Next.js compiler - they are not read from the environment when
# the container starts. lib/api.ts reads `process.env.NEXT_PUBLIC_API_URL`
# from "use client" code (every page under app/ that calls the engine is a
# client component - confirmed 2026-08-25), i.e. the BROWSER calls the engine
# directly, not this Next.js server. That has two consequences worth being
# explicit about:
#   1. The engine's externally-reachable URL (host + port the *browser* can
#      reach, not a Docker-internal service name) has to be known and stable
#      BEFORE this image is built.
#   2. Changing that URL later means rebuilding this image
#      (`docker compose build web`), not just restarting the container with a
#      new environment variable - a runtime env change has no effect on an
#      already-built NEXT_PUBLIC_* value. See kalos-engine's deploy/RUNBOOK.md,
#      "Changing the engine URL".
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEMO_MODE=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 10001 kalos \
    && adduser --system --uid 10001 --ingroup kalos kalos

# `output: "standalone"` traces the actual runtime dependency graph and
# copies only the node_modules a running server needs (not devDependencies,
# not the full workspace) into .next/standalone, alongside a generated
# server.js entrypoint. That pruned subset - not the full node_modules from
# the builder stage - is the entire size win standalone output buys, so only
# these three paths are copied into the runtime stage.
COPY --from=builder --chown=kalos:kalos /app/.next/standalone ./
COPY --from=builder --chown=kalos:kalos /app/.next/static ./.next/static
COPY --from=builder --chown=kalos:kalos /app/public ./public

USER kalos
EXPOSE 3000

# Plain Node http GET against the server's own root - no curl in this image,
# no extra apk package just to answer a healthcheck. 200 on `/` is a real
# signal here (unlike a bare TCP check) because it proves the Next.js server
# actually rendered a response, not just that the port is open.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
