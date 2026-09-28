# 0029 — Pre-filled Vendor Export (Catalog-First Inventory Upload)

- **Date:** 2026-09-28
- **Status:** Accepted
- **Supersedes / Superseded by:** Supersedes 0028-vendor-catalog-import-correctness.md

## Context

0028 fixed match-ladder correctness for the current flow, where a vendor types
`product_ref`/brand/category into a blank template from memory. `docs/catalog-vendor-export-analysis.md`
(pre-existing feasibility analysis) proposes a different flow: vendor picks leaf categories +
brands, downloads a sheet **pre-filled** with `product_code` for those products, edits only
price/qty, uploads. Exact-code lookup replaces the ladder for existing products; the ladder
remains only as fallback for blank-code rows. This removes the wrong-match risk 0028 was
mitigating, rather than mitigating it — superseding it.

Full mechanism, corruption mitigations, and effort estimate: `docs/catalog-vendor-export-analysis.md`
(verdict: "adopt it", ~3 weeks, conditional on export scoping and phased category launch).
This decision resolves that document's four open questions and commits to build.

## Options considered

Already covered in `catalog-vendor-export-analysis.md` sections 1–3. Not re-litigated here.

## Decision

Adopt the pre-filled export mechanism as designed in the analysis doc, with these choices on
its open questions:

1. **Export scope:** leaf-category + brand filter (not search-and-select basket). Required per
   the analysis's section 3.1 — without it, mature-catalog exports hit 8,000–10,000 rows and
   become unusable.
2. **File format:** `.xlsx` with locked `product_code`/`product_name` columns, via `exceljs`
   (already a project dependency). Prevents vendors from editing the columns that govern
   matching.
3. **Seed catalog dependency:** treated as a hard pre-req, not in scope for this engineering
   work. Launch phased by category — start with categories with good brand data (Electrical,
   Tiles, Plumbing per the analysis's section 4 sizing table), not all eight at once. Seeding
   itself is a separate operational workstream with its own owner.
4. **Price-only bulk update sheet:** left open, separate future decision.

`product_code` scheme, export/import query shapes, and corruption mitigations (Excel
scientific-notation, UTF-8 BOM, trimming, stale-export handling) are as specified in the
analysis doc — implemented as written there, not restated here.

## Why

Leaf+brand scoping and phased category launch are both explicit recommendations in the
source analysis, backed by concrete row-count math (section 3.1) and data-availability sizing
per category (section 4) — no reason found to deviate. Locked `.xlsx` was chosen over CSV
because the corruption modes in section 3.2 (scientific notation, leading-zero stripping) are
exactly what a locked, typed column prevents at the source rather than catching on import.

## Consequences

- 0028 is superseded: its match-ladder brand/category-column fix is no longer the direction —
  this flow makes the ladder a fallback path for blank-code rows only, not the primary
  matching mechanism.
- Vendor onboarding cannot proceed for a category until that category's seed catalog is
  substantially complete. This is a real sequencing dependency on an operational workstream,
  not an engineering one — flagged so it isn't discovered mid-build.
- `master_product` needs a `product_code` column + sequence (analysis doc section 1).
- Import path (`vendor-catalog-import.service.ts`) needs the code-first lookup path added; the
  existing ladder becomes the fallback for blank/missing-code rows rather than the primary path.
- Paint (pre-expand by colour family) and stone (vendor duplicates rows per grade) need the
  category-specific export handling described in the analysis's section 3.4.
- Effort estimate carries over: ~3 weeks engineering, assuming catalog CRUD and vendor auth
  already exist (they do, per prior investigation).

## Open questions

- Price-only bulk update sheet (re-download not required, keyed on `product_code`) — separate
  future decision.
- Exact seed-catalog ownership and start date — operational, tracked outside this doc.

## Sources

- `docs/catalog-vendor-export-analysis.md` (pre-existing feasibility analysis this decision
  adopts).
