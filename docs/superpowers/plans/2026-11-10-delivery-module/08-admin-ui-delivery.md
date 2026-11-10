# S8: Admin UI, delivery queue, board, order modal

Needs S4 (API). Same patterns and test commands as S7 (`pages/OrdersPage.tsx` + spec for the table/modal style).
Reuses `services/api/deliveryService.ts` and `queries/useDeliveryQueries.ts` from S7; if S7 has not run, create them here.

**Produces:**
- `deliveryService.assignments.{queue,list,assign,reassign,reattempt}` and hooks `useDeliveryQueueQuery`, `useAssignmentsQuery(filters)`,
  `useAssignMutation`, `useReassignMutation`, `useReattemptMutation` (all invalidate `['delivery']` and `['orders']`).
- `pages/DeliveryQueuePage.tsx` at `ROUTES.deliveryQueue = '/delivery/queue'` ("Ready to deliver").
- `pages/DeliveryBoardPage.tsx` at `ROUTES.deliveryBoard = '/delivery/board'` ("In transit").
- `components/orders/OrderDeliverySection.tsx` used inside the existing order detail modal.
- Status labels/colours for `ready_for_pickup` and `delivery_failed` wherever group statuses are rendered (grep `'shipped'` in `apps/admin/src`).

## Task 1: Queue and assign
- [ ] **Step 1: Failing tests** `pages/DeliveryQueuePage.spec.tsx`: lists ready groups (order id, vendor, drop city/pincode, item count, waiting time);
  "Assign" opens a driver select (active drivers only, shows helper and vehicle); confirming calls `POST /admin/delivery/assignments`
  with `{orderVendorGroupId, driverId}`; a 409 from the API shows "Already assigned" and refreshes the list; an empty queue shows an empty state.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement** page, route, sidebar entry "Ready to deliver". **Step 4: Run.** PASS.
- [ ] **Step 5: Commit** `Delivery: ops queue page (decision 0060)`.

## Task 2: Board
- [ ] **Step 1: Failing tests** `pages/DeliveryBoardPage.spec.tsx`: tabs Assigned / Picked up / Failed / Delivered call the list with the matching
  `status`; an assigned row has "Reassign" (driver select); a failed row shows reason and "Re-attempt" (driver select, calls
  `POST /admin/delivery/groups/:groupId/reattempt`); a delivered row has a "View photo" link from `deliveryPhotoViewUrl`; failed rows show the failure photo link.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run.** PASS. **Step 5: Commit** `Delivery: in-transit board (decision 0060)`.

## Task 3: Order modal section and status labels
- [ ] **Step 1: Failing tests** (extend `OrdersPage.spec.tsx`): a vendor group with status `ready_for_pickup` renders "Packed, waiting for driver";
  `delivery_failed` renders a red "Delivery failed" label; the new `OrderDeliverySection` shows driver name/phone, helper, timestamps and photo links
  when an assignment exists, and nothing when it does not. The admin order detail endpoint must return the assignment: if it does not yet,
  add `assignments` to the admin order DTO in `modules/orders/admin-order.mapper.ts` (+ its spec `admin-order.mapper.spec.ts`) in this task.
- [ ] **Step 2: Run.** FAIL. **Step 3: Implement.** **Step 4: Run** full admin suite + `tsc --noEmit`. PASS.
- [ ] **Step 5: Browser check** with local Playwright (backend + admin on spare ports): force a group to `ready_for_pickup` through the admin
  override, assign a driver from the queue, see it on the board. **Commit** `Delivery: order modal delivery section (decision 0060)`; tick S8.
