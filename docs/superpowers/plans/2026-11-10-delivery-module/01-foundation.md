# S1: Foundation (types, role, tables, models)

Spec: "State machine", "Data model". Branch: create `feat/delivery-module` from `main` first.

## Task 1: Shared types

**Files:** Create `packages/types/src/delivery.types.ts`; Modify `packages/types/src/role.enum.ts`,
`packages/types/src/order.types.ts:19-37`, `packages/types/src/index.ts`; Test
`apps/backend/src/modules/delivery/__tests__/delivery-types.spec.ts`.

**Produces** (exact names, later sessions import them):
- `Role.DRIVER = 'DRIVER'`.
- `ORDER_VENDOR_GROUP_STATUSES` gains `READY_FOR_PICKUP: 'ready_for_pickup'`, `DELIVERY_FAILED: 'delivery_failed'`;
  `ORDER_VENDOR_GROUP_NEXT_STATUSES` equals the shared map in the spec.
- In `delivery.types.ts`: `DELIVERY_ASSIGNMENT_STATUSES` (`ASSIGNED:'assigned'`, `PICKED_UP:'picked_up'`,
  `DELIVERED:'delivered'`, `FAILED:'failed'`, `CANCELLED:'cancelled'`), `type DeliveryAssignmentStatus`,
  `DELIVERY_FAILURE_REASONS` (`['customer_unavailable','site_inaccessible','customer_refused','goods_damaged','other'] as const`),
  `type DeliveryFailureReason`, `DELIVERY_OTP_MAX_ATTEMPTS = 5`, `DEMO_DELIVERY_OTP = '123456'`,
  `DELIVERY_PHOTO_KINDS = ['handover','delivered','failed'] as const`, `type DeliveryPhotoKind`.
  DTO interfaces are added by the sessions that build the endpoints (shapes: the contract file §1 and spec).

- [ ] **Step 1: Write the failing test** `delivery-types.spec.ts`: `Role.DRIVER === 'DRIVER'`;
  `ORDER_VENDOR_GROUP_NEXT_STATUSES.confirmed` equals `['ready_for_pickup','cancelled']`;
  `.ready_for_pickup` equals `['shipped','cancelled']`; `.shipped` equals `['delivered','delivery_failed']`;
  `.delivery_failed` equals `['shipped','cancelled']`; `DELIVERY_OTP_MAX_ATTEMPTS === 5`.
- [ ] **Step 2: Run** `pnpm --filter @golden-abode/backend test -- delivery-types`. Expected: FAIL (missing exports).
- [ ] **Step 3: Implement** the types above. Check `packages/types/package.json`: if consumers read `dist`, run its build script.
- [ ] **Step 4: Run** the test again. Expected: PASS. Also `tsc --noEmit` for backend and admin (the new
  `Role` and status values may expose exhaustive switches; fix each by adding the new case).
- [ ] **Step 5: Commit** `Delivery: shared types, DRIVER role, new group statuses (decision 0060)`.

## Task 2: Migrations

**Files:** Create `apps/backend/database/migrations/20261110090000-add-driver-role-and-delivery-tables.js` and
`20261110090100-add-delivery-address-snapshot-to-orders.js`. Test:
`apps/backend/src/modules/delivery/__tests__/delivery-schema.spec.ts` (real DB; copy the setup from
`modules/orders/__tests__/payments-schema.spec.ts` and `test-db.ts`).

- [ ] **Step 1: Write the failing test.** Cases: (a) inserting a `users` row with role `'DRIVER'` succeeds;
  (b) two `delivery_assignments` rows for one group, both `status='assigned'`, raise a unique violation on
  `uq_delivery_assignment_open`; (c) a `cancelled` row plus an `assigned` row for the same group is allowed;
  (d) `orders.delivery_address_snapshot` accepts a JSON object and is nullable.
- [ ] **Step 2: Run** `... test -- delivery-schema`. Expected: FAIL (tables missing).
- [ ] **Step 3: Implement** the two migrations exactly per spec "Data model". First statement of the first
  migration: `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'DRIVER'` (precedent
  `20261104090000-add-artisan-response-to-hire-requests.js`). `down` drops tables/index/column; the enum value stays.
- [ ] **Step 4: Run** the migration command, then the test. Expected: PASS.
- [ ] **Step 5: Commit** `Delivery: migrations for drivers, vehicles, assignments, address snapshot (decision 0060)`.

## Task 3: Models and module shell

**Files:** Create `modules/delivery/models/{vehicle,driver,delivery-assignment}.model.ts`,
`modules/delivery/delivery.module.ts`; Modify `apps/backend/src/app.module.ts`, `modules/orders/models/order.model.ts`.

**Produces:** classes `Vehicle`, `Driver`, `DeliveryAssignment` (column names per spec, `underscored: true`,
associations: `Driver.belongsTo(User)`, `Driver.belongsTo(Vehicle)`, `DeliveryAssignment.belongsTo(Driver)`,
`.belongsTo(OrderVendorGroup)`); `Order.deliveryAddressSnapshot: DeliveryAddressSnapshot | null` (JSONB, add the
interface in `delivery.types.ts`); `DeliveryModule` registering the three models with `SequelizeModule.forFeature`
and exporting `SequelizeModule`.

- [ ] **Step 1: Write the failing test** in `delivery-schema.spec.ts` (extend): create a Vehicle, a User(role DRIVER),
  a Driver, then `Driver.findByPk(id, {include: [Vehicle, User]})` returns both associations; creating a
  `DeliveryAssignment` and reloading it keeps `status`, `attemptNo === 1`, `otpAttempts === 0`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** models mirroring the style of `modules/orders/models/order-vendor-group.model.ts`;
  register `DeliveryModule` in `app.module.ts`.
- [ ] **Step 4: Run** the spec plus the full backend suite. Expected: PASS, no regressions.
- [ ] **Step 5: Commit** `Delivery: models and module shell (decision 0060)`; tick S1 in 00-README.
