# 0024 — Cart ownership, when stock is reserved, and making `inStock` mean something

- **Date:** 2026-09-15
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Phase 3 (Cart, Orders, Payments, Notifications) begins against a codebase where the ordering
domain does not exist at all — no `cart`, no `orders`, no `payment` table, and no module
beyond `auth`, `users`, `vendors`, `catalog`, `search`, `admin`, `health`. This record settles
the three questions that block everything downstream of "add to cart." The cart *structure*
itself — what a cart item points at, and how a multi-vendor cart becomes an order — is
[0025](0025-cart-and-order-structure.md).

Three things force these questions now:

1. **A cart has no owner.** `CUSTOMER` is a real, working role — OTP registration, a JWT
   carrying `{sub, role}`, and `ApprovedGuard` explicitly exempting it
   ([approved.guard.ts](../../apps/backend/src/common/guards/approved.guard.ts)) — but it is
   only a `role` column on the shared `users` table. Every vendor-scoped service in this
   codebase takes a *resolved* `vendor.id` from `VendorsService.resolveVendorByUserId`, never
   the raw user id; [vendor-listings.controller.ts](../../apps/backend/src/modules/catalog/vendor-listings.controller.ts)
   states the rule in its own comment. There is no `customers` table and therefore no
   `resolveCustomerByUserId` to mirror it.

2. **`quantity_reserved` has stayed at 0 with no consumer**, exactly as
   [0022](0022-inventory-write-model.md) left it: *"inventing a reservation semantic now would
   likely be wrong."* Phase 3 is when that changes, and the column is already the right shape —
   `DECIMAL(12,3)`, `NOT NULL DEFAULT 0`, CHECK `>= 0`.

3. **Search lies about availability.** `inStock` is the literal `true` in both the indexing
   builder ([search-document.builder.ts:145](../../apps/backend/src/modules/search/indexing/search-document.builder.ts))
   and the Postgres fallback ([postgres-search.service.ts:212](../../apps/backend/src/modules/search/fallback/postgres-search.service.ts)),
   whose comment claims rows are *"in stock by construction."* That was true before 0022, when
   no inventory row existed anywhere and an ACTIVE listing was the only signal there was. 0022
   made it false and recorded it as an open question. Worse, `inStockOnly` is **declared** as a
   query field at `postgres-search.service.ts:34` and then dropped at three separate points —
   the DTO has no such field, the service never forwards it, and the SQL never reads it.

## Options considered

### Question 1 — what owns a cart

#### Option A — A `customers` table, mirroring `Vendor`

- **Pro:** Matches the convention every other role-scoped service already follows; a
  `resolveCustomerByUserId` is a direct analogue of the vendor path, so ownership is enforced
  in the service from the authenticated user rather than trusted from a request.
- **Pro:** Gives delivery addresses, and any later checkout profile, an owner that is not the
  bare `users` row. `implementation_plan.md` already anticipated this table ("customers table
  — customer-specific preferences and addresses").
- **Con:** A migration and a service before any cart code is written.

#### Option B — Hang the cart directly off `users.id`

- **Pro:** No new table; a cart exists sooner.
- **Con:** Diverges from the vendor convention for no reason other than speed, and leaves
  addresses with no owner — which forces the table anyway, plus a migration to re-point
  existing cart rows.

### Question 2 — when stock is reserved

#### Option A — Reserve at checkout/payment initiation

- **Pro:** The reservation window is bounded by how long a payment takes, not by how long a
  customer leaves a tab open.
- **Pro:** A cart stays what customers expect a cart to be — a list of intentions, not a claim
  on someone's warehouse.
- **Con:** A small oversell window remains: two customers can hold the same last unit in their
  carts, and the second to check out is refused.

#### Option B — Reserve at add-to-cart

- **Pro:** The strongest possible no-oversell guarantee.
- **Con:** Abandoned carts hold real stock indefinitely, which requires a TTL sweeper and a
  background job before the first order can ever be placed — and gets the vendor's stock wrong
  in the meantime, which is the thing 0022 worked to make truthful.

#### Option C — Never reserve; check availability at order confirmation

- **Pro:** No new machinery at all; `quantity_reserved` stays 0 and 0022's caution stands.
- **Con:** Two simultaneous checkouts for the last unit both succeed, and the failure is
  discovered after money has moved.

### Question 3 — what `inStock` means

#### Option A — Net available against reserved, with paint by listing status

- **Pro:** `(quantity_available - quantity_reserved) > 0` is the only definition that stays
  true once reservations exist, and it costs nothing extra today: the same join, the same
  index, and the same trigger.
- **Con:** Requires care with paint, which deliberately carries no inventory row.

#### Option B — Net available only; add reserved later

- **Pro:** Marginally simpler to state today, while `quantity_reserved` is always 0.
- **Con:** Requires touching the same two SQL statements a second time, for a change that is
  free to include now. The "later" version is strictly more work than the complete one.

## Decision

**Option A on all three.** The rules, written so they can be quoted back:

> **1. A cart belongs to a `customer`, not a user.** A `customers` table is created 1:1 with
> `users`, and a `resolveCustomerByUserId` resolves the caller exactly as
> `resolveVendorByUserId` does for vendors. Ownership is resolved in the service from the
> authenticated user, never taken from a path or body parameter — and someone else's cart
> returns **404, not 403**.
>
> **2. Stock is reserved when checkout begins, not when an item is added to a cart.** Adding
> to a cart writes nothing to `inventory`. `quantity_reserved` increments at checkout
> initiation, guarded by `quantity_available - quantity_reserved >= requested`.
>
> **3. A payment is confirmed by the provider's webhook, never by the client SDK's callback.**
> The SDK resolving means the customer's device believes it paid. Reservations convert to a
> decrement, or release, only on the server-to-server signal.
>
> **4. `inStock` means `(quantity_available - quantity_reserved) > 0`.** Both the indexing
> builder and the Postgres fallback derive it; neither hardcodes it.
>
> **5. A listing with no inventory row is in stock if and only if it is paint.** A
> `tinted_to_order` listing never gets an inventory row ([0007](0007-colour-family-pricing.md),
> [0022](0022-inventory-write-model.md) rule 4), so for paint, availability remains
> `vendor_listing.status` alone. For anything else, an absent inventory row means stock was
> never set, which is **not** in stock.
>
> **6. Search's `inStock` is an aggregate across every vendor of a product in a city. It is
> not sufficient to validate a cart.** A cart holds a specific `vendor_listing`; that
> listing's own availability must be checked at checkout regardless of what the search
> document says.

## Why

**On rule 1.** The alternative is not merely inconsistent, it is inconsistent in the direction
that hides bugs. Every existing ownership check in this codebase reads "resolve the child row
from the authenticated user, then scope the query to that child's id." A cart keyed on
`users.id` would look correct beside code that is doing something subtly different, and the
first developer to copy the vendor pattern onto a cart would introduce a lookup that silently
returns nothing.

**On rule 2.** The choice is between two ways of being wrong. Reserving at add-to-cart is
wrong continuously and invisibly — every abandoned cart quietly removes stock a vendor
believes they have, which is precisely the untruthfulness 0022 set out to fix. Reserving at
checkout is wrong only in a narrow race, visibly, at the moment a customer is actively
watching. Correctness that fails loudly at a known instant beats correctness that decays
silently.

**On rule 3.** Taken directly from prior art on this same team: MasterAcres'
`mobile-checkout-integration-note.md` states it plainly — *"The `RazorpayCheckout.open()`
promise resolving is the user's device reporting 'I think I paid.' It's not the source of
truth."* A device-reported success is an unauthenticated claim from an untrusted client. A
reservation released on that claim releases stock that was in fact sold.

**On rules 4 and 5.** The cost objection to netting reserved turns out not to exist. The
inventory search-sync triggers (`trg_inv_search_ins/upd/del`, migration
[20260828090004](../../apps/backend/database/migrations/20260828090004-create-search-sync-triggers.js))
are statement-level with transition tables and carry **no** `UPDATE OF <column-list>` — unlike
the five column-restricted fan-out triggers on brand, category, stone_variety, city and
vendors. A write to `quantity_reserved` alone therefore already enqueues a reindex, with no
trigger change. `in_stock` is already a `filterableAttribute` in the Meilisearch index
settings. So netting both columns is one join in two SQL statements, and netting only
`quantity_available` now would mean editing those same statements again later for nothing.

Rule 5 is the trap in the whole change, and it is worth being explicit about. The obvious
derivation — "an inventory row with stock above zero" — quietly removes every paint listing
from search, because paint never has such a row *by design*. The absence of a row means two
opposite things depending on the product, and only `sale_unit_type` distinguishes them.

**On rule 6.** A search document is one row per `(product, city)`, aggregating every vendor
selling that product there. "Somebody in Gurugram has this in stock" is the right answer for a
search result and the wrong answer for "can I buy this from Sharma Hardware." Writing this
down now prevents a reasonable-looking bug later: a developer who has just made `inStock`
truthful will be tempted to use it as the cart's stock gate.

## Consequences

- **A `customers` table and a `CustomersModule` exist** for the first time. `resolveCustomerByUserId`
  is the single resolution path, and every cart/order service takes a resolved `customer.id`.
- **`quantity_reserved` gets its first writer**, at checkout. Because the inventory triggers
  are unrestricted, every reservation and release now enqueues a search reindex — the reindex
  volume of the ordering domain is therefore proportional to checkout attempts, not orders.
- **`inStock` changes meaning for every existing search document.** A full reindex is required
  to apply it; the existing shadow-index rebuild and atomic swap
  ([0021](0021-search-runtime-build-plan.md), phase 6h) is exactly the mechanism for that, and
  needs no new code.
- **`inStockOnly` becomes a real query parameter**, which means it must join the Redis cache
  key. Without that, a filtered and an unfiltered request with otherwise identical parameters
  collide on the same cached response for up to 60 seconds.
- **Results can be up to 60 seconds stale** with respect to stock, through that same cache.
  This is not new — `price` has always had it — but it is now true of availability too, and a
  customer can reach checkout for something that sold out moments earlier. Rule 6's
  listing-level check at checkout is what makes that safe.
- The stale comment at `postgres-search.service.ts:210-211` asserting stock "by construction"
  is removed as part of this change; it documents a world that ended with 0022.
- No payment provider is chosen or integrated here. Rule 3 constrains *what* confirms a
  payment, not which gateway or how its signature is verified.

> [!NOTE]
> **Rules 4–6 implemented 2026-09-15.** `inStock` is derived in both the
> indexing builder and the Postgres fallback; `inStockOnly` is plumbed from the
> query string through to both engines and joins the Redis cache key. Verified
> against live Postgres with throwaway scripts (now deleted), covering: stock
> present, zero stock, fully reserved, partially reserved, no inventory row
> (non-paint → out of stock), no inventory row (paint → in stock), mixed
> vendors, and the cache-collision regression (a filtered and an unfiltered
> request no longer share a cached response).
>
> The full rebuild-and-swap (0021, phase 6h) was also run this session and
> completed cleanly — shadow build, atomic swap, and outbox marker consumption
> all worked as designed. It is **not**, however, evidence for the derivation
> itself: this database currently has 160 `master_product` rows, all
> `status='draft'`, zero `vendor_listing` rows and zero `inventory` rows, so it
> cannot produce a single search document (a document requires a *live*
> product with an *active* listing from a vendor in a city — draft products
> emit none, by design, per [0019](0019-search-followups.md)). The reindex
> therefore confirmed the *mechanism* — 0 documents before and after, both
> `products` and `products_rebuild` indexes present afterward as the swap
> intends — and confirmed nothing about whether `inStock` is computed
> correctly. That evidence is the live-Postgres verification above (7/7, 9/9
> and 5/5 assertions across the three implementation tasks), not the reindex.
>
> Rules 1–3 (the `customers` table, reservation at checkout, webhook
> confirmation) are **not** implemented — they await the cart and checkout
> work in [0025](0025-cart-and-order-structure.md).

## Open questions

- **Whether a vendor paused mid-checkout should release reservations.** `is_active` and
  `is_approved` live on `users`, not `vendors` — so "shop closed for holidays" pauses the
  user, and nothing currently decides what that means for a reservation already held against
  one of their listings, or for a cart containing their items. Deliberately not settled here:
  it belongs with the checkout state machine, not the reservation semantic.
- **How long a reservation may be held before it is swept.** Rule 2 bounds it by "the
  payment," but nothing yet defines the timeout, the sweeper, or whether an expired
  reservation notifies anyone. Nothing increments `quantity_reserved` until checkout is built,
  so this is not yet reachable.
- **Whether `inStock` should become a search facet.** It is filterable already; a facet count
  ("412 in stock") is free to add and was not argued.
- **Multi-warehouse inventory**, unchanged from 0022 — the `warehouse_id IS NULL` join
  condition is carried into the new derivation, so the question is preserved, not answered.
