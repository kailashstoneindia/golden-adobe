# 0024 — Product images: Google Cloud Storage as the backing store

- **Date:** 2026-09-16
- **Status:** Superseded by [0033](0033-product-media-s3-presigned.md)
- **Supersedes / Superseded by:** Superseded by 0033 (S3 + CloudFront, presigned direct upload). The bucket was never provisioned and no GCS code was ever written.

## Context

[phase-2-completion-plan.md](../phase-2-completion-plan.md) workstream 3 specifies product
image storage behind a `StorageService` interface with an S3-compatible implementation —
"Endpoint + credentials are config, so the same code runs anywhere" (Decisions taken table).
`master_product_media` has been fully designed since Phase 4 (`url`, `media_type` enum,
`display_order`, `is_primary` with a partial unique index, `is_representative`) and has
**never been written to**. Search-sync triggers are already installed on it, so a write
re-indexes the product automatically.

The user has chosen Google Cloud Storage as the concrete backing store rather than an
S3-compatible one (DigitalOcean Spaces / AWS S3 / MinIO). GCS is not S3-compatible at the API
level — different auth model (service accounts + IAM, not access-key/secret pairs), different
SDK (`@google-cloud/storage`, not `@aws-sdk/client-s3`), no bucket-policy-via-ACL-header
shape — so this is a real adaptation of the plan, not a drop-in config swap, and is worth
recording as its own decision rather than silently editing workstream 3's file list.

The `StorageService` **interface** itself is unaffected: `upload(buffer, key, contentType) →
url` and `delete(key)` say nothing about which cloud is behind them. Only the implementation
class and its environment variables change.

## Options considered

### Question 1 — authentication to GCS

#### Option A — Service account key JSON in an environment variable

- **Pro:** Identical shape in every environment — Docker Compose locally, Railway or any
  PaaS in production. No volume mount, no file that must be kept out of git and then
  provisioned onto disk at deploy time.
- **Pro:** Matches how every other external credential in this codebase already works —
  `MEILI_MASTER_KEY`, `MSG91_AUTH_KEY`, `JWT_ACCESS_SECRET` are all plain env vars, none of
  them a mounted file.
- **Con:** A multi-KB JSON blob living in an env var is less conventional than GCP's own
  tooling expects, and needs an explicit `JSON.parse` at boot with a clear failure message if
  it's malformed or absent.

#### Option B — Key file path on disk (Application Default Credentials style)

- **Pro:** The idiomatic GCP pattern — `GOOGLE_APPLICATION_CREDENTIALS` pointing at a
  mounted file is what most GCP documentation and Cloud Run itself assume.
- **Con:** Needs a volume or secret-mount wherever the backend runs. Railway (this project's
  actual deploy target per [0021](0021-search-runtime-build-plan.md)) doesn't mount arbitrary
  files the way Cloud Run does, so this would need its own bespoke provisioning step that
  none of the other three external services (Postgres, Redis, Meilisearch) require.
- **Con:** One more moving part than everything else in `configuration.ts`, for no
  corresponding benefit in this specific deployment target.

### Question 2 — public vs. signed access to uploaded images

#### Option A — Public bucket/objects, plain direct URL

- **Pro:** Matches the original S3 plan's `S3_PUBLIC_BASE_URL` design exactly — `url` stored
  in `master_product_media` is a stable, permanent link.
- **Pro:** Product photos are catalog marketing material, not private documents — there is no
  access-control property to protect. A customer or a search index hot-linking an image
  needs no auth and no backend involvement per view.
- **Pro:** Meilisearch's future image-URL field ([phase-2-completion-plan.md](../phase-2-completion-plan.md)
  workstream 3's noted follow-on) and any frontend `<img src>` can use the stored URL as-is,
  forever, with no sign-on-read step.
- **Con:** Requires the bucket (or the objects within it) to be configured public, which is a
  one-time IAM/ACL decision an operator must get right — misconfiguring it fails open
  (private, images don't load) rather than closed, which is the safe direction for a mistake.

#### Option B — Signed, time-limited URLs

- **Pro:** No public bucket needed at all.
- **Con:** The stored `url` column can no longer be the final answer — it would need to hold
  a stable object key, with a sign step at every read, everywhere an image is displayed
  (product page, search result, admin panel). That is real complexity purchased for a
  security property product photos do not need.
- **Con:** URLs expiring breaks the simplest possible contract ("this URL shows this image"),
  which the search document, any caching layer, and any external system that might store the
  URL would all need to account for.

### Question 3 — bucket provisioning

#### Option A — Assume no bucket exists; document the steps, don't run them

- **Pro:** This session has no GCP credentials or project access — there is no tool available
  to actually provision cloud infrastructure from here, so this is the only executable
  option.
- **Pro:** Documenting the exact `gcloud`/console steps in this record means provisioning is
  a one-time, reviewable action an operator takes, not something buried in a script that ran
  once and is now unreproducible.
- **Con:** Workstream 3 cannot be verified end-to-end against a real bucket until that
  provisioning step happens outside this session.

#### Option B — Bucket already exists

- Not applicable — no existing bucket name or project ID was available at decision time.

## Decision

**Option A on all three questions.**

1. **Auth:** `GCS_CREDENTIALS_JSON` holds the full service-account key as a JSON string,
   parsed once at module init. `GCS_PROJECT_ID` and `GCS_BUCKET` are separate plain env vars
   (the project id is technically inside the key JSON too, but keeping it explicit avoids a
   second JSON round-trip just to read one field, and matches the plan's original
   `S3_BUCKET`/`S3_REGION` split).
2. **Access:** Uploaded objects are public; the stored `url` is
   `${GCS_PUBLIC_BASE_URL}/${objectKey}`, defaulting to
   `https://storage.googleapis.com/${GCS_BUCKET}` when `GCS_PUBLIC_BASE_URL` is unset — the
   same override escape hatch the original S3 design specified, now doing double duty as the
   path to point at a CDN or custom domain later without a code change.
3. **Provisioning:** documented below, not executed by this session. The bucket must exist
   and be public (or fronted by a public CDN) before workstream 3's live verification step
   can run.

### Environment variables (replaces the plan's `S3_*` block)

```
GCS_PROJECT_ID=<gcp project id>
GCS_BUCKET=<bucket name>
GCS_CREDENTIALS_JSON=<service account key, as one JSON string>
GCS_PUBLIC_BASE_URL=https://storage.googleapis.com/<bucket name>   # optional override
```

Nothing GCS-specific is ever hard-coded in application code — the same rule
[0021](0021-search-runtime-build-plan.md) states for Meilisearch applies here: **moving
buckets, projects, or even clouds must be an environment variable change, never a code
edit.** This is exactly why the `StorageService` interface exists.

### Provisioning steps (for whoever runs them — not executed here)

```bash
# 1. Create the bucket (adjust region/storage class as needed)
gsutil mb -p <project-id> -l <region> -b on gs://<bucket-name>

# 2. Make objects in it publicly readable
gsutil iam ch allUsers:objectViewer gs://<bucket-name>

# 3. Create a service account scoped to this bucket only (least privilege —
#    not a project-wide Storage Admin role)
gcloud iam service-accounts create golden-abode-media \
  --display-name="Golden Abode product media uploader"

gsutil iam ch \
  serviceAccount:golden-abode-media@<project-id>.iam.gserviceaccount.com:objectAdmin \
  gs://<bucket-name>

# 4. Generate the key and put its JSON content into GCS_CREDENTIALS_JSON
gcloud iam service-accounts keys create golden-abode-media-key.json \
  --iam-account=golden-abode-media@<project-id>.iam.gserviceaccount.com
# then: GCS_CREDENTIALS_JSON=$(cat golden-abode-media-key.json) — delete the
# file afterward; it must never be committed.
```

The service account is scoped to `objectAdmin` on this one bucket, not a project-wide role —
the backend can create/overwrite/delete objects in the media bucket and nothing else.

## Why

**Env-var JSON over a mounted key file** follows this codebase's own established pattern
rather than GCP's default tooling assumption. Every other credential here — database URL,
Redis URL, Meilisearch master key, MSG91 auth key, JWT secrets — is a plain environment
variable with no filesystem step, because that is what the actual deploy target (Railway,
per [0021](0021-search-runtime-build-plan.md)) supports cleanly. Introducing the one
credential that needs a mounted file would be inconsistent with every other piece of config
in `configuration.ts` for no benefit specific to this deployment.

**Public objects over signed URLs** is the same reasoning [0021](0021-search-runtime-build-plan.md)
already applied to Meilisearch's search key: match the access-control need to the actual
sensitivity of the data. Product catalog photos are meant to be seen by anyone who can see
the product — there is no user, order, or payment data anywhere near this bucket. Signed
URLs solve a problem this data doesn't have, at the cost of every future read path (search
index, frontend, admin panel) needing to know how to mint or refresh one.

**Documenting provisioning rather than running it** is a hard constraint, not a preference:
this session holds no GCP credentials and has no tool that could create cloud
infrastructure even if it wanted to. Recording the exact commands here means the one-time
step an operator takes is reviewable and reproducible, the same reason
[0021](0021-search-runtime-build-plan.md)'s Railway provisioning gap is recorded rather than
silently skipped.

## Consequences

- `@google-cloud/storage` is added as a dependency; `@aws-sdk/client-s3`, named in the
  original plan, is **not** added — GCS's own SDK replaces it entirely rather than sitting
  alongside it.
- `file-type` is added for magic-byte sniffing on upload (the plan's "do not copy the xlsx
  pattern verbatim" requirement — `application/octet-stream` as an escape hatch would
  disable mime checking for images the same way it does for the xlsx importer).
- `configuration.ts` gains a `gcs` block following the exact shape of the existing `search`
  block: env-driven, dev-safe defaults where one exists, no secret ever hard-coded.
- **The bucket does not exist yet.** Workstream 3's live-verification step (upload → real
  bucket → fetchable URL) is blocked until an operator runs the provisioning steps above and
  supplies the four environment variables. Development and testing before that point can
  proceed against the `StorageService` interface with a stub/fake implementation if needed,
  but the real GCS path cannot be exercised.
- If the project later needs private media (e.g. an admin-only certification document that
  should not be public), that is a **different** media type with a different access model —
  `master_product_media.type` already distinguishes `certification_doc` from `image`, so a
  future decision can revisit access per media type without touching this one's conclusion
  for product images.

## Open questions

- **CDN in front of the bucket.** `GCS_PUBLIC_BASE_URL` already anticipates this (point it at
  a CDN domain instead of `storage.googleapis.com` and nothing else changes), but no CDN
  decision has been made — deferred until there's real traffic to justify it.
- **Image resizing/thumbnails.** Out of scope for workstream 3 as originally planned; the
  first cut stores and serves whatever the admin uploads at original size, subject only to
  the size-limit validation.
- **Whether `certification_doc` and `spec_sheet_pdf` media types ever need private access**
  (noted under Consequences). Not settled here.

## Sources

- [phase-2-completion-plan.md](../phase-2-completion-plan.md) — workstream 3's original
  S3-compatible design, decisions-taken table
- [0021-search-runtime-build-plan.md](0021-search-runtime-build-plan.md) — the precedent this
  decision follows for env-var-only external service configuration and for documenting
  infrastructure provisioning the session cannot execute itself
- Google Cloud Storage IAM and service-account documentation (general knowledge, not fetched
  live in this session)
