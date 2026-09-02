# Search Runtime (6c–6h) — Build Log and Open Defects

**As of 2026-09-01.** Companion to
[decisions/0021-search-runtime-build-plan.md](decisions/0021-search-runtime-build-plan.md),
which records the *plan*. This file records what actually happened while building it: the
defects found by running the code against live Postgres, Redis and Meilisearch, and — for
anything still open — why it is still open.

Status summary: **6c, 6e, 6f, 6g and 6h are all done and verified.** 6g and 6h were
completed on a second pass the same day — see [O1](#o1--resolved) and [O2](#o2--resolved).
Combined 6g+6h verification: **46 checks, 0 failures.**

---

## Why this file exists

Ten defects are recorded below. Every one was invisible to code review, to `tsc`, and to the existing
25-test Jest suite, and surfaced only when the real application was booted against real
services. Two of them — B1 and B2 — were latent bugs that would have reached production,
and B1 had already been sitting in the codebase for several days.

B9 is worth singling out: it was **hidden by B2**. While indexing failures were being
swallowed, a completely broken document id looked like a successful drain. Fixing the
silent-failure bug is what made the real one visible — which is the argument for fixing
silent failures even when nothing appears to be wrong.

The pattern worth keeping: **a green build and a green test suite said nothing about
whether the application could start.** Nobody had booted it since Phase 6a.

---

## Defects found and FIXED

### B1 — The application could not boot at all ⚠️ pre-existing, would have blocked deploy

`Vendor` has declared `@BelongsTo(() => City)` since Phase 6a added `vendors.city_id`, but
`City` was never added to `DatabaseModule`'s eager `models: []` list. Models listed there are
associated at connection time, *before* `CatalogModule`'s `forFeature` has registered `City`.

```
Error: City has not been defined
  [SequelizeModule] Unable to connect to the database. Retrying (1)...
  ... retrying forever, application never starts
```

**Why nothing caught it:** the Jest suites build their own Sequelize instance from
`test-db.ts`, which registers every model in one explicit list — so the association always
resolved there. `nest build` type-checks fine because the decorator is valid TypeScript. The
bug only exists at *runtime module-init ordering*, and nothing had exercised that path since
6a landed.

**Fix:** register `City` alongside `Vendor` in
[database.module.ts](../apps/backend/src/core/database/database.module.ts), with a comment
explaining why it cannot be left to `autoLoadModels`.

**Rule this establishes:** a model eagerly registered in `DatabaseModule` drags its whole
association graph with it. Adding a `@BelongsTo` to `User`, `Vendor`, `RefreshToken` or
`VendorAccountDetails` means adding the target model there too.

---

### B2 — Meilisearch indexing failures were silently swallowed ⚠️ the exact failure mode the design warns about

`MeiliClient.addDocuments` awaited `tasks.waitForTask(...)` and then returned. But
`waitForTask` resolves when a task reaches **any terminal state** — `succeeded` *and*
`failed` alike. It does not throw.

The consequence is the worst kind:

```
addDocuments(3 docs) → task fails → waitForTask resolves normally
  → OutboxPoller logs "3 indexed"
  → mark_search_outbox_processed() marks the rows done
  → the documents are gone, and NOTHING will ever re-enqueue them
```

The drain reported `3 pairs -> 3 indexed` while the index genuinely held **0 documents**.

**Why this matters more than the average bug:**
[search-system-design.md](search-system-design.md) section 10 names this precise scenario as
the single largest cost of leaving Postgres — *"a stale index that never errors and nobody
notices until a customer reports a wrong price."* The code had implemented exactly that.

**Fix:** an `awaitTask()` helper in
[meili.client.ts](../apps/backend/src/modules/search/meili/meili.client.ts) that inspects
`task.status` and throws with the Meilisearch error code when it is not `succeeded`. Because
the poller marks rows processed only after every batch resolves, a throw now correctly
leaves the whole cutoff window unprocessed for the next cycle.

---

### B3 — `similarity()` cannot do keyword search

The Postgres path filtered with `similarity(mp.name, :query) >= threshold`. Measured against
real data:

| Expression | Score |
|---|---|
| `similarity('V6G Havells MCB 32A C-Curve', 'MCB')` | **0.148** |
| `word_similarity('MCB', 'V6G Havells MCB 32A C-Curve')` | **1.0** |

`similarity()` compares two strings *as wholes* and penalises length difference, so a short
keyword against a full product name always scores near zero. No threshold can accept 0.148
without also accepting noise — the customer-facing search returned nothing for every query.

`word_similarity()` finds the best-matching word run *inside* the target: exact keyword 1.0,
the typo `Havels` 0.71, unrelated text 0.0.

**Fix:** all four call sites in
[postgres-search.service.ts](../apps/backend/src/modules/search/fallback/postgres-search.service.ts)
switched to `word_similarity(:query, mp.name)`, threshold raised from 0.2 to 0.5 (which is
*stricter* under the new operator, not looser).

---

### B4 — `set_limit()` as a second statement silently returned the wrong result set

The original query was built as `SELECT set_limit(0.2); <the real query>`. Sequelize returns
the **first** statement's result for a multi-statement query, so every row came back as
`{ set_limit: 0.2 }` — no `updated_at`, no `name`, nothing. Downstream that surfaced as:

```
TypeError: Cannot read properties of undefined (reading 'toISOString')
```

…which is a 500, not an empty result — so the fallback path itself was crashing.

**Fix:** the threshold is compared inline in the `WHERE` clause instead. No session state, no
second statement, and the query no longer depends on server-level `pg_trgm` configuration.

---

### B5 — The advisory lock leaked across pooled connections

`pg_try_advisory_lock` is **session-scoped** — it belongs to the connection that took it.
`OutboxPoller` called `sequelize.query()` for the lock and again for the unlock, and
Sequelize pools connections, so the two frequently landed on different backends. The unlock
then silently no-opped and the lock stayed held until that connection was recycled.

Symptom: the first drain works, and every subsequent drain returns `ranDrain: false`
forever. In production the sync pipeline would wedge shortly after start-up, and — per B2's
theme — nothing would raise an error.

**Fix:** `drainOnce()` now takes one connection from the pool via
`connectionManager.getConnection()` and pins every statement of the drain to it, releasing it
in a `finally`. Verified by running three consecutive drains and confirming `ranDrain: true`
each time.

---

### B6 — Array parameters must use `bind`, not `replacements`

`SearchDocumentBuilder` passed candidate pairs as `CAST(:productIds AS uuid[])` with
Sequelize `replacements`. `replacements` expands a JS array into a comma-separated list
(intended for `IN (...)`), so Postgres received bare text:

```
malformed array literal: "550e8400-e29b-41d4-a716-446655440000"
```

Inside the BullMQ worker this surfaced only as `syntax error at or near ","` on 40 failed
jobs — the queue was consuming and failing silently.

**Fix:** `bind: [productIds, cityIds]` with `$1`/`$2` placeholders, which passes arrays
through as real parameters.

---

### B7 — `@Injectable()` above `@Processor()` stops BullMQ discovering the worker

`IndexingProcessor` was decorated with both. `@Processor` already marks the class for
injection, and stacking `@Injectable()` on top overwrites the processor metadata
`BullModule` scans for. The scheduler still registered and jobs still accumulated in Redis
(61 delayed keys observed) with nothing consuming them.

**Fix:** removed `@Injectable()`, with a comment so it is not re-added.

---

### B8 — Wrong enum values in 6c (mine, caught immediately)

`AdminSearchInput.status` was typed `'draft' | 'live' | 'archived'` and a verification script
used `'inactive'` for listings. The real enums are `master_product_status =
draft | pending_review | live | deprecated` and `vendor_listing_status =
active | paused | out_of_stock`. Caught on first execution against the database.

---

### B9 — The shared types package was stale, so the ID fix never reached the backend

`buildSearchDocumentId` was corrected to use `__` in
`packages/types/src/search.types.ts`, but the backend imports the package's **compiled
`dist/`**, which was never rebuilt. So the running code kept emitting the old colon form and
every indexing task was rejected.

This was invisible until B2's fix existed: with failures silently swallowed, the drain
reported "3 indexed" and moved on. As soon as `awaitTask` started throwing, the real error
appeared immediately:

```
Meilisearch addDocuments(3) did not succeed — invalid_document_id:
Document identifier "89a3c851-…:3b4c3da6-…" is invalid.
```

**Fix:** rebuild `packages/types`. **The underlying trap:** `npx nest build` inside
`apps/backend` does *not* rebuild workspace dependencies. Turbo's root `build` task declares
`dependsOn: ["^build"]` and does handle it — so `pnpm build` from the root is correct and
`npx nest build` alone is not, any time `packages/types` has changed.

---

### B10 — A cached response reported the wrong engine, masking an outage

`SearchService` returned cached entries with their stored `engine` and `degraded` values. A
response cached while Meilisearch was healthy would therefore keep reporting
`engine: meilisearch, degraded: false` *during* an outage — the hits were correct, but the
operational metadata lied, and `degraded` is exactly the field an operator would alert on.

**Fix:** a `servedFromCache` flag on `SearchResponse`. `engine` and `degraded` still describe
how those hits were produced (which is what they are for), while `servedFromCache: true`
tells the caller this request never touched either engine — so a cached `degraded: false` can
no longer be misread as a live all-clear.

---

## RESOLVED — items previously open

### O1 — RESOLVED

6g's Meilisearch-path assertions now pass. **Combined 6g+6h verification: 46 checks, 0
failures.**

The diagnosis recorded when this was open was correct but incomplete. The harness *was*
contending with the scheduled drain for the advisory lock — fixed by the `WORKER_MODE` work
below — but underneath that sat **two genuine product defects** (B9 and B10) that the
contention had been hiding. Resolving O1 therefore meant fixing real bugs, not only the
harness:

- **`WORKER_MODE` is now real configuration**, not just a comment. `all` (default) runs HTTP
  and the drain together; `api` serves HTTP with no drain scheduled; `worker` runs the drain
  only. `IndexingProcessor` skips scheduling entirely under `api`. This is what
  [search-system-design.md](search-system-design.md) section 9 always specified, and it makes
  splitting the worker onto its own Railway service an env var rather than a refactor. It
  also makes a manual drain deterministic, which is what the verification needed.
- **B9** — the stale `packages/types/dist` meant document ids still contained a colon.
- **B10** — cached responses misreported `engine`/`degraded`.

What 6g now demonstrates end to end, through real HTTP: Meilisearch-backed results with
correct city-scoped prices, facet distribution, city isolation by pincode *and* by
coordinates, a client-supplied `city_id` being ignored, attribute and price filters, a
transparent Postgres fallback when Meilisearch is killed mid-run, identical document shape
from both engines, and `SEARCH_ENGINE=postgres` as a deliberate non-degraded mode.

### O2 — RESOLVED

6h is built: `SearchRebuildService` plus an authenticated `POST /admin/search/rebuild`.

A rebuild is requested by inserting an `entity_type='all'` marker into `search_outbox` — the
row is the audit trail of who asked and when, and it means a migration or a psql session can
request one too, not only the endpoint. `expand_search_outbox()` has always excluded those
rows deliberately, so the incremental drain ignores them and the rebuild job consumes them.

The job applies the **same settings** to the shadow index via the existing
`MeiliBootstrap.applySettings(indexUid)` (a shadow configured differently would swap in and
silently change ranking), rebuilds every current `(product, city)` pair from live state,
**verifies the document count before swapping** — swapping in a short index would be worse
than not rebuilding, because it looks healthy — then calls `swapIndexes` with
`rename: false`, which keeps the old index under the shadow name so it can be swapped back.

Verified: the incremental drain leaves the marker alone, the rebuild consumes it, all
documents are re-indexed, the swap is atomic, search keeps working with intact prices
across it, and the old index is retained.

### O3 — Facets absent from the Postgres path, unchanged and deliberate

Still true, still a choice: computing facets in Postgres would need a second aggregate query
per request, and that path exists for availability rather than feature parity. What changed
is that it is no longer silent — the response now carries `servedFromCache`, and the absence
of a `facets` key on a `degraded: true` response is a legible signal rather than a mystery.
The frontend must tolerate facets disappearing during a Meilisearch outage.

---

## Regression guard for B1

B1 — the application being unable to boot — is the defect most likely to recur, because any
future `@BelongsTo` added to an eagerly-registered model reintroduces it, and nothing in the
build or the test suite would notice.

`apps/backend/scripts/smoke.js`, run as **`pnpm smoke`**, boots the real application,
asserts it reaches a listening state, and asserts the routes it should expose are actually
mapped. It is a script rather than a `.spec.ts`, in keeping with this project's
manual-verification rule, and it was confirmed to work by reintroducing B1 deliberately and
watching it fail.

Run it after any change that adds a model, an association, a module, or a queue.

---

## Verification standard used

Every claim above rests on checks executed against live Postgres 16, Redis 7 and Meilisearch
v1.53.1 in this session — constraint violations and outages provoked deliberately, not
inferred from reading code.

**Counts: 6c 5/5 · 6e 12/12 · 6f 18/18 · 6g+6h 46/46.**

Per the standing instruction for this project, all verification used throwaway scripts
deleted immediately afterward; no new `.spec.ts` files were added, and the existing 25-test
suite is protected but not grown. `pnpm smoke` is the one durable artifact, and it is a
script, not a test suite.
