# 0022 — Inventory write model: stock, status, and what a blank cell means

- **Date:** 2026-09-14
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

`inventory` shipped in Phase 4 with `quantity_available`, `quantity_reserved`, CHECK
constraints at `>= 0`, and a search-sync trigger. It had **never been written to by
anything** — no endpoint, no service, no import path. `vendor_listing` carries no stock
column at all, by design ([0014](0014-batch-resolutions.md) rejected adding one).

Meanwhile the vendor upload sheet has parsed `qty_available` and `status` into `ParsedRow`
and recorded both in the audit blob (`rowToJson`) since Phase 4, then **applied neither**. A
vendor filling in a quantity got no inventory row; a vendor typing `out_of_stock` got no
effect and no error telling them so.

So the table existed, the data arrived, and nothing connected them. Opening that path forces
four questions that the schema alone does not answer, and that
[phase-2-completion-plan.md](../phase-2-completion-plan.md) left open:

1. Stock and listing status can now contradict each other. Which wins?
2. What does an **absent** `qty_available` cell mean on re-upload — zero, or "no comment"?
3. When a bulk update contains bad ids, is it partial or all-or-nothing?
4. Reading the code turned up a **second** write path the plan had not named
   (`resolveReviewRowAsLink`, the admin review-queue rescue), which drops the same two
   columns one level down.

Two latent schema defects surfaced while reading the table, recorded here because both were
found by inspection rather than by failure:

- `inventory_unique_per_warehouse UNIQUE (vendor_listing_id, warehouse_id)` **dedupes
  nothing in practice.** Postgres treats NULLs as distinct, and since no warehouse is ever
  created, every row is a NULL-warehouse row. A second "set my stock" call would have
  inserted a duplicate rather than updating.
- `idx_inventory_listing` is partial on `WHERE quantity_available > 0`, so it cannot serve
  "show me all my listings including the out-of-stock ones" — which is the primary read of
  the vendor stock screen, and precisely the rows a vendor signs in to fix.

## Options considered

### Question 1 — stock vs. status

#### Option A — Independent; neither writes the other

- **Pro:** Setting stock writes only `quantity_available`; setting status writes only
  `status`. No hidden second write, so what a vendor changed is what changed.
- **Pro:** Paint needs `status` as its *only* availability control
  ([0007](0007-colour-family-pricing.md)), and a non-paint listing may legitimately be
  paused while in stock. One mechanism serves both without special cases.
- **Con:** `quantity_available = 0` with `status = 'active'` is reachable and contradictory
  to a naive reader. The system does not resolve it; the vendor does.

#### Option B — Auto-flip status when stock hits zero

- **Pro:** Friendlier; the contradiction cannot arise.
- **Con:** Writes a column the vendor did not ask to change — a silent edit.
- **Con:** The reverse rule ("restore to active when stock returns") guesses wrongly for a
  listing that was paused *deliberately*, and there is no way to tell the two pauses apart
  without another column recording why it was paused.

#### Option C — Derive availability from stock; drop the status endpoint

- **Pro:** Fewest moving parts, one source of truth.
- **Con:** Contradicts [0014](0014-batch-resolutions.md), which puts paint availability on
  `vendor_listing.status` precisely because paint has nothing countable.
- **Con:** Removes the ability to pause an in-stock listing, which is a real thing a vendor
  wants (a product they still hold but no longer sell).

### Question 2 — what a blank `qty_available` cell means

#### Option A — Blank means "not telling you"; leave existing stock untouched

- **Pro:** Safe under re-upload. A vendor re-sending an export with the column deleted does
  not zero their catalog.
- **Pro:** Matches how the row's other optional fields already behave (`mrp` falls back to
  the existing value rather than nulling it).
- **Con:** Stock cannot be cleared by omission; clearing requires an explicit `0`. A vendor
  who *meant* "I have none" by leaving it blank is not heard.

#### Option B — Blank means zero

- **Pro:** Unambiguous, and arguably what a vendor means by leaving it empty.
- **Con:** One deleted column in a re-uploaded sheet silently zeroes every listing the sheet
  touches. The destructive direction is the one taken on a mistake, and the mistake is
  invisible until a customer cannot buy anything.

### Question 3 — bulk update with bad ids

#### Option A — All-or-nothing; 400 naming the offenders

- **Pro:** The vendor's catalog is never left half-applied and needing reconciliation.
- **Pro:** Consistent with the export-scope precedent already set in
  `VendorCategoriesService.assertExportScopeAllowed`, which rejects naming the offending
  categories rather than silently narrowing scope.
- **Con:** One typo in a 500-item batch costs the whole batch. The client must fix and
  resend everything.

#### Option B — Partial success with a `failures[]` report

- **Pro:** Forgiving for large batches; the good 497 land.
- **Con:** Leaves the vendor in a state neither they nor the system can describe simply, and
  a client that ignores the failure array silently loses updates.

## Decision

**Option A on all three**, and the second write path is fixed alongside the first.

The rules, written so they can be quoted back:

> **1. Stock and status are independent.** Setting stock never writes `status`; setting
> status never writes stock. `quantity_available = 0` with `status = 'active'` is a legal,
> reachable state, and it is the vendor's to resolve, not the system's.
>
> **2. A blank `qty_available` means "not telling you", not zero.** An absent value leaves
> an existing quantity exactly as it was, and creates no inventory row where none existed.
> Clearing stock requires an explicit `0`.
>
> **3. A bulk stock update is all-or-nothing.** One unknown, unowned, repeated, or paint
> listing id rejects the entire batch with a 400 naming the offenders, and nothing is
> written.
>
> **4. Paint carries no inventory row.** A `tinted_to_order` product never gets one
> ([0007](0007-colour-family-pricing.md), [0014](0014-batch-resolutions.md)); writing stock
> against a paint listing is **rejected**, not silently ignored.
>
> **5. A spreadsheet cannot un-pause an uncertain match.** An upload row may set the status
> of a deterministically matched listing, but never of one paused pending the vendor's own
> confirmation ([0011](0011-product-code-and-vendor-export.md) section 5).

Two further rules govern how the writes are made:

> **6. Ownership is resolved in the service from the authenticated vendor, never from the
> request path.** A listing belonging to another vendor returns **404, not 403**, so the API
> does not confirm that someone else's listing id exists.
>
> **7. A bulk write is one SQL statement.** Not a loop.

## Why

**On rule 1.** The contradiction Option B tries to prevent is not actually an error state —
it is a vendor who has run out and has not yet decided whether to pause the listing or
restock it. Encoding a guess about which they meant, and writing it to a column they did not
touch, replaces a visible ambiguity with an invisible one. The honest design surfaces the
state and lets the person who knows resolve it.

**On rule 2.** This is a straightforward asymmetry of consequences. If blank means "no
comment" and a vendor meant zero, one listing shows stale stock until they correct it. If
blank means zero and a vendor re-uploads a sheet missing the column, their entire catalog
goes to zero at once and nothing reports it. Both are wrong; only one is a catastrophe, and
it is the one that arrives through an ordinary mistake rather than a deliberate act.

**On rule 3.** This codebase has already made this call once, in a closely analogous place:
export scoping rejects a request naming categories the vendor is not registered for, rather
than quietly returning a narrower sheet, because *"a vendor who asked for five categories
and received three would have no way to tell that happened."* The same reasoning applies to
stock.

**On rule 7.** This one is not aesthetic. The search-sync triggers on `inventory` are
`FOR EACH STATEMENT` with transition tables ([20260828090004](../../apps/backend/database/migrations/20260828090004-create-search-sync-triggers.js)),
so a 200-item loop enqueues **200** `search_outbox` rows while one `unnest` + `ON CONFLICT`
statement enqueues **1**. Identical result, two orders of magnitude less reindex churn —
and the difference is invisible unless you read the trigger definitions before writing the
loop.

**On fixing both write paths.** `resolveReviewRowAsLink` was not in the plan's file list. It
reads the same `rawRowJson` and creates a listing exactly as the upload path does. Fixing
only the path that was named would mean a row that needed human help silently loses its
stock while an auto-matched row keeps it — the arbitrary-looking bug that is hardest to
diagnose later.

## Consequences

- `inventory` has a writer for the first time. Its search-sync trigger, dormant since Phase
  4, now fires on real traffic — every stock change enqueues a reindex.
- Four new vendor routes exist (`GET /vendor/listings`, `PATCH .../:id/stock`,
  `PATCH .../:id/status`, `POST .../stock/bulk`), all in `scripts/smoke.js`.
- **A migration was required before any of it was safe**
  ([20260914090000](../../apps/backend/database/migrations/20260914090000-fix-inventory-uniqueness.js)):
  a partial unique index on the NULL-warehouse case, plus an unpartialed index on
  `vendor_listing_id`. The original `inventory_unique_per_warehouse` is deliberately kept —
  it works for the day warehouses exist, and dropping it would foreclose multi-warehouse
  inventory, which [0014](0014-batch-resolutions.md) leaves open.
- `VendorListingsController` lives in the catalog folder but is **declared in
  `VendorsModule`**. It needs `VendorsService` to resolve the caller, and `CatalogModule`
  cannot import `VendorsModule` without closing a cycle; `StockService` travels to it
  through `CatalogModule`'s exports, the same way `VendorCategoriesService` already reaches
  `AdminVendorsController`.
- Every inventory write goes through **raw SQL**, not the Sequelize model: `ON CONFLICT ...
  WHERE warehouse_id IS NULL` targets a partial index and `unnest()` keeps the bulk path to
  one statement, and neither is expressible through `upsert()`/`bulkCreate()`. The
  `Inventory` model is consequently not injected into `StockService`.
- **`quantity_reserved` stays at 0.** It has no consumer until the ordering domain exists,
  and inventing a reservation semantic now would likely be wrong.
- `quantity_available` is `DECIMAL(12,3)` — fractional quantities are legitimate (the unit
  is the category's: tonnes, boxes, sqft), and Postgres returns it as a **string**, so
  mapping must not `parseInt`.

## Open questions

- **Search still hardcodes `inStock: true`** in two places
  (`search-document.builder.ts:145`, `postgres-search.service.ts:212`). Now that quantities
  are real, both should consult inventory. Deliberately not bundled here: it changes search
  behaviour and belongs with the search document shape, not with the write model.
- **Multi-warehouse inventory.** The kept `inventory_unique_per_warehouse` constraint and
  the explicit `warehouse_id IS NULL` join condition preserve the option, but the listing
  query would need to decide whether it sums across warehouses or reports per-warehouse.
  Nothing creates a warehouse today.
- **Whether `vendor_category` enforcement should also gate stock writes.** Currently a
  vendor can set stock on any listing they own, regardless of registered categories. That
  seems right — the listing already exists — but it has not been argued through.
- **Backfilling stock for the 0 existing listings** is a non-question today and becomes one
  the moment real vendors upload.
