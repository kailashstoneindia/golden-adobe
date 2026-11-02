# 0053 — Vendor single-listing creation

- **Date:** 2026-11-02
- **Status:** Implemented (`c76bb64`, review fixes in `327c8b7`)
- **Supersedes / Superseded by:** —

## Context

[0037](0037-phase-2-remaining-work-plan.md) Batch 2 named this as the one real operability gap
left in Phase 2: a vendor with one new product to list has no way to do it except building and
uploading a whole Excel sheet through the bulk import pipeline
(`vendor-catalog-import.controller.ts`, `vendor-catalog-import.service.ts`). `VendorListingsController`
(`apps/backend/src/modules/catalog/vendor-listings.controller.ts`) today only has `GET` (list),
`PATCH :id/stock`, `PATCH :id/status`, and `POST stock/bulk` — read and update, no create.

The bulk-import pipeline's matching logic (`VendorMatchLadderService`) exists to solve a problem
this endpoint does not have: turning **ambiguous free text** typed into a spreadsheet cell
(a GTIN, an MPN, a plain product name) into a specific `master_product` row, with five fallback
steps and an admin review queue for anything uncertain. A vendor calling a dedicated API to list
one product does not need that machinery — they can be shown real catalog products and pick one
by id directly. Building this as "a one-row version of the bulk importer" would import all of
that ambiguity-resolution complexity for a case that does not have the ambiguity to resolve.

Two things a vendor needs that do not exist today, found while researching this:

- **No way to find a `master_product` id to list against.** No vendor-facing product
  search/browse endpoint exists anywhere in the catalog module (confirmed: the only controllers
  under `apps/backend/src/modules/catalog/` are `admin/*`, `vendor/listings`,
  `vendor/catalog-import`, `internal/media` — nothing a vendor can search by name/code/category).
  The customer-facing search (Meilisearch, [0017](0017-search-engine-choice.md)) is city- and
  listing-scoped — it is built to show products that already have a vendor behind them in a
  city, the opposite of what's needed here (showing products that do *not* yet have this
  vendor's listing).
- **No enforcement tying listing creation to `vendor_category`.** The only place
  `VendorCategoriesService.assertExportScopeAllowed` is called today is the export flow
  (`vendor-catalog-import.controller.ts:67,86`). Nothing stops a vendor from creating a listing
  in a category they've never registered for — including via the existing bulk-import path,
  which also never calls it. This record's new endpoint inherits that same gap unless addressed
  (see Decision item 3).

## Options considered

### How a vendor identifies which product to list

#### Option A — New vendor-facing "browse catalog" search endpoint, then create by id

- **Pro:** Clean separation: searching the catalog and creating a listing are different
  operations with different shapes (search returns many lightweight rows; create takes one exact
  id). Reusable later for other vendor-facing needs (e.g., "what am I not selling yet in my
  registered categories" — not built here, but not precluded). No ambiguity to resolve, because
  the vendor picks from real rows they can see, by id — the two inputs the bulk path treats as
  uncertain (name text, codes) are replaced by direct selection.
- **Con:** A second new endpoint beyond the create endpoint itself — more surface area for one
  record.

#### Option B — Reuse `VendorMatchLadderService`, vendor types a product reference, system guesses

- **Pro:** Reuses existing, tested matching code; no new search endpoint.
- **Con:** Imports exactly the complexity this record's Context section says doesn't belong here
  — a confident single-listing create becomes "type something and hope the fuzzy matcher finds
  it," with the same needs_review/pending_confirmation states the bulk path has, for a UX that's
  supposed to be simpler than bulk upload, not equally uncertain. Rejected: this is solving a
  problem (ambiguous text) the single-listing case does not have.

**Decision: Option A.**

### Whether to enforce `vendor_category` registration on create

#### Option A — Enforce now, same rule as export

- **Pro:** Consistent with the one existing precedent in this codebase
  (`assertExportScopeAllowed`) for what "a vendor is allowed to touch this category" means.
- **Con:** Every vendor currently has zero `vendor_category` rows
  ([backfill still outstanding](../../docs/decisions/0037-phase-2-remaining-work-plan.md) — see
  also this session's own research confirming it's parked, not forgotten). The export flow's
  answer to this exact problem was a deliberate "empty set = unrestricted" fallback
  (`vendor-categories.service.ts:87-96`) specifically so turning the check on wouldn't instantly
  break every vendor. The same fallback would apply here with the same effect: a no-op check
  until the backfill happens.

#### Option B — Reuse the exact same `assertExportScopeAllowed` fallback behavior, don't invent a stricter rule here

- **Pro:** One enforcement rule for "is this vendor allowed to act on this category," reused
  verbatim, rather than a second, differently-behaved copy for creation. When the backfill
  eventually happens and export enforcement tightens (the TODO in `vendor-categories.service.ts:92`),
  listing creation tightens with it automatically, for free — no second TODO to remember.
- **Con:** None beyond Option A's — this is the same fallback, applied consistently.

**Decision: Option B** — call `assertExportScopeAllowed` on create, exactly as export already
does. This is not "skip enforcement"; it's "use the one enforcement rule this codebase already
has for this exact question," which today evaluates to unrestricted for every vendor (same as
export), and will tighten for both call sites the moment the backfill lands.

### Whether `POST` targets an existing `master_product` only, or can also create a new catalog product

#### Option A — Attach-only: the endpoint requires an existing `master_product_id`; a vendor with a genuinely new product uses the existing review-queue path (needs_review via bulk upload with no match, or a direct request to admin)

- **Pro:** Keeps this endpoint's scope to exactly what 0037 named: "a vendor adding one new
  LISTING outside a bulk sheet," not "a vendor adding one new CATALOG PRODUCT outside a bulk
  sheet." Catalog product creation (dedup, identity hash, attribute validation, leaf-category
  enforcement, brand resolution) is a materially bigger surface — decisions
  [0012](0012-product-identity-and-deduplication.md)/[0013](0013-identity-hash-for-unbranded-products.md)
  exist specifically because getting this wrong fragments the catalog. The existing "no match ->
  needs_review, empty candidates -> new product request" path (`vendor-catalog-import.service.ts:163-181`)
  already covers "this product doesn't exist yet," routed to admin, which is the correct owner of
  catalog-product creation per 0011 section 6 (admin is "a data-steward decision").
- **Con:** A vendor whose product is 100% new still has no single-call path — they'd fall back to
  a one-row bulk upload for that case specifically, which is mildly inconsistent (two different
  flows depending on whether the product exists yet).

#### Option B — Let the endpoint also create a new `master_product` inline when no id is given

- **Pro:** One endpoint handles both cases.
- **Con:** Vendors do not supply catalog specs (decision 0009's "vendors supply price/stock,
  never specs" is the entire reason the vendor upload template has no spec columns — see
  `vendor-catalog-export.service.ts`'s own header comment). A vendor-callable "create a
  master_product" endpoint would need to either accept un-vetted catalog data from a vendor
  (contradicts 0009) or silently create a thin/incomplete product row, neither of which this
  record should decide as a side effect of closing an unrelated gap.

**Decision: Option A.** Explicitly out of scope here; the existing needs_review path already
owns "this product doesn't exist in the catalog yet."

## Decision

> 1. **New read endpoint**: `GET /vendor/catalog/products` — vendor-facing catalog search/browse,
>    separate from `VendorListingsController` (which is listings, not the catalog). Query params:
>    `q` (name/product_code substring, via `pg_trgm` similarity or plain `ILIKE` — implementer's
>    call, not designed here, since this is a read-only convenience search with no matching
>    stakes), `categoryId` (leaf only), paginated (`page`/`limit`, same shape as
>    `ListVendorListingsQueryDto`). Returns `status = 'live'` products only — a vendor should not
>    be able to list against a draft/pending_review/deprecated product
>    (`MasterProductStatus`, `master-product.model.ts:25-30`). Response: id, name, productCode,
>    brand name, category path, saleUnitType (so the UI can warn "this is paint, priced by colour
>    family" before the vendor tries to set a flat price) — enough to identify the right row
>    without pulling full admin-catalog detail.
>    **Does NOT** show whether the vendor already has a listing against each product — see Open
>    Questions.
> 2. **New write endpoint**: `POST /vendor/listings` on the existing `VendorListingsController`.
>    New DTO `CreateVendorListingDto`:
>    ```ts
>    {
>      masterProductId: string;       // @IsUUID — must be an existing, live master_product
>      price: number;                 // @IsNumber, same QUANTITY_CONSTRAINTS-style decimal rules as SetStockDto, @Min(0)
>      mrp?: number;                  // optional, same validation, @Min(0)
>      minOrderQty?: number;          // optional, defaults to 1 (matches vendor_listing column default)
>      statedGrade?: string;          // optional, @MaxLength(64) (matches column)
>      vendorSku?: string;            // optional, @MaxLength(64) (matches column)
>      initialQuantityAvailable?: number; // optional — if given, also writes the inventory row in the same call (skip the extra PATCH stock/:id round-trip); same decimal rules as SetStockDto. Omitted for paint, see below.
>    }
>    ```
> 3. **New service method** `VendorListingsService.createListing(vendorId, dto)` (a new service —
>    see Workstream note below on why not `StockService`):
>    - Looks up the `master_product` by id; 404 if missing, 400 if `status !== 'live'` (naming
>      the actual status, same style as other validation messages in this module).
>    - Calls `VendorCategoriesService.assertExportScopeAllowed(vendorId, [masterProduct.categoryId])`
>      — reusing the exact method name/behavior for symmetry even though "export scope" reads
>      oddly for a create path; renaming it is a separate, cosmetic change not bundled into this
>      record (see Open Questions).
>    - Rejects (400) if `statedGrade` is provided for a non-stone product the same way the import
>      path implicitly allows it for any category — **not** adding a stone-only restriction here
>      that the bulk path doesn't already enforce; consistency with existing behavior over a new
>      rule invented for this endpoint alone.
>    - Creates the `vendor_listing` row via the Sequelize model (`VendorListing.create`, not raw
>      SQL) so the `enqueue_search_outbox_for_listing()` INSERT trigger fires normally — no manual
>      outbox write needed.
>    - Relies on the existing `vendor_listing_unique` partial index
>      (`(vendor_id, master_product_id, COALESCE(stated_grade, ''))`) to reject a true duplicate;
>      catches the resulting unique-violation and translates it to a 409 naming the existing
>      listing id, rather than a raw Postgres constraint error — same translation pattern this
>      module already uses for other constraint-backed rejections (e.g. `admin-vendors.controller.ts`'s
>      404-vs-403 convention, applied here to a different constraint).
>    - Sets `status: VendorListingStatus.ACTIVE` always — there is no ambiguous match here to
>      pause pending confirmation (that mechanism exists for the bulk path's uncertain matches
>      only); a vendor who explicitly picked a `master_product_id` from the search results has
>      already confirmed it by construction.
>    - **Paint (`saleUnitType === TINTED_TO_ORDER`)**: rejects `initialQuantityAvailable` with 400
>      if given (decisions 0007/0014 — paint carries no inventory row; mirrors
>      `StockService.assertNotPaint`'s existing rejection message style) and sets
>      `supportsTinting: true` on the created row. Does **not** accept colour-family prices in
>      this call — a vendor wanting to set per-colour pricing uses the already-existing colour
>      price path (`VendorListingColourPriceModel`, via whatever endpoint currently writes it) in
>      a follow-up call, exactly as the bulk-import path treats colour pricing as a second,
>      separate write (`vendor-catalog-import.service.ts:259-277`). Not re-designing paint colour
>      pricing in this record.
>    - **Non-paint**: if `initialQuantityAvailable` given, writes it via the same
>      `INSERT ... ON CONFLICT (vendor_listing_id) WHERE warehouse_id IS NULL` upsert
>      `StockService.setStock` already uses — call `StockService`'s existing method (inject
>      `StockService` into the new service) rather than duplicating that SQL a third time.
> 4. **Workstream placement**: new file `vendor-listings.service.ts` (currently
>    `VendorListingsController` calls `StockService` directly with no intervening service of its
>    own) holding `createListing`; `StockService` keeps owning stock/status mutation exactly as
>    now. Splitting rather than adding `createListing` onto `StockService` because `StockService`'s
>    own header comment frames it specifically as "vendor's own stock screen" — creation is a
>    different responsibility (whether this listing should exist at all vs. what quantity an
>    existing one holds), and bolting it on blurs a file that's currently single-purpose.
>    `VendorListingsController`'s constructor gains `VendorListingsService` alongside its existing
>    `VendorsService`/`StockService`.
> 5. **Admin parity**: not building an admin-side equivalent in this record. The existing gap this
>    record closes is vendor-side only (0037 Batch 2's own framing); an admin already has the
>    bulk-import + review-queue tools for creating listings on a vendor's behalf if ever needed.

## Why

Treating this as "search, then create by id" rather than "run it through the match ladder" is the
load-bearing choice: the match ladder's entire design is resolving *uncertainty* about which
catalog product a piece of vendor-supplied free text refers to. A vendor using a dedicated
single-listing API has no free text to resolve — they can see real rows and click one. Routing
that through five ladder steps built for a different problem would reintroduce
needs_review/pending_confirmation states for a case that is, by construction, never ambiguous.

Reusing `assertExportScopeAllowed` rather than writing a second category-authorization check
keeps exactly one answer to "is this vendor allowed to touch this category" in the codebase. The
alternative — a stricter check here while export stays on the lenient fallback — would mean a
vendor could legitimately create a listing in a category they can't legally *export*, which is a
strange asymmetry to explain later. Reuse means both call sites move together when the backfill
(0037 Batch 3 item 4, confirmed parked by the user) eventually lands.

Scoping out new-catalog-product creation (Option A of that sub-decision) follows directly from
decision 0009: vendors supply commercial terms, never catalog specification. An endpoint that let
a vendor's `POST` silently originate a new `master_product` row would be the first place in this
codebase where that boundary quietly moved, and it should not move as a side effect of an
unrelated gap-closing record.

## Consequences

- Two new endpoints (one read, one write) plus one new service file — larger than a typical
  single-PR item in this project's pattern, but both pieces are required together: the write
  endpoint is unusable without a way to find a `masterProductId` to send it.
- Creating a listing via this endpoint and via the bulk-import path now share the exact same
  `vendor_listing_unique` constraint and the same category-scope gate, so neither path can
  produce a result the other considers invalid — no new inconsistency between the two listing
  creation surfaces.
- A vendor with a genuinely new (not-yet-cataloged) product still has no single-call path; they
  fall back to the one-row bulk upload (which routes to needs_review -> admin review queue) same
  as today. Unchanged by this record, not regressed.

## Open questions

- Whether the search endpoint should flag which results the vendor already has a listing against
  (so the UI can show "you already list this" inline rather than letting them discover it via the
  409). Leaning toward yes as a fast follow-on once this ships, not required for correctness — the
  409 already prevents the bad outcome, just later than ideal.
- Exact search strategy (`word_similarity` vs. plain `ILIKE '%...%'`) — resolved during
  implementation by reusing `AdminCatalogService.listProducts`'s existing `word_similarity` +
  exact-code pattern (now shared via `product-search-filter.util.ts`, see Implementation notes)
  rather than inventing a second strategy.

## Implementation notes (post-review fixes, same day)

A senior-level code review of the initial implementation (`c76bb64`) found five issues, all
addressed before this record's status moved to Implemented:

- **Endpoint path differs from the Decision section above.** Built as
  `GET /vendor/listings/catalog-search` on the existing `VendorListingsController`, not a
  separate `GET /vendor/catalog/products` controller — simpler (one controller, already wired
  into `VendorsModule`) and avoids standing up a second controller for a single read route. The
  Decision section's text is left as originally written rather than silently edited, since this
  note is the accurate record of what shipped.
- **`createListing` is now transactional.** The listing INSERT and the optional initial-stock
  write happen inside one `sequelize.transaction()` (`VendorListingsService.createListing`,
  `StockService.setStock`/`getOne` now accept an optional `Transaction` parameter). Originally
  these were two separate statements — a stock-write failure after the listing already committed
  would have left an orphaned active listing with no stock row. Covered by a new regression test
  forcing the stock write to fail (a negative quantity hitting Postgres's own CHECK constraint,
  bypassing DTO validation by calling the service directly) and asserting the listing was rolled
  back too.
- **`createListing` now returns `VendorListingStockDto`, not the raw Sequelize model.** The raw
  model serialized DECIMAL columns (`price`, `mrp`, `minOrderQty`) as numeric strings, inconsistent
  with every other read path in this module (`StockService.listForVendor`/`getOne` already
  explicitly coerce with `Number(...)` for this exact reason). Fixed by having `createListing`
  call `StockService.getOne` (now public) inside the same transaction to build the response,
  reusing the existing row-to-DTO mapping instead of adding a third copy of it.
- **`assertExportScopeAllowed` renamed to `assertCategoryScopeAllowed`.** This was the "flagged,
  not resolved" open question above under its old wording — fixed rather than deferred, since the
  rename is zero-behavior-change and the old name's export-specific log line and error message
  ("...before exporting them") were actively wrong when hit from this record's create path. Both
  call sites (export's two routes, this record's create path) now share the corrected name and a
  scope-neutral log/error message.
- **`CreateVendorListingDto`'s quantity-decimal constraints now import `SetStockDto`'s, not
  redefine them.** `QUANTITY_CONSTRAINTS`/`MAX_QUANTITY` exported from `vendor-stock.dto.ts`,
  imported here — the file's own comment already claimed it "mirrors" `SetStockDto`'s rules; now
  it actually does, instead of carrying an independent copy that could silently drift.
- **Vendor and admin catalog search no longer duplicate the same SQL pattern.** Extracted
  `buildProductSearchClause()`/`productSearchOrderBy()` into `product-search-filter.util.ts`,
  used by both `VendorCatalogSearchService.search` and `AdminCatalogService.listProducts` — a
  fix to the ranking threshold or the exact-match columns now lands in one place for both.

## Sources

- [0037-phase-2-remaining-work-plan.md](0037-phase-2-remaining-work-plan.md) (Batch 2 — the item
  this record closes)
- `apps/backend/src/modules/catalog/vendor-listings.controller.ts`,
  `vendor-catalog-import.controller.ts`, `vendor-catalog-import.service.ts`,
  `vendor-match-ladder.service.ts`, `vendor-categories.service.ts`, `stock.service.ts`
- `apps/backend/src/modules/catalog/models/vendor-listing.model.ts`,
  `master-product.model.ts`
- `apps/backend/database/migrations/20260827090001-create-vendor-listing.js` (the
  `vendor_listing_unique` partial index), `20260828090004-*.js` (search-outbox triggers,
  confirming `vendor_listing` INSERT already enqueues reindexing with no extra code needed)
- [0007](0007-colour-family-pricing.md), [0009](0009-stone-price-list-model.md),
  [0011](0011-product-code-and-vendor-export.md), [0012](0012-product-identity-and-deduplication.md),
  [0013](0013-identity-hash-for-unbranded-products.md) — the catalog-identity decisions this
  record deliberately does not reopen by keeping listing creation attach-only
