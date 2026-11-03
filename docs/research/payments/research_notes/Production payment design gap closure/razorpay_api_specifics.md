# Razorpay API specifics: closing the open questions from the payment-design research

Research date: 2026-11-03. Primary sources are the India `.md` versions of Razorpay docs (`razorpay.com/docs/...md`), plus the razorpay-node SDK type definitions on GitHub (`lib/types/*.d.ts`, master branch) and razorpay.com/pricing (served in INR, India market). Only WebSearch and WebFetch were used. Points that came only from search-result summaries are labelled "(search summary)". The user has no Razorpay account yet. Anything only a live call can settle is written as a **test-mode check**.

---

## 1. Per-order capture settings (Orders API `payment` object)

### Takeaway

You can set capture behaviour per order with an optional `payment` object on `POST /v1/orders`. It holds `capture` (`automatic`|`manual`) and `capture_options` (`automatic_expiry_period`, `manual_expiry_period`, `refund_speed`). Both expiry periods are in **minutes**. Auto-capture has a minimum of 12. Manual capture must be ≥ the auto period, with a maximum and default of **7200 minutes (5 days)**. That ceiling conflicts with the "3 days" stated elsewhere. The docs mention no enablement step; the page says only "Available in India". The main Create Order reference page does not list this object at all.

### Cited Findings

- The `payment` object is optional. Its options "override account-level auto-capture settings set on the Dashboard". The page shows only "Available in 🇮🇳 India" and gives no enablement or contact-support step. — [Razorpay: Configure Payment Capture Settings using Orders API](https://razorpay.com/docs/payments/payments/capture-settings/api.md)
- Fields — [Capture settings via Orders API](https://razorpay.com/docs/payments/payments/capture-settings/api.md):
  - `payment.capture`: mandatory string, `automatic` or `manual`. With `manual`, you capture through the Capture API or the Dashboard.
  - `payment.capture_options.automatic_expiry_period`: integer, **minutes**, minimum 12. Mandatory only when `capture=automatic`. Authorized payments are auto-captured inside this window.
  - `payment.capture_options.manual_expiry_period`: integer, minutes. Must be ≥ `automatic_expiry_period`. **Max 7200, default 7200.** Payments still `authorized` after this period are auto-refunded.
  - `payment.capture_options.refund_speed`: the table lists only `normal`, but the example request uses `optimum`. The table marks the field "mandatory", yet the text says the Dashboard default applies when it is omitted.
- Example request from the page: `{"amount":50000,"currency":"INR","receipt":"rcptid_11","payment":{"capture":"automatic","capture_options":{"automatic_expiry_period":12,"manual_expiry_period":7200,"refund_speed":"optimum"}}}`. The response is a normal order (`status:"created"`, `attempts:0`). — [Capture settings via Orders API](https://razorpay.com/docs/payments/payments/capture-settings/api.md)
- The SDK types match:
  - `payment?: RazorpayCapturePayment`: "Payment capture settings for the payment. The options sent here override the account".
  - `capture: 'automatic' | 'manual'`.
  - `automatic_expiry_period: number`: "Time in minutes till when payments in the `authorized` state should be auto-captured. Minimum value `12` minutes … mandatory only if … `capture` is `automatic`".
  - `manual_expiry_period: number`: "Time in minutes till when you can manually capture payments in the `authorized` state".
  - `refund_speed: 'optimum' | 'normal'`: "Refund speed for payments that were not captured".
  - Source: [razorpay-node `lib/types/orders.d.ts`](https://raw.githubusercontent.com/razorpay/razorpay-node/master/lib/types/orders.d.ts)
- The main Create Order reference does **not** document `payment`, `capture_options`, or the expiry fields. — [Razorpay API: Create an Order](https://razorpay.com/docs/api/orders/create.md)
- The capture-settings overview says: "Capture values passed in the Orders API take precedence over the Payment Capture settings configured on the Dashboard", and the settings "are applicable only for payments created using the Orders API". — [Razorpay: Capture Settings](https://razorpay.com/docs/payments/payments/capture-settings.md)
- **Conflict:** the 7200-minute (5-day) manual maximum and default contradicts the Dashboard capture-settings docs, which give "maximum and default 3 days" (see prior notes, [Capture Settings](https://razorpay.com/docs/payments/payments/capture-settings)) and the "auto-refunded if not captured within 3 days" rule on [About Payments](https://razorpay.com/docs/payments/payments/). It may be a stale page, since older Razorpay material used 5 days.

### Inferences

- To align capture with a reservation TTL of X minutes (X ≥ 12): send `capture:"automatic"`, `automatic_expiry_period:X`, `manual_expiry_period:X` (equal is allowed). Any authorization arriving after X then stays uncaptured and Razorpay auto-refunds it.
- Do not rely on `manual_expiry_period > 4320` (3 days) until it has been tested.

### Gaps

- **Test-mode checks:**
  - (a) A create with the `payment` object succeeds on a fresh standard account without support enabling anything.
  - (b) `manual_expiry_period` values above 4320 are accepted.
  - (c) `refund_speed:"optimum"` is accepted.
  - (d) The order or payment entity echoes these settings back (the sample response does not show them).
- No error table exists for these fields.

---

## 2. Capture API: re-capture, idempotency, amount rule

### Takeaway

Capture is **not** idempotent in the Stripe sense. A second capture on an already-captured payment returns HTTP 400 ("This payment has already been captured" / "The payment has already been either captured or voided"), not a success replay. `amount` is required and must **equal the authorized amount**. In practice: on a capture timeout, fetch the payment, and treat `status=captured` or a 400 "already captured" as success.

### Cited Findings

- `amount` (required integer, smallest unit): "The amount to be captured (should be equal to the order amount…)". `currency` is required. — [Razorpay API: Capture a Payment](https://razorpay.com/docs/api/payments/capture.md)
- Errors (400) — [Capture a Payment](https://razorpay.com/docs/api/payments/capture.md):
  - "Capture amount must be equal to the amount authorized."
  - "Payment is not in authorized state." Capture applies only to `authorized` payments.
  - Already captured: message "Your payment has been declined as the order is already paid. Please initiate the payment with a new order.", description "This payment has already been captured."
  - "The payment has already been either captured or voided."
  - "Payment already done for this order."
  - "Payment amount is greater than the amount due for order."
  - "Request failed because another payment operation is in progress." The advice is to wait a few seconds and fetch the payment before retrying.
- The Capture page says nothing about idempotency. Its advice is to check payment status before retrying. — [Capture a Payment](https://razorpay.com/docs/api/payments/capture.md)
- The response `fee` is "Fee, including GST, charged by Razorpay" and `tax` is "GST charged for the payment". — [Capture a Payment](https://razorpay.com/docs/api/payments/capture.md)

### Inferences

- Retry rule for the worker:
  - On timeout or 5xx, `GET /v1/payments/:id`.
  - If `captured`, done.
  - If `authorized`, retry the capture.
  - On a 400 "already captured", mark captured.
  - On "another payment operation is in progress", back off and fetch.
- Capture one exact amount (the stored order amount). Partial capture is not available on this endpoint.

### Gaps

- **Test-mode check:** the exact `error.code` and `error.reason` strings for a second capture, so the worker can match on code instead of message text. The docs show only descriptions.

---

## 3. Void vs refund for an `authorized` payment

### Takeaway

The docs contradict each other. The Instant Refund page has a "void" error implying that a **full-amount** refund call on an `authorized` payment voids it ("A void can only be performed for the full authorised amount"). The same page and the Normal Refund page also say refunds work only on `captured` payments and list `authorized` as a failure cause. No fee is documented for a void. Auto-refunds of uncaptured payments carry no fee. The safe design does not depend on an API void: let uncaptured payments expire through the capture timeout so Razorpay auto-refunds them.

### Cited Findings

- "Void is not supported for partial refunds." (400): "A partial-amount refund was requested on a payment that is still in the `authorized` state. A void can only be performed for the full authorised amount." Solution: "Either capture the payment first and then issue a partial refund, or void the full authorised amount". — [Razorpay API: Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md)
- On the same page: "The payment status should be captured for action to be taken." (400): "This typically happens because it failed, is still `authorized`, was `cancelled` or has already been fully refunded … Only attempt refunds on payments where `status` is `captured`." — [Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md); repeated on [Create a Normal Refund](https://razorpay.com/docs/api/refunds/create-normal.md), which adds "Refunds can only be initiated against payments that are currently in the `captured` state." The Normal Refund page does not mention void.
- Neither refund page mentions a fee for voids. — [Create an Instant Refund](https://razorpay.com/docs/api/refunds/create-instant.md); [Create a Normal Refund](https://razorpay.com/docs/api/refunds/create-normal.md)
- Auto-refunded (uncaptured) payments are excluded from settlement, and "no processing fee is deducted" for them (search summary of the auto-refunds page). — [Razorpay: Auto-refunds](https://razorpay.com/docs/payments/refunds/auto-refunds.md)
- A Capture-page error mentions payments "either captured or voided", so a voided state exists in some form. — [Capture a Payment](https://razorpay.com/docs/api/payments/capture.md)

### Inferences

- Treat a void through `POST /payments/:id/refund` (no `amount`) as a **possibly unsupported** fast path. The primary path is a short capture timeout, with Razorpay auto-refunding at normal speed.

### Gaps

- **Test-mode check:** call `POST /v1/payments/:id/refund` with no `amount` on an `authorized` test payment. Record whether it returns a refund entity (void) or the "should be captured" 400, what the payment's status becomes, and whether `refund.*` webhooks fire.
- No source states a fee for voids.

---

## 4. `receipt` uniqueness on Orders create, and lookup by receipt

### Takeaway

Current primary sources (the API reference and SDK types) say `receipt` "has to be unique". The Create Order error table says a duplicate is rejected with HTTP 400 "Duplicate request. This request has already been processed", because "`receipt` is treated as an idempotency key". **Lookup by receipt is documented:** `GET /v1/orders?receipt=<value>`. No GitHub issue, Stack Overflow post or community thread confirmed or refuted enforcement in practice.

### Cited Findings

- `receipt`: "Receipt number that corresponds to this order, set for your internal reference. Can have a maximum length of 40 characters and has to be unique." — [Razorpay API: Create an Order](https://razorpay.com/docs/api/orders/create.md)
- Error (400) "Duplicate request. This request has already been processed.": "An order with the same `receipt` value has already been created on this account. `receipt` is treated as an idempotency key, so a second create call with the same value is rejected." — [Create an Order](https://razorpay.com/docs/api/orders/create.md)
- The SDK type doc comment repeats "has to be unique". — [razorpay-node `orders.d.ts`](https://raw.githubusercontent.com/razorpay/razorpay-node/master/lib/types/orders.d.ts)
- Fetch-all query params: `receipt` ("Retrieves the orders that contain the provided value for receipt"), `authorized` (1/0), `from`, `to`, `count` (default 10, max 100), `skip`, `expand[]` (`payments`, `payments.card`, `transfers`, `virtual_account`). — [Razorpay API: Fetch all Orders](https://razorpay.com/docs/api/orders/fetch-all.md); same `receipt` query type in [razorpay-node `orders.d.ts`](https://raw.githubusercontent.com/razorpay/razorpay-node/master/lib/types/orders.d.ts)
- Secondary evidence: a Stack Overflow question (2023 archive) about a Flutter app creating two orders per checkout used a random receipt for each order. It shows receipt uniqueness gives no protection if the client mints a new receipt per call, but it says nothing about server enforcement. — [Stack Overflow (kiwix mirror): two orders being generated instead of one in flutter app](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/74528675/two-orders-being-generated-instead-of-one-in-flutter-app) _(search summary)_
- A third-party diagnosis site describes `DUPLICATE_REQUEST_ERROR` as "a request with identical parameters has already been processed". This is not an official source. — [DrDroid: Razorpay DUPLICATE_REQUEST_ERROR](https://drdroid.io/integration-diagnosis-knowledge/razorpay-duplicate-request-error/) _(search summary)_

### Inferences

- "Contain the provided value" may mean a substring match, not exact match. Always compare `receipt` exactly on the returned items.
- The recovery path `create → 400 duplicate → GET /v1/orders?receipt=X → reuse items[0].id` is documented end to end.

### Gaps

- **Test-mode checks:**
  - (a) A second create with the same receipt returns 400. Record the exact `error.code`, likely `BAD_REQUEST_ERROR`, plus `error.reason`.
  - (b) Whether uniqueness lasts forever or only for a window.
  - (c) Whether `?receipt=` is exact or substring match.
  - (d) Whether live (India) accounts behave like test mode.
- No independent (non-Razorpay) confirmation of enforcement was found.

---

## 5. Reusing an order after a failed payment

### Takeaway

Most sources say the same order **can** take another payment after a _failed_ attempt. Only the Create Order page says otherwise. Evidence for reuse:

- Orders combine multiple attempts.
- `attempts` counts failed ones.
- The order stays `attempted` until a capture.
- Checkout redisplays on failure or timeout for a retry.
- S2S docs say "use the order id … for additional payment attempts … without creating a new one".
- UPI intent docs say "re-initiate payment for the same".

The documented blocks are an order that is `paid`, or an order that is `attempted` with an **`authorized`** payment. The Create Order page's "1:1 … reusing will cause an error" reads as a conservative recommendation that conflicts with the rest. The order status after a failed attempt is `attempted`.

### Cited Findings

- Status after an attempt: the order "moves from `created` to `attempted` state when a payment is first attempted … remains in the `attempted` state till one payment associated with that order is captured". — [Create an Order](https://razorpay.com/docs/api/orders/create.md)
- `attempts`: "The number of payment attempts, successful and failed, that have been made against this order." — [Single Integration API (S2S JSON v2)](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/single-integration-api.md)
- Reuse allowed: "You can use the order id present in the metadata for additional payment attempts on the order without creating a new one." (Payment Create Failure section, followed by a "Retry/Re-Attempt Request" sample.) — [Razorpay: Single Integration API (S2S JSON v2)](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/single-integration-api.md)
- UPI intent: "If the Order is not marked `paid` within 2-3 minutes, then you can re-initiate payment for the same." — [Razorpay: UPI Intent (S2S)](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/intent.md)
- Orders "Combines multiple payment attempts for a single order" and offers a "Single successful payment bound to an order". — [Razorpay: About Orders](https://razorpay.com/docs/payments/orders.md)
- Blocks:
  - "If an order is in the attempted state with the associated payment id in the authorised state … initiating another payment using the same order id is not allowed." — [Razorpay: Orders FAQs](https://razorpay.com/docs/payments/orders/faqs.md)
  - "No further payment requests are allowed once an order is in the paid state." — [Orders FAQs](https://razorpay.com/docs/payments/orders/faqs.md)
- Checkout: "Transaction timeout … times outs between 3 to 15 minutes" and "The customer is redirected to the checkout if a payment fails due to timeout." — [Razorpay: Standard Checkout Troubleshooting & FAQs](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/troubleshooting-faqs.md)
- The contradicting text: "A Razorpay Order ID maps 1:1 to a payment attempt. If a customer's payment fails and they try again, you must create a new Order … Reusing the previous order ID will cause an error." — [Create an Order](https://razorpay.com/docs/api/orders/create.md)
- Third-party guidance (not official) recommends a new order with a new receipt for each retry. — [NamasteDev FAQ: handle failed payments](https://namastedev.com/pages/faq/how-do-i-handle-failed-payments) _(search summary)_

### Inferences

- Design:
  - Reuse the same `order_id` for in-session retries (Checkout's own retry, UPI re-initiate) and for re-tries after a `failed` payment.
  - Never start a new attempt while any payment on the order is `authorized`; let it capture or auto-refund.
  - Create a new order (new receipt) only when the cart or amount changes.
  - Keep the cart-level "one paid attempt" guard for the cross-order case.
- Reusing one order is what makes Razorpay's "single successful payment per order" and its auto-refund of duplicates protect us. That favours reuse wherever the API allows it.

### Gaps

- **Test-mode check:** open Checkout with order X, fail a payment (a test-mode failure card or UPI failure), then open Checkout again with the same order X from a _new_ session. Record whether it succeeds or errors, and the error text.
- No source documents an order expiry or cancel endpoint. Orders appear to stay `created`/`attempted` indefinitely (not confirmed).

---

## 6. Webhooks: retry schedule, settlement events, refund payload

### Takeaway

- The retry schedule is **still unpublished**: only "exponential backoff … for 24 hours", then the webhook is disabled.
- India **does** have a `settlement.processed` webhook. It carries the settlement `id`, `amount`, `fees`, `tax` and `utr`.
- Route sends `transfer.processed`.
- The `refund.*` payloads carry `speed_requested`, `speed_processed`, `receipt`, `batch_id`, `notes`, `status` and `acquirer_data.arn`. The ARN is `null` in every sample, and no `rrn` key appears. The embedded payment entity includes `fee` and `tax`.

### Cited Findings

- Retry policy: retried "at progressive intervals … defined in the exponential backoff policy, for 24 hours". Disabled after 24h of failures. Replays up to 15 days old go through support. No interval table or attempt count is given. — [Razorpay: Webhook FAQs](https://razorpay.com/docs/webhooks/faqs.md) _(search summary; consistent with prior notes)_
- `settlement.processed` is "Available in India, Malaysia, Singapore, and the United States". Payload `payload.settlement.entity`: `id` (e.g. `setl_…`), `amount`, `status: processed`, `fees`, `tax`, `utr`, `created_at`. It fires once Razorpay has transferred funds. `processed` means the transfer has started, and credit can take up to 3 hours (NEFT/RTGS/IMPS). — [Razorpay: Settlements Webhook Events](https://razorpay.com/docs/webhooks/settlements.md)
- Route: "The transfer.processed webhook is sent for every successful transfer." The FAQ mentions no `transfer.failed`. — [Razorpay: Route FAQs](https://razorpay.com/docs/payments/route/faqs.md)
- `refund.created` / `refund.processed` / `refund.failed` / `refund.speed_changed` — [Razorpay: Refunds Webhook Events](https://razorpay.com/docs/webhooks/refunds.md):
  - **Envelope:** `entity`, `account_id`, `event`, `contains: ["refund","payment"]`, `payload`, `created_at`.
  - **Refund entity:** `id` (`rfnd_…`), `amount`, `status` (`processed`, or `failed` in the failed sample), `speed_requested: optimum`, `speed_processed: normal`, `receipt: null`, `batch_id: null`, `notes`, `acquirer_data: {arn: null}`.
  - **Payment entity:** `amount_refunded`, `refund_status: partial`, `fee: 11800`, `tax: 1800`.

### Inferences

- Do not use ARN as a required field at `refund.processed`. Razorpay usually marks the refund processed before the ARN arrives (prior notes). Re-fetch the refund later to fill in ARN or RRN for customer support.
- `settlement.processed` plus `GET /v1/settlements/recon/combined` gives an event-driven trigger for the daily bank-recon leg. Match on `utr`.

### Gaps

- Exact webhook retry intervals and maximum attempts: unpublished. **Test-mode check:** point a webhook at an endpoint that returns 500 and log arrival times.
- No sample refund payload with a populated `rrn` or `arn` was found.
- Whether `settlement.processed` needs separate subscription per account type (for example Route linked accounts) was not found.

---

## 7. Fees and GST in the payment entity

### Takeaway

GST on Razorpay fees is **18%**, charged on the fee and not on the transaction. `fee` on the payment entity **includes** GST and `tax` is the GST portion. In webhook samples, `fee` and `tax` are `null` at `payment.authorized` and populated at `payment.captured`. The exception is the card sample, which still shows `null`, so a consumer must handle `null` at capture time.

### Cited Findings

- "GST (18%) applies on Razorpay's service fee, not on the underlying transaction amount." — [Razorpay Pricing (India)](https://razorpay.com/pricing/)
- Standard plan: 2% for most domestic methods (cards, UPI, netbanking, wallets) and 3% for Amex, Diners, corporate cards and Pay Later. "18% GST applies to the platform fee", giving 2% → 2.36% effective. Article dated 13 Feb 2026. — [Razorpay Blog: Payment Gateway Pricing Explained](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/)
- `fee`: "Fee, including GST, charged by Razorpay"; `tax`: "GST charged for the payment". — [Capture a Payment](https://razorpay.com/docs/api/payments/capture.md)
- Worked check from Razorpay's sample: `fee: 11800`, `tax: 1800` on a ₹5,000 payment. ₹100 base fee (2%) + ₹18 GST (18%) = ₹118. — [Refunds Webhook Events](https://razorpay.com/docs/webhooks/refunds.md)
- Webhook samples — [Razorpay: Payments Webhook Events](https://razorpay.com/docs/webhooks/payments.md):
  - `payment.authorized`: `fee: null, tax: null` for every method.
  - `payment.captured`: `fee: 2, tax: 0` for netbanking, wallet and UPI, but `fee: null, tax: null` for card.
  - `payment.failed`: null.

### Inferences

- Book the fee in the ledger from `payment.captured` when it is present. Otherwise take it from a later Fetch Payment or from the settlement recon `fee`/`tax` columns, which are authoritative. Net base fee = `fee − tax`.

### Gaps

- **Test-mode check:** confirm that `fee` and `tax` are populated in the `payment.captured` webhook and in Fetch Payment for card payments. The card sample showing null may just be a stale example.

---

## 8. Route: transfers on order create, settlement, pricing, reversals

### Takeaway

- **Transfers on order create:** `transfers[]` on `POST /v1/orders` takes `account`, `amount` (paise, ≤ order amount), `currency` (INR only), `notes` (≤15 pairs), `linked_account_notes` (keys shown to the vendor), `on_hold` (bool) and `on_hold_until` (Unix timestamp; omitted means held indefinitely). Transfers come back `status:"created"` and execute on payment, "split instantly upon successful payment".
- **Settlement:** linked accounts inherit the main account's T+N schedule (they cannot be faster). After `on_hold_until` passes, funds settle on the next business day.
- **Reversal:** `POST /v1/transfers/:id/reversals` takes only `amount` (optional; omitted means full) and `notes`. It has no receipt or idempotency key, and it fails with a 400 if the linked account balance is insufficient.
- **Pricing conflicts:** 0.25% + 18% GST in the docs example versus "0.1% + Platform Fees" on the pricing page.

### Cited Findings

- `transfers[]` params, quoted on the create-transfers page:
  - `account`: "Unique identifier of the Linked Account".
  - `amount`: "cannot exceed the order amount".
  - `currency`: INR only.
  - `notes`: "A maximum of 15 key-value pairs, each of 256 characters".
  - `linked_account_notes`: "List of keys from the `notes` object … shown to Linked Accounts … Only the keys will be shown".
  - `on_hold`: boolean.
  - `on_hold_until`: Unix timestamp; "If no value is passed, the settlement is put on hold indefinitely."
  - Source: [Razorpay API: Create Transfers from Orders](https://razorpay.com/docs/api/payments/route/create-transfers-orders.md)
- Example body: `{"amount":2000,"currency":"INR","transfers":[{"account":"acc_IRQWUleX4BqvYn","amount":1000,"currency":"INR","notes":{"branch":"…","name":"…"},"linked_account_notes":["branch"],"on_hold":true,"on_hold_until":1671222870},{"account":"acc_IROu8Nod6PXPtZ","amount":1000,"currency":"INR","notes":{…},"linked_account_notes":["branch"],"on_hold":false}]}`. In the response the transfers have `status:"created"`, `processed_at:null`, and `settlement_status` of pending/on_hold/settled. — [Create Transfers from Orders](https://razorpay.com/docs/api/payments/route/create-transfers-orders.md)
- Errors (400) — [Create Transfers from Orders](https://razorpay.com/docs/api/payments/route/create-transfers-orders.md):
  - "The amount must be at least INR 1.00"
  - "The currency should be INR for transfers"
  - "Keys sent in linked_account_notes must exist in notes"
  - "on_hold_until must be between 946684800 and 4765046400"
  - "Transfer cannot be made due to insufficient balance"
  - "The sum of amount requested for transfer is greater than the captured amount"
  - Transfers are not allowed on `partial_payment` orders or non-INR orders.
- SDK transfer entity — [razorpay-node `lib/types/transfers.d.ts`](https://raw.githubusercontent.com/razorpay/razorpay-node/master/lib/types/transfers.d.ts):
  - `status`: `'created' | 'pending' | 'processed' | 'failed' | 'reversed' | 'partially_reversed'`.
  - `settlement_status`: `'pending' | 'on_hold' | 'settled' | null`.
  - `recipient_settlement_id`, `processed_at`.
  - The edit params are `on_hold` (0/1) and `on_hold_until`.
  - The reversal entity carries `fee` ("Fee (including GST) charged by Razorpay").
- Timing: with an automatic split, "the funds will be split instantly upon successful payment". — [Route FAQs](https://razorpay.com/docs/payments/route/faqs.md)
- Settlement schedule — [Razorpay Route: Schedule Settlements](https://razorpay.com/docs/route/schedule-settlement/):
  - "By default, every new Linked Account is created with the same settlement schedule assigned to your main account".
  - It "can only exceed or be equal to" the main account's schedule.
  - After `on_hold_until`, "Razorpay settles the funds to the Linked Account on the next business day".
  - Account-level schedule changes go through Support.
  - The standard domestic main-account cycle is T+2 working days (prior notes, [About Settlements](https://razorpay.com/docs/payments/settlements/)).
- Reversal API — [Razorpay API: Reverse a Transfer](https://razorpay.com/docs/api/payments/route/reverse-a-transfer.md):
  - Params: `amount` (optional, paise; omitted means the full transfer) and `notes` (≤15 pairs). `receipt` and `linked_account_notes` are not documented.
  - Response: `id`, `entity: reversal`, `transfer_id`, `amount`, `currency`, `created_at`.
  - Errors: "The amount must be at least INR 1.00", "transfer_id is not a valid id", and "The linked account does not have sufficient balance to process reversal." (400).
- Pricing:
  - The docs example uses "Transfer Fees = 0.25%" and "GST Levied = 18%", debited from **your** (platform) balance. The transfer goes through only if the balance covers the fee. — [Razorpay: Transfers and Related Fees Example](https://razorpay.com/docs/payments/route/transfer-fees-example.md)
  - The FAQ says fees "are calculated based on your agreed-upon pricing plan". — [Route FAQs](https://razorpay.com/docs/payments/route/faqs.md)
  - **Conflict:** the pricing page lists Route as "0.1% + Platform Fees per transaction". — [Razorpay Pricing (India)](https://razorpay.com/pricing/)

### Inferences

- **Hold pattern:** for vendor-held funds, create transfers with `on_hold:true` and no `on_hold_until`. Release with `PATCH /v1/transfers/:id` `{on_hold:0}` once the return window closes. Releasing on the schedule's normal day keeps T+N; otherwise funds settle the next business day.
- **Reversals and refunds:**
  - A reversal has no idempotency key. Before retrying after a timeout, fetch the transfer's reversals and compare amounts.
  - A reversal fails if the vendor's linked-account balance is drained. After settlement there is no guaranteed clawback, so keep holds until refund risk lapses.
- **Platform balance:** keep it topped up, because both the transfer fees and refunds come out of it.

### Gaps

- Whether transfers created on an order run at capture or at authorization is not stated explicitly ("upon successful payment"). **Test-mode check:** see when `transfer.processed` fires relative to `payment.captured`.
- Actual Route pricing for a new account (0.25% vs 0.1%) needs confirmation with Razorpay sales.
- Whether Route needs separate activation was not covered. Route is generally an add-on product, but no page read here states that.

---

## 9. UPI Intent pending and expiry timeout

### Takeaway

No intent-specific timeout is published. The UPI error docs say a payment times out (`payment_timed_out`) when the customer exceeds a time limit that "is typically 10 minutes unless otherwise specified". That matches the general late-auth rule: no bank response for 10 minutes marks the payment failed, and it may later be late-authorized within 3 days. Checkout's transaction timeout is 3–15 minutes. The intent docs suggest re-initiating on the same order if it is not `paid` within 2–3 minutes.

### Cited Findings

- `payment_timed_out` / `payment_collect_request_expired`: "The payment could not be completed as the customer exceeded the time limit for payment processing. This time limit is typically 10 minutes unless otherwise specified." The page does not mention intent specifically. — [Razorpay: UPI Error Codes](https://razorpay.com/docs/errors/payments/upi.md)
- The UPI intent page documents no timeout or expiry. The response has `razorpay_payment_id` and `link` ("Do not make changes to the link"). Guidance is to poll the Fetch Payment APIs "periodically" with no interval given, or use webhooks, and to re-initiate if the order is not `paid` within 2–3 minutes. — [Razorpay: UPI Intent (S2S)](https://razorpay.com/docs/payments/payment-gateway/s2s-integration/payment-methods/upi/intent.md)
- Checkout: "Transaction timeout … times outs between 3 to 15 minutes." — [Standard Checkout Troubleshooting & FAQs](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/troubleshooting-faqs.md)
- Secondary (not official): a hosting provider's KB says the UPI limit is "usually 5 minutes" and that pending payments resolve within 5–15 minutes. — [DomainIndia KB](https://domainindia.com/support/kb/payment-shows-pending) _(search summary)_

### Inferences

- Treat an intent payment as in-doubt for at least 10 minutes. Then treat it as failed but late-auth-able for 3 days.
- Re-initiating at 2–3 minutes is safe on the money side only because both attempts are on the same order: a second authorization is auto-refunded once the order is `paid`. The reservation TTL for UPI should be at least 12–15 minutes.

### Gaps

- **Test-mode check:** the time from intent creation to `payment.failed` when the user never completes payment. Also whether re-initiating while the first attempt is still `created` is accepted.

---

## 10. Magic Checkout COD: fee configuration and COD Intelligence / RTO pricing

### Takeaway

- **Enablement:** COD on Standard Checkout is off by default and needs activation through Razorpay, roughly 7–10 business days.
- **Fee via API:** pass `cod_fee` in paise on `POST /v1/orders`.
- **Fee via Magic Checkout settings:** fees are configured as order-value slabs (example: ₹50 fee for ₹400–₹1,000) or free-COD ranges.
- **Settlement and webhooks:** Razorpay does not settle COD money. COD fires `payment.pending` (`method=cod`).
- **Pricing:** none is published for Magic Checkout, COD Intelligence or RTO Protection. The pricing page says "Enterprise pricing — Contact sales".

### Cited Findings

- **Activation:** COD is "off by default and must be activated on your merchant account", via an Account or Partner Manager or a support request, in about 7–10 business days. — [Razorpay: COD on Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md)
- **`cod_fee`** — [COD on Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md):
  - Goes on `POST /v1/orders`, in paise (`4900` = ₹49).
  - A value above `amount` gets 400. A non-INR order gets 400.
  - A **negative value is accepted and treated as no fee**. Omit the field rather than sending 0.
- **COD webhooks and settlement** — [COD on Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/cod.md):
  - COD triggers `payment.pending` with `method=cod`, `status=pending`. "A COD order does not generate a payment", so there is no `payment.captured`.
  - The webhook `amount` includes `cod_fee`.
  - "Razorpay does not settle COD amounts." "Razorpay does not absorb RTO losses on COD orders" (on this standard product).
- **Magic Checkout COD settings** — [Razorpay: Magic Checkout WooCommerce Features](https://razorpay.com/docs/payments/magic-checkout/woocommerce/features.md):
  - Fees are configured as slabs by min and max order value, with an example of ₹400–₹1,000 → ₹50.
  - "Free COD" ranges are available. Slabs cannot overlap.
  - "You must enable COD Intelligence if you opt for RTO protection."
  - Disabling COD Intelligence enables COD for everyone, "including those considered risky".
  - Integrating a logistics partner (Shiprocket, Delhivery, etc.) is mandatory for RTO protection.
- COD Intelligence "Charges differential COD fees for medium-risk orders". RTO Protection offers "Automated reimbursements on failed COD deliveries". No prices are given. — [Razorpay: Magic Checkout product page](https://razorpay.com/magic-checkout/)
- The pricing page lists Magic Checkout as "Enterprise pricing … Contact sales" and does not mention RTO protection. — [Razorpay Pricing (India)](https://razorpay.com/pricing/)
- Unverified: a search snippet attributes "0.75%" and "0.65%_" per-transaction add-on rates to the Magic Checkout page, "on top of standard pricing", with RTO protection on "a customized pricing plan". A direct fetch of [razorpay.com/magic](https://razorpay.com/magic) did not show these figures. _(search summary only; do not rely on it)\*

### Inferences

- If Magic Checkout is used, COD fee rules may live in Magic Checkout settings rather than our `cod_fee`. Pick one source of truth so the fee is not applied twice.
- Since `payment.pending` is the only COD signal and COD is never settled, the COD ledger path (cash with the courier or vendor) must be separate from the Razorpay settlement recon.

### Gaps

- No published price for Magic Checkout, COD Intelligence or RTO Protection. Ask Razorpay sales.
- Whether the Magic Checkout slab fee and the Orders API `cod_fee` interact or conflict is not documented.
- COD refund mechanics are not documented here. Prior notes say the refund API rejects COD.
