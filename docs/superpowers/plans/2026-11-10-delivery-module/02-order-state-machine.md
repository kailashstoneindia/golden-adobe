# S2: Order state machine changes

Spec: "Actors", "State machine", rule 8. Needs S1 merged into the branch.

## Task 1: Backend status enum and vendor limits

**Files:** Modify `modules/orders/models/order-vendor-group.model.ts:14-20`, `modules/orders/orders.service.ts:331-393`
(`updateVendorGroupStatus`), `modules/orders/dto/` (the vendor status DTO used by `vendors.controller.ts:151-165`);
Test `modules/orders/__tests__/orders.service.spec.ts` (extend `describe('updateVendorGroupStatus')`, line ~398).

**Produces:** `OrderVendorGroupStatus.READY_FOR_PICKUP`, `.DELIVERY_FAILED`. Vendor table:
`CONFIRMED:[READY_FOR_PICKUP, CANCELLED]`, all other statuses `[]`.

- [ ] **Step 1: Write failing tests** (mock style of the neighbours): `CONFIRMED → READY_FOR_PICKUP` saves and calls
  `sendOrderStatusChanged(customerId, orderId, 'ready_for_pickup')`; `CONFIRMED → SHIPPED` throws BadRequest
  `cannot transition order group from confirmed to shipped`; `SHIPPED → DELIVERED` by vendor throws;
  `READY_FOR_PICKUP → CANCELLED` by vendor throws; a group of another vendor still 404s (existing behaviour).
- [ ] **Step 2: Run** `... test -- orders.service`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the enum additions and the reduced transition table. Keep the locked-parent guard.
- [ ] **Step 4: Run.** Expected: PASS; fix older tests that assumed vendors can ship (update them to the new rule).
- [ ] **Step 5: Commit** `Delivery: vendors can only mark ready for pickup (decision 0060)`.

## Task 2: Address snapshot at checkout

**Files:** Modify `modules/orders/checkout.service.ts` (address load ~line 155, order create ~line 441),
`modules/orders/order-display.mapper.ts:46-68`, `modules/orders/dto` order response types if they expose the address;
Test `modules/orders/__tests__/checkout.service.spec.ts`, `order-display.mapper.spec.ts`.

**Consumes:** `Order.deliveryAddressSnapshot` (S1). **Produces:** `buildAddressSnapshot(address: CustomerAddress,
recipient: {name: string; phone: string}): DeliveryAddressSnapshot` exported from `modules/orders/delivery-address-snapshot.ts`;
checkout writes it; display mapper prefers the snapshot.

- [ ] **Step 1: Write failing tests:** (a) checkout creates the order with a snapshot whose `addressLine1`, `city`,
  `pincode`, `recipientName`, `recipientPhone` equal the address and the customer's user; (b) mapper given an order whose
  live address row was edited after checkout returns the snapshot values, not the edited ones; (c) mapper with a null
  snapshot (old orders) falls back to the live row.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Recipient name/phone come from the customer's `users` row (find how `checkout.service.ts`
  resolves the customer and load its user in the same query).
- [ ] **Step 4: Run** the orders suite. Expected: PASS.
- [ ] **Step 5: Commit** `Delivery: snapshot the delivery address at checkout (decision 0060)`.

## Task 3: Admin override closes open assignments

**Files:** Modify `modules/orders/orders.service.ts:548-` (`adminOverrideVendorGroupStatus`), `modules/orders/orders.module.ts`
(add `DeliveryAssignment` to `SequelizeModule.forFeature`); Test `orders.service.spec.ts`.

- [ ] **Step 1: Write failing tests:** override to `cancelled` with an open assignment → that assignment gets
  `status 'cancelled'` and `cancelledAt` set, inside the same transaction; override to `shipped` or `ready_for_pickup`
  leaves it untouched; override with no open assignment works as before.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with `DeliveryAssignment.update({status, cancelledAt}, {where: {orderVendorGroupId, status: [assigned, picked_up]}, transaction})`.
- [ ] **Step 4: Run** orders suite + typecheck. Expected: PASS.
- [ ] **Step 5: Commit** `Delivery: admin override cancels open assignments (decision 0060)`; tick S2.
