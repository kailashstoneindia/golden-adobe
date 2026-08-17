# Catalog ER Diagram

Entities and relationships for the product catalog, derived from
[catalog-schema.sql](catalog-schema.sql). 23 tables, 33 relationships — 32 foreign keys
defined in the schema file, plus the pre-existing `users` → `vendors` link.

`users` and `vendors` already exist in the codebase; everything else is new, **except
`vendors.city_id`** — decision [0018](decisions/0018-city-scoped-search.md) adds that one
column to the existing `vendors` table. See its consequences section before treating this
diagram as docs-only.

**Cardinality legend** — `||` exactly one · `|o` zero or one (nullable FK) ·
`o{` zero or more.

---

## Full model

```mermaid
erDiagram
    users                ||--o| vendors : "is a"

    city                 ||--o{ vendors : "based in (0018)"
    city                 ||--o{ pincode_city_map : "covers"

    category             ||--o{ category : "parent of"
    unit_of_measure      |o--o{ category : "default UOM"
    vendors              ||--o{ vendor_category : "registers for"
    category             ||--o{ vendor_category : "scopes (level 1)"

    category             |o--o{ attribute : "declares (NULL = global)"
    attribute            ||--o{ attribute_value_option : "allows"

    hsn_code             |o--o{ master_product : "sets GST rate"
    category             ||--o{ master_product : "classifies (leaf only)"
    product_family       |o--o{ master_product : "groups"
    brand                |o--o{ master_product : "made by"
    stone_variety        |o--o{ master_product : "identified as"
    unit_of_measure      |o--o{ master_product : "sold in"

    master_product       ||--o{ master_product_attribute_value : "has values"
    attribute            ||--o{ master_product_attribute_value : "typed by"
    master_product       ||--o{ master_product_media : "shown by"

    stone_variety        ||--o{ stone_variety_alias : "known as"


    master_product       ||--o{ vendor_listing : "offered as"
    vendors              ||--o{ vendor_listing : "sells"
    vendor_listing       ||--o{ vendor_listing_colour_price : "prices by colour"
    vendor_listing       ||--o{ inventory : "stocked as"
    vendors              ||--o{ warehouse : "operates"
    warehouse            |o--o{ inventory : "held at"

    vendors              ||--o{ vendor_product_map : "maps own SKUs"
    master_product       ||--o{ vendor_product_map : "mapped to"

    vendors              ||--o{ catalog_import_batch : "uploads"
    catalog_import_batch ||--o{ catalog_import_row : "contains"
    vendors              ||--o{ catalog_import_row : "owns"
    master_product       |o--o{ catalog_import_row : "matched to"

    category             |o--o{ catalog_reindex_queue : "invalidates subtree"
    master_product       |o--o{ catalog_reindex_queue : "invalidates row"
```

---

## Core catalog — the spine

```mermaid
erDiagram
    category {
        uuid id PK
        uuid parent_id FK "self, depth <= 3"
        string path "electrical/switchgear/mcb"
        smallint level "1..3"
        boolean is_leaf "only leaves take products"
    }
    attribute {
        uuid id PK
        uuid category_id FK "NULL = global"
        string code
        enum data_type
        boolean is_variant_defining
        boolean is_searchable_filter
    }
    attribute_value_option {
        uuid id PK
        uuid attribute_id FK
        string value
    }
    master_product {
        uuid id PK
        uuid category_id FK "leaf only"
        uuid brand_id FK "NULL for generics"
        uuid stone_variety_id FK "stone only"
        numeric gst_rate "follows HSN, not seller"
        string country_of_origin "NOT NULL, filterable"
        enum sale_unit_type "discrete|cut_to_length|tinted_to_order"
        jsonb attributes_flat "write-time cache"
        numeric cached_best_price "admin/ops only — never shown to a customer, 0018"
    }
    master_product_attribute_value {
        uuid master_product_id PK,FK
        uuid attribute_id PK,FK
        string value
    }

    category ||--o{ category : "parent of"
    category |o--o{ attribute : "declares"
    attribute ||--o{ attribute_value_option : "allows"
    category ||--o{ master_product : "classifies"
    master_product ||--o{ master_product_attribute_value : "has"
    attribute ||--o{ master_product_attribute_value : "typed by"
```

The composite primary key on `master_product_attribute_value` means one value per
attribute per product — no multi-valued attributes. `attributes_flat` is the derived
JSONB of the same data with inheritance already resolved.

---

## Geography — 0018, one document per (product, city)

```mermaid
erDiagram
    city {
        uuid id PK
        string name
        string state
        numeric centroid_lat "GPS resolution"
        numeric centroid_lng
        boolean is_active "pausing ops in a city"
    }
    vendors {
        uuid id PK
        uuid city_id FK "one city, for now — 0018"
    }
    pincode_city_map {
        string pincode PK
        uuid city_id FK
    }

    city ||--o{ vendors : "based in"
    city ||--o{ pincode_city_map : "covers"
```

`serviceable_pincodes` / `service_radius_km` (per-listing, on `vendor_listing`) are
**removed** by this decision — a vendor doesn't serve a different area per product. `city_id`
lives once, on `vendors`. Customer location (pincode or GPS) resolves to one `city_id`
*before* any product query runs; see [0018](decisions/0018-city-scoped-search.md).

---

## Vendor side — offers, stock, imagery

```mermaid
erDiagram
    master_product {
        uuid id PK
    }
    vendor_listing {
        uuid id PK
        uuid vendor_id FK
        uuid master_product_id FK
        numeric price "untinted price for paint"
        string stated_grade "vendor claim; part of identity"
        boolean supports_tinting
    }
    warehouse {
        uuid id PK
        uuid vendor_id FK
    }
    inventory {
        uuid id PK
        uuid vendor_listing_id FK
        uuid warehouse_id FK
        numeric quantity_available
    }

    master_product ||--o{ vendor_listing : "offered as"
    vendors ||--o{ vendor_listing : "sells"
    vendor_listing ||--o{ inventory : "stocked as"
    vendors ||--o{ warehouse : "operates"
    warehouse |o--o{ inventory : "held at"
```

`UNIQUE (vendor_id, master_product_id, COALESCE(stated_grade, ''))` — one listing per vendor
per product **per grade**, so a stone yard can quote Grade A and commercial grade at
different rates. `COALESCE` is required because Postgres treats NULLs as distinct.
`UNIQUE (vendor_listing_id, warehouse_id)` on inventory allows stock split across branches.

Paint is the only category that does not use `inventory` — a paint listing is a product line
rather than a countable bucket of base. Everything else, stone included, counts normally.

---

## Stone reference data, and paint colour pricing

```mermaid
erDiagram
    brand {
        uuid id PK
        string name
    }
    vendor_listing_colour_price {
        uuid vendor_listing_id PK,FK
        enum colour_family PK
        numeric price "absolute, one per colour"
    }
    stone_variety {
        uuid id PK
        string name "Black Galaxy"
        string stone_type
        string origin_region
    }
    stone_variety_alias {
        uuid id PK
        uuid stone_variety_id FK
        string alias "import matching"
    }

    vendor_listing ||--o{ vendor_listing_colour_price : "prices by colour"
    stone_variety ||--o{ stone_variety_alias : "known as"
    stone_variety |o--o{ master_product : "identifies"
```

`stone_variety` holds no product rows — it is a lookup table for values that are neither
attributes nor SKUs, which is why it does not violate the single-table product model. It is
referenced *from* `master_product`, because for stone the variety trade name **is** the
product's identity.

**Paint has no equivalent table.** A `paint_shade` entity was designed in 0002 and dropped
in 0014: 1,800+ shades per brand is a recurring ETL job for data the platform does not
transact on. Price is per colour family, and the exact shade is settled between customer and
vendor at the counter. `colour_family` is a Postgres enum, so `vendor_listing_colour_price`
needs nothing to join against.

---

## Full relationship reference

| # | Parent | Child | FK column | Card. | On delete |
|---|---|---|---|---|---|
| 1 | users | vendors | user_id | 1:1 | CASCADE |
| 2 | category | category | parent_id | 1:N | RESTRICT |
| 3 | unit_of_measure | category | unit_of_measure_default_id | 0..1:N | — |
| 4 | vendors | vendor_category | vendor_id | 1:N | CASCADE |
| 5 | category | vendor_category | category_id | 1:N | RESTRICT |
| 6 | category | attribute | category_id | 0..1:N | CASCADE |
| 7 | attribute | attribute_value_option | attribute_id | 1:N | CASCADE |
| 8 | category | master_product | category_id | 1:N | RESTRICT |
| 9 | product_family | master_product | product_family_id | 0..1:N | SET NULL |
| 10 | brand | master_product | brand_id | 0..1:N | RESTRICT |
| 11 | stone_variety | master_product | stone_variety_id | 0..1:N | RESTRICT |
| 12 | unit_of_measure | master_product | unit_of_measure_id | 0..1:N | — |
| 13 | master_product | master_product_attribute_value | master_product_id | 1:N | CASCADE |
| 14 | attribute | master_product_attribute_value | attribute_id | 1:N | RESTRICT |
| 15 | master_product | master_product_media | master_product_id | 1:N | CASCADE |
| 16 | stone_variety | stone_variety_alias | stone_variety_id | 1:N | CASCADE |
| 17 | vendors | vendor_listing | vendor_id | 1:N | CASCADE |
| 18 | master_product | vendor_listing | master_product_id | 1:N | RESTRICT |
| 19 | vendor_listing | vendor_listing_colour_price | vendor_listing_id | 1:N | CASCADE |
| 20 | vendors | warehouse | vendor_id | 1:N | CASCADE |
| 21 | vendor_listing | inventory | vendor_listing_id | 1:N | CASCADE |
| 22 | warehouse | inventory | warehouse_id | 0..1:N | SET NULL |
| 23 | vendors | catalog_import_batch | vendor_id | 1:N | CASCADE |
| 24 | catalog_import_batch | catalog_import_row | import_batch_id | 1:N | CASCADE |
| 25 | vendors | catalog_import_row | vendor_id | 1:N | CASCADE |
| 26 | master_product | catalog_import_row | matched_master_product_id | 0..1:N | SET NULL |
| 27 | category | catalog_reindex_queue | category_id | 0..1:N | CASCADE |
| 28 | master_product | catalog_reindex_queue | master_product_id | 0..1:N | CASCADE |
| 29 | hsn_code | master_product | hsn_code | 0..1:N | — |
| 30 | vendors | vendor_product_map | vendor_id | 1:N | CASCADE |
| 31 | master_product | vendor_product_map | master_product_id | 1:N | CASCADE |
| 32 | city | vendors | city_id | 1:N | RESTRICT *(0018 — new column on an existing table)* |
| 33 | city | pincode_city_map | city_id | 1:N | RESTRICT |

---

## Relationships that are NOT foreign keys

Three links exist logically but are deliberately not enforced:

**`master_product.cached_best_vendor_listing_id`** has no FK. A real one would be circular
— `master_product` → `vendor_listing` → `master_product` — which makes inserts and deletes
order-dependent for a value that is a denormalized cache. It is refreshed by the same
write-time process as `cached_best_price`, and a stale pointer is tolerable where a
deadlock is not.

**`master_product_attribute_value.value` → `attribute_value_option.value`** is validated in
the service layer, not by FK. An FK would only be meaningful for `data_type = 'enum'`, so it
would be a partial constraint covering some rows and not others. Open question 2 of
[0005](decisions/0005-attribute-storage-and-identity-columns.md).

**`order_item` paint colour** is carried entirely in the `configuration` JSONB —
`{ colour_family, reference_hex?, note? }` — with nothing to reference, since there is no
shade table ([0014](decisions/0014-batch-resolutions.md)). `reference_hex` is a visual hint,
not an orderable identifier.

## Constraints not visible as relationships

- **Leaf-only attachment** — `master_product.category_id` must reference a category with
  `is_leaf = true`, enforced by trigger, plus a second trigger stopping a leaf from gaining
  a child while products are attached ([0006](decisions/0006-constraint-and-cache-invalidation-mechanisms.md)).
- **`vendor_category.category_id` must be level 1** — shop-type scope, enforced in the
  service layer.
- **`is_generic` ⟹ `brand_id IS NULL`** — a CHECK constraint.
- **Paint listings carry no `inventory` rows** — availability is expressed through
  `vendor_listing.status`, because a paint listing is a product line rather than a
  countable bucket of base ([0007](decisions/0007-colour-family-pricing.md)).
