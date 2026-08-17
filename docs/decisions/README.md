# Design Decision Records

Each file here records the outcome of one design discussion — what was decided, what
else was considered, why the winner won, and what it costs. The implementation plan is
curated *from* these records, so they are written before code, not after it.

A record that lists only what was chosen has failed its purpose. Capture the rejected
options and the consequences too, so a future reader can tell whether a decision is still
valid when circumstances change.

## Index

| # | Title | Date | Status |
|---|---|---|---|
| [0001](0001-category-tree-and-attributes.md) | Category tree shape, attribute inheritance, taxonomy vs. browse | 2026-08-02 | Accepted |
| [0002](0002-paint-shade-and-tinting.md) | Paint shade, bases, and tinted-to-order products | 2026-08-02 | Partially superseded by 0007 |
| [0003](0003-stone-natural-material.md) | Stone as a natural, lot-varying material | 2026-08-02 | Partially superseded by 0009 |
| [0004](0004-filter-character-by-category.md) | Filter character differs by category; no schema support needed | 2026-08-02 | Accepted |
| [0005](0005-attribute-storage-and-identity-columns.md) | Global attribute scope, identity columns, and attribute value storage | 2026-08-02 | Accepted |
| [0006](0006-constraint-and-cache-invalidation-mechanisms.md) | Leaf-only enforcement and `attributes_flat` invalidation | 2026-08-02 | Accepted |
| [0007](0007-colour-family-pricing.md) | Colour-family pricing; base leaves the paint SKU | 2026-08-02 | Accepted |
| [0008](0008-stone-bundle-tier.md) | Stone bundles, and a unified vendor pricing mode | 2026-08-02 | Superseded by 0009 |
| [0009](0009-stone-price-list-model.md) | Stone as a price list, not a bundle inventory | 2026-08-02 | Accepted |
| [0010](0010-indian-compliance-fields.md) | Legal Metrology fields, and GST at the right level | 2026-08-02 | Accepted |
| [0011](0011-product-code-and-vendor-export.md) | Product codes, pre-filled vendor export, and match integrity | 2026-08-02 | Accepted |
| [0012](0012-product-identity-and-deduplication.md) | Product identity and catalog deduplication | 2026-08-02 | Accepted |
| [0013](0013-identity-hash-for-unbranded-products.md) | Identity hash for products with no brand or MPN | 2026-08-02 | Accepted |
| [0014](0014-batch-resolutions.md) | Batch resolution of open questions | 2026-08-02 | Accepted |
| [0015](0015-per-vendor-colour-delta.md) | Colour pricing as a per-vendor delta | 2026-08-02 | Superseded by 0016 |
| [0016](0016-colour-price-per-listing.md) | Absolute colour price per listing | 2026-08-02 | Accepted |
| [0017](0017-search-engine-choice.md) | Search engine choice: Meilisearch | 2026-08-16 | Accepted |
| [0018](0018-city-scoped-search.md) | City-scoped search: one document per (product, city) | 2026-08-17 | Accepted |
| [0019](0019-search-followups.md) | Search follow-ups: combined location resolution, admin search, autocomplete, synonyms | 2026-08-17 | Accepted |
| [0020](0020-ncr-launch-cities.md) | Launch scope: Delhi NCR as five separate cities | 2026-08-17 | Accepted |

## Adding a record

1. Copy [TEMPLATE.md](TEMPLATE.md) to `NNNN-kebab-title.md` — zero-padded, next number in sequence.
2. Fill it in while the discussion is fresh.
3. Add a row to the index above.

Status is one of **Accepted**, **Superseded by NNNN**, or **Deprecated**. Do not edit or
delete an accepted record when you change your mind — write a new one that supersedes it,
and update the old record's status. The trail of reversals is the useful part.

## Related documents

- [../catalog-schema.sql](../catalog-schema.sql) — **canonical DDL**. Migrations are derived
  from it.
- [../catalog-er-diagram.md](../catalog-er-diagram.md) — entities, relationships and
  cardinalities as Mermaid diagrams.
- [../catalog-excel-flows.md](../catalog-excel-flows.md) — the three spreadsheet workflows:
  admin catalog upload, vendor inventory upload, and new-product requests.
- [../catalog-build-order.md](../catalog-build-order.md) — **what to build, in what order,
  and what blocks what.**
- [../catalog-integrity-approach.md](../catalog-integrity-approach.md) — the consolidated
  approach: how the catalog stays duplicate-free and how vendor inventory attaches
  correctly.
- [../catalog-integrity-residual-risks.md](../catalog-integrity-residual-risks.md) — the four
  known gaps in that approach. Documented, **not yet decided**.
- [../catalog-consistency.md](../catalog-consistency.md) — how other platforms prevent
  vendor listings attaching to the wrong catalog product, and the gaps here.
- [../catalog-vendor-export-analysis.md](../catalog-vendor-export-analysis.md) — feasibility,
  effort and risk analysis for the pre-filled vendor export.
- [../templates/](../templates/) — ready-to-fill CSV upload templates.
- [../catalog-structure.md](../catalog-structure.md) — the concrete tree and per-category
  attribute definitions for all 58 leaf categories.
- [../catalog-entity-model.md](../catalog-entity-model.md) — narrative table design and the
  reasoning behind each column.
- [../search-system-design.md](../search-system-design.md) — how Meilisearch fits the stack:
  services, change capture, sync worker, query path and failure behaviour.
- [../search-schema.sql](../search-schema.sql) — **canonical DDL for search sync**: the
  outbox, its triggers, expansion and drain bookkeeping.

These sit at the repo root and are referenced by the records here. Decision records point
at them; they do not edit them.

- `construction-marketplace-catalog-schema-mvp (2).md` — original draft, superseded by
  `docs/catalog-entity-model.md`
- `search-architecture.md` — Postgres → search index split and sync pipeline
