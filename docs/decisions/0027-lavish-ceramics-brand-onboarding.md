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

### Strategy correction: PDFs vs. website, checked per line

Initial plan (approved) was to read all 23 PDFs like Pearl's 4. After sampling confirmed these
brochures are 10-20x larger than Pearl's and inconsistently structured (some have a
consolidated series/size index on their closing pages — GVT, PGVT; others like Grit-Tech and
the Subway line don't), the user redirected: pull the PDF index/packing tables where they
exist, and use the website's per-line and per-design pages (already proven fast and accurate
against the Pulpis cross-check) for everything else. Final source used per line:

| Line | Source used | Why |
|---|---|---|
| GVT (Matt Porcelain) | PDF index (pg 94) + packing table (pg 95) | 85 series across 7 finish collections (Matt, Matt+Structure, Carvin, Carvin+Structure, GT & GT+Structure, R10B, Sugar), full size matrix |
| PGVT (Polished Porcelain) | PDF index (pg 81-82) + packing table (pg 83) | 73 series across Polished + Highgloss collections |
| Outdoor 2CM | PDF spec page (pg 69) + website | 20mm thickness, R9-R13 slip rating confirmed; 6 representative designs (Ariel, Bstone/Burge/Magna/Arena/Orion "2.0") from site |
| Wooden 20×120 | PDF single-design spread (pg 108) + website | Confirms real named colourways (Glenwood: White/Mist/Grey/Verde/**Aqua**); 6 representative designs from site |
| Architectural Surfaces | Website | 6 designs (Fero, Oxydart, Cava, Oryol, Assen Wood, Romney), all 30×120cm, "3-D pieces" texture |
| Moroccan | Website | 6 designs, 60×60cm, geometric/Moroccan pattern |
| Terrazzo | Website | 6 designs, sizes 30×60 to 80×160cm |
| Grit-Tech | Website (site filter, `filter_finish=grit-tech`) | 7 designs (Ambient, Geneva, Mek, Neo, Tesela, Tiffany, Timber Ambient), 60×120/80×160cm |
| Fullbody | Website | **15mm thickness confirmed** (vs 3-4mm standard) — real gap, see below |
| Double Charge | Website | 6 designs, 60×60/60×120cm |
| Soluble Salt | Website | 6 designs (ART 03/06/14/15/26/28), 60×60cm, screen-print/nanocoating process |
| Endless | Website | 6 designs, 60×120/80×160cm |
| Subway (7 brochures) | PDF (Plain: 13pp, per-colourway spreads + spec page) | 20 named colours confirmed from site; 4 of the 7 PDF files (Captiva, Milagro, 80×80, 100×200-Bevelled) **failed to download intact — see below** |
| Decor, Large Format Evocative, Curve 3D Slab, Polished Slab, Glossy Matt Wall | Not yet read | Lower priority — no site product-family page found for these; deferred, flagged not silently dropped |

### Real, confirmed taxonomy gaps (not guesses — each tied to a specific source above)

| Attribute | Existing enum | Missing values found | Evidence |
|---|---|---|---|
| `tile_material` | Vitrified (GVT), Vitrified (PGVT), Ceramic, Porcelain, Mosaic, Cement/Terrazzo | **Fullbody, Double Charge, Soluble Salt** | Real manufacturing sub-types, each with its own dedicated PDF/site collection |
| `tile_finish` | Glossy, Matte, Satin, Rustic, Carving, Polished, Sugar, Lappato | **Matt with Structure, Carvin with Structure, GT/Grit-Tech, R10B, Highgloss** | GVT pg 94 + PGVT pg 82 collection headers, verbatim |
| `tile_thickness` | 6, 8, 9, 10, 12 (mm) | **15mm (Fullbody), 20mm (Outdoor 2CM)** | Fullbody website page ("15mm... vs 3 to 4mm standard"); Outdoor PDF pg 69 header "20MM Thick Outdoor Tiles" |
| `tile_colour_family` | White, Beige, Grey, Brown, Black, Blue, Wood, Multi | **Yellow, Orange, Red, Green, Pink** (from 20 named subway colours: Mango Yellow, Orange, Blood Red, Aqua/Oasis Green, Pink, etc.) and **Aqua** doesn't cleanly fit Blue/Multi either | Subway colour list (site) + Glenwood wooden-tile colourway (PDF pg 108) |
| `tile_size` | up to 1200×1800mm | none — **already covers** 120×180cm | Confirmed match, not a gap |
| Subway-specific colour name | none | Same gap pattern as Pearl's `cistern_colour` — `tile_colour_family` buckets lose the literal marketing name (e.g. "Mango Yellow" vs just "Yellow") | Same reasoning 0026 used for seat-cover colours |

This list is now cross-validated against real PDF index/spec pages and matching website data
for every major line except Decor, Large Format Evocative, Curve 3D Slab, Polished Slab, and
Glossy Matt Wall (5 of 23 PDFs, no site product-family page found for these — flagged as
unread, not silently claimed covered).

### Real find: manufacturer legal identity (was a hard blocker for Pearl)

The Outdoor 2CM PDF's back cover (pg 70) gives the actual legal manufacturer entity, address,
and contact channels — the exact fields that blocked `brand` row creation for Pearl (Stage 1
in 0026's sequencing):

- **Legal name:** Lavish Granito Pvt. Ltd.
- **Address:** Halvad Road, At. Unchi Mandal, Dist. Morbi – 363642 (Gujarat), India
- **Cell:** +91 99099 80082 / +91 99099 87126
- **Email:** export@lavishceramics.com / inquiry@lavishceramics.com

Not yet vendor-confirmed (same "seed draft, not confirmed data" framing 0026 used throughout),
but unlike Pearl this removes the brand-creation blocker entirely if this data holds up —
worth flagging as a meaningfully better starting position than Pearl had.

### Real gap: 4 of 23 PDFs will not download intact

`subway-captiva.pdf` and `subway-milagro.pdf` download as **0 bytes**; `subway-80x80.pdf` and
`subway-100x200-bevelled.pdf` download truncated (49KB and 213KB respectively) — all four
consistently, across two separate download attempts, despite the server returning HTTP 200
each time. This is a genuine server-side gap (broken/misconfigured file links), not a
transient network failure — retrying did not change the outcome. Site pages for these
colourways were not separately found; flagged as unobtainable via this vendor's current public
materials, not silently dropped from scope.

## Taxonomy fix (applied)

Bounded design (brainstorming skill, same classification as 0026's Kitchen-category addition)
presented and approved. Applied to `apps/backend/database/seed-data/taxonomy.js`:

- `tile_material` +Fullbody, +Double Charge, +Soluble Salt
- `tile_finish` +Matt with Structure, +Carvin with Structure, +Grit-Tech, +R10B, +Highgloss
- `tile_colour_family` +Yellow, +Orange, +Red, +Green, +Pink, +Aqua
- `tile_thickness` +15, +20 (mm)
- new `tile_colour_name` (text, non-variant-defining) — literal marketing colour name,
  same reasoning as Pearl's `cistern_colour`/`seat_cover_colour`

Reseeded against the running local dev Postgres (`db:seed --seed 20260901100000-seed-taxonomy.js`
— 1 attribute, 16 enum options inserted, no errors) and **verified end-to-end, not just
seeded**: downloaded the real Floor Tiles import template from the running API afterward and
confirmed every new value appears in the template's actual data-validation lists.

## Status

Discovery pass complete for 18 of 23 PDFs (plus site data for every major product line);
taxonomy gap-fill designed, approved, applied, reseeded, and verified against the live API.
Next: per-line product batches following 0026's batch → template → upload → verify → commit
pattern. Not yet started: brand row creation (manufacturer identity found, not yet vendor-
confirmed), image sourcing/verification, and the 5 unread PDFs (Decor, Large Format Evocative,
Curve 3D Slab, Polished Slab, Glossy Matt Wall).
