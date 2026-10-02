# 0031 — Moving the local catalog, vendor and inventory data to production

- **Date:** 2026-10-02
- **Status:** Accepted
- **Supersedes / Superseded by:** —

## Context

Product catalog, vendor onboarding and vendor inventory work is merged to `origin/main`
(PR #16 plus the mobile/admin PRs). The data that work produced lives only in the local
Docker Postgres (`golden-abode-postgres`, volume `golden-abode_postgres_data`). Nothing
guarantees it can be recreated, so it needs a path to the production database
([railway.toml](../../railway.toml); host may move to AWS per [0025](0025-full-aws-migration.md)).

Local state on 2026-10-02 (exact `count(*)`, not `pg_stat` estimates):

| Table                                              | Rows              | Recreatable from the repo?                                                                                                                                         |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `category` / `attribute` / options                 | 79 / 264 / 1021   | yes — taxonomy seeder                                                                                                                                              |
| `city` / `pincode_city_map` / `hsn_code` / `brand` | 5 / 163 / 26 / 13 | yes — seeders                                                                                                                                                      |
| `master_product`                                   | 645               | **partly**: Pearl 293 has a seeder; Lavish 192 and the 160 sample-seed products (Havells, Crabtree, …) were uploaded through the import API and have **no seeder** |
| `master_product_attribute_value`                   | 4522              | same as above                                                                                                                                                      |
| `vendor_listing` / `inventory`                     | 108 / 108         | no — created through the vendor upload flow                                                                                                                        |
| `users` / `vendors` / `vendor_account_details`     | 6 / 2 / 2         | no                                                                                                                                                                 |
| `master_product_media`                             | **0**             | images exist only as files in `docs/vendor-assets/`                                                                                                                |

Product status locally: Lavish 192 `live`; Pearl 143 `live` + 150 `draft`; the 160 sample-seed products `draft`.

The user's call: this is test data, but **treat it as production for now**; when the real app
launches, production starts again from fresh data (see Consequences).

## Options considered

### Option A — Data-only `pg_dump` / `pg_restore` into a production DB whose schema came from migrations

- **Pro:** Preserves every UUID, so `vendor_listing` and `inventory` keep pointing at the same
  `master_product` rows. Nothing has to be re-derived.
- **Pro:** Schema comes from the migrations the deploy already runs
  ([docker-entrypoint.sh](../../apps/backend/docker-entrypoint.sh)), so prod's `SequelizeMeta` stays truthful.
- **Con:** Needs `--disable-triggers` (superuser) because `category` has circular FKs and the
  search-sync triggers would otherwise write 14k outbox rows during load.
- **Con:** Search index is empty until a rebuild is requested.

### Option B — Re-run seeders and re-upload through the admin/vendor import APIs

- **Pro:** Exercises the real code path; no DB-level access to prod needed.
- **Con:** Lavish and the 160 sample products have no seeder; they would need the CSVs
  re-uploaded by hand. Seeders and imports mint **new UUIDs**, so the 108 listings and
  inventory rows cannot be carried over — vendors would redo their uploads.

### Option C — Full `pg_dump` (schema + data) restored over prod

- **Pro:** One command.
- **Con:** Drags in `SequelizeMeta` (43 entries, including the unmerged
  `20260916090000-create-customers.js` that exists only in the phase-3 worktree), so prod's
  migration state would no longer match `main`.
- **Con:** Copies `refresh_tokens` and the 14k-row `search_outbox`.

## Decision

**Option A.** Verified locally on 2026-10-02: schema built from `main`'s 42 migrations in a
scratch database, then the data restored into it — every row count matched the source and an
`md5` over `master_product (id, status, attributes_flat)` was identical.

Dump (excludes migration state, sessions, outbox/queue tables and the unmerged `customers` table):

```bash
pg_dump -U postgres -d golden_abode --data-only --disable-triggers -Fc \
  -T '"SequelizeMeta"' -T refresh_tokens -T search_outbox -T catalog_reindex_queue -T customers \
  -f ga-data.dump
```

Restore (prod DB URL comes from the environment, never from chat or git):

```bash
pg_restore --data-only --disable-triggers --no-owner -d "$PROD_DATABASE_URL" ga-data.dump
```

Order of operations:

1. Fix the failing **Format Check** on `main` (`pnpm format`), so lint / type-check / build /
   tests actually run, then deploy `main`. The entrypoint applies migrations to an empty prod DB.
2. Snapshot the prod DB, **and count rows first** (`users`, `vendors`, `brand`, `category`, `city`).
   This plan assumes prod holds nothing but migrations. Not verified: a read-only probe on
   2026-10-02 (`GET /api/search?pincode=110001` → `cityId: null`) shows `city` / `pincode_city_map`
   are empty, and `/health` shows Postgres and Redis up, but nothing else about prod's data is known.
   A data-only restore into non-empty tables fails on primary-key / unique conflicts (e.g. a prod
   user with the same phone).
3. Restore (above).
4. **Before exposing prod:** the dump carries the dev admin (`admin@goldenabode.com`, password hash
   from `20260617000001-seed-users.js`) and three dummy accounts (`+918888888888`,
   `+917777777777`, `+916666666666`). Set a new bcrypt hash on the admin and delete the three
   dummies (none own a `vendors` row — checked locally).
5. Build the search index. Needs Meilisearch + Redis reachable from the backend (`SEARCH_ENGINE`,
   `MEILI_HOST`, `MEILI_MASTER_KEY`, `MEILI_PRODUCTS_INDEX`, Redis vars; `WORKER_MODE` unset or
   `all` on exactly one backend instance). Request the rebuild with either
   `POST /api/admin/search/rebuild` (admin token) **or**, with no login at all:
   `INSERT INTO search_outbox (entity_type, reason) VALUES ('all', 'post-restore');`
   The worker picks the marker up within ~2 s, builds `products_rebuild` and swaps it in.
6. Spot-check: `GET /api/search?pincode=110001` should report `total: 92` for this dataset.

## Why

Listings and inventory are the only data that cannot be recreated, and they are only valid if
the `master_product` UUIDs they reference survive. Only a data-level copy keeps that. Taking the
schema from migrations instead of the dump keeps prod's migration history honest and sidesteps
the local-only `customers` table.

## Consequences

- **Not yet run against the real production DB.** Untested: whether the prod DB role is a
  superuser (needed for `--disable-triggers`), and the search rebuild after a restore.
- **Only 92 of the 335 `live` products are searchable.** A search document exists only for a
  `live` product with at least one `active` `vendor_listing` from a vendor in an active city
  ([search-document.builder.ts](../../apps/backend/src/modules/search/indexing/search-document.builder.ts)).
  Locally all 92 are Lavish Ceramics floor tiles, all sold from Delhi (both vendors are in Delhi);
  the other cities return 0. Verified 2026-10-02 on the local stack: Meilisearch held 92 docs, a
  SQL-marker rebuild consumed the marker and swapped 92 documents back in, and
  `GET /api/search?q=tile&pincode=110001` returned `total: 92`.
- Prod Meilisearch is not provisioned by anything in the repo ([0021](0021-search-runtime-build-plan.md)
  deferred it); confirm the service exists on the host before step 5. Pinned `v1.53.1`, local-disk
  volume only. Sizing measured locally 2026-10-02 (92 documents, idle): ~49 MiB RAM, ~0.4% CPU,
  2.8 MB on disk. At Railway's published usage rates (RAM $10/GB-mo, CPU $20/vCPU-mo, volume
  $0.15/GB-mo, checked 2026-10-02) that is roughly $1/month or less. There is no permanent free
  tier that covers the whole stack: Free = $1 credit/month and 0.5 GB RAM per service, Hobby =
  $5/month with $5 usage included, Pro = $20/month with $20 included. Which plan the project is
  actually on was not checked.
- **Without Meilisearch, search still works, degraded.** Verified 2026-10-02 by booting the backend
  with `MEILI_HOST` pointing at a dead port: the app boots (bootstrap logs an error and carries on),
  `/health` returns 200, and `GET /api/search?pincode=110001` answers from Postgres with
  `engine: "postgres"`, `degraded: true`. Known flaw: the Postgres path sets `total = hits.length`
  ([search.service.ts](../../apps/backend/src/modules/search/search.service.ts) `searchPostgres`), so
  `total` is the page size, not the match count (`limit=1` → 1, `limit=100` → 92; Meilisearch
  reports 92 for all). Anything paginating on `total` breaks in that mode. Redis was not removed in
  this test; behaviour without Redis is unverified.
- `master_product_media` is empty, so prod has **no product images**. Blocked on the bucket
  decision (GCS per [0024](0024-product-images-gcs.md) vs S3 per [0025](0025-full-aws-migration.md))
  and on an upload script that maps `docs/vendor-assets/**/images/<mfr_part_number>.jpg` to rows.
  Measured 2026-10-02: Lavish 122 images match 122 products exactly. Sparsh Pearl 118 images:
  106 match exactly, 12 are cistern series images named by base code (`C-001`) that serve the
  colour variants (`C-001/WH`, `C-001/IV`, `C-001/CLR`), so the script needs a base-code fallback;
  together they cover 136 of 293 Pearl products. The 240 JPGs (~148 MB, Lavish avg 1.2 MB, max
  5.4 MB) are tracked in git; the 39 MB of Pearl source PDFs are git-ignored (`*.pdf`) and exist
  only on the local disk.
- **There is no Sparsh Pearl inventory anywhere.** All 108 `vendor_listing` / `inventory` rows are
  Lavish Ceramics (2 Delhi test vendors, 92 of 192 Lavish products). `docs/vendor-assets/` holds
  catalog data and images only, no price or stock.
- The Sparsh Pearl brand still has **placeholder** consumer-care email/phone
  ([0026](0026-pearl-precision-brand-onboarding.md)); they go to prod as-is.
- Docker's `golden-abode-postgres` needs port 5432; the `masteracres-*` containers use the same
  port, so only one can run at a time.
- `database/config.js` hard-codes the `development` environment to `golden_abode`; only
  `--env production` reads `DATABASE_URL` / `DB_*`. Use that for any scratch or remote target.
- **At real launch, prod starts fresh** (reset the schema, redeploy migrations, seeders for reference
  data + Pearl). Before then, Lavish (192) and the 160 sample products need a seeder or a re-import
  from `docs/vendor-assets/lavish-ceramics/lavish-ceramics-products.csv` and `docs/seed-samples/`,
  because only this dump currently holds them.

## Demo addendum (2026-10-02)

The "production" Railway environment is a **remote dev/demo environment** for a client demo, not
a launch. Real production starts fresh later. For the demo:

- All 6 local users were set `is_approved = true` (`is_active` was already true everywhere).
- [apps/backend/database/demo/demo-vendors-and-sparsh-listings.sql](../../apps/backend/database/demo/demo-vendors-and-sparsh-listings.sql)
  adds a third vendor and Sparsh listings (it is not a seeder; `db:seed:all` never runs it):
  - A Lavish Tiles Gallery (62 listings), B Delhi Tile House (46 Lavish + 17 Sparsh),
    C Delhi Sanitary Mart (143 Sparsh; re-uses the seed vendor user `+917777777777`). All Delhi, approved.
  - `vendor_category` filled for all three (22 rows).
  - **All Sparsh prices and stock are invented** (Sparsh's real prices are not in the repo).
  - Result, verified locally: 268 listings, search `total` 235 (Lavish 92 + Sparsh 143), 33 products with
    two sellers (16 Lavish, 17 Sparsh), "other sellers" lists both shops.
- Dump + restore dry-run repeated with this data: 18 tables, 0 row-count mismatches.
- Still true for the demo: no product images (nothing in search, backend or mobile reads
  `master_product_media`), Delhi-only, Sparsh brand contact is a placeholder.

### Chosen path: a migration that loads the demo data on deploy

Instead of restoring by hand, the data ships in the repo and loads itself when the backend
boots (the entrypoint runs `sequelize-cli db:migrate`):

- [20261002100000-load-demo-catalog-and-vendors.js](../../apps/backend/database/migrations/20261002100000-load-demo-catalog-and-vendors.js)
  reads [demo-data.json](../../apps/backend/database/demo-data/demo-data.json) (2.3 MB, one row per
  line, exported from the local DB) and inserts reference data, the catalog, vendor onboarding and
  vendor inventory in foreign-key order inside one transaction, then queues a search rebuild.
- **Off by default.** It only loads when `LOAD_DEMO_DATA=true` is set on the backend service. A
  migration runs in CI, in every developer's database and, one day, in real production; without
  the flag it is a recorded no-op. Catch: it is recorded as done, so setting the flag _after_ the
  deploy that carried it does nothing; delete its row from `"SequelizeMeta"` and redeploy to load.
- **Only on a blank database.** If `unit_of_measure`, `hsn_code`, `city`, `category`, `attribute`,
  `brand`, `master_product`, `vendors` or `vendor_listing` already has rows (say because seeders
  ran, which generate random UUIDs) it logs a warning and loads nothing. It never fails the deploy.
- Users already present with the same phone number (e.g. a hand-made admin) keep their password;
  only their id is aligned so the vendors' foreign keys resolve, and they are marked approved.
- `down` removes exactly the inserted rows by id and keeps users.
- Two deliberate changes to the data: products are inserted as `draft` and switched to their real
  status after their attribute values exist (the publish trigger demands that), and the two vendor
  **bank account numbers are replaced by fakes** (`000000000001`, `000000000002`) so nothing
  real-looking enters git history. All Sparsh prices and stock remain invented.

Tested 2026-10-02 on a scratch database built from `main`'s 42 migrations: no flag → no-op;
flag → 17 tables loaded in ~11 s with row counts and `md5` checksums (products, attribute values,
listings) identical to the source; `down` → clean (users kept); reload over a pre-existing admin
with another id → id aligned, password kept; non-blank database → warning, nothing changed; the
backend, started on that database, answered `GET /api/search?pincode=110001` (Postgres engine).
Not tested: the migration inside the Railway container itself (the `database/` folder ships in the
image: `npm pack --dry-run` lists both files), and a non-superuser database role (the migration
does not need superuser: it keeps triggers on).

Before the demo: set `LOAD_DEMO_DATA=true` on the Railway backend service, make sure the demo
database has no seeded reference data, merge, deploy. Before the real launch: delete this migration
file and its `demo-data/` folder (or leave the flag unset, which keeps it a no-op).

### Fallback: manual restore

Remote restore. The user's Railway **public** Postgres URL goes in `$RAILWAY_DB_URL` (never
committed or pasted). Run from Git Bash with `MSYS_NO_PATHCONV=1`.

**Step 0 — the remote DB must be empty of data but already have the schema.** This is left to
the user and was deliberately not scripted: an attempt to add a script that wipes every table on
the remote was blocked by the session's safety classifier ("mass delete"), and was not worked
around. Two ways, user's choice:
(a) in Railway, recreate the Postgres database and redeploy the backend so its boot-time
migrations rebuild the schema; or (b) the user runs a `TRUNCATE ... CASCADE` over every public
table except `"SequelizeMeta"` themselves. Do **not** point step 1 at a database that is not
empty: a data-only restore fails on primary-key and unique conflicts.

The dump goes straight from the local container into the remote; no file with password hashes is
written to disk. Tested 2026-10-02 against a local scratch database through the same
`docker run ... -e U=<url>` path (counts matched on every table checked):

```bash
export MSYS_NO_PATHCONV=1

# 1. restore: local container -> remote
docker exec golden-abode-postgres pg_dump -U postgres -d golden_abode --data-only --disable-triggers -Fc \
  -T '"SequelizeMeta"' -T refresh_tokens -T search_outbox -T catalog_reindex_queue -T customers \
  | docker run --rm -i -e U="$RAILWAY_DB_URL" postgres:16-alpine \
      sh -c 'pg_restore --data-only --disable-triggers --no-owner -d "$U"'

# 2. queue the search rebuild (the backend worker picks it up in ~2 s)
docker run --rm -e U="$RAILWAY_DB_URL" postgres:16-alpine \
  sh -c "psql \"\$U\" -Atc \"insert into search_outbox (entity_type, reason) values ('all','demo restore');\""
```

`--disable-triggers` needs a superuser on the remote (Railway's default Postgres role normally
is; unverified). Check the remote schema first: `select count(*) from "SequelizeMeta"` should be
42 (`main`'s migrations; the local DB has 43 because of the unmerged `customers` migration).

## Open questions

- Is the prod Postgres role a superuser? If not, restore with triggers on and accept the outbox
  noise, or ask the host for a one-off elevated role.
- Image storage vendor (0024 vs 0025) and who writes the upload script.
- Whether the 150 draft Pearl and 160 sample products should be bulk-published
  (`PATCH /admin/catalog/products/bulk-publish`) in prod.

## Sources

- [0026](0026-pearl-precision-brand-onboarding.md), [0027](0027-lavish-ceramics-brand-onboarding.md) — how the catalog data was produced
- [apps/backend/database/config.js](../../apps/backend/database/config.js), [docker-entrypoint.sh](../../apps/backend/docker-entrypoint.sh)
- Local dry-run on 2026-10-02 (scratch DB, since dropped)
