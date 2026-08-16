# Catalog Build Order

What to build, in what order, and what blocks what. Derived from decisions 0001–0013 and
[catalog-integrity-approach.md](catalog-integrity-approach.md).

Nothing here is built yet. Existing in the codebase: `users`, `refresh_tokens`, `vendors`,
`vendor_account_details`, an admin panel shell, and the co-developer's mobile app.

---

## The critical path

```
  taxonomy ──► master_product ──► admin import ──► vendor listings ──► search
     │                │
     │                └──► CATALOG SEEDING (business track, 4–8 weeks)
     │                          │
     └──────────────────────────┴──► blocks all vendor onboarding
```

**The long pole is seeding, not code.** Vendors cannot pick from an empty catalog, so
seeding starts the moment the taxonomy exists and runs in parallel with everything after it.
Treat it as a workstream with an owner, not a task.

---

## Phase 0 — Before any code

Two things that cost nothing now and a lot later.

| Item | Why now |
|---|---|
| **Name a catalog seeding owner** | 4,000–6,000 SKUs is domain work, not data entry. Someone who does not know the trade will file anchors under bolts |
| **Verify MPN availability** | Open a real Havells and Jaquar price list. Confirm each product carries a code. This determines how much of the catalog the primary dedup constraint actually covers — and it is still unverified |

Also decide: launch all eight categories, or start with two or three where brand data is
strong (Electrical, Tiles, Plumbing). Starting narrow is strongly recommended — it proves
the whole loop before absorbing Hardware and Stone, the two hardest.

---

## Phase 1 — Taxonomy foundation

Everything else references this. Nothing can start until it lands.

```
migrations   unit_of_measure · brand · category · attribute
             attribute_value_option · vendor_category

seeders      8 top-level → 58 leaf categories
             153 variant-defining + descriptive attributes
             enum value options

triggers     category level / path / is_leaf invariants
```

**Includes the prerequisite fixes**, because retrofitting them later means re-seeding:

- Convert the six free-text variant-defining attributes to enum (Series ×2, Finish,
  Dimensions, Colour, Slab/Tile Size)
- Brand name normalisation + unique index
- MPN normalisation on write

**Unblocks:** catalog seeding can begin the day this ships.

---

## Phase 2 — Master catalog

```
migrations   product_family · master_product · master_product_attribute_value
             master_product_media
             master_product_code_seq

constraints  UNIQUE (brand_id, mfr_part_number)     ← primary dedup
             UNIQUE (gtin)
             leaf-only trigger + leaf-transition guard

triggers     attributes_flat + identity_hash
             catalog_reindex_queue + drainer

admin UI     product CRUD, attribute editor, draft → live publish
```

`identity_hash` and its publish constraint land here rather than later — it depends only on
Phase 1 attributes, and adding it after products exist means backfilling.

**Unblocks:** manual catalog entry. Seeding stops being a spreadsheet exercise.

---

## Phase 3 — Admin catalog import

```
generate     per-category Excel template from the attribute model
upload       parse by header name, validate, per-row errors
return       the same file with an appended error column
publish      rows land as draft; publishing is deliberate
```

Templates are **generated**, not hand-maintained — one per leaf category from the inheritance
resolution.

**Unblocks:** bulk seeding. Turns 4,000 SKUs from months into weeks.

---

## Phase 4 — Vendor side

The largest phase, and the one that needs a real catalog to test against.

```
migrations   vendor_listing · inventory · warehouse
             vendor_listing_colour_price       (paint)
             vendor_product_map
             catalog_import_batch · catalog_import_row

export       scope by leaf category + brand + since-date
             search picker (ILIKE, no search engine needed)
             live row count before download
             product_code and name pre-filled and locked

import       match ladder 0–6
             vendor confirms first match only
             ranked match_candidates in the review queue

admin UI     review queue — ranked candidates, not a flag
             manual resolution writes back a mapping or alias
```

**Export scoping is not optional in v1.** Without it a Hardware vendor receives ~10,000 rows
and abandons the flow.

---

## Phase 5 — Category specifics

Can run partly in parallel with Phase 4.

| Item | Notes |
|---|---|
| ~~`paint_shade` ingestion~~ | **Dropped (0014).** Customer picks a colour family; the vendor finalises the shade at the counter |
| `stone_variety` + aliases | No published source — assembled from trade knowledge |
| Paint colour-family pricing | Vendor template pre-expands one row per family |
| Stone grade listings | One row per grade; `UNIQUE` includes `stated_grade` |

**These two categories carry the most unknowns and the least available data.** If Phase 0
chose a narrow launch, this phase is where Paint and Stone join.

---

## Phase 6 — Search

Only useful once products *and* listings exist, so it genuinely follows Phase 4.

Engine decided in [0017](decisions/0017-search-engine-choice.md): **Meilisearch**,
self-hosted on Railway, with the Postgres path kept permanently as a fallback rather than
discarded. Architecture in [search-system-design.md](search-system-design.md); DDL in
[search-schema.sql](search-schema.sql).

```
6a  document shape       S1 — grain, and how location-dependent price
                         is carried. BLOCKS EVERYTHING BELOW.
                         SearchDocument lands in packages/types

6b  postgres path        pg_trgm on name + GIN on attributes_flat
                         (both indexes already exist)
                         → ships first, then becomes the fallback

6c  sync plumbing        search_outbox + 2 trigger functions
                         + 24 statement-level triggers
                         expansion / drain / purge / backlog view

6d  meilisearch          Railway service, private networking
                         index settings AS CODE, applied on boot
                         typoTolerance.disableOnNumbers = true

6e  worker               BullMQ on the existing Redis
                         expand → build → add/delete → mark processed

6f  query layer          SearchModule, facets per leaf category,
                         Redis query cache, fallback switch

6g  rebuild job          shadow index + atomic swap, for 'all'
```

Three sequencing notes:

- **6b is not throwaway.** It ships as the search implementation, then stays as the
  fallback that keeps the site up when Meilisearch is down or mid-rebuild. It needs test
  coverage for that reason — a fallback nobody exercises is not a fallback.
- **6a blocks 6e specifically.** The worker cannot build a document whose shape is
  undecided. Everything else in this phase is document-agnostic and can proceed.
- **`search-architecture.md` is superseded on the tool choice and on the claim that the
  document shape is already designed.** It is not — that is S1, still open.

---

## Phase 7 — Integrity hardening

Deferred deliberately; see
[catalog-integrity-residual-risks.md](catalog-integrity-residual-risks.md).

```
price-outlier flag              cheap, catches most wrong matches
catalog-edit re-validation      reuses catalog_reindex_queue
brand dedup / alias table       risk 1
candidate-choice confirm UI     risk 2 — the one that compounds
required variant attrs          risk 3
customer report path            risk 4 — needs the ordering domain
```

---

## Dependency summary

| Phase | Blocked by | Blocks |
|---|---|---|
| 0 | — | everything |
| 1 | 0 | seeding, all catalog work |
| 2 | 1 | manual entry, import |
| 3 | 2 | bulk seeding |
| 4 | 2 + a real catalog | vendor onboarding, search |
| 5 | 1, partly parallel with 4 | Paint and Stone launch |
| 6 | 4 | customer-facing browse |
| 7 | 4 | nothing — hardening |

**The two things that gate everything else:** Phase 1 shipping, and seeding having an owner.
Both can start immediately.

---

## Open sequencing questions

1. All eight categories at launch, or two to three first? Narrow is recommended.
2. Does seeding start in parallel with Phase 2 development, or wait for Phase 3's bulk
   import? Waiting is slower to start but much faster per SKU.
3. Is `.xlsx` with locked columns and dropdowns worth the `exceljs` dependency? It would
   prevent a whole class of import error.
4. Who builds the vendor portal — the same developer as the backend, or is it part of the
   admin panel?
