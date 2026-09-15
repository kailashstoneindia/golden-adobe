# Real `inStock` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SearchDocument.inStock` reflect real inventory instead of the literal `true` it is hardcoded to in both search paths, and make the already-declared `inStockOnly` filter actually reach the SQL.

**Architecture:** Six changes, no new tables and no migration. The indexing builder and the Postgres fallback each gain an `inventory` join and derive `inStock` from it; `inStockOnly` is plumbed from the HTTP DTO through the service to both engines; the Meilisearch filter and the Redis cache key learn about it; a reindex applies the new document shape. The inventory search-sync triggers already fan out on any `inventory` write, so no trigger work is needed.

**Tech Stack:** NestJS 10, Sequelize (raw SQL via `sequelize.query`), PostgreSQL 16, Meilisearch v1.53.1, Redis 7, pnpm workspaces.

**Spec:** [docs/decisions/0024-cart-owner-reservation-and-real-instock.md](../../decisions/0024-cart-owner-reservation-and-real-instock.md) — rules 4, 5 and 6 are what this plan implements. Rules 1–3 (customers table, reservation at checkout, webhook confirmation) are **not** in this plan.

## Global Constraints

These apply to every task. They override the default habits of any skill or worker.

- **The 25-test Jest suite is frozen. Do NOT create any new `.spec.ts` file.** Verification is manual throwaway scripts against live Postgres, deleted after they pass. This overrides TDD's "write the failing test" default — the failing-test step is a throwaway script, not a suite addition.
- **Never report a test, migration or database result that was not executed in the current session.** A remembered result is not a verification.
- **A green build and green tests do not mean the app runs.** Any task touching a module, model or query ends with a rebuild and `pnpm smoke`.
- **Rebuild before smoke.** `pnpm smoke` boots from `dist/`; a stale `dist/` has produced false failures before.
- **Any HTTP-level test harness must register `ResponseInterceptor`**, which `main.ts` registers globally. Without it responses come back unwrapped and every assertion checks the wrong shape.
- **`packages/types` must be built before the backend** — the backend imports its compiled `dist/`. Run `pnpm --filter @golden-abode/types build` first if types change.
- **Paint (`sale_unit_type = 'tinted_to_order'`) never has an inventory row** (0007, 0022 rule 4). An absent inventory row means "in stock" for paint and "never set, therefore not in stock" for everything else. This is the single highest-consequence rule in the plan.
- Work happens in the worktree at `Z:\workspace\golden-abode\.claude\worktrees\phase-3-cart-reservation` on branch `worktree-phase-3-cart-reservation`. Do not `cd` to the parent repo.
- Database: `golden_abode` on `localhost:5432` via the `golden-abode-postgres` container. Scratch rows must be cleaned up; scratch scripts must be deleted.
- **Write throwaway scripts to the session scratchpad, not to `scratch/` inside the repo.** `scratch/` is *not* gitignored (verified with `git check-ignore`), so a script left there is stageable and one careless `git add -A` commits it. Use `$SCRATCHPAD` — set it once per session:
  ```bash
  export SCRATCHPAD="C:/Users/conta/AppData/Local/Temp/claude/z--workspace-golden-abode/8cf0576f-6306-4e77-8d39-06ec0d5bc043/scratchpad"
  ```
  Every `scratch/verify-*.js` path below means `$SCRATCHPAD/verify-*.js`. The scripts `require()` the backend's compiled `dist/` by absolute path, so their own location does not matter.
- **`ResponseInterceptor` lives at `apps/backend/src/common/interceptors/response.interceptor.ts`** and is registered globally at `main.ts:33` — verified, not assumed. From compiled output the import is `require('<repo>/apps/backend/dist/common/interceptors/response.interceptor')`.

---

### Task 1: Derive `inStock` in the indexing builder

**Files:**
- Modify: `apps/backend/src/modules/search/indexing/search-document.builder.ts:93-147`
- Verify: throwaway script at `scratch/verify-builder-instock.js` (deleted in Step 6)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SearchDocumentRecord.in_stock` now varies per document. Task 3 and Task 5 rely on documents already carrying a truthful `in_stock`; Task 6 reindexes to apply it.

**The critical constraint:** the existing `JOIN LATERAL ... ON agg.cheapest_vendor_listing_id IS NOT NULL` is what removes products with no active listing from the index. Stock must be computed **inside** the aggregate as an extra output column. It must **not** appear as a `WHERE` clause on the joined listings, or a product whose listings are all out of stock would be *deleted from the index* rather than indexed with `inStock: false`.

- [ ] **Step 1: Write the throwaway verification script**

Create `scratch/verify-builder-instock.js`:

```js
// THROWAWAY — delete after this passes. Verifies decision 0024 rules 4 and 5
// against live Postgres by exercising the builder's SQL directly.
const { Client } = require('pg');

const SQL_UNDER_TEST = `
  SELECT
    vl.master_product_id,
    (BOOL_OR(
       CASE
         WHEN mp.sale_unit_type = 'tinted_to_order' THEN TRUE
         WHEN inv.vendor_listing_id IS NULL THEN FALSE
         ELSE (inv.quantity_available - inv.quantity_reserved) > 0
       END
     )) AS in_stock
  FROM vendor_listing vl
  JOIN master_product mp ON mp.id = vl.master_product_id
  LEFT JOIN inventory inv
    ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
  WHERE vl.master_product_id = $1 AND vl.status = 'active'
  GROUP BY vl.master_product_id
`;

(async () => {
  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();
  const tag = `instock-verify-${Date.now()}`;
  let pass = 0, fail = 0;
  const check = (name, actual, expected) => {
    if (actual === expected) { console.log(`PASS  ${name} -> ${actual}`); pass++; }
    else { console.error(`FAIL  ${name} -> got ${actual}, expected ${expected}`); fail++; }
  };

  try {
    await db.query('BEGIN');

    // Reuse a real category/vendor so FKs and triggers behave as in production.
    const { rows: [cat] } = await db.query(
      `SELECT id FROM category WHERE is_leaf = true LIMIT 1`);
    const { rows: [vendor] } = await db.query(
      `SELECT id FROM vendors WHERE city_id IS NOT NULL LIMIT 1`);
    if (!cat || !vendor) throw new Error('need at least one leaf category and one vendor with a city');

    const mk = async (saleUnitType) => {
      const { rows: [p] } = await db.query(
        `INSERT INTO master_product (id, name, category_id, status, sale_unit_type, is_generic, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'live', $3, true, now(), now()) RETURNING id`,
        [`${tag}-${saleUnitType}`, cat.id, saleUnitType]);
      const { rows: [l] } = await db.query(
        `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, min_order_qty, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 100, 1, 'active', now(), now()) RETURNING id`,
        [vendor.id, p.id]);
      return { productId: p.id, listingId: l.id };
    };
    const stock = (listingId, available, reserved) => db.query(
      `INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, $2, $3, now(), now())`,
      [listingId, available, reserved]);
    const inStockOf = async (productId) => {
      const { rows } = await db.query(SQL_UNDER_TEST, [productId]);
      return rows[0] ? rows[0].in_stock : null;
    };

    // 1. stock available -> true
    const a = await mk('discrete'); await stock(a.listingId, 10, 0);
    check('discrete, 10 available, 0 reserved', await inStockOf(a.productId), true);

    // 2. zero stock -> false
    const b = await mk('discrete'); await stock(b.listingId, 0, 0);
    check('discrete, 0 available', await inStockOf(b.productId), false);

    // 3. fully reserved -> false (this is the whole point of netting)
    const c = await mk('discrete'); await stock(c.listingId, 5, 5);
    check('discrete, 5 available, 5 reserved', await inStockOf(c.productId), false);

    // 4. partially reserved -> true
    const d = await mk('discrete'); await stock(d.listingId, 5, 2);
    check('discrete, 5 available, 2 reserved', await inStockOf(d.productId), true);

    // 5. no inventory row, not paint -> false
    const e = await mk('discrete');
    check('discrete, NO inventory row', await inStockOf(e.productId), false);

    // 6. no inventory row, IS paint -> true  <<< the trap
    const f = await mk('tinted_to_order');
    check('paint, NO inventory row', await inStockOf(f.productId), true);

    // 7. one listing out, another in -> true (BOOL_OR across vendors)
    const g = await mk('discrete'); await stock(g.listingId, 0, 0);
    const { rows: [v2] } = await db.query(
      `SELECT id FROM vendors WHERE city_id IS NOT NULL AND id <> $1 LIMIT 1`, [vendor.id]);
    if (v2) {
      const { rows: [l2] } = await db.query(
        `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, min_order_qty, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 120, 1, 'active', now(), now()) RETURNING id`,
        [v2.id, g.productId]);
      await stock(l2.id, 7, 0);
      check('two vendors, one out one in', await inStockOf(g.productId), true);
    } else {
      console.log('SKIP  two-vendor case (only one vendor with a city exists)');
    }
  } finally {
    // ROLLBACK, not DELETE: nothing scratch survives even if an assert threw.
    await db.query('ROLLBACK');
    await db.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Run it to confirm it fails against the current hardcode**

```bash
cd apps/backend
node ../../scratch/verify-builder-instock.js
```

Expected: the script's SQL is not yet in the builder, so this proves the *derivation* is correct before wiring it in. All 7 checks should PASS here — the script tests the SQL directly, not the builder. If any FAIL, the derivation is wrong and must be fixed before touching the builder.

- [ ] **Step 3: Add the inventory join to the builder's aggregate**

In `search-document.builder.ts`, replace the `JOIN LATERAL` block (lines 108-118) with:

```sql
      JOIN LATERAL (
        SELECT
          MIN(vl.price)                             AS price,
          COUNT(DISTINCT vl.vendor_id)              AS vendor_count,
          (ARRAY_AGG(vl.id ORDER BY vl.price ASC, vl.id ASC))[1] AS cheapest_vendor_listing_id,
          -- Decision 0024 rules 4 and 5. Computed INSIDE the aggregate as an
          -- output column, never as a WHERE on the joined listings: filtering
          -- here would drop an out-of-stock product from the index entirely
          -- instead of indexing it as in_stock = false.
          --
          -- The CASE order matters. Paint (tinted_to_order) never gets an
          -- inventory row by design (0007, 0022 rule 4), so for paint an
          -- absent row means AVAILABLE. For anything else an absent row means
          -- stock was never set, which is NOT available. Same NULL, opposite
          -- meanings, and only sale_unit_type separates them.
          BOOL_OR(
            CASE
              WHEN mp2.sale_unit_type = 'tinted_to_order' THEN TRUE
              WHEN inv.vendor_listing_id IS NULL THEN FALSE
              ELSE (inv.quantity_available - inv.quantity_reserved) > 0
            END
          )                                         AS in_stock
        FROM vendor_listing vl
        JOIN vendors v ON v.id = vl.vendor_id
        JOIN master_product mp2 ON mp2.id = vl.master_product_id
        -- warehouse_id IS NULL matches the partial unique index installed by
        -- 20260914090000; idx_inventory_listing_all serves this lookup
        -- unpartialed, so out-of-stock rows are reachable.
        LEFT JOIN inventory inv
          ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
        WHERE vl.master_product_id = live.master_product_id
          AND v.city_id = live.city_id
          AND vl.status = 'active'
      ) agg ON agg.cheapest_vendor_listing_id IS NOT NULL
```

Add `agg.in_stock` to the outer `SELECT` list, after `agg.cheapest_vendor_listing_id` (line 103):

```sql
        agg.cheapest_vendor_listing_id,
        agg.in_stock
```

Add `in_stock` to the row type (after `vendor_count: string;`, line 68):

```ts
      vendor_count: string;
      in_stock: boolean;
```

Replace the hardcode at line 145:

```ts
        inStock: row.in_stock,
```

- [ ] **Step 4: Rebuild and re-run the verification script**

```bash
cd apps/backend
pnpm build
node ../../scratch/verify-builder-instock.js
```

Expected: `7 passed, 0 failed` (or 6 passed with the two-vendor case skipped). Build must exit 0 with no TypeScript errors.

- [ ] **Step 5: Boot the app**

```bash
cd apps/backend
pnpm smoke
```

Expected: `SMOKE PASSED`, all 23 routes mapped.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm scratch/verify-builder-instock.js
git add apps/backend/src/modules/search/indexing/search-document.builder.ts
git commit -m "fix(search): derive inStock from inventory in the indexing builder

inStock was the literal `true` for every document ever built. It becomes
(quantity_available - quantity_reserved) > 0, aggregated across the vendors
selling that product in that city.

Computed inside the existing LATERAL aggregate as an output column rather
than as a WHERE on the joined listings: filtering there would delete an
out-of-stock product from the index instead of indexing it as out of stock.

Paint is the trap. A tinted_to_order listing never gets an inventory row by
design (0007, 0022 rule 4), so an absent row means AVAILABLE for paint and
NEVER SET for everything else — the same NULL with opposite meanings,
separated only by sale_unit_type.

Decision 0024 rules 4 and 5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Derive `inStock` in the Postgres fallback, and honour `inStockOnly`

**Files:**
- Modify: `apps/backend/src/modules/search/fallback/postgres-search.service.ts:139-214`
- Verify: throwaway script at `scratch/verify-fallback-instock.js` (deleted in Step 6)

**Interfaces:**
- Consumes: nothing from Task 1 (independent file, same derivation logic restated).
- Produces: `PostgresSearchService.search(input)` honours `input.inStockOnly?: boolean` (the field already exists at line 34 and is currently ignored). Task 3 passes it in.

**The critical constraint:** this query `GROUP BY`s per product with `MIN(vl.price)`. Stock is therefore a `BOOL_OR` over the grouped listings, and `inStockOnly` filters on that aggregate — so it belongs in **`HAVING`**, alongside the existing price filters, never in `WHERE`.

- [ ] **Step 1: Write the throwaway verification script**

Create `scratch/verify-fallback-instock.js`:

```js
// THROWAWAY — delete after this passes. Drives the real PostgresSearchService
// through the compiled dist/, so it tests the shipped code path rather than a
// copy of its SQL.
process.env.WORKER_MODE = 'api';
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');

(async () => {
  const { AppModule } = require('../apps/backend/dist/app.module');
  const {
    PostgresSearchService,
  } = require('../apps/backend/dist/modules/search/fallback/postgres-search.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const svc = app.get(PostgresSearchService);

  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();

  const tag = `fallback-instock-${Date.now()}`;
  const created = { products: [], listings: [] };
  let pass = 0, fail = 0;
  const check = (name, actual, expected) => {
    if (actual === expected) { console.log(`PASS  ${name} -> ${actual}`); pass++; }
    else { console.error(`FAIL  ${name} -> got ${actual}, expected ${expected}`); fail++; }
  };

  try {
    const { rows: [cat] } = await db.query(
      `SELECT id FROM category WHERE is_leaf = true LIMIT 1`);
    const { rows: [vendor] } = await db.query(
      `SELECT id, city_id FROM vendors WHERE city_id IS NOT NULL LIMIT 1`);
    if (!cat || !vendor) throw new Error('need a leaf category and a vendor with a city');

    const mk = async (name, saleUnitType) => {
      const { rows: [p] } = await db.query(
        `INSERT INTO master_product (id, name, category_id, status, sale_unit_type, is_generic, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'live', $3, true, now(), now()) RETURNING id`,
        [name, cat.id, saleUnitType]);
      created.products.push(p.id);
      const { rows: [l] } = await db.query(
        `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, min_order_qty, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 100, 1, 'active', now(), now()) RETURNING id`,
        [vendor.id, p.id]);
      created.listings.push(l.id);
      return { productId: p.id, listingId: l.id };
    };
    const stock = (listingId, available, reserved) => db.query(
      `INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, $2, $3, now(), now())`,
      [listingId, available, reserved]);

    const inStocked = await mk(`${tag}-instock`, 'discrete');
    await stock(inStocked.listingId, 10, 0);
    const outOfStock = await mk(`${tag}-outofstock`, 'discrete');
    await stock(outOfStock.listingId, 0, 0);
    const paint = await mk(`${tag}-paint`, 'tinted_to_order');

    const find = (hits, id) => hits.find((h) => h.masterProductId === id);

    // Unfiltered: all three come back, with correct inStock values.
    const all = await svc.search({ cityId: vendor.city_id, query: tag, limit: 100 });
    check('in-stock product present', !!find(all, inStocked.productId), true);
    check('  its inStock', find(all, inStocked.productId)?.inStock, true);
    check('out-of-stock product still RETURNED', !!find(all, outOfStock.productId), true);
    check('  its inStock', find(all, outOfStock.productId)?.inStock, false);
    check('paint (no inventory row) present', !!find(all, paint.productId), true);
    check('  its inStock', find(all, paint.productId)?.inStock, true);

    // Filtered: the out-of-stock one disappears, the other two remain.
    const only = await svc.search({ cityId: vendor.city_id, query: tag, inStockOnly: true, limit: 100 });
    check('inStockOnly keeps in-stock', !!find(only, inStocked.productId), true);
    check('inStockOnly DROPS out-of-stock', !!find(only, outOfStock.productId), false);
    check('inStockOnly keeps paint', !!find(only, paint.productId), true);
  } finally {
    for (const id of created.listings) {
      await db.query(`DELETE FROM inventory WHERE vendor_listing_id = $1`, [id]);
      await db.query(`DELETE FROM vendor_listing WHERE id = $1`, [id]);
    }
    for (const id of created.products) {
      await db.query(`DELETE FROM master_product WHERE id = $1`, [id]);
    }
    await db.end();
    await app.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/backend && pnpm build && cd ../..
node scratch/verify-fallback-instock.js
```

Expected: FAIL. `its inStock -> got true, expected false` for the out-of-stock product (the hardcode), and `inStockOnly DROPS out-of-stock -> got true, expected false` (the ignored filter).

- [ ] **Step 3: Add the join, the derivation, and the HAVING filter**

In `postgres-search.service.ts`, add to the `having` array after the `maxPrice` block (line 149):

```ts
    // Decision 0024 rule 4. This filters an AGGREGATE over the grouped
    // listings, so it must be HAVING, not WHERE — a WHERE would drop
    // individual out-of-stock listings and still return the product via its
    // remaining ones, which is a different question than the caller asked.
    if (input.inStockOnly) {
      having.push(`BOOL_OR(${IN_STOCK_CASE}) = TRUE`);
    }
```

Add the shared derivation as a module constant, immediately after `MAX_LIMIT` (line 69):

```ts
// Decision 0024 rules 4 and 5, shared between the SELECT list and the
// optional HAVING filter so the two can never disagree.
//
// Paint (tinted_to_order) never gets an inventory row by design (0007, 0022
// rule 4), so an absent row means AVAILABLE for paint and NEVER SET for
// everything else. Same NULL, opposite meanings.
const IN_STOCK_CASE = `
  CASE
    WHEN mp.sale_unit_type = 'tinted_to_order' THEN TRUE
    WHEN inv.vendor_listing_id IS NULL THEN FALSE
    ELSE (inv.quantity_available - inv.quantity_reserved) > 0
  END`;
```

In the `sql` template, add the join after `LEFT JOIN brand b` (line 179):

```sql
      LEFT JOIN brand b      ON b.id = mp.brand_id
      LEFT JOIN inventory inv
        ON inv.vendor_listing_id = vl.id AND inv.warehouse_id IS NULL
```

Add to the `SELECT` list after `vendor_count` (line 163):

```sql
        COUNT(DISTINCT vl.vendor_id) AS vendor_count,
        BOOL_OR(${IN_STOCK_CASE})    AS in_stock,
```

Add `in_stock: boolean;` to the row type after `vendor_count: string;` (line 194), then replace the hardcode and its now-false comment (lines 210-212):

```ts
      inStock: row.in_stock,
```

- [ ] **Step 4: Rebuild and re-run**

```bash
cd apps/backend && pnpm build && cd ../..
node scratch/verify-fallback-instock.js
```

Expected: `9 passed, 0 failed`.

- [ ] **Step 5: Boot the app**

```bash
cd apps/backend && pnpm smoke
```

Expected: `SMOKE PASSED`.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm scratch/verify-fallback-instock.js
git add apps/backend/src/modules/search/fallback/postgres-search.service.ts
git commit -m "fix(search): derive inStock in the Postgres fallback, and honour inStockOnly

Two defects in one file. inStock was hardcoded true, under a comment claiming
rows are 'in stock by construction' — true before 0022, when no inventory row
existed anywhere and an ACTIVE listing was the only signal there was. And
inStockOnly has been a declared input field since 6c while the SQL never read
it, so callers could pass it and silently get unfiltered results.

The filter is HAVING, not WHERE: it tests an aggregate over the listings
grouped per product. A WHERE would drop individual out-of-stock listings and
still return the product through its remaining ones.

Decision 0024 rules 4 and 5.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Plumb `inStockOnly` from HTTP through to both engines

**Files:**
- Modify: `apps/backend/src/modules/search/dto/search-query.dto.ts:67` (after `maxPrice`)
- Modify: `apps/backend/src/modules/search/search.controller.ts:32-44`
- Modify: `apps/backend/src/modules/search/search.service.ts:32-44` (`SearchRequest`), `:189-199` (`searchPostgres`), `:216-235` (`buildMeiliFilters`), `:239-252` (`cacheKey`)
- Verify: throwaway script at `scratch/verify-instockonly-http.js` (deleted in Step 6)

**Interfaces:**
- Consumes: `PostgresSearchService.search({ inStockOnly })` from Task 2.
- Produces: `SearchRequest.inStockOnly?: boolean`; `GET /api/search?inStockOnly=true` filters on both engines and caches distinctly.

**The cache-key constraint:** `inStockOnly` MUST join the cache key. Without it, a filtered and an unfiltered request with otherwise identical parameters hash to the same key and serve each other's results for up to 60 seconds.

- [ ] **Step 1: Write the throwaway verification script**

Create `scratch/verify-instockonly-http.js`:

```js
// THROWAWAY — delete after this passes. HTTP-level, so it must register
// ResponseInterceptor exactly as main.ts does, or every assertion checks an
// unwrapped body and fails for the wrong reason.
process.env.WORKER_MODE = 'api';
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');

(async () => {
  const { AppModule } = require('../apps/backend/dist/app.module');
  const { ResponseInterceptor } = require('../apps/backend/dist/common/interceptors/response.interceptor');

  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new ResponseInterceptor());
  await app.listen(0);
  const base = await app.getUrl();

  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();

  const tag = `http-instock-${Date.now()}`;
  const created = { products: [], listings: [] };
  let pass = 0, fail = 0;
  const check = (name, actual, expected) => {
    if (actual === expected) { console.log(`PASS  ${name} -> ${actual}`); pass++; }
    else { console.error(`FAIL  ${name} -> got ${actual}, expected ${expected}`); fail++; }
  };

  try {
    const { rows: [cat] } = await db.query(`SELECT id FROM category WHERE is_leaf = true LIMIT 1`);
    const { rows: [vendor] } = await db.query(
      `SELECT v.id, v.city_id FROM vendors v WHERE v.city_id IS NOT NULL LIMIT 1`);
    const { rows: [pin] } = await db.query(
      `SELECT pincode FROM pincode_city_map WHERE city_id = $1 LIMIT 1`, [vendor.city_id]);
    if (!cat || !vendor || !pin) throw new Error('need a leaf category, a vendor with a city, and a pincode for it');

    const mk = async (name) => {
      const { rows: [p] } = await db.query(
        `INSERT INTO master_product (id, name, category_id, status, sale_unit_type, is_generic, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'live', 'discrete', true, now(), now()) RETURNING id`,
        [name, cat.id]);
      created.products.push(p.id);
      const { rows: [l] } = await db.query(
        `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, min_order_qty, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 100, 1, 'active', now(), now()) RETURNING id`,
        [vendor.id, p.id]);
      created.listings.push(l.id);
      return { productId: p.id, listingId: l.id };
    };

    const good = await mk(`${tag}-instock`);
    await db.query(
      `INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, 10, 0, now(), now())`, [good.listingId]);
    const bad = await mk(`${tag}-outofstock`);
    await db.query(
      `INSERT INTO inventory (id, vendor_listing_id, warehouse_id, quantity_available, quantity_reserved, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, 0, 0, now(), now())`, [bad.listingId]);

    const get = async (qs) => {
      const res = await fetch(`${base}/api/search?${qs}`);
      const body = await res.json();
      if (!('success' in body) || !('data' in body)) {
        throw new Error(`envelope missing — is ResponseInterceptor registered? got ${JSON.stringify(body).slice(0, 200)}`);
      }
      return body.data;
    };

    const q = `q=${tag}&pincode=${pin.pincode}&limit=100`;
    const unfiltered = await get(q);
    const has = (d, id) => d.hits.some((h) => h.masterProductId === id);
    check('unfiltered returns in-stock', has(unfiltered, good.productId), true);
    check('unfiltered returns out-of-stock', has(unfiltered, bad.productId), true);

    const filtered = await get(`${q}&inStockOnly=true`);
    check('inStockOnly keeps in-stock', has(filtered, good.productId), true);
    check('inStockOnly drops out-of-stock', has(filtered, bad.productId), false);

    // The cache-collision regression: re-request unfiltered immediately. If
    // inStockOnly is missing from the cache key, this returns the FILTERED
    // response from cache and the out-of-stock product vanishes.
    const again = await get(q);
    check('unfiltered NOT poisoned by cached filtered result', has(again, bad.productId), true);
  } finally {
    for (const id of created.listings) {
      await db.query(`DELETE FROM inventory WHERE vendor_listing_id = $1`, [id]);
      await db.query(`DELETE FROM vendor_listing WHERE id = $1`, [id]);
    }
    for (const id of created.products) {
      await db.query(`DELETE FROM master_product WHERE id = $1`, [id]);
    }
    await db.end();
    await app.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/backend && pnpm build && cd ../..
node scratch/verify-instockonly-http.js
```

Expected: FAIL on `inStockOnly drops out-of-stock` — the DTO has no such field, so the parameter is discarded before it reaches the service.

- [ ] **Step 3: Add the DTO field**

In `search-query.dto.ts`, after the `maxPrice` block (line 67):

```ts
  @ApiPropertyOptional({
    description:
      'Return only products with stock available from at least one vendor in the city. ' +
      'Paint is always considered available — it is made to order and carries no inventory row (0007, 0022).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  inStockOnly?: boolean;
```

Add `IsBoolean` to the `class-validator` import list (line 4-13).

- [ ] **Step 4: Plumb it through controller and service**

In `search.controller.ts`, add to the `search()` call object after `maxPrice` (line 41):

```ts
      maxPrice: dto.maxPrice,
      inStockOnly: dto.inStockOnly,
```

In `search.service.ts`, add to `SearchRequest` after `maxPrice?: number;` (line 41):

```ts
  inStockOnly?: boolean;
```

Add to the `searchPostgres` call object after `maxPrice` (line 196):

```ts
      maxPrice: req.maxPrice,
      inStockOnly: req.inStockOnly,
```

Add to `buildMeiliFilters` after the `maxPrice` line (line 228):

```ts
    // in_stock is already a filterableAttribute in meili.indexes.ts, so this
    // needs no index settings change and no migration.
    if (req.inStockOnly) filters.push(`in_stock = true`);
```

Add to `cacheKey`'s `normalised` object after `max` (line 247):

```ts
      max: req.maxPrice ?? null,
      inStockOnly: req.inStockOnly ?? false,
```

- [ ] **Step 5: Rebuild, verify, boot**

```bash
cd apps/backend && pnpm build && cd ../..
node scratch/verify-instockonly-http.js
cd apps/backend && pnpm smoke
```

Expected: `5 passed, 0 failed`, then `SMOKE PASSED`.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm scratch/verify-instockonly-http.js
git add apps/backend/src/modules/search/dto/search-query.dto.ts \
        apps/backend/src/modules/search/search.controller.ts \
        apps/backend/src/modules/search/search.service.ts
git commit -m "feat(search): plumb inStockOnly from the query string to both engines

The field existed on PostgresSearchInput since 6c and was dropped at three
separate points: the DTO had no such property, the service never forwarded it,
and the SQL never read it. A caller could pass inStockOnly=true and silently
receive unfiltered results.

Meilisearch needs no settings change — in_stock has been a filterableAttribute
since 6e, it was simply never filtered on.

inStockOnly joins the Redis cache key. Without that, a filtered and an
unfiltered request with otherwise identical parameters hash identically and
serve each other's results for up to 60 seconds; the verification script
covers that regression specifically.

Decision 0024 rule 4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Reindex so live documents carry the new `inStock`

**Files:**
- Modify: none. This task runs existing code.

**Interfaces:**
- Consumes: the builder change from Task 1 — the rebuild path calls the same `SearchDocumentBuilder.build()`, so it needs no change of its own.
- Produces: a Meilisearch `products` index whose `in_stock` values are real.

Every document currently in Meilisearch was built with `inStock: true` baked in. Task 1 fixes the builder, but existing documents are not retroactively corrected — they are only rebuilt when their product changes. A full rebuild applies the new shape to all of them, via the shadow-index-and-atomic-swap path from 6h, so search stays available throughout.

- [ ] **Step 1: Confirm the worker is running and the index is currently wrong**

```bash
curl -s "http://localhost:7700/indexes/products/search" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"q":"","limit":3,"attributesToRetrieve":["id","name","in_stock"]}'
```

Expected: hits present, every one showing `"in_stock": true`. If the index is empty, note that and continue — the rebuild will populate it.

- [ ] **Step 2: Request the rebuild through the existing admin endpoint**

Requires an ADMIN bearer token. With the app running:

```bash
curl -s -X POST "http://localhost:3000/api/admin/search/rebuild" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected: `{"success":true,"data":{"queued":true,"pending":<n>}}`.

- [ ] **Step 3: Wait for the swap, then confirm values vary**

The rebuild job builds `products_rebuild` and swaps it in. Poll until `in_stock` is no longer uniformly true:

```bash
curl -s "http://localhost:7700/indexes/products/search" \
  -H "Authorization: Bearer $MEILI_MASTER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"q":"","limit":50,"attributesToRetrieve":["id","name","in_stock"]}' \
  | python -c "import json,sys; h=json.load(sys.stdin)['hits']; vals=[x['in_stock'] for x in h]; print('total',len(vals),'true',vals.count(True),'false',vals.count(False))"
```

Expected: with the current seed data (160 products, no inventory rows written), **most or all non-paint products should now report `false`** — that is the correct result, not a bug. Before this change nothing had stock because nothing had ever written `inventory`. Confirm any `true` values are paint (`sale_unit_type = 'tinted_to_order'`) by cross-checking one id in Postgres.

- [ ] **Step 4: Confirm the filter works against the live index**

```bash
curl -s "http://localhost:3000/api/search?pincode=110001&inStockOnly=true&limit=5"
```

Expected: a `{success, data}` envelope; every hit has `"inStock": true`.

- [ ] **Step 5: No commit**

This task changes no files. Record the observed counts in the task-completion notes so the next reader knows what the index looked like after the swap.

---

### Task 5: Update the decision record's status and close the loop

**Files:**
- Modify: `docs/decisions/0024-cart-owner-reservation-and-real-instock.md` (Consequences section)
- Modify: `docs/catalog-implementation-status.md` (add a Phase 3 section)

**Interfaces:**
- Consumes: the observed reindex counts from Task 4.
- Produces: nothing code-facing.

- [ ] **Step 1: Add an implementation note to 0024**

Append to the Consequences section of `0024-cart-owner-reservation-and-real-instock.md`:

```markdown
> [!NOTE]
> **Rules 4–6 implemented 2026-09-15.** `inStock` is derived in both the
> indexing builder and the Postgres fallback; `inStockOnly` is plumbed from the
> query string through to both engines and joins the Redis cache key. Verified
> against live Postgres with throwaway scripts (deleted), covering: stock
> present, zero stock, fully reserved, partially reserved, no inventory row
> (non-paint → out of stock), no inventory row (paint → in stock), and mixed
> vendors. The full reindex was run through the existing 6h rebuild-and-swap.
>
> Rules 1–3 (the `customers` table, reservation at checkout, webhook
> confirmation) are **not** implemented — they await the cart and checkout
> work in [0025](0025-cart-and-order-structure.md).
```

- [ ] **Step 2: Add a Phase 3 section to the implementation status doc**

Append to `docs/catalog-implementation-status.md`, before the "Testing approach" section:

```markdown
## Phase 3: cart, orders, payments — started 2026-09-15

| Item | Status |
|---|---|
| Decisions 0024 (cart owner, reservation point, `inStock`) and 0025 (cart/order structure) | ✅ Written |
| Real `inStock` end to end (builder, fallback, `inStockOnly`, Meili filter, cache key, reindex) | ✅ Done |
| `customers` table + `resolveCustomerByUserId` | ⬜ Not started |
| `cart` / `cart_item` | ⬜ Not started |
| `orders` / `order_vendor_group` / `order_items` | ⬜ Not started |
| Checkout + reservation write path | ⬜ Not started |
| Razorpay integration | ⛔ Blocked — credentials have external lead time |
| Notifications (FCM) | ⛔ Blocked — Firebase credentials |

**`quantity_reserved` still has no writer.** `inStock` nets it
(`quantity_available - quantity_reserved`), so the read side is ready, but
nothing increments it until checkout exists (0024 rule 2).

**Known prerequisite, not yet done:** `main.ts` needs `rawBody: true` before
any Razorpay webhook can have its signature verified — Nest's default parser
destroys the byte fidelity HMAC-SHA256 requires. Deliberately deferred to the
payments slice; it needs no credentials and can be verified with a synthetic
HMAC.
```

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0024-cart-owner-reservation-and-real-instock.md \
        docs/catalog-implementation-status.md
git commit -m "docs: record real inStock as implemented, open Phase 3 status

Marks 0024 rules 4-6 done and rules 1-3 outstanding, and opens a Phase 3
section in the implementation status doc so 'what is actually built' stays
answerable from one place.

Also records the rawBody prerequisite for Razorpay webhooks, which needs no
credentials and is easy to forget until a signature check fails mysteriously.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** — 0024's rules 4, 5 and 6 map to tasks:

| Spec item | Task |
|---|---|
| Rule 4 — `inStock = (available - reserved) > 0` | 1 (builder), 2 (fallback) |
| Rule 5 — no inventory row ⇒ in stock iff paint | 1 Step 3, 2 Step 3, asserted in both scripts |
| Rule 6 — search `inStock` is an aggregate, insufficient for cart | Documented in 0024; no code, correctly — nothing consumes it for cart yet |
| `inStockOnly` plumbing (3 dropped points) | 3 |
| Meili filter | 3 Step 4 |
| Cache key | 3 Step 4, regression-tested in 3 Step 1 |
| Reindex | 4 |
| Rules 1–3 (customers, reservation, webhook) | **Deliberately absent** — Task 5 records them as outstanding |

**Placeholder scan:** no TBD/TODO. Every code step carries real code; every verification step carries a real command and a stated expected result.

**Type consistency:** `in_stock` (snake_case) is the SQL column alias and the `SearchDocumentRecord` field; `inStock` (camelCase) is the `SearchDocument` field; `inStockOnly` is the DTO/`SearchRequest`/`PostgresSearchInput` field. `IN_STOCK_CASE` is defined once in Task 2 and used twice within that same file. `ResponseInterceptor`'s path is verified against the source and `main.ts:33`, not assumed — see Global Constraints.

**One judgement call the executor should know about:** Tasks 1 and 2 restate the same `CASE` derivation in two files rather than sharing it. That is deliberate — one is a string inside a `JOIN LATERAL` in the indexing builder, the other is a module constant spliced into a `GROUP BY` query in the fallback service, and the two files are in different modules with no shared SQL layer. Extracting a common helper would couple the indexing path to the query path for four lines of SQL. If they ever diverge, the verification scripts in both tasks assert the same seven cases, so the disagreement surfaces immediately.
