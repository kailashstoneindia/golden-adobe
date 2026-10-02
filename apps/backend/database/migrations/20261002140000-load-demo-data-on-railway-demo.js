'use strict';

const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');

// Second attempt at loading the demo dataset (decision 0031). It loads the same data as
// 20261002100000-load-demo-catalog-and-vendors.js, which was merged and ran on the Railway demo
// environment but loaded NOTHING there, for two reasons this file removes:
//
//   1. It needed LOAD_DEMO_DATA=true on the Railway service, which nobody could set. This one also
//      switches itself on when it runs inside the Railway demo PROJECT (Railway injects
//      RAILWAY_PROJECT_ID into every deployment), so no variable has to be set. CI, developers'
//      databases and any other Railway project are untouched. LOAD_DEMO_DATA=true still works as an
//      explicit override.
//   2. It refused to run because the demo database already held 2 vendors (created while testing
//      vendor onboarding). Existing vendors are now left alone: a demo vendor whose user already
//      owns a vendor is NOT inserted, and its account details, categories and listings are attached
//      to the existing vendor instead.
//
// It still refuses to touch a database that already holds reference or catalog data (categories,
// attributes, cities, brands, products...): those rows normally come from seeders with random UUIDs
// and would collide with the fixed UUIDs here. It logs a warning and loads nothing; it never fails
// the deploy.
//
// Same data file, same insert order and the same trigger handling as the first migration:
//   * products go in as 'draft' and are switched to their real status AFTER their attribute values
//     exist (trg_mp_require_variant_attrs_on_publish);
//   * categories are ordered parent-first (trg_category_leaf_transition).
// Sparsh Pearl prices and stock are INVENTED demo values; the vendor bank account numbers are fakes.
//
// Before the real launch: delete this migration, the first one and ../demo-data/ (or point the
// launch at a different Railway project, where this stays a no-op).

const DATA_FILE = path.join(__dirname, '..', 'demo-data', 'demo-data.json');

// The Railway project that hosts the demo environment (its id appears in the deployment URLs on
// GitHub; it is an identifier, not a credential).
const RAILWAY_DEMO_PROJECT_ID = '355dd876-ccac-4d8a-b004-606f3777c17f';

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

// If any of these already has rows, the reference/catalog data is already there in some other form
// and we skip. vendors and users are deliberately NOT listed (see 2. above); vendor_listing cannot
// have rows while master_product is empty.
const MUST_BE_EMPTY = [
  'unit_of_measure',
  'hsn_code',
  'city',
  'category',
  'attribute',
  'brand',
  'master_product',
];

// Tables whose rows carry a vendor_id that may need re-pointing to an already existing vendor.
const VENDOR_CHILDREN = ['vendor_account_details', 'vendor_category', 'vendor_listing'];

const BATCH = 1000;
const log = (msg) => console.log(`[demo-data] ${msg}`);

const isEnabled = () =>
  process.env.LOAD_DEMO_DATA === 'true' ||
  process.env.RAILWAY_PROJECT_ID === RAILWAY_DEMO_PROJECT_ID;

module.exports = {
  async up(queryInterface) {
    if (!isEnabled()) {
      log(
        'not the Railway demo project and LOAD_DEMO_DATA is not "true" - skipping (recorded as done).',
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
            `[demo-data] WARNING: "${table}" already has ${n} row(s) - reference/catalog data is already present, so NOTHING was loaded.`,
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

      // demo vendor id -> id of the vendor that already exists for the same user
      const vendorIdMap = new Map();

      for (const table of INSERT_ORDER) {
        let rows = data[table];

        if (VENDOR_CHILDREN.includes(table) && vendorIdMap.size > 0) {
          rows = rows.map((r) => ({
            ...r,
            vendor_id: vendorIdMap.get(r.vendor_id) ?? r.vendor_id,
          }));
        }

        if (table === 'master_product') {
          await insertRows(
            table,
            rows.map((r) => ({ ...r, status: 'draft' })),
          );
        } else if (table === 'users') {
          // Users already in this database (an admin or a vendor created while testing) keep their
          // password and everything else; we only line up the id so the vendors' foreign keys
          // resolve. users.id is referenced with ON UPDATE CASCADE, so this is safe.
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
        } else if (table === 'vendors') {
          // vendors.user_id is unique, so a demo vendor whose user already owns a vendor must reuse
          // that vendor instead of being inserted.
          const existing = await sequelize.query('SELECT id, user_id FROM vendors', {
            type: QueryTypes.SELECT,
            transaction,
          });
          const byUser = new Map(existing.map((v) => [v.user_id, v.id]));
          for (const v of rows) {
            if (byUser.has(v.user_id)) vendorIdMap.set(v.id, byUser.get(v.user_id));
          }
          await insertRows(
            table,
            rows.filter((v) => !vendorIdMap.has(v.id)),
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
        `loaded ${data.master_product.length} products, ${data.vendors.length} demo vendors ` +
          `(${vendorIdMap.size} attached to vendors that already existed), ` +
          `${data.vendor_listing.length} listings, ${data.inventory.length} stock rows.`,
      );
    });
  },

  // Removes exactly the rows this migration inserted, by id. Users are left alone (some existed
  // before), and so are vendors that existed before (their demo listings are removed, the vendor
  // and any categories attached to it stay). Does nothing if the data was never loaded.
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
      // Categories attached to a vendor that existed before this migration are not removed with
      // the vendor, and vendor_category.category_id is ON DELETE RESTRICT.
      await del('vendor_category', 'category_id', ids('category'), transaction);
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
      // search_outbox.city_id is ON DELETE RESTRICT, and the deletes above (and the load) queued
      // rows for these cities through the search triggers. They are queue entries, not data, so
      // clear them now, after the last statement that can add more.
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
