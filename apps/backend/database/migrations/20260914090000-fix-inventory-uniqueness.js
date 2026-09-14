'use strict';

// Two index fixes on `inventory`, both found by reading the table before
// writing the first line of code that uses it. The table has never been
// written to (no application code referenced it until workstream 4), so
// neither defect has caused damage yet — which is exactly why they are
// cheap to fix now and expensive to fix later.
//
// ---------------------------------------------------------------------
// 1. The uniqueness bug — `inventory_unique_per_warehouse`
// ---------------------------------------------------------------------
// 20260827090003-create-inventory.js declares:
//
//   UNIQUE (vendor_listing_id, warehouse_id)
//
// In Postgres, NULLs are distinct for uniqueness purposes: two rows with
// the same vendor_listing_id and warehouse_id IS NULL do NOT collide.
// Since no warehouse is ever created (the warehouse table exists but
// nothing writes it), EVERY inventory row is a NULL-warehouse row, so in
// practice this constraint dedupes nothing at all. A second "set my stock"
// call would insert a duplicate rather than update, and the two rows would
// disagree about the same listing's stock with no error raised.
//
// The fix is a partial unique index covering precisely the NULL case. The
// original constraint is deliberately KEPT: it still does its job for the
// day warehouses exist, and dropping it would foreclose multi-warehouse
// inventory, which decision 0014 leaves open.
//
// This mirrors the `vendor_listing_unique` precedent in
// 20260827090001-create-vendor-listing.js, which solves the same
// NULL-distinctness problem with COALESCE. A partial index is used here
// instead of COALESCE because warehouse_id is a UUID foreign key with no
// safe sentinel value to coalesce to, whereas stated_grade is text where
// '' works.
//
// ---------------------------------------------------------------------
// 2. The missing index — listing lookups below the partial predicate
// ---------------------------------------------------------------------
// The same migration creates:
//
//   CREATE INDEX idx_inventory_listing ON inventory (vendor_listing_id)
//     WHERE quantity_available > 0;
//
// That predicate makes it useless for the primary read this workstream
// introduces. `GET /vendor/listings` must show a vendor EVERY listing they
// have, most importantly the ones that are out of stock — those are the
// rows they are logging in to fix. A partial index on `> 0` cannot serve a
// query that needs the zero rows, so that lookup would sequential-scan
// inventory forever.
//
// Adding the unqualified index rather than replacing the partial one: the
// partial index is genuinely narrower and cheaper for the "what is
// purchasable right now" query that the search/ordering path will want, so
// both earn their keep.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // Guard against pre-existing duplicates before the unique index is
      // built, which would otherwise fail the migration with a bare
      // "could not create unique index" and no indication of which rows.
      //
      // Expected to be a no-op: nothing has ever written this table. It
      // exists so that if this migration is ever run against a database
      // where something DID write duplicates, the failure names the
      // listing instead of leaving an operator to work it out from the
      // index name.
      const [duplicates] = await queryInterface.sequelize.query(
        `SELECT vendor_listing_id, COUNT(*) AS n
           FROM inventory
          WHERE warehouse_id IS NULL
          GROUP BY vendor_listing_id
         HAVING COUNT(*) > 1;`,
        { transaction: t },
      );

      if (duplicates.length > 0) {
        const detail = duplicates
          .map((row) => `${row.vendor_listing_id} (${row.n} rows)`)
          .join(', ');
        throw new Error(
          `inventory has duplicate NULL-warehouse rows and cannot be made unique: ${detail}. ` +
            `Collapse each set to one row (keeping the intended quantity) and re-run this migration.`,
        );
      }

      await q(`
        CREATE UNIQUE INDEX idx_inventory_listing_no_warehouse
          ON inventory (vendor_listing_id)
          WHERE warehouse_id IS NULL;
      `);

      await q(`
        CREATE INDEX idx_inventory_listing_all
          ON inventory (vendor_listing_id);
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await q(`DROP INDEX IF EXISTS idx_inventory_listing_all;`);
      await q(`DROP INDEX IF EXISTS idx_inventory_listing_no_warehouse;`);
      // inventory_unique_per_warehouse is untouched by up(), so there is
      // nothing to restore here.
    });
  },
};
