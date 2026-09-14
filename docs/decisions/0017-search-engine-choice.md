# 0017 — Search engine choice: Meilisearch

- **Date:** 2026-08-16
- **Status:** Accepted
- **Supersedes / Superseded by:** — (narrows the tool choice in
  [`search-architecture.md`](../../search-architecture.md), which offered "Meilisearch or
  Typesense" without testing the premise)

## Context

[`search-architecture.md`](../../search-architecture.md) was written before the catalog was
designed. It recommends Postgres for Phase 1 and "Meilisearch / Typesense" for Phase 2, and
justifies the split with:

> *large catalogs on plain SQL hit real failure modes as they grow: full-text queries timing
> out, the database locking up under heavy filtering*

That is a real risk **at millions of products**. This catalog is
[4,000–6,000 SKUs at launch](../catalog-build-order.md). The premise was never checked
against the actual number, and the whole engine question deserved re-opening before anything
was built on it.

Two questions had to be answered separately, and conflating them is the trap:

1. What is the *industry standard*?
2. What is right *here*?

## Options considered

### Option A — Postgres only (`tsvector` + `pg_trgm` + GIN on `attributes_flat`)

- **Pro:** Zero new infrastructure, zero new licence, zero sync pipeline, no staleness class
  of bug. **Every index it needs already exists in [`catalog-schema.sql`](../catalog-schema.sql)**
  (`idx_master_product_name_trgm`, `idx_master_product_attributes`).
- **Pro:** Transactionally consistent by construction — search can never disagree with the
  database.
- **Con:** Weak at typo tolerance blended with relevance ranking, and at search-as-you-type.
  Trigram similarity and `ts_rank` are two separate mechanisms that are awkward to combine
  in one query.
- **Con:** Synonyms exist (thesaurus dictionaries) but are clumsy to maintain.

### Option B — Meilisearch

- **Pro:** **MIT licensed** for everything this project uses (see licensing below).
- **Pro:** Typo tolerance, prefix/instant search, faceting and synonyms are first-class and
  need no tuning to be good.
- **Pro:** `disableOnNumbers` — an explicit switch for the failure mode that matters most in
  this catalog (see Why).
- **Pro:** Atomic index swap for zero-downtime rebuilds.
- **Con:** A second datastore, therefore a sync pipeline, therefore a permanent class of bug
  where the index silently disagrees with Postgres.
- **Con:** Asynchronous indexing — write-then-search is not immediate.

### Option C — Typesense

- **Pro:** Equivalent feature set; also has the numeric-typo switch
  (`enable_typos_for_numerical_tokens`).
- **Con:** **GPL-3.0.** Running it as a networked service is not a derivative work, so there
  is no practical obligation — but GPL reliably gets flagged in investor and acquirer due
  diligence, and that is a cost paid by the business, not by engineering.
- **Con:** In-memory index. Irrelevant at this size, but it makes cost scale with catalog
  growth rather than with traffic.

### Option D — Elasticsearch / OpenSearch

- **Pro:** The actual industry standard. DB-Engines ranks Elasticsearch first among search
  engines at roughly 4× Solr. OpenSearch is Apache 2.0 — the cleanest licence of any option
  here, with an explicit patent grant.
- **Con:** Sized for a problem this project does not have. A cluster to operate, JVM to tune,
  and far more operational weight than 5,000 documents can possibly justify.

### Option E — ParadeDB `pg_search`

- **Pro:** Architecturally the most elegant option — real BM25 relevance **inside Postgres**.
  No second datastore, no sync pipeline, no staleness, transactional consistency.
- **Con:** **AGPL-3.0.** The network clause is aimed squarely at exactly this use case:
  software serving users over a network. The worst licence fit on the list for a commercial
  marketplace.
- **Con:** Not available on managed Postgres. Neon stopped offering it to new projects in
  March 2026; Supabase never shipped it; RDS does not permit arbitrary extensions. Viable
  only because this project runs its own Postgres container on Railway — which means owning
  the upgrade path too.

### Option F — Algolia

- **Pro:** Best-in-class ecommerce search; the most-bought hosted option for ecommerce
  specifically.
- **Con:** Per-request billing, and data leaves the platform's infrastructure.

## Decision

**Meilisearch**, self-hosted on Railway, with the **Postgres path retained permanently as a
fallback** rather than discarded after Phase 2.

The engineering recommendation was Option A first, with Meilisearch introduced only on a
measured trigger (p95 search latency above 200 ms, or search-as-you-type becoming a
confirmed requirement). **The decision was to adopt Meilisearch directly.** This record
keeps both, because the mitigation follows from the disagreement: since Postgres search is
strong enough to serve this catalog on its own, keeping it wired as the fallback costs very
little and removes Meilisearch as a single point of failure.

**The rule going forward:** *search must degrade, never 500.* If Meilisearch is unreachable
or mid-rebuild, `SearchService` falls through to `PostgresSearchService`. A `SEARCH_ENGINE`
config flag forces this manually.

## Why

### Licensing decided more than performance did

Every option here can search 5,000 documents instantly. The features are close enough that
performance is not the differentiator at this scale — **licence exposure is**, because it is
the only cost that grows with the *business* rather than with the catalog.

| Option | Licence | Exposure for a commercial marketplace |
|---|---|---|
| Postgres | PostgreSQL (BSD-like) | None |
| OpenSearch | Apache 2.0 | None; includes a patent grant |
| **Meilisearch** | **MIT** (+ BUSL-1.1 for sharding) | **Attribution only** |
| Typesense | GPL-3.0 | Copyleft; due-diligence friction |
| ParadeDB | AGPL-3.0 | Network clause targets SaaS directly |

Meilisearch's `LICENSE` declares `SPDX-License-Identifier: MIT AND BUSL-1.1` — it is
**dual-licensed, not purely MIT**, which the README badge alone does not reveal. The only
Enterprise-gated feature is **sharding**, under BUSL 1.1, converting to MIT after four years.
At 4,000–6,000 documents sharding will never be reached, so this project lives entirely in
the MIT half. The obligation is one attribution line.

**One thing could not be verified:** Meilisearch's documentation does not state whether the
official Docker image contains EE code or whether a Community-only build is published. Using
the official image without enabling sharding is almost certainly fine, but "almost certainly"
is a licence read, not legal advice. One email to Meilisearch settles it if the client is
cautious.

This also **reverses an earlier suggestion in this same discussion**: ParadeDB was called
"interesting" on architectural grounds before its licence was checked. Architecture and
licence pointed in opposite directions, and licence won.

### Numeric typo tolerance is the deciding feature

Construction search is dominated by specification queries where a single character edit is a
*different product*:

| Query | Must not match |
|---|---|
| `32A MCB` | `32B` curve, `16A` |
| `2.5 sq mm` | `1.5 sq mm` |
| `600x600 tile` | `600x300` |

Meilisearch's default typo tolerance permits one typo at 5–8 characters and two at 9 or
more. Applied to this catalog that is not a nicety, it is **actively wrong**. Both
Meilisearch and Typesense ship an explicit off-switch (`disableOnNumbers`,
`enable_typos_for_numerical_tokens`); Meilisearch documents the result as *"queries with
numbers only return exact matches"*.

This is the strongest feature argument for leaving Postgres, and equally the strongest
argument that **an untuned search engine would be worse than Postgres here.** The setting is
not optional.

### On "industry standard"

Two different questions, two different answers:

| Question | Answer |
|---|---|
| Most deployed search engine | **Elasticsearch** — DB-Engines rank 1, ~4× Solr |
| Most bought for ecommerce | **Algolia** |
| What Meilisearch and Typesense are | **Challengers, not standards** |

So `search-architecture.md` recommended two products that are *not* the industry standard —
and was right to, for a reason it never stated: the standard is sized for problems this
project does not have. Choosing Elasticsearch here would be selecting operational weight in
exchange for capability that 5,000 documents cannot use.

### Why self-hosted on Railway

The project already deploys Docker services to Railway with private networking. Meilisearch
becomes one more container reachable only at `meilisearch.railway.internal` — so the master
key never crosses the public internet and there is no public port to secure. That is
strictly better than a hosted plan on both cost and exposure at this scale.

## Consequences

- **A sync pipeline becomes a permanent correctness liability.** Any write path that skips
  the outbox produces a stale index that *never errors*. Nobody notices until a customer
  reports a wrong price. This is the real price of leaving Postgres and the main reason the
  fallback path stays alive.
- Two new Railway services eventually (Meilisearch, and a worker once bulk reindexing starts
  competing with API latency); one at launch.
- New dependencies: `meilisearch`, `bullmq`, `@nestjs/bullmq`. Redis is already wired.
- A `search_outbox` table, 2 trigger functions and 24 statement-level triggers — see
  [`../search-system-design.md`](../search-system-design.md) for the design and
  [`../search-schema.sql`](../search-schema.sql) for the DDL. The trigger count is forced
  by Postgres: transition tables cannot be combined with `OR`, so each event needs its own
  declaration.
- **Write-then-search is no longer immediate.** The admin publish path must await the
  indexing task before returning, or an admin will search for the product they just created
  and not find it.
- `PostgresSearchService` must be written and *kept working*, which means it needs test
  coverage even though it is not the primary path. A fallback nobody exercises is not a
  fallback.
- One attribution line is owed in the app's licences page.
- **Elasticsearch is not foreclosed.** The document shape is engine-agnostic, so a later move
  is a re-index, not a redesign.

## Open questions

1. ~~S1 — the search document grain, and how location-dependent price is carried.~~
   **Resolved in [0018](0018-city-scoped-search.md):** one document per `(product, city)`.
2. Whether the official Meilisearch Docker image is purely Community Edition — a licence
   question for the client's counsel, not an engineering one. Still open; nothing depends
   on its answer (reconfirmed in [0019](0019-search-followups.md)).
3. ~~The synonym list.~~ **Resolved: approved, admin-editable** — [0019](0019-search-followups.md).
4. ~~Whether `draft`/`deprecated` products are indexed for admin search.~~ **Resolved:
   admin search stays on Postgres, structurally — a draft has no listings, so no document
   exists to find** — [0019](0019-search-followups.md).

## Sources

Fetched and verified during this discussion. Graded, because
[0012](0012-product-identity-and-deduplication.md) and
[0013](0013-identity-hash-for-unbranded-products.md) carry source-quality notes for a reason.

**Primary — repository and vendor documentation, read directly:**

- [Meilisearch `LICENSE`](https://raw.githubusercontent.com/meilisearch/meilisearch/main/LICENSE) — `SPDX-License-Identifier: MIT AND BUSL-1.1`, Copyright (c) 2019-2025 Meili SAS
- [Meilisearch — Enterprise and Community editions](https://www.meilisearch.com/docs/resources/self_hosting/enterprise_edition) — *"The only feature exclusive to the Enterprise Edition is sharding"*
- [Meilisearch — typo tolerance settings](https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings) — `disableOnNumbers`; 5–8 chars → 1 typo, 9+ → 2
- [Meilisearch — asynchronous operations](https://www.meilisearch.com/docs/learn/async/asynchronous_operations) — task states
- [Meilisearch — basic security](https://www.meilisearch.com/docs/learn/security/basic_security) — search-only keys are documented as frontend-safe
- [Swap Indexes API specification](https://specs.meilisearch.dev/specifications/text/0191-swap-indexes-api.html) — atomic, zero-downtime
- [Typesense repository](https://github.com/typesense/typesense) — GPL-3.0; in-memory
- [Typesense search API](https://typesense.org/docs/29.0/api/search.html) — `enable_typos_for_numerical_tokens`
- [ParadeDB repository](https://github.com/paradedb/paradedb) — AGPL-3.0; Tantivy-based
- [Elastic — "Elasticsearch is Open Source, Again"](https://www.elastic.co/blog/elasticsearch-is-open-source-again) — AGPL added alongside ELv2 and SSPL, 29 August 2024
- [Algolia — B2B personalized pricing](https://www.algolia.com/doc/guides/solutions/ecommerce/b2b-catalog-management/tutorials/personalized-pricing) — *"fewer than 100 pricing levels per product"* → nested attribute; the option S1 ultimately did **not** take, once the business was confirmed as single-city per search (0018)
- [PostgreSQL 16 — `CREATE TRIGGER`](https://www.postgresql.org/docs/16/sql-createtrigger.html) — *"Multiple events can be specified using `OR`, except when transition relations are requested"*; `OLD TABLE` only on `UPDATE`/`DELETE`, `NEW TABLE` only on `UPDATE`/`INSERT`. This is what forces one trigger per event rather than one per table (26 triggers over 12 tables as of 0018, up from 24 over 10).

**Third-party, weaker — used only for the "industry standard" framing:**

- DB-Engines search engine ranking — Elasticsearch first, ~4× Solr. Popularity index, not deployment count.
- PeerSpot mindshare (Elasticsearch 16.8%, Algolia 9.0%, Solr 5.2%, July 2026) — **review-site mindshare, not usage.** Directional only.

**Rejected as evidence:**

- Meilisearch's own blog posts comparing against Postgres and Elasticsearch — **vendor
  marketing**. The claim that "PostgreSQL will never be able to offer a search experience
  like Meilisearch" is a sales argument, not a measurement, and was not used.
- An aggregator blog stating Meilisearch is SSPL-licensed. **Factually wrong** — checked
  against the `LICENSE` file, which is why the licence was verified at source rather than
  from a badge.

**Not found:**

- Any engineering write-up from an Indian marketplace (Flipkart, Meesho, Udaan) on
  serviceability filtering in a search index. Searched; nothing exists publicly. Anything
  stated here about how *they* do it would be inference.
