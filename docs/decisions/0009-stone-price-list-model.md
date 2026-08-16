# 0009 — Stone as a price list, not a bundle inventory

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes:** [0008](0008-stone-bundle-tier.md) entirely. Reinstates the
  [0003](0003-stone-natural-material.md) model with one change (the unique constraint) and
  one removal (vendor imagery).

## Context

0008 introduced a bundle tier for stone — `stone_bundle` plus `stone_bundle_media` — on the
strength of research into MSI Surfaces, Arizona Tile, Architectural Surfaces, Moraware and
Slabsmith.

**That research was US-centric, and generalising from it was a mistake.** Those are American
distributors and fabricator software: 17 distribution centres, slab scanners, per-slab
serial numbers, 30,000+ photographs. The conclusion drawn from them — that the physical tier
is how stone is sold — is true *there*.

Research into the Indian market shows a different trade. Every major Indian source —
RK Marbles, Petros, Stonegalleria, Sudarshan Stone, Nakul International — publishes the same
structure:

> **rate per sq ft, varying by stone type × thickness × finish × quality grade**

Granite typically ₹45–₹250/sq ft, marble ₹30 to over ₹3,000/sq ft, with volume discounts
around 5–10% above 500 sq ft. Kishangarh is the processing hub, and dealers quote from
lists.

That is **a row in a spreadsheet**. Not a photographed block-batch with slab counts and
measured dimensions. And crucially, *grade appears in those lists as an ordinary pricing
column* — which is the simple answer that 0008 stepped over.

This also matters because the platform's onboarding is Excel-first: admin uploads the master
catalog as a spreadsheet, vendors upload inventory and new-product requests the same way.
A bundle tier fights that flow. A price-list row is the flow.

## Decision

### Drop the bundle tier

`stone_bundle` and `stone_bundle_media` are removed, along with the `stone_bundle_status`
and `moderation_status` enum types — a net removal of two.

### Grade becomes part of the listing's identity

`stated_grade` returns to `vendor_listing`, still free text and still shown as a
vendor-attributed claim. The uniqueness rule widens so a yard can quote two grades at two
prices, exactly as their printed price list does:

```sql
CREATE UNIQUE INDEX vendor_listing_unique
  ON vendor_listing (vendor_id, master_product_id, COALESCE(stated_grade, ''));
```

`COALESCE` rather than a plain multi-column constraint because Postgres treats NULLs as
distinct — without it, a vendor could create unlimited duplicate listings for any
non-stone product simply by leaving grade empty.

One vendor Excel row becomes one listing:

```
variety | finish | thickness | grade | price_per_sqft | qty_sqft | pincodes
```

### No vendor-supplied imagery

The master catalog carries admin-curated representative images
(`master_product_media.is_representative`), and nothing else. This resolves the original
objection — that vendor imagery was justified narrowly for stone and built broadly — by
removing the capability rather than scoping it, and it eliminates the moderation queue
entirely.

Buyers wanting current-lot photographs contact the vendor. For a category where the
realistic journey is "check the rate online, then visit the yard", that is an acceptable
trade.

### Stone uses `inventory` normally again

Quantity in sq ft against the listing. `pricing_mode` drops back to two values — `flat` and
`by_colour_family` — so **paint is the only pricing exception**, and stone stops being one.

> *Later:* [0016](0016-colour-price-per-listing.md) removed `pricing_mode` altogether. The
> point above still holds — stone prices flat — but the column no longer exists.

## What survives from 0003

Everything load-bearing: `master_product` as variety + finish + thickness, `stone_variety`
and `stone_variety_alias` for matching, alias-first import order defaulting to
`needs_review`, `is_generic` with `stone_variety_id` carrying identity, and
`has_natural_variation` driving the PDP disclaimer.

## Consequences

- **Two tables removed** (`stone_bundle`, `stone_bundle_media`).
- Three pricing modes become two. One fewer code path for price display, cart, and
  `cached_best_price`.
- **Buyers cannot see the actual material online.** This is the real cost, and it is a
  genuine reduction in what the platform offers for stone. Mitigated only by the
  natural-variation disclaimer and by the expectation that stone buyers visit the yard.
- Best-price comparison across vendors now compares grades that are not comparable. The
  vendor-compare UI must display `stated_grade` beside price — the same requirement 0003
  identified, now more important because grade is the only quality signal.
- `stated_grade` free text means "Grade A", "grade-a", "A grade" and "1st Quality" are four
  distinct listings for one vendor. Normalisation at import is needed, or the uniqueness
  rule is toothless.

## Bundles as a documented future option

The 0008 design is not deleted — [0008](0008-stone-bundle-tier.md) remains readable with
its research intact. Revisit it if any of these appear:

- Vendors ask to show lot photographs to win larger orders.
- Buyers transact for stone online rather than treating listings as lead generation.
- A vendor onboards who already runs slab inventory software.

The migration path is additive: `stone_bundle` hangs off `vendor_listing`, so adding it
later does not invalidate listings created under this model.

## Open questions

1. **Normalising grade labels at import** — a controlled suggestion list during upload, or
   free text with fuzzy dedup? Without this the unique constraint does not bite.
2. Whether volume discounts (5–10% above 500 sq ft is standard trade practice) need
   modelling, or are left to vendor negotiation off-platform.
3. Whether `min_order_qty` in sq ft is sufficient, given stone is sold by the slab and
   partial slabs are usually not cut.

## Sources

- [Granite Price List India — RK Marbles](https://www.rkmarblesindia.com/granite-price/)
- [Granite Price in India — Petros](https://petrosstone.com/granite-price-in-india/)
- [Marble Price in India — Petros](https://petrosstone.com/marble-price-in-india/)
- [Indian Granite Price List by Colour, Thickness & Finish — Stone Galleria](https://www.stonegalleria.in/granite-price/)
- [Granite Price per Sq Ft — Sudarshan Stone](https://sudarshanstoneix.com/product/granite-price-per-sq-ft-in-india/)
- [Marble & Granite Cost per Sq Ft India 2026 — Comaron](https://www.comaron.com/blog/marble-granite-cost-per-sq-ft-india-2026-complete-price-guide)
- [Spreadsheet uploads for vendor catalog management — CSVBox](https://blog.csvbox.io/spreadsheet-uploads-streamlined-vendor-catalog-saas-marketplaces/)
