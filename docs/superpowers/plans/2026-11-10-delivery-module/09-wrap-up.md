# S9: Wrap-up (end-to-end check, docs, status)

Needs S1-S8 done. Do **not** merge or deploy; ask the user which merge method first.

## Task 1: End-to-end API test
**Files:** Create `apps/backend/src/modules/delivery/__tests__/delivery-flow.e2e.spec.ts` (real DB via `test-db.ts`, HTTP via the
patterns in `payments-test-app.ts`).
- [ ] **Step 1: Write the test** walking the whole happy path through HTTP with real tokens: seed customer + vendor + a `confirmed`
  group; vendor `PATCH .../status {ready_for_pickup}`; admin creates driver, `POST /admin/delivery/assignments`; driver `GET /driver/deliveries`
  sees it; vendor `POST .../handover`; driver `pickup` → customer `GET /orders/:id` shows `deliveryOtp: '123456'` and group `shipped`; driver
  `complete` with the OTP and a stubbed uploaded photo → group `delivered`. Second test: `fail` → `delivery_failed` → admin `reattempt` →
  `shipped` → `complete`. Third test: refund the order mid-way → driver `pickup` returns 400 and the job reads `blocked: true`.
- [ ] **Step 2: Run** `... test -- delivery-flow`. Fix defects found in earlier sessions in their own files (not here).
- [ ] **Step 3: Run the whole backend and admin suites and both typechecks.** Expected: all green.
- [ ] **Step 4: Commit** `Delivery: end-to-end flow test (decision 0060)`.

## Task 2: Documentation
- [ ] **Step 1:** In `docs/order-flow.md` replace section 8 ("Delivery tracking, not built yet") with the real status flow and endpoints (copy
  from the contract); update section 6's status enum list.
- [ ] **Step 2:** Update `docs/delivery-mobile-api-contract.md` header from "Draft, nothing is built yet" to the real state and fix any shape that
  drifted during implementation. Tell the user the mobile developer can now start.
- [ ] **Step 3:** Decision 0060: set Status to `Accepted and built (pending merge)`, mark 0047 `Superseded by 0060`, update both rows in
  `docs/decisions/README.md`, and list anything still open in its "Open follow-ups" table (client answers on failed-delivery handling, OTP
  confirmation, unloading, delivery fee).
- [ ] **Step 4:** Tick S9 in `00-README.md`. **Commit** `Delivery: docs and decision status (decision 0060)`.

## Task 3: Hand-off note to the user
- [ ] Report: what shipped, which of "My calls" in the spec changed during build, the open client questions, and the pre-live checklist
  (run the two migrations on prod via the usual SSM path, which needs the user's permission; set `USE_MSG91_SMS` unchanged; create the first driver in the admin panel).
