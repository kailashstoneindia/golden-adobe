# Customer, Cart and Order Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the six tables, models and one service method that ADR 0026 designed — `customers`, `customer_addresses`, `cart`, `cart_item`, `orders`, `order_vendor_group`, `order_items` — with no endpoints and no checkout logic.

**Architecture:** Five migrations (grouped so a pair that is meaningless apart — `cart`+`cart_item`, `orders`+`order_vendor_group` — lands as one migration each), seven Sequelize models under a new `CustomersModule`, and one service method (`resolveCustomerByUserId`) mirroring `VendorsService.resolveVendorByUserId` exactly. The module is registered in `AppModule` but wired to nothing yet — no controller, no route.

**Tech Stack:** NestJS 10, `sequelize-typescript`, `sequelize-cli` migrations, PostgreSQL 16, pnpm workspaces.

**Spec:** [docs/decisions/0026-customer-cart-order-schema.md](../../decisions/0026-customer-cart-order-schema.md) — all 8 decision rules. Also depends on [docs/decisions/0025-cart-and-order-structure.md](../../decisions/0025-cart-and-order-structure.md) rules 1, 6, 7 (item references `vendor_listing_id`; price/name snapshot onto `order_items`; traceability columns) and [docs/decisions/0024-cart-owner-reservation-and-real-instock.md](../../decisions/0024-cart-owner-reservation-and-real-instock.md) rule 1 (`resolveCustomerByUserId` mirrors the vendor pattern).

## Global Constraints

- **The 25-test Jest suite is frozen. Do NOT create any new `.spec.ts` file.** Verification is manual throwaway scripts against live Postgres, deleted after they pass. This overrides TDD's "write the failing test" default — the failing-test step in every task below is a throwaway script, not a suite addition.
- **Never report a test, migration or database result that was not executed in the current session.**
- **A green build and green tests do not mean the app runs.** Every task that adds a model or an association ends with a rebuild and `pnpm smoke` — this is not optional, and it is the exact failure class 0022 already hit once (a model added without registering an association target in `core/database/database.module.ts`'s eager `models: [...]` list broke boot silently past a green build).
- **Rebuild before smoke.** `pnpm smoke` boots from `dist/`; a stale `dist/` has produced false failures in this repo before.
- **`packages/types` must be built before the backend** if it changes — the backend imports its compiled `dist/`. Nothing in this plan touches `packages/types`, so this should not apply, but confirm before assuming.
- **Migrations use `queryInterface.createTable`/`addColumn` with explicit `references`, `onUpdate`, `onDelete`** — never bare foreign key columns. Wrap multi-statement migrations (an ENUM type plus a table, or several tables) in `queryInterface.sequelize.transaction(...)`, matching `20260827090001-create-vendor-listing.js`.
- **Every migration needs a working `down`.**
- **Models are `underscored: true`, `timestamps: true`**, matching every existing model in this codebase (`define: { timestamps: true, underscored: true }` is also the app-wide Sequelize default in `core/database/database.module.ts`, but each model still declares its own `@Table` options to match the existing style).
- **No new routes, no controller, no checkout logic.** This plan produces schema and one resolver method only. Anything that sounds like "add an endpoint" is out of scope — flag it as a follow-up, do not build it.
- Work happens in the worktree at `Z:\workspace\golden-abode\.claude\worktrees\phase-3-cart-reservation` on branch `worktree-phase-3-cart-reservation`. Do not `cd` to the parent repo.
- Database: `golden_abode` on `localhost:5432` via the `golden-abode-postgres` container, already running.
- Write throwaway scripts to the session scratchpad (ask the session for its exact path — do not use `scratch/` inside the repo; it is not git-ignored, verified with `git check-ignore` in a prior slice on this branch).

---

### Task 1: `customers` table and model

**Files:**
- Create: `apps/backend/database/migrations/20260916090000-create-customers.js`
- Create: `apps/backend/src/modules/customers/models/customer.model.ts`
- Verify: throwaway script at the scratchpad path (deleted in Step 6)

**Interfaces:**
- Consumes: nothing from earlier tasks — this is the first task.
- Produces: `Customer` model class, exported from `apps/backend/src/modules/customers/models/customer.model.ts`, with fields `id: string`, `userId: string`, `fullName: string`, `createdAt: Date`, `updatedAt: Date`. Tasks 2, 3 and 5 import this model.

The `customers` table is a direct structural mirror of `vendors` (see `apps/backend/src/modules/vendors/models/vendor.model.ts`), minus every vendor-specific column (`shop_name`, `address`, `latitude`, `longitude`, `upi_id`, `bank_details`, `gstin`, `city_id`, `city_source`). A customer has none of those on this table — `full_name` is the only content column, because `users` already carries phone and email.

- [ ] **Step 1: Write the migration**

Create `apps/backend/database/migrations/20260916090000-create-customers.js`:

```js
'use strict';

// Decision 0026 rule 1. Mirrors vendors' shape exactly (see
// 20260630000000-create-vendors.js for the precedent this follows), minus
// every vendor-specific column — a customer has no shop, no GPS, no payout
// details. full_name is the only content column; phone and email already
// live on users.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('customers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      full_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('customers', ['user_id'], {
      name: 'idx_customers_user_id',
      unique: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('customers');
  },
};
```

Note: `created_at`/`updated_at` use `Sequelize.literal('CURRENT_TIMESTAMP')`, never `Sequelize.NOW` — this codebase has hit the `Sequelize.NOW`-is-client-side-only bug repeatedly (recorded in `docs/catalog-implementation-status.md`'s "Real bugs found" section) and the fix is always this literal.

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend
npx sequelize-cli db:migrate
```

Expected: output naming `20260916090000-create-customers.js` as applied, no errors.

- [ ] **Step 3: Verify the table shape directly against Postgres**

Write a throwaway script to the scratchpad, e.g. `verify-customers-table.js`:

```js
// THROWAWAY — delete after this passes.
const { Client } = require('pg');

(async () => {
  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();
  let pass = 0, fail = 0;
  const check = (name, actual, expected) => {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { console.log(`PASS  ${name}`); pass++; }
    else { console.error(`FAIL  ${name} -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); fail++; }
  };

  try {
    const { rows: cols } = await db.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'customers' ORDER BY ordinal_position`);
    check('columns', cols.map(c => c.column_name),
      ['id', 'user_id', 'full_name', 'created_at', 'updated_at']);
    check('user_id NOT NULL', cols.find(c => c.column_name === 'user_id').is_nullable, 'NO');

    const { rows: idx } = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'customers'`);
    check('unique index on user_id exists', idx.some(i => i.indexname === 'idx_customers_user_id'), true);

    // Insert against a REAL users row to confirm the FK resolves.
    const { rows: [u] } = await db.query(`SELECT id FROM users LIMIT 1`);
    if (!u) throw new Error('need at least one users row to test the FK');
    const { rows: [c] } = await db.query(
      `INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Verify Customer', now(), now())
       ON CONFLICT (user_id) DO NOTHING RETURNING id`, [u.id]);
    // If the user already has a customer row, c is empty — that's fine,
    // it still proves the unique constraint works. Clean up only if we inserted.
    if (c) {
      await db.query(`DELETE FROM customers WHERE id = $1`, [c.id]);
      check('insert against real user_id succeeded', true, true);
    } else {
      console.log('SKIP  insert test (user already has a customer row) — unique constraint confirmed by ON CONFLICT firing');
    }
  } finally {
    await db.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

Run it: `node <scratchpad path>/verify-customers-table.js`. Expected: all checks PASS.

- [ ] **Step 4: Write the model**

Create `apps/backend/src/modules/customers/models/customer.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { User } from '../../users/models/user.model';

// Decision 0026 rule 1. Structural mirror of Vendor
// (../../vendors/models/vendor.model.ts) — same 1:1-with-users shape, same
// resolve-by-user-id pattern its service method will follow — minus every
// vendor-specific column. A customer has no shop, no GPS, no payout
// details; phone and email already live on users.
@Table({
  tableName: 'customers',
  timestamps: true,
  underscored: true,
})
export class Customer extends Model<Customer> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => User)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    field: 'user_id',
  })
  declare userId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'full_name',
  })
  declare fullName: string;

  @BelongsTo(() => User)
  declare user: User;
}
```

- [ ] **Step 5: Rebuild and boot-check**

`Customer` is not yet registered anywhere — it has no module yet (Task 6 creates `CustomersModule`), so nothing imports it and the build should simply compile the new file with no errors. There is nothing to smoke-test yet since no module wires it in.

```bash
cd apps/backend
pnpm build
```

Expected: exit 0, no TypeScript errors. Do NOT run `pnpm smoke` yet — `CustomersModule` does not exist until Task 6, so there is nothing new for smoke to boot-check.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm <scratchpad path>/verify-customers-table.js
git add apps/backend/database/migrations/20260916090000-create-customers.js \
        apps/backend/src/modules/customers/models/customer.model.ts
git commit -m "feat(customers): customers table and model

Decision 0026 rule 1. Structural mirror of vendors, minus every
vendor-specific column — full_name is the only content column, since users
already carries phone and email. 1:1 with users via a unique user_id FK,
matching the shape VendorsService.resolveVendorByUserId already assumes for
vendors; CustomersService (Task 6) will mirror that method exactly.

No module registration yet — CustomersModule lands in Task 6 once every
model in this slice exists.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `customer_addresses` table and model

**Files:**
- Create: `apps/backend/database/migrations/20260916090001-create-customer-addresses.js`
- Create: `apps/backend/src/modules/customers/models/customer-address.model.ts`
- Verify: throwaway script (deleted in Step 6)

**Interfaces:**
- Consumes: `Customer` model from Task 1 (for the FK reference and the `@BelongsTo`).
- Produces: `CustomerAddress` model with fields `id`, `customerId`, `label`, `line1`, `line2: string | null`, `cityId`, `pincode`, `latitude: number | null`, `longitude: number | null`, `isDefault: boolean`. Task 6 imports this model. A later slice (order_vendor_group's `shipping_address_id`, Task 4) references this table.

- [ ] **Step 1: Write the migration**

Create `apps/backend/database/migrations/20260916090001-create-customer-addresses.js`:

```js
'use strict';

// Decision 0026 rule 2. 1:N off customers — a customer can have several
// delivery addresses (home, site office, a second project), unlike a
// vendor's single shop location, which is why this is its own table rather
// than columns on customers the way vendors carries address/lat/lng inline.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('customer_addresses', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      label: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      line1: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      line2: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      city_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'city', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      pincode: {
        type: Sequelize.STRING(6),
        allowNull: false,
      },
      // Nullable: geocoding an address is not a prerequisite for saving one
      // (decision 0026's own reasoning — contrast vendors.latitude/longitude,
      // which ARE required, because a vendor's serviceability depends on them
      // from day one; a customer address only needs geocoding if/when
      // delivery routing wants it).
      latitude: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      longitude: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('customer_addresses', ['customer_id'], {
      name: 'idx_customer_addresses_customer_id',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('customer_addresses');
  },
};
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend
npx sequelize-cli db:migrate
```

Expected: `20260916090001-create-customer-addresses.js` applied, no errors.

- [ ] **Step 3: Verify against live Postgres**

Throwaway script, e.g. `verify-customer-addresses-table.js`:

```js
// THROWAWAY — delete after this passes.
const { Client } = require('pg');

(async () => {
  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`PASS  ${name}`); pass++; }
    else { console.error(`FAIL  ${name}`); fail++; }
  };

  const tag = `addr-verify-${Date.now()}`;
  let customerId = null;

  try {
    const { rows: cols } = await db.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'customer_addresses' ORDER BY ordinal_position`);
    const names = cols.map(c => c.column_name);
    check('has customer_id', names.includes('customer_id'));
    check('has city_id', names.includes('city_id'));
    check('latitude IS nullable', cols.find(c => c.column_name === 'latitude').is_nullable === 'YES');
    check('line1 NOT nullable', cols.find(c => c.column_name === 'line1').is_nullable === 'NO');

    // FK correctness: create a scratch customer, then a scratch address
    // against a real city, then confirm cascade-delete removes the address
    // when the customer is deleted.
    const { rows: [u] } = await db.query(`SELECT id FROM users LIMIT 1`);
    const { rows: [city] } = await db.query(`SELECT id FROM city WHERE is_active = true LIMIT 1`);
    if (!u || !city) throw new Error('need a users row and an active city');

    const { rows: [existingCustomer] } = await db.query(
      `SELECT id FROM customers WHERE user_id = $1`, [u.id]);
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { rows: [c] } = await db.query(
        `INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING id`,
        [u.id, tag]);
      customerId = c.id;
    }

    const { rows: [addr] } = await db.query(
      `INSERT INTO customer_addresses
         (id, customer_id, label, line1, city_id, pincode, is_default, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Home', '123 Test St', $2, '110001', true, now(), now())
       RETURNING id`,
      [customerId, city.id]);
    check('insert against real customer + city succeeded', !!addr);

    // Cascade check: delete the customer, confirm the address goes with it.
    // Only run this if WE created the customer (don't cascade-delete a
    // pre-existing one from another test).
    if (!existingCustomer) {
      await db.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      const { rows: remaining } = await db.query(
        `SELECT id FROM customer_addresses WHERE id = $1`, [addr.id]);
      check('ON DELETE CASCADE removed the address with its customer', remaining.length === 0);
    } else {
      await db.query(`DELETE FROM customer_addresses WHERE id = $1`, [addr.id]);
      console.log('SKIP  cascade test (customer pre-existed) — address deleted directly instead');
    }
  } finally {
    await db.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

Run it. Expected: all PASS.

- [ ] **Step 4: Write the model**

Create `apps/backend/src/modules/customers/models/customer-address.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { Customer } from './customer.model';
import { City } from '../../catalog/models/city.model';

// Decision 0026 rule 2. 1:N off Customer. A customer can have several
// delivery addresses; a vendor has exactly one shop, which is why Vendor
// carries address/lat/lng inline and this is its own table instead.
@Table({
  tableName: 'customer_addresses',
  timestamps: true,
  underscored: true,
})
export class CustomerAddress extends Model<CustomerAddress> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Customer)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'customer_id',
  })
  declare customerId: string;

  @Column({
    type: DataType.STRING(64),
    allowNull: false,
  })
  declare label: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare line1: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare line2: string | null;

  @ForeignKey(() => City)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'city_id',
  })
  declare cityId: string;

  @Column({
    type: DataType.STRING(6),
    allowNull: false,
  })
  declare pincode: string;

  // Nullable — geocoding is not required to save an address. Contrast
  // Vendor.latitude/longitude, which ARE required, because vendor
  // serviceability depends on them immediately.
  @Column({
    type: DataType.FLOAT,
    allowNull: true,
  })
  declare latitude: number | null;

  @Column({
    type: DataType.FLOAT,
    allowNull: true,
  })
  declare longitude: number | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_default',
  })
  declare isDefault: boolean;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @BelongsTo(() => City)
  declare city: City;
}
```

- [ ] **Step 5: Rebuild**

```bash
cd apps/backend
pnpm build
```

Expected: exit 0. No smoke check yet — same reasoning as Task 1, no module wires this in until Task 6.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm <scratchpad path>/verify-customer-addresses-table.js
git add apps/backend/database/migrations/20260916090001-create-customer-addresses.js \
        apps/backend/src/modules/customers/models/customer-address.model.ts
git commit -m "feat(customers): customer_addresses table and model

Decision 0026 rule 2. 1:N off customers, unlike vendors' single inline
shop location — a customer legitimately has more than one delivery address
(home, site office, a second project). latitude/longitude are nullable,
unlike Vendor's required pair: geocoding is not a prerequisite for saving
an address, only for delivery routing later.

Verified live: FK correctness against a real customer and city, and
ON DELETE CASCADE removing addresses when their customer is deleted.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `cart` and `cart_item` tables and models

**Files:**
- Create: `apps/backend/database/migrations/20260916090002-create-cart-and-cart-item.js`
- Create: `apps/backend/src/modules/customers/models/cart.model.ts`
- Create: `apps/backend/src/modules/customers/models/cart-item.model.ts`
- Verify: throwaway script (deleted in Step 6)

**Interfaces:**
- Consumes: `Customer` model (Task 1). Also needs `VendorListing`, which already exists at `apps/backend/src/modules/catalog/models/vendor-listing.model.ts` — do not create it, import it.
- Produces: `Cart` model (`id`, `customerId`, `lastActiveAt`) and `CartItem` model (`id`, `cartId`, `vendorListingId`, `quantity: number`). Task 6 imports both.

Cart and cart_item are one migration because they are meaningless apart — a cart with no items table, or an items table with no cart, is not a usable intermediate state, matching how the plan groups them as one task.

- [ ] **Step 1: Write the migration**

Create `apps/backend/database/migrations/20260916090002-create-cart-and-cart-item.js`:

```js
'use strict';

// Decision 0026 rules 3 and 4.
//
// cart is 1:1 with customers (one active cart per customer — customer_id
// is UNIQUE). last_active_at exists so a future expiry sweeper needs no
// backfill migration; nothing reads it yet (0026 rule 3 — column now,
// sweeper later, since nothing holds a reservation for a sweeper to
// protect until checkout exists).
//
// cart_item references vendor_listing_id, NEVER master_product_id — this
// is decision 0025 rule 1, restated as schema: stock, price and
// min_order_qty all live on the listing, not the product, so a cart line
// naming only a product would have nothing to reserve against once
// checkout exists. UNIQUE (cart_id, vendor_listing_id): adding an
// already-present listing increments its quantity rather than duplicating
// the row — that increment logic is a service-layer concern for the
// checkout/cart-endpoints slice, not built here.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        'cart',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          customer_id: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
            references: { model: 'customers', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          last_active_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('cart', ['customer_id'], {
        name: 'idx_cart_customer_id',
        unique: true,
        transaction: t,
      });

      await queryInterface.createTable(
        'cart_item',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          cart_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'cart', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendor_listing', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          // DECIMAL(12,3) matches inventory.quantity_available's precision —
          // a cart line inherits the category's unit (tonnes, boxes, sqft),
          // same as inventory does. See 20260827090003-create-inventory.js.
          quantity: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await queryInterface.addConstraint('cart_item', {
        fields: ['cart_id', 'vendor_listing_id'],
        type: 'unique',
        name: 'cart_item_unique_per_listing',
        transaction: t,
      });

      await queryInterface.addIndex('cart_item', ['cart_id'], {
        name: 'idx_cart_item_cart_id',
        transaction: t,
      });
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('cart_item', { transaction: t });
      await queryInterface.dropTable('cart', { transaction: t });
    });
  },
};
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend
npx sequelize-cli db:migrate
```

Expected: `20260916090002-create-cart-and-cart-item.js` applied, no errors.

- [ ] **Step 3: Verify against live Postgres**

Throwaway script, e.g. `verify-cart-tables.js`:

```js
// THROWAWAY — delete after this passes.
const { Client } = require('pg');

(async () => {
  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`PASS  ${name}`); pass++; }
    else { console.error(`FAIL  ${name}`); fail++; }
  };

  const tag = `cart-verify-${Date.now()}`;
  const created = { customers: [], carts: [], products: [], listings: [] };

  try {
    // Table shape checks.
    const { rows: cartCols } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'cart'`);
    check('cart has customer_id', cartCols.some(c => c.column_name === 'customer_id'));
    check('cart has last_active_at', cartCols.some(c => c.column_name === 'last_active_at'));

    const { rows: itemCols } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'cart_item'`);
    check('cart_item has vendor_listing_id', itemCols.some(c => c.column_name === 'vendor_listing_id'));
    check('cart_item has NO master_product_id', !itemCols.some(c => c.column_name === 'master_product_id'));

    // Build real fixtures: a customer, a vendor listing, then a cart + item.
    const { rows: [u] } = await db.query(`SELECT id FROM users LIMIT 1`);
    const { rows: [cat] } = await db.query(`SELECT id FROM category WHERE is_leaf = true LIMIT 1`);
    const { rows: [vendor] } = await db.query(`SELECT id FROM vendors LIMIT 1`);
    if (!u || !cat) throw new Error('need a users row and a leaf category');

    let vendorId = vendor?.id;
    if (!vendorId) {
      const { rows: [vu] } = await db.query(
        `INSERT INTO users (id, phone, role, is_active, is_approved, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'VENDOR', true, true, now(), now()) RETURNING id`,
        [`+91${Date.now().toString().slice(-10)}`]);
      const { rows: [city] } = await db.query(`SELECT id FROM city WHERE is_active = true LIMIT 1`);
      const { rows: [v] } = await db.query(
        `INSERT INTO vendors (id, user_id, shop_name, address, latitude, longitude, city_id, city_source, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'Test Address', 28.6, 77.2, $3, 'admin', now(), now()) RETURNING id`,
        [vu.id, tag, city?.id ?? null]);
      vendorId = v.id;
      created.customers.push(vu.id); // reuse the same tracking array for cleanup ordering
    }

    const { rows: [p] } = await db.query(
      `INSERT INTO master_product (id, name, slug, category_id, status, sale_unit_type, is_generic, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'live', 'discrete', false, now(), now()) RETURNING id`,
      [tag, tag.toLowerCase(), cat.id]);
    created.products.push(p.id);
    const { rows: [listing] } = await db.query(
      `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, min_order_qty, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 100, 1, 'active', now(), now()) RETURNING id`,
      [vendorId, p.id]);
    created.listings.push(listing.id);

    const { rows: [existingCustomer] } = await db.query(
      `SELECT id FROM customers WHERE user_id = $1`, [u.id]);
    let customerId = existingCustomer?.id;
    if (!customerId) {
      const { rows: [c] } = await db.query(
        `INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING id`,
        [u.id, tag]);
      customerId = c.id;
      created.customers.push(customerId);
    }

    const { rows: [existingCart] } = await db.query(
      `SELECT id FROM cart WHERE customer_id = $1`, [customerId]);
    let cartId = existingCart?.id;
    if (!cartId) {
      const { rows: [cart] } = await db.query(
        `INSERT INTO cart (id, customer_id, last_active_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, now(), now(), now()) RETURNING id`,
        [customerId]);
      cartId = cart.id;
      created.carts.push(cartId);
    }

    const { rows: [item] } = await db.query(
      `INSERT INTO cart_item (id, cart_id, vendor_listing_id, quantity, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 12.500, now(), now()) RETURNING id, quantity`,
      [cartId, listing.id]);
    check('cart_item insert succeeded', !!item);
    check('DECIMAL(12,3) quantity round-trips', Number(item.quantity) === 12.5);

    // UNIQUE (cart_id, vendor_listing_id) — a second insert for the same
    // pair must be rejected at the DB level.
    let uniqueViolation = false;
    try {
      await db.query(
        `INSERT INTO cart_item (id, cart_id, vendor_listing_id, quantity, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 5, now(), now())`,
        [cartId, listing.id]);
    } catch (e) {
      uniqueViolation = e.code === '23505'; // unique_violation
    }
    check('duplicate (cart_id, vendor_listing_id) rejected by UNIQUE constraint', uniqueViolation);

    await db.query(`DELETE FROM cart_item WHERE id = $1`, [item.id]);
  } finally {
    for (const id of created.listings) await db.query(`DELETE FROM vendor_listing WHERE id = $1`, [id]);
    for (const id of created.products) await db.query(`DELETE FROM master_product WHERE id = $1`, [id]);
    for (const id of created.carts) await db.query(`DELETE FROM cart WHERE id = $1`, [id]);
    for (const id of created.customers) {
      await db.query(`DELETE FROM customers WHERE id = $1`, [id]).catch(() => {});
      await db.query(`DELETE FROM vendors WHERE user_id = $1`, [id]).catch(() => {});
      await db.query(`DELETE FROM users WHERE id = $1`, [id]).catch(() => {});
    }
    await db.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

Run it. Expected: all PASS, including the unique-violation check. Note: this script's cleanup is best-effort across two possible fixture shapes (reused vs. newly created customer/vendor) — if a step fails, manually verify no scratch rows remain with `SELECT * FROM master_product WHERE name LIKE 'cart-verify-%'` before re-running.

- [ ] **Step 4: Write the models**

Create `apps/backend/src/modules/customers/models/cart.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Index } from 'sequelize-typescript';
import { Customer } from './customer.model';
import { CartItem } from './cart-item.model';

// Decision 0026 rule 3. One active cart per customer — customer_id is
// UNIQUE. last_active_at exists for a future expiry sweeper; nothing reads
// it yet (no sweeper is built until checkout exists and has something for
// a sweeper to protect — see the ADR's Why section).
@Table({
  tableName: 'cart',
  timestamps: true,
  underscored: true,
})
export class Cart extends Model<Cart> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Customer)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    field: 'customer_id',
  })
  declare customerId: string;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    field: 'last_active_at',
  })
  declare lastActiveAt: Date;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @HasMany(() => CartItem)
  declare items: CartItem[];
}
```

Create `apps/backend/src/modules/customers/models/cart-item.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { Cart } from './cart.model';
import { VendorListing } from '../../catalog/models/vendor-listing.model';

// Decision 0025 rule 1, restated as schema: a cart item references
// vendor_listing_id, NEVER master_product_id. Stock, price and
// min_order_qty all live on the listing, so an item naming only a product
// would have nothing to reserve against once checkout exists (decision
// 0024 rule 2 reserves by incrementing inventory.quantity_reserved, and
// inventory is keyed by vendor_listing_id).
@Table({
  tableName: 'cart_item',
  timestamps: true,
  underscored: true,
})
export class CartItem extends Model<CartItem> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Cart)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'cart_id',
  })
  declare cartId: string;

  @ForeignKey(() => VendorListing)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_listing_id',
  })
  declare vendorListingId: string;

  // DECIMAL(12,3) matches inventory.quantity_available's precision — a
  // cart line inherits the category's unit (tonnes, boxes, sqft).
  @Column({
    type: DataType.DECIMAL(12, 3),
    allowNull: false,
  })
  declare quantity: number;

  @BelongsTo(() => Cart)
  declare cart: Cart;

  @BelongsTo(() => VendorListing)
  declare vendorListing: VendorListing;
}
```

- [ ] **Step 5: Rebuild**

```bash
cd apps/backend
pnpm build
```

Expected: exit 0. Still no smoke check — no module registers these yet.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm <scratchpad path>/verify-cart-tables.js
git add apps/backend/database/migrations/20260916090002-create-cart-and-cart-item.js \
        apps/backend/src/modules/customers/models/cart.model.ts \
        apps/backend/src/modules/customers/models/cart-item.model.ts
git commit -m "feat(customers): cart and cart_item tables and models

Decision 0026 rules 3 and 4. One migration for both tables — a cart with
no items table, or an items table with no cart, is not a usable
intermediate state.

cart is 1:1 with customers (unique customer_id). last_active_at exists so
a future expiry sweeper needs no backfill migration; nothing reads it yet.

cart_item references vendor_listing_id, never master_product_id — decision
0025 rule 1, restated as schema. UNIQUE (cart_id, vendor_listing_id):
re-adding an already-present listing is a service-layer increment, not a
new row — that increment logic is not built here, only the constraint that
makes it necessary.

Verified live: the unique constraint rejects a duplicate (cart_id,
vendor_listing_id) pair, and DECIMAL(12,3) round-trips a fractional
quantity.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `orders` and `order_vendor_group` tables and models

**Files:**
- Create: `apps/backend/database/migrations/20260916090003-create-orders-and-order-vendor-group.js`
- Create: `apps/backend/src/modules/customers/models/order.model.ts`
- Create: `apps/backend/src/modules/customers/models/order-vendor-group.model.ts`
- Verify: throwaway script (deleted in Step 6)

**Interfaces:**
- Consumes: `Customer` (Task 1), `CustomerAddress` (Task 2). Also needs `Vendor`, which already exists at `apps/backend/src/modules/vendors/models/vendor.model.ts` — import it, do not create it.
- Produces: `Order` model (`id`, `customerId`, `status`, `grandTotal`) and `OrderVendorGroup` model (`id`, `orderId`, `vendorId`, `status`, `subtotal`, `shippingAddressId`). Task 5 imports `OrderVendorGroup`; Task 6 imports both.

- [ ] **Step 1: Write the migration**

Create `apps/backend/database/migrations/20260916090003-create-orders-and-order-vendor-group.js`:

```js
'use strict';

// Decision 0026 rules 5 and 6, and decision 0025 rule 2.
//
// orders is the customer-facing whole: one customer, one payment, one
// grand total. No project_id column — 0025's "Associate With Customer
// Projects" is Phase 4 scope, and a nullable column nobody writes yet is
// worse than no column with a comment marking the attachment point (right
// here: a project reference would be a nullable FK on THIS table).
//
// order_vendor_group is the per-vendor unit 0025 rule 2 requires: a cart
// spans vendors by construction (0025's whole argument), so checkout
// produces one order containing N per-vendor groups, each independently
// trackable. shipping_address_id is per-GROUP, not per-order, because
// 0025's delivery-OTP-and-open-box-photo requirement attaches to
// fulfilment, which is per vendor — a future column for that (delivery
// OTP hash, open-box photo URL) lands on THIS table, not built here.
//
// Two ENUM types, in one transaction with both tables since a failure
// partway through would otherwise leave an orphaned ENUM type blocking the
// retry (see 20260827090001-create-vendor-listing.js for the precedent).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE TYPE order_status AS ENUM ('pending_payment', 'confirmed', 'cancelled');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE TYPE order_vendor_group_status AS ENUM ('pending', 'confirmed', 'fulfilled', 'cancelled');`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'orders',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          customer_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'customers', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          status: {
            type: 'order_status',
            allowNull: false,
            defaultValue: 'confirmed',
          },
          grand_total: {
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('orders', ['customer_id'], {
        name: 'idx_orders_customer_id',
        transaction: t,
      });

      await queryInterface.createTable(
        'order_vendor_group',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          order_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'orders', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          vendor_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendors', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          status: {
            type: 'order_vendor_group_status',
            allowNull: false,
            defaultValue: 'pending',
          },
          subtotal: {
            type: Sequelize.DECIMAL(14, 2),
            allowNull: false,
          },
          shipping_address_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'customer_addresses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
        },
        { transaction: t },
      );

      await queryInterface.addIndex('order_vendor_group', ['order_id'], {
        name: 'idx_order_vendor_group_order_id',
        transaction: t,
      });
      await queryInterface.addIndex('order_vendor_group', ['vendor_id'], {
        name: 'idx_order_vendor_group_vendor_id',
        transaction: t,
      });
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('order_vendor_group', { transaction: t });
      await queryInterface.dropTable('orders', { transaction: t });
      await queryInterface.sequelize.query(`DROP TYPE order_vendor_group_status;`, { transaction: t });
      await queryInterface.sequelize.query(`DROP TYPE order_status;`, { transaction: t });
    });
  },
};
```

Note on `orders.status` default: `'confirmed'` is used as the column default only because 0025 rule 4 says a checkout that fails writes **no** order row at all — so by the time any code inserts an `orders` row, checkout has already succeeded. `'pending_payment'` exists in the enum for the payment-provider slice's future use (a provider that requires an async webhook confirmation, per 0024 rule 3), not because anything in this schema-only slice writes it.

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend
npx sequelize-cli db:migrate
```

Expected: `20260916090003-create-orders-and-order-vendor-group.js` applied, no errors.

- [ ] **Step 3: Verify against live Postgres**

Throwaway script, e.g. `verify-orders-tables.js`:

```js
// THROWAWAY — delete after this passes.
const { Client } = require('pg');

(async () => {
  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`PASS  ${name}`); pass++; }
    else { console.error(`FAIL  ${name}`); fail++; }
  };

  const tag = `order-verify-${Date.now()}`;
  const created = { customers: [], orders: [], addresses: [] };

  try {
    const { rows: enumVals } = await db.query(
      `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'order_status'::regtype ORDER BY enumsortorder`);
    check('order_status has 3 values', enumVals.length === 3);
    check('order_status includes confirmed', enumVals.some(e => e.enumlabel === 'confirmed'));

    const { rows: [u] } = await db.query(`SELECT id FROM users LIMIT 1`);
    const { rows: [city] } = await db.query(`SELECT id FROM city WHERE is_active = true LIMIT 1`);
    const { rows: [vendor] } = await db.query(`SELECT id FROM vendors LIMIT 1`);
    if (!u || !city || !vendor) throw new Error('need a users row, an active city, and a vendor');

    const { rows: [existingCustomer] } = await db.query(
      `SELECT id FROM customers WHERE user_id = $1`, [u.id]);
    let customerId = existingCustomer?.id;
    if (!customerId) {
      const { rows: [c] } = await db.query(
        `INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING id`,
        [u.id, tag]);
      customerId = c.id;
      created.customers.push(customerId);
    }

    const { rows: [addr] } = await db.query(
      `INSERT INTO customer_addresses (id, customer_id, label, line1, city_id, pincode, is_default, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Test', '1 Test Rd', $2, '110001', true, now(), now()) RETURNING id`,
      [customerId, city.id]);
    created.addresses.push(addr.id);

    const { rows: [order] } = await db.query(
      `INSERT INTO orders (id, customer_id, status, grand_total, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'confirmed', 1500.00, now(), now()) RETURNING id, status`,
      [customerId]);
    created.orders.push(order.id);
    check('order insert succeeded with default-shaped status', order.status === 'confirmed');

    const { rows: [ovg] } = await db.query(
      `INSERT INTO order_vendor_group (id, order_id, vendor_id, status, subtotal, shipping_address_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'pending', 750.00, $3, now(), now()) RETURNING id`,
      [order.id, vendor.id, addr.id]);
    check('order_vendor_group insert succeeded', !!ovg);

    // shipping_address_id RESTRICT: deleting a referenced address must fail.
    let restrictFired = false;
    try {
      await db.query(`DELETE FROM customer_addresses WHERE id = $1`, [addr.id]);
    } catch (e) {
      restrictFired = e.code === '23503'; // foreign_key_violation
    }
    check('deleting a referenced address is blocked (RESTRICT)', restrictFired);

    // Cascade check: deleting the order removes its vendor groups.
    await db.query(`DELETE FROM orders WHERE id = $1`, [order.id]);
    const { rows: remaining } = await db.query(
      `SELECT id FROM order_vendor_group WHERE id = $1`, [ovg.id]);
    check('ON DELETE CASCADE removed the group with its order', remaining.length === 0);
    created.orders = []; // already deleted
  } finally {
    for (const id of created.orders) await db.query(`DELETE FROM orders WHERE id = $1`, [id]).catch(() => {});
    for (const id of created.addresses) await db.query(`DELETE FROM customer_addresses WHERE id = $1`, [id]).catch(() => {});
    for (const id of created.customers) await db.query(`DELETE FROM customers WHERE id = $1`, [id]).catch(() => {});
    await db.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

Run it. Expected: all PASS, including the RESTRICT check.

- [ ] **Step 4: Write the models**

Create `apps/backend/src/modules/customers/models/order.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Index } from 'sequelize-typescript';
import { Customer } from './customer.model';
import { OrderVendorGroup } from './order-vendor-group.model';

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

// Decision 0026 rule 5. The customer-facing whole: one customer, one
// payment, one grand total. No project_id column — decision 0025's
// "Associate With Customer Projects" is Phase 4 scope. When that lands, a
// nullable project_id FK attaches HERE, on this table.
@Table({
  tableName: 'orders',
  timestamps: true,
  underscored: true,
})
export class Order extends Model<Order> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Customer)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'customer_id',
  })
  declare customerId: string;

  @Column({
    type: DataType.ENUM(...Object.values(OrderStatus)),
    allowNull: false,
    defaultValue: OrderStatus.CONFIRMED,
  })
  declare status: OrderStatus;

  @Column({
    type: DataType.DECIMAL(14, 2),
    allowNull: false,
    field: 'grand_total',
  })
  declare grandTotal: number;

  @BelongsTo(() => Customer)
  declare customer: Customer;

  @HasMany(() => OrderVendorGroup)
  declare vendorGroups: OrderVendorGroup[];
}
```

Create `apps/backend/src/modules/customers/models/order-vendor-group.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Index } from 'sequelize-typescript';
import { Order } from './order.model';
import { Vendor } from '../../vendors/models/vendor.model';
import { CustomerAddress } from './customer-address.model';
import { OrderItem } from './order-item.model';

export enum OrderVendorGroupStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

// Decision 0025 rule 2, decision 0026 rule 6. The per-vendor unit a
// multi-vendor cart becomes at checkout — one order, N groups, each
// independently trackable. This is where the client's delivery-OTP and
// open-box-photo requirement attaches once fulfilment is built: a future
// migration adds delivery_otp_hash / open_box_photo_url HERE, on this
// table. Not built in this slice — schema only.
@Table({
  tableName: 'order_vendor_group',
  timestamps: true,
  underscored: true,
})
export class OrderVendorGroup extends Model<OrderVendorGroup> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => Order)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'order_id',
  })
  declare orderId: string;

  @Index
  @ForeignKey(() => Vendor)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_id',
  })
  declare vendorId: string;

  @Column({
    type: DataType.ENUM(...Object.values(OrderVendorGroupStatus)),
    allowNull: false,
    defaultValue: OrderVendorGroupStatus.PENDING,
  })
  declare status: OrderVendorGroupStatus;

  @Column({
    type: DataType.DECIMAL(14, 2),
    allowNull: false,
  })
  declare subtotal: number;

  @ForeignKey(() => CustomerAddress)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'shipping_address_id',
  })
  declare shippingAddressId: string;

  @BelongsTo(() => Order)
  declare order: Order;

  @BelongsTo(() => Vendor)
  declare vendor: Vendor;

  @BelongsTo(() => CustomerAddress)
  declare shippingAddress: CustomerAddress;

  @HasMany(() => OrderItem)
  declare items: OrderItem[];
}
```

Note: `order-vendor-group.model.ts` imports `OrderItem` from `./order-item.model`, which Task 5 creates. This creates a forward reference — write Task 4's files first as specified, then Task 5 adds the file that makes this import resolve. Do not attempt to build/typecheck Task 4 in isolation past this point; Step 5 below accounts for this.

- [ ] **Step 5: Rebuild — EXPECT A FAILURE, and that is correct**

```bash
cd apps/backend
pnpm build
```

Expected: **FAILS** with `Cannot find module './order-item.model'` (or equivalent). This is expected and correct — `order-vendor-group.model.ts` imports a file Task 5 has not created yet. Do not attempt to fix it in this task. Confirm the error is exactly this missing-module error and nothing else (no syntax errors, no other missing imports) before proceeding to Task 5.

- [ ] **Step 6: Delete the scratch script and commit**

The build is red at this point, deliberately. Commit anyway — Task 5 is the very next task and resolves it immediately; splitting `order.model.ts`/`order-vendor-group.model.ts` from `order-item.model.ts` into separate commits matches the migration split and keeps each commit's diff reviewable on its own, at the cost of one commit in this branch's history having a broken build until the next commit lands. Note this explicitly in the commit message.

```bash
rm <scratchpad path>/verify-orders-tables.js
git add apps/backend/database/migrations/20260916090003-create-orders-and-order-vendor-group.js \
        apps/backend/src/modules/customers/models/order.model.ts \
        apps/backend/src/modules/customers/models/order-vendor-group.model.ts
git commit -m "feat(customers): orders and order_vendor_group tables and models

Decision 0026 rules 5 and 6, decision 0025 rule 2. orders is the
customer-facing whole (one customer, one payment, one grand total); no
project_id column, since 0025's project association is Phase 4 scope — a
comment marks where it attaches rather than shipping an unused nullable
column. order_vendor_group is the per-vendor unit 0025 rule 2 requires,
with a shipping_address_id per GROUP (not per order) because delivery
fulfils per vendor. Delivery OTP and open-box photo columns attach here
later, per 0025's deferred-with-named-slot table — not built in this
slice.

order-vendor-group.model.ts imports OrderItem from Task 5's file, which
does not exist yet — the build is RED after this commit and turns green
with the next one. Split this way so migrations/commits mirror the schema
grouping (orders+groups is one unit, items is the next); the alternative
was one oversized commit for all of orders/groups/items together.

Verified live before this commit: enum shape, FK correctness, the
shipping_address_id RESTRICT (a referenced address cannot be deleted), and
ON DELETE CASCADE removing vendor groups when their order is deleted.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `order_items` table and model

**Files:**
- Create: `apps/backend/database/migrations/20260916090004-create-order-items.js`
- Create: `apps/backend/src/modules/customers/models/order-item.model.ts`
- Verify: throwaway script (deleted in Step 6)

**Interfaces:**
- Consumes: `OrderVendorGroup` (Task 4), `VendorListing` and `MasterProduct` (both already exist in `catalog/models/`).
- Produces: `OrderItem` model (`id`, `orderVendorGroupId`, `vendorListingId`, `masterProductId`, `quantity`, `unitPriceSnapshot`, `productNameSnapshot`). This resolves the forward reference `order-vendor-group.model.ts` left dangling in Task 4. No later task imports `OrderItem`.

- [ ] **Step 1: Write the migration**

Create `apps/backend/database/migrations/20260916090004-create-order-items.js`:

```js
'use strict';

// Decision 0025 rules 6 and 7, decision 0026 rule 7.
//
// The frozen line. unit_price_snapshot and product_name_snapshot are
// captured at order creation and NEVER re-read from vendor_listing /
// master_product afterwards (0025 rule 6) — "the cart is live, the order
// is frozen." A vendor editing their price later must not retroactively
// change what a past order was worth.
//
// BOTH vendor_listing_id and master_product_id are stored (0025 rule 7):
// order_items must carry enough to trace a delivered item back to the
// vendor_product_map entry that produced its listing, because
// catalog-integrity-residual-risks.md risk 4 (the customer report path,
// still blocked on this exact table existing) needs to invalidate that
// mapping specifically, not just flag the order. Storing only one of the
// two ids would make that reconstruction a join through vendor_listing
// (which could itself change status or be deleted) instead of a direct
// reference captured at the moment of truth.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('order_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_vendor_group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'order_vendor_group', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      vendor_listing_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendor_listing', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      master_product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'master_product', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 3),
        allowNull: false,
      },
      unit_price_snapshot: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      product_name_snapshot: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('order_items', ['order_vendor_group_id'], {
      name: 'idx_order_items_group_id',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('order_items');
  },
};
```

Note: `vendor_listing_id` and `master_product_id` are `onDelete: 'RESTRICT'`, not `CASCADE` — a placed order's line item must never silently disappear because a listing or product was later deleted. This mirrors `vendor_listing`'s own FK to `master_product` (`RESTRICT`, per `20260827090001-create-vendor-listing.js`) rather than `vendor_listing`'s FK to `vendors` (`CASCADE`) — items follow the "never lose a historical record" precedent, not the "delete cascades from the owning parent" one.

- [ ] **Step 2: Run the migration**

```bash
cd apps/backend
npx sequelize-cli db:migrate
```

Expected: `20260916090004-create-order-items.js` applied, no errors.

- [ ] **Step 3: Verify against live Postgres**

Throwaway script, e.g. `verify-order-items-table.js`:

```js
// THROWAWAY — delete after this passes.
const { Client } = require('pg');

(async () => {
  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();
  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`PASS  ${name}`); pass++; }
    else { console.error(`FAIL  ${name}`); fail++; }
  };

  const tag = `item-verify-${Date.now()}`;
  const created = { customers: [], orders: [], addresses: [], products: [], listings: [] };

  try {
    const { rows: cols } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'order_items'`);
    const names = cols.map(c => c.column_name);
    check('has vendor_listing_id', names.includes('vendor_listing_id'));
    check('has master_product_id (traceability, 0025 rule 7)', names.includes('master_product_id'));
    check('has unit_price_snapshot', names.includes('unit_price_snapshot'));
    check('has product_name_snapshot', names.includes('product_name_snapshot'));

    const { rows: [u] } = await db.query(`SELECT id FROM users LIMIT 1`);
    const { rows: [city] } = await db.query(`SELECT id FROM city WHERE is_active = true LIMIT 1`);
    const { rows: [vendor] } = await db.query(`SELECT id FROM vendors LIMIT 1`);
    const { rows: [cat] } = await db.query(`SELECT id FROM category WHERE is_leaf = true LIMIT 1`);
    if (!u || !city || !vendor || !cat) throw new Error('need users, city, vendor, category rows');

    const { rows: [existingCustomer] } = await db.query(
      `SELECT id FROM customers WHERE user_id = $1`, [u.id]);
    let customerId = existingCustomer?.id;
    if (!customerId) {
      const { rows: [c] } = await db.query(
        `INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING id`, [u.id, tag]);
      customerId = c.id;
      created.customers.push(customerId);
    }
    const { rows: [addr] } = await db.query(
      `INSERT INTO customer_addresses (id, customer_id, label, line1, city_id, pincode, is_default, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'T', '1 Rd', $2, '110001', true, now(), now()) RETURNING id`,
      [customerId, city.id]);
    created.addresses.push(addr.id);
    const { rows: [order] } = await db.query(
      `INSERT INTO orders (id, customer_id, status, grand_total, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'confirmed', 500, now(), now()) RETURNING id`, [customerId]);
    created.orders.push(order.id);
    const { rows: [ovg] } = await db.query(
      `INSERT INTO order_vendor_group (id, order_id, vendor_id, status, subtotal, shipping_address_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'pending', 500, $3, now(), now()) RETURNING id`,
      [order.id, vendor.id, addr.id]);
    const { rows: [p] } = await db.query(
      `INSERT INTO master_product (id, name, slug, category_id, status, sale_unit_type, is_generic, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'live', 'discrete', false, now(), now()) RETURNING id`,
      [tag, tag.toLowerCase(), cat.id]);
    created.products.push(p.id);
    const { rows: [listing] } = await db.query(
      `INSERT INTO vendor_listing (id, vendor_id, master_product_id, price, min_order_qty, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 100, 1, 'active', now(), now()) RETURNING id`,
      [vendor.id, p.id]);
    created.listings.push(listing.id);

    const { rows: [item] } = await db.query(
      `INSERT INTO order_items
         (id, order_vendor_group_id, vendor_listing_id, master_product_id, quantity, unit_price_snapshot, product_name_snapshot, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 5, 100.00, $4, now(), now())
       RETURNING id, unit_price_snapshot, product_name_snapshot`,
      [ovg.id, listing.id, p.id, tag]);
    check('order_item insert succeeded', !!item);
    check('price snapshot stored', Number(item.unit_price_snapshot) === 100);
    check('name snapshot stored', item.product_name_snapshot === tag);

    // RESTRICT check: deleting the referenced listing must fail while the
    // order_item exists — the historical record must not silently break.
    let restrictFired = false;
    try {
      await db.query(`DELETE FROM vendor_listing WHERE id = $1`, [listing.id]);
    } catch (e) {
      restrictFired = e.code === '23503';
    }
    check('deleting a referenced vendor_listing is blocked (RESTRICT)', restrictFired);

    // Now change the LIVE listing price and confirm the snapshot did NOT move.
    await db.query(`UPDATE vendor_listing SET price = 999 WHERE id = $1`, [listing.id]);
    const { rows: [reread] } = await db.query(
      `SELECT unit_price_snapshot FROM order_items WHERE id = $1`, [item.id]);
    check('snapshot unaffected by a later live-price change (0025 rule 6)', Number(reread.unit_price_snapshot) === 100);

    await db.query(`DELETE FROM order_items WHERE id = $1`, [item.id]);
  } finally {
    for (const id of created.listings) await db.query(`DELETE FROM vendor_listing WHERE id = $1`, [id]).catch(() => {});
    for (const id of created.products) await db.query(`DELETE FROM master_product WHERE id = $1`, [id]).catch(() => {});
    for (const id of created.orders) await db.query(`DELETE FROM orders WHERE id = $1`, [id]).catch(() => {});
    for (const id of created.addresses) await db.query(`DELETE FROM customer_addresses WHERE id = $1`, [id]).catch(() => {});
    for (const id of created.customers) await db.query(`DELETE FROM customers WHERE id = $1`, [id]).catch(() => {});
    await db.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

Run it. Expected: all PASS, including the price-snapshot-unaffected check — this is the single most important assertion in this task, since it directly verifies 0025 rule 6.

- [ ] **Step 4: Write the model**

Create `apps/backend/src/modules/customers/models/order-item.model.ts`:

```ts
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index } from 'sequelize-typescript';
import { OrderVendorGroup } from './order-vendor-group.model';
import { VendorListing } from '../../catalog/models/vendor-listing.model';
import { MasterProduct } from '../../catalog/models/master-product.model';

// Decision 0025 rules 6 and 7, decision 0026 rule 7. The frozen line — an
// order shows what was agreed, never what vendor_listing says now.
//
// unitPriceSnapshot and productNameSnapshot are captured once, at order
// creation, and this model has no logic that re-reads VendorListing or
// MasterProduct to refresh them (there is no such logic anywhere in this
// slice — no checkout exists yet to even create an order_item). Both
// vendorListingId and masterProductId are stored so a later customer
// report can invalidate the vendor_product_map entry that produced this
// specific listing, per catalog-integrity-residual-risks.md risk 4.
@Table({
  tableName: 'order_items',
  timestamps: true,
  underscored: true,
})
export class OrderItem extends Model<OrderItem> {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  declare id: string;

  @Index
  @ForeignKey(() => OrderVendorGroup)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'order_vendor_group_id',
  })
  declare orderVendorGroupId: string;

  @ForeignKey(() => VendorListing)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'vendor_listing_id',
  })
  declare vendorListingId: string;

  @ForeignKey(() => MasterProduct)
  @Column({
    type: DataType.UUID,
    allowNull: false,
    field: 'master_product_id',
  })
  declare masterProductId: string;

  @Column({
    type: DataType.DECIMAL(12, 3),
    allowNull: false,
  })
  declare quantity: number;

  @Column({
    type: DataType.DECIMAL(12, 2),
    allowNull: false,
    field: 'unit_price_snapshot',
  })
  declare unitPriceSnapshot: number;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    field: 'product_name_snapshot',
  })
  declare productNameSnapshot: string;

  @BelongsTo(() => OrderVendorGroup)
  declare orderVendorGroup: OrderVendorGroup;

  @BelongsTo(() => VendorListing)
  declare vendorListing: VendorListing;

  @BelongsTo(() => MasterProduct)
  declare masterProduct: MasterProduct;
}
```

- [ ] **Step 5: Rebuild — this now resolves Task 4's forward reference**

```bash
cd apps/backend
pnpm build
```

Expected: exit 0, no errors. This is the build that was red at the end of Task 4; it must be green now. If it is not, the error will point at whatever is still missing — do not proceed to Task 6 until this is clean.

- [ ] **Step 6: Delete the scratch script and commit**

```bash
rm <scratchpad path>/verify-order-items-table.js
git add apps/backend/database/migrations/20260916090004-create-order-items.js \
        apps/backend/src/modules/customers/models/order-item.model.ts
git commit -m "feat(customers): order_items table and model

Decision 0025 rules 6 and 7, decision 0026 rule 7. The frozen line —
unit_price_snapshot and product_name_snapshot are captured at order
creation and never re-read from vendor_listing/master_product afterward.
Both vendor_listing_id AND master_product_id are stored, not just one:
catalog-integrity-residual-risks.md risk 4 (the customer report path)
needs to invalidate the specific vendor_product_map entry that produced a
delivered item's listing, and reconstructing that from only one id would
mean a join through a row that could itself change or be deleted later.

vendor_listing_id and master_product_id are ON DELETE RESTRICT, not
CASCADE — a placed order's line item must never silently vanish because a
listing or product is later deleted. order_vendor_group_id IS CASCADE,
matching the parent-owns-child relationship the other two don't have.

This resolves the forward reference order-vendor-group.model.ts (previous
commit) left dangling — the build is green again as of this commit.

Verified live: the traceability columns are both present and populated,
RESTRICT blocks deleting a referenced listing, and — the assertion that
matters most here — changing a listing's LIVE price after the order_item
exists does not move the stored snapshot.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `CustomersModule`, `resolveCustomerByUserId`, and the boot-safety check

**Files:**
- Create: `apps/backend/src/modules/customers/customers.service.ts`
- Create: `apps/backend/src/modules/customers/customers.module.ts`
- Modify: `apps/backend/src/app.module.ts` (register `CustomersModule`)
- Verify: throwaway script (deleted in Step 6)

**Interfaces:**
- Consumes: all seven models from Tasks 1–5 (`Customer`, `CustomerAddress`, `Cart`, `CartItem`, `Order`, `OrderVendorGroup`, `OrderItem`).
- Produces: `CustomersService.resolveCustomerByUserId(userId: string): Promise<Customer>` — throws `NotFoundException` on a miss, exactly matching `VendorsService.resolveVendorByUserId`'s contract. This is the method 0024 rule 1 and 0026 rule 1 both specify; no later task in this plan consumes it (no controller exists yet), but it is the deliverable a future cart/order-endpoints slice will import.

This is the task where the 0022 boot-breaking bug class becomes reachable, because it is the first time any of these seven models are registered into a running NestJS module tree. **`pnpm smoke` is not optional in this task.**

- [ ] **Step 1: Write the service**

Create `apps/backend/src/modules/customers/customers.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Customer } from './models/customer.model';

// Decision 0024 rule 1, decision 0026 rule 1. Mirrors
// VendorsService.resolveVendorByUserId exactly — same signature, same
// NotFoundException-on-miss contract, same reasoning: ownership is
// resolved in the SERVICE from the authenticated user, never taken from a
// path or body parameter. A future controller calling this with
// req.user.sub gets 404 on "no profile for this user", which is
// indistinguishable from "not a customer" and "customer but no profile
// yet" — exactly as vendor resolution already behaves, and for the same
// reason: this is a resolve-my-own-profile lookup, not an
// existence-check on someone else's id, so there is nothing here that
// needs the 404-vs-403 distinction VendorListingsController documents for
// a DIFFERENT scenario (looking up another party's resource by id).
@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer)
    private readonly customerModel: typeof Customer,
  ) {}

  async resolveCustomerByUserId(userId: string): Promise<Customer> {
    const customer = await this.customerModel.findOne({ where: { userId } });
    if (!customer) {
      throw new NotFoundException('no customer profile found for this user');
    }
    return customer;
  }
}
```

- [ ] **Step 2: Write the module**

Create `apps/backend/src/modules/customers/customers.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Customer } from './models/customer.model';
import { CustomerAddress } from './models/customer-address.model';
import { Cart } from './models/cart.model';
import { CartItem } from './models/cart-item.model';
import { Order } from './models/order.model';
import { OrderVendorGroup } from './models/order-vendor-group.model';
import { OrderItem } from './models/order-item.model';
import { CustomersService } from './customers.service';

// No controller yet — this slice is schema plus one resolver method only
// (decision 0026). A future cart/order-endpoints slice adds controllers
// here and will need VendorListing/MasterProduct/Vendor already registered
// elsewhere (CatalogModule, VendorsModule) for its @BelongsTo associations
// to resolve — matching how VendorsModule already imports CatalogModule
// for the same reason (see vendors.module.ts's own comment on this).
@Module({
  imports: [
    SequelizeModule.forFeature([
      Customer,
      CustomerAddress,
      Cart,
      CartItem,
      Order,
      OrderVendorGroup,
      OrderItem,
    ]),
  ],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
```

- [ ] **Step 3: Register the module in `AppModule`**

Modify `apps/backend/src/app.module.ts`. Add the import:

```ts
import { CustomersModule } from './modules/customers/customers.module';
```

Add `CustomersModule` to the `imports` array, alongside the other feature modules (after `VendorsModule` is a reasonable place, matching the file's existing order of core-then-feature modules):

```ts
    VendorsModule,
    CustomersModule,
    AdminModule,
```

- [ ] **Step 4: Rebuild**

```bash
cd apps/backend
pnpm build
```

Expected: exit 0. This is the first build where all seven models are live in a module tree — if any `@BelongsTo`/`@ForeignKey` pair references a model that was never imported, this is typically still a clean TypeScript compile (Sequelize associations are resolved at runtime, not compile time) — which is exactly why Step 5 cannot be skipped.

- [ ] **Step 5: `pnpm smoke` — THE step this task exists to force**

```bash
cd apps/backend
pnpm smoke
```

Expected: `SMOKE PASSED`, all 23 pre-existing routes still mapped (this plan adds none). If this fails with an association error (e.g. `"X has not been defined"`), check `apps/backend/src/core/database/database.module.ts`'s eager `models: [...]` list — this plan's models were checked against it during planning and found NOT to need any additions (every cross-module FK target — `User`, `City`, `Vendor`, `VendorListing`, `MasterProduct` — is already either in that eager list or registered by a module that loads before `CustomersModule`'s associations are needed), but that determination was made by reading the file, not by running smoke, so this step is where it gets actually proven. If smoke fails here, the fix is adding the missing model(s) to that eager list, following the exact pattern of the `City` entry's own comment.

- [ ] **Step 6: Verify `resolveCustomerByUserId` against a live boot**

Throwaway script, e.g. `verify-resolve-customer.js`. This is the one verification in this plan that must run through a booted Nest application context, not raw SQL, because it is testing the service method's behavior (including the `NotFoundException`), not just the schema.

```js
// THROWAWAY — delete after this passes.
process.env.WORKER_MODE = 'api';
const { NestFactory } = require('@nestjs/core');
const { Client } = require('pg');

(async () => {
  const { AppModule } = require('../apps/backend/dist/app.module');
  const { CustomersService } = require('../apps/backend/dist/modules/customers/customers.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const svc = app.get(CustomersService);

  const db = new Client({
    host: 'localhost', port: 5432, database: 'golden_abode',
    user: process.env.DB_USER, password: process.env.DB_PASS,
  });
  await db.connect();

  let pass = 0, fail = 0;
  const check = (name, cond) => {
    if (cond) { console.log(`PASS  ${name}`); pass++; }
    else { console.error(`FAIL  ${name}`); fail++; }
  };

  const tag = `resolve-verify-${Date.now()}`;
  let userId = null, customerId = null;

  try {
    // A user with no customer row -> NotFoundException.
    const { rows: [randomUser] } = await db.query(
      `SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM customers) LIMIT 1`);
    if (randomUser) {
      let threw = false;
      try {
        await svc.resolveCustomerByUserId(randomUser.id);
      } catch (e) {
        threw = e.constructor.name === 'NotFoundException' || e.status === 404;
      }
      check('resolveCustomerByUserId throws NotFoundException for a user with no profile', threw);
    } else {
      console.log('SKIP  no-profile case (every user already has a customer row)');
    }

    // Create a real customer, confirm resolution succeeds and returns the right row.
    const { rows: [u] } = await db.query(
      `INSERT INTO users (id, phone, role, is_active, is_approved, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'CUSTOMER', true, false, now(), now()) RETURNING id`,
      [`+91${Date.now().toString().slice(-10)}`]);
    userId = u.id;
    const { rows: [c] } = await db.query(
      `INSERT INTO customers (id, user_id, full_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, now(), now()) RETURNING id`,
      [userId, tag]);
    customerId = c.id;

    const resolved = await svc.resolveCustomerByUserId(userId);
    check('resolves the correct customer row', resolved.id === customerId);
    check('fullName matches what was inserted', resolved.fullName === tag);
  } finally {
    if (customerId) await db.query(`DELETE FROM customers WHERE id = $1`, [customerId]).catch(() => {});
    if (userId) await db.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => {});
    await db.end();
    await app.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
```

Run it: `node <scratchpad path>/verify-resolve-customer.js` from `apps/backend` (so `.env` loads via Nest's `ConfigModule`, matching how every prior slice's app-context scripts in this repo were run). Expected: all PASS.

- [ ] **Step 7: Run the frozen suite**

```bash
cd apps/backend
pnpm test
```

Expected: `Test Suites: 4 passed, 4 total`, `Tests: 25 passed, 25 total` — unchanged from before this plan. No new `.spec.ts` file exists anywhere in this plan's file list.

- [ ] **Step 8: Delete the scratch script and commit**

```bash
rm <scratchpad path>/verify-resolve-customer.js
git add apps/backend/src/modules/customers/customers.service.ts \
        apps/backend/src/modules/customers/customers.module.ts \
        apps/backend/src/app.module.ts
git commit -m "feat(customers): CustomersModule, resolveCustomerByUserId, and app registration

Decision 0024 rule 1, decision 0026 rule 1. CustomersService.resolveCustomerByUserId
mirrors VendorsService.resolveVendorByUserId exactly — same signature, same
NotFoundException-on-miss contract. No controller yet; this slice is
schema plus one resolver method, per 0026's explicit scope.

This is the first commit in this plan where all seven models (Tasks 1-5)
are registered into a running module tree, which is exactly the failure
class 0022 already hit once — a model's association target missing from
core/database/database.module.ts's eager models list breaks boot silently
past a green build and green tests. Checked during planning: every
cross-module FK target (User, City, Vendor, VendorListing, MasterProduct)
is already in that eager list or registered by an already-loaded module,
so no addition was needed — but pnpm smoke is what actually proves it,
not the reading that predicted it.

Verified this session: build exit 0, pnpm smoke PASSED with all 23
pre-existing routes still mapped (this plan adds none), resolveCustomerByUserId
tested through a live app context (NotFoundException on a user with no
profile, correct resolution on a real one), and the frozen 25-test suite
unaffected (25/25, 4 suites, no new spec files).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** — every rule in 0026 maps to a task:

| 0026 rule | Task |
|---|---|
| 1 — `customers` mirrors `Vendor`, `resolveCustomerByUserId` | 1 (table+model), 6 (service) |
| 2 — `customer_addresses` 1:N | 2 |
| 3 — `cart` 1:1, `last_active_at` no sweeper | 3 |
| 4 — `cart_item` → `vendor_listing_id`, unique pair | 3 |
| 5 — `orders`, no `project_id` | 4 |
| 6 — `order_vendor_group`, per-vendor, ship-to | 4 |
| 7 — `order_items`, dual traceability ids, price/name frozen | 5 |
| 8 — no endpoints, no reservation write | Enforced throughout; Task 6 stops at the service method |

0025 rules 1, 6, 7 (which 0026 restates as schema) are each cited in the task whose columns implement them (Task 3 for rule 1, Task 5 for rules 6/7) and directly asserted by a verification script (Task 5 Step 3's "snapshot unaffected by a later live-price change" is the load-bearing check for rule 6).

**Placeholder scan:** no TBD/TODO. Every step carries complete code or a complete command with a stated expected result, including the two steps (Task 4 Step 5, Task 6 Step 5) where the expected result is a specific *failure* or a specific *thing to check on failure* — neither is a placeholder, both are exact.

**Type consistency:** `Customer.userId` (Task 1) is what `CustomersService.resolveCustomerByUserId` (Task 6) queries by by `where: { userId }` — same field name throughout. `CartItem.vendorListingId` / `OrderItem.vendorListingId` both reference the same `VendorListing` model imported from `catalog/models/vendor-listing.model.ts`, never redefined. `OrderVendorGroup.shippingAddressId` (Task 4) references `CustomerAddress` (Task 2) by the same FK shape `Vendor`→`VendorAccountDetails` already establishes. `Order.status`/`OrderVendorGroup.status` use TypeScript enums (`OrderStatus`, `OrderVendorGroupStatus`) whose values are asserted against the Postgres ENUM types created in the same task's migration — checked to match exactly (`pending_payment`/`confirmed`/`cancelled` and `pending`/`confirmed`/`fulfilled`/`cancelled` respectively).

**One deliberate cross-task inconsistency, flagged rather than hidden:** Task 4 ends with a known-red build (a forward reference to Task 5's file) and says so explicitly in both the task text and the commit message, rather than silently producing a broken intermediate commit. This is called out here so a reviewer treats it as intended, not as a plan defect.
