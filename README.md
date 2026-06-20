# Golden Abode

> Home Finishing Marketplace Platform — Backend Monorepo

## Structure

```
golden-abode/
├── apps/
│   ├── backend/     ← NestJS + Express + Sequelize + PostgreSQL
│   ├── admin/       ← Vite + React SPA (Phase 4)
│   └── mobile/      ← React Native / Expo (Co-developer)
├── packages/
│   └── types/       ← @golden-abode/types — shared TypeScript DTOs
└── docs/            ← Architecture, API contract, planning docs
```

## Docs

- [Implementation Plan](./docs/implementation_plan.md)
- [API Contract](./docs/api-contract.md)
- [Artisan Entity Design](./docs/artisan.md)

## Quick Start

### 1. Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 2. Environment Setup

Create an `.env` file in `apps/backend/.env` with the following:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=golden_abode
DB_USER=postgres
DB_PASS=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Secrets
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_ONBOARDING_SECRET=your_super_secret_onboarding_key
JWT_ACCESS_EXPIRES_IN=15m
JWT_ONBOARDING_EXPIRES_IN=15m
REFRESH_TOKEN_TTL_DAYS=30

# MSG91 (Authentication SMS)
# Leave blank in dev mode to print OTPs to the console instead
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
MSG91_SENDER_ID=GOLDEN

# Rate Limiting
THROTTLE_OTP_SEND_LIMIT=3
THROTTLE_OTP_SEND_TTL=3600
THROTTLE_OTP_VERIFY_LIMIT=5
THROTTLE_OTP_VERIFY_TTL=600
```

### 3. Installation & Run

```bash
# 1. Install dependencies
pnpm install

# 2. Start PostgreSQL and Redis containers
docker-compose up -d

# 3. Run database migrations (creates tables)
pnpm --filter @golden-abode/backend run migration:run

# 4. Start the backend in watch mode
pnpm --filter @golden-abode/backend dev
```

### 4. API Documentation

Once the server is running, the Swagger API Documentation is available at:
👉 **[http://localhost:3000/api/docs](http://localhost:3000/api/docs)**

## Tech Stack

| Layer       | Technology                                |
| ----------- | ----------------------------------------- |
| Backend     | NestJS + Express + Sequelize + PostgreSQL |
| Cache / OTP | Redis 7                                   |
| Auth        | Passport JWT + opaque refresh tokens      |
| SMS         | MSG91                                     |
| Admin Panel | Vite + React (Phase 4)                    |
| Mobile      | React Native / Expo                       |
| Monorepo    | pnpm workspaces + Turborepo               |

## Monorepo Commands

- `pnpm dev`: Run all apps in dev mode
- `pnpm build`: Build all apps
- `pnpm lint`: Run ESLint across the monorepo
- `pnpm format`: Run Prettier across the monorepo
- `pnpm type-check`: Run TypeScript type checking without emitting files
