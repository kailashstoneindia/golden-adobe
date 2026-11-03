# Idempotency and Duplicate-Payment Prevention in Production Payment Systems

> Research date: 2026-11-03. Razorpay docs were read from the current Mintlify-based docs site (razorpay.com/docs). Several Razorpay URLs redirect to `/docs/us/...` mirrors when fetched from non-Indian IPs. Where a finding came only from a `/us/` mirror, it is marked **[US mirror]**. The India page for Orders → Create (`/docs/api/orders/create`, fetched with an IN location) matched the US mirror on every field quoted below.

---

## 1. How Stripe idempotency keys work, plus Brandur Leach's Postgres design

### Takeaway

Stripe (API v1) saves the status code and body of the first request for a key once endpoint execution begins, 500s included, and replays it on any retry with that key. Keys are retained for at least 24h. A request whose parameters differ from the original's gets an `idempotency_error`. A concurrent in-flight duplicate gets a 409, and that 409 is not cached. Brandur's design copies this in Postgres: an `idempotency_keys` table unique on `(user_id, idempotency_key)`, a `locked_at` lease, stored request params for mismatch detection, and a `recovery_point` state machine of atomic phases split around each foreign call, with completer and reaper processes running alongside.

### Cited Findings

**Stripe: semantics**

- Clients send an `Idempotency-Key` header. For API v1, "Stripe saves the status code and body of the first request made with a given idempotency key after endpoint execution begins. Retries with the same key return the saved response, including `500` errors." — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- API v2 behaves differently: "retries don't repeat successful operations. Stripe retries failed or partially failed work to completion when possible and returns an updated response." — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Keys can be up to 255 characters. Stripe suggests V4 UUIDs and warns against sensitive data (emails, personal identifiers) as keys. — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Retention: "you can remove keys from the system automatically after they're at least 24 hours old. We generate a new request if a key is reused after the original is pruned." — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests). The advanced guide says the same thing: "Stripe retains keys for at least 24 hours and can remove them after that. Reusing a key after it's removed can execute a new request." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Parameter fingerprint: "The idempotency layer compares incoming parameters to those of the original request and errors if they're not the same to prevent accidental misuse." — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests). The error type is `idempotency_error`: "Idempotency errors occur when an `Idempotency-Key` is re-used on a request that does not match the first request's API endpoint and parameters." — [Stripe API: Errors](https://docs.stripe.com/api/errors)
- What is NOT cached: "If incoming parameters fail validation, or the request conflicts with another request that's executing concurrently, we don't save the idempotent result because no API endpoint initiates the execution. You can retry these requests." — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests). The advanced guide adds: "Errors that occur before execution begins, such as invalid parameters, an invalid API key, or rate limiting, don't cache a result," and "Retrying a cached 400 response with the same key returns the same error." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Concurrency: HTTP 409 means "The request conflicts with another request (perhaps due to using the same idempotent key)." — [Stripe API: Errors](https://docs.stripe.com/api/errors). Guidance: "If a 409 indicates that another request with the same key is still executing, wait and retry with that key and the same parameters. A new key can start a second operation." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Changing parameters: "first establish that the original operation didn't succeed and isn't still executing. Use a new key for the corrected operation. If the original outcome remains unknown, reconcile it before starting another operation." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Retry window: retry network failures with the same key and params "within the first 24 hours after the original request. If you still haven't received a result when that window ends, stop retrying and reconcile." After the window, "don't retry with either the old key or a new one. Retrieve the relevant object, inspect the request in the Dashboard, and use webhook events to reconcile." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Replay marker: the response header `Idempotent-Replayed: true` identifies a replayed response. The `Stripe-Should-Retry` header (true/false/absent) gives retry guidance. — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Key strategies: either a random token (UUID v4) or a key "derive[d] ... from a user-attached object, like the ID of a shopping cart. This provides a relatively straightforward way to protect against double submissions." "If your application retries across separate SDK calls or process restarts, generate and persist a key for the operation and supply it to every attempt." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Only POST takes keys. GET/DELETE are idempotent by definition and keys have no effect there. — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- The original rationale (Brandur Leach, 22 Feb 2017): the client generates a unique ID per operation and retries with it. Clients should back off exponentially (wait proportional to 2^n) and add random jitter to avoid a thundering herd. If a prior attempt was rolled back by an ACID database "it'll be safe to retry it wholesale". — [Stripe blog: Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency) _(2017, older but foundational)_

**Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres" (Oct 27, 2017; older but still the canonical reference)**

- Scope note: endpoints that only mutate local ACID state can map each request to a single transaction, which is simpler. Idempotency keys with phases are needed when the request makes foreign state mutations, such as charging a PSP. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Schema (verbatim structure): `idempotency_keys(id BIGSERIAL PK, created_at, idempotency_key TEXT NOT NULL CHECK len<=100, last_run_at, locked_at TIMESTAMPTZ DEFAULT now(), request_method, request_params JSONB NOT NULL, request_path, response_code INT NULL, response_body JSONB NULL, recovery_point TEXT NOT NULL, user_id BIGINT NOT NULL)` with `UNIQUE INDEX (user_id, idempotency_key)`. Keys are scoped per user, so different accounts can reuse the same key value. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- The business table references the key: `rides.idempotency_key_id REFERENCES idempotency_keys ON DELETE SET NULL` (keys get reaped), `stripe_charge_id TEXT UNIQUE` (NULL until charged), and `UNIQUE (user_id, idempotency_key_id)`. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Definitions: a **foreign state mutation** is any call that changes another system (a Stripe charge, an email, even Kafka emits inside your own infra). An **atomic phase** is the set of local mutations in one transaction between foreign mutations, and it must commit _before_ the next foreign call. A **recovery point** is a named checkpoint stored on the key row, starting at `started` and ending at `finished`. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Phase rules: (1) upserting the key is its own phase; (2) every foreign state mutation is its own phase; (3) everything between those is grouped into phases. Example flow: tx1 upserts the key → tx2 creates the ride and audit row and sets `ride_created` → tx3 calls Stripe and stores the charge id, setting `charge_created` → tx4 stages the receipt-email job and sets the response, moving to `finished`. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Each phase runs in a `SERIALIZABLE` transaction and returns one of `RecoveryPoint` (advance), `Response` (store code and body, set `finished`, clear `locked_at`) or `NoOp`. On a serialization failure the endpoint returns 409. On other errors it returns 500 and tries to clear `locked_at` so a retry can proceed. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Key upsert logic: if the key exists and its `request_params` differ, return 409 (params mismatch). If `locked_at` is newer than now minus `IDEMPOTENCY_KEY_LOCK_TIMEOUT`, return 409 (request in progress). Otherwise, unless already finished, set `locked_at=now`, `last_run_at=now`. If the key is new, insert it locked with `recovery_point=started`. Two concurrent inserts are resolved by the UNIQUE constraint and serializable isolation, so one gets 409. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- The handler is a DAG state machine: `loop { case key.recovery_point ... when finished: break }`, then it returns the stored `response_code` and `response_body`. A finished key replays immediately. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Downstream key: the server passes its _own_ key to Stripe (`"rocket-rides-atomic-#{key.id}"`) rather than forwarding the client's value, so the key is unique across all accounts. A card decline is stored as a final 402 `Response`. Other Stripe errors are stored as a final 503 in the sample code. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Side jobs (email) use a transactionally staged job table (`staged_jobs`) committed inside the phase. An **enqueuer** moves the jobs to the real queue after commit. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- The **completer** finds unfinished, abandoned keys and pushes them to completion. The **reaper** deletes old keys. Brandur suggests about 72h retention so that a Friday bug can still be fixed and completed on Monday. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Failure walk-through: if a server process dies while waiting on Stripe, the client retries, the same Stripe key is reused, and Stripe's idempotency prevents a double charge. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Non-idempotent foreign APIs: indeterminate errors (timeouts, resets) "will have to be marked as failed". You can only retry if the API explicitly says retry is safe. Non-ACID stores cannot have atomic phases at all. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Web forms: put an idempotency key in a hidden `<input>` when rendering the form, so double submissions carry the same key. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)

**Comparators**

- IETF `draft-ietf-httpapi-idempotency-key-header-08` (22 Oct 2026, active, expires 25 Apr 2027): `Idempotency-Key` is a Structured Field String. The key "MUST be unique and MUST NOT be reused with another request with a different request payload". UUID is RECOMMENDED, and a payload "fingerprint" MAY be combined with the key. Resources MUST publish an idempotency spec that includes the expiry policy. Status codes: missing key on an operation that requires it → 400; key reused with a different payload → 422; original still in flight → 409 Conflict. The listed implementers include Stripe, Adyen, PayPal, **RazorPay**, Square and Google Standard Payments. — [IETF datatracker](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- Adyen: `idempotency-key` header, max 64 chars, scoped to the company account, valid **7–14 days**, not checked across regional endpoints. A duplicate sent while the original is in progress gets HTTP 422 or 409 with error code 704 "request already processed or in progress". If the idempotency store is unavailable the response is 503 / code 703, marked with `transient-error: true`. Retry only when `transient-error` is true. — [Adyen: API idempotency](https://docs.adyen.com/development-resources/api-idempotency)
- PayPal: the `PayPal-Request-Id` header (≤38 chars, UUID recommended) is unique per request _and per API call type_. A reused id returns the **latest status** of the earlier request, not the original response. Omitting the header lets PayPal duplicate the request. Of two simultaneous requests with the same id, PayPal processes the first and may fail the second. The retention period varies by API and is not stated on the general page. — [PayPal: Idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)

### Inferences

- The behaviours a Razorpay-facing NestJS service should copy are: (a) replay the stored response on retries; (b) reject a key reused with a different body, using 422 per IETF or 409/400 in Stripe's style; (c) return 409 for in-flight duplicates and never cache that 409; (d) do not record a key for requests that fail validation before execution; (e) retain keys at least 24h. Use 72h if you also run a completer.
- Stripe caches 500s; Brandur's sample marks foreign-API errors as a final 503. Both choices treat an indeterminate outcome as terminal for that key. For Razorpay, where order creation has no header-based idempotency key, the safer move is to leave the key in a retryable recovery point. The next attempt then _queries_ Razorpay (fetch order by your receipt or id) before creating anything, as Orpheus's "query status first on retry" does (§2).
- Sample NestJS/Postgres adaptation (hypothetical, derived from Brandur's design): `idempotency_keys(user_id, key, request_hash, request_path, locked_at, recovery_point, response_code, response_body, created_at)`, `UNIQUE(user_id, key)`, with recovery points `started → local_order_created → rzp_order_created → finished`. Signature verification and webhook capture then run as separate idempotent paths keyed on `razorpay_payment_id` (see §5).

### Gaps

- Stripe does not publicly document its own lease or lock timeout for in-flight keys, or how long a 409 window can last.
- Brandur's article does not give a value for `IDEMPOTENCY_KEY_LOCK_TIMEOUT` in the text. It is in the companion repo, which I did not read.

---

## 2. Airbnb's Orpheus idempotency library

### Takeaway

Orpheus (Airbnb, Apr 2019) splits every payment API call into Pre-RPC (DB only), RPC (network only) and Post-RPC (DB only) phases. Each DB phase is a single transaction. Errors are classified as retryable (5xx/transient) or non-retryable (4xx/validation). Each request holds a row-lock **lease** with an expiry longer than the RPC timeout. Responses are recorded only at deterministic end states. Idempotency data is always read from the **master** DB, because replica lag caused real duplicate payments.

### Cited Findings

- Airbnb uses **write repair**: every client write retry tries to repair inconsistent state, so clients can "repeatedly fire the same request". The goal is to move money "at most once". — [Airbnb: Avoiding double payments in a distributed payments system](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb) (Jon Chew and Ninad Khisti, Apr 16 2019)
- Orpheus was built as a library rather than a service, for low latency. A separate idempotency service "would suffer from the same problems it was originally intended to solve." — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Phases: **Pre-RPC** records the payment request details in the DB. **RPC** makes the live call to the external service, and on a retry it may first "query service for the status of a transaction". **Post-RPC** records the response, including whether a failure is retryable. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Ground rules: "No service interaction over networks in Pre and Post-RPC phases" and "No database interactions in the RPC phases". Network calls inside DB transactions led to "rapid connection pool exhaustion and performance degradation". The Pre and Post phases are each a single DB transaction that combines the library's and the application's writes, passed in as Java lambdas. Transactions are not nested. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Error classification: 5xx-style network and infra exceptions are retryable. Validation and invalid-state errors (e.g. "you can't refund a refund") are non-retryable, and the default is non-retryable. Misclassifying either way is dangerous. Marking a transient error non-retryable fails the request forever. Marking a non-retryable error retryable can cause double payments. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Request payloads must never change between retries. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Client duties: send a unique key per new request and reuse it on retries; **persist the key to the DB before calling the service**; nullify it after consuming a success; never mutate the payload; retry with exponential backoff and jitter. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Key choice: **request-level** keys are random UUIDs, which allow several distinct payments per booking (e.g. Pay Less Upfront). **Entity-level** keys are deterministic, e.g. `payment-1234-refund`, which ensures a payment is refunded only once. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Lease: each request takes a DB row-level lock on the idempotency key, which acts as a lease with an expiry. A retry can proceed only _after_ the lease expires. "A good rule of thumb is to have a higher lease expiration than the RPC timeout." Orpheus also enforces a maximum retryable window per key to stop rogue retries. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Responses are recorded only at deterministic end states (success or non-retryable error). The table grows with throughput, deleting rows too early is risky, and response schemas must stay backward compatible. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Read from master: with replica lag, a retry can miss the recorded response and charge again. Airbnb diagrams exactly this duplicate-payment case. Orpheus reads and writes idempotency data on the sharded master and shards by idempotency key. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Reported outcome: "five nines in consistency" while payment volume doubled. Open issues the authors listed include request-payload matching on retries and restricting DB access during RPC phases. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)

### Inferences

- For NestJS: do not hold a Prisma/TypeORM transaction open across `razorpay.orders.create()`. Commit the "intent" row first (Pre-RPC), call Razorpay with no transaction open (RPC), then write the result in a new transaction (Post-RPC). This is the same as Brandur's atomic phases.
- If the deployment uses read replicas, route idempotency and payment-state reads to the primary.
- Set lease expiry above the Razorpay HTTP client timeout. For example, with a 15s SDK timeout use a lease of 30–60s.

### Gaps

- The Airbnb post's code samples were images or embeds and were not captured as text. The exact table schema of Orpheus is not public.

---

## 3. Where duplicate payments come from, and the standard mitigation for each

### Takeaway

Duplicates come from three places: (1) the same intent submitted twice (taps, retries, refresh, multiple devices); (2) new keys or new PSP orders minted for the same intent; (3) asynchronous paths delivering success more than once (webhooks, callbacks, late authorisations, UPI flows). Fix (1) with a stable idempotency key and a unique constraint. Fix (2) by making the cart or checkout the entity-level key and reusing an open PSP order. Fix (3) with unique constraints on PSP ids and event ids, plus refunding (or relying on the PSP to auto-refund) any surplus captured payment.

### Cited Findings

- Double click or double tap: Airbnb names "a user clicking 'Book' twice" and "multiple user-clicks" as race sources, mitigated by a lease on the idempotency key. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb). For web forms, render a hidden idempotency key so that double submits share it. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Mobile retry after timeout or lost response: the client keeps retrying with _the same_ key, and the server replays or resumes. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys); [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Client generating a new key per retry: "A new key can start a second operation." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level). The mitigation is to persist the key before the call and reuse it across process restarts. — [Stripe](https://docs.stripe.com/error-low-level); [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Server crashes or times out mid-PSP call: pass the PSP a stable key derived from your own row (Brandur uses `rocket-rides-atomic-<key.id>`) so the server's retry is deduplicated by the PSP. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Replica lag making a retry look new: read idempotency state from the primary. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Webhook redelivery: Razorpay uses at-least-once delivery. If your server accepts an event but does not respond within 5 seconds, it "is marked timeout ... and is sent again". Use the `x-razorpay-event-id` header ("unique per event") to deduplicate. — [Razorpay: Webhook best practices](https://razorpay.com/docs/webhooks/best-practices) **[US mirror]**. The header value "stays the same across the original delivery and" replays. — [Razorpay: Replay webhook events](https://razorpay.com/docs/webhooks/replay-events) _(search excerpt only)_
- Webhooks arriving out of order: "you may not always receive the webhooks in order." — [Razorpay: Webhook best practices](https://razorpay.com/docs/webhooks/best-practices) **[US mirror]**
- Second payment on the same order after the order is `paid` (late authorisation, or a parallel attempt): "If another payment attempt that started before the order moved to `paid` is authorised later, for example, a late authorised payment, that payment is auto-refunded." — [Razorpay: Orders](https://razorpay.com/docs/payments/orders/). Razorpay's auto-refund list includes "Duplicate payment on a paid order", refunded **immediately**. — [Razorpay: Auto-refunds](https://razorpay.com/docs/payments/refunds/auto-refunds)
- Late authorisation (network or bank interruptions) affects "less than 0.5% of the total payments". Late-authorised payments that are not captured are auto-refunded within 3 days. — [Razorpay: Handle late authorised payments](https://razorpay.com/docs/payments/payments/late-authorisation/handle) **[US mirror]**; [Razorpay: Late authorisation](https://razorpay.com/docs/payments/payments/late-authorisation)
- UPI intent: "If the Order is not marked `paid` within 2-3 minutes, then you can re-initiate payment for the same [order]", and Razorpay suggests polling Fetch Payments for the order or subscribing to webhooks. — [Razorpay: UPI Intent (S2S)](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/intent). Re-initiating while the first UPI attempt is still pending creates a window for two authorisations on one order. Razorpay's paid-order auto-refund (above) covers the second only _after_ the order is paid.
- UPI Collect is being deprecated by NPCI from 28 Feb 2026, with exemptions (certain MCCs, iOS and mobile web, mandates, eRupi, PACB). This shrinks the collect-plus-intent double-completion scenario. — [Razorpay: UPI Collect (S2S JSON v2)](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/upi/collect) _(via search summary; not read in full)_
- UPI QR: only the first successful payment against a QR code is honoured. Later payments are returned in 3–5 business days. — [Razorpay: UPI QR FAQs](https://razorpay.com/docs/payments/payment-methods/upi-qr/faqs) _(via search summary)_
- Forged success callback: Razorpay warns that skipping server-side signature verification "means anyone can fake a successful payment by sending a POST request to your callback." — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create)
- Payments without an order: Razorpay says such payments "cannot be captured and will be automatically refunded" and recommends creating an order for every payment. — [Razorpay: Standard integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)

### Inferences

Each source with its mitigation (layers 1–3 are independent; use all of them):

| Source                                                      | Mitigation                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double tap / double submit                                  | Disable the button; a stable client key; server lease returns 409 for in-flight requests                                                                                                  |
| App retry after timeout                                     | Same key persisted on the device; server replays the stored response                                                                                                                      |
| Browser back or refresh                                     | Key in the page or form state; the server returns the existing checkout or Razorpay order for that cart version                                                                           |
| Two devices or tabs on the same cart                        | Entity-level key (cart id + cart version) plus a DB partial unique index on "one open payment attempt per cart"                                                                           |
| Client mints a new key per retry                            | Server-side dedupe by cart or checkout entity, not only by request key                                                                                                                    |
| Server retry to PSP                                         | Phase split (no DB transaction across the call); on retry, fetch by receipt or order id before creating                                                                                   |
| User pays on two separate Razorpay orders for the same cart | Reuse the open Razorpay order for an unchanged cart; on a second capture, auto-refund the surplus in your code, because Razorpay's auto-refund only covers duplicates on the _same_ order |
| Late auth or a second attempt on the same order             | Razorpay auto-refunds; your webhook handler must not fulfil twice (unique `razorpay_payment_id`; order-state check)                                                                       |
| Webhook redelivery or replay                                | Unique `event_id` table; `ON CONFLICT DO NOTHING`; handler is idempotent on payment id                                                                                                    |
| Callback plus webhook both reporting success                | Both paths converge on one `UPDATE ... WHERE status <> 'paid'` and a unique payment id                                                                                                    |

### Gaps

- I found no Razorpay doc on what happens when two _different_ Razorpay orders created for the same merchant cart are both paid. Razorpay has no way to know they are the same purchase, so the merchant must detect and refund. This is an inference, not a documented statement.
- I found no Razorpay doc describing an intent and a collect payment completing concurrently on one order.

---

## 4. Razorpay specifics: idempotency, `receipt`, multiple payments per order, auto-refund, signature flow

### Takeaway

Razorpay **Orders** has no `Idempotency-Key` header. The current docs say `receipt` "has to be unique" and is "treated as an idempotency key". A second create with the same receipt is _rejected_ with HTTP 400 "Duplicate request" instead of returning the original order, so the client must fetch and reuse the existing order. An order allows one successful (captured) payment unless `partial_payment` is enabled. Payments authorised on an already-`paid` order are auto-refunded immediately. The trust boundary is server-side HMAC-SHA256 verification of `order_id|razorpay_payment_id`, plus webhooks for automation.

### Cited Findings

**Idempotency support**

- `receipt`: "Receipt number that corresponds to this order, set for your internal reference. Can have a maximum length of 40 characters and has to be unique." — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create) (India page, fetched 2026-11-03)
- Error: "Duplicate request. This request has already been processed." (HTTP 400) — "An order with the same `receipt` value has already been created on this account. `receipt` is treated as an idempotency key, so a second create call with the same value is rejected. **Solution:** Use a unique value for `receipt` on every order, or fetch the existing order created with the same receipt and reuse it." — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create)
- Concurrency error: "Request failed because another order operation is in progress." (HTTP 400) — "A concurrent create or update is already running against this order. Razorpay locks the order to prevent state corruption. **Solution:** Wait a few seconds and retry ... fetch the order to confirm its current state before retrying." — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create)
- Receipt constraints: ≤40 chars; ASCII only (non-ASCII and emoji fail with `BAD_REQUEST_ENCODING_VALIDATION_FAILED`). Razorpay recommends alphanumerics, `_` and `-`. — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create)
- Header-based idempotency does exist on _other_ Razorpay products: RazorpayX Payouts use `X-Payout-Idempotency`. — [Razorpay: Make a Request Idempotent (Payouts)](https://razorpay.com/docs/us/api/x/payout-idempotency/make-request) **[US mirror; search excerpt]**. Route has a "Create a Direct Transfer (Idempotent Request)" endpoint. — [Razorpay API nav, Create an Order page](https://razorpay.com/docs/api/orders/create)
- Razorpay's own blog (late Oct 2026) says it "supports idempotent retries for specific API operations" and points to `x-razorpay-event-id` for webhooks. — [Razorpay blog: Payment Gateway Webhooks](https://razorpay.com/blog/payment-gateway-webhooks-india/) _(search excerpt)_

**Multiple payments per order and order states**

- Orders' stated advantage: "Single successful payment bound to an order. Prevents multiple payments." and "Combines multiple payment attempts for a single order." — [Razorpay: Orders](https://razorpay.com/docs/payments/orders/)
- States: `created` → `attempted` (first payment attempt; stays here until a payment is captured) → `paid` (after capture). "No further payment requests are allowed once the order moves to the `paid` state." The order stays `paid` even if the payment is refunded. A late-authorised earlier attempt is auto-refunded. — [Razorpay: Orders](https://razorpay.com/docs/payments/orders/)
- "If an order is in an `attempted` state with the associated payment id in the `authorised` state, initiating another payment using the same order id is not allowed." — [Razorpay: Orders](https://razorpay.com/docs/payments/orders/)
- `attempts` field: "The number of payment attempts, successful and failed, that have been made against this order." — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create)
- **Conflicting guidance on reusing an order after a failure.** The Create Order page says: "A Razorpay Order ID maps 1:1 to a payment attempt. If a customer's payment fails and they try again, you must create a new Order on your server ... Reusing the previous order ID will cause an error." — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create). This contradicts the Orders overview ("Combines multiple payment attempts for a single order") — [Razorpay: Orders](https://razorpay.com/docs/payments/orders/) — and UPI Intent ("re-initiate payment for the same [order]") — [Razorpay: UPI Intent](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/intent). The standard integration steps describe Checkout's built-in `retry` option, which retries within the same Checkout session. — [Razorpay: Standard integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- Partial payments: `partial_payment` (default `false`) lets an order accept several payments. `first_payment_min_amount` (only valid when `partial_payment: true`, in subunits, ≥0 and ≤amount) sets the minimum first instalment. The order tracks `amount_paid` and `amount_due`. — [Razorpay: Create an Order](https://razorpay.com/docs/api/orders/create) (error table and Go sample); partial-payment description via search results of [Razorpay integration docs](https://razorpay.com/docs/payments/server-integration/php/integration-steps/)

**Auto-refund and capture**

- Auto-refund applies only to `authorized` (uncaptured) payments. Triggers: late authorisation after the capture timeout; a duplicate payment on a `paid` order (refunded **immediately**); not captured within the capture timeout (default 3 days); and others. Auto-refunded payments always have `captured: false`. They emit refund webhooks (check `payload.payment.entity.captured`), are excluded from settlement, carry no fee, and use normal refund speed. — [Razorpay: Auto-refunds](https://razorpay.com/docs/payments/refunds/auto-refunds)
- Capture settings: auto-capture all payments, or auto-capture with a custom timeout (minimum 12 minutes, maximum and default 3 days). Payments authorised after the timeout are auto-refunded. Capture values passed in the Orders API override the Dashboard settings. — [Razorpay: Capture settings](https://razorpay.com/docs/payments/payments/capture-settings) **[US mirror]**; [Razorpay: Handle late authorised payments](https://razorpay.com/docs/payments/payments/late-authorisation/handle) **[US mirror]**
- Payment lifecycle: `authorized` (money debited and held, auto-refunded if not captured within 3 days) → `captured` (settled per schedule) → `refunded`. — [Razorpay: About payments](https://razorpay.com/docs/us/payments/payments) **[US mirror]**

**Signature verification flow**

- On success, Checkout's handler receives `razorpay_payment_id`, `razorpay_order_id` and `razorpay_signature`. — [Razorpay: Standard integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- Verify server-side with `generated_signature = hmac_sha256(order_id + "|" + razorpay_payment_id, key_secret)`, using the **order_id stored on your server**, not the one echoed back by the client. On a mismatch, reject and do not retry. — [Razorpay: Standard integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- "Rely on webhooks for all automation". If a user-facing flow needs status immediately and the webhook has not arrived, fetch the payment or order via the API. — [Razorpay: Standard integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- Webhook delivery: any non-2xx counts as a failure. Retries use exponential backoff for 24h after the event is created, and the webhook is then **disabled** with an email alert. Respond within 5s. — [Razorpay: Webhook best practices](https://razorpay.com/docs/webhooks/best-practices) **[US mirror]**

### Inferences

- Receipt as a natural idempotency key: set `receipt = <checkout_attempt_id>`, a short ASCII id such as a base32 ULID (≤40 chars). On a timeout or a 400 "Duplicate request", fetch the existing order and reuse it. Never mint a new receipt for the same attempt.
- Because Razorpay _rejects_ a duplicate receipt instead of replaying the order, store the `razorpay_order_id` locally right after creation in a Post-RPC transaction. Then a retry that already has the id never calls create again.
- Given the conflicting "1 order = 1 attempt" guidance, the conservative design is: reuse the order for Checkout's own in-session retries and UPI re-initiation, but create a new order (new receipt) when the user starts a _new_ checkout attempt after a definitive failure. Then guard against both orders being paid with a cart-level surplus-refund check.
- Treat the `order.paid` / `payment.captured` webhook (verified signature, deduplicated by event id) as the source of truth for fulfilment. Treat the client handler plus signature check as a fast-path UX hint. Both must call the same idempotent `markPaid(razorpay_payment_id)`.

### Gaps

- **Receipt uniqueness is not verified empirically.** Through roughly 2023, community reports and older docs described `receipt` as a free-form, non-enforced reference. The "Duplicate request ... receipt is treated as an idempotency key" text appears in the current (Mintlify-era) docs. Confirm in test mode whether it is enforced account-wide, for how long, and whether it applies to Indian live accounts.
- Not verified: whether the Fetch Orders API supports a `receipt` filter, which the docs' "fetch the existing order created with the same receipt" implies.
- The exact Razorpay webhook retry intervals were not given beyond "exponential backoff for 24 hours".
- I could not resolve the 1:1 order-to-attempt conflict from the docs. Ask Razorpay support or test it.

---

## 5. Database-level techniques in PostgreSQL

### Takeaway

Use unique constraints as the last line of defence: on `(user_id, idempotency_key)`, on `razorpay_order_id`, on `razorpay_payment_id`, on webhook `event_id`, plus a partial unique index for "one active attempt per cart". Use `INSERT ... ON CONFLICT` to claim a key or event atomically. Use `SELECT ... FOR UPDATE` (or a conditional `UPDATE ... WHERE status=...`) to serialise state transitions on one order row. Use transaction-level advisory locks for cross-row critical sections. Use SERIALIZABLE only with a generic 40001 retry loop.

### Cited Findings

- Unique constraints as arbiters: in Brandur's design a `UNIQUE` index means only one of two concurrent key inserts succeeds and the other gets 409. `stripe_charge_id` is `UNIQUE`, and so is `(user_id, idempotency_key_id)` on rides. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- DDIA (Kleppmann) end-to-end argument: TCP, DB transactions and stream processors cannot by themselves rule out duplicates. Pass a client-generated request ID through every layer to get end-to-end duplicate suppression, for example via a uniqueness constraint on an operation-id column. — Secondary summaries: [DDIA wiki: End-to-End Argument](https://stevesuave.github.io/ddia-wiki-quartz/end-to-end-argument); [Allegro Tech: Transactions Aren't Enough (Dec 2025)](https://blog.allegro.tech/2025/12/transactions-arent-enough.html); reader highlights on [Goodreads](https://www.goodreads.com/notes/34626431-designing-data-intensive-applications/93149231-chena-lee?page=27) _(book text not accessed directly; 2017 edition)_
- `ON CONFLICT DO UPDATE` "guarantees an atomic INSERT or UPDATE outcome; provided there is no independent error, one of those two outcomes is guaranteed, even under high concurrency." `DO NOTHING` "simply avoids inserting a row". `RETURNING` returns only rows that were actually inserted or updated, so a skipped row returns nothing. Caveat: during `CREATE/REINDEX INDEX CONCURRENTLY` on the unique index, `ON CONFLICT` may raise a unique violation anyway. — [PostgreSQL: INSERT](https://www.postgresql.org/docs/current/sql-insert.html)
- `SELECT ... FOR UPDATE` blocks other `UPDATE`/`DELETE`/`FOR UPDATE`/`FOR SHARE` on those rows until the transaction ends. A waiting `FOR UPDATE` then returns the _updated_ row (or no row if it was deleted). Under REPEATABLE READ or SERIALIZABLE it errors if the row changed after the transaction started. Row locks block only writers and lockers, not plain reads. — [PostgreSQL: Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- Advisory locks have application-defined meaning and are not enforced by the system. Session-level locks ignore transaction semantics and survive a rollback. Transaction-level locks (`pg_advisory_xact_lock`) release at commit or rollback. They share lock memory with regular locks. Taking locks in inconsistent order causes deadlocks. — [PostgreSQL: Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- Read Committed: a second concurrent `UPDATE` re-evaluates its `WHERE` clause against the committed new row version and proceeds only if it still matches. This makes `UPDATE orders SET status='paid' WHERE id=$1 AND status<>'paid'` a safe compare-and-set. — [PostgreSQL: Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Repeatable Read fails with "could not serialize access due to concurrent update". Serializable emulates serial execution, but applications "must be prepared to retry transactions due to serialization failures" (SQLSTATE 40001) and need "a generalized way of handling" them. — [PostgreSQL: Transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Brandur runs each atomic phase as SERIALIZABLE and maps a serialization failure to 409, noting that an immediate retry would often succeed. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys)
- Orpheus uses a DB row-level lock on the key as a lease. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)

### Inferences

Proposed schema sketch (synthesis, not from any one source):

```sql
-- request-level idempotency (Brandur-style)
CREATE TABLE idempotency_keys (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, key TEXT NOT NULL CHECK (char_length(key) <= 100),
  request_path TEXT NOT NULL, request_hash TEXT NOT NULL,          -- fingerprint for mismatch → 422
  locked_at TIMESTAMPTZ, recovery_point TEXT NOT NULL DEFAULT 'started',
  response_code INT, response_body JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key));

-- one row per Razorpay order (= checkout attempt)
CREATE TABLE payment_attempts (
  id UUID PRIMARY KEY, cart_id UUID NOT NULL, cart_version INT NOT NULL, amount_paise BIGINT NOT NULL,
  receipt TEXT NOT NULL UNIQUE,                 -- sent to Razorpay
  razorpay_order_id TEXT UNIQUE,                -- NULL until Post-RPC
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','expired','superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX one_open_attempt_per_cart ON payment_attempts(cart_id) WHERE status = 'pending';
CREATE UNIQUE INDEX one_paid_attempt_per_cart ON payment_attempts(cart_id) WHERE status = 'paid';

-- every Razorpay payment ever seen (captured or not)
CREATE TABLE razorpay_payments (
  razorpay_payment_id TEXT PRIMARY KEY, razorpay_order_id TEXT NOT NULL, status TEXT NOT NULL,
  amount_paise BIGINT NOT NULL, captured BOOLEAN NOT NULL, surplus_refund_id TEXT, raw JSONB NOT NULL);

-- webhook inbox
CREATE TABLE webhook_events (event_id TEXT PRIMARY KEY, event_type TEXT, received_at TIMESTAMPTZ DEFAULT now(), payload JSONB, processed_at TIMESTAMPTZ);
```

- Webhook handler: `INSERT INTO webhook_events ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id`. If no row comes back, it is a duplicate; return 200 at once. Respond 2xx within 5s and do heavy work async from the inbox.
- `markPaid`: in one transaction, upsert `razorpay_payments` on the PK. Then `UPDATE payment_attempts SET status='paid' WHERE razorpay_order_id=$1 AND status<>'paid'`. If a row was updated, fulfil (stage a job). If `one_paid_attempt_per_cart` raises a unique violation, a _different_ order for the same cart is already paid: record this payment as surplus and stage a refund job. The refund job should use an entity-level deterministic key, e.g. `surplus-refund-<payment_id>`, à la Airbnb.
- Prefer conditional UPDATE or `FOR UPDATE` at Read Committed for the hot path. Use `pg_advisory_xact_lock(hashtext(cart_id))` only when a critical section spans rows not yet created, e.g. "create the attempt if none is open". Reserve SERIALIZABLE for the idempotency-key phase, with a 40001 retry wrapper.
- Optimistic concurrency (a `version` column with `WHERE version=$n`) is the ORM-friendly equivalent of a conditional UPDATE. TypeORM's `@VersionColumn` and Prisma's `updateMany` with a version filter both fit. I did not research ORM specifics in depth.

### Gaps

- I did not find authoritative benchmarks comparing advisory locks, `FOR UPDATE` and SERIALIZABLE under payment-like contention.
- I did not access Kleppmann's DDIA text directly (only secondary summaries). The 2nd edition (2025/2026) may word this differently.

---

## 6. Client-side practices: key per attempt vs per cart, button disabling, persisting across restarts

### Takeaway

Generate the key once per **checkout attempt** (cart id + cart version, or a UUID minted when the user taps Pay), persist it _before_ the first network call, reuse it for every retry including after an app restart, and clear it only after a definitive response. Disable the Pay button while in flight. Treat the button as UX only: the server still enforces a lease and constraints. Use a new key only once the previous attempt is known to have failed definitively, or the cart changed.

### Cited Findings

- Stripe lists two key strategies: random (UUID v4) or "derive the key from a user-attached object, like the ID of a shopping cart ... protect against double submissions". "If your application retries across separate SDK calls or process restarts, generate and persist a key for the operation and supply it to every attempt." — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Change parameters (e.g. the cart changed) only with a new key, and only after confirming the original did not succeed and is not executing. Otherwise reconcile first. — [Stripe: Advanced error handling](https://docs.stripe.com/error-low-level)
- Airbnb client duties: unique key per new request, the same key for retries, persist the key before calling, nullify it after a consumed success, never mutate the payload, backoff with jitter. Request-level (UUID) versus entity-level (deterministic) key trade-off. — [Airbnb](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- Hidden form-field key so double submissions share it. — [brandur.org/idempotency-keys](https://brandur.org/idempotency-keys). DDIA similarly suggests a UUID hidden field or a hash of the relevant form fields as the request ID. — [Goodreads DDIA highlights](https://www.goodreads.com/notes/34626431-designing-data-intensive-applications/93149231-chena-lee?page=27) _(secondary)_
- Backoff 2^n with jitter to avoid a thundering herd. — [Stripe blog](https://stripe.com/blog/idempotency)
- IETF: uniqueness "MUST be defined by the resource owner and MUST be implemented by the clients". Never reuse a key with a different payload. — [IETF draft-08](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- Keys should not contain sensitive data (emails, personal identifiers). — [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Razorpay Checkout `retry` option: Web Integration does not support `max_count`. — [Razorpay: Standard integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)

### Inferences

- **Per cart vs per attempt:** a pure per-cart key blocks legitimate re-payment after a definitive failure, and if the cart changes the request body changes too, which triggers a mismatch error. A per-attempt key (cart id + `cart_version` + attempt counter, or a UUID stored with the attempt) is the sensible middle ground. The server's partial unique index `one_open_attempt_per_cart` gives cart-level protection even if a buggy client mints new keys.
- **Mobile (Flutter or React Native):** write `{attemptKey, cartVersion, razorpayOrderId?}` to secure or persistent storage before calling `POST /checkout`. On cold start, if an unfinished attempt exists, call `GET /checkout/:attemptKey/status` (backed by a Razorpay fetch) before showing Pay again. This covers "app killed during UPI intent" scenarios.
- **Web:** keep the key in the page state or hidden field and in `sessionStorage`. That way Back or Refresh reuses it, while a new tab on the same cart is caught server-side by the cart-level index.
- Disabling the button stops only the cheapest duplicates. Two devices, refresh and app restarts all bypass it, so server-side enforcement is mandatory.

### Gaps

- I found no Razorpay-published client guidance on idempotency keys for Checkout or the mobile SDKs specifically.
- I found no authoritative source on recommended key storage for React Native or Flutter (e.g. Keychain vs AsyncStorage) in a payment context.
