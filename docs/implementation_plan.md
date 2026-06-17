# Phase 1: Planning & Foundation — Golden Abode
## Finalized Plan (Post-Review)

> [!NOTE]
> This plan reflects all feedback incorporated. Key clarifications: Sequelize retained as ORM, Express retained as HTTP adapter, mobile app scope owned by co-developer, schema scoped to Phase 1 entities only, repository strategy is **single monorepo (`golden-abode`) containing backend, admin panel, and mobile app**.

---

## Scope Clarity: Who Owns What

| Area | Owner | Status |
|------|-------|--------|
| NestJS Backend | **You (backend dev)** | In scope — proceed immediately |
| Admin Web Panel | **You (backend dev)** | In scope for monorepo setup; UI built in Phase 4 |
| Mobile App (React Native/Expo) | **Co-developer** | Lives in `apps/mobile` — co-dev owns all mobile decisions |
| Mobile Navigation / State Mgmt | **Co-developer** | Not your concern in Phase 1 |

---

## Repository Strategy

### Single Monorepo — All Three Apps

All three apps (backend, admin panel, mobile) live in one monorepo: `golden-abode`. This was agreed between both developers. The co-developer owns the `apps/mobile` folder entirely — you do not touch it, they do not touch `apps/backend` or `apps/admin`.

**Why this works well:**
- **Shared TypeScript types** — All three apps reference `@golden-abode/types`. When you add a new API field, the mobile app and admin panel both pick it up immediately without cross-repo sync or npm publishing.
- **Single CI pipeline** — One GitHub Actions workflow covers all apps. A breaking change in the backend is caught before mobile CI even runs.
- **One source of truth** — One repo, one `pnpm-workspace.yaml`, one Turborepo config. No version drift between separate repos.
- **Clear ownership via folder boundaries** — `apps/backend` and `apps/admin` are yours. `apps/mobile` is co-developer territory. Turborepo pipelines are scoped per app, so builds are independent.

### Repo Structure

```
golden-abode/                  ← Single monorepo (both developers)
  ├── apps/
  │   ├── backend/             ← NestJS + Express + Sequelize  (You)
  │   ├── admin/               ← Vite + React SPA shell        (You — Phase 4)
  │   └── mobile/              ← React Native / Expo           (Co-developer)
  └── packages/
      └── types/               ← @golden-abode/types (shared across all apps)
```

> [!IMPORTANT]
> The `admin/` folder is **scaffolded in Phase 1** (empty shell) but its UI is built in **Phase 4**.
> The `mobile/` folder is **co-developer's domain** — scaffolded by them when they begin. You only set up the monorepo root structure so the workspace is wired correctly from day one.

---

## What Phase 1 Demands

### 1. Architecture Design
Lock all decisions before writing code:
- Tech stack with version pinning
- Monorepo tooling setup
- Service boundaries
- Environment variable strategy (dev → staging → prod)
- Deployment topology

### 2. Database Schema (Phase 1 Entities Only)

> [!NOTE]
> Per your clarification, only Phase 1 entities are designed and migrated now. Other domain entities (products, orders, artisans, rewards) will be finalized and migrated **before Phase 1 closes**, once client timezone/scheduling issues are resolved.

**Phase 1 schema covers:**
- `users` table
- `refresh_tokens` table

**Deferred (to be finalized before Phase 1 ends):**
- `vendors`, `products`, `categories`
- `orders`, `order_items`
- `artisans`, `reward_ledger`

Seed scripts for `users` (one per role) will be created for development testing.

### 3. Project Scaffold
- Monorepo root initialized (pnpm workspaces + Turborepo)
- NestJS backend project initialized
- Admin panel shell scaffolded (empty — active in Phase 4)
- Shared `@golden-abode/types` package
- ESLint + Prettier + TypeScript across all packages
- Docker Compose for local PostgreSQL + Redis
- GitHub Actions CI (lint + type-check + build on PR)

### 4. JWT Authentication System
- Phone number → OTP flow (via MSG91)
- OTP stored in **Redis** with 5-minute TTL (not a DB table — ephemeral data belongs in cache)
- Short-lived `access_token` JWT (15 min) + opaque `refresh_token` (30 days, stored hashed in DB)
- Refresh token rotation with **reuse detection** (token family revoked if old token is replayed)
- Rate limiting on OTP endpoints (Redis-backed via `@nestjs/throttler`)
- NestJS guards: `@JwtAuthGuard`, `@CurrentUser()` decorator

### 5. Role-Based Access Control (RBAC)
- Roles: `CUSTOMER`, `VENDOR`, `ARTISAN`, `ADMIN`
- `ADMIN` role wired into RBAC guards now even though admin panel UI comes in Phase 4 — guards are complete from day 1
- Role embedded in JWT payload (no extra DB lookup per request)
- Custom `@Roles()` decorator + `RolesGuard`

### 6. API Documentation & Observability
- Swagger/OpenAPI auto-generated at `/api/docs`
- All DTOs annotated with `@ApiProperty()`
- Winston logger (structured JSON logs)
- Global exception filter (consistent error response shape)
- `@nestjs/terminus` health check at `/health`

---

## Deliverables at End of Phase 1

| # | Deliverable | Acceptance Criteria |
|---|-------------|---------------------|
| 1 | **Architecture Decision Record** | Full doc: stack, repo strategy, env strategy |
| 2 | **Monorepo initialized** | `pnpm install` works, Turborepo pipeline runs |
| 3 | **`@golden-abode/types` package** | User, Role, Auth DTOs shared across apps |
| 4 | **Sequelize Migrations (Phase 1 entities)** | `users` + `refresh_tokens` tables created cleanly |
| 5 | **Seed scripts** | One user per role created in dev DB |
| 6 | **NestJS Backend** | Compiles, lints clean, Dockerized, health check at `/health` |
| 7 | **Admin panel shell** | Empty Vite + React shell in `apps/admin/` — ready for Phase 4 |
| 8 | **`POST /auth/otp/send`** | Sends real OTP via MSG91, stored in Redis, rate-limited |
| 9 | **`POST /auth/otp/verify`** | Verifies OTP, returns `onboardingToken` (new) or full tokens (existing) |
| 10 | **`POST /auth/register`** | Validates onboarding token, creates user, returns full tokens |
| 11 | **`POST /auth/refresh`** | Rotates tokens, detects reuse, revokes family on replay |
| 12 | **`POST /auth/logout`** | Revokes active refresh token |
| 13 | **`GET /auth/me`** | Returns current user (JWT protected) |
| 14 | **RBAC Guards** | Vendor-only endpoint returns `403` for customer role |
| 15 | **Swagger Docs** | All auth endpoints visible at `/api/docs` |
| 16 | **CI Pipeline** | Push to `main` triggers lint + type-check + build |

---

## Final Confirmed Tech Stack

### Backend (`apps/backend`)

| Concern | Technology | Notes |
|---------|-----------|-------|
| Framework | **NestJS** | Modular, DI, production-grade |
| HTTP Adapter | **Express** | Default NestJS adapter — kept as-is |
| Language | TypeScript (strict) | Full type safety |
| ORM | **Sequelize** (sequelize-typescript) | As per MVP proposal — retained |
| Database | PostgreSQL 16 | Relational, strong for marketplace |
| Cache / OTP | **Redis 7** | OTP TTL, rate limit counters |
| Auth | Passport JWT + opaque refresh tokens | Industry standard |
| Rate Limiting | @nestjs/throttler + Redis store | Distributed — scales across instances |
| SMS | **MSG91** | India-first, DLT compliant, cost-effective |
| Docs | @nestjs/swagger | Auto-generated |
| Logging | Winston | Structured JSON logs |
| Health | @nestjs/terminus | `/health` endpoint |

### Admin Panel (`apps/admin`) — Scaffolded Phase 1, Built Phase 4

| Concern | Technology | Notes |
|---------|-----------|-------|
| Framework | **Vite + React (SPA)** | Lightweight, fast dev server, no SSR needed for admin |
| Language | TypeScript | Shared types with backend |
| Auth | JWT from backend | No separate auth — uses same API |
| Styling | TBD in Phase 4 | Tailwind CSS recommended |

### Mobile App (`apps/mobile` — Co-developer Owns)

| Concern | Technology | Notes |
|---------|-----------|-------|
| Framework | React Native (Expo) | As per MVP proposal |
| Navigation | TBD by co-developer | Expo Router or React Navigation |
| State | Zustand + React Query | As per MVP proposal |
| Repo location | `apps/mobile` in monorepo | Co-dev scaffolds this folder — backend dev does not touch it |

### Monorepo & Tooling

| Concern | Technology | Notes |
|---------|-----------|-------|
| Monorepo | **pnpm workspaces + Turborepo** | All three apps — backend, admin, mobile |
| CI/CD | GitHub Actions | Scoped pipelines per app; shared lint + type-check |
| Containers | Docker + Docker Compose | Local PostgreSQL + Redis |
| Secrets | `.env` + GitHub Secrets | Standard |

---

## Folder Structure

### Monorepo Root (`golden-abode`)
```
golden-abode/
├── apps/
│   ├── backend/               ← NestJS (Express + Sequelize)    [You]
│   ├── admin/                 ← Vite + React SPA shell          [You — Phase 4]
│   └── mobile/                ← React Native / Expo             [Co-developer]
├── packages/
│   └── types/                 ← @golden-abode/types (shared)
│       ├── src/
│       │   ├── auth.types.ts
│       │   ├── user.types.ts
│       │   └── index.ts
│       └── package.json
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .github/
    └── workflows/
        └── ci.yml
```

### Backend (`apps/backend`)
```
apps/backend/
├── src/
│   ├── core/
│   │   ├── database/
│   │   │   └── database.module.ts    ← Sequelize connection
│   │   └── redis/
│   │       └── redis.service.ts      ← Redis client wrapper
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── filters/
│   │   │   └── global-exception.filter.ts
│   │   └── enums/
│   │       └── role.enum.ts          ← CUSTOMER | VENDOR | ARTISAN | ADMIN
│   ├── config/
│   │   └── configuration.ts          ← Typed env vars via @nestjs/config
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   └── dto/
│   │   │       ├── send-otp.dto.ts
│   │   │       ├── verify-otp.dto.ts
│   │   │       ├── register.dto.ts
│   │   │       └── refresh-token.dto.ts
│   │   └── users/
│   │       ├── users.service.ts
│   │       ├── users.module.ts
│   │       ├── models/
│   │       │   ├── user.model.ts           ← Sequelize model
│   │       │   └── refresh-token.model.ts  ← Sequelize model
│   │       └── dto/
│   │           └── create-user.dto.ts
│   ├── app.module.ts
│   └── main.ts
├── database/
│   ├── migrations/
│   │   ├── 20260101-create-users.js
│   │   └── 20260101-create-refresh-tokens.js
│   └── seeders/
│       └── 20260101-seed-users.js
├── docker-compose.yml
├── Dockerfile
├── .sequelizerc
└── .env.example
```

---

## User Differentiation & Role Design

### How Customers, Vendors, and Artisans Are All "Users"

All three share identical auth mechanics — same phone OTP, same JWT, same login flow. What differentiates them is:

| Layer | What it stores | When it exists |
|-------|---------------|----------------|
| `users` table | Identity — phone, name, role, active status | From first registration |
| `customers` table | Customer-specific preferences and addresses | Created Phase 2 |
| `vendors` table | Shop profile — shop name, location, Razorpay sub-account | Created Phase 2 |
| `artisans` table | Craft profile — trade type, verification status, rewards | Created Phase 2 |

**The `role` column is the differentiator in Phase 1.** Extended profile tables are 1-to-1 with `users.id` and built in later phases.

### Role Assignment — The Pre-Registration Flow

To avoid forcing returning users to select their role on a Welcome screen (where the app does not yet know their identity), we collect the role **only during first-time registration after OTP verification**, before any database write occurs.

```
1. Anonymous User enters Phone Number → Sends OTP.
2. User enters OTP → POST /auth/otp/verify { phone, otp }
   - Existing user → returns accessToken + refreshToken + user. Login complete.
   - New user     → returns onboardingToken (valid 15m). No DB record created yet.
3. New user fills Name + selects Role → POST /auth/register { onboardingToken, name, role }
   - Server validates token, extracts phone, creates user row (role is strictly NOT NULL).
   - Returns accessToken + refreshToken + user. Registration complete.
```

This ensures:
- Returning users go straight to their dashboard — they never see a role picker.
- New users only see the role picker once.
- The database `role` column is always `NOT NULL` — no placeholder or default values.

---

## Database Schema (Phase 1 Entities Only)

```sql
-- Migration 1: users
CREATE TABLE users (
  id           VARCHAR(36)  PRIMARY KEY,                      -- UUID
  name         VARCHAR(100) NOT NULL,
  phone        VARCHAR(15)  UNIQUE NOT NULL,                  -- E.164 format
  role         ENUM('CUSTOMER','VENDOR','ARTISAN','ADMIN') NOT NULL, -- No default, strictly set on registration
  device_token TEXT,                                          -- FCM push notification token
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);

-- Migration 2: refresh_tokens
CREATE TABLE refresh_tokens (
  id          VARCHAR(36)   PRIMARY KEY,                      -- UUID
  user_id     VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255)  NOT NULL,                         -- bcrypt hash of opaque token
  family      VARCHAR(36)   NOT NULL,                         -- Groups token chain for reuse detection
  expires_at  TIMESTAMP     NOT NULL,
  is_revoked  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_family     ON refresh_tokens(family);
```

> [!NOTE]
> Domain entity tables (`customers`, `vendors`, `artisans`, `products`, `categories`, `orders`, `artisan_rewards_ledger`) will be added as separate migrations before Phase 1 closes, once schema design is finalized with the client.

---

## Phase 1 API — Full Request & Response Payloads

### `POST /auth/otp/send`
> Send OTP to a phone number. Works for both new and existing users.

**Request**
```json
{ "phone": "+919876543210" }
```

**Response `200 OK`**
```json
{ "success": true, "data": null, "message": "OTP sent successfully" }
```

**Errors**
| Code | Message |
|------|---------|
| `400` | `"phone must be a valid E.164 format phone number"` |
| `429` | `"Too many OTP requests. Please try again in 45 minutes."` |

---

### `POST /auth/otp/verify`
> Verify OTP. Acts as login (existing user) or pre-registration checkpoint (new user).

**Request**
```json
{ "phone": "+919876543210", "otp": "482910" }
```

**Response `200 OK` — Existing user (login complete)**
```json
{
  "success": true,
  "data": {
    "isNewUser": false,
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Ramesh Kumar",
      "phone": "+919876543210",
      "role": "VENDOR",
      "isActive": true,
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-06-16T04:30:00.000Z"
    }
  }
}
```

**Response `200 OK` — New user (must complete registration)**
```json
{
  "success": true,
  "data": {
    "isNewUser": true,
    "onboardingToken": "eyJhbGciOiJIUzI1NiJ9..."
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `401` | `"Invalid or expired OTP"` |
| `429` | `"Too many failed attempts. Please try again in 8 minutes."` |

---

### `POST /auth/register`
> Complete new user registration. Validates onboarding token, creates the user record, and returns full session tokens.

**Request**
```json
{
  "onboardingToken": "eyJhbGciOiJIUzI1NiJ9...",
  "name": "Ramesh Kumar",
  "role": "VENDOR"
}
```

> `role` must be one of: `"CUSTOMER"` | `"VENDOR"` | `"ARTISAN"`. The `"ADMIN"` role cannot be self-selected.

**Response `201 Created`**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Ramesh Kumar",
      "phone": "+919876543210",
      "role": "VENDOR",
      "isActive": true,
      "createdAt": "2026-06-16T04:30:00.000Z",
      "updatedAt": "2026-06-16T04:30:00.000Z"
    }
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `400` | `"Invalid or expired onboarding token"` |
| `400` | `"name is required"` |
| `400` | `"role must be one of: CUSTOMER, VENDOR, ARTISAN"` |
| `409` | `"An account with this phone number already exists"` |

---

### `POST /auth/refresh`
> Exchange a valid refresh token for a new token pair. Old token is immediately revoked.

**Request**
```json
{ "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

**Response `200 OK`**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...(new)",
    "refreshToken": "b2c3d4e5-f6a7-8901-bcde-f01234567891"
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `401` | `"Invalid refresh token"` |
| `401` | `"Session invalidated. Please log in again."` ← reuse detected |

---

### `POST /auth/logout`
> Revoke the current session's refresh token.

**Headers**: `Authorization: Bearer <accessToken>`

**Request Body**
```json
{ "refreshToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }
```

**Response `200 OK`**
```json
{ "success": true, "data": null, "message": "Logged out successfully" }
```

---

### `GET /auth/me`
> Get the currently authenticated user's profile.

**Headers**: `Authorization: Bearer <accessToken>`

**Response `200 OK`**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Ramesh Kumar",
    "phone": "+919876543210",
    "role": "VENDOR",
    "deviceToken": null,
    "isActive": true,
    "createdAt": "2026-05-01T10:00:00.000Z",
    "updatedAt": "2026-06-16T04:30:00.000Z"
  }
}
```

**Errors**
| Code | Message |
|------|---------|
| `401` | `"Unauthorized"` |

---

### Standard Error Envelope
All errors follow this shape (from the global exception filter):

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Human-readable description",
  "timestamp": "2026-06-16T04:30:00.000Z",
  "path": "/auth/otp/verify"
}
```

---

## OTP + JWT Internal Flow

```
SEND OTP
  POST /auth/otp/send { phone }
  → Rate limit: max 3 OTP sends / hour / phone (Redis counter)
  → Generate 6-digit OTP
  → Hash OTP (SHA-256 + salt)
  → Redis SET  key: otp:{phone}  value: hash  EX: 300 (5 min TTL)
  → MSG91 sends SMS
  → Return 200

VERIFY OTP
  POST /auth/otp/verify { phone, otp }
  → Rate limit: max 5 failed attempts / 10 min / phone
  → Redis GET otp:{phone}  →  compare hash
  → On match: Redis DEL otp:{phone}  (single-use enforced)
  → If user exists:
      → Generate JWT access_token (payload: { sub, role }  exp: 15m)
      → Generate opaque refresh_token
      → Store bcrypt(refresh_token) in refresh_tokens with new family UUID
      → Return { accessToken, refreshToken, isNewUser: false, user }
  → If user does not exist:
      → Generate short-lived signed onboardingToken (contains phone, exp: 15m)
      → Return { onboardingToken, isNewUser: true }

REGISTER USER
  POST /auth/register { onboardingToken, name, role }
  → Verify onboardingToken signature & expiration
  → Extract phone from token payload
  → Check if phone already exists in DB (prevent race conditions)
  → INSERT users (id, name, phone, role)  ← role is NOT NULL, set to chosen value
  → Generate JWT access_token (payload: { sub, role }  exp: 15m)
  → Generate opaque refresh_token
  → Store bcrypt(refresh_token) in refresh_tokens with new family UUID
  → Return { accessToken, refreshToken, user }

REFRESH
  POST /auth/refresh { refreshToken }
  → Hash incoming token → lookup in refresh_tokens
  → If is_revoked = TRUE:
      → Revoke entire family (UPDATE WHERE family = ?)  ← reuse detection
      → Return 401 "Session invalidated"
  → If valid:
      → Revoke old token (is_revoked = true)
      → Issue new accessToken + refreshToken (same family)
      → Return { accessToken, refreshToken }

LOGOUT
  POST /auth/logout  (requires valid JWT + refreshToken in body)
  → Mark refresh_token as is_revoked = true
  → Return 200
```

---

## Verification Plan

### Automated Tests
```bash
# Run from monorepo root
pnpm turbo test --filter=backend

# Coverage:
# ✅ POST /auth/otp/send              → 200, Redis key set
# ✅ POST /auth/otp/send (4th)        → 429 rate limited
# ✅ POST /auth/otp/verify (new)      → onboardingToken returned
# ✅ POST /auth/otp/verify (existing) → accessToken + refreshToken returned
# ✅ POST /auth/otp/verify (bad OTP)  → 401
# ✅ POST /auth/register              → 201, user created, tokens returned
# ✅ POST /auth/register (bad token)  → 400
# ✅ POST /auth/refresh               → new token pair
# ✅ POST /auth/refresh (reused)      → 401, family revoked
# ✅ GET  /auth/me                    → 200 with valid token
# ✅ GET  /auth/me                    → 401 without token
# ✅ Vendor-only endpoint             → 403 for CUSTOMER role
```

### Manual Verification
- [ ] Real OTP received on Indian phone via MSG91 sandbox
- [ ] `/api/docs` Swagger UI — all auth endpoints visible and testable
- [ ] `/health` → `{ status: "ok" }`
- [ ] Token reuse replay → 401 returned, DB shows entire family revoked
- [ ] New user flow end-to-end: OTP → onboardingToken → register → accessToken

---

## Open Questions

> [!NOTE]
> All open questions resolved. Plan is ready to proceed to execution upon approval.

| Question | Resolution |
|----------|------------|
| MSG91 DLT Registration | To be communicated to client. MSG91 sandbox used throughout Phase 1. |
| Admin Panel Framework | **Vite + React SPA** confirmed. |
| Mobile repo strategy | **Single monorepo** confirmed — `apps/mobile` owned by co-developer. |
| ORM | **Sequelize (sequelize-typescript)** retained. |
| HTTP adapter | **Express** retained. |
| Role assignment flow | **Pre-Registration Flow** confirmed — role set via `POST /auth/register` post-OTP, not pre-OTP. |
