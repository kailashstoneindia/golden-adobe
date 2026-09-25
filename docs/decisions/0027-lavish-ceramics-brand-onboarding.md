# 0027 — Onboarding Lavish Ceramics: brand + catalog seeding strategy

- **Date:** 2026-09-25
- **Status:** Accepted
- **Relates to:** [0011](0011-product-code-and-vendor-export.md) (product codes, vendor
  export, match ladder), [0012](0012-product-identity-and-deduplication.md) (brand+MPN
  dedup), [0013](0013-identity-hash-for-unbranded-products.md) (identity hash),
  [0026](0026-pearl-precision-brand-onboarding.md) (Pearl Precision — same onboarding path,
  first brand run through it, source of most of the process lessons applied here)

## Context

Lavish Ceramics (`lavishceramics.com`) — a tile manufacturer/exporter — is the second real
brand being run through the onboarding path. Unlike Pearl Precision (bathware/plumbing,
flat SKU-per-product catalog), Lavish sells **tiles**, a category that already exists in
Golden Abode's taxonomy (`tiles` top-level, 4 leaves: Floor, Wall, Outdoor & Parking,
Elevation — see `apps/backend/database/seed-data/taxonomy.js`), and its catalog is organized
as **design families** (a "series" like Pulpis or Helen, sold across multiple sizes and
colourways) rather than Pearl's flat part-number list.

## What was scanned

- **Website** (`lavishceramics.com`) — WooCommerce-style catalog. Nav groups products into
  PolyCeramic-style lines: Glazed Porcelain (Matt/Carvin/Sugar/GT/R10B finish families),
  Wooden, Outdoor, Architectural Surfaces, Fullbody, Double Charge, Soluble Salt, Ceramic
  Subway, Ceramic Wall. Floor-tiles listing alone reports **604 products** across 31 pages;
  wall tiles list each colourway as its own page (e.g. `/products/subway-black/`). Total
  site-wide product-page count is in the high hundreds — far more granular than Pearl's ~300
  total SKUs, because each design × size × colour combination gets its own page.
- **23 catalogue PDFs** (`/download-brochure-and-tiles-catalogue-pdf/`), one per product
  line: GVT (Matt Porcelain, 95pp), PGVT (Polished Porcelain, 83pp), Wooden 20×120 (109pp),
  2CM Outdoor (70pp), Architectural Surfaces 30×120 (90pp), Moroccan 60×60 (107pp), Terrazzo
  60×120, Endless PGVT 60×120, Decor 60×120, Grit-Tech (88pp), Large Format "Evocative"
  GVT/PGVT, Curved 3D Slab 120×180, Polished Slab 120×180, Fullbody Master, Soluble Salt
  Nano, 7× Subway wall-tile brochures (Plain, Milagro, Lance, Captiva, 100×200 Bevelled,
  80×80, 75×300 Bevelled — one per colourway range, ~13pp each), Glossy Matt Ceramic Wall.
  All 23 downloaded successfully (HTTP 200 verified); total download size ~2GB+ — these are
  full-bleed photographic brochures, not compact spec sheets like Pearl's PDFs were.
- **Technical Specification page** (`/technical-specification/`) — shared ISO-13006/EN14411
  compliance data (dimensional tolerance, water absorption, MOR, breaking strength, PEI,
  Mohs hardness) that also appears restated per-PDF on each brochure's closing pages.

### Process correction made during this scan

Pearl's PDFs were small (16-84pp), image-scanned spec sheets — rasterizing every page was
the right call there. Lavish's PDFs are 10-20x larger (70-110pp brochures, 47-220MB each)
and are mostly full-bleed lifestyle photography, not spec tables. Rasterizing all ~1,600
pages across 23 files would have been slow and mostly wasted. Checked a sample first
(GVT catalog) and confirmed the real pattern: **most PDFs carry a consolidated series/size
index table on their closing 2-3 pages** (e.g. GVT page 94: every series name grouped by
finish collection — Matt, Matt+Structure, Carvin, Carvin+Structure, GT & GT w/ Structure,
R10B, Sugar — each row showing which of 8 sizes it's available in) plus a packing-details
table (pieces/box, sqm/box, sqft/box, kg/box by size) and the ISO compliance table on the
final page. This is far more efficient than crawling hundreds of individual website product
pages, and was confirmed against the user's own instruction to check the PDFs' last-page
tables rather than brute-force the site.

**Not every PDF has this pattern** — checked Grit-Tech (88pp) and found no consolidated
index; it appears to be one full-page spread per design (e.g. "Wallnut, 600×1200") with no
summary table, closer in shape to Pearl's per-product pages. The 7 Subway brochures are
short (13pp) with one colourway per spread and a single-size spec table on the second-to-last
page, no multi-colour index. **Per-PDF extraction strategy has to be checked per file, not
assumed uniform** — this is the key operational lesson carried into the batch plan below.

## What the codebase already provides for this vendor

| Piece | Status |
|---|---|
| `tiles` top-level category | **Already exists**, 4 leaves, 12 category-level attributes (`tile_material`, `tile_size`, `tile_finish`, `tile_colour_family`, `tile_thickness`, `tile_pattern`, `pei_rating`, `anti_skid`, `shade_variation`, `tiles_per_box`, `coverage_per_box`, `water_absorption`) — built generically enough that this is likely a **data-only** onboarding, same class of change as Pearl's Kitchen-category addition, not a new top-level category. |
| `POST /admin/catalog-import/:categoryId` (+ template GET) | **Built** (confirmed in 0026), reusable as-is. |
| Brand creation | **Not built** (confirmed in 0026) — same Stage 1/Stage 2 sequencing blocker applies: brand row needs 4 compliance columns (manufacturer_name, manufacturer_address, consumer_care_email, consumer_care_phone) not present anywhere in scraped material. |
| Image upload | **Not built** (confirmed in 0026) — same deferred status. |

## Taxonomy gap check (against real PDF/site data, not nav-menu guesses)

| Real value found | Existing enum coverage | Gap? |
|---|---|---|
| Tile material: Glazed Porcelain, Fullbody, Double Charge, Soluble Salt, Wooden(-look) | `tile_material`: Vitrified (GVT), Vitrified (PGVT), Ceramic, Porcelain, Mosaic, Cement/Terrazzo | **"Fullbody" and "Double Charge" are real vitrified-tile manufacturing sub-types with no enum value; "Soluble Salt" (a polishing/printing process) also missing.** |
| Finish: Matt, Matt with Structure, Carvin, Carvin with Structure, GT (Grit-Tech) & GT with Structure, R10B, Sugar, Polished | `tile_finish`: Glossy, Matte, Satin, Rustic, Carving, Polished, Sugar, Lappato | **"Matt with Structure", "Carvin with Structure", "GT/Grit-Tech", "R10B" missing.** ("Carving" vs PDF's "Carvin" spelling noted — likely same finish, naming to reconcile.) |
| Size: up to 120×180cm | `tile_size` enum tops out at 1200×1800mm | **Already covered** — 120×180cm = 1200×1800mm, confirmed match, not a gap. |
| Colour: subway lines show Black, Cool Grey, Mango Yellow, Dark Grey, Light Grey, Orange, Blood Red, Aqua Green, Pacific Blue, Aqua Blue, Yellow, Red Brown, Oasis Green, Copper Brown, Alpine Blue, Pink, Ivory, T-Blue, Grey, White (20 named colours) | `tile_colour_family`: White, Beige, Grey, Brown, Black, Blue, Wood, Multi | Colour **family** buckets are broad enough to absorb all 20 (e.g. Mango Yellow → no "Yellow" family exists either) — **"Yellow", "Orange", "Red", "Green", "Pink" families are missing**; a subway-specific `subway_colour_name` attribute (for the literal marketing colour name, same pattern as Pearl's `cistern_colour`) may be worth adding so the specific shade isn't lost the way Pearl's seat-cover colours weren't. |
| Large-format slab (Curved 3D, Polished Slab, 1200×1800mm) | No `slab_type` or similar attribute exists on any tile leaf | **Possible gap** — "Curved 3D" is a physical surface texture distinct from `tile_finish`'s flat vocabulary; not yet confirmed as a hard blocker until the PDF's own attribute table is read. |
| Application areas (Bedroom, Bathroom, Living Room, Kitchen, Commercial, Outdoor) | `floor_application_area` / `wall_application_area` leaf attributes already cover this closely | Likely **no gap** — needs final confirmation against real per-line usage. |

This table is a **first-pass gap list from the index/spec pages read so far** (GVT, Subway
Plain, Grit-Tech), not an exhaustive read of all 23 PDFs. Matches the same "don't claim more
coverage than was actually checked" discipline 0026 settled on after its citation-error
correction. Remaining PDFs to check before the gap list is final: PGVT, Wooden, Outdoor 2CM,
Architectural Surfaces, Moroccan, Terrazzo, Endless, Decor, Large Format Evocative, Curve 3D
Slab, Polished Slab, Fullbody, Soluble Salt, and the other 6 Subway colourway brochures.

## Status

Discovery in progress. No taxonomy edits or product batches committed yet — this record will
be extended with the completed gap analysis, the taxonomy fix (if approved as bounded, same
process as 0026's Kitchen-category addition), and per-line batch results as they're done.
