FROM node:20-alpine AS builder

WORKDIR /app

# Build context MUST be the monorepo root (not apps/backend).
# Railway: leave service "Root Directory" empty; set dockerfilePath to apps/backend/Dockerfile.

RUN npm install -g pnpm@9.12.3

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

COPY packages/types ./packages/types
COPY apps/backend ./apps/backend

RUN pnpm install --frozen-lockfile

RUN pnpm turbo build --filter=@golden-abode/backend --filter=@golden-abode/types

# Produce a self-contained production bundle with flattened node_modules.
RUN pnpm deploy --filter=@golden-abode/backend --prod /prod/backend

# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /prod/backend ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main.js"]
