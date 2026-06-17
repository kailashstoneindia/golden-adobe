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

```bash
# Install dependencies
pnpm install

# Start local services (PostgreSQL + Redis)
docker-compose up -d

# Run migrations
pnpm --filter backend migration:run

# Start backend in dev mode
pnpm --filter backend dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS + Express + Sequelize + PostgreSQL |
| Cache / OTP | Redis 7 |
| Auth | Passport JWT + opaque refresh tokens |
| SMS | MSG91 |
| Admin Panel | Vite + React (Phase 4) |
| Mobile | React Native / Expo |
| Monorepo | pnpm workspaces + Turborepo |

## Phase 1 Focus

- Monorepo scaffold
- JWT auth with OTP (MSG91)
- Pre-registration flow (phone → OTP → onboardingToken → register with name + role)
- RBAC guards (CUSTOMER / VENDOR / ARTISAN / ADMIN)
- Swagger docs at `/api/docs`
- Health check at `/health`
