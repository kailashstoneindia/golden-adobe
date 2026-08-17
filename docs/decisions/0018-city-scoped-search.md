# 0018 — City-scoped search: one document per (product, city)

- **Date:** 2026-08-17
- **Status:** Accepted
- **Supersedes / Superseded by:** Settles **S1**, the open question left at the end of
  [0017](0017-search-engine-choice.md) and in [search-system-design.md](../search-system-design.md).
  The zone/price-map option floated while S1 was still open (a price map per city inside a
  single per-product document) is **not** what this record adopts — see Options considered.

## Context

The business connects customers to **local** vendors. Explicitly, from this discussion:

> *"we have to search from the vendor in the current locality or city. Not from different
> cities... Our business is connecting customer from the local vendors in that area or
> city."*

This is a scope decision, not just a search-relevance one, and it exposed a gap checked
directly against the schema rather than assumed: **nothing in the database represents a
city.**

```
vendors: shop_name · address (free text) · latitude · longitude
                    ↑ no city column, no city table anywhere
```

`vendor_listing` carries `serviceable_pincodes TEXT[]` and `service_radius_km` — a
per-listing, radius-based model, inherited from `search-architecture.md`'s original sketch
and never revisited once the business model was stated explicitly.

## Options considered

### Option A — keep radius/pincode-array serviceability, no city entity

- **Pro:** No schema change; `serviceable_pincodes` already exists.
- **Con:** Models serviceability at the wrong granularity. A vendor does not serve
  different pincodes for different products — the array lives on `vendor_listing` because
  that was the unit `search-architecture.md` assumed, not because it varies per product.
- **Con:** A radius or a pincode set answers "is this pincode covered," not "which city is
  this." The business language is explicitly city-level ("in the current locality or
  city"), and nothing computes a city from a radius.

### Option B — zone/price-map inside a single per-product document

The option this discussion was heading toward before city-scoping was confirmed: one
document per product, carrying a nested price map keyed by zone (`price_by_zone.AHM`,
`.SRT`, `.IND`, …).

- **Pro:** One document per product — no duplication.
- **Con:** The sortable field is the problem. Meilisearch's `sortableAttributes` is a
  fixed, per-index setting — sorting by price means sorting by `price_by_zone.<X>`, a
  **different attribute for every city**, so launching a new city means an index settings
  change and a full reindex, not "more data arrives."
- **Con:** Was solving a problem this platform does not have. It exists to let ONE search
  answer questions about MANY cities at once. Every search here is filtered to exactly one
  city by requirement — so the multi-city document carries structure nothing ever reads.

### Option C — one document per (product, city), deterministic ID `{product_id}:{city}`

- **Pro:** `sortableAttributes: ['price']` — one plain field, forever. Launching city #6
  adds documents; it changes no settings and needs no reindex of anything already live.
- **Pro:** Deterministic IDs make the delete path a plain ID list — no filtered
  `deleteByFilter` calls, no query construction.
- **Pro:** Matches the stated business model exactly: search is inherently single-city, so
  the document should be too.
- **Con:** A product available in 5 cities is 5 documents. At this catalog's size
  (4,000–6,000 products × a handful of launch cities) this is small — tens of thousands of
  documents, not millions.
- **Con:** Requires a `city` entity, which does not exist yet, and a place to resolve a
  customer's location to one.

## Decision

**Option C.** One search document per `(master_product, city)`, ID `{product_id}:{city}`.
A product with zero listings from any vendor in a city has **no document** for that
pairing — confirmed explicitly:

> *"not for now, if product is not at local vendor then don't show."*

No "not available in your city" placeholder, no cross-city fallback result. Absence from
the index is the entire mechanism — nothing in the query layer needs to know *why* a
product is missing.

### The `city` entity, admin-curated

```sql
city (id, name, slug, state, centroid_lat, centroid_lng, is_active)
```

Not user-generated, not inferred on the fly — launching a city is a business decision
(onboard vendors, seed serviceability), so the row is created deliberately. `state`
disambiguates same-named cities. `centroid_lat/lng` exists for the GPS resolution path
below, not for browsing.

### One vendor, one city — for now

Confirmed directly: *"they serve one city for now."* Modelled as `vendors.city_id`, a
plain foreign key, not a join table. The **for now** is honoured by shape, not by a
workaround: moving to multiple cities per vendor later is widening the cardinality
(`vendors.city_id` → a `vendor_city` join table), never a rename or a data migration of
existing values.

### Serviceability moves off `vendor_listing`, onto the vendor

`serviceable_pincodes` and `service_radius_km` are removed from `vendor_listing`. A vendor
does not serve a different area per product — that was modelling serviceability a level
too fine, inherited from the original per-listing sketch in `search-architecture.md` and
never load-bearing once a vendor has exactly one city.

### Customer location — pincode or GPS, converging on one `city_id`

Confirmed both are fine: *"pincode or gps both will be fine."* They resolve differently,
and deliberately avoid a third-party dependency:

| Path | Mechanism | Why this shape |
|---|---|---|
| **Pincode** | `pincode_city_map` lookup table (`pincode → city_id`) | Pincodes do not self-describe a city; a lookup is unavoidable. Seeded from the public India Post pincode dataset — an open government dataset, not trade knowledge assembled by hand like `stone_variety` — filtered to launch cities and grown as new ones launch. |
| **GPS** | Nearest **active** city by haversine distance to `city.centroid_lat/lng` | Avoids a third-party reverse-geocoding API entirely. At launch-city scale (a handful of rows), a distance calculation over `city` is enough — no external call, no per-request cost. |

Both converge on a single `city_id` **before any product query runs.** Search, browse and
PDP all take that resolved city as a hard filter — never a fallback, never a ranking
signal.

## Why

### The sortable-attribute argument decided B vs. C, not intuition

This is the concrete, checkable reason C beats the zone/price-map idea, not a preference.
Meilisearch's `sortableAttributes` is declared once per index. A price-per-zone document
needs a distinct sortable field per zone that exists *at settings-definition time* — so
"launch city #6" becomes a schema change to the search index, not new data. Per-(product,
city) documents need exactly one sortable field, `price`, permanently. This also
retroactively confirms Option C would have been the right call even under the earlier,
weaker framing (S1 before city-scoping was confirmed) — B was carried forward past the
point it stopped being justified, and re-examining it here is what caught that.

### Deleting the last local vendor must delete exactly one document

This is the requirement that forced a change to the **sync design**, not just the document
shape — documented in full in
[`../search-schema.sql`](../search-schema.sql) section 2b. Short version: a vendor's *last*
listing for a product in a city being deleted must remove exactly that city's document,
not the product's documents in every other city it's still sold in. The row that knows
which city is the row that's about to disappear, so the city has to be captured **at
trigger time**, inside the same transaction — re-deriving it later from "what listings
still exist" would find nothing and silently leave a ghost document behind, forever, with
no error raised anywhere. This is the same failure shape already named as the central risk
of the whole sync design in 0017; this decision adds a second, more specific way to fall
into it.

### No third-party geocoding dependency at launch scale

Reverse-geocoding GPS coordinates to a pincode (Google Maps, Mapbox, etc.) is the more
"complete" approach and was considered implicitly. Rejected for now on the same
size-appropriateness logic as 0017: a haversine distance to a handful of city centroids is
free, has no external failure mode, and needs no API key or billing account. Revisit if
launch cities grow into the dozens and centroid-nearest starts misjudging boundary
customers often enough to matter.

## Consequences

- **`vendors.city_id` is a real migration on a table that already exists in production**
  (`apps/backend/database/migrations/20260630000000-create-vendors.js`). This decision
  designs the column; it does not write the migration. Flagged explicitly so it is not
  mistaken for a docs-only change the way most of this catalog work has been so far.
- `vendor_listing.serviceable_pincodes` and `.service_radius_km` are removed — never
  implemented in a real migration, so this is a design correction, not a data migration.
- **`master_product.cached_best_price` can no longer be shown to a customer.** It is a
  *global* cheapest-anywhere figure; once search is city-scoped that number is never the
  price to display. Repurposed as admin/ops visibility only (catalog monitoring — "is
  anyone stocking this at all"). The customer-facing price is resolved per (product, city)
  in the search document.
- **Search sync gains a third trigger function and 2 more triggers** (26 total, up from
  24) — one for `vendors.city_id` relocation, one for `city` rename/deactivation. Full
  detail in [`../search-schema.sql`](../search-schema.sql).
- `expand_search_outbox()` now returns `(master_product_id, city_id)` pairs, and the
  add-vs-delete decision is a single `EXISTS`-based query over those pairs, re-verified
  fresh rather than assumed from how a pair was discovered.
- Document count at launch: 4,000–6,000 products × 1 city = **comparable to the catalog
  size**, not a multiple of it. Grows linearly with city count, not combinatorially,
  because a product only has a document where it actually has a local listing.
- `search-system-design.md` section 5 (index topology) and the document-ID scheme need
  updating to reflect the deterministic `{product_id}:{city}` ID — done alongside this
  record.
- `pincode_city_map` needs a seed source and an owner, the same shape of requirement
  `catalog-build-order.md` already names for `stone_variety`.

## Open questions

1. **Centroid-nearest accuracy at city boundaries.** Accepted as a launch-scale trade-off;
   revisit if launch cities grow into the dozens.
2. **What happens when a customer's pincode/GPS resolves to nowhere active** — no city
   serves them yet. Not decided; likely a waitlist or "coming soon" state, but that is
   product/UX, not schema.
3. **`pincode_city_map` seeding** — the India Post dataset needs sourcing and an owner
   before Phase 6 (search) can proceed past launch-city scope.
4. Multi-city vendors are explicitly deferred ("for now"). The join-table migration path
   is noted above but not designed.

## Sources

- India Post pincode dataset — referenced as a known public/open dataset (city, district,
  state per pincode); not fetched or verified in this discussion. Sourcing it is Open
  question 3.
- [Meilisearch — sortable attributes](https://www.meilisearch.com/docs/learn/filtering_and_sorting/sort_search_results) —
  `sortableAttributes` is a per-index setting, consulted from prior verified reading in
  0017's research; not re-fetched in this discussion. Re-verify before implementation if
  this record is acted on far from its date.
