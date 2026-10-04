# syntax=docker/dockerfile:1.7
# Multi-stage build for the Unsaid API. Final image: prod deps + compiled JS only, non-root.

ARG NODE_VERSION=22

# ---------- base ----------
FROM node:${NODE_VERSION}-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

# ---------- build: full deps + tsc ----------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm build

# ---------- web: static frontend (reads docs/eval at build time) ----------
FROM base AS web-build
WORKDIR /build/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY web/ ./
COPY docs/eval /build/docs/eval
RUN pnpm build

# ---------- prod deps only ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ---------- runtime ----------
FROM node:${NODE_VERSION}-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080 AUDIO_DIR=/data/audio WEB_DIST=/app/web/dist
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=web-build /build/web/dist ./web/dist
COPY package.json ./
COPY prisma ./prisma
# compiled scripts resolve fixtures relative to dist/
COPY fixtures ./fixtures
COPY fixtures ./dist/fixtures
RUN mkdir -p /data/audio && chown -R node:node /data /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# tini forwards SIGTERM so the graceful-shutdown handler runs
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/index.js"]
