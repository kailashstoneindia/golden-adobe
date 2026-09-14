# 0011 — Product codes, pre-filled vendor export, and match integrity

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes:** the single `gtin_ean_upc` column on `master_product`

## Context

Vendors attach inventory to catalog products by uploading a spreadsheet. Matching a
vendor's free text to a catalog product is unreliable, and a wrong match is invisible after
the fact — the listing is valid, the price is sane, only the *link* is wrong, and the
customer receives the wrong item.

[catalog-consistency.md](../catalog-consistency.md) surveys how Amazon, MDM practice and
Mirakl handle this. [catalog-vendor-export-analysis.md](../catalog-vendor-export-analysis.md)
assesses feasibility and effort.

The core insight: **stop asking vendors to identify products, and hand them a sheet that
already has the identifier in it.** Matching then becomes the exception, needed only for
products the catalog does not yet contain.

## Decision

### 1. `product_code` — opaque, not semantic

```
GA-0012345
││ │
││ └── 7-digit zero-padded sequence, starting at 0100000
│└──── hyphen — Excel-safe separator
└───── constant prefix — forces TEXT, not NUMBER
```

```sql
CREATE SEQUENCE master_product_code_seq START 100000;

ALTER TABLE master_product
  ADD COLUMN product_code VARCHAR(16) NOT NULL UNIQUE
    DEFAULT 'GA-' || LPAD(nextval('master_product_code_seq')::text, 7, '0');
```

**Semantic codes were rejected**, and this project already contains the proof. A code like
`GA-ELE-MCB-HAV-032C` encodes shop type, category and brand — and during design we moved
LED bulbs between Electrical and Lights, split Sanitaryware out of Plumbing, and moved tile
adhesive to Hardware. Every one of those reclassifications would have invalidated codes
already sitting in vendors' saved spreadsheets and in past orders, where they cannot be
corrected.

This is why GTIN, ASIN and Shopify IDs are all opaque. Readability comes from the adjacent
`product_name` column in the sheet, not from the identifier.

**Design criteria met:** stable across reclassification, globally unique, never reused
(deprecated codes stay dead because old spreadsheets and orders still reference them),
Excel-safe, short enough to read aloud.

**The `GA-` prefix is load-bearing, not decoration.** Excel converts long bare numerics to
scientific notation and strips leading zeros silently on open — `0012345` becomes `12345`
with no warning. The prefix forces text handling.

**No check digit.** A mod-10 digit would catch ~90% of single-digit typos, but the flow is
download → edit → upload, and with the in-app picker (below) vendors rarely type a code at
all. Revisit if support tickets show hand-typed codes causing mismatches.

### 2. Pre-filled vendor export

```
1. Vendor picks leaf categories + brands (+ optional search picker)
2. Downloads sheet — product_code and name pre-filled, price/qty blank
3. Fills price + qty, deletes rows they don't stock
4. Uploads → exact code match
```

| Column | Vendor edits? |
|---|---|
| `product_code` | No — locked |
| `product_name`, `brand`, `pack`, `unit` | No — context, ignored on import |
| `price`, `qty_available`, `min_order_qty`, `pincodes`, `status` | Yes |

`product_name` is deliberately **ignored** rather than trusted on import. A mismatch between
the supplied name and the catalog name is logged as a warning — it usually means the vendor
edited the wrong row.

### 3. Export scoping — required in v1

Without scoping this approach fails on contact with a real catalog: a vendor registered for
Hardware inherits 19 leaf categories and could receive 10,000 rows while stocking 200. A
sheet that large is as unusable as no sheet.

| Filter | Behaviour |
|---|---|
| Leaf category | 58 options, limited to the vendor's registered shop types |
| Brand | Only brands present in the chosen categories |
| Since date | Incremental — products added since last download |
| **Search picker** | Type a name, add individual products to a basket |

**A live row count is shown before download.** That is the real guard against an unusable
export.

**No cap in v1.** A hard limit would frustrate a genuinely large distributor; the row count
plus filters is expected to be sufficient. Revisit if abandoned downloads appear.

**Registration scope and export scope are different things.** Registration is level 1 ("I am
a plumbing shop"); export is leaf level ("send me Pipes and Valves"). Conflating them is
what produces the 10,000-row sheet.

The search picker is a plain `ILIKE` query on `master_product.name` — a few thousand rows,
no search engine needed. It is unrelated to the customer-facing search engine.

### 4. `vendor_product_map` — match once, never re-guess

```sql
vendor_product_map (
  vendor_id,
  vendor_sku,            -- the vendor's own code
  master_product_id,
  confirmed_by,          -- vendor | admin
  confirmed_at,
  PRIMARY KEY (vendor_id, vendor_sku)
)
```

`vendor_sku` was already stored but never used as a key, so every upload re-ran the matcher
over the same rows — meaning a row that matched correctly in March could match differently
in June as the catalog grew.

The import ladder gains a step 0:

```
0. vendor_product_map exact hit ──────────────► link, done
1. product_code exact ────────────────────────► link, done
2. brand + MPN exact ─────────────────────────► link
3. GTIN exact ────────────────────────────────► link
4. structured (brand + category + variants) ──► link if confident
5. fuzzy name ────────────────────────────────► CANDIDATES → review
6. no match ──────────────────────────────────► new product request
```

> **Amended:** steps 2 and 3 were originally GTIN before brand + MPN, copied from Western
> e-commerce where barcode coverage is high. Reordered — GTIN is India's barcode standard
> (GS1 India, `890` prefix) but adoption in building materials is weak, because barcodes
> follow point-of-sale scanning and this trade sells across counters that do not scan. MPN
> is what dealers order on, from printed price lists. See
> [catalog-integrity-approach.md](../catalog-integrity-approach.md).

Steps 0–3 are deterministic and safe to auto-publish. Steps 4–5 must not publish without
confirmation.

**This matters most for stone**, which has no GTIN and no MPN, so steps 2–3 never fire.
After one confirmation a yard's `BG-18-A` maps permanently to Black Galaxy Polished 18mm and
the fuzzy matcher is never consulted for it again.

### 5. Vendor confirms the first match only

Rows matched at step 4 or 5 are shown to the vendor — "we matched your `HAV-32C` to
**Havells 32A SP MCB C-Curve**" — before going live. Accepting writes `vendor_product_map`,
so the question is asked once per SKU, not once per upload. Rejection feeds the review queue.

### 6. Review queue stores ranked candidates, not a flag

```sql
catalog_import_row.match_candidates  JSONB
-- [ {master_product_id, score, matched_on, differing_attributes}, … ]
```

Per MDM practice, a data steward needs candidate pairs with match probability and
conflicting values — not a flag saying "needs review". The reviewer chooses from a ranked
list rather than investigating from scratch. Every manual resolution writes back an alias or
a `vendor_product_map` row.

### 7. Price-outlier detection after publish

A wrongly matched product almost always presents as a price outlier against sibling listings
on the same `master_product`:

```
420   418   425   ⚠ 4200
```

Flag for admin review; do not auto-unpublish. Legitimate spread exists — stone grades and
paint colour families in particular.

### 8. GTIN stays a single nullable column

> **Amended same day.** This section first specified a `master_product_gtin` table holding
> many barcodes per product, because paint's barcode sits on the *base* tin while
> [0007](0007-colour-family-pricing.md) made `master_product` the product line plus pack
> size — so one paint product spans four barcodes.
>
> **Reversed.** The premise was wrong: paint should carry no GTIN at our SKU level at all.
> The barcoded object is the base tin, which is a level this catalog deliberately stopped
> modelling. Outside paint, one barcode per product holds, so the table solved a problem
> that does not exist. Dropped — `master_product.gtin` is a single nullable column.

`gtin` is **not** a primary identifier. `product_code` is. GTIN survives for two narrower
jobs:

1. **Catalog deduplication at admin upload.** If two admins enter the same MCB, GTIN catches
   it deterministically; `product_code` cannot, because two would already have been minted.
   MDM practice treats duplicate golden records as the core data-quality risk.
2. **Fallback matching** for vendors pasting their own sheet rather than using the export.

Coverage will be patchy and that is expected: stone has no GTIN, generics (sand, GI
fittings) have none, and small hardware brands are unreliable. It is a bonus signal, not a
backbone.

## Consequences

- `master_product` gains `product_code`; `gtin_ean_upc` is renamed `gtin` and stays a single
  nullable column.
- One new table: `vendor_product_map`.
- **Sequencing dependency:** vendors cannot pick from an empty catalog, so seeding must be
  substantially complete before vendor onboarding starts. This inverts the usual marketplace
  bootstrap, where sellers bring their own catalog.
- Seeding is estimated at 4,000–6,000 SKUs, roughly 150–300 hours, and is **domain work**
  rather than data entry — someone who does not know the trade will file anchors under bolts
  and produce a catalog that looks complete but matches badly.
- Excel will corrupt data: date auto-conversion, split comma-separated pincodes, UTF-8
  mangling of ₹, trailing whitespace. All need handling at import.
- Stale exports must be tolerated — a vendor may upload a sheet downloaded months earlier.
  Codes are never reused, so a stale code always resolves to something.
- Paint exports pre-expand to one row per colour family; stone exports carry a blank `grade`
  column the vendor duplicates rows against. Stone is the only category where the vendor
  must *add* rows rather than only edit them.

## Open questions

1. **Who owns catalog seeding**, and does it start before or in parallel with development?
2. `.xlsx` with a locked code column and dropdowns, versus CSV. Locking would prevent a whole
   class of error but needs `exceljs` as a dependency.
3. Auto-publish confidence threshold for step 4.
4. Price-outlier threshold — fixed percentage band, or deviations against siblings?
5. Whether a customer-facing "report wrong product" path is needed as a final safety net.
6. A price-only update sheet keyed on `product_code`, so vendors can revise prices without
   re-downloading the full export.

## Sources

See [catalog-consistency.md](../catalog-consistency.md) and
[catalog-vendor-export-analysis.md](../catalog-vendor-export-analysis.md).
