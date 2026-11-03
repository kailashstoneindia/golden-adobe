# Payments MVP Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every path where a customer's Razorpay payment can be lost or end up hidden from the system, as decided in decision 0054.

**Architecture:**

- **Order creation:** each Razorpay order gets a 20-minute capture window, the same length as the stock reservation, so a late payment is left uncaptured and Razorpay refunds it automatically.
- **Capture:** the webhook, the stale-reservation sweep and both cancel paths all confirm a payment through one function, `OrderPaymentService.applyCapture()`. None of them cancels an order without first asking Razorpay whether it has a payment.
- **Refunds:** an admin triggers each refund. A `refunds` row is written first, and the request goes to Razorpay with the `X-Refund-Idempotency` header. A 5-minute job then keeps the refund's status in step with Razorpay.

**Tech Stack:** NestJS 10, Sequelize 6 / sequelize-typescript on Postgres 16, razorpay-node 2.9.8, Jest + supertest against a real `golden_abode_test` database, React + Vite + Vitest (admin app), shared `@golden-abode/types` package.

**Spec:** [docs/decisions/0054-payments-mvp-hardening.md](../../decisions/0054-payments-mvp-hardening.md) is binding. `docs/research/payments/reports/Payment MVP scope.md` (revision 2) gives the reasoning behind it.

## Global Constraints

- Money is integer paise everywhere. Convert only through `toPaise(grandTotal)`, which is `Math.round(Number(x) * 100)`.
- `PAYMENT_CAPTURE_WINDOW_MINUTES = 20`. `capture_options`: `automatic_expiry_period: 20`, `manual_expiry_period: 20`, `refund_speed: 'normal'`. `STALE_RESERVATION_TIMEOUT_MS = PAYMENT_CAPTURE_WINDOW_MINUTES * 60_000`.
- `PROVIDER_TIMEOUT_MS = 15_000` for every Razorpay call.
- Never hold a DB transaction open across a Razorpay call (decision 0041/0049 precedent).
- Every status change is a guarded `UPDATE … WHERE status = …`. For Postgres, Sequelize `QueryTypes.UPDATE` returns `[, affectedCount]`, so read the **second** element.
- Order statuses are exactly: `pending_payment`, `confirmed`, `cancelled`, `refund_required`, `refund_pending`, `refunded`.
- Refund statuses are exactly: `requested`, `submitted`, `processed`, `failed`. Rails: `razorpay`, `manual_payout`.
- Refund `receipt` = `rf_${orderId.replace(/-/g, '')}_${n}`, where `n` is the 1-based count of that order's refunds. `idempotency_key` = `randomUUID().replace(/-/g, '')`, which is 32 characters. Both are generated once, stored, and never regenerated.
- Refund submit retries: delays `[0, 1000, 2000]` ms, only for error kinds `timeout | network | server | conflict_in_progress`.
- Refund sync: every 5 minutes. It re-checks `submitted` rows older than 5 minutes and re-sends `requested` rows older than 5 minutes.
- Cron jobs return immediately when `configService.get('search.workerMode', 'all') === 'api'`, the same gate as the existing sweep.
- Exact error copy:
  - In-flight payment: `A payment is in progress for this order. Try again in a few minutes.`
  - Razorpay unreachable: `Could not verify payment status. Try again shortly.`
  - Refund over the limit: `refund exceeds the refundable amount`
  - Partial refund on a late payment: `a late payment must be refunded in full`
- Integration specs use a real Postgres test app, following `apps/backend/src/modules/vendors/__tests__/vendors-test-app.ts`, and must run in CI (`.github/workflows/ci.yml` migrates `golden_abode_test`, then runs `pnpm run test`).
- `pnpm run format:check` runs Prettier over `**/*.{ts,tsx,js,json,md}`. Run `pnpm exec prettier --write <changed files>` before each commit.
- Comments: only where the reason is non-obvious, citing "decision 0054". Match the existing guarded-update comment style; don't restate code.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Local test DB setup (once):**

```bash
docker compose up -d postgres
docker exec golden-abode-postgres createdb -U postgres golden_abode_test   # ignore "already exists"
NODE_ENV=test pnpm --filter @golden-abode/backend run migration:run          # PowerShell: $env:NODE_ENV='test'; pnpm --filter @golden-abode/backend run migration:run
```

## Review Focus

1. **A webhook arrives without an `x-razorpay-event-id` header** (old test deliveries, or replays sent by hand). It must still be processed, with `event_id` stored as NULL. Test: Task 3 `processes a webhook without an event id header`.
2. **The order total has paise, e.g. `1234.56`**. `toPaise` must give exactly `123456`, so a correct payment is not misread as an amount mismatch. Test: Task 3 `toPaise converts decimal rupees exactly`.
3. **A pending order whose only payment Razorpay already auto-refunded** (`status: 'refunded'`, never captured). The sweep must treat it as "no payment" and cancel, not wait forever. Test: Task 4 `cancels when the only payment was auto-refunded`.
4. **Failed refunds must not count against the refundable amount.** After a failed ₹1,000 refund, a new ₹1,000 refund must be allowed. Test: Task 5 `ignores failed refunds when computing the refundable amount`.
5. **The demo DB may already have duplicate `razorpay_order_id`/`razorpay_payment_id` values.** The unique-index migration must fail with the offending ids listed, not a bare constraint error. Check: Task 1 step 3.1 (the pre-check) and step 7 (the read-only query against the demo DB before deploy).

---

### Task 1: Schema, statuses and the payments test harness

**Files:**

- Create: `apps/backend/database/migrations/20261103090000-payments-mvp-hardening.js`
- Create: `apps/backend/src/modules/orders/models/refund.model.ts`
- Modify: `apps/backend/src/modules/orders/models/order.model.ts:14-19` (enum)
- Modify: `apps/backend/src/modules/orders/models/payment-event.model.ts` (add `eventId`)
- Modify: `apps/backend/src/modules/orders/orders.module.ts:23-31` (register `Refund`)
- Modify: `packages/types/src/order.types.ts:1-6` (statuses), and append `RefundDto` / `AdminRefundRequest`
- Modify: `apps/admin/src/constants/order.constants.ts`, `apps/mobile/src/constants/order.constants.ts`, `apps/mobile/src/components/orders/OrderListRow.tsx:33-36`
- Create: `apps/backend/src/modules/payments/money.ts`
- Create: `apps/backend/src/modules/payments/__tests__/fake-payment-provider.ts`
- Create: `apps/backend/src/modules/orders/__tests__/test-db.ts`, `apps/backend/src/modules/orders/__tests__/payments-test-app.ts`
- Test: `apps/backend/src/modules/orders/__tests__/payments-schema.spec.ts`

**Interfaces:**

- Produces:
  - `OrderStatus.REFUND_REQUIRED = 'refund_required'` and `OrderStatus.REFUND_PENDING = 'refund_pending'`, in the backend enum and in `ORDER_STATUSES`.
  - `Refund` model with these fields: `id`, `orderId`, `orderVendorGroupId: string | null`, `rail: RefundRail`, `razorpayPaymentId: string | null`, `payoutReference: string | null`, `amountPaise: number`, `idempotencyKey`, `receipt`, `razorpayRefundId: string | null`, `status: RefundStatus`, `reason`, `createdBy`, `createdAt`, `updatedAt`.
  - `enum RefundStatus { REQUESTED='requested', SUBMITTED='submitted', PROCESSED='processed', FAILED='failed' }` and `enum RefundRail { RAZORPAY='razorpay', MANUAL_PAYOUT='manual_payout' }`, both in `refund.model.ts`.
  - `PaymentEvent.eventId: string | null`.
  - `toPaise(value: number | string): number` in `payments/money.ts`.
  - In `@golden-abode/types`:
    - `RefundStatus` and `RefundRail` string unions.
    - `RefundDto = { id; orderId; orderVendorGroupId: string|null; rail; amountPaise: number; receipt; razorpayRefundId: string|null; status; reason; createdBy; createdAt: string }`.
    - `AdminRefundRequest = { reason: string; amountPaise?: number; vendorGroupId?: string }`.
  - `FakePaymentProvider` implements `PaymentProviderService` (the interface as defined in Task 2). In this task, implement only what the harness needs; Task 2 completes it.
  - `createPaymentsTestApp(): Promise<PaymentsTestApp>`, where `PaymentsTestApp` has:
    - `app: INestApplication`
    - `moduleRef: TestingModule`
    - `provider: FakePaymentProvider`
    - `notifications: RecordingNotifications`
    - `adminToken`, `adminUserId`, `customerToken`, `customerUserId`, `vendorToken`
    - `seedPendingOrder(opts?: { grandTotal?: string; quantity?: number }): Promise<SeededOrder>`
    - `signWebhook(rawBody: string): string`
    - `query<T>(sql: string, replacements?: object): Promise<T[]>`
    - `close(): Promise<void>`
  - `SeededOrder = { orderId; razorpayOrderId; groupId; listingId; grandTotalPaise: number; quantity: number }`. The order is `pending_payment`, its stock is reserved, and `razorpay_order_id = 'order_test_<random>'`.

- [ ] **Step 1: Write the failing schema spec** `payments-schema.spec.ts`:

```ts
it('rejects an order status outside the six allowed values', async () => {
  const o = await t.seedPendingOrder();
  await expect(
    t.query(`UPDATE orders SET status = 'paid' WHERE id = :id`, { id: o.orderId }),
  ).rejects.toThrow(/orders_status_check/);
});
it(
  'rejects the same razorpay_payment_id on two orders' /* set pay_dup on both → /orders_razorpay_payment_id_unique/ */,
);
it('rejects the same razorpay_order_id on two orders' /* → /orders_razorpay_order_id_unique/ */);
it(
  'rejects a razorpay-rail refund without a payment id' /* insert refunds rail='razorpay', razorpay_payment_id NULL → /refunds_razorpay_payment_check/ */,
);
it('accepts a manual_payout refund without a payment id' /* resolves */);
it('rejects a duplicate refund idempotency_key' /* → /refunds_idempotency_key_key|unique/ */);
it(
  'rejects a duplicate payment_events.event_id' /* two rows evt_1 → /payment_events_event_id_unique/ */,
);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @golden-abode/backend test -- payments-schema`
Expected: FAIL. The harness and migration don't exist yet.

- [ ] **Step 3: Write the migration** `20261103090000-payments-mvp-hardening.js`. `up` does this, in order:
  1. Throws `Error('duplicate razorpay ids before 0054 unique indexes: …')` listing the ids returned by `SELECT razorpay_order_id … GROUP BY … HAVING count(*) > 1` (and the same for `razorpay_payment_id`), if any exist.
  2. Adds unique partial indexes `orders_razorpay_order_id_unique` and `orders_razorpay_payment_id_unique` (`WHERE … IS NOT NULL`).
  3. Adds `orders_status_check` (the six statuses).
  4. Adds `payment_events.event_id VARCHAR(64) NULL` with the plain unique index `payment_events_event_id_unique`.
  5. Creates `refunds` with these columns:
     - `id UUID PK DEFAULT gen_random_uuid()`
     - `order_id UUID NOT NULL` → `orders(id)` `ON DELETE RESTRICT`
     - `order_vendor_group_id UUID NULL` → `order_vendor_group(id)`
     - `rail VARCHAR(16) NOT NULL CHECK IN ('razorpay','manual_payout')`
     - `razorpay_payment_id VARCHAR(128) NULL`
     - `payout_reference VARCHAR(128) NULL`
     - `amount_paise BIGINT NOT NULL CHECK (amount_paise > 0)`
     - `idempotency_key VARCHAR(64) NOT NULL UNIQUE`
     - `receipt VARCHAR(40) NOT NULL UNIQUE`
     - `razorpay_refund_id VARCHAR(128) NULL UNIQUE`
     - `status VARCHAR(16) NOT NULL CHECK IN ('requested','submitted','processed','failed')`
     - `reason TEXT NOT NULL`
     - `created_by UUID NOT NULL` → `users(id)`
     - `created_at` and `updated_at` timestamps

     Plus `CONSTRAINT refunds_razorpay_payment_check CHECK (rail <> 'razorpay' OR razorpay_payment_id IS NOT NULL)`, an index on `order_id`, and a partial index on `status` `WHERE status IN ('requested','submitted')`.

  `down` reverses every step.

- [ ] **Step 4: Update the models, types and label maps.**
  - Add the `Refund` model and register it in `OrdersModule` `forFeature`.
  - Add `eventId` to `PaymentEvent` (`field: 'event_id'`).
  - Add the two enum members, plus `toPaise`.
  - Label maps:
    - Admin: `refund_required: 'Refund required'`, `refund_pending: 'Refund in progress'`.
    - Mobile: both statuses read `'Refund in progress'`.
    - `OrderListRow`: treat both new statuses with the same branch as `REFUNDED`.

- [ ] **Step 5: Build the harness.**
  - `test-db.ts` exports `PAYMENTS_TEST_MODELS`. That is every model the orders module touches, plus their transitive associations, following the `VENDOR_TEST_MODELS` rationale.
  - `payments-test-app.ts` mirrors `main.ts`:
    - `createNestApplication({ rawBody: true })`, global prefix `api`, `ValidationPipe`, `GlobalExceptionFilter`, `ResponseInterceptor`.
    - Imports `OrdersModule`'s controllers and services, with `PAYMENT_PROVIDER` overridden by `FakePaymentProvider` and `NOTIFICATION_SERVICE` by `RecordingNotifications`.
    - Config: `RAZORPAY_WEBHOOK_SECRET='test-webhook-secret'` and `search.workerMode='all'`.
  - `RecordingNotifications`:
    - records each call as `{ method, args }`
    - `failNext(method)` makes that method's next call throw once
  - `seedPendingOrder` inserts the minimum rows the FKs need (user, customer, address, vendor, listing, inventory with `quantity_available = 10`, `quantity_reserved = quantity`), then an order, a group and an item. Read the create-\* migrations for the required columns.
  - `close()` deletes everything it created, children first.

- [ ] **Step 6: Run the spec and confirm it passes**

Run: `NODE_ENV=test pnpm --filter @golden-abode/backend run migration:run && pnpm --filter @golden-abode/backend test -- payments-schema`
Expected: PASS, 7 tests. Also run `pnpm run type-check` and expect PASS (the admin and mobile label maps must cover the new statuses).

- [ ] **Step 7: Run the duplicate check against the demo DB (read-only)**

Run against the Railway demo DB (the user has DB access):

```sql
SELECT razorpay_order_id, count(*) FROM orders WHERE razorpay_order_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
SELECT razorpay_payment_id, count(*) FROM orders WHERE razorpay_payment_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
```

Expected: 0 rows each. If any rows come back, stop and ask the user before deploying.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/database/migrations/20261103090000-payments-mvp-hardening.js apps/backend/src/modules/orders apps/backend/src/modules/payments packages/types/src/order.types.ts apps/admin/src/constants/order.constants.ts apps/mobile/src/constants/order.constants.ts apps/mobile/src/components/orders/OrderListRow.tsx
git commit -m "Payments schema: refunds table, refund statuses, unique Razorpay ids, webhook event ids (decision 0054)"
```

---

### Task 2: Payment provider: capture window, payment fetch, idempotent refunds

**Files:**

- Modify: `apps/backend/src/modules/payments/payment-provider.interface.ts`
- Modify: `apps/backend/src/modules/payments/razorpay-provider.service.ts`
- Create: `apps/backend/src/modules/payments/razorpay-mappers.ts`
- Modify: `apps/backend/src/modules/payments/__tests__/fake-payment-provider.ts` (complete it)
- Test: `apps/backend/src/modules/payments/__tests__/razorpay-provider.service.spec.ts`

**Interfaces:**

- Produces (in `payment-provider.interface.ts`):

```ts
export const PAYMENT_CAPTURE_WINDOW_MINUTES = 20;
export const PROVIDER_TIMEOUT_MS = 15_000;
export type ProviderPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
export interface ProviderPayment { id: string; orderId: string; amountPaise: number; currency: string; status: ProviderPaymentStatus }
export type ProviderRefundStatus = 'pending' | 'processed' | 'failed';
export interface ProviderRefund { id: string; paymentId: string; amountPaise: number; receipt: string | null; status: ProviderRefundStatus }
export interface CreateRefundParams { paymentId: string; amountPaise: number; receipt: string; idempotencyKey: string; notes: Record<string, string> }
export type ProviderErrorKind = 'timeout' | 'network' | 'server' | 'conflict_in_progress' | 'client';
export class ProviderRequestError extends Error { constructor(readonly kind: ProviderErrorKind, message: string, readonly status?: number, readonly code?: string) }
export interface PaymentProviderService {
  createOrder(amountPaise: number, receiptId: string): Promise<CreateProviderOrderResult>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  fetchOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
  createRefund(params: CreateRefundParams): Promise<ProviderRefund>;
  fetchRefunds(paymentId: string): Promise<ProviderRefund[]>;
  fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund>;
  /** @deprecated removed in Task 5 together with OrdersService.adminRefund */
  refundPayment(providerPaymentId: string, amountPaise: number): Promise<RefundResult>;
}
```

- Also produces `toProviderPayment(raw: { id; order_id; amount; currency; status }): ProviderPayment` and `toProviderRefund(raw: { id; payment_id; amount; receipt; status }): ProviderRefund`, both in `razorpay-mappers.ts`.
- `FakePaymentProvider`:
  - Scriptable state: `setOrderPayments(orderId, payments)`, `failFetchOnce(kind)`.
  - Refund scripting:
    - `refundOutcome(next: 'pending' | 'processed' | { error: ProviderErrorKind; afterProcessing?: boolean })`
    - `setRefundStatus(refundId, status)`
  - Recording: `createRefundCalls: CreateRefundParams[]`.
  - Emulates Razorpay idempotency: the same `idempotencyKey` returns the same refund.
  - `verifyWebhookSignature` uses `Razorpay.validateWebhookSignature` with `'test-webhook-secret'`.

- [ ] **Step 1: Write the failing provider tests** (replace the `refundPayment` describe block):

```ts
it('creates the order with a 20-minute capture window', async () => {
  // client.orders.create mocked
  expect(create).toHaveBeenCalledWith({
    amount: 150000,
    currency: 'INR',
    receipt: 'order-1',
    payment: {
      capture: 'automatic',
      capture_options: {
        automatic_expiry_period: 20,
        manual_expiry_period: 20,
        refund_speed: 'normal',
      },
    },
  });
});
it(
  'maps order payments to ProviderPayment' /* fetchPayments → { items: [{ id:'pay_1', order_id:'order_1', amount:150000, currency:'INR', status:'captured' }] } → [{ id:'pay_1', orderId:'order_1', amountPaise:150000, currency:'INR', status:'captured' }] */,
);
it('sends X-Refund-Idempotency over HTTPS with basic auth', async () => {
  // global.fetch mocked → 200 { id:'rfnd_1', payment_id:'pay_1', amount:5000, receipt:'rf_x_1', status:'pending' }
  expect(fetch).toHaveBeenCalledWith(
    'https://api.razorpay.com/v1/payments/pay_1/refund',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: `Basic ${Buffer.from('test-key-id:test-key-secret').toString('base64')}`,
        'Content-Type': 'application/json',
        'X-Refund-Idempotency': 'k'.repeat(32),
      }),
      body: JSON.stringify({
        amount: 5000,
        speed: 'normal',
        receipt: 'rf_x_1',
        notes: { order_id: 'o1' },
      }),
    }),
  );
});
it.each([
  ['an aborted request', 'timeout'],
  ['a 500', 'server'],
  ['a 409 still in progress', 'conflict_in_progress'],
  ['a 400', 'client'],
])('maps %s to ProviderRequestError kind %s' /* … */);
it('fetchRefunds and fetchRefund map Razorpay refunds' /* … */);
it(
  'wraps SDK calls in the 15s timeout' /* jest fake timers: fetchOrderPayments never resolves → rejects ProviderRequestError kind 'timeout' */,
);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @golden-abode/backend test -- razorpay-provider`
Expected: FAIL. The new methods are not defined yet.

- [ ] **Step 3: Implement it in `razorpay-provider.service.ts`.**
  - Extract the existing `Promise.race` into `private withTimeout<T>(p: Promise<T>, label: string): Promise<T>`. It rejects with `ProviderRequestError('timeout', …)`.
  - Map SDK `{ statusCode, error: { code, description } }` errors through `private toProviderError(err): ProviderRequestError`:
    - 5xx → `server`
    - 409 whose description contains `in progress` → `conflict_in_progress`
    - other 4xx → `client`
    - no `statusCode` → `network`
  - `createRefund` uses global `fetch` with `signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)`, `RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'`, and the body exactly as in the test. An `AbortError` or `TimeoutError` becomes `timeout`. This is not the SDK, because razorpay-node's `getValidHeaders` drops unknown headers (decision 0054 Why).
  - Remove `markCaptured`, from the interface and the class.

- [ ] **Step 4: Run them and confirm they pass**

Run: `pnpm --filter @golden-abode/backend test -- razorpay-provider`
Expected: PASS. The 4 existing signature tests also still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/payments
git commit -m "Payment provider: per-order capture window, payment fetch, idempotent HTTPS refunds (decision 0054)"
```

---

### Task 3: One capture path, `OrderPaymentService` and the webhook

**Files:**

- Create: `apps/backend/src/modules/orders/order-payment.service.ts`
- Modify: `apps/backend/src/modules/orders/webhooks.controller.ts` (whole handler; `confirmOrder` moves out)
- Modify: `apps/backend/src/modules/orders/orders.service.ts:185-248` (`releaseAndCancel` moves out)
- Modify: `apps/backend/src/modules/orders/checkout.service.ts:504` (use `toPaise`)
- Modify: `apps/backend/src/modules/orders/orders.module.ts` (provider)
- Test: `apps/backend/src/modules/orders/__tests__/webhooks.controller.spec.ts`, `apps/backend/src/modules/payments/__tests__/money.spec.ts`

**Interfaces:**

- Consumes: `ProviderPayment` and `toProviderPayment` (Task 2), `toPaise` (Task 1).
- Produces:

```ts
export type CaptureOutcome = 'confirmed' | 'already_confirmed' | 'refund_required' | 'ignored';
export type ProviderCheck =
  | { kind: 'none' }
  | { kind: 'in_flight' }
  | { kind: 'captured'; payment: ProviderPayment }
  | { kind: 'unavailable' };
@Injectable()
export class OrderPaymentService {
  applyCapture(order: Order, payment: ProviderPayment): Promise<CaptureOutcome>;
  checkProviderPayments(order: Order): Promise<ProviderCheck>;
  releaseAndCancel(orderId: string): Promise<boolean>;
  markRefundRequired(orderId: string, paymentId: string): Promise<boolean>;
}
```

- [ ] **Step 1: Write the failing tests.** `money.spec.ts`: `toPaise converts decimal rupees exactly`, with `toPaise('1234.56') === 123456`, `toPaise(500) === 50000` and `toPaise('0.1') === 10`. `webhooks.controller.spec.ts` (supertest, raw string bodies, `x-razorpay-signature: t.signWebhook(body)`):

```ts
it('confirms the order once when payment.captured is delivered three times', async () => {
  // same body + x-razorpay-event-id 'evt_1' posted 3×, all 201/200
  // order.status === 'confirmed'; inventory available 10 → 10 - qty once; reserved → 0 once
  // payment_events rows with event_id 'evt_1' === 1; notifications sendOrderPlaced calls === 1
});
it(
  'moves a cancelled order to refund_required on a late capture' /* cancel via SQL + release; capture → status refund_required, razorpay_payment_id = 'pay_late'; inventory unchanged by capture */,
);
it(
  'never confirms when the amount does not match' /* amount + 1 → refund_required, quantity_reserved released to 0 */,
);
it('never confirms when the currency is not INR' /* currency 'USD' → refund_required */);
it(
  'never confirms when the payment belongs to another Razorpay order' /* order_id mismatch → refund_required */,
);
it(
  'returns 2xx and stays confirmed when a notification throws' /* failNext('sendOrderPlaced') → 2xx, status confirmed */,
);
it(
  'processes a webhook without an event id header' /* no header → confirmed, one payment_events row with event_id NULL */,
);
it(
  'rejects a body re-serialised after signing' /* sign pretty JSON, send JSON.stringify(JSON.parse(pretty)) → 400 */,
);
it('rejects a tampered amount' /* sign original, send amount changed → 400 */);
it('acks an unknown Razorpay order id without changing anything' /* 2xx */);
it('leaves the order pending on payment.failed' /* status pending_payment, reservation intact */);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @golden-abode/backend test -- webhooks.controller money`
Expected: FAIL. `OrderPaymentService` and `toPaise` don't exist yet, and there is no amount check.

- [ ] **Step 3: Implement `OrderPaymentService`.**
  - **`applyCapture`:** a payment matches when all of these hold:
    - `payment.status === 'captured'`
    - `payment.orderId === order.razorpayOrderId`
    - `payment.currency === 'INR'`
    - `payment.amountPaise === toPaise(order.grandTotal)`

    Then:
    - **Mismatch:** `logger.error`. If the order is pending, run `releaseAndCancel` first. Then `markRefundRequired` and notify. Returns `'refund_required'`.
    - **Match:** run the moved `confirmOrder` (the guarded UPDATE, the stock decrement with `GREATEST`, the group confirm). If it applied, call `notifySafely` (`sendOrderPlaced` + `sendNewOrderToVendor` per group, each in try/catch with `logger.error`). Returns `'confirmed'`.
    - **Match, but not applied:** reload the order:
      - `cancelled` → `markRefundRequired`, notify the customer (`sendOrderStatusChanged(…, 'refund_required')`, safely) → `'refund_required'`
      - `confirmed` with the same payment id → `'already_confirmed'`
      - anything else → `logger.warn` → `'ignored'`

  - **`checkProviderPayments`:**
    - no `razorpayOrderId` → `none`
    - fetch error → `unavailable` (`logger.warn`)
    - any payment `captured` → `captured`
    - else any `created | authorized` → `in_flight`
    - else → `none`
  - **`releaseAndCancel`:** moved verbatim from `OrdersService`, except the inventory release uses `GREATEST(quantity_reserved - :qty, 0)`.
  - **`markRefundRequired`:** `UPDATE orders SET status='refund_required', razorpay_payment_id=:paymentId WHERE id=:orderId AND status='cancelled' AND razorpay_payment_id IS NULL`.
  - **Webhook:**
    - Read the `x-razorpay-event-id` header.
    - Insert the event with raw SQL `INSERT INTO payment_events (id, order_id, event_type, raw_payload, event_id) VALUES (gen_random_uuid(), …) ON CONFLICT (event_id) DO NOTHING`. Always continue processing, because `applyCapture` is idempotent.
    - On `payment.captured`: `applyCapture(order, toProviderPayment(entity))`.
    - Keep the `payment.failed` branch and its comment.
    - The handler never throws after signature verification succeeds.
  - **`OrdersService`:** calls `orderPayment.releaseAndCancel`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `pnpm --filter @golden-abode/backend test -- webhooks.controller money orders.service`
Expected: PASS. Update any `orders.service.spec.ts` mocks that referenced the private `releaseAndCancel` so they provide `OrderPaymentService`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/orders apps/backend/src/modules/payments
git commit -m "Single guarded capture path with amount checks; late captures become refund_required (decision 0054)"
```

---

### Task 4: Ask Razorpay before cancelling (sweep, customer cancel, admin cancel)

**Files:**

- Modify: `apps/backend/src/modules/orders/orders.service.ts:35-40` (constant), `:146-177` (`cancel`), `:266-289` (sweep), `:525-612` (`adminCancel`)
- Test: `apps/backend/src/modules/orders/__tests__/payment-cancellation.spec.ts`

**Interfaces:**

- Consumes: `OrderPaymentService.checkProviderPayments`, `applyCapture` and `releaseAndCancel` (Task 3); `PAYMENT_CAPTURE_WINDOW_MINUTES` (Task 2).
- Produces: no new public API. `cancel()` can now throw `BadRequestException(<in-flight copy>)` or `ServiceUnavailableException(<unreachable copy>)`.

- [ ] **Step 1: Write the failing tests.** Make orders stale with `UPDATE orders SET created_at = now() - interval '21 minutes'`.

```ts
it(
  'sweep confirms a stale order whose payment Razorpay captured (missed webhook)' /* provider.setOrderPayments(captured) → confirmed, sendOrderPlaced once */,
);
it(
  'sweep leaves an order pending while a payment is authorized' /* status pending_payment, reservation intact */,
);
it('sweep leaves an order pending while a payment is created' /* same */);
it('sweep leaves an order pending when Razorpay is unreachable' /* failFetchOnce('network') */);
it(
  'sweep cancels when every payment failed' /* cancelled, reserved 0, sendOrderStatusChanged('cancelled') once */,
);
it('cancels when the only payment was auto-refunded' /* status 'refunded' payment → cancelled */);
it(
  'sweep cancels an order that never got a Razorpay order id' /* razorpay_order_id NULL → cancelled */,
);
it(
  'two concurrent sweeps cancel once' /* Promise.all([sweep(), sweep()]) → one cancel notification, reserved released once */,
);
it('customer cancel refuses while a payment is in progress' /* 400 with exact in-flight copy */);
it('customer cancel returns 503 when Razorpay is unreachable' /* exact unreachable copy */);
it(
  'customer cancel of an order Razorpay captured returns it confirmed' /* 200, status confirmed */,
);
it('a capture arriving right after a cancel lands in refund_required', async () => {
  // provider: no payments → customer cancel succeeds (cancelled)
  // provider now reports captured; deliver payment.captured webhook
  // order.status === 'refund_required', razorpay_payment_id set, notification sent
});
it('admin cancel refuses while a payment is in progress' /* 400 in-flight copy */);
it(
  'releaseAndCancel never drives quantity_reserved below zero' /* set reserved = 0 first → stays 0 */,
);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @golden-abode/backend test -- payment-cancellation`
Expected: FAIL. Today the sweep and both cancel paths cancel without asking Razorpay.

- [ ] **Step 3: Implement it in `OrdersService`.**
  - Set `STALE_RESERVATION_TIMEOUT_MS = PAYMENT_CAPTURE_WINDOW_MINUTES * 60_000`.
  - **Sweep:** for each stale order, branch on `checkProviderPayments`:
    - `captured` → `applyCapture`
    - `in_flight` or `unavailable` → log and skip
    - `none` → existing `releaseAndCancel` and notify
  - **Customer cancel and admin cancel:** run the same check before the existing guarded path, for `pending_payment` only.
    - `in_flight` → 400
    - `unavailable` → 503
    - `captured` → `applyCapture`
      - Customer: return `getForCustomer`.
      - Admin: throw 400 `'order was paid; refund it instead'`.
  - **Admin cancel advisory check:** `refund_required` or `refund_pending` → 400 `'refund this order before cancelling it'`.
  - No row locks are held across `checkProviderPayments` (decision 0054 Why).

- [ ] **Step 4: Run them and confirm they pass**

Run: `pnpm --filter @golden-abode/backend test -- payment-cancellation orders.service webhooks.controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/orders
git commit -m "Sweep and cancel paths ask Razorpay before cancelling (decision 0054 rule 3)"
```

---

### Task 5: Admin-triggered, idempotent refunds whose status follows Razorpay

**Files:**

- Create: `apps/backend/src/modules/orders/refunds.service.ts`, `apps/backend/src/modules/orders/refund-status.ts`, `apps/backend/src/modules/orders/dto/admin-refund.dto.ts`
- Modify: `apps/backend/src/modules/orders/admin-orders.controller.ts:48-52` (+ `GET :id/refunds`)
- Modify: `apps/backend/src/modules/orders/orders.service.ts` (delete `adminRefund` at `:418-490`; extend the vendor-group guard at `:357-364` to `REFUND_REQUIRED` and `REFUND_PENDING`)
- Modify: `apps/backend/src/modules/orders/order-display.mapper.ts` (add `toRefundDto`)
- Modify: `apps/backend/src/modules/payments/payment-provider.interface.ts`, `razorpay-provider.service.ts` (delete `refundPayment` and `RefundResult`)
- Modify: `apps/backend/src/modules/orders/__tests__/orders.service.spec.ts`, `apps/backend/src/modules/payments/__tests__/razorpay-provider.service.spec.ts` (drop the `adminRefund`/`refundPayment` cases)
- Test: `apps/backend/src/modules/orders/__tests__/refunds.service.spec.ts`, `apps/backend/src/modules/orders/__tests__/refund-status.spec.ts`

**Interfaces:**

- Consumes: `Refund`, `RefundStatus`, `RefundRail` (Task 1); `createRefund`, `fetchRefunds`, `fetchRefund`, `ProviderRequestError` (Task 2).
- Produces:

```ts
// refund-status.ts — pure
export function projectOrderStatus(current: OrderStatus, capturedPaise: number, processedPaise: number, openPaise: number): OrderStatus;
// refunds.service.ts
@Injectable() export class RefundsService {
  requestRefund(input: { orderId: string; adminUserId: string; reason: string; amountPaise?: number; vendorGroupId?: string }): Promise<RefundDto>;
  listForOrder(orderId: string): Promise<RefundDto[]>;
  @Cron(CronExpression.EVERY_5_MINUTES) syncRefunds(): Promise<void>;
}
// admin-refund.dto.ts
export class AdminRefundDto { @IsString() @MinLength(3) @MaxLength(500) reason!: string; @IsOptional() @IsInt() @Min(100) amountPaise?: number; @IsOptional() @IsUUID() vendorGroupId?: string }
```

- HTTP:
  - `POST /api/admin/orders/:id/refund` with body `AdminRefundDto`; the admin id comes from `@CurrentUser('sub')`. Returns `OrderDto` (`getForAdmin`).
  - `GET /api/admin/orders/:id/refunds` returns `RefundDto[]`.

- [ ] **Step 1: Write the failing tests.** `refund-status.spec.ts`:

```ts
it.each([
  ['confirmed', 100000, 100000, 0, 'refunded'],
  ['refund_pending', 100000, 0, 100000, 'refund_pending'],
  ['confirmed', 100000, 0, 100000, 'refund_pending'],
  ['refund_pending', 100000, 0, 0, 'refund_required'],
  ['confirmed', 100000, 20000, 0, 'confirmed'],
  ['refund_required', 100000, 0, 0, 'refund_required'],
])('%s captured=%i processed=%i open=%i → %s', (cur, cap, proc, open, expected) =>
  expect(projectOrderStatus(cur as OrderStatus, cap, proc, open)).toBe(expected),
);
```

`refunds.service.spec.ts` (real Postgres, `FakePaymentProvider`; confirm orders through the webhook first):

```ts
it(
  'submits a full refund once with a stored 32-char key and receipt rf_<hex>_1' /* createRefundCalls.length 1; key /^[0-9a-f]{32}$/; receipt `rf_${orderId without -}_1`; order refund_pending; refund row submitted with rfnd id */,
);
it(
  'two concurrent full refunds create one Razorpay refund' /* Promise.allSettled ×2 → one fulfilled, one rejected 'refund exceeds the refundable amount'; createRefundCalls 1 */,
);
it(
  'retries a timed-out refund with the same key and body' /* refundOutcome({ error:'timeout', afterProcessing:true }) → createRefundCalls 2, identical params; one refund at fake; row submitted */,
);
it(
  'adopts an existing refund by receipt when retries are exhausted' /* 3× server errors but fake already holds refund with our receipt → row submitted with that id */,
);
it(
  'leaves the row requested when Razorpay never answers' /* 3× server, no refund at fake → status requested, order refund_pending */,
);
it(
  'keeps a partial refund out of the order status' /* 20000 of 100000 → order confirmed; then 90000 → 400 'refund exceeds the refundable amount' */,
);
it(
  'ignores failed refunds when computing the refundable amount' /* failed 100000 row → new 100000 allowed */,
);
it(
  'requires a late payment to be refunded in full' /* refund_required order, amountPaise 1000 → 400 'a late payment must be refunded in full' */,
);
it(
  'marks a client-rejected refund failed and returns the order to refund_required' /* refundOutcome({ error:'client' }) → 400; row failed; order refund_required */,
);
it(
  'sync marks processed refunds and the order refunded' /* setRefundStatus(processed); age row 6 min; syncRefunds → refunded; sendOrderStatusChanged('refunded') once */,
);
it(
  'sync returns the order to refund_required when the refund failed' /* setRefundStatus(failed) → refund_required */,
);
it(
  'sync re-sends a requested refund with its stored key' /* requested row aged 6 min → createRefund called with same idempotencyKey */,
);
it(
  'vendor cannot advance a group while its order is refund_pending' /* PATCH vendor group status → 400 */,
);
it(
  'POST /admin/orders/:id/refund requires a reason and an admin' /* no reason → 400; customer token → 403 */,
);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @golden-abode/backend test -- refund-status refunds.service`
Expected: FAIL. `RefundsService` and `projectOrderStatus` don't exist yet.

- [ ] **Step 3: Implement it.** `requestRefund`:
  - **Step A (one transaction):**
    - `SELECT … FROM orders WHERE id = :id FOR UPDATE`.
    - Require the status to be `confirmed` or `refund_required`, with a `razorpay_payment_id`.
    - `remaining = toPaise(grandTotal) - sum(amount_paise WHERE status <> 'failed')`.
    - `amount = input.amountPaise ?? remaining`. Validate the rules above. `vendorGroupId` must belong to the order.
    - Insert a `requested` row with the receipt and key from Global Constraints.
    - Set the order status from `projectOrderStatus` (open includes the new row), using a guarded UPDATE.
  - **Step B (after commit):** `private submit(refund: Refund)`.
    - Up to 3 attempts with the delays from Global Constraints, retrying only the four retryable kinds.
    - On success, store `razorpayRefundId` and the status (`processed` if Razorpay says so, else `submitted`).
    - If attempts run out, call `fetchRefunds` and adopt the refund with our receipt. Otherwise leave the row `requested` with `logger.error`.
    - On `client`: mark the row `failed`, re-project, and throw `BadRequestException(err.message)`.
  - **`syncRefunds`:** gated like the sweep. It re-projects inside a `FOR UPDATE` transaction on the order, and notifies on a transition to `refunded`.
  - Register `RefundsService` in `OrdersModule`, wire the controller, and delete `adminRefund` and `refundPayment`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `pnpm --filter @golden-abode/backend test -- refund-status refunds.service orders.service razorpay-provider && pnpm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/orders apps/backend/src/modules/payments packages/types/src/order.types.ts
git commit -m "Admin refunds: refunds table, X-Refund-Idempotency, status follows Razorpay (decision 0054 rules 5-6)"
```

---

### Task 6: Admin UI: refund form, refund history, "Needs refund" filter

**Files:**

- Modify: `apps/admin/src/constants/apiEndpoints.ts:24` (+ `orderRefunds`)
- Modify: `apps/admin/src/services/api/ordersService.ts:19-23` (`refundOrder(orderId, body: AdminRefundRequest)`, `listRefunds(orderId)`)
- Modify: `apps/admin/src/queries/useOrdersQueries.ts:40-50` (`useRefundOrderMutation` takes `{ orderId, body }`; add `useOrderRefundsQuery(orderId, enabled)`)
- Modify: `apps/admin/src/types/orders.types.ts:13` (`onRefund: (orderId: string, body: AdminRefundRequest) => Promise<void>`)
- Modify: `apps/admin/src/components/orders/OrderDetailModal.tsx:34-36, 149-160`
- Modify: `apps/admin/src/pages/OrdersPage.tsx`
- Modify: `apps/admin/src/constants/error.constants.ts` (+ `refundReasonRequired: 'Enter a reason for this refund.'`)
- Test: `apps/admin/src/pages/OrdersPage.spec.tsx` (follow `ArtisansPage.spec.tsx` for render and mocking style)

**Interfaces:**

- Consumes: `RefundDto` and `AdminRefundRequest` (Task 1/5); `POST /admin/orders/:id/refund` and `GET /admin/orders/:id/refunds` (Task 5).

- [ ] **Step 1: Write the failing tests.**

```ts
it(
  'shows only refund_required orders under the Needs refund filter' /* 3 orders mixed → select 'Needs refund' → 1 row */,
);
it(
  'offers Refund for confirmed and refund_required orders only' /* pending_payment → no Refund button */,
);
it(
  'locks the amount to the full total for a refund_required order' /* amount input disabled, value = grandTotal */,
);
it('keeps Submit disabled until a reason is entered' /* … */);
it(
  'sends amount in paise and the reason' /* type 250.50, reason 'Vendor cancelled' → refundOrder('o1', { amountPaise: 25050, reason: 'Vendor cancelled' }) */,
);
it(
  'lists existing refunds with amount and status' /* useOrderRefundsQuery data → '₹200.00 · Refund in progress'-style rows */,
);
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @golden-abode/admin test -- OrdersPage`
Expected: FAIL.

- [ ] **Step 3: Implement it.**
  - **Orders page:** a status filter `<select>` with All / Needs refund / Refund in progress, filtered client-side on `order.status`. "Needs refund" sorts oldest `createdAt` first.
  - **Order modal:** `canRefund = status ∈ {confirmed, refund_required}`. The refund section has an amount field in rupees, a required reason textarea and a submit button.
    - The amount defaults to `grandTotal - Σ non-failed refunds` from the refunds query.
    - For `refund_required` the amount is disabled.
    - Convert with `Math.round(rupees * 100)`.
  - **Refund history:** shown below the refund section, newest first.
  - Keep the existing cancel and override controls unchanged.

- [ ] **Step 4: Run tests, type-check and lint, then check it in the browser**

Run: `pnpm --filter @golden-abode/admin test && pnpm --filter @golden-abode/admin type-check && pnpm --filter @golden-abode/admin lint`
Expected: PASS.

Then start the backend and admin (`pnpm --filter @golden-abode/backend dev`, `pnpm --filter @golden-abode/admin dev`). In the browser:

1. Seed one `refund_required` order via SQL.
2. Confirm it appears under Needs refund and its amount is locked.
3. Submit a refund. Without real Razorpay keys, expect the row to stay `requested` and an error to be logged; that is the designed behaviour.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src
git commit -m "Admin: refund form with reason and partial amount, refund history, Needs refund filter (decision 0054)"
```

---

### Task 7: Ops artifacts and the live-payment gate

**Files:**

- Create: `docs/payments-test-mode-checklist.md`
- Create: `apps/backend/scripts/payments-recon-export.sql`
- Modify: `docs/decisions/0054-payments-mvp-hardening.md` (Status → `Implemented (<sha>)`), `docs/decisions/README.md` (row status)

**Interfaces:**

- Consumes: the final schema from Tasks 1 and 5.

- [ ] **Step 1: Write `payments-recon-export.sql`.** It returns one row per order with a `razorpay_payment_id`, with these columns:
  - `order_id`, `razorpay_order_id`, `razorpay_payment_id`, `order_status`
  - `captured_paise` (`round(grand_total * 100)`), `refunded_processed_paise`, `refunds_open_paise`
  - empty `fee_paise`, `settlement_amount_paise`, `settlement_date`, `settlement_utr` columns, filled from Razorpay's settlement report
  - `difference_paise` (`captured - refunded_processed`)
  - `created_at`

  It takes date-range parameters `:from` and `:to`.

- [ ] **Step 2: Verify the query against the test DB**

Run: `docker exec -i golden-abode-postgres psql -U postgres -d golden_abode_test -v from="'2026-01-01'" -v to="'2027-01-01'" < apps/backend/scripts/payments-recon-export.sql`
Expected: the column header prints and the query exits 0. Rows only appear if specs left none behind and you seeded some.

- [ ] **Step 3: Write `docs/payments-test-mode-checklist.md`.** Head it with: **"No live payments until every row passes (decision 0054)."** Then a table with How / Expected / Result / Date / Tester columns and these rows:

| #   | Check                                                                                                                                                                                                                                                                | Expected                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Create an order with `payment.capture_options` on a fresh test account. Repeat this on the live account after KYC.                                                                                                                                                   | Accepted, no support enablement needed                                                                                                                                 |
| T2  | Capture-window timing, measured from order creation and from payment creation: (a) authorise at minute 19; (b) authorise at minute 21; (c) authorise before expiry and capture late; (d) a capture that lands during a sweep run. Record the webhooks for each case. | (a) captured; (b) stays uncaptured and auto-refunds after `manual_expiry_period`; (c), (d) the order ends `confirmed` or `refund_required`, never silently `cancelled` |
| T3  | Fail a payment, then pay the **same** order from a new Checkout                                                                                                                                                                                                      | Succeeds                                                                                                                                                               |
| T4  | Abandon a UPI intent                                                                                                                                                                                                                                                 | Time until the payment shows `failed` is recorded and is under the sweep's wait                                                                                        |
| T5  | Send `X-Refund-Idempotency` with the same key and body twice; send the same key with a changed body; retry while the first request is in flight                                                                                                                      | Same refund returned; changed body rejected; 409 while in flight                                                                                                       |
| T6  | Make a normal refund, then run `syncRefunds`                                                                                                                                                                                                                         | `pending → processed`, and the order becomes `refunded`                                                                                                                |
| T7  | Make the webhook endpoint return 500 once, then 200                                                                                                                                                                                                                  | Razorpay retries with the same `x-razorpay-event-id`; one `payment_events` row                                                                                         |

Below the table, add the weekly reconciliation procedure (decision 0054 Consequences) as a short numbered list:

1. Run the SQL export for last week.
2. Paste Razorpay's settlement report alongside it.
3. Fill in the fee and settlement columns.
4. Investigate every nonzero `difference_paise` that the fee and settlement don't explain.

- [ ] **Step 4: Run the full verification**

Run: `pnpm run format:check && pnpm run lint && pnpm run type-check && pnpm run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/payments-test-mode-checklist.md apps/backend/scripts/payments-recon-export.sql docs/decisions/0054-payments-mvp-hardening.md docs/decisions/README.md
git commit -m "Payments: test-mode checklist, weekly reconciliation export, decision 0054 implemented"
```
