# 0033 — Cart and order structure: what an item points at, and how one payment becomes many vendors' work

- **Date:** 2026-10-07
- **Status:** Accepted
- **Supersedes / Superseded by:** Carries forward the decision made in `0025-cart-and-order-structure.md` on branch `worktree-phase-3-cart-reservation` (2026-09-15), re-validated against `main` as of this date and re-filed under this project's current ADR numbering (0025 is already in use on `main` for the AWS migration). The original record's reasoning is unchanged; this record re-confirms its premises against today's schema and re-cites current file/line locations.

## Context

[0032](0032-cart-owner-reservation-and-real-instock.md) settled who owns a cart, when stock is
reserved, and what `inStock` means. It deliberately did not settle what a cart *item* is, and
that omission hides the question this record exists to answer: **a Golden Abode cart spans
vendors by construction.**

It spans vendors because of how search works. A search result is one document per
`(product, city)`, carrying `price` (the cheapest ACTIVE listing in that city),
`cheapestVendorListingId`, and `vendorCount` — so a customer browses *products* while stock,
price and `min_order_qty` all live on `vendor_listing`, one row per vendor. Three vendors
selling the same Kota stone are three listings behind one search result.

Re-checked against `main` on 2026-10-07: `vendor_listing.min_order_qty` is a real
`DECIMAL(12,3)` column defaulting to 1
(`apps/backend/src/modules/catalog/models/vendor-listing.model.ts:80-82`), applied per listing.
A cart that cannot express "which vendor" cannot enforce it. The mobile mockup
(`DEMO_CART_GROUPS`) referenced in the original record was not re-checked this session — mobile
is out of scope for this plan — but nothing in the backend schema has changed in a way that
would invalidate the grouped-by-vendor shape it assumed.

Scope is set by the signed proposal: Phase 3 is **Cart Management, Checkout Flow, Razorpay
Integration, Order Management, Notifications** (weeks 6–8). The customer's contracted
capabilities are Browse, Search, Add To Cart, Checkout, Place Orders, Track Orders, View Order
History. **Phase 3 stops at order placement and payment confirmation.** Fulfilment, delivery
and artisan validation are later work, but they are not hypothetical — the client has already
specified them in detail, so this record names where they will attach rather than pretending
they do not exist.

## Options considered

### Question 1 — what a cart item references

#### Option A — `vendor_listing_id`

- **Pro:** Stock, price and `min_order_qty` all live on the listing. A reservation has a row to
  increment; a price has a row to read; a minimum has a vendor to apply to.
- **Pro:** Makes the vendor an explicit, chosen part of the cart line rather than something
  re-derived later from a "cheapest" snapshot that may have moved.
- **Con:** The customer browses products, so the UI must choose a listing on their behalf when
  they add from a search result. Defaulting to `cheapestVendorListingId` is the obvious
  choice, but it is a choice, and it can go stale between search and add.

#### Option B — `master_product_id`, resolving a vendor at checkout

- **Pro:** Matches what the customer thinks they are adding ("Kota stone"), and defers the
  vendor choice.
- **Con:** Nothing to reserve — `quantity_reserved` lives on `inventory`, which is keyed by
  listing. The reservation rule from 0032 becomes unimplementable.
- **Con:** The price shown in the cart would be a per-city aggregate that can change when any
  vendor edits a listing, so a cart total would move for reasons the customer cannot see.

### Question 2 — what a multi-vendor cart becomes at checkout

#### Option A — One order, split into per-vendor groups

- **Pro:** One payment, which is what the customer experiences and what a single Razorpay order
  models.
- **Pro:** Each vendor gets an independently trackable unit — its own status, and later its own
  delivery OTP and proof-of-delivery. One vendor shipping while another cancels is expressible.
- **Pro:** Matches the mobile mockup's grouped shape.
- **Con:** Three tables where a naive design has two.

#### Option B — One separate order per vendor

- **Pro:** A flat, simple order row.
- **Con:** The customer pays once, so either they see N payments, or one payment spans N
  orders — which recreates the grouping problem inside the payment layer, where it is worse.

#### Option C — One flat order, `vendor_listing_id` on each item

- **Pro:** Fewest tables.
- **Con:** Nowhere to hang per-vendor status, and nowhere for the delivery OTP and open-box
  photo the client has already specified. The first vendor-level state field forces the
  restructure this option was chosen to avoid.

### Question 3 — one item unavailable at checkout

#### Option A — All-or-nothing; reject naming the offenders

- **Pro:** The precedent is already set twice in this codebase: bulk stock writes reject the
  whole batch naming bad ids ([0022](0022-inventory-write-model.md) rule 3), and export scoping
  rejects rather than silently narrowing, because *"a vendor who asked for five categories and
  received three would have no way to tell that happened."*
- **Pro:** No partially-paid state can exist, so no reconciliation path is needed.
- **Con:** One sold-out item blocks a large order until the customer edits their cart.

#### Option B — Proceed with what is available

- **Pro:** Forgiving; most of the order lands.
- **Con:** The customer is charged a different total than the one they reviewed, and a client
  that ignores the "we dropped these" report silently loses items the customer wanted.

## Decision

**Option A on all three.** The rules, written so they can be quoted back:

> **1. A cart item references a `vendor_listing_id`, never a `master_product_id`.** The
> listing is where stock, price and minimum order quantity live, so it is what a cart line
> must name. Adding from a search result defaults to `cheapestVendorListingId`; the customer
> may choose another vendor for the same product.
>
> **2. A cart spans vendors; an order groups by them.** Checkout produces exactly one `order`
> (one customer, one payment, one grand total) containing one `order_vendor_group` per
> distinct vendor, each containing its own `order_items`.
>
> **3. `min_order_qty` is enforced per vendor group, never against the cart total.** A group
> failing its vendor's minimum fails checkout for the whole order, naming the vendor and the
> shortfall.
>
> **4. Checkout is all-or-nothing.** Any item unavailable, below minimum, belonging to a paused
> vendor, or no longer ACTIVE rejects the entire checkout with a 400 naming every offending
> line. **No reservation is taken and no order row is written** — a rejected checkout leaves
> the database exactly as it found it.
>
> **5. Reservations across all vendors in an order succeed or fail together**, in one
> transaction. Partial reservation is not a state this system has.
>
> **6. Price is snapshotted onto `order_items` at order creation**, and is never re-read from
> `vendor_listing` afterwards. A cart shows live listing prices; an order shows what was
> agreed.
>
> **7. `order_items` records enough to trace a delivered item back to the
> `vendor_product_map` entry that produced its listing** — at minimum the `vendor_listing_id`
> and the `master_product_id` as matched at order time.

## Why

**On rule 1.** This is forced, not chosen. 0032 rule 2 reserves stock by incrementing
`inventory.quantity_reserved`, and `inventory` is keyed by `vendor_listing_id`. An item that
names only a product has nothing to reserve against. Everything else in this record follows
from that one constraint.

**On rule 2.** The customer pays once and the platform owes N vendors work. Those are
genuinely two different cardinalities, and a schema that collapses them has to reintroduce the
distinction somewhere worse. The decisive argument is what is already specified and coming:
the client's 22 June requirement (`docs/client-feedback-2026-06-22.md`) is a **six-digit
delivery OTP generated per fulfilment**, with a driver entering it at the site and uploading an
open-box photo to close the *sub-order*. That state — OTP, photo, closure — has exactly one
natural home, and it is the per-vendor group. Choosing Option C today would mean adding that
table in three months and migrating every order into it.

**On rule 4 and the "no order row" clause.** A failed checkout that leaves behind a
`PENDING_PAYMENT` order the customer never completes creates a category of row that must then
be swept, reported on, and excluded from every order history query. Writing nothing means
failure needs no cleanup. This also composes with 0032 rule 2: reservations are taken *after*
validation passes, so a rejected checkout never touched `inventory` either.

**On rule 6.** Vendors edit prices; carts are long-lived. If an order re-read prices from
`vendor_listing`, a customer's order history would change retroactively, and a vendor could
alter what an already-placed order was worth. The snapshot is also what a dispute needs: the
number the customer agreed to, preserved independently of the catalog. This is the standing
answer to the price-drift question — **the cart is live, the order is frozen.**

**On rule 7.** [catalog-integrity-residual-risks.md](../catalog-integrity-residual-risks.md)
risk 4 is explicit that a customer report *"should flag the `vendor_listing`, and invalidate
the `vendor_product_map` entry that produced it"*, and warns it must be designed in *"from the
start, not bolted on."* Risk 2's fix re-points `vendor_product_map` at whatever the vendor
confirmed; if a customer receives the wrong item and only the order is flagged, the mapping
survives and re-applies the same wrong listing on the vendor's next upload. The report *path*
is Phase 4 work, but the columns it will need cost nothing now and cannot be retrofitted onto
orders already placed.

## Decision — payment and notification abstraction boundaries (new in this record)

Neither a Razorpay merchant account nor Firebase credentials exist in this project as of this
date (checked: no `RAZORPAY_*` / `FIREBASE_*` entries in `.env.example`, no `razorpay` or
`firebase-admin` dependency in `apps/backend/package.json`). Rather than block the ordering
domain on acquiring them:

> **8. A `PaymentProviderService` interface is built first; `RazorpayProviderService` is its
> only implementation.** Same pattern as the `StorageService` abstraction in
> [0024-product-images-gcs.md](0024-product-images-gcs.md) — the interface
> (`createOrder`, `verifyWebhookSignature`, `markCaptured`) is what the rest of the ordering
> domain depends on, so acquiring real credentials later is a config change
> (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`), not a rewrite.
>
> **9. A `NotificationService` interface is built first; a log/no-op implementation ships by
> default.** `sendOrderPlaced` / `sendOrderStatusChanged` are called from the order status
> machine regardless of whether Firebase is configured, so the call sites are exercised and
> correct before the first real push notification is ever sent.

This is an explicitly named gap, not a silent one: **no code in this plan verifies a real
payment capture or a real push notification**, because no credentials exist to verify against.
Both interfaces are, however, unit-testable against mocked provider responses, and the webhook
signature-verification logic can be tested against Razorpay's publicly documented test
payloads without a live account.

## Consequences

- **Six new tables** (`customers`, `customer_addresses`, `cart`, `cart_item`, `orders`,
  `order_vendor_group`, `order_items` — seven, correcting the original record's count of five,
  which omitted `customer_addresses`) on top of the catalog and auth domains already in `main`.
  This is the first schema in the repo outside those two domains.
- **`inventory` gains its second writer.** `StockService` writes `quantity_available`; checkout
  writes `quantity_reserved`. Both must go through raw SQL for the reasons 0022 records — the
  partial unique index on `warehouse_id IS NULL` is not expressible through Sequelize's
  `upsert()`.
- **A cart can contain items a customer cannot currently buy.** Prices move, vendors pause,
  stock runs out. The cart is deliberately not self-healing: it shows the current state and
  checkout is the gate. Silently removing items from a cart is a worse failure than showing a
  line that cannot be ordered.
- **Checkout validation is a single query, not a loop.** The same reasoning as 0022 rule 7 —
  the inventory triggers are statement-level, so a loop of N reservations enqueues N reindex
  rows where one statement enqueues one.
- **Mobile is out of scope for this plan** by explicit decision. The real cart/checkout/order
  screens on `apps/mobile` are a rewrite, not an adaptation, once this API exists — named here
  as a dependency for whoever picks up that work next, not addressed by it.
- **Payouts are manual and this schema assumes it.** The proposal excludes *"wallet withdrawals
  and advanced payout automation"* from the MVP, and the client asked for *"Bank Account
  Details/UPI ID (for manual payout processing)"* — which shipped as `vendors.upi_id` and
  `vendors.bank_details`. There is no split settlement: the platform collects the full amount
  once and settles with vendors out of band. `order_vendor_group` therefore carries a
  per-vendor total for reconciliation, not a payment instrument.
  (`implementation_plan.md` line 283 lists a "Razorpay sub-account" column on `vendors`; no
  such column exists in any migration, and that line remains stale.)

### Deliberately deferred, with the slot named

These are **not** Phase 3 work. They are recorded because the structure above is chosen partly
to accommodate them, and a later reader needs to know the attachment points were deliberate.

| Deferred | Attaches to | Why not now |
|---|---|---|
| Delivery OTP (6-digit, driver enters at site) | `order_vendor_group` | Fulfilment, not placement. Client-specified 22 June; the architecture must support it, which rule 2 ensures. |
| Open-box delivery photo | `order_vendor_group` + media storage | Needs the media/storage work that is still unstarted in Phase 2 (decision 0024-product-images-gcs is accepted but unimplemented). |
| Artisan order validation ("correct material, good quality") | `order_vendor_group` | The contracted artisan scope is Profile, Associate, Earn Points, View History — validation is Phase 4. |
| Project association | `orders` | "Associate With Customer Projects" is Phase 4. The order owner is the customer; a nullable project reference is additive later. |
| Customer report path (risk 4) | `order_items` | The path is Phase 4; rule 7 ensures the columns exist now. |
| Dimension-based orders (custom stone cutting) | — | Explicitly post-MVP in the proposal. |
| Real Razorpay capture / real Firebase push | `PaymentProviderService` / `NotificationService` | No credentials exist yet (rules 8-9). Interfaces are built and testable; live verification is blocked on account setup, which is not an engineering task. |

## Open questions

- **Which vendor a search-result add-to-cart should default to.** `cheapestVendorListingId` is
  the obvious answer and the only one the search document supports today, but "cheapest" and
  "in stock" can disagree, and the document's aggregate `inStock` cannot tell them apart (0032
  rule 6). Whether the UI offers a vendor picker is a product question, not settled here.
- **What happens to a cart item whose vendor is paused.** Carried forward from 0032 — the
  pause lives on `users.is_active`, and rule 4 rejects such an item at checkout, but whether
  the cart should *show* it as unavailable before then is undecided.
- **Whether an order is cancellable after placement, and by whom.** "Order Management" and
  "Status Updates" are contracted, but cancellation semantics — who may cancel, until when,
  and what happens to a reservation or a captured payment — are not argued here. This is the
  most likely next ADR, and the implementation plan allocates a status machine that can carry
  a `cancelled` state without resolving the authorization question.
- **How long a cart lives.** Nothing expires a cart today, and a cart holding a listing that
  has since been deleted needs a defined read behaviour.
- **Whether `order_vendor_group` needs its own customer-visible identifier.** A customer
  tracking "part of order #123 from Sharma Hardware" may need a stable per-group reference
  rather than an internal UUID.
- **When real Razorpay and Firebase credentials will exist**, and who owns acquiring them —
  not an engineering decision, named here so it is not silently assumed to be in progress.
