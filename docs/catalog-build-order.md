# Catalog Build Order

What to build, in what order, and what blocks what. Derived from decisions 0001–0013 and
[catalog-integrity-approach.md](catalog-integrity-approach.md).

> [!NOTE]
> **This is the plan, written before code.** For what has actually shipped and been
> verified live, see
> [catalog-implementation-status.md](catalog-implementation-status.md) — as of 2026-09-01,
> Phases 1–7 are done except Phase 7 risk 4 (blocked on the ordering domain). Phase 6 is
> complete per [0021](decisions/0021-search-runtime-build-plan.md).

Existing in the codebase before this catalog effort started: `users`, `refresh_tokens`,
`vendors`, `vendor_account_details`, an admin panel shell, and the co-developer's mobile
app.

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

| Item | Why now | Status |
|---|---|---|
| **Catalog seeding owner** | 4,000–6,000 SKUs is domain work, not data entry | **Assigned: the Golden Abode team**, sourcing directly from each brand's own published catalog/website |
| **Verify MPN availability** | Confirm each product carries a code — determines how much of the catalog the primary dedup constraint actually covers | Folds into seeding itself now — the same pass through Havells' and Jaquar's sites that pulls specs also confirms MPN presence, no separate task |
| **Name a `pincode_city_map` owner** | Scope is known — Delhi, Gurugram, Faridabad, Noida, Ghaziabad ([0020](decisions/0020-ncr-launch-cities.md)) | **Seeded 2026-09-01** — 163 pincodes for the five cities. Sources and confidence in `apps/backend/database/seed-data/ncr-pincodes.js`; reconcile against India Post’s official directory before launch |

**Two sourcing paths, not one, split by data-availability rating in
[catalog-vendor-export-analysis.md](catalog-vendor-export-analysis.md):**

| | Electrical, Plumbing, Sanitaryware, Tiles | Hardware, Stone |
|---|---|---|
| Rated | **Good** | **Poor** |
| Source | Brand websites — Havells, Jaquar, Astral, Kajaria and similar publish full specs | **The client** — fragmented/unbranded stock and no standard catalog mean brand-site extraction structurally doesn't apply; the client's own listings are the source instead |
| Owner | Golden Abode team | Golden Abode team, requesting from the client |

Same seeding owner either way — only the source differs. Specs pulled from either source
are facts, free to use: dimensions, MPN, ratings, materials. **Brand-authored marketing
copy and product photography are the one thing to check permission on before reuse** —
`catalog-vendor-export-analysis.md` already assumed images are "brand-supplied where
permitted, otherwise sourced," which is exactly this case in practice.

**Sequencing: full seeding is a launch deliverable, not a build-phase one.** Current work is
schema, flows and the admin/vendor tooling — those don't need 4,000–6,000 real rows to
build or test against, a small representative sample per category is enough. The real
catalog — brand-site pulls for the four Good categories, client-supplied data for Hardware
and Stone — gets populated as launch approaches, using the tooling built in the meantime
(Phase 3's generated import templates). Whether Hardware/Stone launch alongside the other
four or follow once the client's data arrives is a timing call, not a blocker on anything
being built right now.

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

> [!NOTE]
> **Status (2026-09-01): Phase 6 COMPLETE — 6a, 6b, 6c, 6e, 6f, 6g and 6h all done and verified live.**
> 6c–6h were briefly skipped on 2026-08-26 to pull Phase 7 forward, and resumed on
> 2026-09-01 per [0021](decisions/0021-search-runtime-build-plan.md), which records the
> build order and the three design-doc corrections found by actually running Meilisearch
> (document ID separator, `disableOnNumbers` version requirement, one-directional synonyms).
> See [catalog-implementation-status.md](catalog-implementation-status.md).

Only useful once products *and* listings exist, so it genuinely follows Phase 4.

Engine decided in [0017](decisions/0017-search-engine-choice.md): **Meilisearch**,
self-hosted on Railway, with the Postgres path kept permanently — not just as a fallback,
but as **admin's primary search path** ([0019](decisions/0019-search-followups.md)).
Document shape — one per `(product, city)` — decided in
[0018](decisions/0018-city-scoped-search.md); location resolution refined in
[0019](decisions/0019-search-followups.md). Launch scope is **Delhi NCR as five separate
cities** — Delhi, Gurugram, Faridabad, Noida, Ghaziabad — decided in
[0020](decisions/0020-ncr-launch-cities.md). Architecture in
[search-system-design.md](search-system-design.md); DDL in [search-schema.sql](search-schema.sql)
and the Geography section of [catalog-schema.sql](catalog-schema.sql).

```
6a  geography            city (seed: 5 NCR areas, 0020), pincode_city_map
                         (NCR pincodes only), vendors.city_id
                         (0018 — a real migration on an existing table)
                         resolve_city() combines pincode + coordinates,
                         coordinates win on disagreement (0019)
                         BLOCKS 6c, 6e, 6f

6b  document shape       DECIDED (0018) — (product, city), id `{product}__{city}`
                         SearchDocument lands in packages/types

6c  postgres path        pg_trgm on name + GIN on attributes_flat,
                         filtered by resolved city_id
                         → ships first; then DOUBLE DUTY (0019):
                           outage fallback AND admin's primary search,
                           since a draft product has no listing, so no
                           document, so nothing for Meilisearch to find

6d  sync plumbing        search_outbox + 3 trigger functions
                         + 26 statement-level triggers
                         expansion / drain / purge / backlog view

6e  meilisearch           Railway service, private networking
                         index settings AS CODE, applied on boot
                         typoTolerance.disableOnNumbers = true
                         synonyms: admin-editable table (0019)

6f  worker               BullMQ on the existing Redis
                         expand → EXISTS-check pairs → add/delete → mark processed

6g  query layer          SearchModule, city resolved BEFORE any query,
                         facets per leaf category, Redis cache, fallback switch.
                         /search/suggest issues a NARROWER key so the client
                         can hit Meilisearch directly for autocomplete (0019)

6h  rebuild job          shadow index + atomic swap, for 'all'
```

Three sequencing notes:

- **6a is the new long pole.** Unlike the rest of this catalog's design work, it is not
  docs-only — `vendors.city_id` is a migration on a table already running in production.
  Everything from 6c onward assumes it exists.
- **6c is not throwaway, and now has two permanent jobs, not one.** It ships as the search
  implementation, then stays as (a) the fallback that keeps the site up when Meilisearch is
  down or mid-rebuild, and (b) admin's primary search path from day one — not a temporary
  stand-in, since Meilisearch structurally cannot represent a draft product with no listing
  yet. Needs test coverage for both reasons; a fallback nobody exercises is not a fallback.
- **`search-architecture.md` is superseded on the tool choice and on the document shape.**
  Both are now decided (0017, 0018) — see that file's banner for the current sources of
  truth.

---

## Phase 7 — Integrity hardening

> [!NOTE]
> **Done as of 2026-08-26, except risk 4 (still blocked on the ordering domain).** Pulled
> forward ahead of Phase 6's search runtime at explicit request. See
> [catalog-implementation-status.md](catalog-implementation-status.md#phase-7-integrity-hardening--done-except-risk-4)
> and the updated [catalog-integrity-residual-risks.md](catalog-integrity-residual-risks.md)
> for what shipped, real bugs found, and test counts.

```
price-outlier flag              ✅ done — cheap, catches most wrong matches
catalog-edit re-validation      ✅ done — reuses catalog_reindex_queue
brand dedup / alias table       ✅ done — risk 1
candidate-choice confirm UI     ✅ done — risk 2 — the one that compounds
required variant attrs          ✅ done — risk 3
customer report path            ⛔ blocked — risk 4 — needs the ordering domain
```

---

## Dependency summary

| Phase | Blocked by | Blocks | Status (2026-08-26) |
|---|---|---|---|
| 0 | — | everything | Owner assigned, sourcing decided |
| 1 | 0 | seeding, all catalog work | ✅ Done |
| 2 | 1 | manual entry, import | ✅ Done |
| 3 | 2 | bulk seeding | ✅ Done |
| 4 | 2 + a real catalog | vendor onboarding, search | ✅ Done |
| 5 | 1, partly parallel with 4 | Paint and Stone launch | ✅ Done |
| 6a/6b | 4 | 6c–6h | ✅ Done |
| 6c/6e–6h | 6a/6b | customer-facing browse | ⏸️ Skipped for now, not blocked |
| 7 | 4 | nothing — hardening | ✅ Done except risk 4 (⛔ needs ordering domain) |

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
