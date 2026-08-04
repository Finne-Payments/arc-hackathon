# Finné backend Dockerfile — prod-hardened (multi-stage, non-root).
# Serves BOTH the Express API AND the web SPA static files.
#
# Stage 1 (builder): install ALL deps, build web SPA + copy backend source.
# Stage 2 (runtime): slim image, prod deps + tsx, non-root user.

# ── Stage 1: builder ──────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY backend/package.json backend/tsconfig.json ./backend/
COPY web/package.json web/tsconfig.json web/vite.config.ts web/index.html ./web/

RUN npm install

# Build the web SPA
WORKDIR /app/web
COPY web/src ./src
RUN npx vite build --outDir /app/web/dist

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY backend/package.json backend/tsconfig.json ./backend/

RUN npm install --omit=dev && npm install tsx@^4

WORKDIR /app/backend
COPY backend/src ./src

# Copy the built web SPA from the builder stage
COPY --from=builder /app/web/dist /app/web/dist

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:4000/health/live || exit 1

CMD ["node", "--import", "tsx/esm", "src/server.ts"]
