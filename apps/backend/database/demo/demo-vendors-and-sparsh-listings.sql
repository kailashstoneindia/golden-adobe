-- DEMO DATA ONLY. Not a seeder: db:seed:all never runs this; apply by hand (see docs/decisions/0031).
--
-- WHY: Sparsh Pearl has 143 live products but no vendor_listing, so search can't show them
-- (a search document needs a live product + an active listing from a vendor in an active city).
-- This adds the third demo vendor and gives Sparsh products sellers.
--
-- ALL PRICES AND STOCK BELOW ARE INVENTED. Sparsh's real price list is not in this repo
-- (docs/vendor-assets/pearl-precision/README.md: "No pricing"). Do not present them as real.
--
-- Idempotent: safe to run twice. Run against golden_abode only:
--   docker exec -i golden-abode-postgres psql -U postgres -d golden_abode -v ON_ERROR_STOP=1 \
--     < apps/backend/database/demo/demo-vendors-and-sparsh-listings.sql
--
-- Vendors after this runs (all Delhi, approved, active):
--   A  Lavish Tiles Gallery   +916165891784   tiles            (already existed)
--   B  Delhi Tile House       +918041129551   tiles + ~25% of Sparsh sanitary products
--   C  Delhi Sanitary Mart    +917777777777   every live Sparsh product (re-uses the seed vendor user)
-- Demo login OTP is 123456 while USE_MSG91_SMS is not 'true'.

BEGIN;

DO $$
DECLARE
  delhi uuid;
  va uuid;
  vb uuid;
  vc uuid;
  uc uuid;
  n_c int;
  n_b int;
BEGIN
  SELECT id INTO delhi FROM city WHERE name = 'Delhi';
  IF delhi IS NULL THEN RAISE EXCEPTION 'city Delhi not found - reference data missing'; END IF;

  SELECT id INTO va FROM vendors WHERE shop_name = 'Lavish Tiles Gallery';
  SELECT id INTO vb FROM vendors WHERE shop_name = 'Delhi Tile House';
  IF va IS NULL OR vb IS NULL THEN RAISE EXCEPTION 'vendors A/B not found'; END IF;

  -- Vendor C: re-use the seed VENDOR user (+917777777777), which has no shop yet.
  SELECT id INTO uc FROM users WHERE phone = '+917777777777' AND role = 'VENDOR';
  IF uc IS NULL THEN RAISE EXCEPTION 'seed vendor user +917777777777 not found'; END IF;

  UPDATE users
     SET name = 'Delhi Sanitary Mart Owner', is_approved = true, is_active = true,
         onboarding_completed = true, onboarding_stage = 'COMPLETED',
         onboarding_completed_at = COALESCE(onboarding_completed_at, now()), updated_at = now()
   WHERE id = uc;

  INSERT INTO vendors (id, user_id, shop_name, address, latitude, longitude, city_id, city_source, created_at, updated_at)
  SELECT gen_random_uuid(), uc, 'Delhi Sanitary Mart', '8 Karol Bagh Market, New Delhi 110005',
         28.6519, 77.1909, delhi, 'gps', now(), now()
   WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE user_id = uc);
  SELECT id INTO vc FROM vendors WHERE user_id = uc;

  -- Categories each vendor sells (drives the pre-filled export). Leaf categories only.
  INSERT INTO vendor_category (vendor_id, category_id)
  SELECT va, id FROM category WHERE slug = 'floor-tiles'
  ON CONFLICT DO NOTHING;
  INSERT INTO vendor_category (vendor_id, category_id)
  SELECT vb, id FROM category
   WHERE slug IN ('floor-tiles', 'wash-basins', 'taps-faucets', 'showers', 'sinks')
  ON CONFLICT DO NOTHING;
  INSERT INTO vendor_category (vendor_id, category_id)
  SELECT vc, cat.id FROM category cat
   WHERE cat.id IN (
     SELECT mp.category_id FROM master_product mp JOIN brand b ON b.id = mp.brand_id
      WHERE b.name = 'Sparsh Pearl' AND mp.status = 'live')
  ON CONFLICT DO NOTHING;

  -- Listings. base = invented INR price per category, +/-10% spread by a hash of the part number.
  CREATE TEMP TABLE _sparsh ON COMMIT DROP AS
  SELECT mp.id AS product_id,
         COALESCE(mp.mfr_part_number, left(mp.id::text, 8)) AS code,
         cat.slug,
         round(
           CASE cat.slug
             WHEN 'wash-basins' THEN 1800  WHEN 'pipe-fittings' THEN 60   WHEN 'pipes' THEN 240
             WHEN 'seat-covers' THEN 650   WHEN 'cisterns' THEN 1900      WHEN 'hoses-couplings' THEN 220
             WHEN 'showers' THEN 950       WHEN 'taps-faucets' THEN 780   WHEN 'sinks' THEN 2400
             WHEN 'water-closets' THEN 4200 WHEN 'floor-gratings' THEN 190 WHEN 'cabinets' THEN 2300
             WHEN 'jet-sprays' THEN 480    WHEN 'valves' THEN 420         WHEN 'pest-odour-control' THEN 150
             WHEN 'urinals' THEN 1500      ELSE 500
           END * (1 + ((abs(hashtext(COALESCE(mp.mfr_part_number, mp.id::text))) % 21) - 10) / 100.0)
         ) AS base
    FROM master_product mp
    JOIN brand b ON b.id = mp.brand_id
    JOIN category cat ON cat.id = mp.category_id
   WHERE b.name = 'Sparsh Pearl' AND mp.status = 'live';

  -- C lists every live Sparsh product.
  INSERT INTO vendor_listing (id, vendor_id, master_product_id, vendor_sku, price, mrp,
                              min_order_qty, supports_tinting, status, created_at, updated_at, match_candidates)
  SELECT gen_random_uuid(), vc, s.product_id, 'DSM-' || s.code, s.base,
         ceil(s.base * 1.2 / 5) * 5, 1, false, 'active', now(), now(), '[]'::jsonb
    FROM _sparsh s
   WHERE NOT EXISTS (SELECT 1 FROM vendor_listing vl WHERE vl.vendor_id = vc AND vl.master_product_id = s.product_id);

  -- B lists ~25% of the sanitary products at a slightly different price (so "other sellers" shows two).
  INSERT INTO vendor_listing (id, vendor_id, master_product_id, vendor_sku, price, mrp,
                              min_order_qty, supports_tinting, status, created_at, updated_at, match_candidates)
  SELECT gen_random_uuid(), vb, s.product_id, 'DTH-' || s.code,
         round(s.base * (0.92 + (abs(hashtext('b' || s.code)) % 17) / 100.0)),
         ceil(s.base * 1.2 / 5) * 5, 1, false, 'active', now(), now(), '[]'::jsonb
    FROM _sparsh s
   WHERE s.slug IN ('wash-basins', 'taps-faucets', 'showers', 'sinks')
     AND abs(hashtext(s.code)) % 4 = 0
     AND NOT EXISTS (SELECT 1 FROM vendor_listing vl WHERE vl.vendor_id = vb AND vl.master_product_id = s.product_id);

  -- Stock for every new listing (no warehouse: same as the existing 108 rows).
  INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
  SELECT gen_random_uuid(), vl.id, NULL, 20 + abs(hashtext(vl.vendor_sku)) % 180, 0, now(), now()
    FROM vendor_listing vl
   WHERE (vl.vendor_sku LIKE 'DSM-%' OR vl.vendor_sku LIKE 'DTH-%')
     AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.vendor_listing_id = vl.id);

  SELECT count(*) INTO n_c FROM vendor_listing WHERE vendor_id = vc;
  SELECT count(*) INTO n_b FROM vendor_listing WHERE vendor_id = vb AND vendor_sku LIKE 'DTH-%';
  RAISE NOTICE 'Delhi Sanitary Mart listings: %, Delhi Tile House Sparsh listings: %', n_c, n_b;
END $$;

COMMIT;
