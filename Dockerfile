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
