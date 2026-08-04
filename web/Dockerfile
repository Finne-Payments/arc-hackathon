# Finné web Dockerfile.
# Build context is the repo root (so workspace packages resolve).
# Multi-stage: build the Vite SPA, then serve via nginx.
FROM node:22-slim AS builder

WORKDIR /app

# Copy workspace root + packages + web
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY web/package.json web/tsconfig.json ./web/

RUN npm ci

WORKDIR /app/web

# Copy web source and build
COPY web/src ./src
COPY web/index.html web/vite.config.ts ./
RUN npm run build

# ── Production stage: nginx serving the SPA + proxying /api ───────────────
FROM nginx:alpine

COPY --from=builder /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
