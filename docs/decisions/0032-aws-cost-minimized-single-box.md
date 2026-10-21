# 0032 — AWS cost minimization: reopening the compute question from 0025

- **Date:** 2026-10-05
- **Status:** Accepted (2026-10-06): the project owner chose the single small box over the heavier setup. Open item: name who owns the instance (patching, alerts, restores).
- **Supersedes / Superseded by:** Reopens Question 1 (compute target) from [0025](0025-full-aws-migration.md); does not touch its Question 2 (environment count) or Question 3 (data migration)

## Context

[0025](0025-full-aws-migration.md) designed a full-AWS target architecture (ECS Fargate +
RDS + ElastiCache + ALB + S3/CloudFront) and recorded it as **Proposed**, not Accepted,
specifically because its own cost table showed that architecture likely costs _more_ than
staying on Railway at current scale (~$75–110/mo AWS floor vs. likely under $50/mo on
Railway). 0025's "Open questions" section left "whether the client wants to proceed at all"
unresolved given that comparison.

Since then, the client has asked directly to **minimize AWS cost**, specifically naming
Meilisearch hosting as a line item to find a cheaper alternative for. This is new information
bearing directly on 0025's unresolved question — not a reason to re-litigate Questions 2
(production-only) or 3 (greenfield), which stand as decided.

A new AWS account's free-tier credits are also relevant context for timing, not architecture:
as of July 2025, AWS replaced the old 12-month free tier with **up to $200 in credits**
($100 on signup, up to $100 more via specific console actions), expiring 6 months after
signup or when depleted, whichever comes first. At 0025's ~$75–110/mo floor, that covers
roughly 2 months; at this record's cost-minimized floor (below), it covers closer to 6–8
months — i.e. close to the full free-plan window.

**New evidence not available to 0025:** AWS App Runner — a managed-container option that
would have competed with Fargate on simplicity — is closing to new customers on
2026-04-30. This doesn't change 0025's conclusion (it chose Fargate over EC2, not over App
Runner) but forecloses App Runner as a future option for this project and is recorded here
so it isn't rediscovered later.

## Options considered

### Option A — Keep 0025's architecture (ECS Fargate + RDS + ElastiCache + ALB)

- **Pro:** Already designed, reviewed, and consistent with "zero host-level ops" — no OS
  patching, no Docker daemon health, no instance replacement, matching the Railway experience
  this project is used to.
- **Con:** ~$75–110/mo floor, most of it fixed cost (ALB's flat ~$16–20/mo regardless of
  traffic, RDS and ElastiCache per-instance minimums) that doesn't shrink with low traffic —
  exactly what 0025 already flagged as likely costing more than Railway at this stage.

### Option B — Single EC2 instance running everything as containers (this record's recommendation)

Modeled on a pattern already running in production for a comparable project: one EC2
instance running the NestJS API, Postgres, Redis, Meilisearch, and the search-sync worker as
separate containers, with **Caddy** (not an ALB) handling TLS via free auto-renewing Let's
Encrypt certificates.

- **Pro:** Eliminates the three largest fixed costs in Option A outright: no ALB (~$16–20/mo
  saved), no standalone RDS instance (~$15–25/mo saved — Postgres runs as a container on the
  same box), no standalone ElastiCache instance (~$9–15/mo saved). No NAT Gateway either, since
  there's no private-subnet compute needing outbound access brokered — the single instance can
  sit in a public subnet behind a security group, the same trust boundary a Railway service
  already has today.
- **Pro:** S3 + CloudFront for media and the admin SPA stays identical to Option A — this
  part of 0025's design is cost-efficient regardless of compute choice and isn't reopened
  here.
- **Con — this is the real trade, stated plainly:** no managed backups, no automatic failover,
  no auto-scaling, and a single point of failure for every service at once (losing the box
  loses the API, DB, cache, and search together, not just one of them). This is a materially
  larger ops burden than 0025 accepted when it chose Fargate over EC2 specifically to avoid
  this trade.
- **Mitigation for the backup gap:** a nightly `pg_dump` cron job writing to a private S3
  bucket via the instance's IAM role (no stored AWS keys) — the same mitigation the reference
  project uses for the identical trade-off. This recovers data on instance loss; it does not
  recover uptime during the outage.
- **Con:** Meilisearch's LMDB storage, EBS-backed on this same instance, still satisfies
  [0021](0021-search-runtime-build-plan.md)'s hard rule (local disk only, never network
  storage) — no conflict there. But it means Meilisearch now shares CPU/RAM headroom with
  Postgres, Redis, and the Node process on one small instance, which changes the instance
  sizing question from "size the API" to "size the whole stack together."

### Option C — Meilisearch Cloud (vendor-managed), rest of stack per Option A or B

- **Pro:** Removes Meilisearch as an ops concern entirely — no instance, no patching, no
  backup story to design.
- **Con:** Not cheaper. Meilisearch Cloud's smallest tiers (~$23–30+/mo) cost more than
  self-hosting Meilisearch on a right-sized instance (~$5–7/mo as a container alongside
  everything else in Option B, or ~$11–15/mo standalone in Option A). This is a "pay to
  delete the problem" option, not a cost-minimization one — rejected here because cost
  minimization is the explicit goal of this record.

## Decision

**Adopt Option B: single EC2 instance, Caddy for TLS, Postgres/Redis/Meilisearch/API/worker
as containers on that one box.** This reopens and reverses 0025's Question 1 answer
specifically because the client's stated priority (minimize cost) outweighs the ops-simplicity
argument 0025 made when operating without that constraint. 0025's Questions 2
(production-only) and 3 (greenfield, no data migration) are unaffected and remain decided.

### Target architecture

```
                    Route 53 (DNS)
                          |
              CloudFront (admin SPA + media CDN)
               /                          \
   S3 (admin SPA, static)          S3 (media: public bucket +
                                     private KYC-doc bucket,
                                     NOT built: see 0033)
                                            |
                              Single EC2 instance (ap-south-1)
                              behind a security group, Caddy
                              auto-issuing Let's Encrypt TLS
                              ├── NestJS API (container)
                              ├── Search-sync worker (container)
                              ├── Postgres (container, EBS-backed)
                              ├── Redis (container)
                              └── Meilisearch (container, EBS-backed,
                                  local disk per 0021 — unchanged rule)

Nightly pg_dump → private S3 bucket, via instance IAM role (no stored keys)
```

Every external host stays configuration, not code — the same rule 0021 and 0025 both state.
Moving any one piece off the shared box later (e.g. Postgres to RDS once there's real traffic
to protect) is still just an env var change (`DATABASE_URL`, `REDIS_URL`, `MEILI_HOST`), not a
rewrite — this record doesn't weaken that guarantee, it just defers exercising it.

## Why

**Cost, because that's what was asked for.** Every piece removed here (ALB, standalone RDS,
standalone ElastiCache, NAT Gateway) was a fixed-cost line item in Option A that doesn't scale
down with this project's current near-zero traffic. Collapsing them onto one instance trades
away the ops guarantees 0025 paid for, in direct exchange for the cost reduction the client
asked this record to find.

**Why this is an acceptable trade right now and not later:** identical reasoning to 0025's
Question 3 — pre-launch, with no live vendor or customer data, a box failure costs re-seeding
time, not real data. The nightly `pg_dump` backup exists so even that risk has a floor. This
calculus changes the moment there is real vendor or customer data at stake, at which point the
instance-replacement and no-failover cons stop being acceptable and Option A (or a managed
split) becomes the right call again — this is forecast explicitly in Consequences below, not
left implicit.

**Rejecting Meilisearch Cloud (Option C) specifically:** the client asked for a cheaper
Meilisearch alternative. Meilisearch Cloud is the "zero-ops" alternative, not the "cheaper"
one — self-hosting on the shared instance is both cheaper and keeps 0021's already-settled
search-engine choice untouched, which Meilisearch Cloud would also preserve but at higher
cost. Self-hosting wins the stated goal.

## Consequences

- **This is a step backward in operational safety from 0025**, not a refinement of it — one
  instance now carries every stateful service at once. That trade is accepted here explicitly
  because cost minimization was the stated priority; it should be revisited (toward Option A,
  or a partial split — e.g. moving only Postgres to RDS first) the moment any of these become
  true: real vendor onboarding with data that isn't trivially re-seedable, real customer
  traffic, or a support/SLA commitment to uptime.
- **Someone must own instance-level operations** that AWS does not do for you on EC2: OS
  security patching, Docker daemon health, and manual instance replacement on hardware
  failure. This is new work this project did not have under Railway or under 0025's Fargate
  design. Name who owns this before go-live, not after.
- [0021](0021-search-runtime-build-plan.md)'s local-disk rule for Meilisearch is **unchanged
  and still satisfied** — EBS on the shared instance is local block storage, not network
  storage. No reopening of that rule was needed to reach this design.
- [0024](0024-product-images-gcs.md) / [0025](0025-full-aws-migration.md)'s S3+CloudFront
  media decision is **unaffected** — this record only reopens compute (Question 1), not
  storage.
- Sizing the single instance is a new exercise this record does not finish: it must fit
  Postgres + Redis + Meilisearch + Node (API) + the worker's combined RAM/CPU headroom, not
  just the API alone as 0025's per-service Fargate sizing assumed. Confirm actual instance
  class (`t4g.small` vs `t4g.medium`) against a real memory profile before provisioning, not
  from the ballpark below alone.

## Open questions

- **Exact instance class and EBS size** — the cost table below uses `t4g.small`/`medium` as a
  placeholder; needs confirmation against Postgres + Meilisearch's actual combined memory
  footprint once the catalog is closer to real size.
- **Who owns EC2-level operations** (patching, Docker health, instance replacement) — not yet
  named. 0025 avoided this question entirely by choosing Fargate; this record reintroduces it
  and does not resolve it.
- **At what trigger point this reverts toward Option A** — stated qualitatively above (real
  vendor data, real traffic, an SLA commitment) but not as a quantified threshold. Worth
  fixing a concrete trigger (e.g. "N onboarded vendors" or "M requests/day") once there's a
  basis to pick one.
- **Region and free-tier timing** — `ap-south-1` is assumed per 0025's own open question on
  this point (still not formally confirmed there either). The AWS free-tier credit window
  (up to $200, expiring at 6 months or depletion) should be started deliberately once this
  architecture is ready to provision, not burned during earlier exploration.

## Sources

- [0025](0025-full-aws-migration.md) — the record this reopens; its Question 1 options and
  cost table are the baseline this record argues against.
- [0021](0021-search-runtime-build-plan.md) — Meilisearch's local-disk-only rule, confirmed
  unaffected by this design.
- [docker-compose.yml](../../docker-compose.yml) — current local service shape (Postgres,
  Redis, Meilisearch as containers), which this record's single-box target mirrors more
  closely than 0025's per-service split does.
- AWS Free Tier credit structure: [AWS "Free Tier now offers $200 in credits" announcement,
  2025-07](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/) —
  fetched live this session.
- AWS App Runner new-customer sunset (2026-04-30) and ECS Express Mode (announced re:Invent,
  2025-11-21) — general web research this session, not fetched from a single authoritative
  AWS URL; confirm against AWS's own release notes before citing externally.
- A comparable project's production deployment (single EC2 instance, Caddy for TLS, Postgres
  in a container, nightly `pg_dump` to S3) — used as the precedent pattern for Option B; not
  this repo, cited for the pattern only.
- AWS EC2/RDS/ElastiCache/ALB/S3/CloudFront on-demand pricing — general knowledge and web
  research this session, ap-south-1-specific where found; treat the cost table as directional,
  confirm exact figures against AWS's pricing calculator before presenting a firm number to
  the client.

## Cost estimate

Rough, `ap-south-1`, on-demand pricing — **not a quote**. All figures monthly.

| Service                                                            | Option B (this record)        | Option A ([0025](0025-full-aws-migration.md))                                                   |
| ------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Compute (EC2 running everything, vs. per-service Fargate + ALB)    | $12–20 (single instance)      | $46–65 (3 Fargate services + ALB)                                                               |
| EBS volume (30–40GB gp3, now also holding Meilisearch's LMDB data) | $3–4                          | N/A (Fargate ephemeral + separate Meilisearch volume already counted above)                     |
| Postgres                                                           | $0 (container on the box)     | $15–25 (RDS `db.t4g.micro`)                                                                     |
| Redis                                                              | $0 (container on the box)     | $12–15 (ElastiCache `cache.t4g.micro`)                                                          |
| NAT Gateway                                                        | $0 (no private subnet needed) | not itemized in 0025, but required for Fargate's private networking — a gap in 0025's own table |
| S3 + CloudFront (media, admin SPA)                                 | $2–8                          | $1–5                                                                                            |
| Route 53                                                           | ~$0.50                        | ~$0.50                                                                                          |
| **Estimated floor**                                                | **~$20–35/month**             | **~$75–110/month** (per 0025)                                                                   |

This brings AWS cost below 0025's own estimate of likely Railway cost at current scale
(0025: "likely well under $50/mo"), reversing the conclusion that AWS necessarily costs more
than staying on Railway — provided the ops trade-off in Consequences is accepted.

**Correction (2026-10-05, while writing the runbook):** the table above left out the
**public IPv4 address**. AWS has charged $0.005 per hour for every public IPv4 address since
February 2024, which is about **$3.65 per month** for the box's Elastic IP. The Option B
floor is therefore about **$22–30 per month**, still inside the range above and still far
below Option A, and still fully covered by the free credits for the six-month window. The
runbook ([infra/deploy/README.md](../../infra/deploy/README.md)) carries the corrected table.
