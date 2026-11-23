# syntax=docker/dockerfile:1
# Images of ADR 0005 D2. Targets: web (Caddy + front), api (Node, non root), tools (migrations, content import).
# Build: docker build --target <web|api|tools> -t tatamap-<target> .
# Nothing from content/ (private repo) may enter an image: see .dockerignore and the CI check.

ARG NODE_IMAGE=node:24-slim
ARG CADDY_IMAGE=caddy:2.11-alpine

# ---- deps: whole workspace, dev dependencies included ----
FROM ${NODE_IMAGE} AS deps
ENV CI=true
WORKDIR /app
# pnpm is fetched once, into a shared folder: the tools image runs as a user without network access.
ENV COREPACK_HOME=/usr/local/share/corepack
COPY package.json ./
RUN corepack enable && corepack pnpm --version && chmod -R a+rX "$COREPACK_HOME"
# Manifests first: the install layer is reused until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY tools/pose-kit/package.json tools/pose-kit/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- sources ----
FROM deps AS sources
COPY tsconfig.base.json biome.json ./
COPY packages packages
COPY apps apps
COPY tools/pose-kit tools/pose-kit

# ---- web build: public variables are baked in at build time ----
FROM sources AS web-build
ARG VITE_ADSENSE_CLIENT=
ARG VITE_ADSENSE_SLOT_RAIL=
ARG VITE_LEGAL_NAME=
ARG VITE_LEGAL_STATUS=
ARG VITE_LEGAL_SIRET=
ARG VITE_LEGAL_ADDRESS=
ARG VITE_LEGAL_EMAIL=
ARG VITE_LEGAL_DIRECTOR=
ENV VITE_ADSENSE_CLIENT=$VITE_ADSENSE_CLIENT \
    VITE_ADSENSE_SLOT_RAIL=$VITE_ADSENSE_SLOT_RAIL \
    VITE_LEGAL_NAME=$VITE_LEGAL_NAME \
    VITE_LEGAL_STATUS=$VITE_LEGAL_STATUS \
    VITE_LEGAL_SIRET=$VITE_LEGAL_SIRET \
    VITE_LEGAL_ADDRESS=$VITE_LEGAL_ADDRESS \
    VITE_LEGAL_EMAIL=$VITE_LEGAL_EMAIL \
    VITE_LEGAL_DIRECTOR=$VITE_LEGAL_DIRECTOR
RUN pnpm --filter @tatamap/web build

# ---- api build ----
FROM sources AS api-build
# `prisma generate` only reads the schema; the URL is never used to connect.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @tatamap/api build \
 && pnpm --filter @tatamap/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist

# ---- web: Caddy serves the front and relays /api/* ----
FROM ${CADDY_IMAGE} AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/caddy/ /etc/caddy/
COPY --from=web-build /app/apps/web/dist /srv

# ---- api ----
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build --chown=node:node /out /app
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

# ---- tools: migrations and content import, run on demand ----
FROM sources AS tools
ENV NODE_ENV=development \
    npm_config_verify_deps_before_run=false
RUN pnpm db:generate
USER node
