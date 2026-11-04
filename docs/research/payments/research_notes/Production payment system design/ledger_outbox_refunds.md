# Consistency patterns for payment systems: double-entry ledgers, transactional outbox, sagas, refund design (NestJS + PostgreSQL marketplace, Razorpay PSP)

Research date: 2026-11-03. Razorpay docs were fetched as the India markdown versions (`razorpay.com/docs/...md`) wherever possible. One page (`/docs/payments/refunds/`) was served in its US-region form; that is flagged where it is cited.

## 1. Double-entry ledger: why use an immutable append-only ledger instead of mutable balance columns; schema; invariants; marketplace splits, refunds, reversals

### Takeaway

Large payment companies treat an immutable, double-entry event log as the system of record. Balances are always derived from that log and are never mutated in place. Correctness then becomes a query: clearing (intermediate) accounts must return to zero, and debits must equal credits. For a small marketplace the same idea fits in three Postgres tables (accounts, transactions, entries). Commissions, vendor payables, refunds and reversals are all recorded as new balanced transactions, never as edits to old rows.

### Cited Findings

**Stripe Ledger (Feb 2024)**

- Stripe built Ledger as "an immutable and auditable log" and "a trustworthy system of record for all of our financial data". It also standardizes how money movement is represented. — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Scale: Ledger sees 5 billion events per day. 99.99% of dollar volume is fully ingested and verified within four days, and the combined system gives "over 99.9999% explainability of money movement". — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Model: Ledger "encodes a state machine representation of producer systems" as a logical fund flow, with "the movement of balances (events) between accounts (states)". Accounts are "buckets of money distinguished by their type (e.g., `charge_unsubmitted`) and properties (e.g. `id`, `business`)". Events move money between accounts (e.g. `charge.creation`, `charge.release`). — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Immutability: "Transactions previously published into Ledger cannot be deleted or modified, and we can always reconstruct past state by processing all events up to that point." Balances and controls are "transformations of the static underlying structure". — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Ledger is built on double-entry bookkeeping, which Stripe calls "a mathematical proof of correctness". The analogy is pipes and reservoirs: at steady state, terminal (non-clearing) accounts are full and intermediate (clearing) accounts are empty. Water left in the pipes means unresolved balances. — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Detection is a simple query, "Find the clearing Accounts with nonzero balance". A single missing, late or wrong event (e.g. the wrong `business` id) leaves a non-zero clearing balance. Events can arrive out of order because they are joined by identifiers. — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Data-quality metrics: Clearing (did the fund flow complete?), Timeliness (did data arrive on time?) and Completeness. Completeness includes ensuring "every ID in a producer database has a matching Ledger event". — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)
- Corrections: "we can't run simple queries to mutate the state; instead, we have to revert and reprocess prior operations". Repairs go through a "two-phase review and commit". — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)

**Modern Treasury (accounting for developers)**

- "An account is a segregated pool of value." A transaction is an atomic event with at least two entries, and "Each entry belongs to a transaction and an account." — [Modern Treasury: Accounting for Developers Part I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- Normal balances: accounts for funds you own or uses of money (assets, expenses) are debit-normal. Accounts for funds you owe or sources of money (liabilities, equity, revenue) are credit-normal. Total debits must equal total credits. — [Modern Treasury: Accounting for Developers Part I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- Recommendation: "store immutable transactions and always compute balances from those transactions". "Mutating balances directly creates a system that is prone to errors", and it makes inaccuracies harder to detect and reconcile. — [Modern Treasury: Accounting for Developers Part I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- In the peer-to-peer example a transaction "ensures the total money in the system doesn't change, it just moves". — [Modern Treasury: Accounting for Developers Part I](https://www.moderntreasury.com/journal/accounting-for-developers-part-i)
- Modern Treasury lists the core ledger-database features for scale as immutability, enforced double-entry and concurrency controls. — [Modern Treasury: How to Scale a Ledger, Part I](https://www.moderntreasury.com/journal/how-to-scale-a-ledger-part-i)

**Uber LedgerStore**

- LedgerStore is Uber's "immutable storage solution… that provides verifiable data completeness and correctness guarantees" for "tens of billions of financial transactions… every quarter". — [Uber: How LedgerStore Supports Trillions of Indexes](https://www.uber.com/blog/how-ledgerstore-supports-trillions-of-indexes/)
- It uses strongly consistent indexes for time-critical financial reads (e.g. credit card holds), eventually consistent indexes for less critical data (e.g. payment history), and time-range indexes for querying cold storage. Uber moved it from DynamoDB to its in-house Docstore, and it holds over 2 trillion unique indexes with no reported inconsistencies (from a page summary, not a full-text read). — [Uber: How LedgerStore Supports Trillions of Indexes](https://www.uber.com/blog/how-ledgerstore-supports-trillions-of-indexes/)

**PSP-side facts that shape marketplace ledger entries**

- Razorpay pays refunds "from the merchant balance, not directly from the original payment". An insufficient balance blocks the refund. — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)
- With Route, "the amount is deducted from your main account balance when refunding a payment". `reverse_all: true` recovers the amount from the linked (vendor) account. — [Razorpay: Refund Payments and Reverse Transfer](https://razorpay.com/docs/api/payments/route/refund-payments-and-reverse-transfer.md)
- On normal refunds, "the transaction fee and GST levied by Razorpay at the time of payment capture will not be reversed". On instant refunds, "the Platform fee charged or deducted for the transaction will not be refunded". — [Razorpay: Normal Refunds](https://razorpay.com/docs/payments/refunds/normal.md); [Razorpay: Instant Refunds](https://razorpay.com/docs/payments/refunds/instant.md)

### Inferences

- **Minimal Postgres schema (inferred from the Stripe and Modern Treasury models):**
  - `ledger_accounts(id, code, owner_type, owner_id, currency, normal_balance)`
  - `ledger_transactions(id, kind, external_ref UNIQUE, occurred_at, created_at)`
  - `ledger_entries(id, transaction_id, account_id, amount_paise BIGINT signed, currency)`
  - Enforce `SUM(amount_paise) = 0` per transaction with a `DEFERRABLE INITIALLY DEFERRED` constraint trigger. Block `UPDATE`/`DELETE` with a trigger or revoked grants. A balance cache, if you keep one, is a derived projection that can be rebuilt.
- **Marketplace capture of ₹1,000 with 10% commission:**
  - Debit `psp_receivable` (asset) by 100000.
  - Credit `vendor_payable:{vendor}` (liability) by 90000.
  - Credit `platform_commission_revenue` by 10000.
  - Record the PSP fee and GST as a separate debit to `psp_fees_expense` and credit to `psp_receivable` once settlement reports arrive.
- **Refunds:** post a new transaction that mirrors the original split, including a vendor-payable debit or a reversal-receivable. The platform-fee expense is not reversed, because Razorpay keeps its fee and GST.
- **Clearing accounts:** `psp_receivable`, `refund_pending` and `transfer_pending` should net to zero once the PSP reports settlement. Stripe's "nonzero clearing account" query is a cheap daily reconciliation alert for a small team.
- **Idempotent posting:** a unique `external_ref` per business event (for example `capture:pay_X`, `refund:rfnd_Y`) makes ledger posting idempotent, so webhook replays are safe.

### Gaps

- Uber Gulfstream (payments platform) was not retrieved. The LedgerStore detail comes from a page summary, not the full article.
- Square "Books" and Martin Fowler's accounting patterns (Account, Entry, AccountingTransaction) were not fetched because search credits ran out. No claims are made about them here.
- Modern Treasury Parts II and III (Venmo-style ledger, lending marketplace examples) were not fetched.

## 2. Transactional outbox and inbox; Postgres implementation; saga and compensation for checkout

### Takeaway

"Update DB, then publish or call" is a dual write. A crash between the two steps leaves them inconsistent, and 2PC is not available. The outbox pattern writes the intent into the same DB transaction, and a relay publishes it later. The relay can publish more than once, so consumers must be idempotent: an inbox table, or deduplication on PSP event IDs. Checkout across stock, PSP and order is a saga of local transactions with compensations.

### Cited Findings

- **Problem:** a command must "atomically update the database and send messages". 2PC is "not viable" because the DB or broker "might not support 2PC", and coupling to both is undesirable. — [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- **Why naive ordering fails:** sending inside the transaction gives no guarantee the transaction commits. Sending after commit gives no guarantee the service "won't crash before sending the message". — [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- **Solution:** store the message in an outbox table "as part of the transaction that updates the business entities". A separate message relay sends it. Benefits: no 2PC, messages "sent if and only if the database transaction commits", order preserved. — [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- **Caveat:** the relay "might publish a message more than once" (crash after publish, before marking sent), so "a message consumer must be idempotent, perhaps by tracking the IDs of the messages that it has already processed". — [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- **Relay options:** Transaction log tailing (CDC) or Polling publisher. — [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- **Postgres `SKIP LOCKED`:** "any selected rows that cannot be immediately locked are skipped… not suitable for general purpose work, but can be used to avoid lock contention with multiple consumers accessing a queue-like table." `NOWAIT` errors instead of waiting. — [PostgreSQL docs: SELECT, Locking Clause](https://www.postgresql.org/docs/current/sql-select.html)
- **Saga:** "a reliably coordinated sequence of local transactions". If a step fails a business rule, completed steps are undone by compensating transactions. — [microservices.io: Saga](https://microservices.io/patterns/data/saga.html)
- **Coordination styles:** in choreography each local transaction publishes events that trigger the next. In orchestration an orchestrator tells participants what to execute. — [microservices.io: Saga](https://microservices.io/patterns/data/saga.html)
- **Isolation:** sagas lack isolation, and concurrent sagas can cause anomalies that need "countermeasures". Each step must atomically update the DB and publish, via event sourcing or a transactional outbox. — [microservices.io: Saga](https://microservices.io/patterns/data/saga.html)
- **Inbox-side reality with Razorpay:** the endpoint "might receive the same webhook event multiple times". Deduplicate on the `x-razorpay-event-id` header. Webhooks may arrive out of order. Non-2xx responses are retried with exponential backoff for 24 hours. A response slower than 5 seconds is treated as a timeout and resent, even if the server accepted the event. — [Razorpay: Webhook best practices](https://razorpay.com/docs/webhooks/best-practices.md)

### Inferences

- **NestJS + Postgres polling relay:**
  - Table: `outbox(id bigserial, aggregate_type, aggregate_id, event_type, payload jsonb, created_at, available_at, attempts, published_at NULL)`.
  - Worker loop: `BEGIN; SELECT … WHERE published_at IS NULL AND available_at <= now() ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED;` → dispatch → `UPDATE published_at` → `COMMIT`.
  - Use exponential backoff on `available_at`, and a dead-letter after N attempts.
  - A modular monolith does not need a broker. The "publish" step can be an in-process handler or a PSP API call such as creating a refund.
- **Outbox rows for PSP side-effects:** use outbox rows like `refund.requested` that a worker turns into Razorpay calls. The DB commit of "refund requested + ledger pending entry" is atomic, and the PSP call happens after it with retries.
- **Inbox:** `processed_webhook_events(event_id PRIMARY KEY, received_at)`. Insert it in the same transaction as the state change, using `ON CONFLICT DO NOTHING` to short-circuit replays. Ack fast (<5 s) and process asynchronously so Razorpay does not retry processing that has already been accepted.
- **Out-of-order safety:** because events can arrive out of order, state transitions should be monotonic. For example, never move a refund from `processed` back to `pending`.
- **Checkout saga (orchestrated):**
  1. Reserve stock locally, with a TTL.
  2. Create the Razorpay order.
  3. On a verified `payment.captured`/`order.paid`, confirm the order and post the ledger entries.
  4. On timeout or failure, release the reservation as the compensation.
  5. If payment captured after the reservation expired and stock is gone, compensate with a refund.
     The existing "stale-reservation sweep" in this repo (commit bb14228) already acts as the compensation timer.

### Gaps

- Debezium or logical-replication CDC for Postgres was not researched. It is probably overkill for a small team.
- No source was fetched for a dedicated "inbox pattern" write-up. The inbox design above is inferred from the outbox page's idempotent-consumer note and Razorpay's event-id guidance.

## 3. Distributed-transaction reasoning: no 2PC with the PSP; external calls outside DB transactions; at-least-once + idempotency

### Takeaway

A PSP cannot take part in your DB transaction. Never hold a DB transaction open across a Razorpay HTTP call. Record intent first, call the PSP with an idempotency key, then reconcile using webhooks and polling. Retries plus idempotent receivers give effectively-once outcomes.

### Cited Findings

- 2PC across the DB and an external system is "not an option", and messages may be delivered more than once, so consumers must be idempotent. — [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- Razorpay's refund API offers request-level idempotency through `receipt`: "The value passed in the `receipt` parameter has already been used for an earlier refund on the same payment. `receipt` is treated as an idempotency key." — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)
- Razorpay rejects concurrent operations: "Request failed because another payment operation is in progress… (such as another refund attempt or a capture)". The guidance is to retry after a few seconds and fetch the payment and its refunds first. — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)
- "Refund has already been processed… Use the Fetch Refunds API to check the existing refund status before retrying." — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)
- Stripe recovers from upstream divergence by reverting and reprocessing through reviewed migrations, never by mutating in place. — [Stripe: Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement)

### Inferences

- **Call pattern:**
  1. Tx1: insert `refund(status='requested', receipt=<our refund uuid>)` plus an outbox row, then commit.
  2. Worker: POST /refund with `receipt` = our uuid. On timeout, retry with the same receipt.
  3. On "Duplicate receipt", fetch refunds for the payment and adopt the existing `rfnd_` id.
  4. Tx2: store `rfnd_` id and status.
  5. Webhooks then advance the state.
  6. A daily reconciliation job compares local state with the Razorpay fetch APIs and settlement reports. This plays the role of Stripe's completeness check.
- **Effectively-once** = at-least-once delivery (outbox relay, webhook retries) + idempotent effects (receipt key, event-id inbox, unique `external_ref` on ledger transactions).

### Gaps

- Kleppmann's DDIA treatment ("exactly-once" via idempotence, end-to-end argument) was not fetched. No direct quotes are available. The principle is supported above only by microservices.io and Razorpay docs.
- Razorpay's generic API idempotency header (if any exists beyond `receipt` for refunds) was not verified.

## 4. Refunds: Razorpay Refunds API, speeds, partial/multiple, states, webhooks, idempotency, TAT/RBI, COD, failures, void vs refund

### Takeaway

Razorpay refunds always go back to the original source. They are funded from the merchant balance and may be partial and repeated up to the captured amount. They move `pending` → `processed`/`failed`, with `refund.created/processed/failed/speed_changed` webhooks. Use `receipt` as an idempotency key. `speed: optimum` gives an instant refund when possible and falls back to normal otherwise. COD and other offline methods cannot be refunded through the API, so the platform must pay them out separately. For still-authorized payments, a full-amount request acts as a void, and partial voids are rejected.

### Cited Findings

**Speeds and timing**

- Instant refunds are enabled by default. Set `speed: optimum`; if instant is not possible, Razorpay "will initiate a refund that is processed at the normal speed". `speed_requested`/`speed_processed` show the result (e.g. requested `optimum`, processed `normal`). — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md); [Razorpay: Instant Refunds](https://razorpay.com/docs/payments/refunds/instant.md)
- Instant refund timing by amount:
  - Up to ₹5,00,000: credited immediately.
  - Above ₹5,00,000 up to ₹1,00,00,000: via NEFT within 3–4 business hours (up to 1 business day outside hours).
  - Above ₹1,00,00,000: normal speed (5–7 business days).
    — [Razorpay: Instant Refunds](https://razorpay.com/docs/payments/refunds/instant.md)
- Instant refunds carry a fee, deducted from the account balance. If the instant refund fails and falls back to normal (5–7 working days), the fee is credited back. — [Razorpay: Instant Refunds](https://razorpay.com/docs/payments/refunds/instant.md)
- Normal refunds have no processing fee.
  - India normal-refunds page: "processed within 7-10 working days". By method: cards 5–10 days, netbanking 2–10, wallet 0–3, UPI 2–7. — [Razorpay: Normal Refunds](https://razorpay.com/docs/payments/refunds/normal.md)
  - **Conflict:** the API reference and the (US-served) About Refunds page say 5–7 working days. — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md); [Razorpay: About Refunds](https://razorpay.com/docs/payments/refunds/)

**Partial and multiple refunds**

- `amount` is in the smallest currency unit and is required for a partial refund. Omitting it refunds the full amount. Refunds of ₹1 or lower are now supported. Passing `amount: 0` errors with "Amount cannot be blank". — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)
- Error cases that imply multiple partial refunds are allowed up to the captured total:
  - "The refund amount provided is greater than amount captured."
  - "The payment has been fully refunded already."
  - "Partial refund is currently not supported for this payment method" (some gateways allow full refunds only).
    — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)

**States, references and webhooks**

- States:
  - `pending`: Razorpay is attempting to process the refund.
  - `processed`: final state.
  - `failed`: e.g. a normal refund on a payment older than 6 months, or an instant-refund failure due to the customer's account or bank.
    — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)
- "Usually, Razorpay moves a refund to the `processed` state before receiving the ARN/RRN number from the Gateway". Merchants can ask support to delay `processed` until gateway confirmation. (This was read on the US-served page.) — [Razorpay: About Refunds](https://razorpay.com/docs/payments/refunds/)
- `acquirer_data` carries the RRN/ARN/UTR that customers use to trace a refund with their bank. — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)
- Webhooks: `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`. — [Razorpay: Refund webhooks](https://razorpay.com/docs/payments/refunds/subscribe-to-webhooks.md)

**Idempotency and request fields**

- `receipt` is "A unique identifier provided by you for your internal reference" and is treated as an idempotency key per payment. `notes` allows up to 15 key-value pairs. — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)

**Source refunds and funding**

- "Razorpay only does source refunds… money is refunded to the payment method that the customer used", to prevent chargebacks. (US-served page; the India normal and instant pages say the same.) — [Razorpay: About Refunds](https://razorpay.com/docs/payments/refunds/); [Razorpay: Normal Refunds](https://razorpay.com/docs/payments/refunds/normal.md)
- Refunds are blocked when the merchant balance is too low ("Refunds are paid out from the merchant balance"). — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)

**Blocking conditions**

- Disputes: "The refund on this payment is blocked due to ongoing dispute investigation." — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)
- COD and offline methods: "Refund is currently not supported for this payment method… (for example, Cash on Delivery, offline, BharatQR)… Reconcile the refund offline with the customer. Do not retry the API call." — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)

**Void vs refund**

- "Void is not supported for partial refunds… requested on a payment that is still in the `authorized` state. A void can only be performed for the full authorised amount." The fix is to capture first and then partially refund, or void the full amount by omitting `amount`. — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)
- **Apparent contradiction on the same page:** another error says "Refunds can only be initiated against payments that are currently in the `captured` state" (status failed / `authorized` / `cancelled` / fully refunded). The void behaviour for authorized payments may depend on account or gateway configuration. — [Razorpay: Create an Instant Refund (errors)](https://razorpay.com/docs/api/refunds/create-instant.md)

**RBI rules**

- The RBI circular "Harmonisation of Turn Around Time (TAT) and customer compensation for failed transactions" is dated 20 Sep 2019. It defines a failed transaction as one "not fully completed due to any reason not attributable to the customer".
  - Card-not-present, e-commerce and UPI merchant payments: auto-reversal within T+5 days, ₹100/day compensation beyond that.
  - On-us PPI/wallet: T+1.
  - IMPS: T+1.
    — [RBI: Failed Transaction & Compensation Framework](https://www.rbi.org.in/Commonperson/english/scripts/Notification.aspx?Id=3074); [RBI notification](https://m.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693)
- The RBI page does not say whether the framework covers merchant-initiated refunds of successful purchases. — [RBI: Failed Transaction & Compensation Framework](https://www.rbi.org.in/Commonperson/english/scripts/Notification.aspx?Id=3074)

### Inferences

- **Local refund state machine:** `requested` → `submitted` (has `rfnd_` id) → `pending` → `processed` | `failed`. On `failed` (e.g. instant-refund bank issue), either re-submit at normal speed with a new receipt, or route to manual or bank payout. For payments older than 6 months, a normal refund will fail, so an alternate payout path is needed.
- **Platform policy:** refunds go to source only. Allow multiple partial refunds per payment (per line item or per vendor), guarded by `SUM(refunds) ≤ captured` checked under a row lock on the payment.
- **COD refunds** need a separate payout rail (e.g. RazorpayX payouts to a customer-supplied bank account or UPI ID) plus a separate ledger flow, debiting `vendor_payable` or `platform_cash` and crediting `customer_refund_payable`.
- **Cancel before capture vs after:**
  - Before capture (authorized only), a full void avoids MDR. Razorpay's manual-capture setting and auto-refund of uncaptured payments are relevant here.
  - After capture, a refund is the only option, and Razorpay's fee and GST are not returned (see section 1), so the platform absorbs that cost unless policy passes it on.
- **TAT:** no merchant-refund TAT from RBI was found. RBI's T+5 rule covers failed transactions, which matters for "debited but order not created" cases. Those should be auto-refunded quickly, ideally by the stale-payment sweep.

### Gaps

- Razorpay "auto-refunds" (uncaptured authorized payments refunded after a window) and the late-authorization docs were not fetched. The exact window is unverified.
- The sample payloads for refund webhooks (fields, e.g. whether `refund.processed` carries the ARN) were not fetched.
- No authoritative RBI or Razorpay source was found on refund TAT obligations for merchant-initiated refunds, or on COD refund mechanics in India.
- Razorpay's refund-errors page and refund FAQs (retry guidance after `failed`) were not fetched.

## 5. Marketplace payouts: Razorpay Route (linked accounts, transfers, on-hold, reversals on refund)

### Takeaway

Route splits a captured payment into transfers to vendor "linked accounts". Settlement can be held until business conditions are met, such as delivery. Transfers can be reversed fully or partially. Refunds are funded from the platform's main balance unless `reverse_all` pulls the money back from the vendor, and that flag cannot resolve partial refunds on multi-vendor splits.

### Cited Findings

- Route lets a business "split incoming funds among multiple third-parties, sellers or bank accounts". It fits "one-to-many" marketplaces. Linked accounts must be added first, via the Dashboard or API. After a payment you can transfer, defer settlement or set a custom settlement delay. Razorpay then "settles funds to the Linked Account and sends a webhook notification to you". — [Razorpay: Route](https://razorpay.com/docs/payments/route/)
- Route supports putting "settlement on hold for a transfer until your business conditions are met" (`transfers[n][on_hold]=1`), reversals through `POST /v1/transfers/:id/reversals`, and a webhook for reversals. — [Razorpay Route product page](https://razorpay.com/route/); [Razorpay: Reverse a Transfer](https://razorpay.com/docs/api/payments/route/reverse-a-transfer)
- The Route API includes "Modify Settlement Hold for Transfers" (`PATCH /v1/transfers/:id`), "Reverse a Transfer" and "Fetch Reversals for a Transfer". — [Razorpay docs navigation, Route API](https://razorpay.com/docs/payments/route/transfer-funds-to-linked-accounts)
- Reversals move funds "from the Linked Account to your account", and only the platform (not sellers) can initiate them. — [Razorpay: Reversals and Settlements (Linked Account Dashboard)](https://razorpay.com/docs/payments/route/linked-account/reversals-settlements)
- Refund + reversal: the refund amount is "deducted from your main account balance". With `reverse_all: true`, Razorpay recovers "the amount for every transfer made on the payment before processing the refund". This is automatic for full refunds, and for partial refunds where the payment went to a single account. — [Razorpay: Refund Payments and Reverse Transfer](https://razorpay.com/docs/api/payments/route/refund-payments-and-reverse-transfer.md)
- "For partial refunds on a payment transferred to multiple accounts, the `reverse_all` parameter cannot be applied… You will have to use the transfer reversal API." A `reversal` entity is created for each reversed transfer. — [Razorpay: Refund Payments and Reverse Transfer](https://razorpay.com/docs/api/payments/route/refund-payments-and-reverse-transfer.md)

### Inferences

- **Recommended pattern for a multi-vendor cart:**
  1. One payment → one Route transfer per vendor (vendor share = line totals minus commission), each `on_hold` until delivery or the return window closes.
  2. Release the hold via PATCH once the window lapses.
  3. Refunding a vendor's line: first reverse that vendor's transfer by the line amount, then refund the customer without `reverse_all`. Use the outbox to sequence these two PSP calls as a mini-saga.
- **Holds limit clawback risk:** while a transfer is on hold, a reversal pulls back money the vendor has not yet received. After settlement, a reversal may hit a vendor balance that is empty. That behaviour was not verified, but the platform would carry the risk.
- **Ledger mapping:** a transfer moves `vendor_payable:{v}` → `vendor_settled:{v}` (or `psp_linked_account:{v}`). A reversal is the mirror entry. Each transfer or reversal id is the `external_ref` that makes posting idempotent.

### Gaps

- The exact create-transfer API fields (`on_hold_until`, `linked_account_notes`), transfer status values and transfer webhook names (`transfer.processed`, etc.) could not be fetched. Two candidate doc URLs returned 404, and search credits were exhausted.
- Route fees, settlement cycle (T+N) for linked accounts, KYC requirements, and what happens when a reversal exceeds a linked account's balance are all unverified.

## 6. Money representation: integer paise, currency, rounding of commissions, GST

### Takeaway

Razorpay's API takes and returns integer amounts in the smallest currency unit (paise for INR). Store `BIGINT` paise plus an ISO currency code, never floats. Compute commissions with an explicit rounding rule so that vendor share + commission = gross exactly. Model PSP fee and GST as separate ledger lines, because Razorpay does not return them on refunds.

### Cited Findings

- "Amount should be in the smallest unit of the currency in which the payment was made". For example, refunding ₹200 of a ₹1200 payment means passing `20000`. — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)
- "For an amount of ₹200.35, the value of this field should be 20035". Route refund currency: "Currently, only INR is supported." — [Razorpay: Refund Payments and Reverse Transfer](https://razorpay.com/docs/api/payments/route/refund-payments-and-reverse-transfer.md)
- Route refund minimum: "The amount must be at least INR 1.00". This conflicts with the general refund API's "Refund amounts of ₹1 or lower are now supported", so the Route endpoint may lag. — [Razorpay: Refund Payments and Reverse Transfer](https://razorpay.com/docs/api/payments/route/refund-payments-and-reverse-transfer.md); [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)
- The Razorpay transaction fee and GST charged at capture are not reversed on normal refunds. The platform fee is not refunded on instant refunds. — [Razorpay: Normal Refunds](https://razorpay.com/docs/payments/refunds/normal.md); [Razorpay: Instant Refunds](https://razorpay.com/docs/payments/refunds/instant.md)
- Refund `amount` responses are integers in the smallest unit (₹30 → `3000`). — [Razorpay: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)

### Inferences

- **Storage:** `amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0)` plus `currency CHAR(3)` on every money row, and the same in ledger entries (signed there). In Node/NestJS, keep paise as integers (`number` is exact up to 2^53, or use `bigint`). Never do `price * 0.1` in floating point.
- **Commission:** `commission = round_half_up(gross * bps / 10000)`, then `vendor_share = gross - commission`. Deriving one side by subtraction guarantees the split sums exactly.
- **Partial refunds of a split line:** apply the same rule pro rata, so the cumulative refunded commission never exceeds the original commission. Store the commission bps on the order line at purchase time.
- **GST:** the marketplace's GST on its commission (and any e-commerce-operator TCS obligations) should be separate ledger accounts. This is noted as a design need, not verified against tax sources.

### Gaps

- No primary source was fetched on GST/TCS rules for e-commerce operators (Section 52 CGST TCS) or GST on marketplace commissions. These need dedicated tax research.
- No authoritative source was fetched on floating-point money pitfalls or banker's vs half-up rounding conventions in India. The recommendation above is engineering inference.
- Note: Firecrawl search credits ran out mid-research, which limited coverage of Square Books, Martin Fowler, Kleppmann and Razorpay Route transfer field details.
