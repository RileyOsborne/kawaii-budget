# Multi-stage Dockerfile for Kawaii Budget
# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native sqlite compilation
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Build Vite frontend and TypeScript server
RUN npm run build:client
RUN npm run build:server

# Prune devDependencies for clean production runtime
RUN npm prune --production

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

# Install minimal runtime dependencies + su-exec for safe permission handling
RUN apk add --no-cache tzdata tar gzip su-exec

# Copy production node_modules from builder (including precompiled native better-sqlite3)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy built frontend assets and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Copy and enable entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create persistent data directory template
RUN mkdir -p /data && chown -R node:node /data /app

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist-server/index.js"]
