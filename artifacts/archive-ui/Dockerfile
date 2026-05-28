FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY artifacts/archive-ui/package.json ./artifacts/archive-ui/

RUN pnpm install --filter @workspace/archive-ui...

COPY artifacts/archive-ui ./artifacts/archive-ui

# Stub env vars for build-time Next.js validation (actual values injected at runtime)
ENV DATABASE_URL=postgresql://stub \
    AWS_ACCESS_KEY_ID=stub \
    AWS_SECRET_ACCESS_KEY=stub \
    S3_BUCKET=stub \
    ARCHIVE_PASSWORD=stub \
    NODE_ENV=production

RUN pnpm --filter @workspace/archive-ui run build

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /workspace/artifacts/archive-ui/.next/standalone ./
COPY --from=builder /workspace/artifacts/archive-ui/.next/static ./.next/static
COPY --from=builder /workspace/artifacts/archive-ui/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
