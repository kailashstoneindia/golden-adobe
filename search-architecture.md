# Search Architecture

## Core principle

Never search the transactional database directly. Postgres (the schema in `construction-marketplace-catalog-schema-mvp.md`) stays the source of truth for writes — vendor updates price, stock changes, admin adds a product. Search reads from a separate, denormalized index built for fast lookups and filtering, kept in sync with Postgres.

This split exists because relational databases are structurally bad at two things e-commerce search needs constantly:
- **Full-text search** — SQL has no efficient way to do "find all products matching these words," especially with typos/partial matches. Search engines solve this with an **inverted index** (a map of word → product IDs), making lookups near-instant instead of scanning rows.
- **Multi-attribute filtering** — filtering by category + brand + grade + price range simultaneously means multiple joins in SQL. In a search index, each attribute is indexed directly as a filterable field, so combined filters are fast by design.

Without this split, large catalogs on plain SQL hit real failure modes as they grow: full-text queries timing out, the database locking up under heavy filtering, search degrading or failing under traffic spikes.

---

## Request path

```
User types query
      │
      ▼
App server
      │
      ▼
Cache layer (Redis)  ──── hit ───▶ return cached results
      │ miss
      ▼
Search engine (Meilisearch / Typesense)
      │
      ▼
Return product IDs + data
      │
      ▼
Images/static assets served via CDN (not by app or search engine)
```

Repeated/common queries ("cement near me", "12mm TMT bar") get served from cache instead of hitting the search engine every time — this is a big part of why large platforms feel instant on popular searches.

---

## The sync pipeline (Postgres → Search index)

Postgres remains normalized and clean for writes. On any change to a product, price, or stock, push a **flattened, denormalized document** to the search index.

```json
{
  "id": "master_product_id",
  "name": "UltraTech OPC 53 Grade Cement, 50kg Bag",
  "category": "Cement",
  "brand": "UltraTech",
  "attributes": {
    "grade": "53",
    "pack_size": "50kg"
  },
  "cached_best_price": 385,
  "cached_best_vendor_id": "...",
  "in_stock": true,
  "serviceable_pincodes": ["380001", "380015", "..."]
}
```

Trigger for the sync: a DB trigger, an async job/queue on write, or an on-write hook in the app layer — doesn't need to be sophisticated at MVP scale, just needs to keep the index reasonably fresh.

**Precompute best price on write, not on search.** Add these to `master_product` in Postgres and recompute them whenever a `vendor_listing`/`inventory` row changes:
```sql
master_product.cached_best_price
master_product.cached_best_vendor_listing_id
master_product.cached_updated_at
```
Search results and initial PDP load read this column directly. Only the vendor-compare toggle (one product at a time) still needs the live join across `vendor_listing` + `inventory`.

---

## Tool choice

| Engine | When to use |
|---|---|
| **Meilisearch / Typesense** | Default choice for MVP and mid-scale (up to tens of millions of documents). ~80% of Elasticsearch's functionality at a fraction of the operational overhead — no cluster management, faster to set up. Meilisearch edges ahead on developer experience/setup speed; Typesense keeps its full index in RAM, so it's very fast but needs enough server memory to hold the whole catalog. |
| **Elasticsearch / OpenSearch** | Once catalog size or traffic genuinely needs distributed, multi-node search, or advanced analytics beyond product search. More powerful, more operational weight (cluster ops, JVM tuning). Not needed at MVP scale. |
| **Redis** | Sits in front of the search engine as a query cache. Cheap to add, worth adding even at MVP for repeated/popular queries. |
| **CDN** | Serves images and static assets so neither the app server nor the search engine handles that load. |

**Recommendation for this app:** start with Meilisearch or Typesense once product volume justifies moving off plain Postgres search (see rollout plan below). Elasticsearch is a later-stage upgrade, not a day-one requirement.

---

## MVP rollout plan

**Phase 1 — Postgres only (current stage)**
- Use the `cached_best_price` columns on `master_product`.
- Add standard indexes: `(category_id, status)`, `(price)`, and if attributes move to JSONB instead of separate EAV rows, a GIN index for filtering.
- This is comfortably fast (sub-100ms) up to tens of thousands of live listings — enough headroom for MVP and early growth.

**Phase 2 — Add Meilisearch/Typesense**
- Trigger: once search-as-you-type, typo tolerance, or multi-filter search (brand + grade + size + price together) becomes a real UX need, or catalog size starts showing Postgres slowdown.
- Build the sync pipeline (Postgres → flattened document → search index) using the document shape above.
- App queries the search index for all search/browse/filter traffic; Postgres stays the source of truth for everything else (cart, orders, inventory writes).

**Phase 3 — Add Redis caching + CDN**
- Add once query volume is high enough that repeated popular searches are worth short-circuiting before they hit the search engine.
- CDN for images should be in place well before this — it's cheap and independent of search scale.

---

## Summary

| Layer | Role |
|---|---|
| Postgres | Source of truth — all writes (vendor price/stock updates, product creation) |
| `cached_best_price` on `master_product` | Avoids live joins for "best price" on every search result |
| Meilisearch / Typesense | Actual search-as-you-type, filtering, typo tolerance (added in Phase 2) |
| Redis | Cache layer for repeated/popular queries (added in Phase 3) |
| CDN | Serves images/static assets, keeps that load off app and search servers |

Design the flattened document shape now even if you don't build the sync pipeline yet — it means adding the search engine later is a sync job, not a redesign.
