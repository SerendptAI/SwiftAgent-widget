# ─────────────────────────────────────────────
# Stage 1 – Build the Vite widget bundle
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install ALL deps (including devDependencies needed for the Vite build)
RUN npm ci

# Build-time environment variables
ARG VITE_API_BASE_URL=https://api.swiftagents.org
ARG VITE_VOICE_API_URL=/

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_VOICE_API_URL=$VITE_VOICE_API_URL

# Copy full source
COPY . .

# Build Vite app
RUN npm run build


# ─────────────────────────────────────────────
# Stage 2 – Production image (Express server)
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY server.mjs ./
COPY test.html ./

# NOTE:
# Optional folders (public/images/audio) removed to avoid CI build failures

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/ || exit 1

CMD ["node", "server.mjs"]
