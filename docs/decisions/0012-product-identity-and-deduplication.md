# 0012 — Product identity and catalog deduplication

- **Date:** 2026-08-02
- **Status:** Accepted
- **Relates to:** [0011](0011-product-code-and-vendor-export.md) (product_code, GTIN),
  [0003](0003-stone-natural-material.md) (identity without brand)

## Context

`product_code` (0011) identifies a product *once it exists*. It cannot prevent the same real
product being entered twice — two entries would simply receive two codes.

That matters because duplicates are the dominant catalog-quality risk. MDM practice is
explicit that without governance "an industrial distributor might carry one bearing under
different SKU variations with different pricing and classifications". For Golden Abode the
exposure is concentrated in two places: seeding 4,000–6,000 SKUs over several weeks, and
approving vendor product requests.

An earlier assessment of GTIN coverage per category in this project was **inference, not
research**, and was presented with more confidence than it warranted. This record replaces
it with sourced reasoning.

> ### ⚠️ Source-quality note
>
> Sections 1 and 2 originally presented direct quotations as sourced findings. On checking
> the primary documents, those quotations could not be located at the URLs cited — they came
> from search-result summaries. The page attributed to them
> ([blog.affiliate.com](https://blog.affiliate.com/identifier-governance-for-ai-catalogs/),
> a vendor marketing blog) says only *"Require Brand plus MPN to reduce collisions across
> regions or bundles"*.
>
> **The decision is unchanged**, because the argument is definitional and does not depend on
> those quotations. It is restated honestly below.

## Evidence

### 1. Brand + MPN as a deduplication key

Using brand together with manufacturer part number as a dedup key is standard practice in
B2B product data, and the one verifiable source consulted supports the weaker form of the
claim: *"Require Brand plus MPN to reduce collisions across regions or bundles."*

Stated as design judgement rather than as research: an MPN identifies a part within a
manufacturer's catalog, which is exactly the granularity a duplicate check needs for branded
goods.

### 2. MPN alone is NOT unique — this is definitional

A *manufacturer* part number is assigned by an individual manufacturer, with no
cross-manufacturer coordination and no central registry. It therefore cannot be globally
unique by construction: two manufacturers may legitimately use the same string for unrelated
products.

This requires no citation — it follows from what the identifier is. Google Merchant Center's
practice of requesting brand alongside MPN is consistent with it, though the specific
uniqueness wording could not be confirmed in Google's own documentation when checked.

**Consequence:** a `UNIQUE (mfr_part_number)` constraint would be wrong. Only
`UNIQUE (brand_id, mfr_part_number)` is sound, and `brand_id` must be non-null for it to
mean anything.

### 3. Keeping both GTIN and MPN is standard, not redundant

Google Merchant Center requires **both** a GTIN and MPN + brand. GTIN handles global
identification; MPN + brand handles the cases GTIN cannot — the same physical product sold
under different brand names through rebranding, white-label and OEM arrangements.

This answers the earlier question of why `gtin` survives alongside `product_code`: they
solve different problems, and the industry keeps both deliberately.

Where barcodes exist they should be matched first — *"when you barcode match first, you get
stronger normalization, better deduplication"* — which is why the ladder in 0011 runs GTIN
before brand + MPN.

### 4. Indian building-material brands do publish catalogue codes

Jaquar's published price lists list, for every product, *"the code, type, size and MRP"*,
with codes carrying prefixes such as ACN, AHS, AKP, ALD, ALI across the Designer, Kubix,
Fusion, Vignette, Opal, Solo, Florentine, Aria, Fonte and Lyric ranges.

MPN is therefore available in the format Indian dealers actually order from — the printed
price list — for at least the branded sanitaryware segment.

### 5. GTIN coverage cannot be assumed for these categories

GS1 India names its own sectors as retail, FMCG, agriculture, transport & logistics and
healthcare. **Building materials and hardware appear in neither list.** Barcode adoption
tracks point-of-sale scanning, and Indian building materials sell largely through
traditional trade counters that do not scan.

Amazon's GTIN-exemption policy exists precisely for *"generic, unbranded products"* and
*"parts that don't have a product ID"* — a category-level acknowledgement that whole product
types lack barcodes.

No published per-category penetration data exists for Indian building materials. Anyone
claiming a figure is guessing.

### 6. The unbranded segment is undocumented

Searching for how India's unbranded fastener and hardware trade identifies products returns
manufacturer directories and nothing about part numbering. That absence is itself the
finding: this segment is informal, sells by weight and grade, and has no identifier system
to rely on.

## Decision

### Enforce brand + MPN as a hard uniqueness constraint

```sql
CREATE UNIQUE INDEX master_product_brand_mpn
  ON master_product (brand_id, mfr_part_number)
  WHERE brand_id IS NOT NULL AND mfr_part_number IS NOT NULL;
```

Partial, because generics carry neither. Composite, because per finding 2 an MPN is unique
only inside its manufacturer's namespace.

This is the primary defence against duplicates and covers every branded product — the
majority of the catalog.

### `gtin` stays, unchanged

Nullable, `UNIQUE`, matched before brand + MPN. Justified by finding 3, not by assumed
coverage. Where present it is the strongest signal; where absent nothing breaks.

### Identity for products with neither

Generics and stone have no brand, no MPN and no GTIN. Their identity is
`category + variant-defining attribute values`, per 0003 — for stone specifically,
`stone_variety_id + finish + thickness`.

This is **not** enforced by a database constraint at MVP. Attribute values are written after
the product row, so a unique index would need a maintained hash and a deferred check. It is
handled instead by a **soft duplicate warning at admin entry**: on save, search for existing
products in the same category with the same variant-defining values, and show them before
confirming.

Recorded as a known weaker link rather than solved.

### Measure coverage during seeding, do not estimate it

While entering the first ~500 products, record how many carried a GTIN and how many carried
an MPN, per category. That produces real data on the real catalog within about a week, at no
extra cost, and replaces the guesswork that prompted this record.

If MPN coverage proves poor in a category, the constraint simply does not fire there — it
never blocks entry.

## Consequences

- Duplicate branded products become **impossible**, not merely discouraged.
- Products cannot be saved with a brand and an MPN that collide with an existing pair —
  admin UI must surface this as "this product already exists: `GA-0012345`" rather than a
  constraint error.
- **The constraint does nothing for generics, stone, or unbranded hardware.** Those rely on
  the soft warning, which a rushed admin can click through. This is the residual risk and it
  sits precisely in the two categories where data is weakest.
- Brand records must exist before products, and brand naming must itself be deduplicated —
  "Havells" and "Havells India" as two brands would defeat the constraint entirely.
- MPN must be stored normalised (trimmed, case-folded) or `DHMGCSPF032` and `dhmgcspf032`
  will pass as distinct.

## Open questions

1. **Brand deduplication.** The constraint is only as good as the brand table. Does brand
   creation need its own approval step?
2. Whether the soft duplicate warning should block on high similarity rather than only
   inform.
3. Whether to backfill the variant-attribute hash later and promote the generic/stone check
   to a real constraint.

## Sources, with quality graded

**Definitional — needs no source:** that MPN is manufacturer-scoped and therefore not
globally unique (section 2). This is the load-bearing claim, and it follows from what a
manufacturer part number is.

**Verified:**

- [Identifier governance for AI catalogs — affiliate.com](https://blog.affiliate.com/identifier-governance-for-ai-catalogs/)
  — vendor marketing blog. Confirmed to say *"Require Brand plus MPN to reduce collisions
  across regions or bundles"*, and nothing stronger.

**Not verified — cited from search summaries only:**

- [Jaquar sanitaryware price list](https://www.scribd.com/doc/56009497/Jaquar-Sanitary-Ware-Price-List)
  — the claim that Indian brands publish per-product catalogue codes is plausible and
  matches how the trade orders, but the document itself was not opened. **Confirm against a
  real Jaquar or Havells price list during catalog seeding** — it is trivially checkable
  then, and it determines how well the brand + MPN constraint will actually cover the
  catalog.
- [GS1 India](https://www.gs1india.org/) — sector list taken from a search summary.
- Productsup, Pimberly, DataFeedWatch — vendor glossaries, orientation only.
- [Amazon GTIN exemption](https://www.junglescout.com/resources/articles/gtin-exemption-amazon/)
  — third-party summary of Amazon policy, not Amazon's own documentation.

**Rule for future records in this folder:** open the document before quoting it, and label
whether a claim is measured, definitional, or cited.
