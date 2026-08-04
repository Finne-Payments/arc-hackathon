# Finné backend Dockerfile — prod-hardened (multi-stage, non-root).
# Build context is the repo root (so workspace packages resolve).
#
# Stage 1 (builder): install ALL deps (incl. dev for tsx), copy source.
# Stage 2 (runtime): slim image, prod deps + tsx, non-root user, no npx.
# Runs the Express API + indexer + scheduler + agent worker via tsx.

# ── Stage 1: builder ──────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace root files + all workspace packages
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY backend/package.json backend/tsconfig.json ./backend/

# Install ALL dependencies (devDeps needed for the tsx runtime + build tools)
RUN npm install

WORKDIR /app/backend

# Copy backend source
COPY backend/src ./src

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Install curl for the healthcheck (slim image doesn't ship it).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root + packages (source-consumed; no build step)
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY backend/package.json backend/tsconfig.json ./backend/

# Install prod deps only, plus tsx (the runtime TS loader — a devDependency in
# package.json, so installed explicitly here to avoid shipping the full dev tree).
RUN npm install --omit=dev && npm install tsx@^4

WORKDIR /app/backend

# Copy backend source from the builder stage
COPY --from=builder /app/backend/src ./src

# Drop to the non-root node user (ships with node:22-slim, uid 1000)
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:4000/health/live || exit 1

# Direct tsx invocation (no npx resolution at runtime)
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
