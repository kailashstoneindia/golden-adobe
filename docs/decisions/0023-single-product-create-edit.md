# 0023 — Single-product create/edit: the last Product Management gap

- **Date:** 2026-09-15
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Phase 2's "Product Management" deliverable has two paths into `master_product`: bulk
Excel import (`CatalogImportUploadService`, Phase 3) and the vendor review queue
(`resolveReviewRowAsLink`, Phase 4). Both create *draft* rows through a batch/row-shaped
flow. There has never been a way to create or edit **one** product directly.

`admin-catalog.controller.ts` says why, in its own comment: *"bulk seeding goes through
Phase 3's generated Excel templates ... a single-product form is a useful later addition
for corrections, not a prerequisite for operating the catalog."* That was correct when
written — the catalog was empty and seeding was breadth-first. It no longer holds: 160
products are seeded, all `status = 'draft'`, and there is no way to fix one row (a typo in
`name`, a missing enum attribute blocking publish) without re-running an entire sheet
through the import path, which re-validates and re-creates rather than updates a single
row by id.

Workstream 4 (inventory) and workstream 3 (product images) are the other two items this
phase's completion plan tracked. WS4 is done ([0022](0022-inventory-write-model.md)); WS3
is explicitly out of scope for this pass. This is the one remaining gap.

## Options considered

### Option A — New thin endpoints, reusing the importer's validation building blocks

- **Pro:** `CatalogAttributeResolverService.resolveEffectiveAttributes()` already computes
  exactly the attribute set (global + inherited + own) a single product needs validated
  against, and it's already shared with the template generator and the admin category
  screen — a third consumer is the pattern, not a new one.
- **Pro:** Identity/dedup enforcement (brand+MPN, category+identity_hash) already lives in
  DB constraints and triggers. A single-row create can lean on those directly (catch and
  translate the constraint violation) instead of re-implementing the importer's pre-query
  dedup checks, which exist there only because a 500 mid-sheet would lose every other valid
  row — a single-product endpoint has no sibling rows to protect.
- **Con:** Two code paths now create `master_product` rows outside the batch importer
  (this, and the review queue's `resolveReviewRowAsLink`), each translating DB errors into
  4xxs slightly differently. Accepted — they serve different callers (JSON body vs.
  spreadsheet row vs. match-ladder resolution) and forcing one shared function would need
  it to abstract over all three shapes, which is worse than three small ones.

### Option B — Extend `CatalogImportUploadService` to also accept a single-row JSON body

- **Pro:** One service, one place validation rules live.
- **Con:** The service's entire contract is workbook-in, workbook-out (`ParsedRow`,
  `ColumnPlan`, `buildErrorWorkbook`). Bending it to also accept and return JSON means
  either two return shapes behind one method or a parallel method that duplicates most of
  the body anyway — the worst of both options with none of the benefit.
- **Con:** The importer's rule 5/5b duplicate checks exist to give a *per-row* error inside
  a *multi-row* file. A single create either has the same row-level shape for no reason, or
  the DB constraint fires first and the pre-query becomes dead code.

### Option C — Derive create/edit from `resolveReviewRowAsLink` instead

- **Pro:** That path already creates a product from a single resolved row.
- **Con:** It exists to link a vendor's *ambiguous upload row* to a master product via the
  match ladder — its whole shape is "resolve this uncertain row," not "an admin typed a
  product." Wrong abstraction for a deliberate, unambiguous admin action.

## Decision

**Option A.** Two new endpoints on the existing admin catalog surface:

- `POST /admin/catalog/products` — create, one leaf category, attribute values in the same
  shape `GET /admin/catalog/products/:id` already returns them (`{code, value}[]`).
- `PATCH /admin/catalog/products/:id` — edit name and/or attribute values. Category is
  **not** editable here — changing a product's category changes its entire effective
  attribute set and is a re-classification, not a correction; that stays a delete+recreate
  until a real need for it is argued.

Both go through `CatalogAttributeResolverService` for the attribute set and validate the
same three rules the importer enforces per-cell (required-if-variant-defining, enum
membership, numeric parse) — reusing the resolver's output, not the importer's row-parsing
code. Both let the DB's own constraints (brand+MPN, category+identity_hash,
`trg_mp_require_variant_attrs_on_publish`) be the backstop, translating a constraint
violation into a 400 the same way `setProductStatus` already does for the publish trigger.

New rows are created as `MasterProductStatus.DRAFT`, matching every existing creation path
— publish stays the existing, separate, deliberate step.

## Why

The importer's dedup pre-queries (rules 4b, 5, 5b) exist specifically to convert what would
otherwise be a whole-import-aborting DB error into a per-row rejection that leaves the other
199 rows intact. A single-product endpoint has no other rows to protect — letting the same
DB constraint fire and catching it is strictly simpler and just as safe, and it's the same
pattern `setProductStatus` already established for the publish trigger. Re-deriving the
importer's pre-checks here would be defending against a failure mode (losing sibling rows)
that doesn't exist at this call site.

Not touching category on edit is the deliberate narrow cut: `attributes_flat` and
`identity_hash` are trigger-maintained off category ancestry, and a category change would
need to re-validate the entire attribute set against a different effective schema — that's
a re-creation, not a "correction," and this ADR is scoped to corrections.

## Consequences

- Two new routes: `POST /admin/catalog/products`, `PATCH /admin/catalog/products/:id`.
  Both added to `scripts/smoke.js`.
- No new migration, no new table. Writes go through the existing `MasterProduct` and
  `MasterProductAttributeValue` models, the same ones the importer and `AdminCatalogService`
  already inject.
- `AdminCatalogController`'s existing comment ("deliberately not product create/edit") is
  now stale and is removed as part of this change.
- The frozen 25-test suite is unaffected — no new `.spec.ts` files, per standing practice.
  Verification is manual, against live Postgres, per the same practice.

## Open questions

- Whether vendor-facing product *requests* (a vendor wanting a genuinely new product, not
  matched by the ladder) should eventually go through this same create endpoint with an
  approval step in front of it, rather than only through the review queue's match-or-reject
  shape. Not argued here — no such request path exists yet to attach it to.
- Slug collisions on edit: renaming a product does not currently re-slugify. Left alone
  deliberately — `slug` isn't exposed as editable in this pass, so it doesn't arise yet.
