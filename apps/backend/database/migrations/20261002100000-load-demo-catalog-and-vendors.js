'use strict';

const fs = require('fs');
const path = require('path');

// Loads the demo dataset: reference data, the product catalog (Lavish Ceramics, Sparsh Pearl and
// the sample products), vendor onboarding (users, vendors, account details, categories) and
// vendor inventory (listings + stock). Decision 0031.
//
// It is OFF unless the environment says otherwise, because a migration runs in every environment
// that ever migrates (CI, every developer's database, and one day the real production database):
//
//   LOAD_DEMO_DATA=true        set on the Railway demo backend service BEFORE the deploy that
//                              carries this migration
//
// Without the flag the migration is a recorded no-op. That is the catch: sequelize-cli remembers
// it as done, so setting the flag afterwards does nothing. To load later, delete this
// migration's row from "SequelizeMeta" and migrate again.
//
// It also refuses to touch a database that already holds catalog or vendor data. The reference
// rows (categories, attributes, cities, brands...) normally come from seeders that generate random
// UUIDs, so the fixed UUIDs here would collide with them. In that case it logs a warning and does
// nothing; it never fails the deploy.
//
// Data lives in ../demo-data/demo-data.json, one row per line, exported from the local database.
// Everything is inserted through json_populate_recordset, so enums, uuids, jsonb and timestamps
// keep the exact types the tables define. Sparsh Pearl prices and stock are INVENTED demo values
// and the two vendor bank account numbers are fakes (000000000001, 000000000002).
//
// Insert order respects the foreign keys and the database triggers:
//   * products are inserted as 'draft' and switched to their real status AFTER their attribute
//     values exist, because trg_mp_require_variant_attrs_on_publish rejects publishing a product
//     that has none;
//   * categories are ordered parent-first for trg_category_leaf_transition.

const DATA_FILE = path.join(__dirname, '..', 'demo-data', 'demo-data.json');

const INSERT_ORDER = [
  'unit_of_measure',
  'hsn_code',
  'city',
  'pincode_city_map',
  'category',
  'attribute',
  'attribute_value_option',
  'brand',
  'brand_alias',
  'master_product',
  'master_product_attribute_value',
  'users',
  'vendors',
  'vendor_account_details',
  'vendor_category',
  'vendor_listing',
  'inventory',
];

// If any of these already has rows, the database is not a blank one and we skip.
const MUST_BE_EMPTY = [
  'unit_of_measure',
  'hsn_code',
  'city',
  'category',
  'attribute',
  'brand',
  'master_product',
  'vendors',
  'vendor_listing',
];

const BATCH = 1000;
const log = (msg) => console.log(`[demo-data] ${msg}`);

module.exports = {
  async up(queryInterface) {
    if (process.env.LOAD_DEMO_DATA !== 'true') {
      log(
        'LOAD_DEMO_DATA is not "true" - skipping (recorded as done; see the note at the top of this file).',
      );
      return;
    }

    const sequelize = queryInterface.sequelize;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    await sequelize.transaction(async (transaction) => {
      for (const table of MUST_BE_EMPTY) {
        const [[{ n }]] = await sequelize.query(`SELECT count(*)::int AS n FROM "${table}"`, {
          transaction,
        });
        if (n > 0) {
          console.warn(
            `[demo-data] WARNING: "${table}" already has ${n} row(s) - this is not a blank database, so NOTHING was loaded.`,
          );
          return;
        }
      }

      const insertRows = async (table, rows) => {
        for (let i = 0; i < rows.length; i += BATCH) {
          await sequelize.query(
            `INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json) ON CONFLICT DO NOTHING`,
            { bind: [JSON.stringify(rows.slice(i, i + BATCH))], transaction },
          );
        }
      };

      for (const table of INSERT_ORDER) {
        const rows = data[table];

        if (table === 'master_product') {
          await insertRows(
            table,
            rows.map((r) => ({ ...r, status: 'draft' })),
          );
        } else if (table === 'users') {
          // Users already in this database (say an admin created by hand) keep their password and
          // everything else; we only line up the id so the vendors' foreign keys resolve.
          // users.id is referenced with ON UPDATE CASCADE, so this is safe.
          const json = JSON.stringify(rows);
          await sequelize.query(
            `UPDATE users u SET id = d.id
               FROM json_populate_recordset(NULL::users, $1::json) d
              WHERE u.phone = d.phone AND u.id <> d.id`,
            { bind: [json], transaction },
          );
          await insertRows(table, rows);
          await sequelize.query(
            `UPDATE users u SET is_approved = d.is_approved, is_active = d.is_active, updated_at = now()
               FROM json_populate_recordset(NULL::users, $1::json) d
              WHERE u.id = d.id
                AND (u.is_approved IS DISTINCT FROM d.is_approved OR u.is_active IS DISTINCT FROM d.is_active)`,
            { bind: [json], transaction },
          );
        } else {
          await insertRows(table, rows);
        }

        if (table === 'master_product_attribute_value') {
          await sequelize.query(
            `UPDATE master_product mp SET status = d.status
               FROM json_to_recordset($1::json) AS d(id uuid, status master_product_status)
              WHERE mp.id = d.id AND mp.status IS DISTINCT FROM d.status`,
            {
              bind: [JSON.stringify(data.master_product.map(({ id, status }) => ({ id, status })))],
              transaction,
            },
          );
        }
      }

      // The search_outbox triggers cover incremental changes; a full rebuild is the sure way to get
      // a first index of everything that was just loaded. The backend worker picks this marker up.
      await sequelize.query(
        `INSERT INTO search_outbox (entity_type, reason) VALUES ('all', 'demo-data migration')`,
        { transaction },
      );

      log(
        `loaded ${data.master_product.length} products, ${data.vendors.length} vendors, ` +
          `${data.vendor_listing.length} listings, ${data.inventory.length} stock rows.`,
      );
    });
  },

  // Removes exactly the rows this migration inserted, by id. Users are left alone (one of them may
  // be an admin that existed before). Does nothing if the data was never loaded.
  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    const ids = (table, key = 'id') => data[table].map((r) => r[key]);
    // Primary keys are uuid except hsn_code (code) and pincode_city_map (pincode), so compare as text.
    const del = (table, column, values, transaction) =>
      sequelize.query(`DELETE FROM "${table}" WHERE "${column}"::text = ANY($1::text[])`, {
        bind: [values],
        transaction,
      });

    await sequelize.transaction(async (transaction) => {
      await del('vendor_listing', 'id', ids('vendor_listing'), transaction); // cascades inventory
      await del('vendors', 'id', ids('vendors'), transaction); // cascades account details, categories
      await del(
        'master_product_attribute_value',
        'master_product_id',
        ids('master_product'),
        transaction,
      );
      await del('master_product', 'id', ids('master_product'), transaction);
      await del('brand_alias', 'id', ids('brand_alias'), transaction);
      await del('brand', 'id', ids('brand'), transaction);
      await del('attribute_value_option', 'id', ids('attribute_value_option'), transaction);
      await del('attribute', 'id', ids('attribute'), transaction);
      await del('category', 'id', ids('category'), transaction);
      // search_outbox.city_id is ON DELETE RESTRICT, and the deletes above (and the original load)
      // queued rows for these cities through the search triggers. They are queue entries, not
      // data, so clear them now, after the last statement that can add more. Every other table
      // that references these rows cascades.
      await sequelize.query(
        `DELETE FROM search_outbox WHERE city_id::text = ANY($1::text[]) OR reason = 'demo-data migration'`,
        { bind: [ids('city')], transaction },
      );
      await del('pincode_city_map', 'pincode', ids('pincode_city_map', 'pincode'), transaction);
      await del('city', 'id', ids('city'), transaction);
      await del('hsn_code', 'code', ids('hsn_code', 'code'), transaction);
      await del('unit_of_measure', 'id', ids('unit_of_measure'), transaction);
    });
  },
};
