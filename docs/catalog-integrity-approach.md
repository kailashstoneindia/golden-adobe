# Catalog Integrity — The Approach

One place describing how the catalog stays free of duplicates and how vendor inventory
attaches to the right product. Consolidates decisions
[0011](decisions/0011-product-code-and-vendor-export.md),
[0012](decisions/0012-product-identity-and-deduplication.md) and
[0013](decisions/0013-identity-hash-for-unbranded-products.md), plus the survey in
[catalog-consistency.md](catalog-consistency.md).

Two separate problems, often confused:

```
A.  One real product = one catalog row     (catalog uniqueness)
B.  A vendor's stock attaches to the       (correct attachment)
    row they actually meant
```

---

## Part A — One real product, one catalog row

Three identity paths, each a hard database constraint. Every product falls into at least
one.

| # | Applies to | Constraint | Strength |
|---|---|---|---|
| 1 | **Branded products — the primary path** | `UNIQUE (brand_id, mfr_part_number)` partial | 🟢 Hard |
| 2 | Generics, stone, unbranded | `UNIQUE (category_id, identity_hash)` where `status='live'` | 🟢 Hard at publish |
| 3 | Bonus, where a barcode exists | `UNIQUE (gtin)` | 🟢 Hard, but sparse |
| 4 | Everything, as a net | Fuzzy name warning at admin entry | 🟡 Soft — dismissible |

### Why brand + MPN leads, not GTIN

GTIN *is* India's barcode standard — GS1 India is the sole authorised issuer, using the
`890` prefix, and there is no domestic alternative. The problem is **adoption**, not
standardisation: barcodes exist where point-of-sale scanning exists, and Indian building
materials sell across trade counters that do not scan.

MPN is what the trade actually transacts on. Jaquar, Havells and Astral publish a code per
product in their price lists, and that is what a dealer reads out when ordering.

An earlier draft of this document put GTIN first, copied from Western e-commerce where
barcode coverage is high. That ordering implied a dependency this market does not support.
`gtin` stays — one nullable column and a partial index cost nothing, and where a barcode does
exist it is the strongest signal available — but it is a bonus, not the backbone.

### Why path 1 must be composite

A manufacturer part number is assigned by one manufacturer with no central registry, so it
cannot be globally unique by construction. `UNIQUE (mfr_part_number)` alone would be wrong.

### Why path 2 fires at publish, not insert

Attribute values are written *after* the product row, so at insert there is nothing to hash.
Drafts stay unconstrained; `status → live` is already a deliberate step, and by then the
attributes exist.

### Coverage by category

| Category | Primary path | Notes |
|---|---|---|
| Electrical | 1 — brand + MPN | Havells/Legrand/Anchor publish part numbers |
| Plumbing | 1 | Astral, Supreme, Prince |
| Sanitaryware | 1 | Jaquar codes (ACN, AHS, AKP…) |
| Tiles | 1 | Kajaria, Somany |
| Lights | 1, falling to 2 | Unbranded imports have neither |
| Paint | 1 | No usable GTIN — barcode is on the base tin |
| Hardware | 1, **heavily** falling to 2 | Fasteners and small brands often unbranded |
| Stone | **2 only** | No brand, no MPN, no GTIN — quarried, not manufactured |

Hardware and Stone rest entirely on the identity hash, which makes the prerequisites below
non-optional for those two.

### Prerequisites — the constraints are worthless without these

1. **Deduplicate the `brand` table itself.** "Havells" and "Havells India" as two rows
   defeats path 2 completely. Brand creation needs review.
2. **Normalise MPN on write** — trim and case-fold, or `DHMGCSPF032` and `dhmgcspf032` pass
   as distinct.
3. **Convert six free-text variant-defining attributes to enum** — Series (×2), Finish,
   Dimensions, Colour, Slab/Tile Size. Free text defeats path 3 by hashing differently on
   case or spacing.
4. **Canonicalise numbers before hashing** — `18`, `18.0` and `18.00` must agree. Without
   this, path 3 is theatre in exactly the categories that depend on it.
5. **Require variant-defining attributes at publish.** If one product publishes with a
   variant attribute blank, its hash differs and both rows publish.

---

## Part B — Vendors attach to the right product

### The primary path: don't ask them to identify anything

```
1. Vendor picks leaf categories + brands, or searches and adds products
2. Downloads a sheet with product_code and name already filled
3. Fills price and quantity; deletes rows they don't stock
4. Uploads → exact code match
```

Matching becomes the **exception**, needed only for products the catalog does not yet have.
A live row count is shown before download, and scoping is by leaf category — registering as
a "Hardware" shop must not produce a 10,000-row sheet.

### The fallback: a match ladder

For rows with no `product_code` — a vendor pasting their own spreadsheet, or stocking
something new.

```
0. vendor_product_map exact ──────────────► link, done   ┐
1. product_code exact ────────────────────► link, done   │ auto-publish
2. brand + mfr_part_number exact ─────────► link         │ safe
3. gtin exact ────────────────────────────► link         ┘
4. structured: brand + category + variants ► confirm first  ┐ never
5. fuzzy name (pg_trgm) ──────────────────► ranked candidates ┘ auto-publish
6. no match ──────────────────────────────► new product request
```

**Stone skips 2 and 3 entirely** — no MPN, no GTIN — so it lands at 4 or below on first
contact. This is why step 0 matters most there.

### Match once, never re-guess

```sql
vendor_product_map (vendor_id, vendor_sku) → master_product_id
```

After a single confirmed match, the vendor's own code is authoritative. Without this, every
upload re-runs the matcher and a row that matched correctly in March can match differently
in June as the catalog grows.

**This is the highest-value single mechanism in Part B.** It converts matching from a
repeated statistical problem into a one-time one.

### Confirm on first match only

Rows resolved at step 4 or 5 are shown to the vendor before going live — *"we matched your
`HAV-32C` to Havells 32A SP MCB C-Curve"*. Accepting writes `vendor_product_map`, so the
question is asked once per SKU, not once per upload. Rejection feeds the review queue.

### Review queue holds ranked candidates, not a flag

```sql
catalog_import_row.match_candidates JSONB
-- [ {master_product_id, score, matched_on, differing_attributes}, … ]
```

An admin choosing from a ranked list with reasons is doing a different, far faster job than
one investigating a bare "needs review".

**Every manual resolution must teach the system** — write back a `vendor_product_map` row,
or a `stone_variety_alias`. Otherwise the same mismatch recurs on every upload, and stone in
particular never improves, since it has no identifier to fall back on.

---

## Part C — Catch what still leaks

| Check | Trigger | Action |
|---|---|---|
| **Price outlier** | Listing price deviates sharply from siblings on the same product | Flag for admin. Do **not** auto-unpublish — stone grades and paint colour families produce legitimate spread |
| **Catalog edit re-validation** | Admin changes a variant-defining attribute | Flag attached listings; they now describe something subtly different. `catalog_reindex_queue` already carries this shape |
| **Customer report** | Buyer says the product is wrong | Not designed yet — the final safety net |

A wrong match usually surfaces as a price outlier long before a customer complains:

```
Vendors on this MCB:   420   418   425   ⚠ 4200
```

No product knowledge required. Cheapest high-yield check available.

---

## What is guaranteed, and what is not

| | Mechanism |
|---|---|
| 🟢 **Enforced by the database** | Unique GTIN · unique brand+MPN · unique category+identity_hash at publish · one listing per vendor/product/grade |
| 🟡 **Enforced by process** | Vendor confirmation on first match · admin review of candidates · fuzzy-name warning at entry |
| 🔴 **Not covered** | Two brand rows for one real brand · a vendor confirming the wrong match · products published with variant attributes blank · customer-side reporting |

The red row is the honest residual, and it is documented in full — cause, blast radius and
sketched fixes — in
[catalog-integrity-residual-risks.md](catalog-integrity-residual-risks.md). **Not yet
decided.**

Two of the four are worse than the table suggests: duplicate brand rows fail *silently*
while appearing to work, and a wrongly confirmed match is the only risk in the system that
compounds over time rather than staying static.

---

## Build order

Ordered by value per unit of effort.

| # | Item | Why first |
|---|---|---|
| 1 | `product_code` + sequence | Everything else references it |
| 2 | `UNIQUE (brand_id, mfr_part_number)` | One index; closes duplicates for most of the catalog |
| 3 | Brand dedup + MPN normalisation | Without these, #2 does nothing |
| 4 | Pre-filled export with scoping | Removes most matching entirely |
| 5 | `vendor_product_map` + step 0 | Makes matching one-time |
| 6 | Six text attributes → enum | Prerequisite for #7 |
| 7 | `identity_hash` + publish constraint | Closes Hardware and Stone |
| 8 | Ranked `match_candidates` | Makes the review queue usable |
| 9 | Price-outlier flag | Cheap detection net |
| 10 | Catalog-edit re-validation | Lowest frequency |

Items 1–5 deliver most of the protection. Items 6–7 close the two weakest categories.
8–10 are detection rather than prevention.

---

## Open items

1. Does brand creation need its own approval step?
2. Should variant-defining attributes be hard-required at publish?
3. Price-outlier threshold — fixed band, or deviation against siblings?
4. Is a customer-facing "report wrong product" path needed at MVP?
5. **Verify during seeding**: what proportion of products in each category actually carry an
   MPN, and do Indian brand price lists publish per-product codes as expected? This
   determines how much of the catalog path 2 really covers, and it is trivially checkable
   once seeding starts.
