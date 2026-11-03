# Webhook Processing, Payment/Order State Machines, and Reconciliation (NestJS + PostgreSQL + Razorpay)

Research date: 2026-11-03. Razorpay docs were read as current Markdown (`.md`) versions; the Razorpay best-practices page reported `lastModified 2026-10-08`. Stripe, Shopify, Svix, NestJS and Hookdeck pages were read directly. Engineering-blog coverage (Airbnb/Uber/Square) was thin; see the Gaps sections.

---

## 1. Webhook reliability: Razorpay delivery semantics and ingestion best practice

### Takeaway

Razorpay delivers at least once. It treats any non-2xx response, or no response within **5 seconds**, as a failure and retries with exponential backoff for **24 hours**. After 24 hours of failures it **disables the webhook**, and someone has to re-enable it by hand. Events can arrive out of order and more than once. That leads to one pattern, which Stripe, Shopify and Hookdeck also recommend:

1. Verify the HMAC over the **raw** body.
2. Insert the event into an inbox table with a UNIQUE constraint on `x-razorpay-event-id`.
3. Return 2xx right away.
4. Process asynchronously with idempotent, state-guarded handlers.
5. Back the whole thing with polling/reconciliation, because webhooks alone are not enough.

### Cited Findings

**Razorpay delivery, retry, timeout and disable behaviour**

- Any non-2xx response is a delivery failure. Razorpay retries "in exponential backoff policy for 24 hours after event creation timestamp." — [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/)
- If deliveries keep failing for 24 hours, "the webhook is disabled. You need to enable the webhook from the Dashboard after fixing the errors at your end." Razorpay sends a notice to the Alert Email Address, or to the account email if none is set. — [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/); [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Razorpay uses "at-least-once delivery semantics". "There could be situations where your server accepts the event but fails to respond in 5 seconds. In such cases, the session is marked timeout. It is assumed that the webhook was not processed and is sent again." — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Razorpay itself says webhooks are not enough for critical flows: "Webhooks are delivered in near real-time and are asynchronous. For business-critical, synchronous use cases, you may choose to poll our payment APIs as well." — [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/)
- Replay from Razorpay goes through a support ticket (Dashboard → Help → Technical Support → "Issue regarding Webhooks/API"). The event must be ≤15 days old, and the webhook must have been enabled when the event occurred. "Currently, bulk replaying of webhook events is not possible." — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Dashboard webhook logs only cover deliveries from the **last 3 hours**. — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Up to 30 webhook URLs per merchant ID for Payments. — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Production needs TLS 1.2+ (1.0/1.1 are not supported). Razorpay recommends whitelisting its webhook IPs. — [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/)
- Webhook URLs must be public. localhost, ngrok.io, loca.lt, webhook.site, requestbin.com and others are blacklisted. For local development Razorpay suggests `zrok` tunnels. — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)

**Dedup header**

- `x-razorpay-event-id` "is unique per event and can help you determine the duplicity of a webhook event." Razorpay says to check whether an event with that header value has already been processed. — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/); [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/)

**Signature verification**

- `X-Razorpay-Signature` is an HMAC-SHA256 computed with the webhook secret as the key over the raw request body. — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- "Do Not Parse or Cast the Webhook Request Body … ensure that the webhook body passed as an argument is the raw webhook request body." — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- The webhook secret is **not** the API key secret. — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Secret rotation: "use the old secret for webhook signature validation while retrying older requests. The new secret can only be used for all events generated after the secret is updated." — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- **Docs conflict:** Razorpay's own Node.js sample calls `validateWebhookSignature(JSON.stringify(webhookBody), …)`. Re-serialising the parsed JSON is exactly what the warning on the same page forbids. Use the raw Buffer. — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- In NestJS, enable raw bodies with `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })` and read them via `@Req() req: RawBodyRequest<Request>` → `req.rawBody` (a Buffer). This "works only if the built-in global body parser middleware is enabled" (do not pass `bodyParser: false`). — [NestJS Raw Body FAQ](https://docs.nestjs.com/faq/raw-body)
- The checkout-callback signature is a separate check: `generated_signature = hmac_sha256(order_id + "|" + razorpay_payment_id, secret)`. Verify it on the server before fulfilling. Razorpay lists three ways to confirm status: Dashboard, webhooks (e.g. `order.paid`), or polling Payment APIs. — [Razorpay Standard Checkout Integration Steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- Contrast on replay protection: Stripe puts a timestamp in the signed `Stripe-Signature` header, and its libraries default to a **5-minute tolerance** ("Don't use a tolerance value of 0"). Svix / Standard Webhooks reject timestamps more than 5 minutes from current time. — [Stripe Webhooks](https://docs.stripe.com/webhooks); [Svix: Why Verify Webhooks](https://docs.svix.com/receiving/verifying-payloads/why)

**Out-of-order and snapshot semantics (Razorpay)**

- Expected order is `payment.authorized` → `payment.captured`, but "The above order may not be followed at all times." — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- "The payload for a Webhook is a snapshot of the entity when the event occurred … The payment can be in the `captured` state when the `payment.authorized` Webhook is fired." — [Razorpay Payments Webhook Events](https://razorpay.com/docs/webhooks/payments/)
- Razorpay's payout example says webhooks arriving after a terminal state "should be ignored". The same terminal-state rule applies to payments. — [Razorpay Validate & Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/)
- For abandoned or closed checkout windows, Razorpay suggests `payment.failed` ("Triggered when payment fails or times out"). It also says to keep watching `payment.authorized` for late authorisations after apparent failures. — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)

**Which Razorpay events exist / to subscribe to**

- Payments: `payment.authorized`, `payment.captured`, `payment.failed`, `payment.pending` (COD). — [Razorpay Payments Webhook Events](https://razorpay.com/docs/webhooks/payments/)
- Orders: `order.paid`. It carries **both** the order and payment entities. `payment.captured` carries only the payment entity. Both fire when the order's payment is captured. — [Razorpay Orders Webhook Events](https://razorpay.com/docs/webhooks/orders/)
- Refunds: `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`. These also fire for auto-refunds; check `payload.payment.entity.captured == false` to spot them. — [Razorpay Refunds Webhook Events](https://razorpay.com/docs/webhooks/refunds/)
- Disputes: `payment.dispute.created`, `.won`, `.lost`, `.closed`, `.under_review`, `.action_required`. — [Razorpay Disputes Webhook Events](https://razorpay.com/docs/webhooks/disputes/)
- Stripe's general advice: "Only listen to event types your integration requires". — [Stripe Manage Webhook Endpoints](https://docs.stripe.com/webhooks/process-undelivered-events)

**General best practice (Stripe / Shopify / Hookdeck)**

- Stripe: return 2xx "before any complex logic that might cause a timeout". Process "with an asynchronous queue" so spikes don't overwhelm hosts. Log processed event IDs to drop duplicates. Two distinct Event objects can be generated for the same thing; dedupe those on `data.object.id` + `event.type`. — [Stripe Webhooks](https://docs.stripe.com/webhooks)
- Stripe ordering: "doesn't guarantee the delivery of events in the order that they're generated". Don't use `created` (seconds resolution) to order events or detect duplicates. — [Stripe Webhooks](https://docs.stripe.com/webhooks)
- Stripe retries: up to **3 days** with exponential backoff in live mode. Manual resend is possible for 15 days in the Dashboard and 30 days in the CLI. — [Stripe Webhooks](https://docs.stripe.com/webhooks)
- Stripe recovery after an outage: call List Events with `delivery_success=false`, anchored with `ending_before` (30-day window). Guard against double-processing because automatic retries keep arriving. "When your endpoint receives an event you've already processed, skip it and return a 200 response to stop further retries." — [Stripe Manage Webhook Endpoints](https://docs.stripe.com/webhooks/process-undelivered-events)
- Stripe recommends rotating signing secrets periodically, with an overlap of up to 24h during which both secrets sign. — [Stripe Webhooks](https://docs.stripe.com/webhooks)
- Shopify: no ordering guarantee within or across topics. "Your app shouldn't rely on receiving data from Shopify webhooks… use reconciliation jobs to periodically fetch data". Dedupe on `X-Shopify-Webhook-Id`. Run `updated_at`-filtered catch-up jobs. — [Shopify About Webhooks](https://shopify.dev/docs/apps/build/webhooks)
- Hookdeck on idempotency:
  - Most providers are "at least once". Enforce uniqueness with a DB UNIQUE constraint, or keep a `processed_webhooks` table with the ID as primary key.
  - INSERT first and do side effects afterwards.
  - On a unique violation (Postgres `23505`), return 2xx silently. On handler failure, delete the row so the retry gets processed.
  - Retries are "the primary source of duplicate webhook deliveries". — [Hookdeck: Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency)

### Inferences

- **Recommended ingestion pipeline for NestJS:**
  1. Controller verifies HMAC on `req.rawBody` with `crypto.timingSafeEqual`.
  2. Same request: `INSERT INTO webhook_inbox (event_id PK, event_type, payload jsonb, signature, received_at, status='RECEIVED') ON CONFLICT (event_id) DO NOTHING`.
  3. Return 200 in well under 5s.
  4. A worker (BullMQ, pg-boss, or a `SELECT … FOR UPDATE SKIP LOCKED` poller) processes rows and marks them PROCESSED/FAILED with an attempt count.

  The inbox doubles as the replay tool. Razorpay offers no bulk replay and only 3h of logs, so it is the only durable record.

- Because Razorpay disables the endpoint after 24h of failures, alert on any sustained non-2xx rate or inbox backlog well before 24h. If the endpoint is disabled, the reconciliation poller is the only safety net.
- Razorpay signatures carry no timestamp, so there is no built-in replay-window protection. The event-id UNIQUE constraint plus state-guarded transitions give the replay safety instead.
- Out-of-order handling: treat each event as a hint. Either (a) apply it only if the transition is legal from the current state (monotonic guard), or (b) "fetch before process": re-fetch the payment/order from the Razorpay API and apply the authoritative state. Option (b) also fixes stale snapshot payloads.
- Minimal event set for a one-time-payment e-commerce flow: `payment.authorized` (only if manual capture), `payment.captured` or `order.paid` (subscribe to one as the "paid" trigger and treat both idempotently if you take both), `payment.failed`, `refund.processed`/`refund.failed`, and the `payment.dispute.*` events.

### Gaps

- Razorpay does not publish its exact backoff intervals (only "exponential backoff for 24 hours"), and I found no published cap on attempts.
- Razorpay docs don't say whether `x-razorpay-event-id` stays stable across a support-initiated replay. Presumably it does (same event), but I couldn't confirm it.
- Svix's own retry-schedule page and the Hookdeck "fetch before process" page were not read in full. Firecrawl credits ran out mid-research.

---

## 2. Explicit payment and order state machines

### Takeaway

Model **Order** (business intent, one per checkout) separately from **PaymentAttempt** (one per Razorpay `pay_…`, many per order). This mirrors Razorpay's own Order/Payment split and Stripe's PaymentIntent-with-many-charges model. Every transition should be an explicit allowed edge, applied with a guarded `UPDATE … WHERE status = :expected`. Terminal states absorb late or duplicate events: record them, never apply them backwards. The one exception is late authorisation, where a "failed" attempt can legitimately become authorized.

### Cited Findings

**Razorpay payment states**

- `created` → `authorized` → `captured` → `refunded`, plus `failed`.
  - Authorized payments are "auto-refunded to the customer if not captured within 3 days of creation."
  - Failed payments: any debited amount is refunded in 5–7 working days. — [Razorpay About Payments](https://razorpay.com/docs/payments/payments/)
- **Late authorisation:**
  - With no bank response the payment stays `created`. After 10 minutes it is marked `failed` (timeout).
  - Razorpay then polls the bank for 3 days. If the bank reports success, the payment moves to `authorized`.
  - "On average, less than 0.5% of the total number of payments get late authorised."
  - Razorpay recommends subscribing to `payment.authorized` for these. — [Razorpay Late Authorisation](https://razorpay.com/docs/payments/payments/late-authorisation/)
- Capture settings:
  - Auto-capture is the default. Auto- and manual-capture timeouts can be set between 12 minutes and 3 days (the default).
  - Authorized payments not captured within the timeout are auto-refunded.
  - Direct-settlement merchants are always auto-captured. — [Razorpay Capture Settings](https://razorpay.com/docs/payments/payments/capture-settings/)

**Razorpay order states**

- `created` → `attempted` (first payment attempt) → `paid` (payment captured).
  - "No further payment requests are allowed once the order moves to the `paid` state."
  - The order "continues to be in the `paid` state even if the payment associated with the order is refunded."
  - A late-authorised payment on an already-paid order is **auto-refunded**.
  - Advantages listed: "Single successful payment bound to an order. Prevents multiple payments" and "Combines multiple payment attempts for a single order." — [Razorpay About Orders](https://razorpay.com/docs/payments/orders/)
- While an order is `attempted` with an `authorized` payment, a new payment on the same order is not allowed. — [Razorpay About Orders](https://razorpay.com/docs/payments/orders/)
- All payment attempts for an order can be fetched with `GET /v1/orders/:id/payments`. — [Razorpay Fetch Payments for an Order](https://razorpay.com/docs/api/orders/fetch-payments/)

**Razorpay refund and dispute states**

- Refunds: `processed` is "the final state". `failed` happens e.g. when a normal refund is attempted more than 6 months after payment, or an instant refund fails. Razorpay may mark a refund `processed` before receiving the ARN/RRN unless that feature is enabled. — [Razorpay Refunds](https://razorpay.com/docs/payments/refunds/)
- Disputes:
  - Statuses: Open, Under Review, Won, Lost, Closed.
  - Phases: Fraud, Retrieval, Chargeback, Pre-Arbitration, Arbitration.
  - A lost dispute means the amount is deducted from your account. — [Razorpay Disputes](https://razorpay.com/docs/payments/disputes/)

**Stripe PaymentIntent as reference**

- States: `requires_payment_method` → `requires_confirmation` → `requires_action` → `processing` (async methods) or `requires_capture` (separate auth/capture) → `succeeded`, plus `canceled`.
  - "If the payment attempt fails … the PaymentIntent's status returns to `requires_payment_method` so that the payment can be retried."
  - Cancellation "invalidates the PaymentIntent for future payment attempts… and can't be undone."
  - Stripe says to create the PaymentIntent "as soon as you know the amount… so Stripe can record all attempted payments." — [Stripe PaymentIntent Lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle)
- Stripe now recommends the Checkout Sessions API over raw PaymentIntents for most integrations. — [Stripe PaymentIntent Lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle)

**Ledger and state-model framing**

- Modern Treasury (vendor claim): "State transitions affect the ledger in real-time". The ledger "maps every rail's events to a consistent state model", with double-entry across providers. — [Modern Treasury: Why the Ledger is the Foundation of any Modern PSP](https://www.moderntreasury.com/journal/why-the-ledger-is-the-foundation-of-any-modern-psp)
- Juspay: refunds and disputes are modelled as new events linked to the original capture. "A dispute debit and a later dispute reversal can both affect the balance", so each stays a distinct event. Corrections are versioned, not overwritten. — [Juspay: Payment Reconciliation Across Multiple PSPs](https://juspay.io/blog/payment-reconciliation-across-multiple-psps-architecture-that-proves-every-rupee)

### Inferences

- **PaymentAttempt** (mirrors Razorpay `pay_…`):

  | Current state      | Allowed next states             |
  | ------------------ | ------------------------------- |
  | CREATED            | AUTHORIZED, CAPTURED, FAILED    |
  | AUTHORIZED         | CAPTURED, FAILED, AUTO_REFUNDED |
  | FAILED             | AUTHORIZED (late auth only)     |
  | CAPTURED           | PARTIALLY_REFUNDED, REFUNDED    |
  | PARTIALLY_REFUNDED | REFUNDED                        |
  - FAILED is "soft-terminal" for 3 days because of late authorisation. Treat it as terminal for the customer journey, but still accept a later `payment.authorized`/`captured`.
  - A dispute flag or child record sits alongside the attempt rather than being a linear state.

- **Order** (our domain):
  - Main path: PENDING_PAYMENT → PAID → (fulfilment states…).
  - PENDING_PAYMENT → EXPIRED/CANCELLED when our reservation TTL lapses.
  - PAID → REFUND_PENDING → PARTIALLY_REFUNDED/REFUNDED.
  - PAID → DISPUTED → (WON → PAID | LOST → CHARGED_BACK).
  - Razorpay's own order never leaves `paid` after a refund, so the refund/dispute status must live in our order or in separate Refund/Dispute tables.
- **Guarded transitions:**
  - Apply each one as `UPDATE payment_attempt SET status=:to, … WHERE id=:id AND status = ANY(:allowedFrom) RETURNING *`. Zero rows means a stale, duplicate or illegal event: log it to the audit table and ack.
  - Write the transition row (from, to, cause = event_id/poll/admin, actor, at) in the same transaction.
  - This makes handlers idempotent and order-insensitive, so no distributed locks are needed.
- **Late-capture-after-expiry edge case.** A payment captures after our order already EXPIRED and its inventory was released. Razorpay will **not** auto-refund it, because the Razorpay order is legitimately `paid`. Our system must detect "CAPTURED attempt on non-payable order" and either re-reserve and fulfil, or refund via API, then alert. (Inferred from Razorpay's order semantics: its auto-refund applies only to _second_ payments on an already-paid order.)
- Double payment on one of our orders across two Razorpay orders (e.g. the customer retried, which created a new `order_…`) is not prevented by Razorpay. Prefer reusing a single Razorpay order per domain order, so Razorpay enforces "single successful payment bound to an order."

### Gaps

- Razorpay docs don't give an explicit order-expiry state. Razorpay orders stay `created`/`attempted`, and I did not research whether any expiry option exists.
- The Airbnb "Avoiding Double Payments" (Orpheus) post returned HTTP 403 and could not be read. Its idempotency-phase details are not cited here.

---

## 3. Reconciliation against the PSP and the bank

### Takeaway

Webhooks miss events, arrive out of order, and can be disabled, so every serious source pairs them with reconciliation. That has two layers:

1. A short-interval **stuck-pending poller** that fetches order and payments from Razorpay for any attempt pending longer than N minutes.
2. A daily **settlement reconciliation**: pull `GET /v1/settlements/recon/combined` and match every payment, refund, adjustment and dispute line, including fee and tax, against the internal ledger and against the bank credit by `settlement_utr`. That second leg is three-way recon.

### Cited Findings

- **Settlement recon API.** `GET /v1/settlements/recon/combined?year=YYYY&month=MM[&day=DD][&count=1..1000][&skip=]` returns "all transactions such as payments, refunds, transfers and adjustments settled to your account on a particular day or month." — [Razorpay Fetch Settlement Recon](https://razorpay.com/docs/api/settlements/fetch-recon/)
- **Recon row fields:** `entity_id`, `type` (payment/refund/transfer/adjustment), `debit`, `credit`, `amount`, `currency`, `fee`, `tax` (tax on fee), `on_hold`, `settled`, `created_at`, `settled_at`, `settlement_id`, `settlement_utr`, `order_id`, `order_receipt`, `method`, card network/issuer/type, `dispute_id`, `payment_id` (for refunds/transfers). — [Razorpay Fetch Settlement Recon](https://razorpay.com/docs/api/settlements/fetch-recon/)
- Other settlement endpoints: `GET /v1/settlements/` and `GET /v1/settlements/:id`. Settlements API availability is listed for India, Malaysia and Singapore. — [Razorpay Settlements API](https://razorpay.com/docs/api/settlements/)
- **Settlement mechanics:**
  - Captured payments settle automatically, after deducting fees, to the KYC bank account.
  - The standard domestic cycle is **T+2 working days** from capture; bank holidays excluded.
  - All settlements are in INR.
  - International payments can be partly held as reserve. — [Razorpay About Settlements](https://razorpay.com/docs/payments/settlements/)
- **Partial settlements.** If refunds have pushed the live balance below the scheduled settlement amount, Razorpay settles only the transactions that add up to the live balance and defers the rest to the next slot. So a captured payment can settle later than T+2. — [Razorpay About Settlements](https://razorpay.com/docs/payments/settlements/)
- Settlements can fail (inactive or frozen account, wrong details, bank rejection). — [Razorpay About Settlements](https://razorpay.com/docs/payments/settlements/)
- Webhook payloads include `fee` and `tax` on the payment entity, e.g. `"fee": 2, "tax": 0`. — [Razorpay Orders Webhook Events](https://razorpay.com/docs/webhooks/orders/)
- **Polling fallback is endorsed by Razorpay:** "you may choose to poll our payment APIs as well". Integration docs list "Poll Payment APIs" as one of three status-verification methods. — [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/); [Razorpay Integration Steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- Shopify: "Webhook delivery isn't always guaranteed… use reconciliation jobs to periodically fetch data". It suggests incremental `updated_at`-filtered sync and a manual "reconcile" button. — [Shopify About Webhooks](https://shopify.dev/docs/apps/build/webhooks)
- Stripe documents rare cases where an Event "is irrecoverable". It can't be delivered or listed, so only an API state read can recover it. — [Stripe Manage Webhook Endpoints](https://docs.stripe.com/webhooks/process-undelivered-events)
- **Three-way recon (Juspay):**
  - The legs are merchant ledger ↔ PSP records ↔ bank cash. "Only the three legs together close the loop."
  - Settlement lines link to a payout/batch ID, and the payout is matched to the bank credit by provider reference.
  - Primary match: merchant payment ID ↔ PSP reference. Composite fallback (amount, currency, merchant account, bounded time window) only when IDs are missing. Record which rule produced each match.
  - Mismatch taxonomy: Missing Source, Identity, Lifecycle, Amount, Fee (observed vs expected fee, variance, provenance), Timing, Currency, Duplicate, Bank, Restatement.
  - Statuses: "provisional, expected, settled, bank-confirmed, or excepted".
  - Exceptions get an owner, aging, evidence and sign-off.
  - Corrections are versioned ledger entries, never erasures. — [Juspay: Payment Reconciliation Across Multiple PSPs](https://juspay.io/blog/payment-reconciliation-across-multiple-psps-architecture-that-proves-every-rupee)
- Modern Treasury (vendor framing): reconciliation means "matching external events (transactions, balances, payment statuses) against an internal record". It should be continuous as events arrive, not only at month-end. — [Modern Treasury: Why the Ledger is the Foundation of any Modern PSP](https://www.moderntreasury.com/journal/why-the-ledger-is-the-foundation-of-any-modern-psp)

### Inferences

- **Layer 1, stuck-pending poller** (cron every ~5 min):
  1. Select attempts/orders in PENDING/CREATED/AUTHORIZED older than ~15 min (beyond Razorpay's 10-min created→failed timeout).
  2. Call `GET /v1/orders/:id/payments`.
  3. Push results through the **same** guarded transition function as webhooks, with cause = `POLL`.
  4. Keep polling daily up to 3 days, the late-auth window, before final close.
- **Layer 2, daily PSP recon** (D+1). Fetch recon/combined for the settlement date and paginate with count=1000/skip. Upsert into `psp_settlement_line` keyed on (`entity_id`, `type`). Then classify:
  - (a) **Captured at PSP, not PAID in DB.** Missed webhook, or a late capture on an expired order. Auto-heal via the transition function, or refund. Alert.
  - (b) **PAID in DB, absent from PSP** past the expected T+2 (+holiday/partial-settlement slack). Check `settled=false`/`on_hold`, then escalate.
  - (c) **Amount mismatch.** Compare `amount` to the order total in paise.
  - (d) **Fee variance.** Compare `fee`/`tax` to the contracted MDR. `tax` is GST on the fee; book it separately so input-tax credit can be claimed.
  - (e) **Refund/adjustment/dispute lines** with no matching internal Refund/Dispute record.
- **Layer 3, bank recon.** Sum net per `settlement_id` and match it to the bank-statement credit via `settlement_utr`. Book a receivable at capture (gross − fee − tax) and clear it on bank credit.
- Inference for the report-writer, not a cited rule: the internal Razorpay-sourced tables (inbox, attempts, recon lines) plus a double-entry ledger table are what make this "verification rather than reconstruction".

### Gaps

- **No primary-source engineering posts from Airbnb, Uber, Square or Stripe on reconciliation pipelines were retrieved.** Search returned only vendor and glossary content, the Airbnb Medium post returned 403, and Firecrawl credits ran out. The report should not attribute specific recon designs to those companies from these notes.
- I did not verify Razorpay's dashboard "Settlement Recon Report" format (CSV columns), its delivery schedule, or whether a settlement webhook (`settlement.processed`) exists for India. The US docs nav lists a "Settlements Webhook Events" page that was not read.
- Razorpay's GST rate on fees (presumably 18%) and its tax-invoice format were not confirmed from sources.
- A Razorpay doc URL for a reconciliation guide (`/payments/settlements/reconciliation`) returned "Page Not Found". Razorpay's "Single Reconciliation View" (Optimizer) page exists but was not read.

---

## 4. Observability: metrics, audit logs, correlation IDs

### Takeaway

I found no primary source in this pass that prescribes a payment-observability metric set. The recommendations below are mostly inferred from the failure modes documented above: the 5s timeout, the 24h disable, the 3h log window, the 10-min/3-day late-auth window, and T+2 settlement.

### Cited Findings

- Stripe's Event deliveries tab shows each attempt's HTTP status and the time of the next retry. It flags "(Timed out) ERR" as the server taking too long, and advises deferring logic. — [Stripe Webhooks](https://docs.stripe.com/webhooks)
- Razorpay webhook logs keep only the last 3 hours of deliveries, with request and response headers per attempt, so they can't be the system of record. — [Razorpay Webhook FAQs](https://razorpay.com/docs/webhooks/faqs/)
- Razorpay emails an alert address when a webhook is disabled. — [Razorpay Webhook Best Practices](https://razorpay.com/docs/webhooks/best-practices/)
- Juspay's recon controls are exception aging, an owner per break, evidence, and a record of which rule produced each match. — [Juspay: Payment Reconciliation Across Multiple PSPs](https://juspay.io/blog/payment-reconciliation-across-multiple-psps-architecture-that-proves-every-rupee)
- Modern Treasury says every action is "recorded in the ledger with timestamps, attribution, and context". — [Modern Treasury: Why the Ledger is the Foundation of any Modern PSP](https://www.moderntreasury.com/journal/why-the-ledger-is-the-foundation-of-any-modern-psp)

### Inferences

- **Metrics / alerts**, with thresholds to tune:

  | Metric                             | Notes / alert                                                 |
  | ---------------------------------- | ------------------------------------------------------------- |
  | Webhook endpoint p95 latency       | Alert if > 2s; the hard limit is 5s                           |
  | Webhook non-2xx rate               | Alert on sustained >0 for 15 min, well before the 24h disable |
  | Inbox backlog depth and age        |                                                               |
  | Webhook lag                        | `received_at − payload.created_at`                            |
  | Processing lag                     | `processed_at − received_at`                                  |
  | Stuck-pending count by age bucket  | 15m / 1h / 24h / 3d                                           |
  | Late-auth count                    | FAILED→AUTHORIZED transitions; Razorpay's baseline is <0.5%   |
  | Payment success rate by method     | card/upi/netbanking/wallet, from `method`                     |
  | Illegal/ignored transition count   | Rejected by the status guard                                  |
  | Recon breaks by category and aging | Unsettled-past-T+2 amount                                     |
  | Fee variance total                 |                                                               |

- **Audit:** an append-only `payment_state_transition` table recording from, to, cause (webhook event_id / poll / admin user), raw-payload reference, and timestamp. Keep the raw inbox payloads, since Razorpay keeps only 3h of logs and 15 days of replay eligibility.
- **Correlation:**
  - Put the internal order ID into Razorpay order `receipt`/`notes`. `order_receipt` comes back on recon lines (cited above), which links PSP rows to domain orders.
  - Log a single correlation key set on every log line: our order ID, `order_…`, `pay_…`, `x-razorpay-event-id`.

### Gaps

- No sourced industry benchmarks for payment success rate by method in India, or for typical webhook lag, were found.
- I found no Razorpay engineering-blog content on observability. It was not searched before the credit exhaustion.

---

Firecrawl note: the Firecrawl connector ran out of credits partway through research. Remaining pages were fetched via curl of documentation `.md` endpoints and WebFetch. Firecrawl's message: "Your Firecrawl credits ran out. Daily MCP credits refresh in 5h 49m. Add credits or upgrade to keep going: https://www.firecrawl.dev/billing/s/KrOilAV2MuLzn_ezu0RO62Z6ZoQE8PJyuZOifSqGyds"
