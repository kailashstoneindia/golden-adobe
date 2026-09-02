# 0015 — Colour pricing as a per-vendor delta

- **Date:** 2026-08-02
- **Status:** **Superseded by [0016](0016-colour-price-per-listing.md)** — the per-listing
  override it needed introduced an availability-versus-rate distinction confusing enough to
  outweigh the saving, and the pre-filled export had already removed the data-entry cost the
  delta existed to avoid. Kept in full: the reasoning is the right starting point if a
  vendor-level default is ever wanted underneath the per-listing table.
- **Supersedes:** `vendor_listing_colour_price` from
  [0007](0007-colour-family-pricing.md); the `pricing_mode` column from
  [0008](0008-stone-bundle-tier.md)

## Context

[0007](0007-colour-family-pricing.md) modelled colour pricing as an absolute price per
listing per colour family — `vendor_listing_colour_price`. That is precise, but a vendor
with 50 paint listings and ten colour families maintains **500 prices**, and every price
change means editing rows across the whole set.

The alternative considered was a per-vendor price, which cannot work as an absolute figure:
Royale 20L in blue and Tractor 4L in blue are different amounts of money.

Resolved as a **per-vendor delta on top of an ordinary listing price**.

## Decision

### `vendor_colour_delta`, set once per vendor

```sql
vendor_colour_delta (
  vendor_id,
  colour_family,
  delta_per_litre,
  PRIMARY KEY (vendor_id, colour_family)
)
```

```
delta      = COALESCE(vendor_listing.colour_delta_per_litre,   -- optional override
                      vendor_colour_delta.delta_per_litre)     -- vendor default

unit_price = vendor_listing.price + (delta × master_product.pack_content_qty)
```

A vendor maintains their base prices per product, plus roughly ten deltas — not 500 prices.

### Why one delta can span different product lines

The obvious objection is that Royale and Tractor are different products, so why should they
share a colour delta?

Because the vendor-level delta represents **colorant cost**, and that is genuinely
product-independent: tinting 20L of deep blue consumes the same colorant whether the base is
a premium or an economy line.

What *is* product-dependent is **margin** — a shop may charge more to tint a premium line
because those buyers are less price-sensitive. That is what the per-listing override covers:

```sql
vendor_listing.colour_delta_per_litre  NUMERIC(10,2)   -- NULL = use vendor default
```

One nullable column, no new table, no new join. The common path is untouched: a vendor sets
about ten deltas and never fills this in. A vendor who wants Royale tinted at a different
rate fills one cell on that listing.

### Why per litre

Colorant is physically dispensed by volume, so cost scales with volume. A flat
"+₹250 for blue" would be simultaneously wrong on a 1L tin and a 20L bucket.

**Percentage was rejected.** It scales with the base price rather than with volume, so a
premium line would be charged more colorant than an economy line of the same size — when
both need the same amount.

**No new column is needed for the volume.** Tinted products are always sold in litres, so
`pack_content_qty` already carries it. Putty, sold by weight, is never tinted.

### `pricing_mode` is dropped

Introduced in 0008 for three pricing shapes, cut to two in 0009. With colour expressed as a
delta on top of a normal listing price, **every listing prices the same way** and there is
nothing left to switch on. `vendor_listing.price` returns to `NOT NULL`, and the paired
CHECK constraint goes with it.

`sale_unit_type = 'tinted_to_order'` already tells the UI that a delta applies.

## Consequences

- **21 tables** — `vendor_listing_colour_price` out, `vendor_colour_delta` in.
- `vendor_listing` loses a column and a constraint; `price` is `NOT NULL` again.
- **Paint's vendor template collapses to the ordinary shape** — one row per product with a
  base price — plus a separate ten-row colour-delta sheet uploaded once. It no longer needs
  pre-expanding to one row per colour family.
- `cached_best_price` for paint is the untinted base price, still rendered "from ₹X".
- **No accuracy is lost.** `vendor_listing.colour_delta_per_litre` overrides the vendor
  default per listing, so a vendor charging differently for blue on Royale versus Tractor can
  express it. Nullable, so the common path stays a single vendor-level number.
- One fewer pricing code path in cart, display and `cached_best_price` recomputation.
- Price resolution is a two-level `COALESCE`, so it lives in **one shared function**,
  `resolve_unit_price(vendor_listing_id, colour_family)`. Price display, the cart, order
  lines and `cached_best_price` recomputation all call it. Reimplementing the logic per call
  site is how a product page and a cart end up disagreeing on price.

  ```sql
  resolve_unit_price(listing_id)          → untinted floor, the "from ₹X" figure
  resolve_unit_price(listing_id, 'blue')  → tinted price
                                          → NULL if the vendor doesn't offer blue
  ```

  Returning `NULL` for an unoffered colour is deliberate — it is the same signal 0007
  defined, now enforced in one place. An override with no matching `vendor_colour_delta` row
  still returns `NULL`: the vendor-level row is what declares a colour offered at all, and
  the override only changes its rate.

## Open questions

1. Should `delta_per_litre = 0` for white be seeded automatically, or left for the vendor to
   enter? Seeding it avoids a common omission that would make untinted white unavailable.
2. Should the override be exposed in the vendor Excel template from day one, or only in the
   portal UI? Adding a column most vendors leave blank has its own cost.
