-- =============================================================================
-- Golden Abode — Product Catalog Schema (canonical DDL)
-- =============================================================================
-- Implements decisions 0001–0005 in docs/decisions/ and the structure in
-- docs/catalog-structure.md.
--
-- This is the canonical reference, NOT a migration. Sequelize migrations in
-- apps/backend/database/migrations/ are derived from it. Conventions match the
-- existing migrations: UUID primary keys, snake_case columns, created_at /
-- updated_at on every table. Where this file uses gen_random_uuid(), the
-- Sequelize equivalent is Sequelize.UUIDV4.
--
-- Assumes existing tables: users, vendors.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy name matching for imports


-- =============================================================================
-- 1. ENUM TYPES
-- =============================================================================

CREATE TYPE attribute_data_type AS ENUM ('enum', 'number', 'text', 'boolean');

CREATE TYPE sale_unit_type      AS ENUM ('discrete', 'cut_to_length', 'tinted_to_order');

CREATE TYPE paint_base_type     AS ENUM ('white', 'pastel', 'medium', 'deep', 'neutral');

-- Load-bearing: this is the PRICING KEY, not just a search facet (decision 0007).
-- A typo here would create an unpriced colour, so it is an enum rather than free text.
CREATE TYPE paint_colour_family AS ENUM (
  'white', 'off_white', 'beige', 'brown', 'yellow', 'orange',
  'red', 'pink', 'purple', 'blue', 'green', 'grey', 'black'
);

CREATE TYPE master_product_status AS ENUM ('draft', 'pending_review', 'live', 'deprecated');

CREATE TYPE vendor_listing_status AS ENUM ('active', 'paused', 'out_of_stock');

-- vendor_pricing_mode was introduced in 0008 and dropped in 0015: with the
-- colour component expressed as a per-vendor delta on top of an ordinary
-- listing price, every listing prices the same way and there is nothing to
-- switch on. sale_unit_type = 'tinted_to_order' already signals that a delta
-- applies.

CREATE TYPE media_type          AS ENUM ('image', 'spec_sheet_pdf', 'certification_doc');

CREATE TYPE import_row_status   AS ENUM ('auto_matched', 'needs_review', 'approved', 'rejected');

CREATE TYPE import_match_method AS ENUM ('gtin', 'mpn', 'structured', 'variety_alias', 'fuzzy', 'manual');


-- =============================================================================
-- 2. REFERENCE DATA
-- =============================================================================

CREATE TABLE unit_of_measure (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(16)  NOT NULL UNIQUE,   -- 'bag','kg','piece','sqft','metre','litre'
  name        VARCHAR(64)  NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- GST follows the HSN code, so the code owns the rate (decision 0014).
-- master_product.gst_rate is populated from here at write time rather than
-- joined on read — rates change rarely, and a snapshot keeps historical
-- invoices correct when a rate is revised.
CREATE TABLE hsn_code (
  code        VARCHAR(16) PRIMARY KEY,   -- 4, 6 or 8 digits
  description VARCHAR(255) NOT NULL,
  gst_rate    NUMERIC(5,2) NOT NULL CHECK (gst_rate >= 0),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- Brand is a first-class entity, never an attribute (decision 0005, finding 2).
CREATE TABLE brand (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(128) NOT NULL,
  slug        VARCHAR(160) NOT NULL UNIQUE,
  logo_url    TEXT,

  -- Legal Metrology (Packaged Commodities) Rules 2011, amended 2023 — an
  -- e-commerce listing must display these before purchase (decision 0010).
  -- Brand level because they are identical across every SKU of a brand.
  --
  -- NOT NULL by decision 0014: a brand that cannot supply consumer care details
  -- is not listed. Strict, and it will block some small local manufacturers —
  -- that is the accepted trade for compliance being structural rather than
  -- dependent on someone remembering.
  manufacturer_name    VARCHAR(255) NOT NULL,
  manufacturer_address TEXT         NOT NULL,
  consumer_care_email  VARCHAR(255) NOT NULL,
  consumer_care_phone  VARCHAR(32)  NOT NULL,

  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 2b. GEOGRAPHY  (decision 0018 — the business connects customers to LOCAL
-- vendors; every search is scoped to exactly one city, never cross-city)
-- =============================================================================

-- Admin-curated, not user-generated. Launching a city is a business decision
-- (onboard vendors, seed serviceability) — it is never inferred from a pincode
-- or a coordinate on the fly. Small table: a handful of rows at launch.
CREATE TABLE city (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(64)  NOT NULL,
  slug          VARCHAR(80)  NOT NULL UNIQUE,
  state         VARCHAR(64)  NOT NULL,   -- disambiguates same-named cities across states

  -- Centroid, for the GPS resolution path below. A city, not a precise
  -- boundary — see the open question on edge-of-city accuracy.
  centroid_lat  NUMERIC(9,6) NOT NULL,
  centroid_lng  NUMERIC(9,6) NOT NULL,

  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,   -- pausing ops in a city
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT city_name_unique_per_state UNIQUE (name, state)
);

CREATE INDEX idx_city_active ON city (is_active);


-- Customer location resolution, path 1 of 2: pincode entry.
--
-- A LOOKUP table, not a computed mapping — pincodes do not self-describe their
-- city. Seeded from the public India Post pincode dataset (an open government
-- dataset, not trade knowledge like stone_variety), filtered to launch cities
-- only and grown as new cities launch. One pincode belongs to exactly one city
-- — this is a real-world fact, not a platform choice.
CREATE TABLE pincode_city_map (
  pincode     VARCHAR(6) PRIMARY KEY,
  city_id     UUID NOT NULL REFERENCES city(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pincode_city ON pincode_city_map (city_id);

-- Customer location resolution, path 2 of 2: GPS.
--
-- Resolved as NEAREST ACTIVE CITY CENTROID (haversine over city.centroid_lat/
-- lng), not by reverse-geocoding to a pincode. This avoids a third-party
-- geocoding API dependency entirely — city.centroid_lat/lng plus a small
-- distance calculation is enough at launch-city scale. Both paths converge on
-- the same city_id before any product query runs.
--
-- Accuracy caveat, deliberately accepted: nearest-centroid can misjudge a
-- customer near a city boundary. See open questions.


-- =============================================================================
-- 3. CATEGORY TREE  (decision 0001 — variable depth 2–3, hard cap at 3)
-- =============================================================================

CREATE TABLE category (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id                   UUID REFERENCES category(id) ON DELETE RESTRICT,
  name                        VARCHAR(128) NOT NULL,
  slug                        VARCHAR(160) NOT NULL,

  -- Denormalized: adjacency alone cannot answer "how deep" or "am I a leaf"
  -- without a recursive query on every read.
  level                       SMALLINT     NOT NULL,
  path                        TEXT         NOT NULL UNIQUE,  -- 'electrical/switchgear/mcb'
  is_leaf                     BOOLEAN      NOT NULL DEFAULT TRUE,

  unit_of_measure_default_id  UUID REFERENCES unit_of_measure(id),
  hsn_code_default            VARCHAR(16),
  external_taxonomy_code      VARCHAR(64),   -- Google / Shopify export mapping only
  display_order               INTEGER      NOT NULL DEFAULT 0,
  is_active                   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT category_level_range   CHECK (level BETWEEN 1 AND 3),
  CONSTRAINT category_root_is_level1 CHECK ((parent_id IS NULL) = (level = 1)),
  CONSTRAINT category_slug_unique_per_parent UNIQUE (parent_id, slug)
);

CREATE INDEX idx_category_parent    ON category (parent_id);
CREATE INDEX idx_category_path      ON category (path text_pattern_ops);
CREATE INDEX idx_category_level     ON category (level) WHERE is_active;

-- Invariants maintained in the service layer (or by trigger):
--   level    = parent.level + 1
--   path     = parent.path || '/' || slug
--   is_leaf  = NOT EXISTS (SELECT 1 FROM category c WHERE c.parent_id = this.id)


-- Vendor registration scope. Level 1 doubles as shop type (decision 0001);
-- many-to-many, so a shop selling both plumbing and sanitaryware registers for both.
CREATE TABLE vendor_category (
  vendor_id   UUID NOT NULL REFERENCES vendors(id)  ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vendor_id, category_id)
);


-- =============================================================================
-- 4. ATTRIBUTES  (decision 0001 — declared once, inherited by all descendants)
-- =============================================================================

CREATE TABLE attribute (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = GLOBAL: applies to every product in every category (decision 0005,
  -- finding 1). There is no single root category to hang global attributes on,
  -- so NULL encodes global scope rather than inventing a phantom node.
  category_id           UUID REFERENCES category(id) ON DELETE CASCADE,

  code                  VARCHAR(64)  NOT NULL,
  name                  VARCHAR(128) NOT NULL,
  data_type             attribute_data_type NOT NULL,
  unit                  VARCHAR(32),
  is_variant_defining   BOOLEAN      NOT NULL DEFAULT FALSE,
  is_searchable_filter  BOOLEAN      NOT NULL DEFAULT FALSE,
  display_order         INTEGER      NOT NULL DEFAULT 0,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Code is unique within a category, and unique among globals.
CREATE UNIQUE INDEX idx_attribute_code_per_category
  ON attribute (category_id, code) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX idx_attribute_code_global
  ON attribute (code) WHERE category_id IS NULL;

CREATE INDEX idx_attribute_category ON attribute (category_id);


CREATE TABLE attribute_value_option (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id  UUID NOT NULL REFERENCES attribute(id) ON DELETE CASCADE,
  value         VARCHAR(128) NOT NULL,
  display_order INTEGER      NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT attribute_value_unique UNIQUE (attribute_id, value)
);

-- Only attributes with data_type = 'enum' should carry options; enforced in the
-- service layer since a CHECK cannot reach across tables.


-- -----------------------------------------------------------------------------
-- Effective attribute set for a leaf category: global attributes plus every
-- attribute declared on the category or any ancestor. Run at AUTHORING time and
-- when building the search document — never on a read path (decision 0002).
-- -----------------------------------------------------------------------------
-- WITH RECURSIVE ancestry AS (
--   SELECT id, parent_id FROM category WHERE id = :leaf_category_id
--   UNION ALL
--   SELECT c.id, c.parent_id FROM category c JOIN ancestry a ON c.id = a.parent_id
-- )
-- SELECT a.*
-- FROM attribute a
-- WHERE a.is_active
--   AND (a.category_id IS NULL OR a.category_id IN (SELECT id FROM ancestry))
-- ORDER BY a.display_order;


-- =============================================================================
-- 5. STONE & PAINT REFERENCE TABLES
-- =============================================================================
-- Neither holds product rows. They are lookup tables for domain values that are
-- neither attributes nor SKUs, so they do not fragment the single-table product
-- model.

CREATE TABLE stone_variety (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(128) NOT NULL,       -- 'Black Galaxy'
  slug           VARCHAR(160) NOT NULL UNIQUE,
  stone_type     VARCHAR(64)  NOT NULL,       -- granite | marble | kota | sandstone | …
  origin_region  VARCHAR(128),                -- 'Andhra Pradesh'
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Drives import matching. Stone has no GTIN or MPN, so the top of the normal
-- match order is unavailable (decision 0003).
CREATE TABLE stone_variety_alias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stone_variety_id  UUID NOT NULL REFERENCES stone_variety(id) ON DELETE CASCADE,
  alias             VARCHAR(160) NOT NULL,    -- normalized lowercase
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT stone_alias_unique UNIQUE (alias)
);

CREATE INDEX idx_stone_alias_trgm ON stone_variety_alias USING GIN (alias gin_trgm_ops);


-- NO PAINT SHADE TABLE (decision 0014).
--
-- Shade data was designed in 0002 and dropped: 1,800+ shades per brand is a
-- recurring ETL job against brand shade cards, for data the platform does not
-- actually transact on. Price is per COLOUR FAMILY (0007), and the exact shade
-- is settled between customer and vendor at the counter, using the vendor's
-- physical fan deck — which is how Indian paint buying already works.
--
-- The customer picks a colour family and may attach a visual reference; the
-- order line carries { colour_family, reference_hex?, note? }. The vendor
-- resolves which base to open and dispenses.
--
-- Also dropped earlier, by 0007:
--   paint_shade_base_compatibility — base stopped being priced
--   paint_colorant_delta           — pricing moved to the vendor
--
-- Revisit if orders need to name an exact, orderable shade. A curated list
-- (top ~100 per brand) would be the middle path.


-- =============================================================================
-- 6. MASTER CATALOG
-- =============================================================================

-- Product codes are never reused: a deprecated code may still exist in a
-- vendor's saved spreadsheet or a past order.
CREATE SEQUENCE master_product_code_seq START 100000;

CREATE TABLE product_family (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(280) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


CREATE TABLE master_product (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Leaf-only attachment (decision 0001), enforced by trigger — see section 9.
  category_id         UUID NOT NULL REFERENCES category(id) ON DELETE RESTRICT,

  product_family_id   UUID REFERENCES product_family(id) ON DELETE SET NULL,

  -- Identity lives in columns, never in attributes (decision 0005, finding 2).
  brand_id            UUID REFERENCES brand(id) ON DELETE RESTRICT,   -- NULL for generics
  stone_variety_id    UUID REFERENCES stone_variety(id) ON DELETE RESTRICT,  -- finding 3

  name                VARCHAR(255) NOT NULL,
  slug                VARCHAR(280) NOT NULL UNIQUE,
  description         TEXT,

  -- Public, permanent, human-usable identifier (decision 0011). Opaque by
  -- design: semantic codes break when products are reclassified, and this
  -- project already moved LED bulbs between categories and split Sanitaryware
  -- out of Plumbing. The 'GA-' prefix is load-bearing — Excel silently strips
  -- leading zeros and converts long bare numerics to scientific notation.
  product_code        VARCHAR(16) NOT NULL UNIQUE
                        DEFAULT 'GA-' || LPAD(nextval('master_product_code_seq')::text, 7, '0'),

  -- BONUS identifier, not the backbone. brand_id + mfr_part_number is the
  -- primary dedup path for this market (see the unique indexes below).
  -- Nullable and patchy by nature: stone has no GTIN, generics (sand, GI
  -- fittings) have none, small hardware brands are unreliable, and paint's
  -- barcode is on the base tin — a level this catalog stopped modelling in 0007.
  -- Kept because a nullable column plus a partial index costs nothing, and
  -- where a barcode does exist it is the strongest signal available.
  gtin                VARCHAR(20) UNIQUE,

  mfr_part_number     VARCHAR(64),
  hsn_code            VARCHAR(16) REFERENCES hsn_code(code),

  -- Snapshot of hsn_code.gst_rate, taken on write (0010, 0014). GST is set by
  -- the HSN code, never by the seller — it was on vendor_listing originally,
  -- which let two vendors declare different GST for the same product.
  gst_rate            NUMERIC(5,2) NOT NULL DEFAULT 18.00,

  -- Legal Metrology: must be displayed AND exposed as a searchable, sortable
  -- filter. A column rather than an attribute so NOT NULL guarantees compliance
  -- instead of relying on someone filling in an attribute.
  country_of_origin   VARCHAR(64)  NOT NULL DEFAULT 'India',
  importer_details    TEXT,        -- imported goods only; varies per product

  sale_unit_type      sale_unit_type NOT NULL DEFAULT 'discrete',
  unit_of_measure_id  UUID REFERENCES unit_of_measure(id),
  pack_content_qty    NUMERIC(12,3),      -- packaging quantity: coil metres, tiles/box, litres/bucket

  -- base_type and pack_volume_litres were removed by decision 0007. Base is no
  -- longer part of the paint SKU — a paint product is now line + pack size
  -- ("Royale Luxury Emulsion, 20L"), and the base is resolved from the chosen
  -- shade at fulfilment. pack_volume_litres existed only to scale the colorant
  -- delta, which no longer exists.

  is_generic            BOOLEAN NOT NULL DEFAULT FALSE,
  has_natural_variation BOOLEAN NOT NULL DEFAULT FALSE,  -- drives PDP disclaimer badge

  status              master_product_status NOT NULL DEFAULT 'draft',

  -- Deterministic identity for products with no brand and no MPN — generics and
  -- stone (decision 0013). md5 of the normalised variant-defining attribute
  -- values, sorted by attribute code. NULL until attributes exist.
  --
  -- Versioned (0014): if the normalisation rules ever change, old hashes stop
  -- being comparable to new ones. The version lets a rebuild be detected and
  -- driven, rather than silently mismatching.
  identity_hash          TEXT,
  identity_hash_version  SMALLINT NOT NULL DEFAULT 1,

  -- Flattened effective attribute set, resolved on write (decision 0005).
  -- Source of truth remains master_product_attribute_value; this is a derived
  -- cache that makes Phase-1 Postgres filtering a single GIN index lookup.
  attributes_flat     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- GLOBAL best price — cheapest across every vendor in every city. NOT what a
  -- customer is shown (decision 0018): the business connects buyers to LOCAL
  -- vendors, so the price that matters is scoped to the customer's city, and
  -- this single column cannot express that. Kept for admin/ops visibility only
  -- (catalog monitoring, "is anyone stocking this at all, anywhere").
  --
  -- "Best price" itself is NOT retired — it moves, not disappears. The
  -- customer-facing figure is the SAME cheapest-among-vendors computation,
  -- just re-scoped to one city and recomputed at search-document build time
  -- instead of stored here: see search-system-design.md §5 ("price is a
  -- city-scoped best price") and search-schema.sql. The Meilisearch document
  -- is that cache; there is no second Postgres column for it.
  cached_best_price             NUMERIC(12,2),
  cached_best_vendor_listing_id UUID,
  cached_updated_at             TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Generic products carry no brand
  CONSTRAINT master_product_generic_has_no_brand
    CHECK (NOT is_generic OR brand_id IS NULL)
);

CREATE INDEX idx_master_product_category_status ON master_product (category_id, status);
CREATE INDEX idx_master_product_best_price      ON master_product (cached_best_price)
  WHERE status = 'live';
CREATE INDEX idx_master_product_brand           ON master_product (brand_id);
CREATE INDEX idx_master_product_family          ON master_product (product_family_id);
CREATE INDEX idx_master_product_stone_variety   ON master_product (stone_variety_id);
CREATE INDEX idx_master_product_code            ON master_product (product_code);
CREATE INDEX idx_master_product_gtin            ON master_product (gtin)
  WHERE gtin IS NOT NULL;

-- PRIMARY DEDUPLICATION DEFENCE (decision 0012). Brand + MPN is the established
-- B2B dedup key. It MUST be composite: an MPN is unique only inside its own
-- manufacturer's namespace, so two manufacturers can legitimately use the same
-- MPN string for different products. Partial because generics carry neither.
-- Store mfr_part_number normalised (trimmed, case-folded) or DHMGCSPF032 and
-- dhmgcspf032 pass as distinct.
CREATE UNIQUE INDEX master_product_brand_mpn
  ON master_product (brand_id, mfr_part_number)
  WHERE brand_id IS NOT NULL AND mfr_part_number IS NOT NULL;

-- SECOND DEDUPLICATION DEFENCE (decision 0013), covering generics and stone,
-- which have no brand and no MPN. Enforced at PUBLISH, not insert: attribute
-- values are written after the product row, so at insert there is nothing to
-- hash. Drafts are unconstrained; status → live is already a deliberate step.
CREATE UNIQUE INDEX master_product_generic_identity
  ON master_product (category_id, identity_hash)
  WHERE status = 'live' AND identity_hash IS NOT NULL;
CREATE INDEX idx_master_product_name_trgm       ON master_product USING GIN (name gin_trgm_ops);
-- Legal Metrology requires country of origin to be searchable AND sortable.
CREATE INDEX idx_master_product_origin          ON master_product (country_of_origin)
  WHERE status = 'live';

-- Multi-attribute filtering in Phase 1 — one index instead of N self-joins.
CREATE INDEX idx_master_product_attributes ON master_product USING GIN (attributes_flat);


-- Source of truth for attribute values: validated, constrained, admin-editable.
CREATE TABLE master_product_attribute_value (
  master_product_id UUID NOT NULL REFERENCES master_product(id) ON DELETE CASCADE,
  attribute_id      UUID NOT NULL REFERENCES attribute(id)      ON DELETE RESTRICT,
  value             VARCHAR(255) NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (master_product_id, attribute_id)
);

CREATE INDEX idx_mpav_attribute ON master_product_attribute_value (attribute_id, value);


CREATE TABLE master_product_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_product_id UUID NOT NULL REFERENCES master_product(id) ON DELETE CASCADE,
  url               TEXT       NOT NULL,
  type              media_type NOT NULL DEFAULT 'image',
  display_order     INTEGER    NOT NULL DEFAULT 0,
  is_primary        BOOLEAN    NOT NULL DEFAULT FALSE,
  is_representative BOOLEAN    NOT NULL DEFAULT FALSE,  -- indicative, not a specific item
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_mpm_one_primary
  ON master_product_media (master_product_id) WHERE is_primary;


-- =============================================================================
-- 7. VENDOR LISTINGS & INVENTORY
-- =============================================================================

CREATE TABLE vendor_listing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID NOT NULL REFERENCES vendors(id)        ON DELETE CASCADE,
  master_product_id UUID NOT NULL REFERENCES master_product(id) ON DELETE RESTRICT,
  vendor_sku        VARCHAR(64),

  -- Every listing carries a price. For tinted paint this is the UNTINTED price,
  -- and vendor_listing_colour_price holds an absolute price per colour offered.
  -- No pricing_mode column is needed (0008 introduced one, 0015 dropped it):
  -- sale_unit_type = 'tinted_to_order' already tells the UI to look for colour
  -- prices.
  price             NUMERIC(12,2) NOT NULL CHECK (price >= 0),

  mrp               NUMERIC(12,2) CHECK (mrp >= 0),
  -- gst_rate moved to master_product (0010): GST follows the HSN code, not the
  -- seller, so a per-vendor rate was never legitimate.
  min_order_qty     NUMERIC(12,3) NOT NULL DEFAULT 1,

  supports_tinting  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Vendor's OWN grade label, shown verbatim and attributed (0003, 0009).
  -- Free text, not an enum: granite grading is not standardized and the same
  -- word means different things by origin, so an enum would manufacture
  -- comparability that does not exist. Part of listing identity, because Indian
  -- stone price lists quote per grade — one Excel row per grade.
  stated_grade      VARCHAR(64),

  -- serviceable_pincodes / service_radius_km REMOVED (decision 0018). A vendor
  -- does not serve different areas for different products — that was modelling
  -- serviceability a level too fine. It now lives once, on the existing
  -- `vendors` table, as `vendors.city_id` (see docs/decisions/0018 for the
  -- migration this implies on a table that already exists in production).
  status            vendor_listing_status NOT NULL DEFAULT 'active',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One listing per vendor per product PER GRADE (decision 0009), so a stone yard
-- can quote Grade A and commercial grade at different rates the way its printed
-- price list does. COALESCE is required because Postgres treats NULLs as
-- distinct — without it a vendor could create unlimited duplicate listings for
-- any non-stone product by leaving grade empty.
CREATE UNIQUE INDEX vendor_listing_unique
  ON vendor_listing (vendor_id, master_product_id, COALESCE(stated_grade, ''));

CREATE INDEX idx_vendor_listing_product ON vendor_listing (master_product_id, status);
CREATE INDEX idx_vendor_listing_vendor  ON vendor_listing (vendor_id, status);
CREATE INDEX idx_vendor_listing_price   ON vendor_listing (master_product_id, price)
  WHERE status = 'active';
-- Serviceability filtering now goes through vendors.city_id, not this table —
-- see the removal note above and decision 0018.


-- Paint colour pricing (decisions 0007, 0016). The client prices by COLOUR
-- FAMILY: a vendor sets what blue costs on a product, and the customer picks any
-- blue shade at that price.
--
-- An ABSOLUTE price per listing per colour. No delta, no per-litre scaling, no
-- arithmetic at order time — the listing is already one product at one pack
-- size, so this price is complete.
--
--   unit_price = vendor_listing_colour_price.price
--
-- A colour family with no row here is not offered by that vendor, and the
-- picker must not show it.
--
-- The volume trade-off is accepted deliberately: 50 paint listings × ~10 colours
-- is ~500 rows, but the pre-filled export (0011) generates them pre-expanded, so
-- the vendor fills a column rather than typing 500 numbers. A per-vendor delta
-- model was tried in 0015 and reverted — see 0016.
CREATE TABLE vendor_listing_colour_price (
  vendor_listing_id UUID NOT NULL REFERENCES vendor_listing(id) ON DELETE CASCADE,
  colour_family     paint_colour_family NOT NULL,
  price             NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (vendor_listing_id, colour_family)
);

CREATE INDEX idx_vlcp_price ON vendor_listing_colour_price (vendor_listing_id, price);


-- NO VENDOR-SUPPLIED IMAGERY (decision 0009). The master catalog carries
-- admin-curated representative images and nothing else. A bundle/lot tier with
-- vendor lot photos was designed in 0008 and reverted — Indian stone is a
-- price-list trade, and the capability was removed rather than scoped, which
-- also eliminates the moderation queue.


CREATE TABLE warehouse (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name        VARCHAR(128) NOT NULL,
  address     TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Inventory counts whatever the vendor_listing points at, in the category's unit
-- of measure — pieces, metres, sq ft for stone.
--
-- PAINT IS THE ONLY EXCEPTION (0007): nothing is countable. A paint listing is a
-- product line + pack size, not a bucket of base, so a vendor holding 12 buckets
-- across four bases cannot express that against one listing.
-- vendor_listing.status carries availability instead.
CREATE TABLE inventory (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_listing_id  UUID NOT NULL REFERENCES vendor_listing(id) ON DELETE CASCADE,
  warehouse_id       UUID REFERENCES warehouse(id) ON DELETE SET NULL,
  quantity_available NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved  NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (quantity_reserved  >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inventory_unique_per_warehouse UNIQUE (vendor_listing_id, warehouse_id)
);

CREATE INDEX idx_inventory_listing ON inventory (vendor_listing_id)
  WHERE quantity_available > 0;


-- =============================================================================
-- 8. VENDOR IMPORT STAGING
-- =============================================================================

-- Match once, never re-guess (decision 0011). After one confirmed match the
-- vendor's own code is authoritative, so re-uploads skip the matcher entirely.
-- Matters most for stone, which has no GTIN or MPN to match deterministically.
CREATE TABLE vendor_product_map (
  vendor_id         UUID NOT NULL REFERENCES vendors(id)        ON DELETE CASCADE,
  vendor_sku        VARCHAR(64) NOT NULL,
  master_product_id UUID NOT NULL REFERENCES master_product(id) ON DELETE CASCADE,
  confirmed_by      VARCHAR(16) NOT NULL,   -- 'vendor' | 'admin'
  confirmed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vendor_id, vendor_sku)
);

CREATE INDEX idx_vpm_product ON vendor_product_map (master_product_id);


CREATE TABLE catalog_import_batch (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  file_url    TEXT,
  row_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE catalog_import_row (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id          UUID NOT NULL REFERENCES catalog_import_batch(id) ON DELETE CASCADE,
  vendor_id                UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  raw_row_json             JSONB NOT NULL,
  matched_master_product_id UUID REFERENCES master_product(id) ON DELETE SET NULL,
  match_confidence         NUMERIC(5,4),
  match_method             import_match_method,

  -- Ranked candidates, not just a verdict (decision 0011). A data steward needs
  -- candidate pairs with scores and differing values to choose from — a bare
  -- 'needs_review' flag makes them investigate from scratch.
  -- [ {master_product_id, score, matched_on, differing_attributes}, … ]
  match_candidates         JSONB NOT NULL DEFAULT '[]'::jsonb,

  status                   import_row_status NOT NULL DEFAULT 'needs_review',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_row_status ON catalog_import_row (import_batch_id, status);

-- Match ladder (decision 0011). Steps 0–3 are deterministic and safe to
-- auto-publish; 4–5 must not publish without vendor confirmation.
--
--   0. vendor_product_map exact ────► link, done (never re-guessed)
--   1. product_code exact ──────────► link, done
--   2. brand + mfr_part_number exact ► link
--   3. GTIN exact, where present ───► link
--   4. structured: brand + category + variant-defining attributes
--   5. fuzzy name (pg_trgm) ────────► candidates → review
--   6. no match ────────────────────► new product request
--
-- MPN before GTIN, deliberately: GTIN is India's barcode standard (GS1 India,
-- '890' prefix) but adoption in building materials is weak, because barcodes
-- follow point-of-sale scanning and this trade sells across counters that do
-- not scan. MPN is what dealers actually order on, from printed price lists.
--
-- STONE skips 2–3 entirely — no MPN, no GTIN exists. Its ladder is
-- variety_alias → fuzzy, defaulting to 'needs_review' unless an alias matches
-- exactly (decision 0003): fuzzy-matching trade names fragments a catalog.


-- =============================================================================
-- 9. FUNCTIONS & TRIGGERS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9a. Leaf-only category attachment (decision 0001)
-- -----------------------------------------------------------------------------
-- TWO triggers are required, not one. The earlier composite-FK approach
-- (UNIQUE (id, is_leaf) + a generated TRUE column) enforced both directions for
-- free: ON UPDATE RESTRICT also blocked a category from flipping is_leaf to
-- FALSE while products referenced it. A plain trigger only guards the insert
-- side, so the second guard must be written explicitly.

CREATE OR REPLACE FUNCTION enforce_master_product_leaf_category()
RETURNS TRIGGER AS $$
DECLARE
  v_is_leaf BOOLEAN;
BEGIN
  SELECT is_leaf INTO v_is_leaf FROM category WHERE id = NEW.category_id;

  IF v_is_leaf IS NULL THEN
    RAISE EXCEPTION 'category % does not exist', NEW.category_id;
  END IF;

  IF NOT v_is_leaf THEN
    RAISE EXCEPTION
      'master_product.category_id must reference a leaf category (% is not a leaf)',
      NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_master_product_leaf_category
  BEFORE INSERT OR UPDATE OF category_id ON master_product
  FOR EACH ROW EXECUTE FUNCTION enforce_master_product_leaf_category();


-- The direction the FK used to cover: a leaf gaining a child would silently
-- orphan the products attached to it.
CREATE OR REPLACE FUNCTION enforce_category_leaf_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF OLD.is_leaf AND NOT NEW.is_leaf THEN
    SELECT COUNT(*) INTO v_count FROM master_product WHERE category_id = NEW.id;
    IF v_count > 0 THEN
      RAISE EXCEPTION
        'cannot add children to category % — % product(s) are attached to it; '
        'move them to a leaf category first',
        NEW.id, v_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_leaf_transition
  BEFORE UPDATE OF is_leaf ON category
  FOR EACH ROW EXECUTE FUNCTION enforce_category_leaf_transition();


-- -----------------------------------------------------------------------------
-- 9b. attributes_flat maintenance (decision 0005)
-- -----------------------------------------------------------------------------
-- The flattened document resolves inheritance AND filters out values whose
-- attribute is no longer in scope (deactivated, or moved to another branch).

CREATE OR REPLACE FUNCTION build_attributes_flat(p_master_product_id UUID)
RETURNS JSONB AS $$
  WITH RECURSIVE ancestry AS (
    SELECT c.id, c.parent_id
    FROM category c
    JOIN master_product mp ON mp.category_id = c.id
    WHERE mp.id = p_master_product_id
    UNION ALL
    SELECT c.id, c.parent_id
    FROM category c JOIN ancestry a ON c.id = a.parent_id
  )
  SELECT COALESCE(jsonb_object_agg(a.code, v.value), '{}'::jsonb)
  FROM master_product_attribute_value v
  JOIN attribute a ON a.id = v.attribute_id
  WHERE v.master_product_id = p_master_product_id
    AND a.is_active
    AND (a.category_id IS NULL OR a.category_id IN (SELECT id FROM ancestry));
$$ LANGUAGE sql STABLE;


-- Bulk-write escape hatch. A row trigger fires per row, so an import writing
-- 50 attribute values for one product would rebuild the same JSONB 50 times.
-- Setting this inside the import transaction defers the work to the queue:
--
--   BEGIN;
--   SELECT set_config('catalog.suppress_flat_rebuild', 'on', true);  -- txn-local
--   ... bulk writes ...
--   COMMIT;
--   SELECT drain_catalog_reindex_queue();
--
CREATE OR REPLACE FUNCTION flat_rebuild_suppressed()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('catalog.suppress_flat_rebuild', TRUE), 'off') = 'on';
$$ LANGUAGE sql STABLE;


-- Enum attribute values must exist in attribute_value_option (decision 0014).
-- A foreign key cannot express this: it would apply only to attributes whose
-- data_type is 'enum', and Postgres has no partial FK. A trigger is the only
-- way to enforce it in the database rather than trusting the service layer.
CREATE OR REPLACE FUNCTION enforce_attribute_value_option()
RETURNS TRIGGER AS $$
DECLARE
  v_type attribute_data_type;
BEGIN
  SELECT data_type INTO v_type FROM attribute WHERE id = NEW.attribute_id;

  IF v_type = 'enum' AND NOT EXISTS (
    SELECT 1 FROM attribute_value_option
    WHERE attribute_id = NEW.attribute_id
      AND value = NEW.value
      AND is_active
  ) THEN
    RAISE EXCEPTION
      'value % is not an allowed option for attribute %', NEW.value, NEW.attribute_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mpav_enum_value
  BEFORE INSERT OR UPDATE ON master_product_attribute_value
  FOR EACH ROW EXECUTE FUNCTION enforce_attribute_value_option();


-- Deterministic identity for unbranded products (decision 0013). Normalisation
-- is mandatory, not cosmetic: without it `18` and `18.0` hash differently and
-- the constraint is theatre. Only variant-defining attributes participate.
CREATE OR REPLACE FUNCTION build_identity_hash(p_master_product_id UUID)
RETURNS TEXT AS $$
  SELECT md5(string_agg(a.code || '=' || norm.value, '|' ORDER BY a.code))
  FROM master_product_attribute_value v
  JOIN attribute a ON a.id = v.attribute_id
  CROSS JOIN LATERAL (
    SELECT CASE
             -- strip trailing zeros: 18, 18.0 and 18.00 must agree
             WHEN a.data_type = 'number' AND v.value ~ '^-?[0-9]+(\.[0-9]+)?$'
               THEN trim_scale(v.value::numeric)::text
             -- trim, collapse internal whitespace, case-fold
             ELSE lower(regexp_replace(btrim(v.value), '\s+', ' ', 'g'))
           END AS value
  ) norm
  WHERE v.master_product_id = p_master_product_id
    AND a.is_variant_defining
    AND a.is_active;
$$ LANGUAGE sql STABLE;


-- Invalidation source 1: the product's own values changed. Row-level, cheap.
CREATE OR REPLACE FUNCTION refresh_attributes_flat()
RETURNS TRIGGER AS $$
DECLARE
  v_id UUID := COALESCE(NEW.master_product_id, OLD.master_product_id);
BEGIN
  IF flat_rebuild_suppressed() THEN
    INSERT INTO catalog_reindex_queue (scope, master_product_id, reason)
    SELECT 'product', v_id, 'suppressed bulk write'
    WHERE NOT EXISTS (
      SELECT 1 FROM catalog_reindex_queue
      WHERE scope = 'product' AND master_product_id = v_id AND processed_at IS NULL
    );
    RETURN NULL;
  END IF;

  UPDATE master_product
     SET attributes_flat = build_attributes_flat(v_id),
         identity_hash   = build_identity_hash(v_id),
         updated_at      = NOW()
   WHERE id = v_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mpav_refresh_flat
  AFTER INSERT OR UPDATE OR DELETE ON master_product_attribute_value
  FOR EACH ROW EXECUTE FUNCTION refresh_attributes_flat();


-- Invalidation source 2: the product moved category, so its inherited set
-- changed. Safe from recursion — the inner UPDATE does not touch category_id,
-- and this trigger only fires when category_id appears in the SET list.
CREATE OR REPLACE FUNCTION refresh_attributes_flat_on_move()
RETURNS TRIGGER AS $$
BEGIN
  IF flat_rebuild_suppressed() THEN
    INSERT INTO catalog_reindex_queue (scope, master_product_id, reason)
    SELECT 'product', NEW.id, 'suppressed category move'
    WHERE NOT EXISTS (
      SELECT 1 FROM catalog_reindex_queue
      WHERE scope = 'product' AND master_product_id = NEW.id AND processed_at IS NULL
    );
    RETURN NULL;
  END IF;

  -- updated_at advances here too (decision 0014), matching the value-change
  -- trigger. Consistency matters because updated_at is the natural key for
  -- incremental search-index sync.
  UPDATE master_product
     SET attributes_flat = build_attributes_flat(NEW.id),
         identity_hash   = build_identity_hash(NEW.id),
         updated_at      = NOW()
   WHERE id = NEW.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_master_product_refresh_flat_on_move
  AFTER UPDATE OF category_id ON master_product
  FOR EACH ROW EXECUTE FUNCTION refresh_attributes_flat_on_move();


-- Invalidation source 3: an ATTRIBUTE row changed — the easy one to forget.
-- Editing an attribute on `Tiles` invalidates every product beneath it, which
-- can be tens of thousands of rows. That must NOT happen inline inside the
-- admin's transaction, so it is enqueued and drained by a background job.
CREATE TABLE catalog_reindex_queue (
  id                BIGSERIAL PRIMARY KEY,
  scope             TEXT NOT NULL CHECK (scope IN ('all', 'category_subtree', 'product')),
  category_id       UUID REFERENCES category(id)       ON DELETE CASCADE,
  master_product_id UUID REFERENCES master_product(id) ON DELETE CASCADE,
  reason            TEXT        NOT NULL,
  enqueued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,

  CONSTRAINT reindex_scope_target CHECK (
    (scope = 'all'              AND category_id IS NULL AND master_product_id IS NULL) OR
    (scope = 'category_subtree' AND category_id IS NOT NULL) OR
    (scope = 'product'          AND master_product_id IS NOT NULL)
  )
);

CREATE INDEX idx_reindex_pending ON catalog_reindex_queue (enqueued_at)
  WHERE processed_at IS NULL;


CREATE OR REPLACE FUNCTION enqueue_attribute_reindex()
RETURNS TRIGGER AS $$
DECLARE
  v_category UUID := COALESCE(NEW.category_id, OLD.category_id);
BEGIN
  IF v_category IS NULL THEN
    -- A GLOBAL attribute changed: every product in every category is affected.
    INSERT INTO catalog_reindex_queue (scope, reason)
    VALUES ('all', TG_OP || ' on global attribute');
  ELSE
    INSERT INTO catalog_reindex_queue (scope, category_id, reason)
    VALUES ('category_subtree', v_category, TG_OP || ' on attribute');
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attribute_enqueue_reindex
  AFTER INSERT OR UPDATE OR DELETE ON attribute
  FOR EACH ROW EXECUTE FUNCTION enqueue_attribute_reindex();


-- Drain helpers, called by the background job.
CREATE OR REPLACE FUNCTION rebuild_attributes_flat_for_category(p_category_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id FROM category WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM category c JOIN subtree s ON c.parent_id = s.id
  )
  UPDATE master_product mp
     SET attributes_flat = build_attributes_flat(mp.id)
   WHERE mp.category_id IN (SELECT id FROM subtree);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rebuild_attributes_flat_all()
RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE master_product SET attributes_flat = build_attributes_flat(id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 9c. Price resolution — the ONE place unit price is computed (decision 0015)
-- -----------------------------------------------------------------------------
-- Price display, the cart, order lines and cached_best_price recomputation must
-- all resolve price identically. Reimplementing the COALESCE at each call site
-- is how the cart and the product page end up disagreeing.
--
--   p_colour_family NULL  → the untinted floor price, i.e. what search shows
--                           as "from ₹X"
--   RETURNS NULL          → this vendor does not offer that colour family
--
CREATE OR REPLACE FUNCTION resolve_unit_price(
  p_vendor_listing_id UUID,
  p_colour_family     paint_colour_family DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_price     NUMERIC;
  v_sale_type sale_unit_type;
BEGIN
  SELECT vl.price, mp.sale_unit_type
    INTO v_price, v_sale_type
  FROM vendor_listing vl
  JOIN master_product mp ON mp.id = vl.master_product_id
  WHERE vl.id = p_vendor_listing_id;

  IF v_price IS NULL THEN
    RETURN NULL;                      -- listing does not exist
  END IF;

  -- Anything not tinted to order, or asked for without a colour, prices flat.
  IF v_sale_type <> 'tinted_to_order' OR p_colour_family IS NULL THEN
    RETURN v_price;
  END IF;

  -- Absolute price for the colour. No row = the vendor does not offer it.
  RETURN (
    SELECT vlcp.price
    FROM vendor_listing_colour_price vlcp
    WHERE vlcp.vendor_listing_id = p_vendor_listing_id
      AND vlcp.colour_family = p_colour_family
  );
END;
$$ LANGUAGE plpgsql STABLE;


-- -----------------------------------------------------------------------------
-- The drainer. Idempotent, safe to call concurrently, and collapses redundant
-- work. Call it on a schedule (NestJS task, pg_cron, or external worker) and
-- after any suppressed bulk write:
--
--   SELECT drain_catalog_reindex_queue();
--
-- Returns the number of product rows rebuilt, or -1 if another drain holds the
-- lock. Never raises on contention.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION drain_catalog_reindex_queue()
RETURNS INTEGER AS $$
DECLARE
  v_lock_key BIGINT := hashtext('catalog_reindex_queue');
  -- Anything enqueued mid-drain stays pending for the next run rather than
  -- being marked processed without having been rebuilt.
  v_cutoff   TIMESTAMPTZ := NOW();
  v_total    INTEGER := 0;
  v_rows     INTEGER;
  r          RECORD;
BEGIN
  IF NOT pg_try_advisory_lock(v_lock_key) THEN
    RETURN -1;
  END IF;

  -- 1. A global rebuild supersedes every other pending entry.
  IF EXISTS (
    SELECT 1 FROM catalog_reindex_queue
    WHERE processed_at IS NULL AND scope = 'all' AND enqueued_at <= v_cutoff
  ) THEN
    v_total := rebuild_attributes_flat_all();

    UPDATE catalog_reindex_queue SET processed_at = NOW()
     WHERE processed_at IS NULL AND enqueued_at <= v_cutoff;

    PERFORM pg_advisory_unlock(v_lock_key);
    RETURN v_total;
  END IF;

  -- 2. Category subtrees, collapsed: skip any subtree whose ancestor is also
  --    pending, since rebuilding the ancestor already covers it. This is what
  --    the denormalized category.path column buys us.
  FOR r IN
    SELECT DISTINCT c.id
    FROM catalog_reindex_queue q
    JOIN category c ON c.id = q.category_id
    WHERE q.processed_at IS NULL
      AND q.scope = 'category_subtree'
      AND q.enqueued_at <= v_cutoff
      AND NOT EXISTS (
        SELECT 1
        FROM catalog_reindex_queue q2
        JOIN category c2 ON c2.id = q2.category_id
        WHERE q2.processed_at IS NULL
          AND q2.scope = 'category_subtree'
          AND q2.enqueued_at <= v_cutoff
          AND c.path LIKE c2.path || '/%'
      )
  LOOP
    v_total := v_total + rebuild_attributes_flat_for_category(r.id);
  END LOOP;

  -- 3. Individual products. Rebuilt unconditionally: a product already covered
  --    by step 2 is simply rebuilt twice, which is wasteful but never wrong.
  UPDATE master_product mp
     SET attributes_flat = build_attributes_flat(mp.id)
   WHERE mp.id IN (
     SELECT q.master_product_id
     FROM catalog_reindex_queue q
     WHERE q.processed_at IS NULL
       AND q.scope = 'product'
       AND q.enqueued_at <= v_cutoff
   );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  UPDATE catalog_reindex_queue SET processed_at = NOW()
   WHERE processed_at IS NULL AND enqueued_at <= v_cutoff;

  PERFORM pg_advisory_unlock(v_lock_key);
  RETURN v_total;
END;
$$ LANGUAGE plpgsql;


-- Processed rows are kept as an audit trail; purge them periodically.
CREATE OR REPLACE FUNCTION purge_catalog_reindex_queue(p_older_than INTERVAL DEFAULT '7 days')
RETURNS INTEGER AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  DELETE FROM catalog_reindex_queue
   WHERE processed_at IS NOT NULL
     AND processed_at < NOW() - p_older_than;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$ LANGUAGE plpgsql;


-- Staleness monitor — should return 0 rows in a healthy system. Alert if the
-- oldest pending entry is more than a few minutes old.
CREATE OR REPLACE VIEW catalog_reindex_backlog AS
  SELECT scope,
         COUNT(*)          AS pending,
         MIN(enqueued_at)  AS oldest_enqueued_at,
         NOW() - MIN(enqueued_at) AS oldest_age
  FROM catalog_reindex_queue
  WHERE processed_at IS NULL
  GROUP BY scope;


-- =============================================================================
-- 10. NOT IN THIS FILE
-- =============================================================================
-- order_item lives in the ordering domain, which does not exist yet. When built
-- it needs a `configuration JSONB` column carrying made-to-order input, plus a
-- snapshot of unit_price:
--
--   discrete         → NULL
--   cut_to_length    → { "length_m": 12.5 }
--   tinted_to_order  → { "colour_family": "beige",
--                        "reference_hex": "#E8D9B5",   -- optional, visual only
--                        "note": "matching my curtains" }
--
-- colour_family is the priced axis and the only field that must be present.
-- reference_hex is a visual hint, NOT an orderable identifier — a tinting
-- machine dispenses from a shade code, never from an RGB value. The vendor
-- finalises the exact shade with the customer at the counter (decision 0014).
