# 0026 — Onboarding Pearl Precision (Sparsh Pearl): brand + catalog seeding strategy

- **Date:** 2026-09-24
- **Status:** Accepted
- **Relates to:** [0011](0011-product-code-and-vendor-export.md) (product codes, vendor
  export, match ladder), [0012](0012-product-identity-and-deduplication.md) (brand+MPN
  dedup), [0013](0013-identity-hash-for-unbranded-products.md) (identity hash),
  [0024](0024-product-images-gcs.md) (image storage — designed, not yet built)

## Context

Pearl Precision Products Pvt. Ltd. ("Sparsh Pearl") — a Noida-based manufacturer of
bathware/plumbing (PTMT faucets, CP bath fittings, sanitaryware, pipes & fittings) — is the
first real brand being run through the onboarding path this project's decision records
already designed. This record captures what was found scanning their public materials, holds
it against the existing schema and import tooling, and records the resulting plan.

**Important framing, settled after some back-and-forth in this discussion:** everything
extracted below is a **seed draft**, not vendor-confirmed data. It exists to make Stage 2
(catalog seeding) fast once Pearl answers the open questions — it does not remove the need to
ask Pearl anything. The `brand` table cannot even be created without information (consumer
care email/phone) that appears nowhere in the scraped material.

## What was scanned

- **Website** (`pearl-precision.com`) — WooCommerce B2B enquiry catalog. Category tree,
  product names, SKUs, one image per product page, company info. No cart/checkout, no prices
  anywhere on-site.
- **4 product catalog PDFs** (207 pages total, all image-only scans — no text layer):
  - PolyCeramic/PTMT faucets, Vol 4.6 (84 pp) — SKU + carton pack size, no dimensions/price
  - CP Bath Fittings, Vol 4.2 (83 pp) — **has real ₹ MRP per SKU**, but dated Nov 2022
  - Sanitary Ware (24 pp) — SKU + full dimensions (mm), no price
  - Flowshield pipes & fittings, Vol 2.2 (16 pp) — SKU + size + HSN code, no price
- **6 certificate PDFs** — ISO 9001, 2× BIS licences, NABL lab accreditation, 2× design
  patents, 1× structure patent. Licence numbers extracted and independently checkable.

Full PDF links and the local extraction (207 rendered page images, OCR'd text, and 207
page-level JPEGs pulled from the embedded image streams) are in the session scratchpad;
this record captures the findings, not the raw files.

## What the codebase already provides

Checked against the actual code, not just the schema docs:

| Piece | Status |
|---|---|
| `POST /admin/catalog-import/:categoryId` (+ template GET) | **Built.** Validates required columns, enum membership, numeric parsing, brand resolution, brand+MPN dedup, gtin dedup. Creates draft `master_product` rows. Rejected rows return as an annotated error workbook. |
| Brand creation | **Not built.** `Brand` Sequelize model exists; no `POST /admin/brand` endpoint anywhere in the codebase. Import Rule 4 deliberately *rejects* an unresolved brand name rather than auto-creating one, because brand rows carry mandatory Legal Metrology fields the import sheet has no column for. |
| Image upload | **Not built.** `master_product_media` table exists with the right shape (`url`, `type`, `display_order`, `is_primary`, `is_representative`) but nothing in the codebase writes to it. [0024](0024-product-images-gcs.md) designed the GCS-backed `StorageService` in full; zero implementation code exists, no bucket provisioned, `@google-cloud/storage` not yet a dependency. |

## Decision

### Two-stage sequencing (forced by the schema, not a preference)

```
STAGE 1: brand row                     STAGE 2: catalog seeding
(all 4 compliance columns NOT NULL —   (per leaf category: download template →
blocks everything below)               fill from extracted data → upload →
                                        draft master_products created)
```

Vendor inventory/pricing (the existing Flow 2 vendor-catalog-import path) only becomes
usable once Stage 2 has produced enough real `master_product` rows for a vendor export to be
non-empty — this is 0011's own "seeding must precede vendor onboarding" dependency, now
concretely blocking on Pearl specifically.

### Stage 2 rollout order — by OUR leaf category, not by Pearl's PDF

**Corrected during this discussion.** The first draft of this record sequenced rollout
PDF-by-PDF ("seed Sanitary Ware first, then CP, then PTMT, then Pipes"). That is wrong,
because Pearl's 4 PDFs and our leaf categories are not a 1:1 mapping — several of our leaves
are fed by *more than one* PDF:

```
sanitaryware/cisterns      ← Sanitary Ware PDF  +  PTMT PDF (PTMT has its own
                              cistern section, and it's WHERE the colour-variant
                              data — C-001/WH, C-007/FLR/WH etc. — actually is)
sanitaryware/taps-faucets  ← CP PDF  +  PTMT PDF — two DIFFERENT material lines
                              (chrome vs plastic) that share fixture names like
                              "Bib Cock" but are confirmed-different products
                              (see the image-sourcing section above)
plumbing/valves            ← CP PDF's "Allied" section (bottle traps, concealed
                              flush valves) — easy to miss if CP is only read
                              for its faucet pages
```

A PDF-by-PDF pass would seed `Cisterns` once from the Sanitary Ware PDF, then come back
*weeks later* on the PTMT pass to add the same leaf's colour variants as an afterthought —
exactly the kind of split that produces the drift this record already found once (the
`C-007/WH` vs `C-007/FLR/WH` inconsistency). Seeding one leaf in two disconnected sessions,
each unaware of the other's data, is how that kind of gap gets missed rather than caught.

**Decision: sequence by leaf category, pulling from every PDF that feeds it in the same
pass.**

```
1. sanitaryware/cisterns        — Sanitary Ware PDF + PTMT PDF cistern pages, ✅ DONE (41 products)
                                   together (first: smallest full scope, and
                                   forces the Colour attribute decision early,
                                   which every later leaf benefits from having
                                   already settled)
2. sanitaryware/water-closets,  — Sanitary Ware PDF only              ✅ DONE (62 products:
   wash-basins, urinals                                                  22 + 35 + 5)
3. sanitaryware/taps-faucets    — CP PDF + PTMT PDF, together (same reasoning  🟡 PARTIAL (44
                                   as Cisterns: two material lines feed one leaf)  products, 3
                                                                                    of many series —
                                                                                    see Batch 3 note)
4. sanitaryware/showers,        — PTMT PDF (showers)            🟡 PARTIAL (showers ✅ 27
   bath-accessories                                                 products; bath-accessories
                                                                      still open, no source
                                                                      data found yet)
5. plumbing/valves               — CP PDF, "Allied" section    ✅ DONE (4 products, small —
                                                                    most of "Allied" routed
                                                                    elsewhere, see note)
6. plumbing/pipes,
   plumbing/pipe-fittings       — Flowshield PDF
```

Cisterns remains the first leaf seeded (same reasoning as before — smallest, cleanest,
contains the one schema gap), but now correctly scoped to include PTMT's cistern data in
that same pass rather than as a separate later pass.

**Batches 7–9, added after the taxonomy-gap fix below.** These leaves didn't exist when
batches 1–6 were planned — they were created later in this same record (new top-level
`Kitchen`, plus `seat-covers`, `jet-sprays`, `hoses-couplings`). Adding them to the same
numbered sequence rather than leaving them as a separate, easy-to-forget list:

```
7. sanitaryware/seat-covers,
   sanitaryware/jet-sprays      — PTMT PDF, pages 04–05 ("Seat Covers", "Jet Sprays"
                                   per its own table of contents)
8. plumbing/hoses-couplings     — PTMT PDF, pages 49–50 ("Ball Cocks", "Waste
                                   Couplings", "Connection Pipes", "Washing Machine
                                   Inlet/Outlet Hose", "Bottle Trap" — note "Ball
                                   Cocks" itself needs no new row here, it already
                                   fits plumbing/valves' existing Ball enum value;
                                   only the hose/coupling items are genuinely new)
9. kitchen/sinks, cabinets,
   floor-gratings,
   pest-odour-control           — PTMT PDF, pages 51–55 ("Kitchen Sinks", "Shell
                                   Cockroach Repeller", "Floor Gratings", "Cabinets")
```

Same rule as batches 1–6: pull from whichever PDF(s) actually feed each leaf, don't go
page-range-by-page-range blind — confirm against the real product data when each batch is
actually worked, the way Cisterns' page-5/6 citation had to be corrected after being wrong
in an earlier revision of this record.

### Identifier handling — keep it simple, MVP scope

- Store `mfr_part_number` exactly as printed (`C-001/WH`, `CMP1103015`), no parsing into
  base+variant. This is what the existing upload service already does (`String(value)`, no
  normalisation).
- Apply only `.trim().toUpperCase()` before insert — cheap, catches the cheapest drift
  (`c-001/wh` vs `C-001/WH`). No separator-stripping, no segment parsing.
- Do not build format-normalisation logic for compound codes now. Per 0012's own rule
  ("measure coverage during seeding, do not estimate it") — revisit only if real duplicates
  actually surface once Pearl's ~400-600 SKUs are seeded.
- **Genuinely found gap, deferred:** Pearl's own catalog is internally inconsistent in code
  segment count for variants that need one more distinguishing dimension than usual (e.g.
  `C-007/WH` vs `C-007/FLR/WH` for a floral-design variant, on the same PDF page). Not solved
  here — flagged as a live example if MPN-format drift ever needs revisiting.

### Colour variant modelling — schema change required before Sanitaryware seeding

Pearl's PTMT cisterns ship in up to 7 body colours (White, Ivory, Pink, Blue, Alpine Blue,
Green, Maroon, Magenta), each with its own distinct Cat No. — a genuinely separate stockable
item per colour, not a tint-on-demand product like paint ([0016](0016-colour-price-per-listing.md)).
`sanitaryware/cisterns` currently has no colour attribute at leaf level (`Finish` at
Sanitaryware root covers metal fitting finish, not plastic body colour — wrong attribute).

**Decision:** model `Colour` the same way `Finish` already works elsewhere —
`is_variant_defining = true`, enum, one `master_product` row per colour. Because
variant-defining attributes are enforced at publish by a DB trigger, this must land *before*
any coloured Sanitaryware SKU is seeded, or publish will fail with a trigger error naming the
missing attribute.

**Scope, filled in — evidence-based, not assumed:**

| Leaf | Add `Colour`? | Evidence |
|---|---|---|
| `sanitaryware/cisterns` | ✅ Yes | Directly observed — **citation corrected**: PTMT catalog PDF pages 5-6 (printed page numbers "01"-"02" in the document's own footer, under the "FLUSHING CISTERNS" section per the PDF's table of contents on PDF page 3) show the same cistern model issued under distinct Cat No.s per colour (`C-001/WH`, `C-001/IV`, `C-001/CLR`; `C-007/FLR/WH`, `C-008/EG/WH`, `C-008/FH/WH` etc.). An earlier revision of this record cited "PTMT catalog page 2," which was wrong — that page is the document's cover/about page, not the cisterns section. Re-verified by direct re-read after the citation was found not to hold. |
| **Sanitary Ware PDF's own "Concealed Cistern" section (page 21) is a DIFFERENT product** | N/A — no colour needed there | Checked separately: in-wall concealed cisterns (`CCQF-100`, `CCQF-101`) are white/chrome only, no colour options observed. The two PDFs' "cistern" sections are not the same product line — PTMT's is the free-standing coloured plastic flush tank; Sanitary Ware's is an in-wall concealed unit. Confirms the earlier "pull Cisterns from both PDFs together" plan still holds, but for genuinely different SKUs, not overlapping ones. |
| Water Closets, Wash Basins, Urinals, Bath Accessories | ❓ Not confirmed | An earlier revision of this record claimed these "likely" need it too — that was an unverified guess, not a finding, and is corrected here. No colour-coded SKU was actually read on any page of those leaves' catalogs (Sanitary Ware PDF, 24 pp, was read and showed dimensions/trap/flush data only, no colour options). Do not add `Colour` to these leaves speculatively — check during Stage 2 seeding of each leaf, and only add it if the same pattern (distinct Cat No. per colour) actually appears. |

**Enum values, from the PTMT catalog's own "COLORS..." legend (PDF page 6, printed "02"):**
White, Ivory, Pink, Blue, Alpine Blue, Green, Maroon, Magenta — plus the observed non-solid
options `CLR` (likely "Clear"/transparent tank window) and named motif variants (`FLR` =
floral, `EG` = Egret, `FH` = Fish) that read as a second, separate attribute (a decorative
pattern/motif) layered on top of base colour, not a ninth colour. **Open sub-question:**
whether motif needs its own attribute (`Motif` or `Design`, enum, optional) alongside
`Colour`, or whether motif variants are rare enough to fold into the `Colour` enum as
compound values (`White + Floral`) — deferred to implementation, revisit if motif SKUs turn
out to be more than a handful once Cisterns is actually seeded.

**Implementation note:** the `taxonomy.js` seed data was already updated with `cistern_colour`
(enum, variant-defining) during this discussion — added *before* the citation above was
re-verified. Re-checked against the corrected source and the enum values match what the
PDF actually shows, so the addition stands; flagged here only so the sequence (attribute
added, then its source re-verified) is honest in the record.

### Image sourcing — website, not PDFs

The 4 PDF catalogs are page-composited artwork: CP/PTMT/Sanitary are one flattened image per
page (confirmed: page count exactly equals embedded-image count in each file); Flowshield's
apparent multi-image pages turned out to be stacked full-page layers, not per-product crops.
**No clean per-SKU image is extractable from any of the 4 PDFs without manual bounding-box
cropping per product** — not attempted, disproportionate effort for what is a placeholder
image pending real vendor photography regardless.

The website solves this for free: each product page carries exactly one image, and — checked
on multiple products — **the image filename already equals the SKU**
(`BEA-2500` → `BEA-2500.jpg`, `UMP4003015` → `UMP4003015.jpg`). This is not a convention to
build, it's already true of the source.

### PDF is the source of truth; website supplies images only where the exact SKU matches

The website and the PDF catalogs are **not the same product list** — verified, not assumed.
`TS-126` ("Bib Cock with Foam Flow", PTMT/Standard catalog page 7) is a visibly cream/ivory
**plastic** fixture; `BEA-2500` ("Bib Cock", website, Beaut/CP Faucets category) is a
**metallic, chrome-plated** fixture. Same fixture name, different material line, different
product, different SKU — "CP" and "PTMT" are Pearl's own two separate top-level product
families with separate PDF catalogs. A join on product name (or even on name + rough
category) would have silently merged these as one product. Confirmed by direct visual
comparison, not inferred from category structure alone.

**Decision (per discussion): the PDF catalogs are authoritative for all product data**
(SKU, name, price where present, dimensions, HSN, series). The website is used **only** to
source images, and only by an **exact SKU string match** — look up the PDF's SKU verbatim
as a website product page; if found, take its image; if not found, no image from this pass,
flagged for vendor-supplied photography instead. Never match by product name or series —
only exact SKU equality, which is unambiguous by construction. This deliberately accepts
that some PDF-only SKUs (not on the live site) get no image in this pass, rather than risk a
wrong image attached via a fuzzier match.

**Found during the first real batch (Cisterns), amending the rule above:** the website's
displayed "SKU:" field is consistently the **base code only** — `C-001`, `C-004`, `C-006` —
dropping the colour/motif suffix our PDF-derived `mfr_part_number` carries (`C-001/WH`,
`C-008/FLR/WH`). Checked across 10 live product pages, 100% consistent. A strict full-string
match (as first written above) would therefore match **zero** colour-variant rows, since the
website never prints the suffixed form as its SKU. Image filenames sometimes carry the suffix
(`C-004-IV.jpg`) and sometimes don't (`C-001.jpg`, despite showing one specific colour) —
inconsistent, and not reliable enough to key off instead.

**Decision (per discussion): match on the BASE code, stripping any `/colour` or `/motif`
suffix before comparing.** Consequence, accepted deliberately: every colour variant of one
base product (e.g. `C-001/WH`, `C-001/IV`, `C-001/CLR`) gets the **same** image — whichever
single photo the website happens to show for that base SKU, which may not even be the
correct colour (confirmed: `C-001`'s photo is the **Blue** variant, a colour not even in the
PDF's colour list for that product... actually a colour that IS listed — Blue is one of the
8 legend colours — but the specific `C-001/BL` code was not itself seen printed on the PDF
page, only Blue as an available option in the general legend). This is a known, accepted
placeholder-quality limitation, not a silent error — every colour-variant row's image should
be treated as indicative only until Pearl supplies real per-colour photography (open question
9). Recorded here rather than left as an implicit assumption.

### Image linking mechanism — filename is the join key, no separate mapping table needed

```
Stage 2 (already built):  Excel import writes master_product.mfr_part_number = "BEA-2500"
Image step (later):       download website images, saved AS "{SKU}.jpg"
                           (character substitution for filename-illegal chars,
                            e.g. "/" → "-", applied identically both directions)
Bulk upload (to build):   for each file in folder:
                             sku = filename minus extension (reverse the substitution)
                             product = SELECT * FROM master_product
                                       WHERE mfr_part_number = sku
                             found    → upload to GCS, insert master_product_media row
                             not found → skip, report in a "no match" list — never guess
```

One batch call processes the whole folder unattended; a human triggers it once, does not
touch individual images. Mirrors the existing Excel importer's shape (bulk operation,
per-row/per-file validation, a report of what didn't match, nothing silently wrong).

## Consequences

- **Two small platform gaps block full completion**, independent of Pearl specifically:
  a brand-creation endpoint, and the GCS `StorageService` + media upload endpoint 0024
  designed but never built. Per the user, both are deferred — "add functionality later,"
  plan should stay clear now regardless.
- Product-data seeding (Stage 2) has **no code blockers** — the Excel import tool already
  does everything needed; only real data entry (from what's extracted) and the `Colour`
  attribute addition are required.
- The scraped/extracted data is explicitly a **draft**, not a replacement for vendor
  confirmation. See the open question list below — none of it is answered by scraping.

## Price is out of scope for this record — it belongs to `vendor_listing`, not `master_product`

`master_product` has **no price column at all**. `price`, `mrp`, and `min_order_qty` live on
`vendor_listing` (confirmed directly against `catalog-schema.sql`), populated when a vendor
does an inventory upload (Flow 2, [0011](0011-product-code-and-vendor-export.md)) — a
separate stage from catalog seeding, and one Pearl goes through as a *vendor*, not as a
*brand*. The CP catalog's 2022-dated MRP is therefore not a blocker to seeding the catalog at
all; it was wrongly listed as one in an earlier revision of this record. By the time price
matters (Stage 3), Pearl supplies it fresh through their own vendor upload — there is nothing
to "confirm is current" from a scraped PDF, because that PDF was never going to be the source
for it.

## Open questions for Pearl — split by what's actually being asked

Not everything below is equally uncertain. Some items only need Pearl to confirm public,
already-scraped data hasn't changed; others are genuinely absent from everything scanned and
must be supplied fresh. Conflating the two overstates how much is really in doubt.

### Confirm — data exists and looks current, just needs Pearl's sign-off

1. Legal entity name and GST-registered address (have: Noida address from the ISO cert —
   confirm it's the one to publish)
2. Is the printed Cat No. (e.g. `BEA-2500`) a stable, permanent MPN, or an internal/seasonal
   code that could be reassigned?
3. Active/discontinued status — some catalog pages may be stale (PDFs are from 2023, some
   certs from 2026)
4. The inconsistent colour-code segment structure found in their own PTMT catalog (`C-007/WH`
   vs `C-007/FLR/WH` on the same page) — flag back to them rather than silently absorb it

### Supply — genuinely missing from everything scanned, not a trust question

5. Consumer care email and phone (blocks brand creation outright — `NOT NULL` on `brand`, and
   this does not appear anywhere on the site or in any PDF)
6. GTIN/barcode, if any exist on any SKU (none seen across any catalog). `master_product.gtin`
   is nullable and expected to be patchy per 0012/0013 — asked because it's a real column and
   the strongest dedup signal where it exists, not because it's required.
7. HSN code for PTMT, CP fittings, and Sanitary Ware lines (only pipes/fittings had one)
8. Full dimension tables for PTMT faucets and CP Bath Fittings (Sanitary Ware and pipes had
   these; faucets didn't)
9. Real product photography, to replace the website's compressed/watermarked draft images
10. Per-size breakdown for range-SKUs the website collapses into one listing (e.g. "UPVC
    Pipes, Size 15mm–50mm" as a single product) — the PDF price list already has these
    correctly exploded per size and should be treated as the correct source over the website
    for this specific case

**MOQ removed from this list** (was item 8 in an earlier revision) — same class of mistake as
GSTIN and price: `min_order_qty` lives on `vendor_listing`, not `master_product` or `brand`
(confirmed directly against the schema). Same reasoning as the price correction above, just
not applied consistently the first time — MOQ is Stage 3 (vendor inventory upload), collected
fresh from Pearl-as-vendor, not something brand/catalog onboarding needs.

**GSTIN removed from this list** (was item 6 in an earlier revision) — checked directly
against the schema and it does not exist. `brand` has no GSTIN column at all;
`vendor.gstin` exists but is `@IsOptional()` on vendor onboarding (a separate flow, Stage 3,
not brand/catalog onboarding). Nothing in Stages 1–2 reads or requires it. It was added
earlier by loose analogy to Legal Metrology fields without checking the schema — a mistake,
corrected here rather than left in.

## First batch executed: Cisterns (Excel sheet + images)

To validate the pipeline before repeating it for every other leaf (per the rollout-order
decision above), the Cisterns leaf was carried through in full during this discussion:

- **`taxonomy.js`** — `cistern_colour` enum attribute added to the Cisterns block
  (variant-defining), values from the PDF's own legend.
- **Excel sheet built** — `sanitaryware-cisterns-pearl-precision.xlsx`, matching the real
  template column structure from `catalog-import-template.service.ts`. **Final: 41 rows**
  (30 colour-variant rows across 14 flushing-cistern products + 11 concealed-cistern SKUs).
  `hsn_code`, `gtin`, `pack_qty` left blank where the source page didn't state them, rather
  than guessed.
- **Row-count error, found and fixed:** the first build wrote 43 rows, including a fabricated
  "C-008/FLR" (Floral) variant of the Edge Prime Dual Flushing Cistern that does not exist on
  the source page — the page shows C-008 only in Egret (`C-008/EG`) and Fish (`C-008/FH`)
  motifs, no plain floral one. Caught only because the user asked "why 43, what was the count
  before filtering" and a manual product-by-product recount against the source page was done
  in response — the discrepancy was not caught by any check before that question. The row was
  almost certainly produced by wrongly copying the neighbouring `C-007/FLR` pattern onto
  `C-008` while transcribing. Removed; sheet rebuilt at 41 rows, verified against a fresh
  manual count of the page.
- **Images fetched — 39 of 41 rows covered, checked systematically against every row.**
  All 12 of 12 flushing-cistern base SKUs matched (`C-002`/`C-003` were missing on first pass
  only because the site's category listing shows them under marketing names — "Daffodil",
  "Tulip" — that never appear in the PDF; found via a navigation link on another product's
  page instead). All 9 of the Concealed Cisterns category's live products also matched
  (`C-027`–`C-031`, `CCQF-100`, `CCQF-101`, `C-033`, `C-034`). **Genuinely unmatched: `C-035`,
  `C-036`** (Cubo/Recto actuator plates in Black) — confirmed absent from the site's own
  9-product Concealed Cisterns listing, not a search miss; the site appears to only carry the
  white/chrome plate as a distinct listing. 21 image files total in `cistern-images/`.
- **The colour-suffix problem, stated precisely (per the user's follow-up question).** This
  is not a matching choice we made — it's that **the data plainly does not exist on the
  site**. Checked directly: no cistern product page offers a colour selector, swatch, or
  multiple photos: one base SKU page = exactly one photo of whichever single colour Pearl
  happened to shoot for that listing, and the "SKU:" field never varies by colour. There is
  nothing to "keep" a colour suffix from — a White-specific photo of `C-001` (whose one
  online photo is Blue) does not exist anywhere on `pearl-precision.com`. This can only be
  closed by Pearl supplying real per-colour photography (open question 9) — not by a
  different matching strategy on our side. Every colour-variant row's image should be
  treated as indicative-only (the shape/model, not the true colour) until then.
- **Not yet done**: the sheet has not been uploaded through `/admin/catalog-import` (no
  confirmed live/reachable database this session — see "what the codebase already provides"
  above), the seeder has not been run against a database, and the images have not been
  uploaded anywhere (no upload endpoint exists yet, per the same section, deferred by the
  user's own instruction).

## Pipeline test: database stood up, brand row created, upload run

Per the user's explicit request to test the pipeline rather than leave it theoretical:

- **`golden-abode-postgres` started** via the project's own `docker-compose.yml`. Found a
  port 5432 conflict with an unrelated project's container (`masteracres-postgres`); stopped
  that one (not deleted — restartable) to free the port, per the user's direction.
- **Migrations**: schema already present in this container's persisted volume (35 tables,
  matching all 42 migration files) — confirmed genuinely up to date, not a false "nothing to
  do." Database already held real prior data (160 `master_product` rows, 11 brands) from
  earlier project work — not a clean slate, respected as existing state throughout.
- **Taxonomy seeder re-run** (single seeder, not `db:seed:all` — that command fails
  immediately on this database, since seeders here aren't idempotency-tracked the way
  migrations are, and it hit a duplicate-key error on `seed-users` before reaching taxonomy).
  Confirmed inserted exactly 1 attribute + 8 enum options (`cistern_colour` and its values) —
  nothing else touched.
- **Brand row created** — direct DB insert, since no `POST /admin/brand` endpoint exists.
  `name`, `manufacturer_name`, `manufacturer_address` are real (address from the ISO
  certificate). `consumer_care_email`/`consumer_care_phone` are **explicit placeholders**
  (`PLACEHOLDER-pending-pearl-confirmation@example.com` / `PLACEHOLDER-0000000000`) — Pearl
  has not supplied these (open question 5); inserted only to satisfy the `NOT NULL`
  constraint and unblock a pipeline test, not presented as real data. **Must be corrected
  before this brand is ever exposed to a real admin/customer-facing flow.**

### Port conflict discovered: this session's Postgres and backend port assumptions were wrong

Two real environment findings, corrected mid-task:

1. **Port 5432 was already held by `masteracres-postgres`** (a different, unrelated project,
   confirmed by its logs and by a `SELECT datname` query returning `masteracres` — not
   `golden_abode` — before this was caught). The earlier TCP/Sequelize "reachability" check
   in this session's history connected to *that* container, not Golden Abode's; no data was
   read or written there beyond a read-only `SELECT`.
2. **Port 3000 was already held by a running MasterAcres backend** (confirmed by its own
   root response: `"MasterAcres API is running"`) — the first upload attempts against
   `localhost:3000` 404's were hitting *that* server, not this one, because Golden Abode's
   backend was never actually running yet.

Per the user's explicit instruction, **`masteracres-postgres` was stopped and the
MasterAcres backend process was killed** to free both ports for Golden Abode's own stack.
Neither was deleted — both are restartable (`docker start masteracres-postgres`; the backend
process would need re-launching from its own project). Golden Abode's backend was then
started via `npm run start` on its configured port 3000, confirmed healthy
(`GET /health` → `postgres: up, redis: up, api: up`).

### Upload run against the real endpoint — first attempt failed correctly, second succeeded

**First attempt: 41/41 rows rejected.** Not a false start — it caught three real defects in
the hand-built sheet, none of which were visible from reading the template-generation code
alone:

1. **`sanitary_finish*` — missing from the sheet entirely.** This is declared at the
   Sanitaryware *root* (inherited by all 7 leaves, including Cisterns) and had been missed
   because the first sheet was built from a manual reading of
   `catalog-import-template.service.ts`, not from an actually-downloaded template.
2. **`"Clear" is not a valid option`** for `cistern_colour` (rows for `C-001/CLR`,
   `C-007/CLR`) — "Clear" was never added to the enum when `cistern_colour` was created
   earlier in this session.
3. **Concealed-cistern rows (11 of them) failed on `flush_mechanism`, `cistern_capacity`,
   `cistern_colour` all being required-and-empty** — these were deliberately left blank on
   the reasoning that an actuator plate isn't a cistern and doesn't have a flush type or
   capacity. The schema has no way to express that exception; every row in the leaf is held
   to the same required set regardless of what kind of product it actually is. **Real,
   unresolved data-model gap** — noted, not solved, for this test.

**Fix applied:** downloaded the actual generated template via
`GET /admin/catalog-import/template/:categoryId` rather than continuing to hand-derive
columns; added `Clear` to both `sanitary_finish` and `cistern_colour` enums (2 enum options,
re-ran the taxonomy seeder); filled the 11 concealed-cistern rows' required fields with the
least-wrong available value (`White`, `Single`, `0`) rather than leaving them blank —
explicitly **not** asserted as factual, flagged inline in the sheet-generation script as a
placeholder pending a real fix to how accessory-type rows are modelled in this leaf.

**Second attempt: 41/41 rows accepted, 0 rejected.** Verified directly against the database,
not just trusted from the API response: all 41 `master_product` rows exist, each with a real
auto-generated `product_code` (`GA-01003xx` sequence), correct `mfr_part_number`,
`status = 'draft'`, correctly linked to the `Sparsh Pearl` brand, and — spot-checked — each
row's `cistern_colour` attribute value matches its SKU suffix exactly (`C-001/CLR` → `Clear`,
`C-001/IV` → `Ivory`, `C-001/WH` → `White`). **This is the first real, end-to-end proof that
the whole pipeline — taxonomy seed → brand row → Excel import → draft product creation —
works correctly for this brand's data.**

## Batch 2 complete: Water Closets, Wash Basins, Urinals

Source: Sanitary Ware PDF only (per the rollout order — this batch needed no cross-PDF
merge, unlike Cisterns or the upcoming Taps & Faucets batch). Read the PDF's own index page
(PDF page 12) rather than guess page numbers again — the exact lesson from Batch 1's wrong
citation — then pulled each named section directly: One Piece Closet, Wall Hung Closet,
Water Closet (two-piece/Anglo-Indian style), Pan, Table Top Basin, Small Basin, One Piece
Wash Basin, Basin with Full/Half Pedestal, Urinal.

Downloaded the real templates for all 3 leaf categories before writing any rows (not
hand-derived) — confirmed `sanitary_finish*` required on all three, same as Cisterns.

**Recounted every section against the source pages before uploading** (the Batch 1 lesson
applied proactively this time, not only after being asked): One Piece (8) + Wall Hung (5) +
two-piece (5) + Pan (4) = 22 Water Closets; Table Top (13) + Small (8) + One Piece (4) + Full
Pedestal (6) + Half Pedestal (4) = 35 Wash Basins; 5 Urinals. All three sheets accepted on
the **first upload attempt, 0 rejections** — the real template + recount discipline from
Batch 1's failures paid off immediately here.

**Verified directly in the database:** 103 total Sparsh Pearl products now exist (41
Cisterns + 22 Water Closets + 35 Wash Basins + 5 Urinals).

**Known simplifications, flagged rather than silently asserted:**
- `sanitary_finish = 'White'` used for every row — same unresolved semantic mismatch as
  Batch 1 (vitreous china has no metal fitting finish; White is the closest real enum value
  and matches every product photo, but this is a placeholder, not a considered mapping).
- `trap_distance` inferred from the PDF's inch-based "Size Available: 9', 12' & P Trap" text
  by rough inch→mm conversion (9″≈225mm, 12″≈300mm) — not confirmed against Pearl's actual
  measurements, flagged as an open item rather than presented as precise.
- Pan-style WCs mapped to the existing `Indian / Orissa` enum value — `wc_type` has no
  dedicated "Pan" option; may need one later if pans need distinguishing from Anglo-Indian
  in filters.
- `hsn_code` blank throughout — Sanitary Ware PDF never printed one, same gap as Batch 1.

**No images obtainable for this batch — verified, not merely unattempted.** Batch 1's images
came from the website; this batch's rows were created without repeating that step, caught
only when the user asked directly. Checking then found the underlying cause is structural,
not an oversight to fix by trying harder: `pearl-precision.com`'s live navigation has no
Water Closets / Wash Basins / Urinals category at all — only PolyCeramic, CP Bath Fittings,
Cisterns, Kitchen, and Pipes & Fittings (matching the site nav the user showed earlier in
this conversation). Confirmed with three separate site searches (`SL-9090`, `Loris`, "one
piece closet") — all returned zero results, not a slug-guessing failure. **The Sanitary Ware
product line (all of Batch 2, 62 products) has no web presence to pull images from at all.**
The only path to real images here is Pearl supplying photography directly — already open
question 9 — not a different search strategy on our side. Rule adopted going forward:
**pull images as part of every batch, before considering it done, not as a separate
afterthought step** — this gap is what happens when that discipline lapses.

## Batch 3 complete: Taps & Faucets (partial — 3 of many series, scope flagged)

**Scope, stated explicitly rather than implied as complete:** CP catalog alone has dozens of
named tap series (Pisces, Taurus, Beaut, Oyster, Marina, Nova, Virgo, Leo, Aquarius, Earth,
Doris, Libra, Brenta, Neptune, Pluto...) across many pages, plus PTMT's ~20 more series.
Reading every one before this batch would block progress on the rest of the rollout. This
batch covers **3 series read in full**: Beaut (CP, from the original website scan), Pisces
(CP PDF page 71), Taurus (CP PDF pages 72-74) — 44 products, a real first pass, **not** full
CP+PTMT tap coverage. Remaining series are open follow-up work, tracked here rather than
silently treated as done.

**Uploaded: 44/44 accepted, 0 rejected**, first attempt (after a JWT refresh — the dev token
from Batch 1 had expired; minted a new 4-hour one to reduce how often this interrupts the
run). `sanitary_finish = 'Chrome'` used throughout — unlike Batches 1-2's placeholder use of
this attribute, CP taps are genuinely chrome-plated brass, so this is a real mapping, not a
workaround.

**Images: 16 of 44 (Beaut only) — the other 28 (Pisces, Taurus) confirmed genuinely
unobtainable, not just unfound.** Checked properly this time, per the rule adopted after
Batch 2: Beaut's 16 products are live on the website, confirmed via its category listing
page, and all 16 images downloaded successfully (direct URL construction from the known
`{SKU}.jpg` pattern, verified against one image visually). Pisces and Taurus are **not** on
the live site — confirmed by site search returning zero results for both series names, and
by a direct check that `PIS-100.jpg` 404s (caught a false positive first: the failed request
saved a 201KB HTML error page with a `.jpg` extension, which would have looked like a
successful download by file size alone — verified content type before trusting it). Same
structural gap as Batch 2: these series exist only in the PDF, no web presence to pull from.

## Catalog coverage gap found and closed: not everything in Pearl's PDFs fit our existing tree

Checked directly against Pearl's own website nav and the PTMT catalog's full table of
contents (not assumed): the original 6-batch rollout plan only covers what maps onto
**leaves that already existed** in our 58-leaf schema. Several real Pearl product lines had
no home at all: Seat Covers, Jet Sprays, Ball Cocks, Waste Couplings, Connection/Washing-
Machine Hoses, Bottle Traps, and an entire "Kitchen" line (Sinks, Cabinets, Floor Gratings,
Shell Cockroach Repellers).

**Re-audited item by item before changing anything** — several turned out to already fit:
`Ball` and `Foot` were already values on `plumbing/valves`' `valve_type` enum; `Health Faucet`
was already a `sanitaryware/taps-faucets` `tap_type` value. Only genuinely homeless items got
new leaves.

**Decision (bounded change, brainstorming skill, approved by user):**

| Change | Where |
|---|---|
| New leaf `Seat Covers` | `sanitaryware/seat-covers` |
| New leaf `Jet Sprays` | `sanitaryware/jet-sprays` |
| Enum extension: `Soap Dispenser` added to `accessory_type` | `sanitaryware/bath-accessories` (no new leaf needed) |
| New leaf `Hoses & Couplings` | `plumbing/hoses-couplings` (covers Connection Hose, Washing Machine Inlet/Outlet, Waste Coupling) |
| **New top-level category `Kitchen`** | 4 new leaves: `sinks`, `cabinets`, `floor-gratings`, `pest-odour-control` |

**Explicitly excluded, per user decision:** Bucket Sets, Cloth Dryers, Aluminium Ladders,
Garden Pipes — general household plasticware/hardware, not a fit for a building-materials
catalog. Not seeded, not modelled; revisit only if the business explicitly wants that line.

**Cost, confirmed empirically rather than estimated:** zero code changes. Same mechanism as
the `cistern_colour` addition earlier in this record — entries added to
`apps/backend/database/seed-data/taxonomy.js` (the same tuple format throughout), then
`npx sequelize-cli db:seed --seed 20260901100000-seed-taxonomy.js` re-run. Confirmed no
category slug is ever hardcoded in application code
(`grep -rn "'sanitaryware'\|'plumbing'\|'kitchen'" src/` returned nothing outside
`seed-data/`), which is why this stays a pure data change. Seeder ran clean: **8 categories,
19 attributes, 39 enum options** inserted this run; totals now 79 categories (65 leaf), 262
attributes, 1002 enum options. Verified directly against the database afterward — all 8 new
category paths exist with correct `is_leaf` flags, and `accessory_type`'s enum now includes
`Soap Dispenser`.

**Not yet done:** these new leaves have no products seeded into them yet — this only created
the taxonomy (categories + attributes), the same first step Cisterns went through before its
own Excel-import batch. Populating them is future rollout-order work, not covered here.

## Batch 4 complete (Showers only — Bath Accessories deferred, not guessed)

**Scope, stated up front:** Batch 4 was originally "Showers + Bath Accessories" together.
Showers had solid, fully-read source data (PTMT PDF pages 62-63, printed 59-60, 27 SKUs
across two pages). Bath Accessories did not — the CP pages checked in this pass turned out
to be concealed-mixer/diverter parts, not the towel-rail/soap-dish/robe-hook products this
leaf's `accessory_type` enum actually expects. Rather than force a guess, Bath Accessories is
left undone and explicitly flagged as still open, not silently skipped.

**Uploaded: 27/27 accepted, 0 rejected**, first attempt. One real correction made before
upload: `shower_size` was initially assumed to be a fixed 5-value enum (100/150/200/250/300)
from memory; checking the actual downloaded template found it has **no data validation at
all** — it's a plain number field. The script briefly rounded every real mm size (76, 50,
125, 165...) to the nearest of those five guessed values before this was caught and fixed to
use the real printed sizes directly. Caught by checking the template rather than trusting
recollection — the same discipline the Batch 1 failures established.

**Images: 27/27 — full coverage, unlike Batches 2-3.** These PTMT shower SKUs (`SHP-xxx`) ARE
published on the live site, confirmed via the site's own Showers category listing (16 CP-line
products) plus a direct SKU check on 3 of them (`SHP-526`, `SHP-521`, `SHP-539` all matched
exactly). Downloaded all 27 via direct URL construction, checking real HTTP 200 status this
time (not file size alone) — the Batch 3 false-positive (a 404 error page saved with a `.jpg`
extension) made that check non-negotiable going forward.

**174 total Sparsh Pearl products now in the database.**

## Batch 5 complete: Valves

Source: CP catalog PDF page 74 (printed 67), "Allied" section. Small batch by design, not by
mistake: most of that section's items belong elsewhere — Waste Coupling Full/Half Thread
Brass routes to the new `hoses-couplings` leaf (Batch 8), not Valves; Surgical/Pressmatic
taps and Sink Mixer route to `taps-faucets`. Only the genuine valve-type items were taken
here: 3 angle cocks (Zen, Eco, Turbo) and 1 foot-operated tap.

**Uploaded: 4/4 accepted, 0 rejected. Images: 4/4**, full coverage — all four confirmed live
on the website (Zen Angle Cock found via site search first, SKU and image confirmed on its
product page), downloaded via direct URL construction. Filename case varies from the printed
Cat No. (`All-1103.jpg` for `ALL-1103`, lowercase "ll") — worth noting as a pattern to expect
in future batches, tried both cases rather than assuming one.

`valve_size` defaulted to 15mm (standard angle-cock bore) — not printed on the source page,
inferred rather than confirmed; flagged as an open item like other placeholder fields in
earlier batches.

**178 total Sparsh Pearl products now in the database.**

## Sources

- `pearl-precision.com` — website scan, this session
- 4 product catalog PDFs + 6 certificate PDFs — linked and extracted, this session (see
  session scratchpad for raw files, rendered pages, and page-level images)
- `apps/backend/src/modules/catalog/` — existing import/catalog code, read directly this
  session
