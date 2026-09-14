# 0021 — Search runtime: local-first build, and the 6c–6h sequence

- **Date:** 2026-09-01
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Phase 6's search runtime (6c Postgres path, 6e Meilisearch, 6f sync worker, 6g query layer,
6h rebuild job) has been fully designed — [0017](0017-search-engine-choice.md) picked
Meilisearch, [0018](0018-city-scoped-search.md) fixed the document grain,
[0019](0019-search-followups.md) settled location resolution and admin search,
[0020](0020-ncr-launch-cities.md) scoped launch to five NCR cities, and
[search-system-design.md](../search-system-design.md) specifies the module layout, worker
sequence and index settings in detail.

None of it is built. 6a/6b (geography, `search_outbox` and its triggers, the
`SearchDocument` type) shipped and were verified live; 6c–6h were deliberately skipped
mid-phase to pull Phase 7's integrity hardening forward, and are now being picked up.

Two things were still genuinely open, and neither is settled by 0017–0020:

1. **Where Meilisearch runs during development.** The design assumes a Railway service
   (`meilisearch.railway.internal:7700`). No Railway project or credentials exist yet.
2. **What order 6c–6h are built in, and where the checkpoints fall** — the design doc
   describes the finished system, not a build order.

## Options considered

### Option A — Provision Railway first, build against it

- **Pro:** Builds against the exact environment that will run in production; no
  environment-specific surprises at deploy time.
- **Con:** Blocks all of 6e–6h on an infrastructure/billing step that has nothing to do
  with the code. Needs credentials and an account that don't exist yet.
- **Con:** Every iteration during development goes over the network to a remote service —
  slower, and it burns a paid service for what is throwaway test data.

### Option B — Local Meilisearch in Docker Compose, Railway later

- **Pro:** Same official `getmeili/meilisearch` image, same HTTP API, same index settings
  as Railway would run. Nothing about the application code differs.
- **Pro:** Matches how Postgres and Redis are already run for this project
  ([docker-compose.yml](../../docker-compose.yml)) — one consistent local stack, one
  `docker compose up`.
- **Pro:** Deploying to Railway later is a change of `MEILI_HOST` and secrets, not a change
  of code — which [search-system-design.md](../search-system-design.md) section 11 already
  established as a design goal ("nothing in this design is Railway-specific except
  deployment configuration").
- **Con:** Deployment configuration itself (`railway.toml`, private networking, volume
  sizing) stays unwritten and unverified until someone actually provisions it.

### Option C — Skip Meilisearch, ship only the Postgres path (6c)

- **Pro:** Cheapest, simplest, no new service at all.
- **Con:** Abandons a decision already taken deliberately in
  [0017](0017-search-engine-choice.md) on grounds (typo tolerance, facets, relevance
  tuning) that have not changed.
- **Con:** The Postgres path is designed as admin search plus an outage fallback, not as
  the customer-facing engine. Promoting it to the primary path is a design reversal, not a
  scheduling choice.

## Decision

**Build the search runtime against a local Meilisearch container, in the order
6c → 6e → 6f → 6g → 6h, verifying each sub-phase against live services before starting the
next.**

The rule for the Railway gap, stated so it can be quoted back:

> **No Meilisearch host, key, or port may be hard-coded anywhere in application code.** All
> four of `MEILI_HOST`, `MEILI_MASTER_KEY`, `MEILI_SEARCH_KEY` and `SEARCH_ENGINE` are read
> from configuration. Moving from local Docker to Railway must require changing environment
> variables only — never a code edit.

Sub-phase order and what each must prove before the next begins:

| Order | Sub-phase | Must prove |
|---|---|---|
| 1 | **6c** Postgres search path | City filter excludes other cities; trigram catches a misspelling; the admin path finds a draft product that has no listing (0019's reason for existing) |
| 2 | **6e** Meilisearch + settings as code | Index exists with the exact declared settings; `typoTolerance.disableOnNumbers` genuinely stops `32A` matching `42A` |
| 3 | **6f** Sync worker | A listing price change reaches the index; deactivating the last listing **deletes** the document rather than leaving it stale |
| 4 | **6g** Query layer | Both engines return the identical `SearchDocument[]` shape; `SEARCH_ENGINE=postgres` switches path transparently; Meilisearch being down falls back instead of erroring |
| 5 | **6h** Rebuild job | Search stays continuously available across a full rebuild and index swap |

6c ships first specifically because it is **not scaffolding** — per
[0019](0019-search-followups.md) it is permanent, serving as both admin's primary search
path and the outage fallback, so it is a legitimate standalone checkpoint.

## Why

Meilisearch is the same software whether it runs in Docker locally or on Railway — it is a
single self-contained binary with an HTTP API and no managed-service coupling. There is no
class of bug that only appears on Railway but not in the identical container locally,
excepting deployment concerns (private networking, disk type, memory limits) which are
infrastructure questions and cannot be verified from application code regardless of where
development happens.

Blocking five sub-phases of application work on an unrelated billing and provisioning step
would be sequencing by accident rather than by dependency. The dependency that actually
exists — 6a/6b's outbox and geography — is already satisfied.

The costs of deferring Railway are real but bounded and named: `railway.toml`, private
networking and volume sizing remain unwritten and unverified. Two constraints from
[search-system-design.md](../search-system-design.md) section 11 must be honoured whenever
that provisioning does happen — **Meilisearch needs local disk, not network storage**
(it memory-maps LMDB), and **Redis hash tags** matter if Redis ever becomes clustered.
Recording them here means they are not rediscovered at deploy time.

## Consequences

- `docker-compose.yml` gains a `meilisearch` service, so the local stack is now three
  containers. `docker compose up` remains the single command to start everything.
- Three new dependencies enter the backend: `meilisearch`, `bullmq`, `@nestjs/bullmq`.
- The search worker runs **in-process inside the backend** at launch, not as a separate
  service. [search-system-design.md](../search-system-design.md) section 10 anticipates
  splitting it into its own Railway service later; that split is deferred, and the
  `WORKER_MODE` flag exists so it costs an env var rather than a refactor when it happens.
- Recurring infrastructure cost at launch is **one small container** — roughly $5–15/month
  on Railway at 5 cities × 4,000–6,000 products (~20,000–30,000 documents, which is
  negligible for Meilisearch). Meilisearch itself is open-source with no licence fee.
- **The sync pipeline becomes a permanent correctness liability**, as
  [search-system-design.md](../search-system-design.md) section 10 already warned: any
  future write path that bypasses `search_outbox` yields a stale index that raises no error.
  This is the standing reason 6c's Postgres path is never deleted.
- Testing follows this project's current standing instruction — **manual verification with
  throwaway scripts, deleted after use; no new `.spec.ts` files.** The existing 25-test
  catalog suite stays protected from regression but is not grown.

## Corrections found by building it

> [!NOTE]
> The three corrections below are the ones that change *this decision's own assumptions*.
> The defects found in the application code while implementing it — including two that would
> have reached production — are recorded separately in
> [search-runtime-build-log.md](../search-runtime-build-log.md), along with what is still
> open and why.

Three assertions in the existing design did not survive contact with a real Meilisearch
server. All three were found by running the thing, not by reading about it — the same way
`search-schema.sql`'s transition-table bug was found in 6a.

### 1. The document id separator cannot be `:`

[0018](0018-city-scoped-search.md) specifies the document id as `{product_id}:{city_id}`,
and [search-system-design.md](../search-system-design.md) section 5 repeats it. **Meilisearch
rejects it outright** — `invalid_document_id`: an id may contain only `a-z A-Z 0-9`, `-` and
`_`. Every single indexing task would have failed, and because the worker batches, the
failure would have surfaced as "the index is mysteriously empty" rather than as an obvious
error at the call site.

The separator is now `__`, not `-`, because UUIDs already contain hyphens and a single
hyphen would make the id ambiguous to split. `buildSearchDocumentId` and a new
`parseSearchDocumentId` in `packages/types` are the only places that know this.

### 2. `typoTolerance.disableOnNumbers` needs a much newer Meilisearch than v1.11

The compose file initially pinned `v1.11`, which was the latest version this project's
design work referenced. That release **does not support `disableOnNumbers` at all** — the
server responds `Unknown field 'disableOnNumbers' inside '.typoTolerance': expected one of
enabled, minWordSizeForTypos, disableOnWords, disableOnAttributes`.

Since section 5 of the design doc calls this *"the one setting that must not be missed"*
(32A must never match 42A), the fix is the version, not a workaround. Pinned to
**v1.53.1**, where it is supported and verified working. Note that a Meilisearch data volume
is not backward compatible across a jump like this — upgrading needs `MEILI_UPGRADE_DB` or a
rebuilt index, which is exactly what 6h exists to do.

### 3. Meilisearch synonyms are one-directional

Declaring `mcb -> ['breaker']` makes a search for "mcb" find breakers, but a search for
"breaker" finds **nothing**. Nothing in 0019 or the design doc mentions this, and an admin
filling in a synonym row plainly means "these terms mean the same thing" — so half of every
synonym they entered would silently not work.

`buildSynonymMap` now expands each row into a full equivalence group: every term maps to
every other term in its group, in all directions, multi-word phrases included.

## Open questions

- **Railway provisioning itself** — `railway.toml`, private networking, Meilisearch volume
  sizing and the production key rotation story. Deliberately not settled here; it is an
  infrastructure discussion, and this record's configuration rule is what keeps it from
  becoming a code change.
- **Whether the worker is ever split into its own service.** Deferred until there is load
  evidence that it needs to be; `WORKER_MODE` keeps the option open.
- **Synonym administration UI.** [0019](0019-search-followups.md) decided synonyms are
  admin-editable and live in a table; who edits them and through what screen is an admin
  panel question, not a search runtime one.

## Sources

- [search-system-design.md](../search-system-design.md) — sections 4 (sync worker), 5 (index
  topology), 8 (module layout), 9 (configuration), 10 (cost), 11 (portability)
- [catalog-build-order.md](../catalog-build-order.md) — Phase 6 sub-phase definitions
- Meilisearch is distributed under the MIT licence; self-hosting carries no licence cost.
