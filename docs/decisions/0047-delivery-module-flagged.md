# 0047 — Delivery module: flagged as new scope, not yet designed

- **Date:** 2026-10-30
- **Status:** Flagged — scope confirmed, design deferred, nothing built
- **Supersedes / Superseded by:** —

## Context

The client runs an in-house delivery team and wants it integrated into the platform — this is
new scope, not previously named in the signed proposal (`Golden Abode – Home Finishing
Marketplace Platform.pdf`) or in any existing decision record. A repo-wide check confirms there
is nothing to build on top of today: `deliveryAddress`/`delivery_address` only exists as
_where an order ships to_ (`CheckoutDto`, `Order` model, `checkout.service.ts`) — there is no
concept anywhere of a delivery person, a delivery run, assignment of an order to a driver, or
delivery-status tracking distinct from a vendor's own order-fulfilment status
(`OrderVendorGroup` status, per [0042](0042-cart-and-order-structure.md)).

This record exists only to put the requirement on the record before it is lost to chat, per this
project's standing rule that every design outcome — and in this case, every _confirmed future
scope item_, even pre-design — goes to `docs/decisions/` rather than living only in
conversation. The user has explicitly said scoping happens later; this is not that scoping pass.

## What's confirmed

- Client has an in-house delivery team (not third-party courier integration, not a marketplace
  of delivery partners).
- A delivery module needs to integrate with the existing order/fulfilment flow — exact shape
  (one module tracking all vendors' deliveries centrally, vs. per-`OrderVendorGroup` delivery
  state, vs. something else) is undecided.

## What's explicitly NOT decided here

- Whether delivery state lives on `OrderVendorGroup` (extending its existing status enum) or as
  a new entity (e.g. `DeliveryAssignment`/`DeliveryRun`) referencing orders/vendor-groups.
- Whether delivery personnel are a new `Role` (like `VENDOR`/`ARTISAN`/`ADMIN`/`CUSTOMER`) with
  their own auth, or an admin-managed roster with no login of their own.
- Whether this is single-item/single-vendor delivery tracking or route/batch delivery (one
  driver, multiple orders in sequence) — the "in-house team" framing suggests batching may
  matter, but this is unconfirmed.
- Mobile/web surface for delivery staff (a separate app view, or addition to the existing admin
  panel) — not discussed yet.
- Relationship to the vendor loading/unloading capability field already shipped
  ([0036](0036-vendor-loading-unloading-capability.md)) — that field describes a vendor's own
  capability at their end, not platform-coordinated delivery; whether/how the two relate is an
  open question for the real design pass, not resolved here.
- Interaction with artisan-attributed orders (`orders.booking_id`,
  [0045](0045-artisan-hire-lifecycle-and-order-attribution.md)) — likely orthogonal (delivery is
  about getting goods to an address regardless of how the order was attributed) but not verified
  against a concrete design yet.

## Why a record now, with nothing decided

Matches how this project has handled other known-but-unscoped future work (e.g. the rewards
ledger named and deliberately deferred across
[0045](0045-artisan-hire-lifecycle-and-order-attribution.md) and
[0046](0046-artisan-product-recommendations.md) pending a client decision on points model) —
naming the gap in writing, with what's confirmed vs. open, is cheaper than letting it live only
in conversation and risk being re-discovered or re-litigated from scratch later.

## Consequences

- Nothing in the running codebase changes as a result of this record.
- The next "what's remaining in this project" assessment should list delivery as a known,
  client-confirmed scope item — distinct from, and in addition to, the open items already
  tracked (reward tracking, artisan recommendations, mobile artisan UI, vendor_category backfill,
  vendor approval-status field).
- When the real design pass happens, it supersedes this record and should resolve each item in
  "What's explicitly NOT decided here" with its own Options-considered treatment, per this
  project's normal decision-record format.

## Open questions

All of them — see "What's explicitly NOT decided here" above. This record intentionally carries
no recommendation; the design pass starts clean when scoping begins.

## Sources

- `apps/backend/src/modules/orders/checkout.service.ts`,
  `apps/backend/src/modules/orders/dto/checkout.dto.ts`,
  `apps/backend/src/modules/orders/models/order.model.ts` (confirmed: `deliveryAddress` only,
  no delivery-fulfilment concept exists)
- [0036-vendor-loading-unloading-capability.md](0036-vendor-loading-unloading-capability.md)
  (adjacent but distinct — vendor's own capability, not platform delivery coordination)
- [0042-cart-and-order-structure.md](0042-cart-and-order-structure.md) (existing
  `OrderVendorGroup` status model, the likely integration point)
- `Golden Abode – Home Finishing Marketplace Platform.pdf` (signed proposal — delivery module not
  named anywhere in it; confirmed new scope beyond contract)
