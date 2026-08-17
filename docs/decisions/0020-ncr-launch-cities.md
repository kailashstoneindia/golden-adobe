# 0020 — Launch scope: Delhi NCR as five separate cities

- **Date:** 2026-08-17
- **Status:** Accepted
- **Supersedes / Superseded by:** Narrows the launch scope of [0018](0018-city-scoped-search.md)
  and [0019](0019-search-followups.md); does not change either mechanism.

## Context

> *"our app will be launched in Delhi NCR first, so we just need to have pincode and
> availability data for NCR only."*

Straightforward on the surface, except **NCR is not one city administratively.** It spans
three states/union territories:

| Area | State/UT |
|---|---|
| Delhi | NCT of Delhi |
| Gurugram | Haryana |
| Faridabad | Haryana |
| Noida | Uttar Pradesh |
| Ghaziabad | Uttar Pradesh |

`city.state` (0018) already exists specifically to disambiguate same-named cities across
states — this decision is the first real test of why that column is there.

The question that needed asking before seeding anything: does a customer in Gurugram see
Delhi/Noida vendors too — treating "NCR" as one unified metro market — or does each area
stay its own walled market, consistent with *"local vendors in that area or city"*
([0018](0018-city-scoped-search.md))?

## Decision

**Five separate `city` rows** — Delhi, Gurugram, Faridabad, Noida, Ghaziabad — each with its
own `is_active` flag and its own `pincode_city_map` entries. A Gurugram customer sees only
Gurugram vendors, never Delhi's.

```sql
INSERT INTO city (name, slug, state, centroid_lat, centroid_lng, is_active) VALUES
  ('Delhi',     'delhi',     'Delhi',         28.6139, 77.2090, true),
  ('Gurugram',  'gurugram',  'Haryana',       28.4595, 77.0266, true),
  ('Faridabad', 'faridabad', 'Haryana',       28.4089, 77.3178, true),
  ('Noida',     'noida',     'Uttar Pradesh', 28.5355, 77.3910, true),
  ('Ghaziabad', 'ghaziabad', 'Uttar Pradesh', 28.6692, 77.4538, true);
-- Centroids are approximate city-centre coordinates, for illustration.
-- Exact values to be confirmed at seeding time, not treated as final here.
```

No new mechanism — this is the "separate cities" option, using exactly the model 0018
already built.

## Why

**Matches what was already decided, not a new rule.** 0018's answer to "should search span
multiple cities" was no. NCR being colloquially "one region" doesn't change that a customer
in Gurugram and a vendor in Old Delhi are not local to each other in the sense the business
defined — city-level, not radius, not region.

**This is exactly the tight-boundary case 0018's open question 1 was worried about.** Delhi,
Gurugram, Noida, Ghaziabad and Faridabad sit within roughly 30–40 km of central Delhi — far
closer together than a hypothetical Delhi/Mumbai/Bangalore launch would be. Centroid-nearest
GPS resolution is *more* likely to misjudge a boundary customer here than in a spread-out
launch, not less. This raises the priority of getting pincode data right for this launch,
rather than treating it as a background concern — pincode should be the primary signal for
NCR, with coordinates as the tie-break 0019 already specifies, not the reverse.

## Consequences

- **`pincode_city_map` seeding scope narrows sharply — the good news in this decision.**
  Not "all of India," not even "all of the NCR Planning Board's ~24-district definition" —
  just the pincodes for these five named areas. A tractable, boundable dataset instead of an
  open-ended one, which was previously the biggest unknown in Phase 6 (search).
- **The exact area list still needs a sign-off, not just a name.** "NCR" colloquially means
  the five areas above to most consumers, but the NCR Planning Board's official definition
  is much broader (Sonipat, Panipat, Alwar, Meerut, Rewari, Bulandshahr and more). Recommend
  starting with the five named here — narrow launch, same philosophy already stated for
  categories in `catalog-build-order.md` Phase 0 — and expanding later on demand, not
  guessing the full list now.
- **Greater Noida is deliberately not separated out here.** Treat it as part of Noida's
  `pincode_city_map` entries unless vendor density there argues otherwise; revisit as a
  seeding-time decision, not a schema one.
- No schema change. `city.state` already supports this; this decision is purely about
  **which rows get seeded**, not how the table works.
- Closes the "how much pincode data do we actually need" half of 0018 open question 3 —
  scope is now known. The "who sources it and seeds it" half is still open.

## Open questions

1. **Simultaneous launch across all five, or staggered** (e.g., Delhi + Gurugram first,
   Noida/Ghaziabad/Faridabad following)? Not decided — an operations/go-to-market call, not
   a schema one. `city.is_active` supports either without changes.
2. **Exact pincode boundaries for each of the five**, sourced from the India Post dataset —
   still needs an owner, per [0018](0018-city-scoped-search.md) open question 3.
3. **Final centroid coordinates** — the values above are illustrative city-centre points,
   not verified for this decision.

## Sources

No new external research — geographic/administrative facts here (which state each NCR area
belongs to) are common knowledge, not independently verified for this record.
