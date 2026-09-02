# 0019 — Search follow-ups: location resolution, admin search, autocomplete, synonyms

- **Date:** 2026-08-17
- **Status:** Accepted
- **Supersedes / Superseded by:** Amends [0018](0018-city-scoped-search.md)'s location
  resolution mechanism (below) — not a reversal, the outcome (one `city_id`) is unchanged;
  only the tie-breaking rule when both signals are present is new. Closes open questions
  left in [0017](0017-search-engine-choice.md) and [search-system-design.md](../search-system-design.md).

## Context

A single review pass over the open questions left by 0017 and 0018, in the shape of
[0014](0014-batch-resolutions.md). Six questions, five resolved outright.

---

## 1. City resolution combines pincode AND coordinates — amends 0018

0018 described pincode and GPS as two *separate* paths that "converge on the same
`city_id`" without saying what happens if both are available and disagree. They should be
combined, not chosen between:

> *"what if we get the location coordinates of the customer's construction site location
> and vendor's shop location... we can use a combination of both, many sites do that."*

```
resolve_city(pincode?, coordinates?)
  pincode      → pincode_city_map lookup      (official, coarse — India Post boundary)
  coordinates  → nearest active city centroid  (precise, real geography)

  both agree     → high confidence, done
  both disagree  → prefer coordinates — pincode boundaries are administrative,
                    not geographic; a single pincode can straddle two cities
  only one given → use it
  neither        → city picker / waitlist
```

**Why coordinates win on disagreement, not pincode:** a pincode is an India Post
administrative boundary, drawn for postal routing, not settlement geography — it can
legitimately span parts of two cities. A coordinate pair has no such ambiguity.

### Vendors get this for free

`vendors.latitude` / `.longitude` already exist in production
([20260630000000-create-vendors.js](../../apps/backend/database/migrations/20260630000000-create-vendors.js)) —
captured at signup, unused for city assignment until now. `vendors.city_id` (0018) can be
**auto-suggested from those coordinates** at signup — nearest active centroid — with the
admin free to override. No new column, no new capture step; it reuses data that was already
being collected.

### What this does not change

Still exactly one `city_id` per search, per 0018. This is a resolution-*accuracy* change —
better inputs, a tie-breaking rule — not a reopening of city-scoping itself.

### Still open

**Whether the customer's location is their live phone GPS or a saved project/delivery
address.** Raised, not yet answered. Construction materials are delivered to a site, not to
wherever the buyer is standing when they open the app, so this plausibly matters — but it's
an address-capture / ordering-domain question, not a resolution-algorithm one. The algorithm
above is agnostic to where `(pincode, coordinates)` came from, so nothing here is blocked by
leaving it open.

---

## 2. Multi-city vendors — reconfirmed deferred

> *"ignore it for now."*

No change from 0018. Recorded here only so this batch has one place answering all six
questions raised in the same pass.

---

## 3. Admin search stays on Postgres — not a preference, a structural fit

> *"can you elaborate any significant benefit of any approach for admin"*

The deciding fact isn't UX preference — it's that **one of the two options cannot represent
the data admin needs to search:**

```
A search document only exists where a LIVE vendor_listing exists, for a
(product, city) pair (0018). A draft product usually has ZERO listings yet
— nothing has been sold anywhere — so it has ZERO documents. There is
nothing in Meilisearch for admin to find until publish.
```

| | Postgres for admin | Meilisearch for admin |
|---|---|---|
| Can it show a draft product at all? | Yes — queries `master_product` directly | **No** — a draft with no listings has no document |
| Risk of a draft leaking to a real customer | None — separate code path entirely | One missed `status = 'live'` filter, ever, in one query |
| Extra sync volume | None | Every draft edit fires the sync pipeline for data nobody should see |
| Fit for the audience | Trained staff, near-exact queries (SKU, product code) — `pg_trgm` is enough | Typo tolerance mostly wasted here |

**Decision: admin search uses `PostgresSearchService`** — the same fallback path already
built for when Meilisearch is down (0017 §"Consistency and failure") now serves double duty
as the admin's primary path, not just an outage safety net. One additional reason that
fallback earns its keep.

Closes: 0017 open question 4; `search-system-design.md` open question 7.

---

## 4. Autocomplete — direct-to-Meilisearch, approved

> *"yes we need this."*

Clarified first, since "autocomplete" was ambiguous: this is a **product/query suggestion
dropdown** —

```
┌─────────────────────┐
│ ceme|                │  ← customer typing
├─────────────────────┤
│ 🔍 Cement            │  ← appears live, before Enter
│ 🔍 Cement Mixer      │
│ 🔍 Cement Bags 50kg  │
└─────────────────────┘
```

— not phone-keyboard next-word prediction, which is a different system entirely and not
something a search engine provides.

**Decision:** the app talks to Meilisearch **directly** for this specific endpoint, using
the search-only key (documented by Meilisearch as safe to expose client-side — verified in
0017's research). The general search proxy through NestJS (0017 §"Consistency and failure",
"Proxy, not direct-to-Meilisearch") is unchanged for everything else — full search still
needs server-side `city_id` enforcement and price hydration is no longer even needed there
(the document already carries `price`, per the earlier correction).

**Why this endpoint specifically is safe to take direct, when full search isn't:** a
suggestion dropdown returns query strings / lightweight matches, not priced, city-scoped
purchase-ready results — there's no `city_id` trust boundary to enforce on a suggestion the
customer hasn't committed to yet. Full search still requires the resolved city and stays
proxied.

Closes: `search-system-design.md` open question 5.

---

## 5. Synonyms — approved, admin-editable

> *"let's be open for this."*

Read as: approved, and kept **open-ended** rather than a fixed one-time seed. Designed as an
admin-editable table, not a hardcoded settings blob — so `commode → water closet` or
`patti → strip` can be added the day someone notices a missed search, not only at a launch
data-entry pass. The list itself is domain content, needing the same seeding owner already
named for the catalog and for `pincode_city_map`.

Closes: 0017 open question 3; `search-system-design.md` open question 6.

---

## 6. Licensing — reconfirmed, nothing here touches Enterprise

> *"can all this be done without enterprise thing, we don't want heavy and legal stuff for
> now."*

Yes. Restated from 0017, because it bears repeating against this specific list: Meilisearch's
**only** Enterprise-gated feature is sharding. Combined location resolution, admin search on
Postgres, direct autocomplete, and an editable synonym table are all ordinary Community
Edition (MIT) functionality — sharding is not a scenario a catalog this size will ever reach.

This does not fully close 0017 open question 2 (whether the *official Docker image itself*
contains any Enterprise code) — that remains a one-email question for Meilisearch, worth
asking only if the client's counsel wants it in writing. Nothing in this record depends on
its answer.

## Consequences

- `resolve_city()` (0018) gains a precedence rule; implementation is one small function, no
  schema change.
- Vendor onboarding can pre-fill `city_id` from existing `latitude`/`longitude` — a
  service-layer improvement, not a migration.
- `PostgresSearchService` (0017) is promoted from "outage fallback only" to "outage fallback
  **and** admin's primary search path" — raises its priority in build order, since admin
  needs it from day one of Phase 6, not only once Meilisearch exists.
- A new small entity: an admin-editable synonym list. Not designed in detail here — table
  shape is trivial (`term`, `synonyms[]`), deferred to whenever the seeding owner is named.
- The autocomplete endpoint needs its own, narrower search-only Meilisearch key scope,
  separate from the general one — a configuration detail, not a design one.

## Open questions

1. Customer location source — live GPS vs. saved project/site address. Address-capture /
   ordering-domain question, not blocking search.
2. Synonym table's exact shape and admin UI — deferred to the seeding owner discussion.
3. Carried from 0017: whether the official Meilisearch Docker image is purely Community
   Edition. Unblocked either way; ask only if counsel wants it documented.

## Sources

No new external research this pass — this record closes prior open questions using
information already verified in 0017 and 0018 (search-only key safety, Enterprise feature
scope) plus direct answers from this discussion.
