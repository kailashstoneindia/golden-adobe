# Delivery module implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (one session per file) or
> superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. **Read only this file plus your
> session file** (and the spec sections it names). Do not read the other session files.

**Goal:** In-house drivers deliver every order; ops assigns them in the admin panel; proof is OTP + photo.

**Architecture:** New `DeliveryModule` in the NestJS backend (`apps/backend/src/modules/delivery/`) owns drivers,
vehicles and assignments. Group status stays on `order_vendor_group`, extended with two statuses. Admin panel gets
queue, board and driver screens. Mobile screens are built by another developer against
[the contract](../../../delivery-mobile-api-contract.md).

**Tech Stack:** NestJS 11, Sequelize (sequelize-typescript), PostgreSQL, jest; React + Vite + TanStack Query,
vitest; shared types in `packages/types`.

**Spec:** [../../specs/2026-11-10-delivery-module-design.md](../../specs/2026-11-10-delivery-module-design.md)
**Product decisions:** [../../../decisions/0060-delivery-module-mvp-flow.md](../../../decisions/0060-delivery-module-mvp-flow.md)

## Global Constraints

- **Never edit `apps/mobile`** (owned by another developer). Backend and admin adapt to the contract.
- Work on a new branch `feat/delivery-module` from `main`. **Do not merge or deploy**; ask the user which merge method first.
- Pre-launch: production rows are test data. No backfills, no grandfathering.
- Use real file paths from this plan; read the named neighbour file for the pattern before writing.
- Commit messages: `Delivery: <what> (decision 0060)`, ending with the repo's usual `Co-Authored-By` line.
- Backend tests: `pnpm --filter @golden-abode/backend test -- <path-or-name>`. Admin tests:
  `pnpm --filter @golden-abode/admin exec vitest run <path>`. Typecheck before each commit:
  `pnpm --filter @golden-abode/backend exec tsc --noEmit` (and the admin equivalent for UI sessions).
- Migrations: `apps/backend/database/migrations/YYYYMMDDHHMMSS-name.js` with `up`/`down`; run with
  `pnpm --filter @golden-abode/backend migration:run`.
- Every new backend DTO uses `class-validator` + `@ApiProperty`, as the neighbouring DTOs do.
- Decision log rule: any new design choice you make goes into decision 0060 (or a new record), not only chat.

## Review Focus (each line is tested in the session that owns the code)

1. Two admins assign the same group at once: the second must fail, not create two open assignments (S1 index, S4).
2. Order refunded or cancelled while the driver is mid-delivery: driver actions rejected, job shows `blocked` (S5).
3. Wrong OTP five times: locked; correct OTP afterwards still refused (S5).
4. Customer edits their address after paying: driver still sees the paid-for address (S2).
5. A vendor tries `shipped`/`delivered` or touches another vendor's group: rejected (S2, S6).

## Sessions

| # | File | Delivers | Needs |
|---|---|---|---|
| S1 | [01-foundation.md](01-foundation.md) | Shared types, DRIVER role, tables, models | — |
| S2 | [02-order-state-machine.md](02-order-state-machine.md) | New statuses, vendor limits, address snapshot, override cleanup | S1 |
| S3 | [03-admin-drivers-vehicles.md](03-admin-drivers-vehicles.md) | Admin API for drivers, vehicles, documents | S1 |
| S4 | [04-admin-assignments.md](04-admin-assignments.md) | Queue, assign, reassign, re-attempt, board API | S1, S2, S3 |
| S5 | [05-driver-api.md](05-driver-api.md) | Driver deliveries API, photo upload, OTP | S4 |
| S6 | [06-vendor-customer-notifications.md](06-vendor-customer-notifications.md) | Vendor handover, customer OTP, notifications | S5 |
| S7 | [07-admin-ui-drivers.md](07-admin-ui-drivers.md) | Admin screens: drivers, vehicles | S3 |
| S8 | [08-admin-ui-delivery.md](08-admin-ui-delivery.md) | Admin screens: queue, board, order modal | S4 |
| S9 | [09-wrap-up.md](09-wrap-up.md) | End-to-end check, docs, decision status | all |

S2 and S3 can run in either order; S7 can run any time after S3, S8 after S4.

## Progress (tick and commit at the end of each session)

- [x] S1 foundation
- [ ] S2 order state machine
- [ ] S3 admin drivers and vehicles API
- [ ] S4 admin assignments API
- [ ] S5 driver API
- [ ] S6 vendor, customer, notifications
- [ ] S7 admin UI: drivers and vehicles
- [ ] S8 admin UI: queue, board, order modal
- [ ] S9 wrap-up

## Starting a session (paste this)

> Implement session SN of the delivery module. Read `docs/superpowers/plans/2026-11-10-delivery-module/00-README.md`
> and `NN-name.md` only, plus the spec sections they cite. Use superpowers:executing-plans. Tick the progress box
> in 00-README when done and commit.
