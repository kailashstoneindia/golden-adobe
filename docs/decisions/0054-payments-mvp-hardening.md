# 0054 — Payments MVP hardening: no rupee the system can't see

- **Date:** 2026-11-03
- **Status:** Implemented (feat/payments-mvp-hardening — pending merge)
- **Supersedes / Superseded by:** Amends [0041](0041-cart-owner-reservation-and-real-instock.md) rule 3 (the webhook stays a confirmation signal, and Razorpay's fetch API becomes a second one), [0042](0042-cart-and-order-structure.md) (refund behaviour), and [0049](0049-stale-reservation-sweep.md) (the sweep now asks Razorpay before cancelling)

## Context

The Razorpay integration is written and unit-tested, but it has never run against a Razorpay account. Measured against production payment-system practice, it is correct on the happy path, but it **depends on a single path**: one webhook, arriving once, before the 20-minute sweep runs. The research behind this record is in `docs/research/payments/reports/Production payment design gap closure.md`, with the MVP cut in `docs/research/payments/reports/Payment MVP scope.md` (revision 2, after external review). It found these gaps, each of which loses or hides customer money:

| Gap                                                                                                                                                                                                                                                | Where                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A capture that lands on a `cancelled` order is only logged. The money is captured, the order is cancelled, and `adminRefund` refuses anything that isn't `confirmed`                                                                               | [webhooks.controller.ts:71-84](../../apps/backend/src/modules/orders/webhooks.controller.ts#L71-L84), [orders.service.ts:445-447](../../apps/backend/src/modules/orders/orders.service.ts#L445-L447)                                                         |
| Razorpay's default auto-capture window is 3 days, but our stock hold is 20 minutes, so any late authorisation becomes captured money on a dead order                                                                                               | [razorpay-provider.service.ts:66-86](../../apps/backend/src/modules/payments/razorpay-provider.service.ts#L66-L86)                                                                                                                                           |
| The sweep and both cancel paths cancel without asking Razorpay whether a payment exists                                                                                                                                                            | [orders.service.ts:146-177](../../apps/backend/src/modules/orders/orders.service.ts#L146-L177), [:266-289](../../apps/backend/src/modules/orders/orders.service.ts#L266-L289), [:525-612](../../apps/backend/src/modules/orders/orders.service.ts#L525-L612) |
| If Razorpay processed a refund but the HTTP response was lost, the order reverts to `confirmed`. A refund Razorpay accepted is shown as `refunded` even if it later fails. No receipt or idempotency key is sent, and the refund id is thrown away | [orders.service.ts:440-490](../../apps/backend/src/modules/orders/orders.service.ts#L440-L490)                                                                                                                                                               |
| The amount, currency and order id are not checked when a payment is captured                                                                                                                                                                       | [webhooks.controller.ts:68-70](../../apps/backend/src/modules/orders/webhooks.controller.ts#L68-L70)                                                                                                                                                         |
| There is no webhook event-id dedup, no unique index on `razorpay_payment_id`, and no index at all on `razorpay_order_id`, the column the webhook looks orders up by                                                                                | [migration 20261016090001](../../apps/backend/database/migrations/20261016090001-create-payment-events.js)                                                                                                                                                   |
| A notification error after a committed confirmation returns 500                                                                                                                                                                                    | [webhooks.controller.ts:85-93](../../apps/backend/src/modules/orders/webhooks.controller.ts#L85-L93)                                                                                                                                                         |
| The webhook controller and `checkout()` have no tests                                                                                                                                                                                              | `apps/backend/src/modules/orders/__tests__/`                                                                                                                                                                                                                 |

This is an MVP: tens of orders a day and one admin. The full production design has a ledger, inbox and outbox workers, a poller and reconciliation pipelines. That is more than this volume needs, and a person with the Razorpay dashboard can do those jobs.

## Options considered

### Option A — Build the full production design now

- **Pro:** Covers every failure mode in the research, including attempt tables, an inbox worker, an outbox, a double-entry ledger, three reconciliation loops and Route.
- **Con:** Several weeks of work and 8+ new tables, for a system that hasn't taken its first real payment. Most of it automates what a person can do at this volume.

### Option B — MVP hardening: close every money-loss path, defer the rest behind written triggers (chosen)

- **Pro:** About 6–8 days of work: one new table, two new columns, no new workers. Every captured payment ends in a state an admin can see. Each deferred item has a trigger that says when to build it.
- **Con:** Reconciliation is manual (a weekly sheet). There is no audit ledger. Refunds are admin-triggered, so someone has to work the queue.

### Option C — Change nothing until a Razorpay account exists

- **Pro:** No work now.
- **Con:** The gaps above are design bugs, not configuration. They will be live on the first real payment.

## Decision

Build Option B. These rules are binding for all payment code:

1. **Razorpay holds late money, not us.** Every Razorpay order is created with `payment: { capture: 'automatic', capture_options: { automatic_expiry_period: 20, manual_expiry_period: 20, refund_speed: 'normal' } }`. That window and the stale-reservation timeout come from one constant (`PAYMENT_CAPTURE_WINDOW_MINUTES = 20`).
2. **One capture path.** The webhook, the sweep and both cancel paths confirm a payment only through `OrderPaymentService.applyCapture()`. It confirms only when the payment's `order_id`, `amount` (paise) and `currency` (`INR`) all match the order. Confirmation remains the guarded `UPDATE … WHERE status = 'pending_payment'`.
3. **Ask before cancelling.** No code cancels a `pending_payment` order that has a `razorpay_order_id` without first fetching that order's payments from Razorpay:
   - Any payment `captured` → `applyCapture()`.
   - Any payment `created` or `authorized` → do not cancel (the sweep waits; customer and admin cancel return 400).
   - Razorpay unreachable → do not cancel (the sweep skips the order; cancel returns 503).
   - Otherwise → cancel.
4. **Captured money always has a visible status.** A capture that can't confirm its order sets the order to `refund_required` and records the payment id. That happens when the order is already `cancelled`, or when the amount, currency or order id doesn't match. It is never just logged.
5. **Refunds are admin-triggered and recorded before Razorpay is called.**
   - Each refund is a `refunds` row with its own `idempotency_key`, sent as `X-Refund-Idempotency`. Retries reuse that key and the identical body, and a key is never regenerated for the same refund.
   - Each row also has a unique `receipt`.
   - Successful refunds never total more than the captured amount, enforced under a row lock on the order.
6. **Refund status follows money movement.**
   - A full refund puts the order in `refund_pending` until Razorpay reports `processed`, then `refunded`.
   - A failed full refund returns the order to `refund_required`.
   - Partial refunds never change the order status.
   - A 5-minute job moves refunds from `submitted` to `processed` or `failed` by fetching them from Razorpay. It also re-sends any `requested` refunds with their stored key.
7. **The webhook never fails because of a notification**, and stores `x-razorpay-event-id` under a unique index.

Order statuses become `pending_payment | confirmed | cancelled | refund_required | refund_pending | refunded`, enforced by a CHECK constraint.

## Why

- **Capture window.** Refunding a captured payment costs about 2.36% (2% fee + 18% GST), which Razorpay keeps; that is roughly ₹1,180 on a ₹50,000 order. An authorised payment that is never captured is auto-refunded by Razorpay at no fee. Aligning the two timers turns the most likely loss into a free automatic refund. This is configuration, not code.
- **Razorpay's API as a second signal.** Razorpay disables a webhook endpoint after 24 hours of failures, keeps delivery logs for only 3 hours, and recommends polling its APIs for business-critical flows. The sweep already runs every 5 minutes, so it doubles as the poller.
- **No `FOR UPDATE SKIP LOCKED` in the sweep** (an external reviewer suggested it). Concurrent sweeps are already safe, because only one guarded UPDATE can succeed, as 0049 established. Claiming rows with a lock would hold that lock across the Razorpay HTTP call. That is the transaction-across-external-call pattern checkout already avoids, because it exhausts the connection pool.
- **Direct HTTPS for refunds.** razorpay-node 2.9.8 forwards only the `X-Razorpay-Account` and `Content-Type` headers (`getValidHeaders` in `node_modules/razorpay/dist/api.js`), so it silently drops `X-Refund-Idempotency`. Refund creation is therefore one `fetch` call with HTTP Basic auth. The SDK is still used for everything else.
- **Admin-triggered refunds.** Policy refunds (cancellations, vendor rejections, returns) need judgement anyway. The no-judgement case, late money, is mostly handled by rule 1, and the rest lands in a visible `refund_required` queue (rule 4).
- **Deliberate deviation from the full design.** No ledger, no inbox/outbox, no reconciliation engine. Mitigation: a weekly reconciliation sheet (see Consequences), plus measurable triggers for each deferred piece, listed in `docs/research/payments/reports/Payment MVP scope.md` §4.

## Consequences

- `orders.status` gains two values. Both `Record<OrderStatus, string>` label maps (admin and mobile) must cover them, or type-checking fails.
- `OrdersService.adminRefund(orderId)` is replaced by `RefundsService.requestRefund(...)`. `POST /admin/orders/:id/refund` now takes `{ reason, amountPaise?, vendorGroupId? }`.
- `PaymentProviderService.refundPayment` and the no-op `markCaptured` are removed. The interface gains `fetchOrderPayments`, `createRefund`, `fetchRefunds` and `fetchRefund`.
- Vendors can't advance a vendor group whose order is `refund_required` or `refund_pending`, the same as for `refunded` and `cancelled`.
- Customer cancel can now return 400 ("a payment is in progress") or 503 ("could not verify payment status").
- **The refundable amount is what Razorpay actually captured.** It is stored in `orders.captured_paise` wherever `razorpay_payment_id` is stored, and falls back to `grand_total` when NULL. The admin `OrderDto` exposes `capturedPaise`.
- **Razorpay 408 and 429 responses are classified as retryable (`server`).** This is safe because refunds carry a stable idempotency key. Order creation is never retried.
- **One exception to rule 4:** a captured payment that cannot be bound to its order, because the order is already `confirmed`, `refund_required`, `refund_pending` or `refunded` with a different payment id, gets no order status. The `orders` row has one payment column, and Razorpay allows one successful payment per order, so this is practically unreachable. `applyCapture` logs it at error level and returns `ignored`; the webhook is still kept in `payment_events`.
- **Live-payment gate:** no live payments until the seven Razorpay test-mode checks in `docs/payments-test-mode-checklist.md` pass. These include capture-window timing measured from order creation and from payment creation.
- **Ops:** a weekly reconciliation sheet, built from `apps/backend/scripts/payments-recon-export.sql` plus Razorpay's settlement report.

## Open questions

- **Vendor payout legality (launch blocker, not code).** Does collecting for vendors into the platform's account and paying them by hand comply with RBI's 2025 PA Master Direction (paras 10(b), 13(f))? Or is Razorpay Route required? Who carries refunds, disputes and settlement shortfalls? This needs a lawyer or payments compliance specialist.
- **Published cancellation and refund policy.** E-Commerce Rules 2020, Rule 4(8) (symmetric cancellation charges) and Rule 4(10) (refund "within a reasonable period"). This needs its own decision record. The proposed SLA is "refund initiated within 2 business days".
- **COD.** Out of scope here. The `refunds` table allows `rail = 'manual_payout'` so COD can reuse it later.
- **Checkout retry after a lost response** (a retry gets "cart is empty"). Deferred as D1 in `docs/research/payments/reports/Payment MVP scope.md`.

## Sources

- Razorpay capture settings via API — https://razorpay.com/docs/payments/payments/capture-settings/api.md
- Razorpay normal refunds, idempotent (`X-Refund-Idempotency`) — https://razorpay.com/docs/api/refunds/normal-refunds-idempotent.md
- Razorpay create normal refund (refund states, `receipt`) — https://razorpay.com/docs/api/refunds/create-normal.md
- Razorpay webhook FAQs (24h disable, 3h logs) — https://razorpay.com/docs/webhooks/faqs/
- Razorpay webhook best practices (poll for business-critical flows) — https://razorpay.com/docs/webhooks/best-practices/
- Razorpay pricing (2% + 18% GST) — https://razorpay.com/pricing/
