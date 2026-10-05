# 0033 — Product media: S3 presigned upload, private originals, Lambda WebP variants

- **Date:** 2026-10-05
- **Status:** Accepted
- **Supersedes / Superseded by:** Supersedes [0024](0024-product-images-gcs.md). Builds on the storage choice in [0025](0025-full-aws-migration.md) and the single-box compute in [0032](0032-aws-cost-minimized-single-box.md).

## Context

`master_product_media` has existed since Phase 4 and has **never been written to**: no storage code,
no upload endpoint, no admin UI. Production has no product images at all
([0031](0031-local-data-to-production.md)). [0024](0024-product-images-gcs.md) designed a GCS
backend with a server-side upload (`StorageService.upload(buffer, key, contentType)`), but the
bucket was never provisioned, and [0025](0025-full-aws-migration.md) / [0032](0032-aws-cost-minimized-single-box.md)
move storage to S3 + CloudFront. Production will run on one small EC2 box (2 GB RAM), so image bytes
should not pass through it. The full build plan is
[../aws-pre-deploy-implementation-plan.md](../aws-pre-deploy-implementation-plan.md).

## Options considered

### Upload transport

#### Option A — Presigned POST direct to S3 (chosen)

- **Pro:** Image bytes never touch the API box. A POST policy enforces `content-length-range` and an
  exact `Content-Type` **at S3**, which a presigned PUT cannot do.
- **Con:** Three round trips (presign, upload, confirm) and a confirm step that must validate the
  object after the fact.

#### Option B — Upload through the backend (0024's design)

- **Pro:** One request, simplest client.
- **Con:** Every image passes through a 2 GB box's RAM and bandwidth; needs multer limits and
  buffering. Rejected.

### Original file visibility

#### Option A — Private originals, public variants only (chosen)

- **Pro:** Phone photos can carry GPS/EXIF data. CloudFront serves only the cleaned WebP variants.
- **Con:** An image shows "processing" for a few seconds until its variants exist.

#### Option B — Public originals

- **Pro:** The original is usable immediately as a fallback.
- **Con:** Serves EXIF/GPS metadata publicly and heavier bandwidth. Rejected.

### Variant generation and readiness tracking

#### Option A — Lambda on S3 upload, calling the API back (chosen)

- **Pro:** Near-free on the always-free tier, keeps image processing off the small box. The Lambda
  never touches the database, so it stays outside the VPC. Readiness arrives by an HMAC-signed
  callback, so no queue and no S3 polling.
- **Con:** The callback endpoint is a second trust boundary (mitigated by HMAC + timestamp window,
  and it can only flip a status).

#### Option B — sharp inside the existing BullMQ worker

- **Pro:** No Lambda to deploy.
- **Con:** Competes with Postgres, Redis and Meilisearch for 2 GB of RAM. Rejected.

#### Option C — A BullMQ job that polls S3 for the variants

- **Pro:** Automatic retry with backoff inside the API.
- **Con:** New queue, prefix and Redis-dependent tests for a few admin uploads a day. The user
  explicitly asked to keep the architecture simple with no new queues. Rejected.

### Local stand-in for S3

- **Chosen: MinIO via the Chainguard image** (`cgr.dev/chainguard/minio`). MinIO's Docker Hub images
  were discontinued in Oct 2025, but the Chainguard build is free and public. It supports size-limited
  presigned POST and upload-event webhooks, which drive the local Lambda runner.
- **Rejected: LocalStack** (needs an account auth token since March 2026) and **SeaweedFS** (no
  S3-format event webhooks, so the local Lambda would have to poll).

## Decision

**Admin-only uploads go browser → S3 by presigned POST. Originals stay private. A Lambda (Node 22,
arm64, sharp) writes `thumb`/`medium`/`large` WebP variants and calls the API when done. CloudFront
serves `variants/*` only.** No new queue or background worker is added; orphan cleanup is a plain
script on a systemd timer.

Rules to quote back:

> **The client never supplies an object key.** The server derives it from `productId` and `mediaId`.
>
> **Originals are never public.** Only `variants/*` is readable through the CDN.
>
> **No new queues.** Status moves by signed callback; a stuck `processing` row is reported as
> `failed` on read, with no job and no write.

Key scheme (immutable, so the CDN never needs invalidation):

| Object   | Key                                                                                          | Access                |
| -------- | -------------------------------------------------------------------------------------------- | --------------------- |
| Original | `original/products/{productId}/{mediaId}.{jpg\|png\|webp}`                                   | private               |
| Variant  | `variants/products/{productId}/{mediaId}/{thumb\|medium\|large}.webp` (200/600/1200 px wide) | public via CloudFront |

`mediaId` is minted at presign time and becomes the row's primary key, which makes confirm idempotent.

## Why

- **Cost and fit:** at 2 GB of RAM the box should not process or proxy images; Lambda handles it
  inside the free tier.
- **Safety:** presign policy locks bucket, key, type and size; confirm re-checks size and magic bytes;
  `limitInputPixels` guards against decompression bombs; originals stay private.
- **Simplicity:** the existing `trg_mpm_search_*` triggers already re-index a product when its media
  changes, so a status update to `ready` reaches search with no new wiring.
- **Deviation from 0024:** 0024 chose server-side upload to keep one request and public
  `${BASE_URL}/${key}` URLs. The URL goal is kept: responses derive URLs from `storage_key` plus
  `MEDIA_PUBLIC_BASE_URL`, so a CDN domain change needs no data migration.

## Consequences

- New columns on `master_product_media`: `storage_key`, `content_type`, `size_bytes`,
  `processing_status`, `processing_error`, `processed_at`. Rows with no `storage_key` are legacy
  external-URL rows and keep working.
- `url` is kept only to satisfy `NOT NULL`. Clients must read the derived `variants`, not `url`.
- New env block (`S3_*`, `MEDIA_*`) and a new shared secret `MEDIA_CALLBACK_SECRET`, shared with
  the Lambda.
- `SearchDocument` gains `primaryImage`; existing documents need one full rebuild after deploy.
- `@google-cloud/storage` is removed (it was never imported).
- The Lambda's callback needs the API reachable over HTTPS. During a 10–20 s deploy the callback
  fails, S3 retries later, and the worst case is one manual **Retry** click.
- **No KYC / private-documents bucket is built here.** There is no KYC feature yet; it needs its own
  design (which documents, who reviews, retention). The storage interface will support a second
  bucket later without rework.
- Vendors cannot upload images (ADR 0009); this stays admin-only.

## Open questions

- Whether `ubuntu-24.04-arm` GitHub runners are available to this repo; QEMU is the fallback for
  building the arm64 image.
- Final CloudFront and API domain names.
- Whether `media:sweep` should move from weekly dry-run to `--apply` after two weeks of output.
- A possible follow-up, separate from this record: replacing the search drain's BullMQ with a plain
  timer. Not done here, by instruction.

## Sources

- [../aws-pre-deploy-implementation-plan.md](../aws-pre-deploy-implementation-plan.md) — the full plan
- [0024](0024-product-images-gcs.md), [0025](0025-full-aws-migration.md),
  [0032](0032-aws-cost-minimized-single-box.md)
- MinIO Docker Hub discontinuation (Oct 2025) and LocalStack auth-token requirement (Mar 2026) —
  web research this session, not an authoritative single source; re-check before pinning images.
