# 0006 — Leaf-only enforcement and `attributes_flat` invalidation

- **Date:** 2026-08-02
- **Status:** Accepted
- **Supersedes / Superseded by:** Resolves open question 1 of
  [0005](0005-attribute-storage-and-identity-columns.md)

## Context

Two mechanisms were left unsettled when `catalog-schema.sql` was first written:

1. **Leaf-only attachment** (decision 0001) was enforced with a composite-foreign-key
   trick — `UNIQUE (id, is_leaf)` on `category`, a `GENERATED ALWAYS AS (TRUE)` column on
   `master_product`, and an FK against `(id, is_leaf)`. Declarative and complete, but
   obscure enough that a reader has to work out *why* it functions.
2. **`attributes_flat` invalidation** (decision 0005) had no defined rebuild path, and its
   most easily forgotten case — an inherited attribute changing — can affect tens of
   thousands of product rows.

## Decision

### Leaf-only attachment moves to triggers — but needs two, not one

`master_product.category_id` becomes an ordinary foreign key, with
`enforce_master_product_leaf_category()` running `BEFORE INSERT OR UPDATE OF category_id`.

**The swap is not free.** The composite FK enforced *both* directions: `ON UPDATE RESTRICT`
also prevented a category from flipping `is_leaf` to `FALSE` while products referenced it.
A trigger on `master_product` only guards the insert side, so a second trigger —
`enforce_category_leaf_transition()` on `category` — is required to stop a leaf gaining a
child while products are attached to it.

That gap is the substantive part of this decision. Without the second trigger, the swap
would have quietly lost a guarantee rather than merely changed how one is expressed.

### `attributes_flat` has three invalidation sources, handled two different ways

| Source | Scope | Handling |
|---|---|---|
| Product's own values change | One row | Row trigger on `master_product_attribute_value`, inline |
| Product moves category | One row | Row trigger on `master_product`, `AFTER UPDATE OF category_id` |
| An `attribute` row changes | Whole subtree | **Enqueued** to `catalog_reindex_queue`, drained by a background job |

The first two are cheap and immediate. The third must not run inline: editing an attribute
on `Tiles` invalidates every product beneath it, and an admin saving one form should not
block on a bulk update of thousands of rows inside their transaction.

A global attribute (`category_id IS NULL`, per 0005) enqueues `scope = 'all'`.

`build_attributes_flat()` also filters out values whose attribute is no longer in scope —
deactivated, or moved to a different branch — so the flattened document self-heals rather
than accumulating orphaned keys.

## Why

Triggers over the composite FK purely for legibility. The FK trick is correct and slightly
stronger, but it depends on a reader recognising why a column that is always `TRUE` is
load-bearing. A named function that raises a clear exception is easier to maintain, and the
second trigger restores what was lost.

The queue exists because the three invalidation sources differ by orders of magnitude in
cost, and treating them uniformly would mean either blocking admin writes on bulk rebuilds
or leaving the cache stale. Enqueuing preserves the write-time-flattening principle from
0002 and 0005 without putting a subtree rebuild on a user-facing code path.

## Consequences

- **Two triggers must stay in sync conceptually.** Someone removing the `category` trigger
  as redundant would reopen the orphaning gap silently, since nothing would fail
  immediately.
- **The drainer ships with the schema.** `drain_catalog_reindex_queue()` takes an advisory
  lock (returning `-1` rather than raising if another drain holds it), applies a `NOW()`
  cutoff so entries enqueued mid-drain stay pending, collapses category subtrees whose
  ancestor is also pending, and marks rows processed. All the caller supplies is a
  schedule. `catalog_reindex_backlog` exposes the pending count and oldest age for
  alerting.
- **Bulk writes have an escape hatch.** `catalog.suppress_flat_rebuild` is a
  transaction-local setting; while it is `on`, both row triggers enqueue a `product`-scope
  entry instead of rebuilding inline. An import writing 50 attribute values for one product
  therefore rebuilds its JSONB once, at drain time, rather than 50 times.
- The subtree collapse in step 2 of the drainer relies on `category.path` prefix matching —
  a second payoff for denormalizing that column beyond breadcrumbs.
- Products covered by both a subtree rebuild and an individual entry are rebuilt twice.
  Wasteful, never wrong; deduplicating across scopes was not worth the complexity.
- `catalog_reindex_queue` is deliberately generic (`scope`, `reason`) so the same table can
  later drive search-index sync, which faces exactly the same invalidation sources.

## Open questions

1. **What schedules the drainer.** The function itself is written, idempotent and
   collapsing; only the timer is undecided — a NestJS `@Cron` task, `pg_cron` if the
   Railway Postgres image has it, or an external worker. A NestJS task is the least
   infrastructure and keeps it deployable with the API.
2. Whether `updated_at` should advance when only `attributes_flat` is rebuilt. Currently the
   value-change trigger touches it and the move trigger does not, which is inconsistent —
   it matters if `updated_at` ever drives incremental search sync.

## Sources

None — internal mechanism design.
