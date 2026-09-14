# 0008 — Stone bundles, and a unified vendor pricing mode

- **Date:** 2026-08-02
- **Status:** **Superseded by [0009](0009-stone-price-list-model.md)** — the research behind
  this record was US-centric (MSI, Moraware, Slabsmith), and Indian stone is a price-list
  trade. Kept in full because the bundle design remains the right answer if vendors ever
  want to show lot photographs; the migration path is additive.
- **Originally superseded:** the grade and imagery mechanisms in
  [0003](0003-stone-natural-material.md). The identity model there — variety + finish +
  thickness, `stone_variety` aliases, conservative import matching — stands unchanged.

## Context

Two problems were open on stone, and researching how the industry solves them turned out to
answer both with one structure.

**Problem 1 — a vendor cannot price two grades.** `vendor_listing` has
`UNIQUE (vendor_id, master_product_id)`, so a yard stocking both Grade A and commercial-grade
Black Galaxy Polished 18mm can hold exactly one price. Grade drives price by 2–3× in this
category, so this is not an edge case.

**Problem 2 — vendor imagery was justified narrowly and built broadly.** 0003 introduced
`vendor_listing_media` for stone lot photos, but hung it off `vendor_listing` generally, so
any vendor could upload images for a tap or a bag of putty. It also had no moderation
column despite 0003 saying it needed one. This was a fair challenge and had no good answer
within the existing shape.

## What the industry does

Every serious stone system splits **material** from **the physical slab**:

- MSI Surfaces markets 30,000+ slab photographs as "the largest selection of real-time slab
  inventory in the world", with a "Preview Actual Slabs Available In Your Area" flow across
  17 distribution centres.
- Architectural Surfaces: "explore live inventory, or visit one of our 20+ galleries to
  hand-select your exact slab."
- Moraware Inventory tracks each slab by serial number through ordering → receiving →
  allocating → consuming, with printable slab labels. Slabsmith photographs each slab
  digitally, and a slab-scanner integration now syncs images and metadata automatically.

**The most useful finding is a negative one: none of them expose "grade" as a field or a
filter.** They show the actual slab instead. Grade is verbal shorthand for how much veining
and how many defects a slab has — and if the buyer can see the specific piece, the shorthand
is redundant. `stated_grade` was a workaround for not having a physical tier, and it was
the direct cause of Problem 1.

## Decision

### A bundle tier between the listing and the physical stone

Full slab-level tracking is not viable here — MSI has scanners and distribution centres; a
local yard has a phone, and will not serialise and photograph every slab. But the
intermediate tier the trade already uses *is* viable: the **bundle**, meaning slabs cut from
one block, sold together, sharing one photograph and one price.

```sql
stone_bundle (
  id,
  vendor_listing_id,      -- the variety + finish + thickness being sold
  bundle_code,            -- vendor's own lot reference
  block_number,           -- quarry block, where known
  slab_count,
  slab_length_mm, slab_width_mm, thickness_mm,   -- ACTUAL, not nominal
  total_area_sqft,
  price_per_sqft,         -- this bundle's price
  stated_grade,           -- now optional and descriptive
  status,                 -- available | reserved | sold
  notes
)

stone_bundle_media (
  id, stone_bundle_id, url,
  captured_at,
  moderation_status,      -- pending | approved | rejected
  display_order
)
```

One photo per bundle rather than per slab is the difference between a workflow a local yard
will actually follow and one it won't.

### `vendor_listing_media` is dropped

Bundle photos are what stone imagery always meant. Attaching them to `stone_bundle` scopes
vendor-supplied imagery **structurally** — the table only exists for stone, so there is no
way to upload a photo of a tap. That is a better answer than a `has_natural_variation` check
or a category filter, because nothing needs enforcing.

`stone_bundle_media.moderation_status` closes the gap 0003 opened and never filled.

### Pricing mode becomes explicit on the listing

Three pricing shapes now exist, and leaving them implicit would make `cached_best_price`
unreadable:

```sql
vendor_listing (
  ...
  pricing_mode,   -- 'flat' | 'by_colour_family' | 'by_bundle'
  price,          -- NULL unless pricing_mode = 'flat'
  CHECK ((pricing_mode = 'flat') = (price IS NOT NULL))
)
```

| Mode | Price source | Used by |
|---|---|---|
| `flat` | `vendor_listing.price` | Everything ordinary |
| `by_colour_family` | `vendor_listing_colour_price` | Paint ([0007](0007-colour-family-pricing.md)) |
| `by_bundle` | `stone_bundle.price_per_sqft` | Stone |

`cached_best_price` is the minimum across whichever source the mode names. This also makes
the two exceptions legible rather than special-cased in application code.

### Grade demoted; the unique constraint stays

`stated_grade` moves from `vendor_listing` to `stone_bundle`, where it is optional
descriptive text alongside a photograph rather than the only quality signal. `UNIQUE
(vendor_id, master_product_id)` is **kept** — a vendor still has one listing per stone
product, and expresses grade and price variation through bundles beneath it.

### Stone inventory lives on bundles

`slab_count` and `total_area_sqft` are the stock. Like paint, stone does not use the
`inventory` table — but for the opposite reason. Paint has nothing countable; stone has
something countable that `inventory` cannot express, because quantity varies per bundle
rather than per listing.

## Consequences

- **Net +1 table**: `stone_bundle` and `stone_bundle_media` added, `vendor_listing_media`
  removed. 22 tables.
- **Vendor onboarding for stone gets heavier.** A yard must enter bundles, not just a price.
  This is real friction and the main cost of the decision — but it is also the only way to
  show a buyer what they are actually getting.
- `status = 'reserved'` gives a natural hold mechanism, mirroring the allocate/consume step
  in fabricator software. How reservations expire is not designed here.
- **Best-price comparison for stone now compares bundles**, which are genuinely different
  material at genuinely different prices. The vendor-compare UI must show the bundle photo
  and dimensions next to the price, or the cheapest looks best when it may be a smaller or
  lower-quality lot.
- A listing with no `available` bundles should not surface as in-stock; `vendor_listing.status`
  and bundle availability must be kept consistent.
- Three pricing modes mean three code paths for price display, cart, and
  `cached_best_price` recomputation. Explicit in the schema, but still three.

## Open questions

1. **Reservation expiry.** A bundle held indefinitely by an abandoned cart is worse than no
   hold at all.
2. **Partial bundle sales.** Can a buyer take 3 slabs from a 7-slab bundle? Trade practice
   varies; splitting affects `slab_count` and `total_area_sqft` and may need a bundle-split
   operation.
3. **Wastage** (0003 open question 4) is now sharper: buyers order area, bundles contain
   slabs, and the two do not divide evenly.
4. Whether `master_product.thickness` (nominal) diverging from `stone_bundle.thickness_mm`
   (actual) should be surfaced to the buyer or silently tolerated.

## Sources

- [Moraware Inventory — slab ordering and tracking](https://www.moraware.com/countertop-software/inventory-tracking/)
- [Moraware slab scanner integration](https://www.moraware.com/2026/04/slab-scanner-integration-launches-for-inventory/)
- [Moraware / Slabsmith integration — DataBridge](https://databridgeinc.com/fabricator-software-systemize-slabsmith-integration/)
- [MSI: website shows availability of slabs by location](https://www.msisurfaces.com/news/msi-website-offers-preview-of-slabs-available-locally/)
- [Architectural Surfaces — live inventory](https://arcsurfaces.com/)
- [NoriaStrata — slab inventory management for natural stone](https://www.noriastrata.com/en/slab-inventory)
