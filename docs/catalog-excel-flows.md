# Catalog Excel Flows

The three spreadsheet workflows that populate and maintain the catalog:

1. **Admin uploads the master catalog** — creates `master_product` rows
2. **Vendor uploads inventory** — creates `vendor_listing` + `inventory` rows
3. **Vendor requests new products** — falls out of flow 2, no separate upload

Built on [catalog-schema.sql](catalog-schema.sql) and
[catalog-structure.md](catalog-structure.md).

Spreadsheets are the right primitive here: universally understood, editable offline, and
B2B vendors routinely maintain hundreds of listings. The standard pattern is **upload →
automatic match → review queue for the remainder**, which the `catalog_import_row` table
already models.

---

## Flow 1 — Admin master catalog upload

### The problem: attribute columns differ per category

An MCB needs `rated_current` and `tripping_curve`. A tile needs `size`, `finish` and
`pei_rating`. One universal template cannot serve 58 leaf categories without ~200 mostly
empty columns.

### The solution: generated per-category templates

The admin picks a leaf category, and the system **generates** a template whose columns are
that category's effective attribute set — resolved through inheritance exactly as
`build_attributes_flat()` does.

```
Admin → picks "Electrical > Switchgear > MCB"
     → downloads mcb-template.xlsx
     → columns are generated from the attribute model, not hand-maintained
```

**Template for `electrical/switchgear/mcb`:**

| name\* | brand\* | mfr_part_number | gtin | hsn_code | gst_rate\* | country_of_origin\* | pack_qty | poles\* | breaking_capacity | mounting | rated_current\* | tripping_curve\* | warranty_months | certification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Havells 32A SP MCB C-Curve | Havells | DHMGCSPF032 | 890… | 8536 | 18 | India | 1 | SP | 10 | DIN Rail | 32 | C | 24 | ISI |

`gst_rate` and `country_of_origin` are required by Indian law
([0010](decisions/0010-indian-compliance-fields.md)). Manufacturer address and consumer care
details are **not** columns here — they are entered once per brand, not per row.

Columns marked `*` are required — derived from `is_variant_defining = true`, since those
are what make the SKU distinct.

Column order follows the attribute model's own layering, which makes the template
self-documenting:

| Block | Source |
|---|---|
| Identity | `master_product` columns — name, brand, GTIN, MPN, HSN, pack qty |
| Inherited attributes | ancestors, outermost first (`Switchgear` → poles, breaking capacity) |
| Leaf attributes | the category itself (`MCB` → rated current, curve) |
| Global attributes | `attribute.category_id IS NULL` — warranty, origin, certification |

**Validation on upload**, per row:

1. Required columns present and non-empty
2. Enum values exist in `attribute_value_option` — reject `Curve E`, suggest `B / C / D`
3. Numeric attributes parse, and units match the attribute's declared `unit`
4. Brand resolves in `brand`, or is flagged for creation
5. Duplicate detection against existing `master_product` — same brand + MPN, or same
   variant-defining attribute set

Accepted rows land as `status = 'draft'`, not `live`. Publishing is a separate deliberate
step.

### Two categories need extra columns

**Paint** — no `base_type` column ([0007](decisions/0007-colour-family-pricing.md)); the SKU
is line + pack size. Tintable lines set `sale_unit_type = tinted_to_order`. Shades are
**not** in this template and have no table at all (0014) — the customer picks a colour
family and the vendor finalises the shade at the counter.

**Stone** — a `variety` column resolving through `stone_variety_alias`, plus
`has_natural_variation = true`. No grade column: grade is a vendor claim, not a catalog fact
([0009](decisions/0009-stone-price-list-model.md)).

---

## Flow 2 — Vendor inventory upload

### One template for every category

Unlike the admin flow, this does not vary by category, because a vendor supplies price,
stock and service area — never specs. Specs already exist in the master catalog.

| product_ref | vendor_sku | price | mrp | qty_available | min_order_qty | grade | pincodes | status |
|---|---|---|---|---|---|---|---|---|
| 8901234567890 | HAV-32C | 420 | 495 | 60 | 1 | | 380001,380015 | active |
| Havells 32A SP MCB C-Curve | HAV-32C2 | 418 | 495 | 25 | 1 | | 380001 | active |

`product_ref` deliberately accepts **anything the vendor already has** — a barcode, a
manufacturer part number, or a plain product name. Forcing vendors to learn platform IDs is
the fastest way to make an upload flow unused.

### Matching ladder

Per [0003](decisions/0003-stone-natural-material.md) and the import design:

| Order | Method | Result |
|---|---|---|
| 1 | Exact GTIN | `auto_matched` |
| 2 | Exact brand + MPN | `auto_matched` |
| 3 | Structured — brand + category + variant-defining attributes | `auto_matched` if confident |
| 4 | Fuzzy name (`pg_trgm`) | `needs_review` |
| 5 | No match | `needs_review` → becomes a product request |

**Stone skips steps 1–2 entirely** — no GTIN, no MPN exists. Its ladder is
`variety alias → fuzzy`, and it defaults to `needs_review` unless an alias matches exactly,
because fuzzy-matching trade names is how a catalog fragments.

### Two categories need extra columns

**Stone** — the `grade` column is load-bearing. One row per grade, since
`UNIQUE (vendor_id, master_product_id, COALESCE(stated_grade,''))` makes grade part of
listing identity. `price` is per sq ft, `qty_available` in sq ft.

| product_ref | price | qty_available | grade |
|---|---|---|---|
| Black Galaxy Polished 18mm | 165 | 2400 | Grade A |
| Black Galaxy Polished 18mm | 132 | 800 | Commercial |

**Paint** — one row per product **per colour family**, with an absolute price
([0016](decisions/0016-colour-price-per-listing.md)). No `qty_available`, since paint carries
no `inventory` rows.

| product_ref | colour_family | price |
|---|---|---|
| Royale Luxury Emulsion 20L | white | 4200 |
| Royale Luxury Emulsion 20L | blue | 4650 |
| Tractor Emulsion 20L | white | 2650 |

The export arrives pre-expanded, so this is a column to fill rather than rows to create. A
colour with no row is not offered by that vendor.

---

## Flow 3 — New product requests

**Not a separate upload.** Unmatched rows from flow 2 already sit in `catalog_import_row`
with `status = 'needs_review'` and `matched_master_product_id IS NULL`. That *is* the
request queue — asking vendors to fill a second spreadsheet for products the first one
already described would be duplicated work.

Admin review has three outcomes:

| Outcome | Action |
|---|---|
| It exists, matcher missed it | Link to the `master_product`; save the vendor's text as an alias so the next upload matches |
| Genuinely new | Promote `raw_row_json` into a draft `master_product`, fill missing attributes, publish |
| Junk or duplicate | Reject with a reason the vendor can see |

The first outcome matters most: **every manual match should teach the matcher.** For stone
that means writing `stone_variety_alias`; elsewhere, recording the vendor's phrasing against
the product. Without this the same mismatches recur every upload.

---

## Cross-cutting mechanics

**Bulk writes must suppress the cache rebuild.** A large import writing many attribute
values would otherwise rebuild the same `attributes_flat` repeatedly
([0006](decisions/0006-constraint-and-cache-invalidation-mechanisms.md)):

```sql
BEGIN;
SELECT set_config('catalog.suppress_flat_rebuild', 'on', true);
-- import writes
COMMIT;
SELECT drain_catalog_reindex_queue();
```

**Nothing goes live implicitly.** Admin rows land as `draft`; vendor rows below the
confidence threshold land as `needs_review`. `catalog_import_batch` groups a file so a bad
upload can be reviewed and reversed as a unit.

**Errors return as a file, not a screen.** Vendors work in Excel; hand back their sheet with
an appended `error` column so they can fix in place and re-upload.

**Idempotency.** Re-uploading the same file should update rather than duplicate. For vendor
listings the natural key is `(vendor_id, product_ref, grade)`; for the admin catalog it is
brand + MPN, or the variant-defining attribute set.

---

## Open questions

1. **Who maintains `stone_variety` and its aliases?** No published source exists; the list
   is assembled from dealer price lists and trade knowledge. Admin-owned, since vendors
   cannot be relied on for standard names.
2. **Grade normalisation** — "Grade A", "grade-a", "A grade" and "1st Quality" are four
   distinct listings for one vendor today. Without a controlled suggestion list at upload,
   the uniqueness rule does not bite (open question 1 of
   [0009](decisions/0009-stone-price-list-model.md)).
3. **Auto-match confidence threshold** for step 3. Too low fragments the catalog; too high
   buries the admin in review.
4. **Partial-failure policy** — does a file with 3 bad rows out of 500 import the 497, or
   reject wholesale? Per-row is friendlier; all-or-nothing is easier to reason about.
5. **Pincode serviceability** as a comma-separated column works for a handful; a vendor
   covering 200 pincodes needs radius-based entry instead.
