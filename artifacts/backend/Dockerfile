FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache git && corepack enable && corepack prepare pnpm@10.18.3 --activate

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /workspace

# Install deps with workspace context first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY artifacts/backend/package.json ./artifacts/backend/
COPY lib/db/package.json              ./lib/db/
COPY lib/api-zod/package.json         ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json        ./lib/api-spec/
RUN pnpm install --frozen-lockfile

# Copy sources and build
COPY artifacts/backend ./artifacts/backend
COPY lib               ./lib
RUN pnpm --filter @workspace/backend run build

# Create isolated production bundle (resolves workspace deps)
RUN pnpm --filter @workspace/backend deploy --legacy --prod /deploy

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/backend/dist ./dist
COPY --from=builder /workspace/artifacts/backend/drizzle ./drizzle
COPY --from=builder /workspace/artifacts/backend/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /deploy/package.json ./package.json

EXPOSE 3001
CMD ["node", "--enable-source-maps", "./dist/index.js"]
