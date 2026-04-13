# ─────────────────────────────────────────────
# Stage 1 – Build the Vite widget bundle
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install ALL deps (including devDependencies needed for the Vite build)
RUN npm ci

# Copy source — build args allow overriding the API base URL at build time
ARG VITE_API_BASE_URL=https://api.swiftagents.org
ARG VITE_VOICE_API_URL=/

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_VOICE_API_URL=$VITE_VOICE_API_URL

COPY . .

RUN npm run build

# ─────────────────────────────────────────────
# Stage 2 – Production image (Express server)
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Only install production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the compiled widget bundle and server assets from the builder stage
COPY --from=builder /app/dist ./dist
COPY server.mjs ./
COPY test.html  ./

# Copy optional static directories if they exist
COPY public ./public
COPY images ./images
COPY audio  ./audio

# The server reads secrets at runtime via environment variables.
# Do NOT bake .env into the image; inject them via -e / --env-file at runtime.
ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# Healthcheck – verify the server responds on /
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3002/ || exit 1

CMD ["node", "server.mjs"]
