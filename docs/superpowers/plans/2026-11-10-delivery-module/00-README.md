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
- [x] S2 order state machine
- [x] S3 admin drivers and vehicles API
- [x] S4 admin assignments API
- [x] S5 driver API
- [x] S6 vendor, customer, notifications
- [x] S7 admin UI: drivers and vehicles
- [x] S8 admin UI: queue, board, order modal
- [ ] S9 wrap-up

## Starting a session (paste this)

> Implement session SN of the delivery module. Read `docs/superpowers/plans/2026-11-10-delivery-module/00-README.md`
> and `NN-name.md` only, plus the spec sections they cite. Use superpowers:executing-plans. Tick the progress box
> in 00-README when done and commit.

## Handoff (read this first in a new session; updated 2026-11-10)

**Branch:** `feat/delivery-module`. Done: S1-S8. `.claude/settings.json` is modified and deliberately NOT committed; never stage it.

**Next step: S9 wrap-up** (`09-wrap-up.md`). Backend and admin UI are feature complete.

Backend API for all admin screens exists (S3, S4). Run the full backend suite and `tsc --noEmit` before the S9 sign-off.

### Rulings and facts later sessions rely on
- Vendors may only do `confirmed -> ready_for_pickup` and cancel (S2). Shipped/delivered belong to drivers and ops.
- `readyAt` in the queue is the group's `updated_at` (no dedicated column).
- Queue and board paging use `page`/`pageSize`; response is the repo's `PaginatedResponse` (`limit` = page size).
- Driver list leaves document links `null`; only `GET /admin/drivers/:id` signs them.
- Upload-url responses also return an explicit `key`; JPEG keys end `.jpg`.
- `reattempt` sends `sendOrderStatusChanged(shipped)` and `sendDeliveryOtp` after commit, best effort. The OTP is
  not written to logs.
- `GROUP_LOCKED_MESSAGE` now lives in `orders/refund-status.ts`; use `assertParentNotLocked` from `delivery/delivery-rules.ts`.
- Group locking helper `lockGroup` (SELECT ... FOR UPDATE OF g, returns parent order status and customerId) is private to
  `DeliveryAssignmentsService`; S5 can copy or extract it.
- Checkout stores `orders.delivery_address_snapshot`; display mappers and the queue prefer it over the live address.

- S5: `lockGroup` now lives in `delivery/delivery-group-lock.ts` (shared by both services). Driver service is `driver-deliveries.service.ts`; `DeliveryPhotoService` mints/validates `delivery/<groupId>/<kind>-<uuid>.(jpg|png)` keys (kinds `handover`/`delivered`/`failed`; S6 reuses `handover`).
- Delivery spec cleanup now deletes only rows the module instance created (create hooks), so delivery specs run safely in parallel. Use `setupDriverFixture()` from `__tests__/driver-fixture.ts` for driver specs.
- `it.each` rows must have as many values as the test has parameters, or Jest treats the extra one as a `done` callback and the test hangs.

### Practical notes (save yourself the debugging)
- **Shell:** big heredocs containing apostrophes can make the Bash tool fail to parse the whole command and run
  nothing. Create files with the Write tool and make small edits with Edit or a short `node` script.
- **Types package:** after editing `packages/types/src`, run `pnpm build` inside `packages/types` (consumers read `dist`).
- **Test DB:** local `golden_abode_test`. Run migrations with `NODE_ENV=test pnpm migration:run` from `apps/backend`
  (S1 migrations already applied there).
- **Test helpers:** `delivery/__tests__/delivery-test-app.ts` (`createDeliveryTestModule(providers)`: real DB, fake storage,
  cleanup by `TEST-` / `Test Driver` markers). `delivery-assignments.service.spec.ts` has a `setup()` that combines it with
  the payments harness (`seedReadyGroup`, `makeDriver`). Both harnesses share static model classes, so `close()` closes the
  payments app first, then the delivery module.
- Last full backend run: 79 suites / 836 tests green before S4; S4 specs since then pass (24 in the assignments spec).
  Run the full suite again before the S4 commit.
- Per instruction: push to origin after each session once tests pass.
- S6: `VendorHandoverService` (`delivery/vendor-handover.service.ts`) backs `POST /vendors/order-groups/:id/photo-url` and `/handover`; `VendorsModule` imports `DeliveryModule`. Specs that hand-build `VendorsController` must provide `VendorHandoverService` (see `vendor-onboarding-test-app.ts`).
- S6: the customer's `deliveryOtp` comes from `OrdersService.loadDeliveryOtps` (one extra query, shipped groups only, open `picked_up` assignment), passed into `toOrderDto`. No Sequelize association was added, because specs that list models would break. `OrderDto.vendorGroups` is `CustomerOrderVendorGroupDto[]`; vendor, admin and artisan views use `OrderVendorGroupDto` and cannot carry it.
- S6: `assign` and `reassign` notify the driver after commit (best effort). `reattempt` does not (the new attempt starts already picked up and the driver app pulls its list).
- S7: admin `DriversPage` (`/drivers`, sidebar "Drivers") with Drivers and Vehicles tabs; components in `apps/admin/src/components/delivery/`; hooks in `queries/useDeliveryQueries.ts` (`deliveryKeys.all = ['delivery']` is what every mutation invalidates; S8 should reuse the prefix). Shared fixtures: `src/test/deliveryFixtures.ts`. Browser-checked with Playwright (vehicle create and 409 message, driver create, edit helper, deactivate). The licence upload step reached the API (201) but the direct browser POST to S3 could not be verified because no S3 is reachable locally; the confirm step is covered by the component spec only.
- S8: pages `DeliveryQueuePage` (`/delivery/queue`, sidebar "Ready to deliver") and `DeliveryBoardPage` (`/delivery/board`, sidebar "In transit"); shared `DriverPickerModal` (active drivers only) serves assign, reassign and re-attempt. Order modal gets `OrderDeliverySection`, which calls `GET /admin/delivery/assignments?orderId=` (new filter, see decision 0060) instead of adding assignments to `AdminOrderDto`, so photo signing stays in the delivery module. `ready_for_pickup` reads "Packed, waiting for driver" and `delivery_failed` is red, inside the modal only; the override dropdown keeps the plain status names. Browser-checked end to end with Playwright (override to ready, queue, assign, board, modal). Two unrelated shared-DB specs flaked once each in full parallel runs and pass alone: `users.service.awaiting-document` (count read twice) and `vendor-onboarding.controller` (a city from a parallel spec).
