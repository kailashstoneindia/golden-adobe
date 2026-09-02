# 0002 — Paint shade, bases, and tinted-to-order products

- **Date:** 2026-08-02
- **Status:** **Partially superseded by [0007](0007-colour-family-pricing.md)**
- **Superseded by:** 0007 replaces the pricing model (base price + colorant delta by depth
  band) with vendor-set pricing per colour family, and removes `base_type` from the SKU.
  Everything else here still stands: shade as order-time configuration rather than an
  attribute, `sale_unit_type = 'tinted_to_order'`, and order-line snapshotting.

## Context

The draft schema in `construction-marketplace-catalog-schema-mvp (2).md` assumes
`attribute_value_option` holds a **finite enum** ("43 Grade", "53 Grade"), and that
variant-defining attributes split into separate `master_product` rows.

Paint breaks both assumptions. Asian Paints publishes 1800+ shades; Berger's ColorBank
offers 5000+. These are not stocked SKUs — they are formulas dispensed by a tinting machine
into one of a handful of physical **bases** (White/Pastel, Medium, Deep, Neutral). The base
is what a shop orders, stocks, counts and prices. The shade is chosen by the customer at
the counter.

Treating shade as a variant-defining attribute would mean, for a single brand:

> 1,800 shades × 4 pack sizes × ~6 product lines ≈ **43,000 `master_product` rows**

Modeling by base instead:

> 4 bases × 4 pack sizes × 6 lines = **96 rows**

A ~450× difference, where the larger number is almost entirely fictional — no vendor holds
"Royale Luxury, shade 8021, 20L" as inventory.

## Options considered

### Option A — Shade as a variant-defining attribute

- **Pro:** Everything stays a normal SKU. Nothing new to build. Shade is natively
  searchable and filterable.
- **Con:** ~43,000 phantom rows per brand. Inventory becomes meaningless — a shade cannot
  be stock-counted. `attribute_value_option` would need 1,800+ rows per brand that go stale
  whenever a shade card is revised. Not viable.

### Option B — Base is the SKU, shade as free text on the order line

- **Pro:** SKU count stays at ~96/brand. Inventory correctly decrements the base. Minimal
  schema change.
- **Con:** Shade becomes invisible to the catalog — no colour browsing, no validation that
  the chosen shade is achievable from the selected base, no hex value for a swatch picker,
  and no structured place for colorant pricing.

### Option C — Base is the SKU, `paint_shade` reference table, shade as order-time configuration *(chosen)*

- **Pro:** Option B done properly. Colour browsing and hex-driven pickers become possible,
  the base↔shade constraint is enforceable, colorant pricing has somewhere to live, and SKU
  count still stays at ~96/brand.
- **Con:** One new entity plus a configuration payload on the order line. Shade needs its
  own handling in the search document. Someone must maintain 1,800–5,000 shade rows per
  brand.

## Decision

### Shade is not an attribute — it is a configuration applied at order time

This is the core reframe, and it resolves the stated conflict cleanly: **`Shade` never
enters `attribute` / `attribute_value_option` at all.** The finite-enum assumption was never
wrong; shade simply is not an attribute. What *is* an attribute is `Base Type` — a genuine
finite enum of 4–5 values, and variant-defining.

The schema already has a concept for made-to-order goods. `sale_unit_type: 'discrete' |
'cut_to_length'` exists because wire is cut to order rather than pre-packed. Paint tinting
is the same pattern — a stocked item transformed at the point of sale per a customer input
— so this needs no new concept, only a third enum value.

```sql
master_product (
  ...
  sale_unit_type,   -- 'discrete' | 'cut_to_length' | 'tinted_to_order'   (extended)
  base_type         -- 'white' | 'pastel' | 'medium' | 'deep' | 'neutral'
                    -- null unless sale_unit_type = 'tinted_to_order'
)

paint_shade (
  id,
  brand_id,
  shade_code,       -- fan-deck code, e.g. "8021"
  name,             -- "Wheat Field"
  hex,              -- "#E8D9B5" — drives the swatch picker
  fan_deck,         -- shade card name / edition
  colour_family,    -- beige | grey | blue | …  → search facet
  depth_band,       -- pastel | medium | deep   → price delta + base compatibility
  is_active
)

paint_shade_base_compatibility (
  paint_shade_id,
  base_type         -- which bases can actually produce this shade
)
```

### Both product types coexist inside Paint

Whites, primers, putty and pre-packed ready-mix shades stay `sale_unit_type = 'discrete'`
— ordinary SKUs with ordinary inventory. Only tintable product lines are
`'tinted_to_order'`. The Paint category holds both.

`'tinted_to_order'` is a category-wide capability, not one product line: texture finishes,
wood stains and some waterproofing coatings are tinted the same way.

### MVP scope — tinting is supported from day one

Every local paint shop has a tinting machine. Launching pre-packed-only would mean the
catalog cannot represent most of what a paint vendor actually sells.

### Pricing — base price plus a colorant delta by depth band

`vendor_listing` prices the base+pack SKU exactly as it prices anything else. The colorant
delta attaches to the shade's `depth_band` (pastel / medium / deep), not to individual
shades. Only a handful of bands to maintain, and the customer gets a real number up front
rather than "price on request".

**The delta is defined per litre and multiplied by pack volume.** A deep-base delta on a 1L
tin is not the same rupee amount as on a 20L bucket; a flat per-band delta would be wrong
at both ends of the pack range.

```
line price = vendor_listing.price  +  (delta_per_litre[depth_band] × pack_volume_litres)
```

Rejected: *base price only, quote later* — it breaks the best-price comparison the entire
catalog is built around. *Vendor sets a price per shade* — thousands of price rows per
vendor, unmaintainable for a local shop owner.

### Search — colour family only

The flattened paint document gains `shade_families: ["beige", "grey", …]` — the set of
families achievable for that base and product — per `search-architecture.md`. Individual
shades are **not** indexed; 1,800 shades × products would bloat the index and need its own
sync path for little gain. This still supports "show me beige emulsions", which is how
people commonly start shopping for paint.

### Order lines snapshot the shade, they do not merely reference it

```sql
order_item (
  ...
  master_product_id,   -- the base SKU
  configuration jsonb  -- { paint_shade_id, shade_code, shade_name, hex, depth_band }
)
```

The snapshot matters for the same reason price is snapshotted: shade cards get revised and
shades get discontinued. A pure foreign key would let a historical order silently change
colour — or dangle — when a fan deck is updated.

### Inventory decrements the base

Tinting consumes base stock plus colorant; there is no such thing as "shade stock". The
existing `inventory` model needs no change — it continues to track the base SKU.

## Consequences

- **`cached_best_price` needs a stated meaning for paint.** Per `search-architecture.md` it
  is precomputed on write, but for a tinted product the final price depends on the shade
  the customer has not yet chosen. Ruling: `cached_best_price` holds the **base price
  (zero-delta floor)**, and paint PDPs/search results must render it as "from ₹X". Without
  this, paint would appear artificially cheaper than it can actually be bought.
- **Tinting capability varies by vendor.** Not every shop has a machine, and those that do
  may not stock every colorant. `vendor_listing` likely needs a `supports_tinting` flag,
  otherwise a customer can configure a shade the vendor cannot produce. Flagged rather than
  decided — see open questions.
- **Shade data is an admin burden.** 1,800–5,000 rows per brand, sourced from published
  shade cards, with hex values that must be accurate enough to trust in a picker. This is
  an import job, not manual entry.
- **`base_type` is a nullable column that only means something for one `sale_unit_type`.**
  Acceptable, but validation must enforce the pairing in both directions.
- The Paint category's attribute set now excludes `Shade` entirely and includes `Base Type`
  as variant-defining — this must be reflected when the per-category attribute lists are
  drawn up (open question 3 of [0001](0001-category-tree-and-attributes.md)).

## Open questions

1. **Custom / computer-matched shades** — a customer brings a fabric swatch and the machine
   matches it. That shade exists in no fan deck, so `paint_shade_id` cannot be populated.
   Needs either a free-form escape hatch on the order configuration or an explicit
   "not supported at MVP" ruling.
2. **`vendor_listing.supports_tinting`** — confirm whether vendors declare tinting
   capability, and whether it is per-listing or per-vendor.
3. **Who owns shade data ingestion**, and how a fan-deck revision propagates without
   breaking historical orders (the snapshot protects orders; it does not answer how the
   catalog itself gets updated).
4. **Whether `depth_band` deltas are global, per-brand, or vendor-overridable.** Global is
   simplest; brands genuinely differ in colorant cost.

## Sources

- [Asian Paints Shade Card — 1800+ colours with codes](https://aapkapainter.com/shade-card/asian-paints)
- [Berger Paints Colour Catalogue — 2500+ shades](https://www.bergerpaints.com/colour/colour-catalogue)
- [Tinting Paint: Creating the Perfect Color — Hirshfield's (base types)](https://www.hirshfields.com/tinting-paint-creating-the-perfect-color/)
- [Dromont retail tinting machines](https://www.dromont.com/solutions/retail-tinting-machines/)
- [Asian Paints catalogue directory](https://www.asianpaints.com/resources/tools/catalogue-directory.html)
