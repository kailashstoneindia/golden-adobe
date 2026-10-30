# AWS cutover checklist (Railway stays untouched until AWS is proven)

Owner of every box: **you**. `[ME]` = ask Claude to do it. Related: [0032](decisions/0032-aws-cost-minimized-single-box.md), [runbook](../infra/deploy/README.md).

## The rule

AWS is built **beside** Railway. Railway is only read, never changed, until the last phase.
Cutover means repointing the clients. Rollback means pointing them back.

```
NOW       Clients ──► Railway (live, untouched)            AWS: free pieces only, no server

BUILD     Clients ──► Railway (live)
                      AWS built and tested on its own addresses, nobody uses it yet

CUTOVER   Clients ──► AWS (new)        Railway kept running as the fallback for 1-2 weeks

DONE      Clients ──► AWS              Railway archived, then stopped
```

## Progress (updated 2026-10-30)

| Phase                  | State                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Waiting tasks       | Partly done. Left: client confirms the SNS alert email, root MFA and billing access.                                                    |
| 1. Domain arrives      | **Done.** `nirmaancenter.com`: `api.`, `admin.`, `media.` resolve to AWS.                                                               |
| 2. Build AWS           | **Done.** Box running, admin and API live, GitHub variables set, `production` environment limited to `main`.                            |
| 2b. Park to save money | **Skipped on purpose.** The box stays running while development and testing continue (about $0.03/hr). Stop it when activity pauses.    |
| 3. Data                | **Done.** Railway data restored on AWS; the 20 wrong photos removed; 238 photos attached.                                               |
| 4. Test in parallel    | **Done.** Admin login, upload to Ready, backup and restore drill, deploy rollback path.                                                 |
| 5. Cutover             | Admin and API already run on AWS. Left: mobile `eas.json` profiles still point at Railway (store release is the slow part).             |
| 6. Cleanup             | Railway reported **stopped** (2026-10-30). Left: rotate the Railway DB password, remove Railway wiring from the repo, final dump saved. |

## How deploys work now (2026-10-30)

- Every push to `main` runs CI. When CI is **green**, "Deploy to AWS" ships the backend, the media Lambda and the admin app. Red CI means no deploy.
- Docs-only and `apps/mobile/**` changes do not deploy.
- Every green merge reaches the live site, so keep merges small. A failed health check rolls the backend back by itself; a pre-deploy backup is taken first.
- Restoring a Railway dump at cutover: restore every table **except** `master_product_media`, or rerun the idempotent `media:load-demo`; otherwise photo rows are lost.

## Where Railway is wired in (do not edit until Phase 5)

| Place                                | What points at Railway                | Effect of editing it                                           |
| ------------------------------------ | ------------------------------------- | -------------------------------------------------------------- |
| `apps/mobile/eas.json` (3 profiles)  | `EXPO_PUBLIC_API_URL`                 | Baked in at build time. Old app builds keep using Railway.     |
| `apps/admin/vercel.json`             | `/api` rewrite to Railway             | Merging to main changes the live admin site.                   |
| `railway.toml` + Railway auto-deploy | Every merge to main redeploys Railway | Any merge reaches the client demo. Keep merges small and safe. |

Already checked: the backend boots on Railway without any S3 settings, so the merged media work cannot break it.

## Phase 0: now, while waiting for the domain (no cost)

- [ ] Click "Confirm subscription" in the AWS alert email (the ops email)
- [ ] Root user: enable "IAM user and role access to Billing information"
- [ ] Root user: turn on MFA
- [ ] Decide who owns the AWS server (open item in 0032)
- [ ] Send the client a domain shortlist (3-4 names), or ask if they already own one
- [ ] Do not touch Railway settings. Use its database read-only (`pg_dump` only).

- Repo fixes (keep 5 ECR images, backup-bucket old-version expiry, provisioning script, runbook) wait for the Phase 2 PR. AWS already has them, so nothing is blocked.

## Phase 1: domain arrives

- [ ] Pick the names: `api.<domain>`, `admin.<domain>`, `media.<domain>`
- [ ] Decide where DNS lives (client's registrar, or Route 53 at about $0.50/mo)
- [ ] Get access to add DNS records (or the client adds them when we send the values)

## Phase 2: build AWS (Railway untouched). Started 2026-10-21 on temporary free addresses

Plan change: build and test everything now on free temporary names, then **stop the box**
(Phase 2b) to cut the cost to about $3/mo until the domain arrives.

Done (ap-south-1, `golden-abode` AWS profile):

- [x] [ME] 3 buckets, ECR repo, IAM roles, queue, alert topic and alarm, 11 SSM parameters, media Lambda with `live` alias and S3 trigger, security group
- [x] [ME] EC2 `t4g.small` and an Elastic IP (temporary API name `<ip-with-dashes>.sslip.io`). Session Manager works, no SSH port.
- [x] [ME] Admin CloudFront (a `*.cloudfront.net` name) (site plus `/api/*` to the box) and media CloudFront (another `*.cloudfront.net` name)
- [x] [ME] Bucket policies, media CORS, `API_DOMAIN` and `MEDIA_PUBLIC_BASE_URL` in SSM, Lambda callback address
- [x] [ME] GitHub deploy role `golden-abode-deploy` (no stored keys)
- [x] [ME] Host setup (`bootstrap-host.sh`): Docker, swap, backup and sweep timers, security updates. Containers can reach the instance role.

Waiting on you:

- [ ] **Repo owner (**`kailashstoneindia`**) sets the GitHub variables and the** `production` **environment.** The `gh` login on this machine is not a repo admin. Commands are in the chat; `AWS_DEPLOY_ENABLED=true` goes last.

Then:

- [ ] [ME] First deploy (Actions > Deploy to AWS > Run workflow)
- [ ] Check: `https://<temporary-api-name>/health` is OK, the admin site loads, a backup runs once
- [ ] [ME] Create the admin user, run `media:load-demo`, rebuild search

## This week: finish everything that needs no domain

Your part, about 30 minutes in three sittings:

- [ ] 1. Repo owner runs the GitHub variables block (5 min). **Unblocks everything below.**
- [ ] 2. Confirm the alert email; root MFA; root "IAM billing access" (10 min)
- [ ] 3. Read-only `pg_dump` of the Railway database to a file, then give me the path (10 min)

My part, after 1 (no domain needed):

- [ ] A. First deploy; `/health` OK; admin site loads on the CloudFront address
- [ ] B. Create the admin user; real browser test of upload, resize, callback to Ready
- [ ] C. Backup, then restore drill into a scratch database
- [ ] D. Restore the Railway dump into AWS; compare counts (after 3). Rehearses cutover day's data move.
- [ ] E. `media:load-demo`, search rebuild, check search results carry images
- [ ] F. One script that swaps in the real domain from a single input (`rehome-domain.sh`)
- [ ] G. PR prepared, not opened: runbook fixes, scripts, `aws-preview` mobile profile, this checklist
- [ ] H. Final backup, stop the box, release the IP (Phase 2b)

Left for domain day: client adds 2-3 DNS records, I run the swap script (about 1 hour),
then the Railway cutover (Phase 5). The mobile store release is the only slow part.

## Test run done 2026-10-29 (temporary names, then parked)

- [x] ARM image built and pushed; first deploy with `deploy.sh`; all containers healthy
- [x] Demo catalog loaded (645 products); search matches Railway (235 for 110001)
- [x] Real upload through resize and signed callback: ready in about 2 s; originals private
- [x] 259 demo images loaded; backup, restore drill and pre-deploy backup all pass
- [x] Server stopped and Elastic IP released. SSM, Lambda callback and CloudFront now hold the real names (`api.nirmaancenter.com`).
- [x] Later the same week: DNS for `api.` `admin.` `media.` fixed by the client, GitHub workflow runs green, admin login works on AWS, temporary smoke-test admin deleted (2026-10-30)

Historical note, only needed if the box is parked again. To start again: allocate an Elastic IP, start the instance, associate it, give the client the `api` A record, wait for DNS, run the deploy (workflow, or by hand with `deploy.sh`).

## Phase 2b: park it until the domain arrives

- [ ] [ME] Take a final backup, then stop the instance
- [ ] [ME] Release the Elastic IP (saves $3.65/mo; the sslip.io name dies with it, which is fine)
- [ ] Cost while parked: about $3/mo (the disk). Admin site and images in S3 still load; the API and admin logins are down.

When the domain arrives: start the instance, attach a new IP, add DNS records, request the
two certificates, add the alternate names to CloudFront, change `API_DOMAIN` and
`MEDIA_PUBLIC_BASE_URL` in SSM, update the Lambda callback address, redeploy, rebuild search.

## Runbook fixes found while building (put in the Phase 2 PR)

- CloudFront "403/404 to index.html" error rule also rewrites the API's own 403/404. Use a CloudFront Function on the admin pages instead (done in AWS).
- ECR keeps 5 images, not 10. Backup bucket needs old-version expiry.
- `aws ssm get-command-invocation` fails on Windows with a character-encoding error; set `PYTHONUTF8=1`.
- On Windows Git Bash, set `MSYS_NO_PATHCONV=1` or paths such as `/golden-abode/prod/` get rewritten.

## Phase 3: put data on AWS (copy, never move)

- [ ] `pg_dump` of the Railway database (read-only, Railway keeps running)
- [ ] [ME] Restore it into the AWS database, then request the search rebuild
- [ ] [ME] Run `media:load-demo` so products have images
- [ ] Check: product counts on AWS match Railway

## Phase 4: test AWS in parallel

- [ ] Admin login on the AWS admin address
- [ ] Upload a product image: Processing turns to Ready, thumbnail shows
- [ ] Search returns products with images
- [ ] [ME] Add an `aws-preview` profile to `eas.json` (new profile, existing ones unchanged), build it, test on a phone
- [ ] Backup restore drill passes
- [ ] Look at the dead-letter queue and the alarm: no alerts

## Phase 5: cutover (pick a quiet hour, tell the client)

- [ ] Tell the client: no data entry during the window
- [ ] Take a **fresh** Railway dump, restore it to AWS, rebuild search (anything created since Phase 3 would otherwise be lost)
- [ ] Admin: point the live admin address at AWS (new admin domain, or the Vercel `VITE_API_BASE_URL`)
- [ ] [ME] Mobile: switch the three `eas.json` profiles to the AWS API address, build, submit to the stores
- [ ] Smoke test: login, upload, search, an order flow
- [ ] **Rollback if anything fails**: point admin back, skip the mobile release. Railway never stopped.

## Phase 6: after cutover

- [ ] Old app builds keep calling Railway until users update. Keep Railway running 1-2 weeks.
- [ ] Final Railway dump saved in the backup bucket
- [ ] Someone with Railway dashboard access (you have DB access only) stops the services
- [ ] [ME] Remove Railway wiring from the repo (`railway.toml`, Vercel rewrite, docs), update decision 0032
- [ ] Review the weekly `media:sweep` dry-run output, then switch it to `--apply`

## Money during the overlap

| Item                   | Monthly                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Railway (current)      | unchanged until stopped                                                                 |
| AWS while the box runs | about $22-30, paid from the $100 credit (expires 2027-04-04). Running since 2026-10-21. |
| AWS parked (Phase 2b)  | about $3                                                                                |
| Domain                 | about $10-15 per year                                                                   |

Do Phases 2-5 close together so the overlap stays short.
