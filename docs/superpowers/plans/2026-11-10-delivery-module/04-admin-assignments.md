# S4: Admin assignments API (queue, assign, reassign, re-attempt, board)

Spec: rules 1, 2, 7, 8, 4 (OTP). Needs S1, S2, S3. Pattern: `modules/orders/admin-orders.controller.ts` + its list spec
`__tests__/admin-orders.list.spec.ts`.

**Endpoints** (`@Roles(Role.ADMIN)`, prefix `admin/delivery`):
`GET /admin/delivery/queue` · `GET /admin/delivery/assignments?status=&driverId=&page=&pageSize=` ·
`POST /admin/delivery/assignments` `{orderVendorGroupId, driverId}` ·
`POST /admin/delivery/assignments/:id/reassign` `{driverId}` ·
`POST /admin/delivery/groups/:groupId/reattempt` `{driverId}`.

**Produces:**
- `modules/delivery/delivery-otp.ts`: `generateDeliveryOtp(useRealSms: boolean): string` (returns `DEMO_DELIVERY_OTP` when false).
- `modules/delivery/delivery-rules.ts`: `assertParentNotLocked(orderStatus: OrderStatus): void` (throws BadRequest
  with `GROUP_LOCKED_MESSAGE` from `orders.service.ts:58`; export that constant if it is private).
- `DeliveryAssignmentsService`: `listQueue(query): Promise<Paginated<QueueItemDto>>`, `list(query): Promise<Paginated<AdminAssignmentDto>>`,
  `assign(adminUserId, dto): Promise<AdminAssignmentDto>`, `reassign(adminUserId, assignmentId, driverId)`,
  `reattempt(adminUserId, groupId, driverId)`.
- Types in `delivery.types.ts`: `QueueItemDto {groupId, orderId, vendorName, vendorCity, dropCity, dropPincode, itemCount, readyAt}`,
  `AdminAssignmentDto {id, status, attemptNo, groupId, orderId, vendorName, driver:{id,name,phone}, assignedAt, vendorHandedOverAt, pickedUpAt, deliveredAt, failedAt, failureReason, deliveryPhotoViewUrl|null, failurePhotoViewUrl|null}`.
  Use the repo's existing paginated type from `packages/types/src/pagination.types.ts`.

## Task 1: OTP, rules helpers and notification methods
**Also modify:** `modules/notifications/notification.interface.ts`, `log-notification.service.ts` (+ any test mocks of
`NotificationService`). **Produces:** `sendDeliveryAssigned(driverUserId: string, assignmentId: string): Promise<void>` and
`sendDeliveryOtp(customerId: string, orderId: string, otp: string): Promise<void>` (log-only, like the existing methods).
- [ ] **Step 1: Failing tests** `__tests__/delivery-helpers.spec.ts`: `generateDeliveryOtp(false) === '123456'`;
  `generateDeliveryOtp(true)` matches `/^\d{6}$/` over 200 calls and never starts with `0`;
  `assertParentNotLocked('refunded')` throws, `('confirmed')` does not. In the existing notifications spec:
  `LogNotificationService.sendDeliveryAssigned('user-1','asg-1')` and `sendDeliveryOtp('cust-1','order-1','123456')` resolve and log one line each.
- [ ] **Step 2: Run** `... test -- delivery-helpers` and `... test -- notifications`. FAIL. **Step 3: Implement** (`crypto.randomInt(100000, 1000000)`).
- [ ] **Step 4: Run** the suites and typecheck. PASS. **Step 5: Commit** `Delivery: OTP, rules and notification methods (decision 0060)`.

## Task 2: Queue
- [ ] **Step 1: Failing tests** `__tests__/delivery-assignments.service.spec.ts` (`listQueue`): returns only groups with status
  `ready_for_pickup` and no open assignment; excludes groups whose parent order is locked; ordered oldest-ready first;
  `cityId` filter limits to the vendor's city.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** `listQueue` + `AdminDeliveryController`. **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: ops queue (decision 0060)`.

## Task 3: Assign and reassign
- [ ] **Step 1: Failing tests:** `assign` creates `assigned` row with `assignedBy` (the driver notification is wired in S6, not here); group not `ready_for_pickup` → 400;
  group already has an open assignment → 409 (also when the DB unique index raises, map the error to 409);
  inactive driver (user `isActive=false`) → 400; locked parent → 400. `reassign` of an `assigned` row cancels it and creates a new
  one for the new driver in one transaction; reassign of a `picked_up` row → 400.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** with a transaction and `SELECT ... FOR UPDATE` on the group row.
- [ ] **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: assign and reassign (decision 0060)`.

## Task 4: Re-attempt
- [ ] **Step 1: Failing tests:** group `delivery_failed` + driver → new assignment `picked_up`, `attemptNo` = previous + 1,
  fresh `deliveryOtp` from `generateDeliveryOtp(useRealSms)`, `pickedUpAt` set, group → `shipped`, `sendOrderStatusChanged`
  called; group in any other status → 400; locked parent → 400; `otpAttempts` starts at 0.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: re-attempt after failure (decision 0060)`.

## Task 5: Board list
- [ ] **Step 1: Failing tests** (`list`): filter by `status` and `driverId`; paginated; includes `deliveryPhotoViewUrl` via
  `presignGet` only for `delivered` rows.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** full suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Delivery: ops board list (decision 0060)`; tick S4.
