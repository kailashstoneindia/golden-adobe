FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.12.3

# Copy root workspace configs
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy packages
COPY packages/types ./packages/types
COPY apps/backend ./apps/backend

# Install dependencies for workspace
RUN pnpm install --frozen-lockfile

# Build shared types and backend
RUN pnpm turbo build --filter=@golden-abode/backend --filter=@golden-abode/types

# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built artifacts and production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/.sequelizerc ./apps/backend/
COPY --from=builder /app/apps/backend/database ./apps/backend/database

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "apps/backend/dist/main.js"]
