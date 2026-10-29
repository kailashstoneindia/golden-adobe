# 0044 — Build AWS ahead of the domain, on free names, then park it

- **Date:** 2026-10-21
- **Status:** Accepted
- **Supersedes / Superseded by:** Builds on [0032](0032-aws-cost-minimized-single-box.md) (the single box) and [0033](0033-product-media-s3-presigned.md) (media). Changes nothing in them.

## Context

The client has not chosen a domain, and the Railway demo must stay untouched until AWS is
proven. Waiting leaves every AWS command in the runbook untested. The Free plan credit
($100, expires 2027-04-04) cannot bill a card, but an idle server still burns it.

## Decision

1. **Build and test AWS now on free names**: the API on `<elastic-ip>.sslip.io` (Caddy gets a
   real certificate), the admin site and images on the distributions' `xxxx.cloudfront.net`
   names. No certificates or DNS records are needed.
2. **Park it afterwards**: final backup, stop the instance, release the Elastic IP. Cost drops
   from about $22-30 a month to about $3 (the disk). S3, CloudFront, Lambda, SQS, SNS, SSM and
   CloudWatch stay up and cost cents at demo volume.
3. **Domain day is a swap, not a rebuild**: start the box, attach an IP, add DNS records and
   certificates, add alternate names to both distributions, change `API_DOMAIN` and
   `MEDIA_PUBLIC_BASE_URL` in SSM and the Lambda's callback address, redeploy, rebuild search.
   Image URLs are derived from `storage_key` at read time, so no data migration.
4. **Railway is read-only until cutover.** The cutover plan is
   [aws-cutover-checklist.md](../aws-cutover-checklist.md).
5. The admin site's page routes use a **CloudFront Function**, not custom error responses.
   Error responses are distribution-wide and would rewrite the API's own 403/404 answers.

## Consequences

- The mobile app has the API address baked in at build time, so a production build should wait
  for the real domain. A test profile (`aws-preview`) exists for phone testing.
- While the box is stopped the API and admin logins are down; static admin files and images
  still load from S3.
- Unconfirmed SNS email subscriptions are deleted after 3 days. Confirm the alert email
  promptly.
- A rollback to Railway is a client-side repoint, because Railway never stopped.

## Verified (2026-10-29)

Hand-run deploy of commit 7fb7723 with the pipeline's own `deploy.sh`, on the temporary `sslip.io` name:

- ARM image built on a laptop, pushed to ECR, runs on Graviton. All 5 containers healthy; about 480 MB of 1.8 GB used, no swap.
- 55 migrations ran; the demo catalog loaded (645 products, 3 vendors, 268 listings). Delhi `110001` search: 235, same as the Railway demo.
- Pre-deploy backup works; restore into a scratch database matched live row counts; checksum verified.
- Upload loop: presign, S3, confirm, Lambda resize, signed callback: ready in about 2 s (3.4 MB JPEG to 201 / 36 / 2 KB WebP). `original/` answers 403 through the CDN. 259 demo images loaded; none failed.
- Admin site through CloudFront (page routes 200, the API's own 403/404/400 answers pass through unchanged).
- Only Caddy is reachable from outside (Postgres and Meilisearch closed).

**Not yet verified:** the GitHub deploy workflow (needs repo admin for variables), the real domain names (DNS for `api.`, `admin.`, `media.`), a browser login to the admin UI on AWS.

## Bugs found by the real run (fixed in the repo)

1. `deploy.sh` / `compose.sh` read `deploy.conf` without exporting it, so `render-env.sh` never saw `SSM_PREFIX`. The local rehearsal used a hand-written `.env` and could not catch it. Fixed with `set -a`.
2. A published Lambda **version is a frozen snapshot, including its environment variables**. The `live` alias pointed at version 1 with the placeholder callback address, so every callback failed. Changing the function's configuration only changes `$LATEST`: set the environment, then publish a version and move the alias.
3. The Lambda role needs `s3:ListBucket`, or S3 answers "access denied" instead of "not found" for a file that is already gone.
4. CloudFront custom error responses are distribution-wide and would turn the API's 403/404 into the admin page. A CloudFront Function does the page-route rewrite instead.
5. Some demo `.jpg` files are really WebP. The server correctly rejects a declared type that does not match the bytes, so a loader must declare the real type.
6. ACM validation expires after 72 hours; a slow DNS owner means requesting the certificate again.
