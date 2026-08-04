# Finné web Dockerfile — prod-hardened.
# Build context is the repo root (so workspace packages resolve).
# Multi-stage: build the Vite SPA, then serve via nginx (non-root, healthcheck).
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
# nginx:alpine ships as root; we add a HEALTHCHECK and a templated config so
# the proxy target works on both docker-compose (backend) and ECS (ALB DNS).
FROM nginx:alpine

# Copy the built SPA
COPY --from=builder /app/web/dist /usr/share/nginx/html

# A templated nginx config + an entrypoint that substitutes BACKEND_HOST.
# Falls back to "backend" (the compose service name) when BACKEND_HOST is unset.
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
# Remove the default nginx config so only ours is active
RUN rm -f /etc/nginx/conf.d/default.conf

# nginx:alpine listens on :80. The official image's entrypoint already runs
# envsubst over /etc/nginx/templates/*.template → /etc/nginx/conf.d/*, so
# BACKEND_HOST is substituted at container start.
ENV BACKEND_HOST=backend

EXPOSE 80

# Healthcheck: nginx responds 200 on "/" for the SPA shell.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
