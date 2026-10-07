# Phase 3 — Ordering domain (Cart, Checkout, Razorpay, Order Management, Notifications): design

**Date:** 2026-10-07
**Status:** Approved by user, section-by-section, during brainstorming on this date.
**Scope:** Backend only — API and schema. Mobile screens are a named dependency for later work,
not part of this plan (decision [0033](../../decisions/0033-cart-and-order-structure.md),
Consequences).

## Why this document exists

A prior attempt at this work exists on branch `worktree-phase-3-cart-reservation`
(`.claude/worktrees/phase-3-cart-reservation`), last committed 2026-09-15. It produced real,
sound design work — decisions 0024 and 0025 on that branch — plus one uncommitted, unfinished
task (a `customers` table and model, no module, no service, no endpoints). That branch is 49
commits behind `main` with overlapping, non-additive edits across ~156 files in the
catalog/search/vendor modules — a plain rebase would conflict throughout. Per the user's
decision, this plan **re-derives the work on current `main`** rather than rebasing: the prior
branch's decisions are ported forward as new ADRs (re-validated, re-cited against current code,
not re-argued — see [0032](../../decisions/0032-cart-owner-reservation-and-real-instock.md) and
[0033](../../decisions/0033-cart-and-order-structure.md)), and only the small, clean
`customers` table/model are carried over directly. Everything else is planned fresh against
`main` as it exists today.

## What Phase 3 is, per the signed proposal

| Deliverable | Covered by this plan |
|---|---|
| Cart Management | Yes |
| Checkout Flow | Yes |
| Razorpay Integration | Interface + Razorpay implementation, built to the integration boundary. No real merchant account exists; see Non-goals. |
| Order Management | Yes — placement, read, status transitions, cancellation hook. |
| Notifications | Interface + no-op/log implementation, built to the integration boundary. No Firebase project exists; see Non-goals. |

Customer-contracted capabilities this plan's API must support: Add Products To Cart, Checkout,
Place Orders, Track Orders, View Order History (from the proposal's User Roles section).

## Non-goals (explicit)

- **Mobile UI.** `apps/mobile`'s cart/checkout/order screens are not touched. Decision 0033
  names them as needing a rewrite once this API exists; that rewrite is someone else's task.
- **Real Razorpay transactions.** No merchant account or API keys exist in this project. The
  `PaymentProviderService` interface and `RazorpayProviderService` implementation are built and
  unit-testable against documented/mocked provider behavior; nothing in this plan claims a real
  payment was captured.
- **Real Firebase push delivery.** Same shape: interface built, no-op default ships, Firebase
  Admin SDK implementation is written but cannot be verified live without a project.
- **Delivery fulfilment**: OTP, open-box photo, artisan validation, project association,
  customer report path. All deferred per decision 0033's table, with attachment points
  reserved, not built.
- **Admin panel UI.** Admin order endpoints are plain API; no new admin-panel screens.
- **Growing the frozen 25-test Jest suite.** New verification is manual/throwaway against live
  Postgres, per this project's standing practice (`docs/catalog-implementation-status.md`,
  Testing approach).

## Architecture

### New tables (7, correcting decision 0025's original count of 5 which omitted addresses)

```
users ──1:1── customers ──1:N── customer_addresses
                  │
                  │ 1:1 (one open cart)
                  ▼
                cart ──1:N── cart_item ──FK── vendor_listing (existing)
                  │
                  │ (checkout transaction)
                  ▼
                orders ──1:N── order_vendor_group ──1:N── order_items
                  │                    │                      │
              customer_id          vendor_id            vendor_listing_id
           delivery_address_id      status            master_product_id (snapshot)
             razorpay_order_id     subtotal           unit_price_snapshot
                status
                grand_total
```

| Table | Key columns | Notes |
|---|---|---|
| `customers` | `id`, `user_id` (FK→users, unique), `full_name` | Carried over directly from the uncommitted branch work — already matches `main`'s `Vendor` precedent exactly. No changes. |
| `customer_addresses` | `id`, `customer_id` (FK), `label`, address lines, `lat`, `lng`, `is_default` | New in this plan. 1:N — a customer may have several delivery addresses. |
| `cart` | `id`, `customer_id` (FK, unique) | One open cart per customer — unique constraint enforces it. |
| `cart_item` | `id`, `cart_id` (FK), `vendor_listing_id` (FK), `quantity` | References the listing per decision 0033 rule 1, never the product. |
| `orders` | `id`, `customer_id` (FK), `delivery_address_id` (FK), `grand_total`, `status`, `razorpay_order_id` | One row per checkout/payment. |
| `order_vendor_group` | `id`, `order_id` (FK), `vendor_id` (FK), `subtotal`, `status` | Per-vendor fulfilment unit. Attachment point for Phase 4's delivery OTP/photo (deferred, not built). |
| `order_items` | `id`, `order_vendor_group_id` (FK), `vendor_listing_id` (FK), `master_product_id` (FK), `quantity`, `unit_price_snapshot` | Price frozen at order time (0033 rule 6). `master_product_id` kept for risk-4 traceability (0033 rule 7). |

**No catalog-side migration needed.** `inventory.quantity_reserved`, `inventory.quantity_available`,
and `vendor_listing.min_order_qty` already exist on `main` from Phase 2 — this plan gives them
their first real readers/writers, not new columns.

### Abstraction boundaries (decision 0033, rules 8-9)

Both follow the same shape as the existing `StorageService` interface (decision
`0024-product-images-gcs.md`): an interface the ordering domain depends on, one concrete
implementation, config-driven credentials, so acquiring real credentials later is a config
change, not a rewrite.

```typescript
interface PaymentProviderService {
  createOrder(amountPaise: number, receiptId: string): Promise<{ providerOrderId: string }>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  markCaptured(providerOrderId: string, providerPaymentId: string): Promise<void>;
}
// RazorpayProviderService — only implementation. Config: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
// RAZORPAY_WEBHOOK_SECRET.

interface NotificationService {
  sendOrderPlaced(customerId: string, orderId: string): Promise<void>;
  sendOrderStatusChanged(customerId: string, orderId: string, status: string): Promise<void>;
}
// Default: LogNotificationService (no-op/log). Swapped for a Firebase Admin SDK
// implementation when FIREBASE_* credentials exist.
```

### Modules

| Module | Endpoints | Depends on |
|---|---|---|
| `CustomersModule` | `GET/PATCH /customers/me`; `GET/POST/PATCH/DELETE /customers/me/addresses[/:id]` | `UsersModule` |
| `CartModule` | `GET /cart`; `POST /cart/items`; `PATCH /cart/items/:id`; `DELETE /cart/items/:id` | `CustomersModule`, `CatalogModule` (listing lookups) |
| `PaymentsModule` | Internal only — `PaymentProviderService` + `RazorpayProviderService` | None (leaf module) |
| `NotificationsModule` | Internal only — `NotificationService` + log/no-op + (written, unverified) Firebase impl | None (leaf module) |
| `OrdersModule` | `POST /checkout`; `POST /webhooks/razorpay`; `GET /orders`; `GET /orders/:id`; `PATCH /orders/:id/cancel` | `CartModule`, `PaymentsModule`, `NotificationsModule` |

**Added to existing modules** (not new modules, following the project's convention of extending
`vendors`/`admin` rather than fragmenting):

- `vendors` module: `PATCH /vendor/order-groups/:id/status` — vendor updates their fulfilment
  group's status.
- `admin` module: `GET /admin/orders`, `GET /admin/orders/:id` — read-only oversight.

Order/group status enum, Phase 3 scope only: `pending` → `confirmed` → `shipped` → `delivered`
/ `cancelled`. No OTP or photo fields — those are reserved table slots per decision 0033, not
enum values here.

### Ownership pattern

Every service follows the existing convention exactly:
`resolveCustomerByUserId(userId)` → `Customer`, mirroring
`VendorsService.resolveVendorByUserId` (`apps/backend/src/modules/vendors/vendors.service.ts:37`).
Ownership is always resolved server-side from the JWT; a customer requesting another
customer's cart or order gets **404, not 403** (matches decision 0032 rule 1, and the existing
vendor-scoping convention noted in `vendor-listings.controller.ts`).

### Checkout transaction (the core of the plan)

One DB transaction, in this order, matching decision 0033 rules 4-5:

1. Load the cart's items, joined to current `vendor_listing` (price, status, `min_order_qty`)
   and `inventory` (`quantity_available`, `quantity_reserved`).
2. Validate every line: listing is `ACTIVE`, vendor is not paused (`users.is_active`), and
   `quantity_available - quantity_reserved >= requested`. Group remaining valid lines by vendor
   and check each group's summed quantity against that vendor's `min_order_qty`.
3. **Any failure aborts the whole transaction** — 400 naming every offending line (item id,
   vendor, reason). No row is written, matching rule 4's "leaves the database exactly as it
   found it."
4. On success: increment `quantity_reserved` for every line (single statement, not a loop — see
   Testing below), snapshot prices onto new `order_items` rows, create `orders` +
   `order_vendor_group` rows, call `PaymentProviderService.createOrder()`, return the
   provider's order id to the client.
5. Clear the cart only after the transaction commits.

Webhook (`POST /webhooks/razorpay`): verifies signature via
`PaymentProviderService.verifyWebhookSignature()`, then on a capture event converts the
reservation to a real decrement (`quantity_available -= quantity, quantity_reserved -= quantity`)
and calls `NotificationService.sendOrderPlaced()`. On a failure/expiry event, releases the
reservation (`quantity_reserved -= quantity`) and leaves `quantity_available` untouched. This is
rule 3 in decision 0032: only the webhook moves a reservation to a decrement or a release — the
client SDK callback does neither.

### `inStock` fix (decision 0032, rules 4-6)

Deferred to the last build step because it only becomes observable once `quantity_reserved` has
a writer. Fixes the confirmed-live disagreement between
`search-document.builder.ts:223` (hardcoded `true`) and the two inconsistent branches inside
`postgres-search.service.ts` (one hardcoded at line 223, one already deriving availability at
line 358 but without netting `quantity_reserved` or handling the paint exception). After the
fix, both files compute `(quantity_available - quantity_reserved) > 0`, with paint read from
`vendor_listing.status` alone. `inStockOnly` is wired from query string through to both engines
and joins the Redis cache key (it is currently declared and dropped). A full index rebuild via
the existing shadow-index/atomic-swap mechanism (decision 0021, phase 6h) applies the new
meaning to existing documents — no new rebuild code needed.

## Build sequence

Dependency-ordered; nothing here needs to happen out of order.

```
1. customers + customer_addresses
   — port the clean customers table/model directly; add customer_addresses;
     write CustomersModule (resolveCustomerByUserId, profile + address endpoints)
2. cart + cart_item
   — CartModule: add/update/remove, listing-scoped, quantity validated against
     min_order_qty only as a display hint (the real enforcement is at checkout)
3. PaymentProviderService interface + RazorpayProviderService (unverified-live)
   — unblocks writing checkout without needing real keys yet
4. orders + order_vendor_group + order_items + the checkout transaction
   — validate-all → reserve-all → snapshot prices → create provider order,
     single transaction, all-or-nothing
5. Razorpay webhook handler + NotificationService hook
   — capture converts reservation to decrement; failure releases it
6. Order read/status endpoints
   — customer GET /orders, /orders/:id; vendor PATCH order-group status;
     admin GET /admin/orders
7. inStock fix (decision 0032 rules 4-6)
   — now meaningful: quantity_reserved has a real writer from step 4
```

## Testing / verification

Matches the project's standing practice (`docs/catalog-implementation-status.md`):

- **No new `.spec.ts` files.** The 25-test suite stays frozen.
- **Manual, throwaway verification against real Postgres** for every step — written, run,
  deleted. Must include the `ResponseInterceptor` (its omission previously caused a false
  14-failure run, per `docs/catalog-implementation-status.md`).
- **Checkout-specific cases to prove:** happy path (single vendor); multi-vendor split;
  below-minimum rejection naming the vendor and shortfall; insufficient-stock rejection naming
  the item; paused-vendor rejection; the race case (two concurrent checkouts for the last unit —
  one must fail cleanly, not both succeed); webhook capture converts reservation to decrement;
  webhook failure/expiry releases reservation without touching `quantity_available`; cancel
  after placement releases whatever reservation remains.
- **Boot check.** Per the lesson recorded in `catalog-implementation-status.md` ("a green build
  and a green test suite do not mean the application runs"): start the real app after each step
  that adds a model, module, or association, and confirm "Nest application successfully
  started," plus confirm new routes appear in the route table.
- **`pnpm smoke` updated** with every new route.
- **Payment/notification interfaces are unit-tested against mocked provider responses** (signature
  verification against Razorpay's publicly documented test payloads) — this is the only new-code
  path where a test file is appropriate, since there is no live service to throwaway-script
  against. If the project's "no new `.spec.ts`" rule is meant to be absolute, this becomes a
  throwaway script instead; flagged as a question for the implementation plan, not resolved
  here.
- **Explicitly not verified in this plan:** a real Razorpay capture; a real Firebase push. Named
  as a gap, not silently skipped.

## Risks / open items carried into implementation

From decisions 0032 and 0033's own Open Questions sections — not resolved here, surfaced so the
implementation plan can flag them rather than silently assume an answer:

- Whether a paused vendor's existing reservations/cart items should self-resolve, or wait for
  checkout to reject them (current plan: the latter).
- Cancellation authorization (who, until when) — the status enum carries a `cancelled` state
  without this plan deciding who may set it.
- Cart lifetime / expiry — nothing expires a cart in this plan.
- Whether `order_vendor_group` needs a customer-facing short id, separate from its UUID.
- Acquiring real Razorpay and Firebase credentials is **not an engineering task** in this plan
  and is not assumed to be in progress.

## Self-review notes

- Placeholder scan: no TBD/TODO markers left in this document.
- Internal consistency: table count (7) now matches the schema diagram and the two ADRs it
  cites; the original branch's miscount (5, omitting `customer_addresses`) is corrected and
  called out in decision 0033's Consequences section.
- Scope check: single plan, backend-only, matches Phase 3's proposal deliverables one-to-one
  with two named exceptions (Razorpay, Notifications truncated at the integration boundary).
  Appropriately sized for one implementation plan — not decomposed further.
- Ambiguity check: the one open ambiguity (whether payment/notification interface tests violate
  the "no new spec files" rule) is surfaced explicitly above rather than silently decided either
  way, for the implementation plan to resolve with the user.
