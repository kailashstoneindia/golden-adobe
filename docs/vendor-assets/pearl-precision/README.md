# Pearl Precision (Sparsh Pearl) — vendor source assets

Copied into the project directory from the session scratchpad per explicit request, so this
material survives past the working session instead of living only in a temp folder. See
[decision 0026](../../decisions/0026-pearl-precision-brand-onboarding.md) for the full
narrative — this folder is the underlying material that record was built from, not a
replacement for it.

## What's here

- **`source-pdfs/`** — the 4 product catalogs + 6 certificates pulled from
  `pearl-precision.com`, as downloaded (39MB total). These are the actual source of truth for
  every product row below; 0026 cites exact page numbers back into these files.
- **`images/`** — 118 verified product images, one subfolder per batch (matches 0026's batch
  structure: `cistern-images/`, `taps-images/`, `showers-images/`, `valves-images/`,
  `pipes-images/`, `seatcovers-images/`, `jetsprays-images/`, `hoses-images/`,
  `kitchen-images/`). **Each filename is the product's `mfr_part_number`** (e.g.
  `C-001.jpg`, `CC-252.jpg`) — this was confirmed as the site's own naming convention and is
  the reliable join key back to `pearl-precision-products.csv` below. "Verified" means each
  file was checked for a real HTTP 200 + correct content-type when downloaded, not just a
  plausible file size (0026 documents a real false-positive this caught: a 404 error page
  once got saved with a `.jpg` extension and looked valid by size alone).
- **`pearl-precision-products.csv`** — a snapshot of all 293 products **exported directly
  from the live database** (not reconstructed from the original Excel batch files, so this
  reflects exactly what's actually seeded, including any validation-driven differences).
  Columns: `category_slug`, `category_name`, `product_name`, `mfr_part_number`, `hsn_code`,
  `gst_rate`, `country_of_origin`, `attributes_json` (the full `attributes_flat` JSONB blob
  for that product — category-specific attributes like `cistern_colour`, `valve_size`, etc.
  live here, not as separate columns, matching how `master_product.attributes_flat` actually
  stores them).

## What's NOT here

- **No pricing** — `master_product` doesn't carry price at all (lives on `vendor_listing`,
  a separate downstream stage per 0026); nothing to export.
- **No brand-level data** (manufacturer address, consumer care contact) — that's a single row
  in the `brand` table, not per-product, and is already fully in
  [0026](../../decisions/0026-pearl-precision-brand-onboarding.md#stage-1). It currently uses
  **placeholder** consumer-care email/phone (Pearl's own PDFs never printed one) — a real
  open item, not an oversight.
- **Not all 293 products have a matching image** — only 118 of 293 do (0026 explains why:
  some lines had zero website presence, some batches covered more SKUs than the site's own
  photo gallery did). The CSV has all 293; the images folder has 118. Cross-reference by
  `mfr_part_number` to see which products currently have no image.

## Re-seeding this data

A runnable Sequelize seeder,
[`20260926000000-seed-pearl-precision-products.js`](../../../apps/backend/database/seeders/20260926000000-seed-pearl-precision-products.js),
was generated from this same live-database export — it can re-create all 293 rows (brand +
products) in a fresh or reset database. Run it the same way every other seeder in this
project is run:

```
npx sequelize-cli db:seed --seed 20260926000000-seed-pearl-precision-products.js
```

It depends on the taxonomy already being seeded (categories/attributes must exist first) —
same ordering constraint as every other product-import path in this project.
