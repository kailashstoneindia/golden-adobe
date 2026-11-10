# 0061 — Admin brand and product onboarding: review findings

- **Date:** 2026-11-10
- **Status:** Findings recorded. Superseded by [0062](0062-catalog-onboarding-design.md) (design)
- **Supersedes / Superseded by:** Superseded by 0062

## Context

The user judged the admin brand and product onboarding flow "not good or enough" and wants it fixed
completely. This record holds the review. Method: code read, then the admin panel run in a real browser
(Playwright) against the local `golden_abode_test` database: every catalog screen, a real six-row import,
the same file again, the product detail screen, publishing, and a 250-row import through the API; plus API
calls for editing, deleting and brand routes. All test rows were removed afterwards. Not run live: the vendor
import and review queue (finding 12 is from the code), the mobile apps.

Background: [0026](0026-pearl-precision-brand-onboarding.md) and [0027](0027-lavish-ceramics-brand-onboarding.md)
onboarded brands by seed scripts and SQL because no brand tooling existed; [0023](0023-single-product-create-edit.md)
built the add-product API but no screen. Visual summary: https://claude.ai/artifact/MY5vdkBiP6L8m56XQVoVKE

## Findings (worst first)

| # | Finding | Severity | Verified |
|---|---|---|---|
| 1 | No way to create, edit or deactivate a brand: no screen, no API (`/admin/brands` returns 404). Error text says "create it first (admin brand management)", which does not exist. A brand needs four mandatory compliance fields. | High | Live |
| 2 | No "add product" screen. `POST /admin/catalog/products` exists; nothing in `apps/admin` calls it. | High | Live |
| 3 | A product can't be corrected: update accepts only `name` and `attributeValues`; part number returns 400; the screen edits the name only. | High | Live |
| 4 | Brand names must match exactly: `havells ltd` (import) and `HAVELLS` (add-product API) are rejected though `Havells` exists. `catalog-import-upload.service.ts:271,311,354` and `admin-catalog.service.ts:523` skip `BrandResolverService`. | High | Live |
| 5 | Import result screen shows no counts (reads `createdCount`/`errorCount`; API sends `acceptedCount`/`rejectedCount`). The API's `errorFileBase64` is never offered. Re-uploading the file rejects rows that already landed. | Medium | Live |
| 6 | A product with no images, no listings and no HSN code goes live with one click. Only check is the variant-attribute trigger for unbranded/stone products. | Medium | Live |
| 7 | No delete or retire: `DELETE` returns 404; the Deprecated tab has no action behind it. | Medium | Live |
| 8 | No import history or undo (`catalog-import-upload.service.ts` comment: no batch tracking). | Medium | Code |
| 9 | Imports run row by row in one request, no size limit. Measured 250 rows = 15 s (about 60 ms/row); about 1,000 rows would pass a 60 s proxy timeout (estimate). | Medium | Live + estimate |
| 10 | No brand filter or search on the products list; `bulkPublish` accepts `brandId` but the screen can't supply one. | Medium | Live |
| 11 | Images upload one product at a time (`ProductMediaPanel`). | Medium | Code, judgement |
| 12 | Vendor rows that match nothing become "new product requests" the admin can only link or reject; the screen says to re-add via import. | Medium | Code |

## Decision

None yet. Fix order proposed in the review: (1) two quick bug fixes (use the brand resolver everywhere;
fix the result summary and offer the error file); (2) Brands page; (3) publish readiness and retire/delete;
(4) brand filter and publish by brand; (5) add-product form; (6) edit brand and part number on drafts;
(7) upload size/row cap and import history; (8) create-product-from-review-row; (9) bulk images.

## Open questions

Product questions are being worked through with the user; answers will go into the design record that
supersedes this one.

## Sources

- `apps/backend/src/modules/catalog/` (`admin-catalog.service.ts`, `catalog-import-upload.service.ts`,
  `brand-resolver.service.ts`, `vendor-match-ladder.service.ts`), `apps/admin/src/pages/Catalog*.tsx`,
  `apps/admin/src/components/catalog/`
- `apps/backend/database/migrations/20260829090001-create-required-variant-attrs-trigger.js`
