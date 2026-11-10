# S6: Vendor handover, customer OTP, notifications

Spec: rule 9, "Notifications", "Actors". Contract: §2 and §3. Needs S5 (uses `DeliveryPhotoService`).

The notification interface methods already exist (added in S4 Task 1).

## Task 1: Wire `sendDeliveryAssigned`
- [ ] **Step 1: Failing test** (in `delivery-assignments.service.spec.ts`): `assign` and `reassign` call
  `sendDeliveryAssigned(driver.userId, assignment.id)` after commit, and a thrown notification error does not fail the assignment.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (post-commit, try/catch + log). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: notify driver on assignment (decision 0060)`.

## Task 2: Vendor handover and photo URL
**Files:** Create `modules/delivery/vendor-handover.service.ts`; Modify `modules/vendors/vendors.controller.ts` (near line 151),
`modules/vendors/vendors.module.ts` (import `DeliveryModule`; export `DeliveryPhotoService` and the new service from it).
**Produces:** `VendorHandoverService.createPhotoUrl(vendorId, groupId, contentType)` and
`.markHandedOver(vendorId, groupId, photoKey?: string)`.
- [ ] **Step 1: Failing tests** `__tests__/vendor-handover.service.spec.ts`: group of another vendor → 404 (**Review Focus 5**); no open
  assignment → 400 "no driver assigned yet"; with open assignment sets `vendorHandedOverAt`; second call keeps the first timestamp; photo key must
  pass `assertUploadedKey(groupId,'handover',key)` else 400; group status never changes.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** `POST /vendors/order-groups/:id/photo-url` and `/handover` on the vendor controller
  (same guards as the neighbouring routes, including `ApprovedGuard`). **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: vendor handover (decision 0060)`.

## Task 3: Customer sees the OTP
**Files:** Modify `modules/orders/order-display.include.ts`, `order-display.mapper.ts`, `packages/types/src/order.types.ts`
(`deliveryOtp: string | null` on the customer's vendor-group DTO); Test `__tests__/order-display.mapper.spec.ts`.
- [ ] **Step 1: Failing tests:** group `shipped` with an open `picked_up` assignment → `deliveryOtp` equals the assignment's OTP; group in
  any other status → `null`; the **vendor's** and **admin's** group views never include the field; artisan view (artisan can read an attributed
  order) never includes it.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** (include the open assignment only in the customer include). **Step 4: Run** orders suite + typecheck. PASS.
- [ ] **Step 5: Commit** `Delivery: customer delivery OTP (decision 0060)`; tick S6.
