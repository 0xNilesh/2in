# syntax=docker/dockerfile:1.7

# ── stage 1: build ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install full deps including dev (need tsc + tsx).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Compile TS → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev deps for the runtime image.
RUN npm prune --omit=dev


# ── stage 2: runtime ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL is needed by viem/ethers; comes preinstalled on bookworm-slim
# but we make sure curl is available for healthchecks.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Render / Fly inject PORT — default to 3001 for local docker run.
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://localhost:${PORT}/api/health" || exit 1

# Run as non-root for hardening. node user ships in node:* images (uid 1000).
USER node

CMD ["node", "dist/index.js"]
