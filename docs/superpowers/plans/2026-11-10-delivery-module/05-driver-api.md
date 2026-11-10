# S5: Driver API

Spec: rules 3-6, 10. Contract: `docs/delivery-mobile-api-contract.md` §1 (the response shapes live there; match them exactly).
Needs S4. Pattern: `modules/orders/orders.controller.ts` (guards, `req.user.sub`) and
`modules/artisans/artisans.service.ts:160-215` (presign/confirm).

**Produces** in `modules/delivery/`:
- `DeliveryPhotoService`: `createUploadUrl(groupId: string, kind: DeliveryPhotoKind, contentType: string): Promise<PresignedPost>`
  and `assertUploadedKey(groupId: string, kind: DeliveryPhotoKind, key: string): Promise<void>` (prefix
  `delivery/<groupId>/<kind>-`, `storage.head(key)` must exist; jpeg/png only).
- `DriverDeliveriesService`: `getProfile(userId)`, `list(userId, scope)`, `get(userId, assignmentId)`,
  `pickup(userId, assignmentId, items)`, `createPhotoUrl(userId, assignmentId, kind, contentType)`,
  `complete(userId, assignmentId, otp, photoKey)`, `fail(userId, assignmentId, reason, note, photoKey)`; every method resolves
  the driver from `userId` and 404s when the assignment belongs to another driver.
- `toDeliveryJobDto(assignment): DeliveryJobDto` (type in `delivery.types.ts`, shape per contract; `blocked`/`blockedReason` set when
  the parent order is locked or the group is `cancelled`).
- `DriverController` (`@Roles(Role.DRIVER)`, prefix `driver`).

## Task 1: Photo service
- [ ] **Step 1: Failing tests** `__tests__/delivery-photo.service.spec.ts` (mock `OBJECT_STORAGE`): key starts `delivery/<groupId>/delivered-`
  and ends `.jpg` for `image/jpeg`; `application/pdf` → 400; `assertUploadedKey` rejects a key for another group, another kind, or
  a missing object.
- [ ] **Step 2: Run** `... test -- delivery-photo`. FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: photo service (decision 0060)`.

## Task 2: Profile, list, detail, DTO mapper
- [ ] **Step 1: Failing tests** `__tests__/driver-deliveries.service.spec.ts`: `list('active')` returns only `assigned`/`picked_up` for this driver, newest
  first; `list('history')` returns `delivered`/`failed`; another driver's assignment → 404; DTO `drop` uses the order's
  `deliveryAddressSnapshot` (not the live address); DTO `pickup` has vendor shop name, address, phone; `items` carry name/qty/unit;
  parent order `refunded` → `blocked: true` with a reason; `getProfile` returns helper and vehicle (null when absent).
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** with one eager-loaded query (assignment → group → order, vendor, items). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: driver job list and detail (decision 0060)`.

## Task 3: Pickup
- [ ] **Step 1: Failing tests:** valid checklist (every item `loaded:true`) → assignment `picked_up`, group `shipped`, `deliveryOtp` set
  (`'123456'` when `USE_MSG91_SMS` is not `'true'`), `sendDeliveryOtp(customerId, orderId, otp)` and `sendOrderStatusChanged` called;
  missing item or `loaded:false` → 400 and nothing changes; assignment not `assigned` → 400; group not `ready_for_pickup` → 400;
  locked parent → 400 (**Review Focus 2**).
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** in one transaction. **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: driver pickup (decision 0060)`.

## Task 4: Complete with OTP and photo
- [ ] **Step 1: Failing tests:** correct OTP + valid photo → assignment `delivered`, `deliveredAt`, `deliveryPhotoKey` set, group `delivered`,
  customer notified; wrong OTP → 400 and `otpAttempts` +1; the 5th wrong OTP → 403 and afterwards even the **correct** OTP → 403
  (**Review Focus 3**); missing/foreign photo key → 400 and OTP attempts untouched; assignment `assigned` (not picked up) → 400;
  locked parent → 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (compare OTP with `crypto.timingSafeEqual`; increment attempts in the same transaction as the check).
- [ ] **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: complete with OTP and photo (decision 0060)`.

## Task 5: Fail
- [ ] **Step 1: Failing tests:** valid reason + photo → assignment `failed`, group `delivery_failed`, reason/note/photo stored; reason outside
  `DELIVERY_FAILURE_REASONS` → 400; missing photo → 400; `note` over 500 chars → 400; assignment not `picked_up` → 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: failed delivery (decision 0060)`.

## Task 6: Controller wiring
**Files:** Create `modules/delivery/driver.controller.ts`, `dto/*.dto.ts`; Test `__tests__/driver.controller.spec.ts` (HTTP-level, copy the setup of
`modules/artisans/__tests__/artisans-test-app.ts`).
- [ ] **Step 1: Failing tests:** every route returns 401 without a token and 403 for CUSTOMER / VENDOR / ADMIN tokens; DRIVER token reaches
  `GET /driver/me`; request-body validation (`otp` must be 6 digits, `items` non-empty) returns 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** routes exactly as in the contract. **Step 4: Run** full suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Delivery: driver controller (decision 0060)`; tick S5.
