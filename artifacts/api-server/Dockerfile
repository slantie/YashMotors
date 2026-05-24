FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache git && corepack enable && corepack prepare pnpm@10.18.3 --activate

# ── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/db/package.json               ./lib/db/
COPY lib/api-zod/package.json          ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json         ./lib/api-spec/
RUN pnpm install --frozen-lockfile

COPY artifacts/api-server ./artifacts/api-server
COPY lib                  ./lib
RUN pnpm --filter @workspace/api-server run build

RUN pnpm --filter @workspace/api-server deploy --legacy --prod /deploy

# ── runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /workspace/artifacts/api-server/dist ./dist

# auth_info_baileys is mounted as a volume at runtime
# so WhatsApp session survives container restarts / redeployments
RUN mkdir -p /app/auth_info_baileys

EXPOSE 8080
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
