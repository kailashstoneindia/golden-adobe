# 0028 — Vendor Catalog Import: Match-Ladder Correctness & Transaction Safety

- **Date:** 2026-09-28
- **Status:** Retracted — written from a stale/incomplete read of the codebase
- **Supersedes / Superseded by:** Superseded by 0029-prefilled-vendor-export.md, which is itself retracted for the same reason — see its header.

## Retraction (2026-09-28, same day)

This document's Context section treats the vendor upload path as taking free-text
`product_ref`/brand/category typed by the vendor, and diagnoses the ladder's steps 2 and 4
never firing as a bug. Both premises are wrong:

1. The export-first flow this doc's "Option C" proposes **already exists**, fully built and
   committed at `b07a377` (`feat(catalog): vendor listings, inventory and the match ladder`,
   2026-09-02), on this same branch. See 0011-product-code-and-vendor-export.md, which this
   commit implements, and `vendor-catalog-export.service.ts`, which is the real, working
   pre-filled-export mechanism this doc describes as a future option.
2. The comment at `vendor-catalog-import.service.ts:40-43` states directly that vendors are
   *deliberately* never asked for brand/category on upload — "vendors supply price/stock,
   never specs, so there is nothing to vary per-category here" — because the export-first flow
   already makes exact `product_code` matching the primary path (ladder step 1). Steps 2 and 4
   exist for a narrower case (blank-code fallback rows on products the vendor's export didn't
   cover), not as a general-purpose path every upload was meant to exercise. Treating their
   low fire-rate as a defect misread the design.

What **is** still accurate and unaddressed: the per-row write in `processRow()` /
`applyInventory()` still has zero `sequelize.transaction()` wrapping (reconfirmed 2026-09-28
against the current file) — that specific finding stands and should be tracked as its own,
narrower decision rather than bundled with the retracted match-ladder analysis above.

## Context (original — kept for record, premises above are wrong)

Vendor onboarding was reported as "pending" but investigation showed the backend for
account creation (`POST /vendors/onboard`) is real, transactional, and working. The
genuinely broken piece is the bulk inventory upload path
(`POST /vendor/catalog-import`, `apps/backend/src/modules/catalog/vendor-catalog-import.service.ts`),
which creates `vendor_listing` rows from a vendor-uploaded Excel sheet. Two verified bugs:

1. **Match ladder degraded to 3 of 6 steps.** The ladder documented in
   [0011](0011-product-code-and-vendor-export.md) has six steps (`vendor_product_map` exact,
   `product_code` exact, `brand+MPN` exact, `GTIN` exact, `structured` (brand+category+attributes),
   fuzzy name, new-product-request). The importer's `ParsedRow` type and `readDataRows()`
   (`vendor-catalog-import.service.ts:24-35`, `762-799`) never read or forward `brandName`,
   `categoryId`, or `attributeValues` to `VendorMatchLadderService.match()`
   (`vendor-match-ladder.service.ts:102-181`). Steps 2 (`if (row.brandName)`, line 153) and
   4 (`if (row.brandName && row.categoryId && row.attributeValues)`, line 174) are guarded by
   conditions that are always false from this entry point — dead code, not merely weak code.
   Every vendor upload today effectively runs a 3-exact-step + fuzzy + new-product ladder, not
   the documented 6-step one.

   A downstream symptom: `listPendingConfirmations()` (lines 448-503) hardcodes
   `matchMethod: 'structured'` on the premise that paused listings only ever arise from step 4.
   Since step 4 can never fire from this path, that label is currently always wrong for any row
   that actually reaches PAUSED (which can only happen via step 5, fuzzy).

2. **No transaction around the per-row write.** `processRow()` performs up to four independent
   writes per row — `vendorListingModel.findOrCreate` (235-257), a colour-price
   `upsert`/`listing.save()` (273-291), a conditional status `listing.save()` (318-321), and
   `applyInventory()` (326), which issues a raw SQL `INSERT ... ON CONFLICT` outside Sequelize's
   transaction plumbing (728-735) — with zero `transaction` references anywhere in the file. A
   failure partway through a row (e.g. the raw inventory insert throwing) leaves a committed
   `vendor_listing` with no matching inventory row and no rollback. This is inconsistent with the
   rest of the codebase: both `vendors.service.ts#createProfile` and
   `vendor-categories.service.ts#replaceForVendor` wrap their multi-step writes in
   `sequelize.transaction()`.

Zero vendor accounts exist yet (data gap, not a code gap — out of scope here). A vendor-facing
single-listing creation endpoint (add one product manually, no spreadsheet) does not exist
anywhere in the backend; `docs/decisions/0023-single-product-create-edit.md` scoped single-item
create/edit as admin-only for `master_product`, not vendor-facing for `vendor_listing`. Building
that is a distinct feature (new DTO, new endpoint, new mobile screen wiring — `add-product.tsx`
is currently a disconnected mockup with an empty `onPress`) and is deliberately **out of scope**
for this decision; it is a separate follow-up brainstorm.

## Options considered

### Option A — Derive brand/category from a resolved `product_ref` match

Before falling to fuzzy matching, if `product_ref` resolves to a single high-confidence
candidate via name similarity, borrow that candidate's `brand_id`/`category_id` and re-run
steps 2/4 as a tie-breaker.

- **Pro:** No template or vendor-facing change required.
- **Con:** Steps 2/4 exist specifically to match rows where `product_ref`/SKU do *not* already
  resolve. Borrowing brand/category from a fuzzy name match makes steps 2/4 redundant with step 5
  rather than genuinely functional — it doesn't add matching power, just relabels step 5's output.
  Rejected.

### Option B — Redefine the ladder as 3-step for vendor uploads; leave steps 2/4 for admin import only

Accept that vendor uploads structurally can't supply clean brand/category/attribute identifiers,
update 0011's docs to describe a shorter ladder for this entry point, and invest instead in
strengthening step 0 (`vendor_product_map`, learned) and step 5 (fuzzy + review).

- **Pro:** No new vendor-facing validation surface; correctly describes what's true today with
  the least code change.
- **Con:** Does not improve match correctness — it documents the bug instead of fixing it. Given
  the stated priority is match correctness, this option trades correctness for convenience.
  Rejected.

### Option C — Add `brand_name`/`category_code` columns to vendor upload templates, validate against master data, wire into the ladder (chosen)

Extend the three vendor upload templates with `brand_name` and `category_code` columns. Validate
each non-blank value against master `brand`/`category` tables (exact match, case-insensitive) before
the row reaches the match ladder; reject rows with unresolvable values as a structured per-row
error, same mechanism as existing malformed-row handling. Pass resolved `brandId`/`categoryId`
into `matchLadder.match()`, unblocking step 2. Attribute columns (needed for step 4) are deferred
to a later pass — variant-defining attributes differ per category (paint needs finish/size, stone
needs variety) and would require a per-category template schema; landing brand/category first lets
us measure step 2's impact on real upload data before designing that.

- **Pro:** Directly fixes match correctness for the step this pass covers; keeps master data as
  the single source of truth (no fuzzy-matching on identifiers that should be exact); matches the
  existing per-row error-reporting pattern already used in `importFile()`.
- **Con:** Vendors must now supply two more columns correctly, or affected rows get rejected
  (mitigated: columns are optional at parse time — blank rows fall through to today's 3-step
  behavior rather than hard-failing; only present-but-wrong values reject). Step 4 remains
  unreachable from this path until attribute columns are designed separately.

## Decision

Implement Option C, scoped to brand/category only (not attributes) in this pass:

1. Add `brand_name` and `category_code` (optional) columns to
   `docs/templates/vendor-inventory-{general,paint,stone}.csv`.
2. `ParsedRow` gains `brandName?: string`, `categoryCode?: string`; `readDataRows()` parses them
   like existing optional columns (`colour_family`, `grade`).
3. Before matching, validate non-blank `brandName`/`categoryCode` against master `brand`/`category`
   tables — exact match, case-insensitive/trimmed, no fuzzy matching on identifiers. Unresolvable
   values reject the row with a structured error (`{ row, field, value, reason }`); the row is not
   written. Blank values are not an error — the row falls through to steps 0/1/3/5/6 exactly as
   today.
4. Pass resolved `brandId`/`categoryId` into `matchLadder.match(...)`. No logic change needed
   inside `VendorMatchLadderService` — step 2's existing guard does the right thing once the
   caller supplies real values.
5. Wrap each row's write sequence (`findOrCreate` → colour-price upsert/save → status update →
   `applyInventory`) in a **per-row** `sequelize.transaction()`. `applyInventory`'s raw query gains
   a `{ transaction }` option. One bad row rolls back cleanly and reports as an error; other rows
   in the same upload are unaffected — this preserves the existing partial-success UX rather than
   making one typo in a 200-row file discard everything.
6. Update `docs/decisions/0011-product-code-and-vendor-export.md` to describe step 2 as reachable
   and step 4 as not-yet-reachable (with the reason: no attribute columns yet). Fix the
   `matchMethod: 'structured'` hardcode at `vendor-catalog-import.service.ts:488` to report the
   actual match method (fuzzy/step 5) rather than a label that's now provably false for every row
   that reaches it.
7. Attribute columns (unblocking step 4) are explicitly deferred — separate future decision once
   step 2's real-world impact is observable.
8. Vendor-facing single-listing creation (manual add-one-product, no spreadsheet) is explicitly
   out of scope — separate follow-up, see Open questions.

## Why

Per-row transaction (not whole-file) was chosen over a single transaction spanning the entire
upload because a whole-file transaction would regress today's partial-success behavior — a single
bad row among 200 would discard 198 good ones, which is a worse vendor experience than today's
implicit (accidental) partial-success, now made explicit and safe.

Hard rejection (not fuzzy-matching) on brand/category values was chosen because these are meant to
be exact identifiers resolving to specific master-data rows, not free text — fuzzy-matching an
identifier field reintroduces the same typo-tolerance problem that exact-match steps 0/1/3 exist to
avoid, and would double the review queue's job (ambiguity on name *and* brand *and* category)
against a stated priority of match correctness, not upload convenience.

Attributes were deferred rather than designed now because they are category-specific
(paint ≠ stone ≠ general) and adding them without first seeing real brand/category-driven match
rates risks over-designing a template schema before there's data to justify its shape.

## Consequences

- Vendor upload templates change shape (two new optional columns); any existing vendor-facing
  documentation/instructions referencing the current template columns needs updating alongside
  this change.
- `listPendingConfirmations()`'s hardcoded `matchMethod: 'structured'` must change in the same PR
  as the ladder wiring, or it becomes actively misleading in a new way (claiming step-5 fuzzy
  matches are step-4 structured matches).
- Test coverage in `vendor-catalog-import.service.spec.ts` must cover: valid brand/category →
  step-2 match; invalid → row rejected with error; blank → unchanged fallthrough behavior;
  simulated mid-row failure → transaction rollback leaves no orphan `vendor_listing`.
- Does not, by itself, make vendor onboarding "demo ready" — no vendor accounts exist yet; that is
  a data/operations task, not a code task, and is unaffected by this decision.
- Forecloses nothing about single-listing creation; that remains fully open for separate design.

## Open questions

- Attribute columns (paint finish/size, stone variety, etc.) needed to unblock match-ladder step 4
  — deferred to a future decision once step 2's real-world match-rate impact is observable.
- Vendor-facing single-listing creation (`POST /vendor/listings` equivalent to today's
  `POST vendor/catalog-import` but for one product, plus wiring `apps/mobile/app/(screens)/add-product.tsx`
  to a real backend) — not addressed here; `docs/decisions/0023` scoped single-item create/edit as
  admin-only for `master_product`, so this is a net-new feature decision, not an extension of 0023.
- Whether `brand_name`/`category_code` should eventually become required (not optional) once
  vendors have had time to adopt the new template columns — left to a future decision once
  adoption data exists.

## Sources

- None consulted outside this repository.
