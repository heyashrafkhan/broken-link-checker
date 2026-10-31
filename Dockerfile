# ==============================================================================
# Production All-in-One Dockerfile for Broken Link Checker
# Builds Crawler, Server, and Dashboard, and runs the entire app on a single port.
# ==============================================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* .npmrc ./
COPY packages/crawler/package.json packages/crawler/
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/

# Install all dependencies (including devDependencies for building)
RUN npm install

# Copy source code
COPY tsconfig.base.json ./
COPY packages/crawler packages/crawler
COPY packages/server packages/server
COPY packages/dashboard packages/dashboard

# Build all workspace packages
RUN npm run build --workspaces

# ---- Stage 2: Production Runner ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Copy manifests for production install
COPY package.json package-lock.json* .npmrc ./
COPY packages/crawler/package.json packages/crawler/
COPY packages/server/package.json packages/server/
COPY packages/dashboard/package.json packages/dashboard/

# Install only production dependencies
RUN npm install --omit=dev

# Copy compiled artifacts from builder
COPY --from=builder /app/packages/crawler/dist /app/packages/crawler/dist
COPY --from=builder /app/packages/server/dist /app/packages/server/dist
COPY --from=builder /app/packages/dashboard/dist /app/packages/dashboard/dist

# Expose unified application port
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health || exit 1

# Start unified server (serves both API & Frontend SPA)
CMD ["node", "packages/server/dist/index.js"]
