# 0043 — Minimum order value per vendor, replacing per-listing minimum order quantity

- **Date:** 2026-10-21
- **Status:** Accepted
- **Supersedes / Superseded by:** Supersedes checkout's enforcement of `vendor_listing.min_order_qty` (decision 0042 rule 3). Does not touch `vendor_listing.min_order_qty` itself — see Consequences.

## Context

Checkout rejected a line if its requested quantity was below that listing's
`min_order_qty` (decision 0042 rule 3 — "enforced per listing, never against the
cart total"). Client request (2026-10-21): drop the quantity minimum entirely and
replace it with a minimum order **value** — a vendor should be able to say "I
don't accept orders under ₹X," not "you must buy at least N units of this
specific product."

`min_order_qty` itself is not just a checkout concept. It is a real column on
`vendor_listing`, set per product row, and it round-trips through the vendor's
bulk-upload Excel template (`vendor-catalog-export.service.ts`,
`vendor-catalog-import.service.ts`) — vendors already fill it in today. Removing
the column would break that spreadsheet contract for every vendor currently
using it, which is a bigger, separate change than what was actually asked for:
stop enforcing it at checkout.

## Options considered

### Option A — Minimum order value per vendor (chosen)

- **Pro:** Matches how checkout already splits by vendor (decision 0042 rule 2 —
  "one order, one payment, N order_vendor_groups"). A vendor's subtotal across
  every valid line they're selling in this checkout is checked against their own
  minimum, once, after grouping — not once per line.
- **Pro:** Vendor-specific, not a single global number — a vendor with a low
  average order value can set a low minimum, one with high shipping costs per
  trip can set a high one.
- **Con:** A brand-new vendor with no minimum set yet (`NULL`) is unconstrained —
  the system can't retroactively enforce a minimum the vendor never answered.
  Accepted explicitly, same shape as `has_loading_unloading_team`'s NULL handling
  (0036): treat unset as "no minimum," not as a block.

### Option B — Minimum order value per cart/order total (all vendors combined)

- **Pro:** Simpler mental model for the customer — one number, "your whole order
  must be at least ₹X."
- **Con:** Doesn't match what was actually asked (a _vendor's_ minimum, not a
  platform-wide one) and doesn't match the existing per-vendor-group structure
  checkout already computes subtotals in. A multi-vendor cart where one vendor's
  items are ₹50 and another's are ₹5000 would pass a combined-total minimum
  while giving the ₹50 vendor an order they explicitly said they don't want.
  Rejected.

### Option C — Remove `vendor_listing.min_order_qty` entirely (column, Excel template, import/export)

- **Pro:** Fully clears the old concept out of the schema instead of leaving an
  unused-at-checkout column behind.
- **Con:** Breaks the vendor bulk-upload Excel template for every vendor
  currently using the `min_order_qty` column, and requires a new template
  version plus vendor-facing communication about the change. Nothing about the
  client's request asked for the column to disappear — only for checkout to stop
  enforcing it. Rejected as out of scope for this request; left as a possible
  future cleanup if the column is confirmed genuinely unused elsewhere.

## Decision

Add a nullable `vendors.min_order_value` column (`DECIMAL(12,2)`, `>= 0` or
`NULL`). Checkout computes each vendor group's subtotal of valid lines
(`price * quantity`, summed) and rejects the whole checkout (all-or-nothing,
same as every other checkout rule per 0042 rule 4) if any vendor's subtotal is
below their own `min_order_value` — but only when that vendor has one set.
`NULL` means no minimum is enforced for that vendor, not that every order from
them is blocked.

`vendor_listing.min_order_qty` is left exactly as it was everywhere else:
column, model, Excel import/export template, admin/vendor catalog UI. Checkout
is the only place that stopped reading it.

## Why

The client's ask was specifically about checkout behavior ("we don't want
minimum order qty, but we can do minimum order value") — not about the catalog
column vendors already use. Scoping this to checkout enforcement only avoids a
disruptive, unrequested change to the vendor onboarding spreadsheet contract
while still delivering exactly the behavior asked for.

Per-vendor (not global) matches how `has_loading_unloading_team` already works
— a fact the vendor supplies about themselves, plain and nullable, no admin
override column alongside it, surfaced through the same `VendorOnboardDto`
/ `UpdateVendorProfileDto` / `VendorProfileDto` triangle in `@golden-abode/types`.

## Consequences

- Checkout's `CartLineForCheckout` query now also selects `v.min_order_value`
  (joined from `vendors`) and no longer selects or reads
  `vl.min_order_qty` at all — removed from the interface and the SQL, since it
  had no remaining reader once this landed.
- A vendor with `min_order_value` set can reject an otherwise-valid line's
  checkout if their total subtotal (summed across every listing of theirs in
  that cart) falls short — this is new: a line that passed every other check
  (stock, listing status, vendor active) can still fail checkout purely because
  of what else is or isn't in the same cart for that vendor.
- Every vendor onboarded before this migration has `min_order_value = NULL` —
  unconstrained, same as before this decision, until they set one via
  `PATCH /vendors/me` or at onboarding.
- `vendor_listing.min_order_qty` remains in the schema, display-only as far as
  checkout is concerned. A future decision may revisit removing it fully
  (Option C above) if it's confirmed unused elsewhere — not done here.

## Open questions

- Should the vendor onboarding/profile UI surface a recommended minimum, or
  leave it entirely to the vendor's judgment? Not addressed here — purely a
  backend/API change.
- Whether `min_order_qty` should eventually be removed from the catalog schema
  and Excel template entirely (Option C) is left for a later decision.

## Sources

- None — internal decision based on direct client request (2026-10-21).
