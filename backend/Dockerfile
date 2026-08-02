# Finné backend — Node/tsx app (Express API + indexer + anchor worker).
#
# The app runs TypeScript directly via tsx (no separate build/compile step;
# see backend/package.json "start"). Source uses .ts import extensions, which
# tsx resolves at runtime. MongoDB is reached over MONGO_URL (Atlas in the
# demo) — no database runs in this image.
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Install all deps (including dev — tsx/typescript needed at runtime since the
# app runs TypeScript directly via tsx, no separate build step).
# package-lock.json is committed, so `npm ci` is reproducible.
COPY package.json package-lock.json ./
RUN npm ci

# ---- runtime stage ----
FROM node:20-bookworm-slim AS runtime

# tini: proper PID 1 / signal handling so Ctrl-C and SIGTERM shut the app down
# cleanly (the indexer + anchor worker run in-process and should drain).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in the installed node_modules from the deps stage, then the app source.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY tsconfig.json ./

# Run as a non-root user. The backend holds one secret (REGISTRY_OPERATOR_PRIVATE_KEY)
# at runtime; least-privilege is the default.
RUN groupadd --system finne && useradd --system --gid finne --create-home finne \
 && chown -R finne:finne /app
USER finne

ENV NODE_ENV=production
EXPOSE 4000

# `npm start` = node --env-file=.env --import tsx/esm src/server.ts.
# In Docker the env comes from compose's env_file, not a .env on disk, so we
# run tsx directly without --env-file. NODE_OPTIONS lets tsx load via its loader.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx/esm", "src/server.ts"]
