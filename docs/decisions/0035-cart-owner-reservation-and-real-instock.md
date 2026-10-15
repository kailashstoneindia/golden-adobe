# 0032 — Cart ownership, when stock is reserved, and making `inStock` mean something

- **Date:** 2026-10-07
- **Status:** Accepted
- **Supersedes / Superseded by:** Carries forward the decision made in `0024-cart-owner-reservation-and-real-instock.md` on branch `worktree-phase-3-cart-reservation` (2026-09-15), re-validated against `main` as of this date and re-filed under this project's current ADR numbering (0024 is already in use on `main` for product-images/GCS). The original record's reasoning is unchanged; this record exists so the decision lives where the rest of the project's history can find it, cites current file/line locations, and is not lost to an abandoned branch.

## Context

Phase 3 (Cart, Orders, Payments, Notifications) begins against a codebase where the ordering
domain does not exist at all — no `cart`, no `orders`, no `payment` table, and no module
beyond `auth`, `users`, `vendors`, `catalog`, `search`, `admin`, `health`. This record settles
the three questions that block everything downstream of "add to cart." The cart *structure*
itself — what a cart item points at, and how a multi-vendor cart becomes an order — is
[0033](0033-cart-and-order-structure.md).

Three things force these questions now:

1. **A cart has no owner.** `CUSTOMER` is a real, working role — OTP registration, a JWT
   carrying `{sub, role}`, and `ApprovedGuard` explicitly exempting it
   (`apps/backend/src/common/guards/approved.guard.ts`) — but it is only a `role` column on the
   shared `users` table. Every vendor-scoped service in this codebase takes a *resolved*
   `vendor.id` from `VendorsService.resolveVendorByUserId`
   (`apps/backend/src/modules/vendors/vendors.service.ts:37`), never the raw user id. There is
   no `customers` table and therefore no `resolveCustomerByUserId` to mirror it.

2. **`quantity_reserved` has stayed at 0 with no consumer**, exactly as
   [0022](0022-inventory-write-model.md) left it: *"inventing a reservation semantic now would
   likely be wrong."* Phase 3 is when that changes, and the column is already the right shape —
   `DECIMAL(12,3)`, `NOT NULL DEFAULT 0`, CHECK `>= 0`.

3. **Search lies about availability — partially.** Re-checked against `main` on 2026-10-07:
   `inStock` is the literal `true` in the indexing builder
   (`apps/backend/src/modules/search/indexing/search-document.builder.ts:223`) and in one path of
   the Postgres fallback (`apps/backend/src/modules/search/fallback/postgres-search.service.ts:223`),
   but a second path in that same file
   (`postgres-search.service.ts:358`) **already derives it for real** —
   `row.quantity_available === null || Number(row.quantity_available) > 0` — without netting
   `quantity_reserved`, and without the paint exception (rule 5 below). The two paths disagree
   today. `inStockOnly` is still **declared** as a query field
   (`postgres-search.service.ts:34`) and not read anywhere in that file — confirmed unchanged
   from the original analysis.

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
- **Con:** Requires touching the same SQL a second time, for a change that is free to include
  now. The "later" version is strictly more work than the complete one. Confirmed on re-check:
  this is exactly the inconsistency now live between the two `postgres-search.service.ts` paths
  — one was updated, one was not, and they disagree.

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
> **4. `inStock` means `(quantity_available - quantity_reserved) > 0`, consistently, in every
> code path that computes it.** Both the indexing builder and *every* branch of the Postgres
> fallback derive it the same way; none hardcodes it, and none nets only one of the two
> columns.
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

**On rule 3.** A device-reported success is an unauthenticated claim from an untrusted client.
A reservation released on that claim releases stock that was in fact sold.

**On rules 4 and 5.** The cost objection to netting reserved turns out not to exist. The
inventory search-sync triggers (`trg_inv_search_ins/upd/del`, migration
`20260828090004-create-search-sync-triggers.js:294-308`) are statement-level with transition
tables and carry **no** `UPDATE OF <column-list>` — unlike the five column-restricted fan-out
triggers on brand, category, stone_variety, city and vendors (same file, lines 335-357). A
write to `quantity_reserved` alone therefore already enqueues a reindex, with no trigger
change. `in_stock` is already a filterable attribute in the Meilisearch index settings. So
netting both columns is one join in a small number of SQL statements, and the live disagreement
between `postgres-search.service.ts:223` and `:358` is the concrete cost of not finishing this
the first time.

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
- No payment provider is chosen or integrated here. Rule 3 constrains *what* confirms a
  payment, not which gateway or how its signature is verified — see
  [0033](0033-cart-and-order-structure.md) and the implementation plan for the
  `PaymentProviderService` abstraction.

## Open questions

- **Whether a vendor paused mid-checkout should release reservations.** `is_active` lives on
  `users` (`apps/backend/src/modules/users/models/user.model.ts:62`), not `vendors` — so "shop
  closed for holidays" pauses the user, and nothing currently decides what that means for a
  reservation already held against one of their listings, or for a cart containing their
  items. Deliberately not settled here: it belongs with the checkout state machine, not the
  reservation semantic.
- **How long a reservation may be held before it is swept.** Rule 2 bounds it by "the
  payment," but nothing yet defines the timeout, the sweeper, or whether an expired
  reservation notifies anyone.
  > [!NOTE]
  > **No longer "not yet reachable."** The checkout transaction and Razorpay webhook now exist
  > (implementation plan `docs/superpowers/plans/docs-superpowers-specs-2026-10-07-phase-quiet-sunrise.md`),
  > and the final branch review for that plan confirmed this gap is now real: a customer who
  > reaches the Razorpay payment sheet and abandons it without completing or failing the
  > payment leaves `quantity_reserved` raised indefinitely — Razorpay sends no webhook for a
  > checkout that was simply never finished, so nothing in this codebase ever releases that
  > reservation. The webhook's `payment.failed` handler does NOT release it either (by design,
  > per that same review — a failed attempt still leaves the order payable for a retry; see
  > that plan's fix for finding #1). A `pending_payment` order older than some threshold with
  > no further webhook activity needs a sweep that releases its reservations and cancels it —
  > unbuilt, flagged here explicitly rather than left to decay silently, which is exactly what
  > rule 2's own reasoning above argues against.
- **Whether `inStock` should become a search facet.** It is filterable already; a facet count
  ("412 in stock") is free to add and was not argued.
- **Multi-warehouse inventory**, unchanged from 0022 — the `warehouse_id IS NULL` join
  condition is carried into the new derivation, so the question is preserved, not answered.
