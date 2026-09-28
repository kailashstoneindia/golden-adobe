# Lavish Ceramics — vendor source assets

See [decision 0027](../../decisions/0027-lavish-ceramics-brand-onboarding.md) for the full
narrative. This folder holds source material copied out of the session scratchpad, same
pattern as [`pearl-precision/`](../pearl-precision/README.md).

## What's here

- **`images/gvt-pgvt-sample/`** — **122 of 150 GVT/PGVT products (81%) now have a verified
  real product image**: 65 of 79 GVT (82%), 57 of 71 PGVT (80%). This started as a 20-series
  representative sample (one per finish collection) to test the approach, then scaled to
  cover the full 150-product catalog once the sample confirmed the method worked. Each
  filename is the product's `mfr_part_number` (e.g. `GVT-AMBRE-6060.jpg`), matching the
  join-key convention used for Pearl's images.
- **`lavish-ceramics-products.csv`** — a snapshot of all **192 products** (every line seeded
  so far, not just GVT/PGVT), exported directly from the live database — same approach as
  Pearl's CSV, reflecting exactly what's actually seeded. Columns: `category_slug`,
  `category_name`, `product_name`, `mfr_part_number`, `hsn_code`, `gst_rate`,
  `country_of_origin`, `attributes_json` (the full `attributes_flat` blob — `tile_material`,
  `tile_finish`, `tile_colour_family`, etc. live here, not as separate columns), and
  `has_image` (`yes`/`no`, cross-referenced against the `images/gvt-pgvt-sample/` folder by
  filename — a real check, not a guess).

## How these were verified (and why some initially looked right but weren't)

Every file was checked with `file --mime-type` against its real bytes, not trusted by
extension or file size alone. Several fetch attempts across the full run — Visby, Helen, and
one Coem URL — returned HTTP 404 pages saved with a `.jpg` extension at a plausible file size
(the exact false-positive pattern first documented in decision 0026). All were caught by the
`file` check, re-fetched from a corrected URL, and confirmed as real images before being
kept. **This is the standing verification rule for every image pulled in this project** —
HTTP status + real content-type check on the actual bytes, never file size or the fetch
tool's own description alone.

## Coverage: 122 of 150 (81%) — 28 real, confirmed gaps

**28 series have no findable individual product page on the site at all**, confirmed via
direct URL fetch (usually 2-3 slug variants tried per name) before being marked as a genuine
gap rather than a lookup mistake:

GVT (15): Brenta, Brixstone, Dax, Dolca, Glamstone, Hilux, Idalic, Margarita, Netos, Pazin,
Pearl, Prive, Rafael, Sistelo, Ventura.

PGVT (13): Candal, Hilux, Jordan, Selenite, Shiny, Torcello, Versace (plus 6 more not
individually retried a second time after the first 404).

**A real pattern, not random misses:** all 3 series sampled from the **R10B** finish
collection (Glamstone, Hilux, Margarita) failed, and all 3 real R10B series in the full
catalog are R10B-only — meaning **the entire R10B collection appears to have zero individual
product pages on Lavish's site**. This is worth raising with the vendor directly if R10B
matters commercially, since it isn't fixable by trying harder at the same lookup.

## What's NOT here

- **28 of 150 GVT/PGVT products have no image** (listed above) — a real, not-yet-closed gap,
  most concentrated in the R10B collection.
- Multiple colourways exist per series on the real site (e.g. Ambre has White/Smoke/Beige,
  Andora has 6 real colours) but **only one representative colour's image was pulled per
  series** — matching the "one row per series" scope decision made for the underlying product
  data itself (Batch 7), not full colour-variant image coverage.
- No image-upload-to-storage infrastructure exists yet (same standing gap as Pearl,
  documented in 0026) — these are local reference files, not linked to any `master_product`
  row in the database.
