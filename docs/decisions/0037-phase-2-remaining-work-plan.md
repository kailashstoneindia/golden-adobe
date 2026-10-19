# 0037 — Phase 2 remaining work: end-to-end plan

- **Date:** 2026-10-19
- **Status:** Proposed — ready to execute, pending user go-ahead on sequencing
- **Supersedes / Superseded by:** —

## Context

Phase 2 (Marketplace Core: Product Management, Vendor Module, Product Catalog, Categories,
Search, Inventory Management) has been in progress on `main`/`origin/main` since before this
project's decision-record trail begins. [0035](0035-client-feedback-triage-2026-10-18.md)
identified two client-requested items as genuine Phase 2 scope (category rename, vendor
loading/unloading capability field); separately, `docs/catalog-implementation-status.md`
(dated 2026-09-28) listed open gaps that needed re-checking against current `origin/main`
before planning further work on stale information.

A ground-truth check against `origin/main` (HEAD `61a124d` at time of writing — well ahead of
the Sept 28 status doc: image/media pipeline, AWS deploy infra, product image upload/search
image carry-through, bulk-publish have all landed since) found:

- **Vendor onboarding + approval is fully built**, contradicting the Sept-28 doc's claim of
  "zero vendor rows." `POST vendors/onboard`, `PATCH vendors/me`, `PATCH
  vendors/me/account-details`, `PATCH vendors/onboarding-progress` all exist and work.
  Approval is implemented as a generic `User.is_approved` flag + `PATCH users/:id/approve`
  (`users.controller.ts:22-38`), not a vendor-specific status field — functional, but worth
  flagging as a design choice (see Decision item 4).
- **Vendor listing creation is partially built**, correcting the Sept-28 doc's "no endpoint
  anywhere" claim. Listings are created via the catalog-import upload pipeline
  (`vendor-catalog-import.service.ts:228-253`, `findOrCreate` with price/MRP/MOQ/status), not
  via a direct single-listing POST. A vendor adding **one** new product outside a bulk sheet
  upload still has no path to do that.
- **Bulk-publish is done** (`admin-catalog.controller.ts:83-95`).
- **Meilisearch search runtime (6c-6h) is working, no regression** — dual-mode with Postgres
  fallback intact per decision 0021.
- **One flagged TODO**: `vendor-categories.service.ts:92`, a Phase-2-tagged backfill concern
  for `vendor_category`, not yet investigated.

This record turns those findings, plus the two client-requested items, into a single ordered
work-item list so Phase 2 has one place that says what's left and in what order to do it.

## Options considered

### How to sequence the work

#### Option A — Fix gaps first, then layer client requests on top

- **Pro:** Closes real operability holes (single-listing creation, the `vendor_category`
  TODO) before adding new surface area on top of a module with known gaps.
- **Con:** Delays the two client-visible items (#1 category rename, loading/unloading field)
  that the client is actively waiting to hear back on.

#### Option B — Client-visible items first, platform gaps as a second batch

- **Pro:** Fastest visible response to the client's 2026-10-18 feedback; both items are small,
  additive, and independent of the gaps found above.
- **Con:** None material — neither client item touches the files where the gaps live
  (`vendor-listings.controller.ts`, `vendor-categories.service.ts`), so there's no actual
  blocking dependency either way; this is purely a prioritization call, not a technical one.

## Decision

> **Work proceeds in four batches, in this order:**
>
> **Batch 1 — client-visible, ship first (no dependency on anything below):**
> 1. Category rename: "Sanitaryware & Bath" → "Bath and Sanitaryware". One-line data change in
>    the taxonomy seed (`apps/backend/database/seed-data/taxonomy.js`) + idempotent re-run of
>    `20260901100000-seed-taxonomy.js`, per the existing idempotent-reseed pattern documented in
>    `catalog-implementation-status.md`. **Blocked on client confirming 1b** (whether this is a
>    rename only, or also a split into "Sanitary & Plumbing" / "Hardware & Tools" — see 0035).
>    Ship the rename now; hold the possible split for that answer.
> 2. Vendor `has_loading_unloading_team` field, per [0036](0036-vendor-loading-unloading-capability.md):
>    migration + model column + `OnboardVendorDto`/`UpdateVendorProfileDto` wiring.
>
> **Batch 2 — close the single-listing creation gap:**
> 3. Add `POST vendor/listings` (or equivalent) to `vendor-listings.controller.ts` for a vendor
>    to create one `vendor_listing` (price, MRP, MOQ, initial stock) against an existing
>    `master_product`, without requiring a full sheet upload. This is the one path explicitly
>    missing per the ground-truth check — a vendor who wants to list a single new product today
>    has no way to do it outside the bulk-import flow.
>
> **Batch 3 — platform-gap cleanup:**
> 4. Investigate and resolve the `vendor-categories.service.ts:92` TODO (`vendor_category`
>    backfill for all live [...]`) — read the full comment and surrounding code first; this is
>    not yet scoped beyond "flagged, not investigated."
> 5. Decide whether vendor approval deserves its own status field (`vendors.status`:
>    pending/approved/rejected) separate from the generic `User.is_approved`, now that two
>    separate approval-adjacent asks exist (this gap, plus the client's #5 "pending approvals on
>    dashboard" — which is Phase 4 scope per 0035, but the schema decision of *where* approval
>    state lives affects what Phase 4 builds against). Flagging now so Phase 4 doesn't have to
>    re-discover this; not building it in Phase 2.
>
> **Batch 4 — loading/unloading checkout charge (cross-phase; no longer sequenced behind the
> Phase 3 merge, per 0036's 2026-10-19 update):** not Phase 2 work, listed here only so this
> record is a complete map of everything that traces back to the 2026-10-18 feedback. Built
> directly inside `worktree-phase-3-ordering-domain` rather than as a `main` fast-follow — see
> 0036 for what changed and why. Tracked in 0036, not duplicated here.

## Why

Batches 1 and 2 are ordered first because they're both small, independent, and either
client-visible (Batch 1) or close a hard operability gap with no workaround today (Batch 2:
bulk-import is not a substitute for "I have one new product to list," especially for a vendor
with a small catalog). Batch 3 is sequenced last because both its items are investigation-first
— the TODO's scope isn't known yet, and the approval-status-field question is a design decision
that benefits from being decided deliberately rather than rushed alongside the other three,
which are already fully specified.

Keeping Batch 4 named-but-not-duplicated here follows the same discipline 0034 and this
project's 0036 already established: a record should say where related work is tracked rather
than re-stating it, so there's exactly one place to update when that tracked item's status
changes.

## Consequences

- Four small, independently shippable PRs against `origin/main`/current branch, not one large
  one — matches this project's existing PR-granularity pattern (0034's two-PR split; 0036's
  original two-PR split, since revised — see 0036's Consequences).
- Batch 1 item 1's possible taxonomy split (1b) and Batch 3 item 5 (approval status field) are
  both named as open decisions elsewhere (0035, this record) rather than guessed at here.
- The Sept-28 `catalog-implementation-status.md` "What's next" section is now superseded by
  this record for the two items it listed (vendor listing creation, vendor accounts) — that
  doc should be updated to reflect current reality rather than left to mislead the next reader;
  flagged here, not fixed in this record.

## Open questions

- Exact shape of the single-listing creation endpoint (Batch 2) — request/response shape,
  whether it goes through the same match-ladder logic the import pipeline uses or a simpler
  direct-attach-to-known-`master_product` path. Not designed here; needs its own pass before
  implementation.
- Full scope of the `vendor_category` backfill TODO (Batch 3, item 4) — comment is truncated in
  the report this record is based on; needs to be read in full before estimating.
- Whether a vendor-specific status field (Batch 3, item 5) is worth building now or deferred
  entirely to whenever Phase 4's admin dashboard work starts — leaning toward "decide it then,"
  since no Phase 2/3 code currently depends on the answer.

## Sources

- `docs/catalog-implementation-status.md` (2026-09-28 — superseded by this record for the two
  "What's next" items it names)
- `git log origin/main` (HEAD `61a124d` at time of writing)
- `apps/backend/src/modules/catalog/vendor-listings.controller.ts`,
  `vendor-catalog-import.service.ts:228-253`, `vendor-categories.service.ts:92`,
  `admin-catalog.controller.ts:83-95`
- `apps/backend/src/modules/vendors/vendors.controller.ts`,
  `apps/backend/src/modules/users/users.controller.ts:22-38`,
  `users.service.ts:61`, `vendor.model.ts`, `users/models/user.model.ts:69`
- [0035-client-feedback-triage-2026-10-18.md](0035-client-feedback-triage-2026-10-18.md)
- [0036-vendor-loading-unloading-capability.md](0036-vendor-loading-unloading-capability.md)
