# 0026 — Customer, cart and order schema: the tables, not the checkout

- **Date:** 2026-09-15
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

[0024](0024-cart-owner-reservation-and-real-instock.md) and [0025](0025-cart-and-order-structure.md)
settled the semantics — who owns a cart, when stock is reserved, what a cart item points at, how
a multi-vendor cart becomes an order. Neither created a table. This record is the schema that
implements rules 1, 2, 6 and 7 of 0025 and rule 1 of 0024, deliberately stopping short of
checkout: no reservation write, no payment, no endpoints. Six tables and their models, verified
live, nothing else.

The gap this closes was diagnosed precisely in conversation: `CUSTOMER` is a real, working
role — OTP registration, a JWT carrying `{sub, role}`, `ApprovedGuard` exempting it — but it is
only a `role` column on `users`. Every other role-scoped service in this codebase resolves a
*child* row from the authenticated user (`VendorsService.resolveVendorByUserId`) and scopes every
query to that child's id, never to the raw `users.id`. A cart keyed on `users.id` would sit next
to that code looking correct while doing something subtly different — and the next thing a
customer needs, a delivery address, would have nowhere to attach without a child row to hang it
from.

## Options considered

### Question 1 — how much of 0025 to build now

#### Option A — Schema only: customers, cart, orders tables; no checkout, no endpoints

- **Pro:** Every table in this slice is either a straight mirror of an existing pattern
  (`Customer`/`CustomerAddress` mirrors `Vendor`/`VendorAccountDetails` exactly) or a direct
  restatement of an already-decided rule (0025 rules 1, 6, 7). Nothing here requires a new
  design decision.
- **Pro:** Checkout is where the actual risk lives — atomic multi-vendor reservation,
  all-or-nothing validation, the first real writer of `quantity_reserved`, concurrency. Keeping
  it out of this slice means this slice can be low-risk and the next one can get a review budget
  sized to its actual difficulty.
- **Con:** A cart is unusable without endpoints. This slice produces schema a later slice must
  still wire up.

#### Option B — Schema plus cart CRUD endpoints

- **Pro:** Ships something a client could call.
- **Con:** Endpoints need auth wiring (`resolveCustomerByUserId` behind a guard, matching
  `VendorListingsController`'s pattern), DTOs, and a controller review surface — tripling this
  slice's size for a capability (viewing a cart with nothing yet ordering it) that has no
  standalone value. Better earned together with order-read endpoints in the next slice.

#### Option C — Full checkout in this slice

- **Pro:** One slice, one review, "Phase 3 done."
- **Con:** This is exactly the high-risk work the user asked to defer. Bundling it with schema
  work means a schema bug and a concurrency bug get one undifferentiated review instead of two
  scoped ones.

**Decided: Option A.**

### Question 2 — delivery addresses now or later

#### Option A — `customer_addresses` in this slice

- **Pro:** `order_vendor_group` needs a ship-to the moment it exists. Deferring means a second
  migration later for no savings — the column has to exist before an order can be placed either
  way.
- **Pro:** Costs one small table alongside a slice that's already touching this exact area.
- **Con:** Unused until checkout exists.

#### Option B — Defer to the checkout slice

- **Pro:** Smaller diff now.
- **Con:** `order_vendor_group.shipping_address_id` would either be added by a later migration
  (churn on a table just created) or the checkout slice would need to build both the address
  table and checkout logic together, re-coupling the two things Option A above chose to split.

**Decided: Option A** — addressed directly by the user ("delivery addresses come in this
slice").

### Question 3 — cart expiry

#### Option A — Add `last_active_at`, no sweeper

- **Pro:** The column is free to add now and expensive to add after carts exist with real data
  (a backfill migration, guessing at a value for existing rows).
- **Pro:** A sweeper is meaningless without checkout — nothing yet holds a reservation a sweeper
  would need to release, so building one now has nothing to protect.
- **Con:** None identified.

#### Option B — Ignore entirely

- **Con:** [0025](0025-cart-and-order-structure.md)'s open questions already flagged "how long a
  cart lives" as unresolved; ignoring it a second time defers a migration rather than a decision.

**Decided: Option A.**

## Decision

**Six tables**, all 1:1 or 1:N off `customers`, which is itself 1:1 off `users`:

```
users ──1:1── customers ──1:N── customer_addresses
                  │
                  ├──1:N── cart ──1:N── cart_item ──N:1── vendor_listing
                  │
                  └──1:N── orders ──1:N── order_vendor_group ──1:N── order_items
```

> **1. `customers` mirrors `Vendor` exactly.** `id`, `user_id` (FK, `unique: true`), `full_name`,
> timestamps. A `resolveCustomerByUserId(userId)` service method throws `NotFoundException` on a
> miss, matching `VendorsService.resolveVendorByUserId` verbatim — same 404-not-403 reasoning
> already established there.
>
> **2. `customer_addresses` is 1:N off `customers`.** `label`, `line1`, `line2`, `city_id` (FK to
> the existing `city` table), `pincode`, `latitude`/`longitude` (nullable — geocoding an address
> is not a prerequisite for saving one), `is_default`.
>
> **3. `cart` is 1:1 with `customers`.** One active cart per customer — `customer_id` is
> `unique`. `last_active_at`, defaulting to creation time, updated on every item write. No
> expiry logic reads this column yet; it exists so a sweeper can be added later without a
> migration or a backfill.
>
> **4. `cart_item` references `vendor_listing_id`, never `master_product_id`**, per
> [0025](0025-cart-and-order-structure.md) rule 1. `quantity` is `DECIMAL(12,3)`, matching
> `inventory.quantity_available`'s precision — a cart line inherits the category's unit
> (tonnes, boxes, sqft), same as inventory does. `UNIQUE (cart_id, vendor_listing_id)`: adding an
> already-present listing increments its quantity rather than creating a second row.
>
> **5. `orders` holds the customer-facing whole.** `customer_id`, `status`, `grand_total`,
> timestamps. No `project_id` column — [0025](0025-cart-and-order-structure.md)'s "Associate
> With Customer Projects" is Phase 4 scope, and a nullable column nobody writes is worse than no
> column with a comment marking where it attaches.
>
> **6. `order_vendor_group` is the per-vendor unit**, per 0025 rule 2. `order_id`, `vendor_id`,
> `status`, `subtotal`, `shipping_address_id` (FK to `customer_addresses`). The delivery OTP and
> open-box photo the client specified attach here later — commented, not built.
>
> **7. `order_items` carries the frozen line**, per 0025 rules 6 and 7. `vendor_listing_id`,
> `master_product_id` (both — the traceability rule), `quantity`, `unit_price_snapshot`,
> `product_name_snapshot`. Never re-reads `vendor_listing` after creation.
>
> **8. No endpoints, no reservation write, no checkout logic in this slice.** Models and
> migrations only. `quantity_reserved` gets no new writer here — that is 0024 rule 2, deferred
> to the checkout slice on purpose.

## Why

**On the customer/vendor mirror.** `VendorsService.resolveVendorByUserId` and its call sites
(`getProfileByUserId`, `updateProfile`, every vendor-scoped controller) are the working
reference implementation of "resolve a role's child row from the authenticated user, never trust
a path parameter." Copying that shape exactly, rather than inventing a new one, means the next
developer who has already read `VendorsService` needs zero new mental model to read
`CustomersService`.

**On splitting addresses into their own table rather than columns on `customers`.** `Vendor`
puts `address`/`latitude`/`longitude` directly on the vendor row because a vendor has exactly
one shop. A customer can have several delivery addresses — home, site office, a second project —
so the 1:N shape is a real difference from the vendor pattern, not an arbitrary one.

**On leaving `orders.project_id` out rather than adding it nullable.** A column that nothing
writes and nothing reads is not neutral — it invites a future migration to have "already been
done" when it was only declared. The comment marking the attachment point costs nothing and
misleads nobody.

**On stopping before checkout.** The user asked, mid-conversation, what could be built now
without Razorpay/Firebase credentials, and separately ruled that checkout deserves its own slice
given its risk profile (atomic multi-vendor reservation, first real `quantity_reserved` writer,
concurrency). This record is the schema half of that split; the checkout half is not yet
designed.

## Consequences

- Six new tables, six new Sequelize models, one new module (`CustomersModule`), one new service
  method (`resolveCustomerByUserId`) mirroring an existing one.
- `CatalogModule` gains no new dependents from this slice — `customer_addresses.city_id`
  references `city`, read-only, the same way `vendors.city_id` already does.
- No new routes, so nothing changes in `scripts/smoke.js`'s `REQUIRED_ROUTES` list this slice.
  `pnpm smoke` still matters — it must confirm the app still boots with six new models registered
  in `DatabaseModule`, which is exactly the class of defect the smoke script exists to catch
  (0022's own documented incident: a model added without registering it in the eager-load list
  broke boot silently past a green build and green tests).
- A cart and an order can exist in the database with no way to reach them over HTTP yet. That is
  intentional for this slice, not a gap — endpoints are the next slice's deliverable.
- `order_vendor_group` and `order_items` are designed with delivery OTP, open-box photo, and
  price/traceability snapshotting in mind, per 0025, but none of that logic is built — only the
  columns that make it possible without a later migration.

## Open questions

- **Whether a cart can hold items from a vendor the customer later can't check out with**
  (paused vendor, deactivated listing). 0025 already deferred this to checkout; unchanged here.
- **Multi-address checkout** — whether a single order can ship to more than one address across
  its vendor groups, or is pinned to one address for the whole order. Not decided; `orders` has
  no address column of its own, only `order_vendor_group.shipping_address_id`, which already
  permits per-vendor addresses without further schema change — but whether the checkout UI
  offers that choice is unaddressed.
- **Soft-delete vs. hard-delete for `customer_addresses`.** An address referenced by a past
  order's `order_vendor_group.shipping_address_id` should probably not vanish from order
  history if the customer deletes it later. Not designed here; will surface the first time
  delete is implemented.
