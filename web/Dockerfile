# Finné web — Vite/React static app.
#
# Multi-stage: build the static bundle in a Node stage, then serve dist/ from
# nginx. nginx proxies /api → backend (mirroring web/vite.config.ts's dev proxy,
# PRD §7.2) so the browser's /api/* calls reach the Express API in compose.
# The backend host is read from $BACKEND_HOST at build time (default "backend",
# the compose service name) and baked into the nginx config.

# ---- build stage ----
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public

# tsc -b && vite build  →  dist/
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime

# Default proxy target is the compose service name "backend"; overridable at
# build time so the same image works against a differently-named API host.
ARG BACKEND_HOST=backend
ARG BACKEND_PORT=4000

# /api is rewritten (strip /api) to match the dev proxy in vite.config.ts.
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location /api/ {\n\
        proxy_pass http://%s:%s/;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' "$BACKEND_HOST" "$BACKEND_PORT" > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
