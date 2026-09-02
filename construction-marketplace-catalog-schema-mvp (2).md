# Product & Inventory Schema — MVP

Local vendors only. No formal-seller/brand onboarding flow. Covers all launch categories: cement, steel, tiles, paint, putty, wires, switches, electricals, sanitaryware, taps, door hardware, laminate/sun mica, etc.

## Core principle

Separate **"what the product is"** (master catalog — one row per real-world SKU, admin-owned) from **"who sells it and for how much"** (vendor listings — one row per vendor per SKU). This lets you compute "best price from best vendor" with a simple query, and lets the PDP show a vendor-compare toggle without merging duplicate listings at search time.

```
Category ──< Attribute
   │
   └──< Master Product (canonical SKU, grouped into Product Family)
              │
              ├──< Attribute Values (brand, grade, size, rating, etc.)
              ├──< Media (images, spec sheets, certification docs)
              │
              └──< Vendor Listing (vendor's offer on this master product)
                        │
                        └──< Inventory (stock per warehouse/branch)
```

---

## 1. Category & Attributes

Flexible spec model so cement, TMT bars, tiles, switches, taps etc. can each have different spec fields without schema changes per category.

```sql
unit_of_measure (
  id, code, name,                -- e.g. "bag", "kg", "piece", "sqft", "meter", "litre"
  is_active BOOLEAN
)
-- seeded once at setup with the fixed list of UOMs used across categories

category (
  id, name, slug, parent_id,
  unit_of_measure_default_id,   -- FK -> unit_of_measure
  hsn_code_default
)

attribute (
  id, category_id, name,        -- "Grade", "Diameter", "Amperage", "Finish"
  data_type,                    -- enum, number, text, boolean
  unit,
  is_variant_defining BOOLEAN,  -- creates a distinct SKU vs. just descriptive
  is_searchable_filter BOOLEAN
)

attribute_value_option (
  id, attribute_id, value        -- e.g. "43 Grade", "53 Grade"
)
```

Variant-defining attributes (always split into separate master products): brand, grade/type, size/dimension, pack size/UOM, rating (amperage/voltage/pressure class where relevant).

---

## 2. Master Catalog

One row = one real, physically identical SKU. Admin-created and admin-approved — vendors never create products directly in MVP.

```sql
master_product (
  id,
  category_id,
  product_family_id,            -- groups variants for one PDP (e.g. all sizes/colors
                                 -- of "Havells Crabtree Switch") — nullable if standalone
  brand_id,                     -- nullable for unbranded/generic materials
  name,
  slug,
  gtin_ean_upc,                 -- nullable, used for matching where it exists
  mfr_part_number,
  hsn_code,
  sale_unit_type,                -- 'discrete' | 'cut_to_length'
  pack_content_qty,              -- e.g. 90 (m per wire coil), 6 (tiles/box), 20 (kg/bag);
                                  -- null for simple discrete items like a single switch
  is_generic BOOLEAN,            -- true for unbranded sand, bricks, aggregate, GI fittings
  status                          -- draft, pending_review, live, deprecated
)

master_product_attribute_value (
  master_product_id, attribute_id, value
)

master_product_media (
  id, master_product_id, url, type,   -- image, spec_sheet_pdf, certification_doc
  display_order,                       -- controls gallery ordering
  is_primary BOOLEAN                   -- marks the default/thumbnail image
)
```

Certification/compliance data (ISI mark, IS code, voltage/IP rating) is just attribute values + a media row here — filled once by admin when the product is added, not re-collected from vendors.

Generic/unbranded materials (sand, aggregate, GI elbows) with no brand identity: identity is `category + attribute combination` instead of brand + GTIN.

---

## 3. Vendor Listing & Inventory

What varies vendor to vendor: price, stock, MOQ, service area.

```sql
vendor_listing (
  id,
  vendor_id,
  master_product_id,
  vendor_sku,                    -- vendor's own reference code
  price,
  mrp,
  gst_rate,
  min_order_qty,                 -- e.g. full coil only, 1 truckload, 1 piece
  status,                         -- active, paused, out_of_stock
  serviceable_pincodes / radius_km,
  updated_at
)

inventory (
  id,
  vendor_listing_id,
  warehouse_id,                  -- vendor's branch/yard if multiple
  quantity_available,
  quantity_reserved,
  updated_at
)
```

**Best price / best vendor query:**
```sql
SELECT vl.*
FROM vendor_listing vl
JOIN inventory i ON i.vendor_listing_id = vl.id
WHERE vl.master_product_id = ?
  AND vl.status = 'active'
  AND i.quantity_available > 0
  AND <pincode within serviceable area>
ORDER BY vl.price ASC
LIMIT 1
```
Vendor-compare toggle on the PDP = same query without `LIMIT 1`.

---

## 4. Vendor Onboarding (local vendors only)

**Path A — Select from catalog.** Vendor searches/browses existing master catalog, attaches price + stock. Default path, fastest.

**Path B — Excel bulk upload.** Vendor uploads their price list. Each row is matched against the master catalog:

```sql
catalog_import_row (
  id, vendor_id, import_batch_id,
  raw_row_json,
  matched_master_product_id,     -- null until resolved
  match_confidence,
  match_method,                  -- gtin, structured, fuzzy, manual
  status                          -- auto_matched, needs_review, approved, rejected
)
```
Match order: exact GTIN/MPN → brand + category + key attributes → fuzzy name match. High-confidence matches auto-attach; everything else goes to a review queue rather than auto-merging.

**Path C — New product request.** Only when nothing in the catalog matches. Goes to admin for approval before going live — this is the dedup gate that keeps the catalog from fragmenting into near-duplicate entries.

---

## Summary

| Entity | Purpose |
|---|---|
| `category` / `attribute` | Taxonomy + flexible specs per category |
| `master_product` | One canonical, deduplicated SKU, grouped by `product_family_id` |
| `vendor_listing` | One vendor's offer (price, MOQ, status) |
| `inventory` | Stock per listing per warehouse/branch |
| `catalog_import_row` | Staging + matching table for Excel uploads |

Covers cement, steel, tiles, paint, putty, wires, switches, electricals, sanitaryware, taps, door hardware, and laminate under one consistent model — no category-specific schema needed.
