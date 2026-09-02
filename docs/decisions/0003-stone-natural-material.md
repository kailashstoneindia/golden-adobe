# 0003 — Stone as a natural, lot-varying material

- **Date:** 2026-08-02
- **Status:** **Partially superseded by [0009](0009-stone-price-list-model.md)**
- **Superseded by:** 0009 makes `stated_grade` part of listing identity (one Excel row per
  grade) and removes `vendor_listing_media` — no vendor imagery anywhere. The identity model
  here — variety + finish + thickness, `stone_variety` aliases, conservative import
  matching, `has_natural_variation` — stands unchanged.
  ([0008](0008-stone-bundle-tier.md) briefly replaced both with a bundle tier and was itself
  superseded.)

## Context

The catalog model assumes a `master_product` is a *real, physically identical SKU* — one
row per manufactured thing, deduplicated across vendors, with vendors differing only in
price, stock and service area. That holds for a switch or a TMT bar. It does not hold for
granite and marble.

Natural stone varies block to block and shipment to shipment. It has no GTIN and no
manufacturer part number — a variety is identified by a **trade name** ("Black Galaxy",
"Kashmir White", "Steel Grey") tied to a quarry region, not by a brand. Two vendors selling
"Black Galaxy" are selling genuinely different material.

Two findings from trade practice shaped this record:

- **Grading is not standardized.** Grade A/B/C and First Choice / Commercial / Builder are
  both in use, but different quarries, importers and distributors each run in-house
  systems, and *the same word means different things depending on origin country* — Indian,
  Brazilian and Chinese granite are graded under different conventions.
- **Indicative imagery is universal practice, not a hedge.** Every stone seller carries the
  same disclaimer: the material delivered may differ from the picture, and a later order is
  not guaranteed to match the first. Sellers actively encourage buyers to request photos of
  the *current lot*, and blending is treated as the installer's responsibility.

## Options considered

### What is one `master_product` row for stone?

**A — Variety + finish + thickness** *(chosen)*
- **Pro:** Preserves the core value proposition — "who has Black Galaxy cheapest near me" —
  and keeps dedup meaningful. Lot-specific reality lives on the listing where it belongs.
- **Con:** Asserts that two vendors' "Black Galaxy Polished 18mm" are the same product when
  physically they are not. Mitigated by the disclaimer and lot photos below.

**B — Each vendor's stone is its own product**
- **Pro:** Honest about lot variation; no false equivalence between two vendors' slabs.
- **Con:** Kills price comparison for the entire category and fragments search results into
  near-duplicate entries — exactly the catalog fragmentation the master/listing split exists
  to prevent.

**C — Variety only; finish and thickness as attributes**
- **Pro:** Fewest rows.
- **Con:** A polished 18mm and a flamed 30mm slab differ in price by multiples, so a single
  `cached_best_price` across both is meaningless.

### Where does grade live?

**A — On `vendor_listing`** *(chosen)*
- **Pro:** Grade is a claim about *that vendor's stock*, structurally alongside price and
  stock level. Matches the finding that no cross-vendor standard exists.
- **Con:** Not filterable as a catalog facet without normalization, which is deliberately
  deferred.

**B — As a `master_product` attribute**
- **Pro:** Familiar shape; grade becomes variant-defining and filterable.
- **Con:** Asserts cross-vendor comparability that demonstrably does not exist. One
  vendor's "Grade A" and another's are different claims — presenting them as one facet is
  misleading precision.

**C — Not captured at MVP**
- **Con:** Grade drives price differences of 2–3× in this category, so buyers would be
  comparing prices that are not comparable.

## Decision

### `master_product` for stone = variety + finish + thickness

"Black Galaxy Granite, Polished, 18mm" is one canonical, admin-owned row. Vendors attach
listings to it. Nominal slab size and origin are attributes; the variety trade name carries
the identity.

### `is_generic = true`, but the trade name is real identity

Stone shares sand's and aggregate's lack of a `brand_id`, so `is_generic` is set. But the
two are not the same case: sand has no identity beyond category + attributes, whereas
"Black Galaxy" is a strong, recognized name that simply is not a *brand*. The product name
carries weight here that it does not for aggregate.

### Grade lives on `vendor_listing` as a vendor-stated claim

```sql
vendor_listing (
  ...
  stated_grade   VARCHAR   -- vendor's own label, displayed verbatim and attributed
)
```

Stored and shown as free text, not an enum. An enum would normalize labels that the
research shows are **not equivalent across vendors or origins** — the appearance of
comparability is worse than no facet at all. Displayed as "Vendor-stated grade: …", never
as a neutral product property.

### A `stone_variety` reference table with aliases

The `catalog_import_row` match order in the draft schema is *exact GTIN → MPN → brand +
category + attributes → fuzzy name*. For stone the entire top of that order is unavailable.
Vendors will upload "Black Galaxy", "black galexy", "BG Granite", "Galaxy Black".

```sql
stone_variety (
  id, name, slug,
  stone_type,        -- granite | marble | kota | sandstone | …
  origin_region,     -- quarry region, e.g. 'Andhra Pradesh'
  is_active
)

stone_variety_alias (
  id, stone_variety_id, alias   -- normalized lowercase; drives import matching
)
```

Structurally the same move as `paint_shade` in [0002](0002-paint-shade-and-tinting.md): a
reference table for values that are neither attributes nor SKUs.

**Import matching for stone is alias-first, and defaults to review.** Match order becomes
*variety alias exact → fuzzy name*. Rows resolve to `needs_review` rather than
`auto_matched` unless an alias matches exactly, because fuzzy-matching trade names across
vendors is exactly how a catalog fragments.

### Imagery — indicative master image plus vendor lot photos

```sql
master_product_media (
  ...
  is_representative BOOLEAN   -- indicative of the variety, not a specific slab
)

vendor_listing_media (
  id, vendor_listing_id, url, type,
  captured_at,                -- lots turn over; stale photos mislead
  display_order
)
```

The PDP shows the admin-curated representative image with a natural-variation disclaimer;
the vendor-compare section shows each vendor's current-lot photos. This matches trade
practice, where buyers ask for current-lot pictures before committing.

### `has_natural_variation` on `master_product`

```sql
master_product (
  ...
  has_natural_variation BOOLEAN   -- drives the disclaimer badge on the PDP
)
```

A flag rather than stone-specific copy, because it generalizes: tiles carry shade-variation
ratings (V3/V4), and laminate and wood vary by batch too. The disclaimer text lives in the
UI layer; the schema only records that the product needs one.

## Consequences

- **Dedup stays worthwhile for stone, but is tuned differently.** The original question was
  whether strict vendor-listing dedup is meaningful for a lot-varying material. It is —
  because the alternative fragments the catalog — but auto-match confidence must be far
  more conservative here than for manufactured goods.
- **`stated_grade` is not filterable.** Buyers cannot narrow by grade at MVP. This is a
  deliberate accuracy-over-features trade; see open questions.
- **Price comparison for stone carries an asterisk.** Two listings on the same
  `master_product` may be different grades at different prices, and that is legitimate, not
  a data error. Vendor-compare UI must surface `stated_grade` alongside price or the
  cheapest listing looks unambiguously best when it may not be.
- **`vendor_listing_media` is a new entity** — the first case of vendor-supplied imagery.
  It needs the same moderation path as any other vendor-uploaded content.
- **Stone attribute set** must be drawn up with finish and thickness as variant-defining,
  consistent with the SKU definition above (open question 3 of
  [0001](0001-category-tree-and-attributes.md)).

## Open questions

1. **Whether to add a coarse normalized grade band later** (premium / standard /
   commercial) for filtering, accepting that it is approximate and vendor-declared. Deferred
   rather than rejected — filterability has real value if the UI is honest about its
   provenance.
2. **Lot-level inventory.** Trade practice is to buy from a specific lot and see that lot's
   slabs. Modeling `inventory` per lot rather than per listing would support "reserve these
   slabs", but is a significant addition. Post-MVP.
3. **Sample requests.** Buyers commonly request a physical sample or current-lot photos
   before ordering. This is a real trade behaviour with no home in the schema — an enquiry
   flow rather than an order.
4. **Wastage calculation.** Stone is bought by area plus a wastage margin. Treated as a UI
   concern for now, but if quantities must reconcile against `inventory`, it may need to be
   captured on the order line.

## Sources

- [Different Qualities of Black Galaxy Granite — Marmo Granite](https://marmogranite.com/different-qualities-of-black-galaxy-granite-quality/)
- [Granite Slab Grading: First Choice vs. Commercial Grade](https://dynamicstonetools.com/blogs/news/granite-slab-grading-first-choice-vs-commercial-grade-explained-3)
- [Granite Grades A, B, C — Petros Stone](https://petrosstone.com/granite-grades-levels/)
- [How Granite Slabs Are Graded: A Complete Quality Guide](https://kowalskigraniteandquartz.com/how-granite-slabs-are-graded-quality-guide/)
- [Natural Stone Disclaimer — Stone & Tile Shoppe](https://stoneandtileshoppe.com/pages/disclaimer)
- [Natural Stone Disclaimer — Marmiro Stones (PDF)](https://marmiro.com/wp-content/uploads/2021/11/Natural-Stone-Disclaimer.pdf)
- [Natural Products Disclaimer — Visions Supply & Design](https://www.visionssupplyanddesign.com/natural-products-disclaimer.html)
