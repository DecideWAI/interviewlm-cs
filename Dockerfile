# ==========================================
# Base Stage - Dependencies
# ==========================================
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# ==========================================
# Builder Stage - Build the application
# ==========================================
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time arguments for public environment variables (embedded in client bundle)
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN

# Set public env vars from build args (these get embedded in the JS bundle)
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Build-time environment variables (dummy values for Next.js validation)
# Real values are injected at runtime by Cloud Run
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV NEXTAUTH_SECRET="build-time-secret-placeholder-32chars!"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV ANTHROPIC_API_KEY="sk-ant-build-placeholder"
ENV RESEND_API_KEY="re_build_placeholder"
ENV MODAL_TOKEN_ID="build-placeholder"
ENV MODAL_TOKEN_SECRET="build-placeholder"
ENV MODAL_EXECUTE_URL="https://placeholder.modal.run"
ENV MODAL_WRITE_FILE_URL="https://placeholder.modal.run"
ENV MODAL_READ_FILE_URL="https://placeholder.modal.run"
ENV MODAL_LIST_FILES_URL="https://placeholder.modal.run"
ENV MODAL_EXECUTE_COMMAND_URL="https://placeholder.modal.run"
ENV PADDLE_API_KEY="build-placeholder"
ENV PADDLE_WEBHOOK_SECRET="build-placeholder"
ENV PADDLE_ENVIRONMENT="sandbox"
ENV REDIS_URL="redis://localhost:6379"
ENV SKIP_ENV_VALIDATION="true"

# Build the application
RUN npm run build

# ==========================================
# Runner Stage - Production image
# ==========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy workers and their dependencies for background job processing
COPY --from=builder /app/workers ./workers
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
# Copy node_modules for worker dependencies (ts-node, ioredis, bullmq, etc.)
COPY --from=builder /app/node_modules ./node_modules

# Set ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the application (workers use: npm run workers)
CMD ["node", "server.js"]
