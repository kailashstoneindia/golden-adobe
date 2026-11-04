# Current payment implementation in golden-abode (as of main @ bb14228, 2026-11-03)

Scope: read-only map of checkout -> Razorpay -> webhook -> confirmation/stock -> sweep -> refund, with file:line citations. Paths are relative to `Z:\workspace\golden-abode`. ORM is **Sequelize** (sequelize-typescript), Postgres. Schema lives in Sequelize models (`apps/backend/src/modules/orders/models/*.model.ts`) and migrations (`apps/backend/database/migrations/*.js`). Anything not directly read in code is labelled "Inference".

## Q1. End-to-end flow, transactions, and status values

### Takeaway

Checkout is a two-phase flow: Phase 1 is one DB transaction (cart row lock, validate, inventory FOR UPDATE, reserve, create order rows, clear cart); Phase 2 calls Razorpay `orders.create` outside any transaction and compensates (release + cancel) on failure. The app opens the Razorpay sheet, ignores the result, and polls `GET /orders/:id`; only the signed `payment.captured` webhook confirms the order and turns the reservation into a real stock decrement. A cron sweep cancels `pending_payment` orders older than 20 minutes every 5 minutes.

### Cited Findings

**Status values**

- `OrderStatus` = `pending_payment`, `confirmed`, `cancelled`, `refunded` — [order.model.ts:14-19](apps/backend/src/modules/orders/models/order.model.ts)
- `OrderVendorGroupStatus` = `pending`, `confirmed`, `shipped`, `delivered`, `cancelled` — [order-vendor-group.model.ts:15-19](apps/backend/src/modules/orders/models/order-vendor-group.model.ts)
- Documented order state machine: PENDING_PAYMENT -> CONFIRMED (webhook `payment.captured`), CONFIRMED -> REFUNDED (admin refund), REFUNDED -> CANCELLED (admin cancel) — [order-flow.md:231-234](order-flow.md)
- `orders.status` is `STRING(32)`, default `pending_payment`, with **no CHECK constraint** on allowed values (the only CHECK on `orders` is `grand_total >= 0`) — [migration 20261008090003:37-41, 60-62](apps/backend/database/migrations/20261008090003-create-orders-domain.js)

**Step 1 — Mobile: place order**

- Checkout screen calls `placeOrder(activeAddressId)` after client-side guards (paint, unstocked, min-order shortfall) — [checkout.tsx:46-62](<apps/mobile/app/(screens)/checkout.tsx>)
- `placeOrder` = `POST /checkout` mutation -> open payment sheet -> `pollUntilResolved(order.id)` -> toast -> navigate to order detail — [usePlaceOrder.ts:15-25](apps/mobile/src/hooks/payments/usePlaceOrder.ts)
- Payment-sheet errors are caught and shown as a toast, then the flow **continues to polling** anyway (`openPaymentSheetOrWarn` swallows) — [usePlaceOrder.ts:54-63](apps/mobile/src/hooks/payments/usePlaceOrder.ts)
- If `razorpayOrderId` is null the sheet is silently skipped — [usePlaceOrder.ts:44-46](apps/mobile/src/hooks/payments/usePlaceOrder.ts)
- `openRazorpayCheckout` lazily `require`s `react-native-razorpay`, sends `{key, order_id, currency:'INR', name, amount}` and returns only `razorpay_payment_id` (signature and order id from the SDK result are discarded) — [razorpay.service.ts:25-52](apps/mobile/src/services/razorpay.service.ts)
- Amount passed to the sheet is computed client-side as `Math.round(grandTotal*100)` — [usePlaceOrder.ts:47-51](apps/mobile/src/hooks/payments/usePlaceOrder.ts). Project doc notes the widget reads the amount from the server-created Razorpay order — [order-flow.md:185](order-flow.md)
- Polling: `GET /orders/:id` every 2 000 ms, max 30 attempts (~60 s), stops once status != `pending_payment`; then invalidates order queries — [useOrderPaymentPoll.ts:17-32](apps/mobile/src/hooks/payments/useOrderPaymentPoll.ts), [app-constants.ts:12-13](apps/mobile/src/constants/app-constants.ts)
- Retry/resume: order detail shows "Pay" when status is `pending_payment` and `razorpayOrderId` exists; `payExistingOrder` reopens the sheet on the **same** `razorpayOrderId` and polls again — [order-detail/[id].tsx:57-71](<apps/mobile/app/(screens)/order-detail/[id].tsx>), [usePlaceOrder.ts:27-35](apps/mobile/src/hooks/payments/usePlaceOrder.ts)

**Step 2 — Backend checkout (`POST /checkout`)**

- Controller: customer-only (`JwtAuthGuard`, `RolesGuard`, `Role.CUSTOMER`), body = `CheckoutDto` — [orders.controller.ts:21-35](apps/backend/src/modules/orders/orders.controller.ts)
- Pre-transaction reads: resolve customer, validate optional booking, verify address ownership, `getOrCreateCart` — [checkout.service.ts:148-159](apps/backend/src/modules/orders/checkout.service.ts)
- **Phase 1 transaction** (`sequelize.transaction`) — [checkout.service.ts:185-494](apps/backend/src/modules/orders/checkout.service.ts):
  - `SELECT id FROM cart WHERE id = :cartId FOR UPDATE` serializes same-cart checkouts — [:186-190](apps/backend/src/modules/orders/checkout.service.ts)
  - single join query reads cart lines + listing + inventory + vendor — [:197-225](apps/backend/src/modules/orders/checkout.service.ts)
  - empty cart -> 400 `cart is empty` — [:227-233](apps/backend/src/modules/orders/checkout.service.ts)
  - per-line validation (listing ACTIVE, vendor active, paint rejected, no inventory row rejected, available >= requested) — [:235-281](apps/backend/src/modules/orders/checkout.service.ts); per-vendor `min_order_value` — [:294-322](apps/backend/src/modules/orders/checkout.service.ts); any rejection -> 400 — [:324-333](apps/backend/src/modules/orders/checkout.service.ts)
  - `SELECT ... FROM inventory ... FOR UPDATE` on all non-paint listings, re-check availability — [:353-385](apps/backend/src/modules/orders/checkout.service.ts)
  - single-statement reserve `quantity_reserved += qty` — [:392-408](apps/backend/src/modules/orders/checkout.service.ts)
  - computes `grandTotal = itemsTotal + loading/unloading fee` (rate currently 0) — [:55, 421-432](apps/backend/src/modules/orders/checkout.service.ts)
  - booking status re-checked inside txn — [:434-436](apps/backend/src/modules/orders/checkout.service.ts)
  - creates `orders` row with `status = PENDING_PAYMENT`, then `order_vendor_group` (status PENDING) and `order_items` (price snapshot) rows — [:438-480](apps/backend/src/modules/orders/checkout.service.ts)
  - deletes all `cart_item` rows in the same txn — [:487-491](apps/backend/src/modules/orders/checkout.service.ts)
- **Phase 2 (no transaction)**: `paymentProvider.createOrder(Math.round(grandTotal*100), order.id)`; store `razorpayOrderId` via `order.save()`; return DTO — [checkout.service.ts:496-509](apps/backend/src/modules/orders/checkout.service.ts)
- **Phase 2 compensation**: on any error (createOrder or the save), a second transaction decrements `quantity_reserved` per item, then `UPDATE orders SET status='cancelled' WHERE id AND status='pending_payment'`, then cancels PENDING groups; the error is rethrown to the client — [checkout.service.ts:510-558](apps/backend/src/modules/orders/checkout.service.ts)

**Step 3 — Razorpay provider**

- Interface: `createOrder(amountPaise, receiptId)`, `verifyWebhookSignature(rawBody, sig)`, `markCaptured(...)`, `refundPayment(paymentId, amountPaise)` — [payment-provider.interface.ts:15-20](apps/backend/src/modules/payments/payment-provider.interface.ts)
- Client built lazily; throws `InternalServerErrorException` if `RAZORPAY_KEY_ID` empty — [razorpay-provider.service.ts:44-54](apps/backend/src/modules/payments/razorpay-provider.service.ts)
- `createOrder` -> `orders.create({amount, currency:'INR', receipt: receiptId})` raced against a 15 s timer — [razorpay-provider.service.ts:64-86](apps/backend/src/modules/payments/razorpay-provider.service.ts). No `payment_capture`/notes/idempotency parameters are passed (same lines).
- `markCaptured` is a log-only no-op, documented as the place a future "fetch payment by id" reconciliation would go — [razorpay-provider.service.ts:95-102](apps/backend/src/modules/payments/razorpay-provider.service.ts). Grep finds no caller of `markCaptured` outside the provider/interface.
- Provider header comment: never run against a live Razorpay account as of 2026-10-09 — [razorpay-provider.service.ts:10-14](apps/backend/src/modules/payments/razorpay-provider.service.ts)

**Step 4 — Webhook (`POST /webhooks/razorpay`)**

- Unauthenticated (no JWT guard); signature verification is the auth — [webhooks.controller.ts:21-25](apps/backend/src/modules/orders/webhooks.controller.ts)
- Verifies `x-razorpay-signature` over `req.rawBody` (400 on mismatch), then `JSON.parse(rawBody)` — [webhooks.controller.ts:37-47](apps/backend/src/modules/orders/webhooks.controller.ts)
- Extracts `payload.payment.entity.order_id`; missing -> 200 and ignore; looks up `orders` by `razorpay_order_id`; unknown -> 200 and ignore (not persisted) — [webhooks.controller.ts:48-60](apps/backend/src/modules/orders/webhooks.controller.ts)
- Inserts a `payment_events` row (orderId, eventType, raw payload) for every matched event, outside any transaction — [webhooks.controller.ts:62-66](apps/backend/src/modules/orders/webhooks.controller.ts)
- `payment.captured` -> `confirmOrder(order.id, payment.entity.id)`; null -> log and 200; else notify customer and each vendor group after commit — [webhooks.controller.ts:68-93](apps/backend/src/modules/orders/webhooks.controller.ts)
- `payment.failed` -> log only, order stays `pending_payment` for UPI-style retry — [webhooks.controller.ts:94-114](apps/backend/src/modules/orders/webhooks.controller.ts)
- All other event types (e.g. `payment.authorized`, `order.paid`, `refund.*`) fall through with no action beyond the `payment_events` insert — [webhooks.controller.ts:68-117](apps/backend/src/modules/orders/webhooks.controller.ts)

**Step 5 — Confirmation and stock decrement (`confirmOrder`, one transaction)**

- Guarded `UPDATE orders SET status='confirmed', razorpay_payment_id=:paymentId WHERE id AND status='pending_payment'`; 0 rows -> return null — [webhooks.controller.ts:129-154](apps/backend/src/modules/orders/webhooks.controller.ts)
- Per item: `quantity_available = GREATEST(qa - qty, 0)`, `quantity_reserved = GREATEST(qr - qty, 0)`, warns if available hits 0 — [webhooks.controller.ts:156-216](apps/backend/src/modules/orders/webhooks.controller.ts)
- Vendor groups PENDING -> CONFIRMED in same txn — [webhooks.controller.ts:222-229](apps/backend/src/modules/orders/webhooks.controller.ts)

**Step 6 — Stale-reservation sweep**

- `STALE_RESERVATION_TIMEOUT_MS = 20*60*1000` — [orders.service.ts:35-40](apps/backend/src/modules/orders/orders.service.ts)
- `@Cron(CronExpression.EVERY_5_MINUTES) sweepStaleReservations()`; skipped when `search.workerMode === 'api'`; selects `status = pending_payment AND createdAt < now-20min`; calls `releaseAndCancel` per order; notifies customer on success — [orders.service.ts:250-289](apps/backend/src/modules/orders/orders.service.ts)
- `ScheduleModule.forRoot()` registered — [app.module.ts:3, 24](apps/backend/src/app.module.ts)
- `releaseAndCancel` (one transaction): guarded `UPDATE ... WHERE status='pending_payment'`, then `quantity_reserved = quantity_reserved - qty` (no GREATEST clamp), then PENDING groups -> CANCELLED — [orders.service.ts:185-248](apps/backend/src/modules/orders/orders.service.ts)
- Also used by customer cancel (`PATCH /orders/:id/cancel`, only from `pending_payment`) — [orders.service.ts:146-177](apps/backend/src/modules/orders/orders.service.ts), [orders.controller.ts:60-63](apps/backend/src/modules/orders/orders.controller.ts)

### Inferences

- Phase 1 committing before the Razorpay call means a process crash between commit and `order.save()` leaves a `pending_payment` order with no `razorpay_order_id` and stock reserved; the only recovery is the 20-minute sweep (inference from checkout.service.ts:494-509 + orders.service.ts:266-289).
- The 15 s `Promise.race` timeout rejects locally but does not abort the in-flight HTTP request, so Razorpay may still create an order that the backend then treats as failed and cancels; that Razorpay order is orphaned (customer never received its id, so it is unlikely to be paid). Inference from razorpay-provider.service.ts:67-84.
- In the compensation path the inventory release runs **before** the guarded status UPDATE and regardless of its result (checkout.service.ts:526-551). It is harmless today because a `razorpay_order_id`-less order cannot receive a webhook, but it is the reverse of the "claim then act" order used elsewhere.
- Compensation leaves a `cancelled` order row, which departs from decision 0042 rule 4's "no order row is written" for a rejected checkout (0042 applies to validation rejections; the code comment frames Phase 2 failure as a separate case).

### Gaps

- No mobile-side handling of the Razorpay SDK's cancellation vs failure codes was found beyond rethrowing the message (razorpay.service.ts:48-51).

## Q2. Data model: payment columns, reservations, dedup constraints, missing tables

### Takeaway

Payment state lives as two nullable columns on `orders` plus an append-only `payment_events` audit table. There is no PaymentAttempt, webhook-inbox/dedup, ledger, or refund table, and no unique constraint on either Razorpay id or on any webhook event id. Reservations are a counter column (`inventory.quantity_reserved`), not rows.

### Cited Findings

- `orders`: `id` UUID, `customer_id`, `delivery_address_id`, `grand_total DECIMAL(12,2)`, `status STRING(32)`, `razorpay_order_id STRING(128) NULL`, `razorpay_payment_id STRING(128) NULL`, `booking_id UUID NULL`, timestamps — [order.model.ts:21-54](apps/backend/src/modules/orders/models/order.model.ts)
- `razorpay_order_id` created nullable with **no unique index**; only index on `orders` is `idx_orders_customer_id` — [migration 20261008090003:42-45, 64-67](apps/backend/database/migrations/20261008090003-create-orders-domain.js)
- `razorpay_payment_id` added nullable, **no unique index** — [migration 20261016090000:5-8](apps/backend/database/migrations/20261016090000-add-razorpay-payment-id-to-orders.js)
- `payment_events`: `id`, `order_id` (FK -> orders, `ON DELETE CASCADE`), `event_type STRING(64)`, `raw_payload JSONB`, `created_at`; only a non-unique index on `order_id`; no provider event-id column — [migration 20261016090001:5-32](apps/backend/database/migrations/20261016090001-create-payment-events.js), [payment-event.model.ts:4-29](apps/backend/src/modules/orders/models/payment-event.model.ts)
- `payment_events` exposed read-only to admins via `GET /admin/orders/:id/payment-events` — [admin-orders.controller.ts:43-46](apps/backend/src/modules/orders/admin-orders.controller.ts), [orders.service.ts:614-624](apps/backend/src/modules/orders/orders.service.ts)
- Reservation = `inventory.quantity_reserved DECIMAL(12,3) NOT NULL DEFAULT 0 CHECK >= 0`, incremented at checkout — [0041:26-29, 115-117](docs/decisions/0041-cart-owner-reservation-and-real-instock.md), [checkout.service.ts:392-408](apps/backend/src/modules/orders/checkout.service.ts)
- Money: one `grand_total` per order; `order_vendor_group.subtotal` exists for reconciliation only; no split settlement, manual payouts — [0042:218-225](docs/decisions/0042-cart-and-order-structure.md)
- Grep across `apps/` for `refund` tables/models, `ledger`, `payment_attempt`, `idempoten` in payment code: no such tables or models exist (only `orders`, `order_vendor_group`, `order_items`, `payment_events` under `apps/backend/src/modules/orders/models/`).

### Inferences

- The webhook's `findOne({ where: { razorpayOrderId } })` (webhooks.controller.ts:56) runs against an unindexed column — a sequential scan at scale (inference).
- Because `payment_events` has `ON DELETE CASCADE`, the audit trail is not independent of the order row (inference about audit durability).
- Only one `razorpay_order_id` and one `razorpay_payment_id` per order can be stored; history of multiple attempts on the same Razorpay order exists only inside `payment_events.raw_payload`.

### Gaps

- None found for schema; all relevant migrations read.

## Q3. Idempotency

### Takeaway

There is no client idempotency key anywhere. Same-cart double-submit is prevented by the cart row lock plus cart deletion (second call gets 400 "cart is empty", not the original order). One Razorpay order is created per local order and reused for retries. Webhook capture is idempotent through a status-guarded UPDATE, but event storage is not deduplicated and `x-razorpay-event-id` is never read. Raw body is used for signature verification.

### Cited Findings

- `CheckoutDto` has only `deliveryAddressId` and optional `bookingId`; no idempotency key; controller reads no headers — [checkout.dto.ts:4-17](apps/backend/src/modules/orders/dto/checkout.dto.ts), [orders.controller.ts:32-35](apps/backend/src/modules/orders/orders.controller.ts)
- Grep for `idempoten|Idempotency|event_id|x-razorpay-event-id` across `apps/` returns no hit in any payment/order code (only seeders, media, search).
- Double-submit: cart `FOR UPDATE` serializes; the second request, after the first commits, sees zero cart_items and throws `BadRequestException('cart is empty')` — [checkout.service.ts:164-175, 186-190, 227-233](apps/backend/src/modules/orders/checkout.service.ts)
- One Razorpay order per local order, `receipt = order.id` — [checkout.service.ts:503-506](apps/backend/src/modules/orders/checkout.service.ts), [razorpay-provider.service.ts:68-72](apps/backend/src/modules/payments/razorpay-provider.service.ts). Re-pay reuses the stored `razorpayOrderId` — [usePlaceOrder.ts:27-35](apps/mobile/src/hooks/payments/usePlaceOrder.ts)
- Raw body: Nest `rawBody: true` in bootstrap — [main.ts:12-21](apps/backend/src/main.ts); webhook verifies `req.rawBody` before parsing — [webhooks.controller.ts:42-47](apps/backend/src/modules/orders/webhooks.controller.ts); `Razorpay.validateWebhookSignature(rawBody, sig, secret)`; returns false if secret or header empty — [razorpay-provider.service.ts:88-93](apps/backend/src/modules/payments/razorpay-provider.service.ts)
- Capture replay: `confirmOrder`'s `WHERE status='pending_payment'` is the only gate; on replay it returns null and the handler returns `{received:true}` — [webhooks.controller.ts:70-84, 139-154](apps/backend/src/modules/orders/webhooks.controller.ts). Code comment records a past bug where the destructuring of the affected-row count was wrong and stock was decremented on every redelivery — [webhooks.controller.ts:130-138](apps/backend/src/modules/orders/webhooks.controller.ts)
- Every redelivery inserts another `payment_events` row (no unique key) — [webhooks.controller.ts:62-66](apps/backend/src/modules/orders/webhooks.controller.ts), [migration 20261016090001:32](apps/backend/database/migrations/20261016090001-create-payment-events.js)
- Decision 0034 describes the webhook as "idempotent against replay via `UPDATE ... WHERE status = 'pending_payment'`" — [0034:45-47](docs/decisions/0034-phase-3-ordering-domain-completion.md)

### Inferences

- A client that times out on `POST /checkout` and retries will get "cart is empty" even though an order was created; the app has no lookup-by-key to recover it, only the order list (inference from checkout.service.ts:227-233 and usePlaceOrder.ts:15-24).
- Notifications are sent after commit and outside the dedupe gate (webhooks.controller.ts:85-93). If a notification throws, the webhook returns 5xx, Razorpay redelivers, the guarded UPDATE no-ops, and the notifications are never re-sent (inference).
- The webhook does not check `payment.entity.amount`/`currency` against `orders.grand_total` before confirming (no such code at webhooks.controller.ts:68-70). Inference: the Razorpay order binds the amount, so risk is low, but no defence-in-depth check exists.
- The payment id from the webhook is written to `razorpay_payment_id` only when the guarded UPDATE applies; a second, different captured payment on the same Razorpay order would not be recorded on the order (inference from webhooks.controller.ts:139-151).

### Gaps

- Whether the Razorpay account is configured for auto-capture is not in the repo; `createOrder` passes no `payment_capture` option (razorpay-provider.service.ts:68-72). If capture is manual, only `payment.authorized` would arrive and it is ignored (inference; needs account settings to confirm).

## Q4. Races: webhook vs sweep, late success, concurrency guards

### Takeaway

All order status transitions use guarded UPDATEs (`WHERE status = <expected>`), and `adminCancel` additionally takes `SELECT ... FOR UPDATE`, so webhook/sweep/cancel races resolve to exactly one winner. But a `payment.captured` that loses to the sweep or a customer cancel is only logged: money stays captured on a `cancelled` order, `razorpay_payment_id` is never stored, and no auto-refund or alert exists.

### Cited Findings

- Webhook confirm guard: `WHERE id AND status='pending_payment'` — [webhooks.controller.ts:139-154](apps/backend/src/modules/orders/webhooks.controller.ts)
- Sweep/customer-cancel guard: same `WHERE status='pending_payment'` in `releaseAndCancel` — [orders.service.ts:194-208](apps/backend/src/modules/orders/orders.service.ts); sweep comment: concurrent sweeps are a no-op, no lock needed — [orders.service.ts:260-265](apps/backend/src/modules/orders/orders.service.ts)
- Sweep test "does not notify for an order that lost the race (already confirmed by a webhook)" — [orders.service.spec.ts:422](apps/backend/src/modules/orders/__tests__/orders.service.spec.ts)
- Late capture on non-pending order: logged as "capture webhook did not apply (not pending_payment)" and 200 returned; comment says this covers "already cancelled" as a legitimate case — [webhooks.controller.ts:71-84](apps/backend/src/modules/orders/webhooks.controller.ts)
- The sweep does not query Razorpay for the order/payment state before cancelling; it filters only on local `status` and `createdAt` — [orders.service.ts:272-279](apps/backend/src/modules/orders/orders.service.ts)
- `refundPayment` has exactly one caller, `adminRefund` — grep of `refundPayment` in `apps/backend/src` (orders.service.ts:467; provider and interface otherwise).
- `adminRefund` requires `status === CONFIRMED && razorpayPaymentId` — [orders.service.ts:445-447](apps/backend/src/modules/orders/orders.service.ts) — so a cancelled order with a late capture cannot be refunded through the API.
- `adminCancel`: `SELECT status FROM orders WHERE id FOR UPDATE`, proceed only from `pending_payment` or `refunded` — [orders.service.ts:539-547](apps/backend/src/modules/orders/orders.service.ts)
- Customer cancel advisory read + guarded update, 400 if lost race — [orders.service.ts:154-172](apps/backend/src/modules/orders/orders.service.ts)
- Inventory row locks at checkout (`FOR UPDATE`) — [checkout.service.ts:353-365](apps/backend/src/modules/orders/checkout.service.ts); confirm-time decrement clamps with `GREATEST(...,0)` because vendor stock writes can undercut reservations — [webhooks.controller.ts:169-205](apps/backend/src/modules/orders/webhooks.controller.ts)
- Vendors can see/act on groups only once the parent order is not `pending_payment`; refunded/cancelled parents block group updates — [orders.service.ts:307-364](apps/backend/src/modules/orders/orders.service.ts)
- Decision 0049 open question: whether sweep cancellations should be distinguishable (no cancellation-reason field exists) — [0049:161-165](docs/decisions/0049-stale-reservation-sweep.md)

### Inferences

- Concrete "late success" path: customer opens sheet at minute 0, UPI retries push capture past minute 20-25, sweep cancels and releases stock, capture arrives -> dropped. The customer is charged, the order shows `cancelled`, the payment id exists only in `payment_events.raw_payload`, and refund requires manual action in the Razorpay dashboard (inference from webhooks.controller.ts:62-84 and orders.service.ts:445-447).
- Same orphaned-capture outcome if a customer taps Cancel on order detail while a payment is in flight (orders.service.ts:146-177).
- The sweep's age is measured from `orders.created_at`, not from the last payment attempt, so a customer resuming payment from order detail at minute 19 has about a minute (plus up to 5 minutes sweep slack) before cancellation (inference from orders.service.ts:272-275 and order-detail/[id].tsx:58).
- `releaseAndCancel`'s `quantity_reserved - qty` has no clamp (orders.service.ts:223), unlike `adminCancel` (orders.service.ts:576) and confirm (webhooks.controller.ts:196); with the `CHECK >= 0` constraint, any drift would make the sweep transaction fail and retry every 5 minutes for that order (inference).
- Notifications (`sendOrderPlaced`, `sendNewOrderToVendor`) are awaited inline in the webhook request (webhooks.controller.ts:85-93); webhook processing is fully synchronous with no queue or outbox (inference: Razorpay webhook timeouts could trigger redeliveries under load).

### Gaps

- No integration test exercises an actual concurrent webhook-vs-sweep race against Postgres; coverage is unit-level (see Q7).

## Q5. Refunds

### Takeaway

Refunds exist only as an admin, full-amount, manual action on a CONFIRMED order (`POST /admin/orders/:id/refund`). It uses claim-before-call (guarded UPDATE to REFUNDED, revert on provider error), which blocks concurrent double refunds locally, but sends no idempotency key to Razorpay, discards the refund id, has no timeout, ignores refund webhooks, and has no refund table. Vendor rejection/cancellation of a group triggers no refund.

### Cited Findings

- Route: `POST /admin/orders/:id/refund`, admin-only — [admin-orders.controller.ts:25-30, 48-52](apps/backend/src/modules/orders/admin-orders.controller.ts)
- Full refund only; partial per-line refund is an open question — [orders.service.ts:418-425](apps/backend/src/modules/orders/orders.service.ts), [0034:173-175](docs/decisions/0034-phase-3-ordering-domain-completion.md)
- Flow: advisory `findByPk` check -> guarded `UPDATE orders SET status='refunded' WHERE id AND status='confirmed' AND razorpay_payment_id=:paymentId` (not inside a transaction) -> `refundPayment(paymentId, round(grandTotal*100))` -> on error, guarded revert to `confirmed` and rethrow — [orders.service.ts:440-481](apps/backend/src/modules/orders/orders.service.ts)
- The returned `RefundResult.refundId` is not captured or stored (`await this.paymentProvider.refundPayment(...)` with no assignment) — [orders.service.ts:467](apps/backend/src/modules/orders/orders.service.ts)
- Provider: `payments.refund(paymentId, {amount})`, no timeout race (unlike createOrder), no idempotency/notes — [razorpay-provider.service.ts:104-109](apps/backend/src/modules/payments/razorpay-provider.service.ts)
- Refund does not touch inventory; a later `adminCancel` of a refunded order deliberately does not release inventory either — [orders.service.ts:510-516, 561-586](apps/backend/src/modules/orders/orders.service.ts)
- A confirmed order must be refunded before admin cancel — [orders.service.ts:530-534](apps/backend/src/modules/orders/orders.service.ts)
- Vendor group CONFIRMED -> CANCELLED is an allowed transition with no refund or inventory action — [orders.service.ts:372-391](apps/backend/src/modules/orders/orders.service.ts)
- Loading/unloading fee is inside `grand_total`, so refund is unchanged by it — [0036:204-209](docs/decisions/0036-vendor-loading-unloading-capability.md)
- Tests: refund success, never-captured rejected, already-refunded rejected, concurrent double-refund rejected via 0-row claim, revert on Razorpay failure — [orders.service.spec.ts:213-303](apps/backend/src/modules/orders/__tests__/orders.service.spec.ts)

### Inferences

- If Razorpay processes the refund but the HTTP response is lost/errored, the code reverts to `confirmed`; a retry then hits Razorpay's "already refunded" error and reverts again, leaving the order stuck `confirmed` with money returned (inference from orders.service.ts:466-481).
- A process crash after the claim but before the Razorpay call leaves the order `refunded` with no refund issued, and nothing reconciles it (inference).
- Status `refunded` is set before Razorpay's async refund actually settles; `refund.processed`/`refund.failed` webhooks are not handled (webhooks.controller.ts:68-115), so a failed refund at Razorpay is invisible (inference).
- A vendor cancelling its group in a multi-vendor order leaves the customer paid in full for undelivered goods with no partial-refund path (inference from orders.service.ts:377-380 + full-refund-only rule).

### Gaps

- No documented policy on who triggers refunds for vendor-cancelled groups; 0042 names post-confirmation cancellation semantics as "the most likely next ADR" — [0042:251-255](docs/decisions/0042-cart-and-order-structure.md); not found as a filed ADR.

## Q6. Client-side verify

### Takeaway

No client-side verification exists. The app discards `razorpay_signature`, there is no backend verify endpoint, and confirmation relies only on the webhook plus a ~60 s poll. This is by design (decision 0041 rule 3).

### Cited Findings

- App extracts only `razorpay_payment_id` from the SDK result — [razorpay.service.ts:46-47](apps/mobile/src/services/razorpay.service.ts); even that return value is discarded by the caller — [usePlaceOrder.ts:47-51](apps/mobile/src/hooks/payments/usePlaceOrder.ts)
- Customer routes are only `POST /checkout`, `GET /orders`, `GET /orders/:id`, `PATCH /orders/:id/cancel`; no verify route — [orders.controller.ts:32-63](apps/backend/src/modules/orders/orders.controller.ts)
- Rule: "A payment is confirmed by the provider's webhook, never by the client SDK's callback" — [0041:119-121](docs/decisions/0041-cart-owner-reservation-and-real-instock.md); frontend must poll, not trust the widget — [order-flow.md:192, 220](order-flow.md)
- After 30 polls still pending, app shows a "payment pending" warning — [usePlaceOrder.ts:65-75](apps/mobile/src/hooks/payments/usePlaceOrder.ts), [useOrderPaymentPoll.ts:21-28](apps/mobile/src/hooks/payments/useOrderPaymentPoll.ts)

### Inferences

- With no verify endpoint and no server-side "fetch payment/order status from Razorpay" call (markCaptured is a no-op, razorpay-provider.service.ts:95-102), a lost or misconfigured webhook leaves a paid order `pending_payment` until the sweep cancels it, which then produces the late-capture orphan case. Webhook is a single point of failure (inference).
- If the sheet is dismissed or fails, the app still polls for ~60 s before warning (usePlaceOrder.ts:18-20, 54-63) (inference about UX).

### Gaps

- None.

## Q7. Payment-related tests

### Takeaway

Tests are unit-level. The provider's signature check and refund call, plus `adminRefund`/`adminCancel`/sweep/vendor-group guards, are covered. `CheckoutService.checkout()` itself, `createOrder` and its timeout, and the whole `WebhooksController` (capture, replay, failed, unknown order) have **no tests**.

### Cited Findings

- `apps/backend/src/modules/payments/__tests__/razorpay-provider.service.spec.ts`: verifyWebhookSignature accepts valid HMAC, rejects tampered signature, missing header, tampered body; refundPayment calls SDK with paise amount and returns id; throws if not configured — [lines 6-48, 50-80](apps/backend/src/modules/payments/__tests__/razorpay-provider.service.spec.ts)
- `apps/backend/src/modules/orders/__tests__/orders.service.spec.ts`: `adminRefund` x5 [213-303], `adminCancel` x4 including confirmed-between-read-and-lock [305-383], `sweepStaleReservations` x4 (release+notify, lost race no notify, WORKER_MODE=api no-op, per-item release) [385-458], `updateVendorGroupStatus` x3 [460-524], override guards [526-569, 591-620], `getPaymentEvents` x2 [571-589], artisan DTO hides razorpay fields [122] — [orders.service.spec.ts](apps/backend/src/modules/orders/__tests__/orders.service.spec.ts)
- `apps/backend/src/modules/orders/__tests__/checkout.service.spec.ts`: only `validateBooking` and `reconfirmBookingStatus`; header comment says `checkout()` has no test fixture ("no cart/order integration harness exists") — [checkout.service.spec.ts:15-20, 115-160](apps/backend/src/modules/orders/__tests__/checkout.service.spec.ts)
- No spec references `WebhooksController` (grep: only orders.module.ts and the controller itself).
- Smoke script lists the webhook route only — [scripts/smoke.js:66-67](apps/backend/scripts/smoke.js)
- Code comments describe manual live verification against Postgres (e.g. concurrent oversell without lock, replayed webhook decrementing twice) — [checkout.service.ts:339-343](apps/backend/src/modules/orders/checkout.service.ts), [webhooks.controller.ts:130-138](apps/backend/src/modules/orders/webhooks.controller.ts)

### Inferences

- The race tests (e.g. "concurrent double-refund") simulate a 0-row UPDATE via mocks rather than real concurrency (inference from test names; bodies not fully read).

### Gaps

- No mobile tests for payment hooks were searched for in depth; none surfaced in the grep for razorpay/payment test files.

## Q8. Decision records: rules and deferred items

### Takeaway

0041 fixes "reserve at checkout, confirm only via webhook". 0042 fixes "one order, one payment, N vendor groups", the provider abstraction, and records that no live Razorpay account exists. 0034 pulled admin refund/cancel/audit endpoints into Phase 3. 0049 adds the 20-min / 5-min sweep. Many production concerns are explicitly deferred.

### Cited Findings

**0041 (2026-10-07, Accepted)**

- Rule 2: stock reserved at checkout, guarded by `available - reserved >= requested` — [0041:115-117](docs/decisions/0041-cart-owner-reservation-and-real-instock.md)
- Rule 3: payment confirmed by provider webhook, never client SDK; reservation converts/releases only on server-to-server signal — [0041:119-121](docs/decisions/0041-cart-owner-reservation-and-real-instock.md)
- Rule 6: search `inStock` not sufficient; checkout re-checks the listing — [0041:134-137](docs/decisions/0041-cart-owner-reservation-and-real-instock.md)
- Deferred: vendor paused mid-checkout and reservations; reservation hold timeout (later resolved by 0049); no provider chosen in 0041 — [0041:198-226](docs/decisions/0041-cart-owner-reservation-and-real-instock.md)

**0042 (2026-10-07)**

- Rule 2: one order / one payment / one grand total, per-vendor groups — [0042:109-111](docs/decisions/0042-cart-and-order-structure.md)
- Rule 4: checkout all-or-nothing, rejected checkout writes no reservation and no order row — [0042:120-123](docs/decisions/0042-cart-and-order-structure.md)
- Rule 5: reservations across vendors succeed/fail together in one transaction — [0042:125-126](docs/decisions/0042-cart-and-order-structure.md)
- Rule 6: price snapshot on order_items — [0042:128-130](docs/decisions/0042-cart-and-order-structure.md)
- Rule 8: `PaymentProviderService` interface, Razorpay sole implementation; credentials via `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` — [0042:180-185](docs/decisions/0042-cart-and-order-structure.md)
- Explicit gap: "no code in this plan verifies a real payment capture"; no merchant account exists — [0042:175-196](docs/decisions/0042-cart-and-order-structure.md)
- No split settlement; manual payouts via `vendors.upi_id`/`bank_details` — [0042:218-225](docs/decisions/0042-cart-and-order-structure.md)
- Deferred: real Razorpay capture pending account setup [0042:240]; post-placement cancellation semantics "most likely next ADR" [0042:251-255]; who acquires credentials [0042:261-262] — [0042](docs/decisions/0042-cart-and-order-structure.md)

**0034 (Phase 3 completion)**

- Summary of built behaviour: Razorpay order outside txn with timeout and compensating release; capture confirms and decrements; failure leaves order payable; replay-idempotent via guarded UPDATE — [0034:41-51](docs/decisions/0034-phase-3-ordering-domain-completion.md)
- Rule 1: admin cancel, refund trigger, payment-event audit, vendor-group override are Phase 3 backend scope — [0034:99-103](docs/decisions/0034-phase-3-ordering-domain-completion.md)
- Client-decision blockers incl. cancellation policy, cart TTL, sweep timeout, Razorpay credential ownership — [0034:111-125](docs/decisions/0034-phase-3-ordering-domain-completion.md)
- Deferred: refund shape (full vs partial); audit trail for overrides — [0034:173-178](docs/decisions/0034-phase-3-ordering-domain-completion.md)

**0049 (2026-10-31, Implemented `27e6784`)**

- Mechanism: `@nestjs/schedule` `@Cron`, gated by `WORKER_MODE != 'api'`; BullMQ and Redis-TTL options rejected because the guarded UPDATE already makes concurrent sweeps safe — [0049:30-69, 128-138](docs/decisions/0049-stale-reservation-sweep.md)
- Release logic extracted from `cancel` into `releaseAndCancel` — [0049:71-78](docs/decisions/0049-stale-reservation-sweep.md)
- Timeout 20 min, sweep every 5 min (above 5-15 min industry norm, for UPI retries); worst-case self-heal ~25 min — [0049:80-88, 146-149](docs/decisions/0049-stale-reservation-sweep.md)
- Customer notified with `sendOrderStatusChanged(..., CANCELLED)` — [0049:90-98](docs/decisions/0049-stale-reservation-sweep.md)
- Open/deferred: shorter timeout after a `payment.failed`; distinguishable cancellation reason; multi-instance throughput — [0049:153-168](docs/decisions/0049-stale-reservation-sweep.md)
- 0049 says both `STALE_RESERVATION_TIMEOUT_MS` and `SWEEP_INTERVAL_MS` are named constants — [0049:86-88, 125-126](docs/decisions/0049-stale-reservation-sweep.md); the code has only `STALE_RESERVATION_TIMEOUT_MS` and uses `CronExpression.EVERY_5_MINUTES` inline — [orders.service.ts:40, 266](apps/backend/src/modules/orders/orders.service.ts)

**Other decisions touching payments**

- 0036: fee kept inside `grand_total` so capture/refund/audit stay unmodified — [0036:204-209](docs/decisions/0036-vendor-loading-unloading-capability.md)
- 0043: "one order, one payment, N order_vendor_groups" restated — [0043:29](docs/decisions/0043-minimum-order-value-per-vendor.md)
- 0045: references `cancel`, `adminCancel`, `adminRefund` as sources — [0045:314](docs/decisions/0045-artisan-hire-lifecycle-and-order-attribution.md)

### Inferences

- None of the decisions discusses webhook event-id dedup, reconciliation against Razorpay, late-capture auto-refund, refund idempotency, ledgering, or alerting. These are absent rather than explicitly deferred (inference from reading/grepping all decision files that mention razorpay/payment/refund/webhook).

### Gaps

- No ADR found for post-confirmation cancellation/refund policy (named as next ADR in 0042:251-255).

---

### Present vs absent safeguards (summary table for the report writer)

| Safeguard                                                    | Status                                   | Evidence                                                                     |
| ------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------- |
| Webhook HMAC over raw body                                   | Present                                  | main.ts:20; webhooks.controller.ts:42-45; razorpay-provider.service.ts:88-93 |
| Webhook event-id dedup (`x-razorpay-event-id`, unique inbox) | Absent                                   | no grep hits; payment_events has no unique key (migration 20261016090001:32) |
| Idempotent capture state transition                          | Present (guarded UPDATE)                 | webhooks.controller.ts:139-154                                               |
| Checkout idempotency key                                     | Absent                                   | checkout.dto.ts:4-17                                                         |
| Same-cart double-submit protection                           | Present (cart FOR UPDATE + cart clear)   | checkout.service.ts:186-190, 487-491                                         |
| Oversell protection                                          | Present (inventory FOR UPDATE + reserve) | checkout.service.ts:353-408                                                  |
| External call outside DB txn + compensation                  | Present                                  | checkout.service.ts:496-558                                                  |
| HTTP timeout on provider calls                               | Partial (createOrder only, 15 s)         | razorpay-provider.service.ts:64-86 vs 104-109                                |
| Unique constraint on razorpay_order_id / payment_id          | Absent                                   | migrations 20261008090003:42-45, 20261016090000:5-8                          |
| Amount/currency check on webhook                             | Absent                                   | webhooks.controller.ts:68-70                                                 |
| Reconciliation / status polling against Razorpay             | Absent (markCaptured no-op)              | razorpay-provider.service.ts:95-102                                          |
| Client-side signature verify endpoint                        | Absent (by design)                       | orders.controller.ts:32-63; 0041:119-121                                     |
| Stale reservation sweep                                      | Present (20 min / 5 min)                 | orders.service.ts:40, 266-289                                                |
| Sweep checks provider before cancelling                      | Absent                                   | orders.service.ts:272-279                                                    |
| Late-capture-after-cancel auto-refund or alert               | Absent (log only)                        | webhooks.controller.ts:71-84                                                 |
| Refund double-submit guard                                   | Present (claim-before-call)              | orders.service.ts:449-463                                                    |
| Refund idempotency key / stored refund id / refunds table    | Absent                                   | orders.service.ts:467; razorpay-provider.service.ts:104-109                  |
| Refund webhooks handled                                      | Absent                                   | webhooks.controller.ts:68-115                                                |
| Partial refunds                                              | Absent (full only)                       | orders.service.ts:418-419                                                    |
| Ledger / double-entry                                        | Absent                                   | no model/migration                                                           |
| Payment-attempt table                                        | Absent                                   | models dir: orders, order_vendor_group, order_items, payment_events only     |
| Async webhook processing / outbox for notifications          | Absent (inline, after commit)            | webhooks.controller.ts:85-93                                                 |
| Status CHECK constraint on orders.status                     | Absent                                   | migration 20261008090003:37-41, 60-62                                        |
| Webhook controller tests                                     | Absent                                   | no spec references WebhooksController                                        |
| Live Razorpay verification                                   | Absent (no account as of 2026-10-09)     | razorpay-provider.service.ts:10-14; 0042:192-196                             |
