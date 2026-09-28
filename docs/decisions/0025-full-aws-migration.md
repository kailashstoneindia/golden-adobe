# 0025 — Full AWS migration: target architecture and cost

- **Date:** 2026-09-18
- **Status:** Proposed
- **Supersedes / Superseded by:** Partially reconsiders [0021](0021-search-runtime-build-plan.md) (deploy target) and [0024](0024-product-images-gcs.md) (storage vendor), pending client decision

## Context

The whole app — backend (NestJS), admin frontend (React, Dockerized), Postgres, Redis, and
self-hosted Meilisearch — runs on **Railway** today ([railway.toml](../../railway.toml),
[apps/admin/railway.toml](../../apps/admin/railway.toml)), a decision [0021](0021-search-runtime-build-plan.md)
made deliberately for its local-Docker-parity development story. Product image storage
(workstream 3, in progress) was decided as **Google Cloud Storage** in
[0024](0024-product-images-gcs.md).

That GCS decision surfaced a real friction: Cloud CDN requires an external HTTPS Load
Balancer in front of a GCS bucket — GCS has no direct "attach a CDN" toggle the way S3 does
with CloudFront. Investigating that friction raised the broader question this record answers:
**should the client move everything to AWS**, rather than solving the CDN problem in
isolation.

This is deliberately scoped as its **own decision**, separate from workstream 3, because it
is a materially larger question — infrastructure vendor for the whole application, not just
where product photos live.

**Current state (confirmed by inspecting the repo, not assumed):**

- Backend: NestJS, Dockerized, deployed to Railway (root `railway.toml`)
- Admin frontend: React (not Next.js), Dockerized, deployed to Railway (`apps/admin/railway.toml`)
- Mobile: Expo/React Native — **not affected by any backend hosting decision**; distributed
  through app stores regardless of where the API lives
- Data: Postgres (`@nestjs/sequelize`), Redis (`ioredis`, `bullmq` for the search-sync worker)
- Search: self-hosted Meilisearch container, `v1.53.1` pinned, deliberately made portable by
  0021 ("nothing in this design is Railway-specific except deployment configuration")
- Object storage: GCS, per 0024, not yet provisioned
- Scale: ~160 seeded catalog products, **no live vendor or customer accounts, no production
  traffic yet** (confirmed with the client — this is a pre-launch, greenfield migration
  question, not a live-data cutover)

## Options considered

### Question 1 — compute target

#### Option A — ECS Fargate

- **Pro:** Closest match to what Railway already provides — push a container, AWS runs it,
  no EC2 instance to provision, patch, or size. Preserves the "just deploy a Dockerfile"
  workflow the two existing `railway.toml` files already assume.
- **Pro:** No host-level ops burden — no OS patching, no Docker daemon health to monitor, no
  instance replacement on hardware failure.
- **Con:** More expensive per vCPU-hour than an equivalent EC2 instance running the same
  workload continuously. At this app's current size (two small, low-traffic services) that
  difference is on the order of a few dollars a month, not a material driver.

#### Option B — EC2 (self-managed instances)

- **Pro:** Cheaper at steady, predictable load — a fixed instance size at a flat monthly
  rate, no per-task overhead.
- **Con:** Introduces real, ongoing operational work this project does not currently have:
  someone must own OS patching, security updates, Docker daemon health, and instance
  replacement. Railway (and Fargate) abstract all of this away today; EC2 would be a step
  backward in operational simplicity for a two-person-or-fewer team.
- **Con:** No architectural reason to prefer it here — this app has no unusual compute
  profile (no GPU, no sustained high CPU) that would make EC2's cost advantage large enough
  to justify the added ops burden.

### Question 2 — environment count

#### Option A — Production only

- **Pro:** Matches what exists today — no staging configuration is visible anywhere in the
  repo (no second `railway.toml`, no `NODE_ENV=staging` handling beyond the existing
  `development`/`production` split in `configuration.ts`).
- **Pro:** Keeps every fixed-cost line item (RDS, ElastiCache, the load balancer) to a single
  instance rather than doubling it.
- **Con:** No environment to test infrastructure or migration changes against before they
  reach whatever traffic exists in production.

#### Option B — Production + staging

- **Pro:** Standard practice for testing infra changes safely once there is anything real at
  stake (real vendors, real customers).
- **Con:** Roughly doubles every fixed AWS cost line (a second RDS instance, second
  ElastiCache instance, second set of ECS services, though staging can run smaller instance
  classes). Not justified while there is no live data or traffic to protect.

### Question 3 — data migration approach

#### Option A — Greenfield: new AWS infra, re-seed, no data migration

- **Pro:** This is the cheapest and safest point at which this move could ever happen —
  there are no live vendor accounts, no customer orders, no uploaded catalog data from a real
  user to lose. The 160 seeded products are re-seedable from the same scripts that created
  them the first time.
- **Pro:** Avoids the two hardest parts of any infra migration entirely: a maintenance
  window and a rollback plan for data that cannot be regenerated.
- **Con:** None identified, specific to this project's actual current state.

#### Option B — Live cutover with data migration

- Not applicable at this time — there is no live data requiring preservation. Recorded here
  only so this record states plainly that the greenfield choice was a fact about current
  project state, not a shortcut taken despite there being something to lose.

## Decision

**Option A on all three questions: ECS Fargate, production-only, greenfield (no data
migration).**

### Target architecture

```
                        Route 53 (DNS)
                              |
                    CloudFront (CDN, TLS)
                    /                    \
        ALB (backend + admin)         S3 (product images,
              |                        served via CloudFront
    ECS Fargate services:              origin — no separate
    - backend (NestJS)                 load balancer needed
    - admin (React, Dockerized)        for this path)
              |
    RDS Postgres (single instance)
    ElastiCache Redis (single instance)
    Meilisearch: self-hosted container,
      on the SAME ECS cluster (Fargate),
      not re-architected to OpenSearch
```

**Meilisearch stays self-hosted on ECS, not OpenSearch.** [0021](0021-search-runtime-build-plan.md)
picked Meilisearch deliberately (typo tolerance, `disableOnNumbers` for part numbers,
facets) and made it portable specifically so a host change would never force a re-evaluation
of that choice. Swapping to OpenSearch here would silently reopen 0017's search-engine
decision as a side effect of a hosting migration — scope creep this record explicitly
declines. The container runs on ECS Fargate exactly as it runs in Docker Compose today.

**Object storage moves to S3, not GCS.** This is the one piece where AWS was always the
plan's _original_ design — [phase-2-completion-plan.md](../phase-2-completion-plan.md)
workstream 3 specified `@aws-sdk/client-s3` before [0024](0024-product-images-gcs.md) adapted
it to GCS. A full-AWS decision reverts that adaptation; 0024 will be marked superseded if
this record is accepted.

### Environment variables that change

Every external host in this codebase is already configuration, never hard-coded — this is
the same rule [0021](0021-search-runtime-build-plan.md) and [0024](0024-product-images-gcs.md)
both state, and it is what makes this move an env var change plus new infra, not a rewrite:
`DATABASE_URL`, `REDIS_URL`/`REDIS_HOST`, `MEILI_HOST`, and the storage block (`S3_*`
replacing `GCS_*`) all simply point at new endpoints.

## Why

**ECS Fargate over EC2:** the operational cost of self-managing EC2 instances is a real,
ongoing burden this project does not currently carry under Railway, and Fargate is the
direct continuation of that "just deploy a container" experience on AWS. The per-vCPU price
premium is real but small in absolute terms at this app's current size — not worth trading
away zero-ops container hosting for.

**Production-only:** a second environment's fixed costs (a second RDS instance, second
ElastiCache instance, at minimum) are not justified when there is no live data or traffic to
protect from an infra change gone wrong. This can be revisited the moment there are real
vendor or customer accounts.

**Greenfield over live cutover:** this is a fact about timing, not a preference. Pre-launch,
with no live data, is the only point at which a migration this size can be done without a
maintenance window, a rollback plan, or any risk to a real user's data. Doing this later,
after there are live vendors, would be a categorically harder and more careful project.

**Keeping Meilisearch and declining OpenSearch:** a hosting-vendor decision and a
search-engine decision are different questions, decided on different evidence
([0017](0017-search-engine-choice.md) on typo tolerance and numeric-token handling
specifically). Bundling them risks reversing a considered decision as an unexamined side
effect of an unrelated move.

## Cost estimate

Rough, US-region, on-demand pricing — **not a quote**, and stated as a floor before any real
traffic exists. All figures monthly.

| Service                                                    | AWS (this architecture)                | Railway (current, approximate)                                                 |
| ---------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| RDS Postgres, `db.t4g.micro`, single-AZ                    | $15–25                                 | Bundled into Railway's usage pricing, likely <$10 at current scale             |
| ElastiCache Redis, `cache.t4g.micro`                       | $12–15                                 | Bundled, likely <$10                                                           |
| ECS Fargate — backend service (0.25–0.5 vCPU, low traffic) | $10–15                                 | Bundled, likely <$10                                                           |
| ECS Fargate — admin service (same class)                   | $10–15                                 | Bundled, likely <$10                                                           |
| ECS Fargate — Meilisearch container                        | $10–15                                 | Bundled, likely <$10                                                           |
| Application Load Balancer                                  | $16–20 **flat**, regardless of traffic | No equivalent line item — Railway fronts services without a separate charge    |
| S3 + CloudFront (product images, current volume)           | $1–5                                   | N/A (currently unprovisioned GCS equivalent would be similar)                  |
| Route 53 hosted zone                                       | ~$0.50                                 | N/A if a domain is already pointed elsewhere                                   |
| **Estimated floor**                                        | **~$75–110/mo**                        | **Likely well under $50/mo at current scale**, per Railway's usage-based model |

**The honest conclusion stands from the earlier discussion:** at this app's current size —
160 products, pre-launch, no real traffic — this architecture very likely costs _more_ than
staying on Railway, primarily because of the ALB's flat fee and RDS/ElastiCache's per-instance
minimums, both of which Railway bundles away. AWS's cost advantage emerges at scale (traffic
high enough to make Fargate's pay-per-use model beat Railway's, committed-use discounts,
multi-environment needs) — not at this stage.

## Consequences

- **Engineering time**, not money, is the larger cost here: this is a multi-day
  infrastructure project — VPC design, RDS/ElastiCache provisioning, ECS task definitions and
  service definitions, an ALB with routing rules for two services, IAM roles for each
  service, and a CloudFront distribution — not a config change. It should be estimated and
  scheduled as its own workstream, separate from and not blocking product catalog work.
- [0024](0024-product-images-gcs.md) (GCS for product images) would be marked **Superseded by
  0025** if this record is accepted, and workstream 3's implementation should target S3
  directly rather than building the GCS path first and migrating it later.
- [0021](0021-search-runtime-build-plan.md)'s Railway-specific provisioning note becomes moot;
  its portability guarantee (host is always configuration) is exactly what makes this move
  possible without touching Meilisearch's own configuration or index-settings code.
- No mobile app change of any kind — Expo/React Native talks to whatever URL the API is
  configured at; this is purely a backend/admin hosting question.
- This is recorded as **Proposed**, not **Accepted** — unlike 0021–0024, this decision has
  cost and effort consequences for the client beyond engineering judgment, and the client has
  not yet approved proceeding. Status changes to Accepted only on explicit go-ahead.

## Open questions

- **Exact target region and its effect on egress cost** — not settled; depends on where the
  eventual user base is concentrated (this project's launch scope is Delhi NCR per
  [0020](0020-ncr-launch-cities.md), which argues for an AWS region with good India latency —
  `ap-south-1` (Mumbai) is the natural candidate, not yet confirmed).
- **Whether the client wants to proceed at all**, given the cost comparison above shows this
  is likely a net cost increase at current scale. This record exists so that decision can be
  made with real numbers, not to argue for a particular outcome.
- **CI/CD pipeline** — Railway's git-push-to-deploy is replaced by what on AWS (CodePipeline,
  GitHub Actions with an AWS deploy step, or something else)? Not designed here.
- **Domain/DNS cutover sequencing** if a domain is already live and pointed at Railway today.
- **Committed-use / Savings Plan pricing** was not applied to the cost estimate above — it
  only becomes relevant once usage is predictable enough to commit to, which pre-launch it is
  not.

## Sources

- [railway.toml](../../railway.toml), [apps/admin/railway.toml](../../apps/admin/railway.toml) —
  current deploy configuration, inspected directly
- [docker-compose.yml](../../docker-compose.yml) — confirms Postgres/Redis/Meilisearch as the
  three local services, mirrored 1:1 by the RDS/ElastiCache/ECS-Meilisearch targets above
- [0017](0017-search-engine-choice.md), [0021](0021-search-runtime-build-plan.md) — prior
  decisions this record deliberately does not reopen (search engine) or partially reopens
  (deploy host)
- [0024](0024-product-images-gcs.md) — the storage decision this record would supersede
- AWS RDS/ElastiCache/Fargate/ALB on-demand pricing (general knowledge as of this session;
  not fetched live — treat the cost table as directional, confirm exact figures against
  AWS's pricing calculator before presenting a firm number to the client)
