# Finné backend Dockerfile.
# Build context is the repo root (so workspace packages resolve).
# Runs the Express API + indexer + scheduler via tsx (no compile step).
FROM node:22-slim

WORKDIR /app

# Copy workspace root files + all workspace packages
COPY package.json package-lock.json ./
COPY packages/ ./packages/
COPY backend/package.json backend/tsconfig.json ./backend/

# Install ALL dependencies (including devDeps — tsx is needed at runtime)
# The backend runs TypeScript directly via tsx — no compile step.
RUN npm install --include=dev

# Also ensure tsx is globally available as a fallback
RUN npm install -g tsx

WORKDIR /app/backend

# Copy backend source
COPY backend/src ./src

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD node -e "fetch('http://localhost:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/server.ts"]
