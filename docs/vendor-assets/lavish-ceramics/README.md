# Lavish Ceramics — vendor source assets

See [decision 0027](../../decisions/0027-lavish-ceramics-brand-onboarding.md) for the full
narrative. This folder holds source material copied out of the session scratchpad, same
pattern as [`pearl-precision/`](../pearl-precision/README.md).

## What's here

- **`images/gvt-pgvt-sample/`** — a **representative sample**, not full coverage: 20 real
  product images, one per series, for 20 of the 27 GVT/PGVT series sampled after the depth
  expansion (Batch 7). Each filename is the product's `mfr_part_number` (e.g.
  `GVT-AMBRE-6060.jpg`), matching the join-key convention used for Pearl's images.

## How these were verified (and why 2 initially looked right but weren't)

Every file was checked with `file --mime-type` against its real bytes, not trusted by
extension or file size alone. Two of the first 20 URLs tried — Visby and Helen — returned
HTTP 404 pages that were ~200KB and saved with a `.jpg` extension, the exact false-positive
pattern documented in decision 0026 (a 404 error page can look like a plausible file by size
alone). Both were caught by the `file` check, re-fetched from a corrected URL, and confirmed
as real JPEGs before being kept. **This is the standing verification rule for every image
pulled in this project** — HTTP status + real content-type check, not file size.

## Coverage: 20 of 27 sampled series (74%), not all 150

This was an explicit **representative sample**, not a full pass across all 150 GVT/PGVT
products — approved as the first step before deciding whether to scale further. Sample
selection: 3 series per finish collection, covering all 9 real finish collections (Matte,
Matt with Structure, Grit-Tech, Carvin with Structure, R10B, Carving, Sugar, Polished,
Highgloss).

**5 of the 27 sampled series had no findable individual product page on the site at all**
(confirmed via direct fetch + a follow-up search, not just one failed guess): Brixstone,
Sistelo, Glamstone, Hilux, Margarita. Notably, all 3 of the sampled **R10B** collection series
(Glamstone, Hilux, Margarita) failed — this may mean the R10B line specifically lacks
individual product pages on the site, not just bad luck on 3 random names; worth checking
before assuming the pattern holds for the other 2 R10B series not sampled.

## What's NOT here

- **130 of the 150 GVT/PGVT products have no image yet** — this sample covers roughly a
  seventh of the category. Scaling to full coverage would mean repeating this same per-series
  website-fetch process for the remaining ~123 series not yet attempted.
- Multiple colourways exist per series on the real site (e.g. Ambre has White/Smoke/Beige,
  Andora has 6 real colours) but **only one representative colour's image was pulled per
  series** in this sample — matching the "one row per series" scope decision made for the
  underlying product data itself (Batch 7), not full colour-variant image coverage.
- No image-upload-to-storage infrastructure exists yet (same standing gap as Pearl,
  documented in 0026) — these are local reference files, not linked to any `master_product`
  row in the database.
