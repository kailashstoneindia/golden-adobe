# 0007 — Colour-family pricing; base leaves the paint SKU

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes:** the pricing model and SKU definition in
  [0002](0002-paint-shade-and-tinting.md). The rest of 0002 — shade as order-time
  configuration, `sale_unit_type = 'tinted_to_order'`, order-line snapshotting — stands
  unchanged.

## Context

Client confirmation: **paint is priced per colour family, not per shade or depth.** A vendor
sets one price for blue; the customer then picks any blue shade at that price.

0002 had assumed the industry-standard structure — price the base, then add a colorant
delta scaled by depth band and pack volume. That model is now wrong for this business, and
it was the reason `base_type` was part of the SKU at all.

## What this changes

### Pricing moves from catalog reference data to vendor data

`paint_colorant_delta` was a brand-level (or global) table computing
`delta_per_litre × pack_volume_litres`. It is **dropped**. Price is a vendor concern, and it
now lives with the vendor:

```sql
vendor_listing_colour_price (
  vendor_listing_id  REFERENCES vendor_listing(id),
  colour_family      paint_colour_family,
  price              NUMERIC(12,2),
  PRIMARY KEY (vendor_listing_id, colour_family)
)
```

A vendor listing is already for one product at one pack size, so the price is fully
specified. **The per-litre multiplication disappears entirely** — no scaling, no derived
arithmetic at order time. `pack_volume_litres` existed only to feed that calculation and is
dropped with it.

A colour family with no row is simply not offered by that vendor.

### `base_type` leaves `master_product`

0002 made base the SKU because base carried both the price and the stock. The client has
removed the pricing reason, and the remaining two jobs — inventory unit and fulfilment
instruction — do not justify splitting the catalog.

```
Before:  Royale Luxury Emulsion, White Base, 20L
         Royale Luxury Emulsion, Medium Base, 20L    ~96 rows/brand
         Royale Luxury Emulsion, Deep Base, 20L
         Royale Luxury Emulsion, Neutral Base, 20L

After:   Royale Luxury Emulsion, 20L                 ~24 rows/brand
```

Two reasons this had to change once pricing did:

1. **Customers would see four near-identical products** per paint line and be asked to
   choose between concepts they neither understand nor care about.
2. **A colour family does not map to one base.** Light blue comes from pastel base, navy
   from deep. Keeping base in the SKU would force one "blue" price to be duplicated across
   several listings — directly contradicting "one price for blue".

Base is now resolved *from the shade* at fulfilment and written onto the order line as an
instruction to the shop.

### `paint_shade_base_compatibility` collapses into a column

With base no longer priced, the table's only remaining job is telling the shop which bucket
to open. That is what the brand's shade card states, one base per shade:

```sql
paint_shade.base_type   paint_base_type NOT NULL
```

The many-to-many table is dropped. If a brand ever genuinely supports one shade from two
bases, this reverts to a join table — but that is not worth carrying now for a fulfilment
hint.

`paint_shade.depth_band` is also dropped. It existed to key the colorant delta; with the
delta gone and base stated directly, nothing reads it.

### `colour_family` becomes load-bearing

It was a search facet — a free-text `VARCHAR(32)`. It is now a **pricing key**, so a typo
would create an unpriced or mispriced colour. It becomes a Postgres enum
`paint_colour_family`, giving referential integrity to `vendor_listing_colour_price` for
free.

### Paint inventory becomes availability, not a count

`inventory` counts what a `vendor_listing` points at. Now that a listing is a product line
rather than a bucket of base, there is nothing countable — a vendor holding 12 buckets
across four bases cannot express that against one listing.

For paint, `vendor_listing.status` (`active` / `out_of_stock`) carries availability, and
`inventory` rows are not required. This is a deliberate accuracy loss, judged acceptable
because local shops were never going to maintain per-base bucket counts.

## Consequences

- **Two tables removed, one added** — a net reduction of one.
- `cached_best_price` for paint is now `MIN(vendor_listing_colour_price.price)` across a
  product's listings — in practice the white/untinted family. Still rendered "from ₹X" via
  `price_is_from`, since the customer's chosen family may cost more.
- The order-line `configuration` payload gains the resolved base as a fulfilment
  instruction:
  `{ paint_shade_id, shade_code, shade_name, hex, colour_family, base_type }`
- **`Base Type` is no longer a product attribute.** It must be removed from the Paint
  level-1 attribute list in [catalog-structure.md](../catalog-structure.md), where 0002 had
  it as variant-defining but non-filterable.
- Vendors now maintain N price rows per listing (one per colour family they stock) rather
  than a single price. Bulk editing matters — a vendor with 50 paint listings and 10
  families is maintaining 500 numbers.
- Colour families are now a commercial vocabulary, not just a UI convenience. Adding one
  later means `ALTER TYPE` plus vendors setting a price for it.

## Open questions

1. **Does a vendor price colour families per listing, or once across all their paint?**
   Per-listing is modelled here and is the more expressive. If vendors find it tedious, a
   vendor-level default with per-listing override is the natural next step.
2. **What happens when a customer picks a shade whose family the vendor hasn't priced?**
   Hide the shade, or show it as unavailable from this vendor. A UI decision, but it needs
   answering before the shade picker is built.
3. **Untinted white** — is it a `colour_family` value like any other, or a distinct
   "no tinting required" case? Modelled as a family for now.
4. Whether dropping paint `inventory` rows entirely is right, or whether an
   `is_in_stock` boolean on the listing would be clearer than overloading `status`.

## Sources

Client confirmation relayed 2026-08-02. No external research — this is a commercial policy
decision, not a technical constraint.
