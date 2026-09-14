# 0005 — Global attribute scope, identity columns, and attribute value storage

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes / Superseded by:** Refines [0001](0001-category-tree-and-attributes.md) and
  [0003](0003-stone-natural-material.md)

## Context

Building the concrete attribute lists in [catalog-structure.md](../catalog-structure.md)
for all 58 leaf categories surfaced three contradictions with the existing documents, plus
one question deferred since `search-architecture.md` was written. All four had to be
resolved before DDL could be produced.

## Decision

### 1. `attribute.category_id` is nullable; `NULL` means global

0001 and the entity model both stated that `Brand` and `Warranty` are "declared once near
the root". **There is no root.** There are eight top-level categories, so "declared once"
would in practice be eight duplicate rows — precisely the duplication inheritance was
adopted to avoid.

Rejected alternative: a synthetic hidden root category at level 0. That widens the depth
cap from 1–3 to 0–3, puts a phantom node in every tree traversal, and makes `level` mean
something different from what 0001 defined.

The resolution query gains one branch:

```sql
WHERE a.category_id IS NULL OR a.category_id IN (SELECT id FROM ancestry)
```

### 2. If it exists on `master_product`, it is not an attribute

`Brand` is `brand_id`. Pack size is `pack_content_qty` with the category's unit of measure.
`HSN Code` is a column. Declaring any of them as attributes creates two sources of truth
for the same fact.

The dividing line to apply when drawing up attribute lists:

> **Packaging** quantities are columns — wire coil length, pipe length, paint pack size.
> **Product dimensions** stay attributes — bolt length, tile thickness, shower size.

This also dissolves a problem that would otherwise have hit Paint: a level-1 "Pack Size"
attribute in litres cannot describe putty, which is sold by weight, and `attribute.unit` is
a single column per attribute.

### 3. Stone variety is a column, not an attribute

0003 made the variety trade name the product's identity, but `attribute.data_type` is only
`enum | number | text | boolean` — there is no reference type, so an attribute cannot point
at `stone_variety`.

`master_product.stone_variety_id` is added, exactly parallel to `brand_id`. Identity lives
in columns. Rejected alternative: adding a `reference` data type plus a target-table column
to `attribute` — more machinery, for one case.

### 4. Attribute values: EAV as source of truth, plus a flattened JSONB cache

Both, not either:

- `master_product_attribute_value` stays the **source of truth** — values are constrained,
  validated against `attribute_value_option`, and safely editable by admins.
- `master_product.attributes_flat JSONB` is a **derived cache**, rebuilt on write, with a
  GIN index. Multi-attribute filtering becomes one index lookup instead of N self-joins.

## Why

The first three are corrections — the documents asserted something the concrete work showed
to be impossible. Recording them as decisions rather than silently editing 0001 follows the
supersede-don't-edit convention in this folder.

The fourth is the more interesting one. Pure EAV is why Magento has its reputation for slow
catalog queries: filtering on five attributes means five self-joins. Pure JSONB gives up
referential integrity on values, pushing all validation into the application and making a
typo in an enum value invisible to the database.

The hybrid is not a compromise here — it is **the same principle already established twice
in this project**. `search-architecture.md` precomputes `cached_best_price` on write rather
than joining on read; 0002 resolves attribute inheritance at write time so search sees a
flat list. `attributes_flat` is that pattern applied a third time, and it composes with the
inheritance flattening — both write paths produce the same JSONB document.

The cost is genuinely low because 0002 already established that search reads from the
external index, not from Postgres. So this choice governs only the admin/authoring path and
Phase-1 Postgres search — it is not on the critical path once Meilisearch lands.

## Consequences

- **`attributes_flat` can go stale.** It must be rebuilt whenever
  `master_product_attribute_value` changes *or* whenever an inherited `attribute` row
  changes — the second is easy to forget, since editing an attribute on `Tiles` invalidates
  the cache for every product beneath it.
- Global attributes cannot be scoped later without a data migration; a value that turns out
  to apply to only six of eight categories has to be redeclared per category.
- `master_product` now carries two nullable identity FKs (`brand_id`, `stone_variety_id`)
  that are mutually exclusive in practice but not enforced as such — a generic product has
  neither, a stone has variety, everything else has brand.
- The leaf-only constraint is enforced declaratively in the DDL via a generated column plus
  a composite foreign key against `category (id, is_leaf)`, rather than by trigger.

## Open questions

1. ~~**Where `attributes_flat` gets rebuilt**~~ — resolved by
   [0006](0006-constraint-and-cache-invalidation-mechanisms.md): row triggers for the two
   cheap cases, a queue drained by a background job for inherited-attribute changes.
2. Whether `attribute_value_option` should be enforced against
   `master_product_attribute_value` by FK rather than by service-layer validation. An FK
   only works for `data_type = 'enum'`, so it would be a partial constraint.

## Sources

None — this record resolves internal contradictions rather than external questions.
