# Catalog Implementation Status

**As of 2026-09-01.** What is actually built and verified against a live database, what
remains, and what is deliberately out of scope. [catalog-build-order.md](catalog-build-order.md)
is the plan; this is the as-built record, and gets updated as phases land — it does not
replace the build order, it reports against it.

Verification standard used throughout: every migration, trigger, and service method listed
"done" below was exercised against **real Postgres 16, Redis 7 and Meilisearch v1.53.1** (constraint violations
provoked on purpose, not just "it compiled"), not assumed correct from code review. See
[Testing approach](#testing-approach) at the bottom for how that continues from here.

---

## Status at a glance

| Phase | What | Status |
|---|---|---|
| 0 | Seeding ownership, sourcing paths | Owner assigned; sourcing split decided ([catalog-vendor-export-analysis.md](catalog-vendor-export-analysis.md)) |
| 1 | Taxonomy foundation | ✅ Done — migrations **and** seeders (58 leaves, 242 attributes, 930 enum options) |
| 2 | Master catalog + identity/dedup triggers | ✅ Done |
| 3 | Admin catalog import (Excel) | ✅ Done |
| 4 | Vendor listings, inventory, match ladder, export/import | ✅ Done |
| 5 | Paint colour-family pricing, Stone grade listings | ✅ Done |
| 6a/6b | Geography (city, pincode map) + search document shape | ✅ Done — 163 NCR pincodes seeded across the 5 launch cities |
| 6c | Postgres search path (also admin search + outage fallback) | ✅ Done — 5/5 |
| 6e | Meilisearch client, index settings as code, boot bootstrap | ✅ Done — 12/12 |
| 6f | BullMQ outbox drain worker | ✅ Done — 18/18 |
| 6g | Query layer, controller, fallback switch | ✅ Done |
| 6h | Shadow-index rebuild + atomic swap | ✅ Done — 6g+6h verified together, 46/46 |
| 7 | Integrity hardening (risks 1–3, price outlier, edit re-validation) | ✅ Done |
| 7 · risk 4 | Customer report path | ⛔ Blocked — needs the ordering domain, which doesn't exist yet |

---

## Phases 1–5: built

Taxonomy (8 top-level → 58 leaf categories, 153 attributes), master catalog with
`attributes_flat`/`identity_hash` trigger maintenance, admin Excel import/export, the full
vendor side (listings, inventory, warehouses, the 7-step vendor match ladder, scoped
export/import, admin review queue), and category specifics (paint colour-family pricing,
stone grade listings) are all built per [catalog-build-order.md](catalog-build-order.md)
Phases 1–5 and match their design decisions (0001–0016).

Real bugs found and fixed while building these (live-Postgres testing catching what code
review didn't):

- **`Sequelize.NOW` / `Sequelize.UUIDV4` as a model/migration `defaultValue`** is
  client-side-only — invisible to raw SQL inserts, including DB triggers. Recurred across
  several tables; fixed with `Sequelize.literal('CURRENT_TIMESTAMP')` /
  `Sequelize.literal('gen_random_uuid()')` each time it was found.
- **`vendor_product_map` was keyed on the wrong field** — `productRef` (whatever free text
  identified a product on one particular upload) instead of `vendorSku` (the vendor's own
  persistent code). This defeated the entire point of "teach the matcher": a manual
  resolution never actually helped a future upload using the vendor's real SKU. Fixed by
  threading a `vendorMapKey` (`vendorSku ?? productRef`) consistently through the match
  ladder and every resolution path.
- **`MasterProduct.productCode`'s default was unreachable** — `allowNull: false` with no
  `defaultValue` meant Sequelize's own validation rejected creates before reaching Postgres.
  Fixed with `defaultValue: literal("'GA-' || LPAD(nextval('master_product_code_seq')::text, 7, '0')")`.
- **exceljs phantom-row materialization** — applying `dataValidation` to a wide row range
  (2000 rows) forced exceljs to materialize all of them, corrupting reported row numbers on
  upload. Fixed by shrinking the template to 300 rows.

---

## Phase 6: complete

**Built (6a/6b):** `city` table seeded with exactly the 5 launch cities (Delhi, Gurugram,
Faridabad, Noida, Ghaziabad — decision [0020](decisions/0020-ncr-launch-cities.md)),
`pincode_city_map`, `vendors.city_id`, `CityResolverService` (pincode + GPS combined,
coordinates win on disagreement per decision
[0019](decisions/0019-search-followups.md)), the `search_outbox` table and its trigger
functions, and the `SearchDocument` type shape (decision
[0018](decisions/0018-city-scoped-search.md)).

**Real bug found and fixed:** [search-schema.sql](search-schema.sql)'s own documented DDL
for 5 fan-out triggers (brand, category, stone_variety, city, vendors) combines statement-
level transition tables with `UPDATE OF <column-list>` — Postgres rejects this outright
("transition tables cannot be specified for triggers with column lists"). This was a bug in
the design doc itself, never previously run against real Postgres. Fixed with a 4th trigger
function (`enqueue_search_outbox_row()`) using row-level `OLD`/`NEW` for just those 5
triggers.

### Phase 6 search runtime: skipped mid-phase, then completed

At the user's explicit request ("can we skip this Meilisearch/worker/query layer and harden
the integrity?"), the remaining sub-phases were **not built** and Phase 7 was pulled forward
instead:

- 6c — Postgres search path (pg_trgm + GIN, also admin's permanent primary search path per
  decision 0019)
- 6e — Meilisearch container on Railway
- 6f — BullMQ worker draining `search_outbox`
- 6g — query layer (`SearchModule`, facets, Redis cache, fallback switch)
- 6h — shadow-index rebuild job

None of this was abandoned — the schema and sync triggers it depends on (6a/6b) are in place
and tested. Nothing in Phase 7 depended on them.

**Resumed 2026-09-01.** Build plan and sequencing recorded in
[0021](decisions/0021-search-runtime-build-plan.md): built against a **local Meilisearch
container** rather than Railway (no Railway project exists yet, and nothing in the
application code is Railway-specific), in the order 6c → 6e → 6f → 6g → 6h, each verified
live before the next begins.

**All of 6c, 6e, 6f, 6g and 6h are done and verified** (5/5, 12/12, 18/18, and 46/46 for
6g+6h together). See [search-runtime-build-log.md](search-runtime-build-log.md) for the ten
defects found while building — two of which would have reached production: the application
could not boot at all, and Meilisearch indexing failures were being silently swallowed.

`WORKER_MODE` (`all` | `api` | `worker`) is now real configuration, so splitting the search
worker onto its own service is an env var rather than a refactor.

---

## Phase 7: integrity hardening — done (except risk 4)

Built against [catalog-integrity-residual-risks.md](catalog-integrity-residual-risks.md) —
see that file for the original risk analysis, now updated with implementation status per
item.

| # | Risk / item | Built | Verified live |
|---|---|---|---|
| 1 | Duplicate brand rows defeat dedup | `normalize_brand_name()` SQL function + unique functional index + `brand_alias` table + `BrandResolverService` | 6/6 ✅ |
| 2 | Vendor confirms wrong match, permanently | `matchCandidates` surfaced on listings; `choosePendingListingCandidate` re-points `vendor_product_map` at the **chosen** product, not the original guess | 12/12 ✅ (E2E) |
| 3 | Blank variant attributes bypass identity_hash | `trg_mp_require_variant_attrs_on_publish` — blocks publish, names the specific missing attribute, scoped to identity-hash-dependent products only (branded products unaffected) | 4/4 ✅ |
| — | Price-outlier flag | `vendor_listing_price_outliers` view, median-based within `(product, grade)` groups, flags >3x or <⅓x, flag-for-review not auto-unpublish | 3/3 ✅ |
| — | Catalog-edit re-validation | `vendor_listing_flag` table + `flag_listings_on_variant_attr_edit` trigger, fires on live-product variant-attribute edits only | 5/5 ✅ |
| — | Brand resolver × match ladder integration | — | 3/3 ✅ |

**37 live-Postgres checks total**, all passing, all scratch data cleaned up afterward.

Real bugs found and fixed while building Phase 7:

- **`brand_alias.id` and `vendor_listing_flag.id`** used the client-side `UUIDV4` default —
  invisible to the DB-side triggers that actually write those tables. Same bug class as
  Phases 1–5, fixed the same way.
- **`ROUND(double precision, integer)` doesn't exist in Postgres** — `percentile_cont()`
  returns `double precision`, and the price-outlier view's `ROUND(price / NULLIF(median, 0), 2)`
  failed outright. Fixed with an explicit `::numeric` cast.
- **`VendorListingFlag` Sequelize model was missing entirely** — the migration for
  `vendor_listing_flag` was written, but the corresponding model was forgotten. Caught before
  it caused a runtime gap.

### Risk 4: customer report path — out of scope

Not started. Blocked on the ordering domain (`orders`, `order_items`), which does not exist
in this codebase yet — there is no order line to attach a report to. When the ordering
domain lands, revisit [catalog-integrity-residual-risks.md](catalog-integrity-residual-risks.md#4-no-customer-report-path)
for the sketched fix — critically, a report must invalidate the `vendor_product_map` entry
that produced the wrong listing, not just flag the order, or risk 2's fix silently
re-applies the same mistake on the vendor's next upload.

---

## Testing approach

A 25-test Jest integration suite exists (`apps/backend/src/modules/catalog/__tests__/`,
real Postgres via `golden_abode_test`), covering the match ladder, `attributes_flat`/
`identity_hash` triggers, and the `vendor_product_map` key fix. **That suite is frozen by
explicit instruction** — protected from regression and fixed if later changes break it, but
no new `.spec.ts` files are added going forward.

All verification from Phase 4 onward past that point (including all of Phase 7) used
**manual, throwaway checks instead**: SQL run directly via `docker exec ... psql -f`, or
one-off Node.js scripts against the compiled `dist/` for HTTP/E2E-shaped checks. Each script
was deleted and its test rows cleaned from the dev database immediately after the check
passed — nothing scratch is left committed or lying around. This is a deliberate,
user-directed choice, not a gap: automated coverage stops growing, manual verification
against live Postgres continues for everything new.

### A verification failure worth recording (2026-09-01)

Phase 7's closing report claimed "25/25 tests passing, both databases clean, build/lint
green." **That claim was not verified when it was made.** The `golden-abode-postgres`
container had stopped (2026-08-30 14:41); the report was replayed from a summary of earlier
work rather than freshly executed, and presented as a live result.

When actually re-run on 2026-09-01, all 25 tests **failed** — with
`SequelizeConnectionRefusedError: connect ECONNREFUSED 127.0.0.1:5432`, i.e. purely because
no database was listening. The container had been created without a published host port and
`docker start` cannot add one; recreating it via `docker compose up -d` (the compose file
already declared `5432:5432` correctly) fixed it, and the named volume preserved all data.
The suite then passed 25/25 genuinely.

**Phase 7's underlying work was never in question** — it was built and verified live
between 2026-08-26 and 08-30 while the container was running. What failed was the reporting
discipline, not the code.

The rule this establishes, worth quoting back:

> **Never report a test, migration or database result that was not executed in the current
> session.** A remembered or summarized result is not a verification. If the check has not
> just been run, say so explicitly rather than restating a prior outcome as current.

### A second gap, found 2026-09-01: nothing was booting the application

While building 6g, the real application turned out to be **unable to start at all** — and
had been since Phase 6a added `vendors.city_id` several days earlier. `Vendor` declared
`@BelongsTo(() => City)` while `City` was absent from `DatabaseModule`'s eager model list, so
every boot failed with `City has not been defined` and retried forever.

`nest build` passed. `eslint` passed. All 25 Jest tests passed. None of them start the
application — the suites construct their own Sequelize instance from `test-db.ts`, which
registers every model in one explicit list, so the broken ordering never occurred there.

The rule that follows:

> **A green build and a green test suite do not mean the application runs.** Boot it. Any
> phase that adds a model, an association, a module, or a queue must include starting the
> real app once and confirming it reaches "Nest application successfully started" — and,
> where the phase adds routes, that they appear in the route table.

Full detail, plus the seven other defects found in the same pass, is in
[search-runtime-build-log.md](search-runtime-build-log.md).

---

## What's next

No phase is currently in progress. In rough order of what unblocks the most:

1. **Resume Phase 6's search runtime** (6c/6e–6h) whenever customer-facing browse/search is
   next — the schema it depends on is already built and tested.
2. **Real catalog seeding** (Phase 0's business track) — schema and tooling support it now;
   this was always meant to run in parallel with build phases, not after them.
3. **Risk 4** once the ordering domain exists.

See [catalog-build-order.md](catalog-build-order.md) for the full dependency graph.

---

## Seed data (2026-09-01)

Until this date the schema was complete but **empty** — zero categories, zero attributes,
zero units of measure. Everything downstream worked but had nothing to work on. Two seeders
closed that.

### Phase 1 taxonomy — `20260901100000-seed-taxonomy.js`

A correction to this document's own earlier reporting: **Phase 1 had been recorded as "done"
when only its migrations were.** The seeders it explicitly calls for ("8 top-level → 58 leaf
categories, 153 attributes, enum value options") had never been written. The tables existed
and were empty.

Data lives in `apps/backend/database/seed-data/taxonomy.js`, transcribed from
[catalog-structure.md](catalog-structure.md), which stays the source of truth.

| | Seeded | Spec |
|---|---|---|
| Leaf categories | **58** | 58 ✓ |
| Top-level categories | **8** | 8 ✓ |
| Total category nodes | 71 | 58 leaves + 13 non-leaf |
| Attributes | 242 | doc estimates "153" — see below |
| Global attributes (`category_id IS NULL`) | 2 | 2 ✓ |
| Enum value options | 930 | — |
| Units of measure | 10 | — |

The attribute count exceeds the doc's "153" because that figure appears to be an estimate;
the per-category counts all match the doc's own summary table exactly (Tiles declares 12,
Lights 7, Paint 6, Stone 6, Fasteners 5, Sanitaryware 1, and so on). The seeded tree is the
faithful transcription — the estimate is what is stale.

All three of `catalog-structure.md`'s **findings** are honoured: global attributes use a NULL
`category_id` rather than a phantom root (finding 1); brand, HSN, country of origin and
packaging quantities are columns and are not seeded as attributes (finding 2); stone variety
is `master_product.stone_variety_id`, not an attribute (finding 3).

### NCR pincodes — `20260901100001-seed-ncr-pincodes.js`

Closes the "who sources it and seeds it" half of
[0018](decisions/0018-city-scoped-search.md) open question 3, which
[0020](decisions/0020-ncr-launch-cities.md) had narrowed but left unowned.

**163 pincodes**: Delhi 96, Noida 19 (Greater Noida included, per 0020), Gurugram 18,
Ghaziabad 16, Faridabad 14.

Scoped to the five **cities**, not their administrative districts — 0020 says "just the
pincodes for these five named areas." Gurugram district now reaches Nuh/Mewat 40–80 km away,
Faridabad district reaches Palwal and Hodal, Gautam Buddha Nagar reaches Jewar; all
deliberately excluded, and the exclusion is asserted in the verification rather than assumed.

Sources and per-city confidence are recorded inline in
`apps/backend/database/seed-data/ncr-pincodes.js`. In short: Gurugram and Ghaziabad were
cross-checked against the official district government pages; Delhi is seeded as the
contiguous 110001–110096 block rather than from a per-post-office list, which is right in
aggregate but may include a few unused codes. **Before launch this should be reconciled
against India Post's official All-India Pincode Directory**, which was not available as a
direct download.

### Verification

**33 live checks, 0 failures**, including two end-to-end through the running application:
the real `/api/search` endpoint resolving `110001` → Delhi and `122001` → Gurugram, and a
product attaching to the seeded `electrical/switchgear/mcb` leaf. Inheritance was checked at
its deepest (`hardware/fasteners/screws` inheriting all five Fastener attributes plus its own
three) and negatively (MCB does not pick up Tiles attributes). Enum ordering, per-category
units of measure (putty in KG not litres, stone in SQFT, wire in MTR), and the district
exclusions were all asserted.

Both seeders are **idempotent** — keyed on natural keys (`uom.code`, `category.path`,
`attribute.code`, `(attribute_id, value)`, `pincode`) — so re-running corrects rather than
duplicates. That matters because the taxonomy is the thing most likely to be re-run as it is
refined.

---

## Admin panel — catalog screens (2026-09-01)

The backend had been operable only through `psql` and Swagger: the admin panel shipped with
Login, Dashboard, Users and Approvals, and none of the catalog surfaces Phases 2–4 assume.

### Backend added

`AdminCatalogController` / `AdminCatalogService` at `/api/admin/catalog` — the read-and-publish
surface the panel needs, which did not previously exist:

| Endpoint | Purpose |
|---|---|
| `GET /categories` | Full tree, 8 roots → 58 leaves, with per-node product counts |
| `GET /categories/:id/attributes` | Effective attribute set — own + inherited + global, each tagged with its scope and the ancestor it came from |
| `GET /products` | List across every status, filtered by search / category subtree / status |
| `GET /products/:id` | Detail with attribute values and live listing count |
| `PATCH /products/:id/publish` · `/unpublish` | draft ⇄ live |

Reads Postgres directly rather than the search index, because drafts have no listing and
therefore no search document — Meilisearch structurally cannot represent them (0019).
Product search uses `word_similarity` for the same reason the search path does, plus exact
matching on product code, MPN and GTIN.

**Publish surfaces the Phase 7 risk-3 guard properly.** The required-variant-attributes
trigger raises a plain SQL exception naming the missing attribute; the service catches it and
returns a **400 with that message** rather than a 500, so an admin is told which field to fill
in. Verified: a generic product with blank variant attributes is refused, with the attribute
named.

**Deliberately not built: product create/edit.** Bulk seeding goes through the generated Excel
templates and vendor-requested products come through the review queue, so a single-product
form is a useful later addition for corrections rather than a prerequisite for operating the
catalog.

### Frontend added

Four pages under a new **Catalog** nav section, built on the existing conventions (React
Query hooks, CSS modules, the shared stylesheet's classes, the `services/` + `queries/` split)
— no new dependencies:

- **Products** — search, category-subtree and status filters, a detail modal, publish/withdraw.
- **Categories** — expandable tree with a side panel showing the effective attribute set,
  each attribute badged `own` / `inherited` / `global`, variant-defining ones marked, enum
  options listed. It shows exactly what an import template for that category will contain.
- **Import** — the three-step flow: pick a leaf → download the generated `.xlsx` → upload and
  see per-row errors in a table. Only leaves are offered, since a product cannot attach to a
  group.
- **Review queue** — ranked candidates per unmatched row with the vendor's raw input shown
  alongside, link-to-product or reject. Candidates rather than a single confirm button is the
  point (risk 2).

Two helpers were added to `apiClient.ts`: `uploadRequest` (multipart, deliberately leaving
`Content-Type` unset so the browser generates the boundary) and `downloadRequest` (blob +
`Content-Disposition` filename).

### Verification

**29 live checks, 0 failures**, through real HTTP with a real admin login — not service calls.
Covers auth (401 unauthenticated), the `{data}` response envelope the panel unwraps, tree
shape, attribute scoping, every product filter, publish/withdraw round trip, the blocked-publish
400, the review queue, and that the import template downloads as a genuine `.xlsx` (PK zip
header + `Content-Disposition`). An earlier 27-check pass at the service layer covered the
same logic before HTTP was involved.

**One harness bug worth recording:** the first run reported 14 failures because the test built
the Nest app without `ResponseInterceptor`, which `main.ts` registers globally. Responses came
back unwrapped — exactly what the admin panel's `getRequest` would choke on. The endpoints were
correct; the harness was not. Any future HTTP-level test of this API must register that
interceptor or it will assert against the wrong shape.

`pnpm smoke` now also asserts the four new catalog routes are mapped.

**Pre-existing lint debt noted, not fixed:** `npm run lint` in `apps/admin` fails on files
untouched by this work (`store/useAuthStore.ts`, `utils/phone.ts`, `utils/index.ts`) — Prettier
formatting only. The new files lint clean; those were left alone rather than folding unrelated
churn into this change.
