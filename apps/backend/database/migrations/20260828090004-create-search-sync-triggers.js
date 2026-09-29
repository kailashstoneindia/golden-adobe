'use strict';

// Search sync trigger layer (docs/search-schema.sql sections 2-3, decisions
// 0017/0018). One migration for 3 trigger functions + 26 statement-level
// triggers over 12 tables — all interdependent (installing triggers without
// the functions they call, or vice versa, leaves a half-working pipeline
// with nothing to test it against), so this lands as one transaction-
// wrapped unit, the same pattern as the Phase 2 attributes_flat trigger
// migration.
//
// STATEMENT-LEVEL, not row-level: a vendor uploading 500 paint price rows
// must invoke the function once and write ~50 deduplicated outbox rows,
// not 500. Postgres forbids combining multiple events with OR when
// transition tables are requested, so each event needs its own trigger —
// the 26-trigger count is forced by Postgres, not a stylistic choice.
//
// THREE functions, not one, because of rule 3 in search-schema.sql: does
// the changed row carry (or resolve to) vendor_id, and would losing that
// row on DELETE also lose the only way to learn which city was affected?
//   enqueue_search_outbox()             — no city to resolve at trigger time
//   enqueue_search_outbox_for_listing() — vendor_listing: carries vendor_id directly
//   enqueue_search_outbox_via_listing() — vlcp / inventory: one hop via vendor_listing_id
//
// A FOURTH function was added here, deviating from docs/search-schema.sql:
// enqueue_search_outbox_row(). Postgres rejects
// "transition tables cannot be specified for triggers with column lists" —
// REFERENCING ... TABLE is fundamentally incompatible with UPDATE OF
// <columns> on the same trigger, confirmed by running the documented DDL
// directly against Postgres 16 before writing this fix. The doc's own 5
// column-restricted fan-out triggers (brand/category/stone_variety/city/
// vendors) specify both together, which cannot execute as written.
//
// enqueue_search_outbox_row() is a FOR EACH ROW equivalent using plain
// OLD/NEW instead of transition tables — correct here specifically because
// every one of these 5 triggers fires on a single-row admin action (a
// brand rename, a category edit, a vendor relocation), never a bulk
// import, so row-level firing costs nothing extra. The statement-level
// dedup argument that justifies transition tables everywhere else does
// not apply to this set.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // -----------------------------------------------------------------
      // 2a. Generic function
      // -----------------------------------------------------------------
      await q(`
        CREATE OR REPLACE FUNCTION enqueue_search_outbox()
        RETURNS TRIGGER AS $$
        BEGIN
          IF search_outbox_suppressed() THEN
            RETURN NULL;
          END IF;

          IF TG_OP = 'INSERT' THEN
            INSERT INTO search_outbox (entity_type, entity_id, reason)
            SELECT DISTINCT TG_ARGV[0], (to_jsonb(n) ->> TG_ARGV[1])::UUID, TG_TABLE_NAME || ' insert'
            FROM new_rows n
            WHERE to_jsonb(n) ->> TG_ARGV[1] IS NOT NULL;

          ELSIF TG_OP = 'UPDATE' THEN
            INSERT INTO search_outbox (entity_type, entity_id, reason)
            SELECT DISTINCT TG_ARGV[0], id, TG_TABLE_NAME || ' update'
            FROM (
              SELECT (to_jsonb(n) ->> TG_ARGV[1])::UUID AS id FROM new_rows n
              UNION
              SELECT (to_jsonb(o) ->> TG_ARGV[1])::UUID AS id FROM old_rows o
            ) ids
            WHERE id IS NOT NULL;

          ELSE
            INSERT INTO search_outbox (entity_type, entity_id, reason)
            SELECT DISTINCT TG_ARGV[0], (to_jsonb(o) ->> TG_ARGV[1])::UUID, TG_TABLE_NAME || ' delete'
            FROM old_rows o
            WHERE to_jsonb(o) ->> TG_ARGV[1] IS NOT NULL;
          END IF;

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // -----------------------------------------------------------------
      // 2b. vendor_listing — resolves city_id NOW, at trigger time, while
      // the row (and its vendor_id) is still visible. Without this, a
      // vendor's LAST listing for a product in a city being deleted would
      // leave nothing behind that could tell the worker which city just
      // lost coverage.
      // -----------------------------------------------------------------
      await q(`
        CREATE OR REPLACE FUNCTION enqueue_search_outbox_for_listing()
        RETURNS TRIGGER AS $$
        BEGIN
          IF search_outbox_suppressed() THEN
            RETURN NULL;
          END IF;

          IF TG_OP = 'INSERT' THEN
            INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
            SELECT DISTINCT 'master_product', n.master_product_id, v.city_id, 'vendor_listing insert'
            FROM new_rows n
            JOIN vendors v ON v.id = n.vendor_id;

          ELSIF TG_OP = 'UPDATE' THEN
            INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
            SELECT 'master_product', pair.product_id, pair.city_id, 'vendor_listing update'
            FROM (
              SELECT DISTINCT n.master_product_id AS product_id, v.city_id
              FROM new_rows n JOIN vendors v ON v.id = n.vendor_id
              UNION
              SELECT DISTINCT o.master_product_id AS product_id, v.city_id
              FROM old_rows o JOIN vendors v ON v.id = o.vendor_id
            ) pair;

          ELSE
            INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
            SELECT DISTINCT 'master_product', o.master_product_id, v.city_id, 'vendor_listing delete'
            FROM old_rows o
            JOIN vendors v ON v.id = o.vendor_id;
          END IF;

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // -----------------------------------------------------------------
      // 2c. vlcp / inventory — one hop through vendor_listing to reach
      // both product and city. On a cascade delete (parent vendor_listing
      // itself deleted) the join finds nothing here — correct, not a bug:
      // 2b already captured this exact pair before the row disappeared.
      // -----------------------------------------------------------------
      await q(`
        CREATE OR REPLACE FUNCTION enqueue_search_outbox_via_listing()
        RETURNS TRIGGER AS $$
        BEGIN
          IF search_outbox_suppressed() THEN
            RETURN NULL;
          END IF;

          IF TG_OP = 'DELETE' THEN
            INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
            SELECT DISTINCT 'master_product', vl.master_product_id, v.city_id, TG_TABLE_NAME || ' delete'
            FROM old_rows o
            JOIN vendor_listing vl ON vl.id = o.vendor_listing_id
            JOIN vendors v ON v.id = vl.vendor_id;
          ELSE
            INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
            SELECT DISTINCT 'master_product', vl.master_product_id, v.city_id, TG_TABLE_NAME || ' upsert'
            FROM new_rows n
            JOIN vendor_listing vl ON vl.id = n.vendor_listing_id
            JOIN vendors v ON v.id = vl.vendor_id;
          END IF;

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // -----------------------------------------------------------------
      // 2d. Row-level equivalent of enqueue_search_outbox(), for the 5
      // column-restricted fan-out triggers only — see the deviation note
      // at the top of this file for why transition tables cannot be used
      // here. TG_ARGV[0] = entity_type; TG_ARGV[1] = column on the row
      // holding that entity's id (mirrors the generic function's args).
      // -----------------------------------------------------------------
      // Inserts one row per DISTINCT id found across NEW and OLD — this is
      // what makes trg_vendor_search_upd (below) correctly reproduce the
      // original design's "relocation dirties BOTH the old and new city",
      // which the transition-table version got from UNIONing new_rows and
      // old_rows. For the other 4 triggers (brand/category/stone_variety/
      // city, which use TG_ARGV[1] = 'id' — an identity column that never
      // itself changes on UPDATE) NEW and OLD resolve to the same id, so
      // the DISTINCT collapses it back to exactly one row, matching the
      // original behaviour there too.
      await q(`
        CREATE OR REPLACE FUNCTION enqueue_search_outbox_row()
        RETURNS TRIGGER AS $$
        DECLARE
          v_new_id UUID := (to_jsonb(NEW) ->> TG_ARGV[1])::UUID;
          v_old_id UUID := (to_jsonb(OLD) ->> TG_ARGV[1])::UUID;
        BEGIN
          IF search_outbox_suppressed() THEN
            RETURN NULL;
          END IF;

          INSERT INTO search_outbox (entity_type, entity_id, reason)
          SELECT DISTINCT TG_ARGV[0], id, TG_TABLE_NAME || ' update (row)'
          FROM (VALUES (v_new_id), (v_old_id)) AS ids(id)
          WHERE id IS NOT NULL;

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // -----------------------------------------------------------------
      // 3. Triggers — 26 over 12 tables.
      // -----------------------------------------------------------------

      // -- master_product --
      await q(`
        CREATE TRIGGER trg_mp_search_ins AFTER INSERT ON master_product
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'id');
      `);
      await q(`
        CREATE TRIGGER trg_mp_search_upd AFTER UPDATE ON master_product
          REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'id');
      `);
      await q(`
        CREATE TRIGGER trg_mp_search_del AFTER DELETE ON master_product
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'id');
      `);

      // -- master_product_attribute_value — enqueues the PRODUCT, not
      // itself (composite PK, no surrogate id). city_id stays NULL: an
      // attribute change doesn't add/remove city availability.
      await q(`
        CREATE TRIGGER trg_mpav_search_ins AFTER INSERT ON master_product_attribute_value
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');
      `);
      await q(`
        CREATE TRIGGER trg_mpav_search_upd AFTER UPDATE ON master_product_attribute_value
          REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');
      `);
      await q(`
        CREATE TRIGGER trg_mpav_search_del AFTER DELETE ON master_product_attribute_value
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');
      `);

      // -- master_product_media --
      await q(`
        CREATE TRIGGER trg_mpm_search_ins AFTER INSERT ON master_product_media
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');
      `);
      await q(`
        CREATE TRIGGER trg_mpm_search_upd AFTER UPDATE ON master_product_media
          REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');
      `);
      await q(`
        CREATE TRIGGER trg_mpm_search_del AFTER DELETE ON master_product_media
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');
      `);

      // -- vendor_listing — uses 2b, the function that can resolve
      // city_id before the row potentially disappears.
      await q(`
        CREATE TRIGGER trg_vl_search_ins AFTER INSERT ON vendor_listing
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_for_listing();
      `);
      await q(`
        CREATE TRIGGER trg_vl_search_upd AFTER UPDATE ON vendor_listing
          REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_for_listing();
      `);
      await q(`
        CREATE TRIGGER trg_vl_search_del AFTER DELETE ON vendor_listing
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_for_listing();
      `);

      // -- vendor_listing_colour_price (paint colour availability + price) --
      await q(`
        CREATE TRIGGER trg_vlcp_search_ins AFTER INSERT ON vendor_listing_colour_price
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();
      `);
      await q(`
        CREATE TRIGGER trg_vlcp_search_upd AFTER UPDATE ON vendor_listing_colour_price
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();
      `);
      await q(`
        CREATE TRIGGER trg_vlcp_search_del AFTER DELETE ON vendor_listing_colour_price
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();
      `);

      // -- inventory — drives in_stock; paint has no inventory rows at
      // all (decision 0007), so paint availability comes from
      // vendor_listing.status instead.
      await q(`
        CREATE TRIGGER trg_inv_search_ins AFTER INSERT ON inventory
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();
      `);
      await q(`
        CREATE TRIGGER trg_inv_search_upd AFTER UPDATE ON inventory
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();
      `);
      await q(`
        CREATE TRIGGER trg_inv_search_del AFTER DELETE ON inventory
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();
      `);

      // -- stone_variety_alias (searchable synonyms) --
      await q(`
        CREATE TRIGGER trg_sva_search_ins AFTER INSERT ON stone_variety_alias
          REFERENCING NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'stone_variety_id');
      `);
      await q(`
        CREATE TRIGGER trg_sva_search_upd AFTER UPDATE ON stone_variety_alias
          REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'stone_variety_id');
      `);
      await q(`
        CREATE TRIGGER trg_sva_search_del AFTER DELETE ON stone_variety_alias
          REFERENCING OLD TABLE AS old_rows
          FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'stone_variety_id');
      `);

      // -- Fan-out sources, column-restricted (over-firing here costs
      // THOUSANDS of rebuilds, not one). No INSERT/DELETE trigger needed:
      // a new brand/category/stone_variety has no products yet, and all
      // three are ON DELETE RESTRICT from master_product.
      // FOR EACH ROW + plain OLD/NEW, not statement-level with transition
      // tables — see the deviation note at the top of this file. Row-level
      // firing is fine here: a brand/category/stone_variety edit is a
      // single-row admin action, never a bulk import.
      await q(`
        CREATE TRIGGER trg_brand_search_upd AFTER UPDATE OF name ON brand
          FOR EACH ROW EXECUTE FUNCTION enqueue_search_outbox_row('brand', 'id');
      `);
      await q(`
        CREATE TRIGGER trg_cat_search_upd AFTER UPDATE OF name, slug, path, is_active ON category
          FOR EACH ROW EXECUTE FUNCTION enqueue_search_outbox_row('category', 'id');
      `);
      await q(`
        CREATE TRIGGER trg_sv_search_upd AFTER UPDATE OF name ON stone_variety
          FOR EACH ROW EXECUTE FUNCTION enqueue_search_outbox_row('stone_variety', 'id');
      `);

      // -- Geography fan-out (decision 0018) — city rename/deactivate,
      // and vendor relocation reusing the SAME 'city' fan-out. Row-level,
      // per the deviation note — enqueue_search_outbox_row() unions
      // NEW/OLD itself, which for vendors.city_id is exactly "recheck the
      // old city AND the new city" on a relocation.
      await q(`
        CREATE TRIGGER trg_city_search_upd AFTER UPDATE OF name, is_active ON city
          FOR EACH ROW EXECUTE FUNCTION enqueue_search_outbox_row('city', 'id');
      `);
      await q(`
        CREATE TRIGGER trg_vendor_search_upd AFTER UPDATE OF city_id ON vendors
          FOR EACH ROW EXECUTE FUNCTION enqueue_search_outbox_row('city', 'city_id');
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      const triggers = [
        ['trg_vendor_search_upd', 'vendors'],
        ['trg_city_search_upd', 'city'],
        ['trg_sv_search_upd', 'stone_variety'],
        ['trg_cat_search_upd', 'category'],
        ['trg_brand_search_upd', 'brand'],
        ['trg_sva_search_del', 'stone_variety_alias'],
        ['trg_sva_search_upd', 'stone_variety_alias'],
        ['trg_sva_search_ins', 'stone_variety_alias'],
        ['trg_inv_search_del', 'inventory'],
        ['trg_inv_search_upd', 'inventory'],
        ['trg_inv_search_ins', 'inventory'],
        ['trg_vlcp_search_del', 'vendor_listing_colour_price'],
        ['trg_vlcp_search_upd', 'vendor_listing_colour_price'],
        ['trg_vlcp_search_ins', 'vendor_listing_colour_price'],
        ['trg_vl_search_del', 'vendor_listing'],
        ['trg_vl_search_upd', 'vendor_listing'],
        ['trg_vl_search_ins', 'vendor_listing'],
        ['trg_mpm_search_del', 'master_product_media'],
        ['trg_mpm_search_upd', 'master_product_media'],
        ['trg_mpm_search_ins', 'master_product_media'],
        ['trg_mpav_search_del', 'master_product_attribute_value'],
        ['trg_mpav_search_upd', 'master_product_attribute_value'],
        ['trg_mpav_search_ins', 'master_product_attribute_value'],
        ['trg_mp_search_del', 'master_product'],
        ['trg_mp_search_upd', 'master_product'],
        ['trg_mp_search_ins', 'master_product'],
      ];
      for (const [trigger, table] of triggers) {
        await q(`DROP TRIGGER IF EXISTS ${trigger} ON ${table};`);
      }

      await q('DROP FUNCTION IF EXISTS enqueue_search_outbox_row();');
      await q('DROP FUNCTION IF EXISTS enqueue_search_outbox_via_listing();');
      await q('DROP FUNCTION IF EXISTS enqueue_search_outbox_for_listing();');
      await q('DROP FUNCTION IF EXISTS enqueue_search_outbox(TEXT, TEXT);');
    });
  },
};
