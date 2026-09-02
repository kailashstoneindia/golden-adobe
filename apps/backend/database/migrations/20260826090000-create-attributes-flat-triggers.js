'use strict';

// attributes_flat / identity_hash maintenance (decisions 0005, 0013) and the
// catalog_reindex_queue drain mechanism (docs/catalog-schema.sql sections
// 9b/9c). One migration because these pieces are genuinely interdependent —
// installing the triggers without the drain functions (or vice versa) would
// leave a half-working invalidation path with no way to test it end to end.
//
// Wrapped in an explicit transaction — see the comment in
// 20260825090002-create-master-product.js for why: sequelize-cli does not
// wrap up() in a transaction by default, and CREATE TRIGGER is not
// idempotent, so a partial failure here would leave some triggers installed
// and the retry failing on "trigger already exists".
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // The flattened document resolves inheritance AND filters out values
      // whose attribute is no longer in scope (deactivated, or moved to
      // another branch).
      await q(`
        CREATE OR REPLACE FUNCTION build_attributes_flat(p_master_product_id UUID)
        RETURNS JSONB AS $$
          WITH RECURSIVE ancestry AS (
            SELECT c.id, c.parent_id
            FROM category c
            JOIN master_product mp ON mp.category_id = c.id
            WHERE mp.id = p_master_product_id
            UNION ALL
            SELECT c.id, c.parent_id
            FROM category c JOIN ancestry a ON c.id = a.parent_id
          )
          SELECT COALESCE(jsonb_object_agg(a.code, v.value), '{}'::jsonb)
          FROM master_product_attribute_value v
          JOIN attribute a ON a.id = v.attribute_id
          WHERE v.master_product_id = p_master_product_id
            AND a.is_active
            AND (a.category_id IS NULL OR a.category_id IN (SELECT id FROM ancestry));
        $$ LANGUAGE sql STABLE;
      `);

      // Bulk-write escape hatch. A row trigger fires per row, so an import
      // writing 50 attribute values for one product would rebuild the same
      // JSONB 50 times. Setting this inside the import transaction defers
      // the work to the queue — see drain_catalog_reindex_queue below.
      await q(`
        CREATE OR REPLACE FUNCTION flat_rebuild_suppressed()
        RETURNS BOOLEAN AS $$
          SELECT COALESCE(current_setting('catalog.suppress_flat_rebuild', TRUE), 'off') = 'on';
        $$ LANGUAGE sql STABLE;
      `);

      // Enum attribute values must exist in attribute_value_option
      // (decision 0014). A foreign key cannot express this — it would apply
      // only to attributes whose data_type is 'enum', and Postgres has no
      // partial FK — so a trigger is the only way to enforce it in the
      // database rather than trusting the service layer.
      await q(`
        CREATE OR REPLACE FUNCTION enforce_attribute_value_option()
        RETURNS TRIGGER AS $$
        DECLARE
          v_type attribute_data_type;
        BEGIN
          SELECT data_type INTO v_type FROM attribute WHERE id = NEW.attribute_id;

          IF v_type = 'enum' AND NOT EXISTS (
            SELECT 1 FROM attribute_value_option
            WHERE attribute_id = NEW.attribute_id
              AND value = NEW.value
              AND is_active
          ) THEN
            RAISE EXCEPTION
              'value % is not an allowed option for attribute %', NEW.value, NEW.attribute_id;
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_mpav_enum_value
          BEFORE INSERT OR UPDATE ON master_product_attribute_value
          FOR EACH ROW EXECUTE FUNCTION enforce_attribute_value_option();
      `);

      // Deterministic identity for unbranded products (decision 0013).
      // Normalisation is mandatory, not cosmetic: without it `18` and
      // `18.0` hash differently and the constraint is theatre. Only
      // variant-defining attributes participate.
      await q(`
        CREATE OR REPLACE FUNCTION build_identity_hash(p_master_product_id UUID)
        RETURNS TEXT AS $$
          SELECT md5(string_agg(a.code || '=' || norm.value, '|' ORDER BY a.code))
          FROM master_product_attribute_value v
          JOIN attribute a ON a.id = v.attribute_id
          CROSS JOIN LATERAL (
            SELECT CASE
                     -- strip trailing zeros: 18, 18.0 and 18.00 must agree
                     WHEN a.data_type = 'number' AND v.value ~ '^-?[0-9]+(\\.[0-9]+)?$'
                       THEN trim_scale(v.value::numeric)::text
                     -- trim, collapse internal whitespace, case-fold
                     ELSE lower(regexp_replace(btrim(v.value), '\\s+', ' ', 'g'))
                   END AS value
          ) norm
          WHERE v.master_product_id = p_master_product_id
            AND a.is_variant_defining
            AND a.is_active;
        $$ LANGUAGE sql STABLE;
      `);

      // Invalidation source 1: the product's own values changed. Row-level,
      // cheap.
      await q(`
        CREATE OR REPLACE FUNCTION refresh_attributes_flat()
        RETURNS TRIGGER AS $$
        DECLARE
          v_id UUID := COALESCE(NEW.master_product_id, OLD.master_product_id);
        BEGIN
          IF flat_rebuild_suppressed() THEN
            INSERT INTO catalog_reindex_queue (scope, master_product_id, reason)
            SELECT 'product', v_id, 'suppressed bulk write'
            WHERE NOT EXISTS (
              SELECT 1 FROM catalog_reindex_queue
              WHERE scope = 'product' AND master_product_id = v_id AND processed_at IS NULL
            );
            RETURN NULL;
          END IF;

          UPDATE master_product
             SET attributes_flat = build_attributes_flat(v_id),
                 identity_hash   = build_identity_hash(v_id),
                 updated_at      = NOW()
           WHERE id = v_id;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_mpav_refresh_flat
          AFTER INSERT OR UPDATE OR DELETE ON master_product_attribute_value
          FOR EACH ROW EXECUTE FUNCTION refresh_attributes_flat();
      `);

      // Invalidation source 2: the product moved category, so its inherited
      // set changed. Safe from recursion — the inner UPDATE does not touch
      // category_id, and this trigger only fires when category_id appears
      // in the SET list.
      await q(`
        CREATE OR REPLACE FUNCTION refresh_attributes_flat_on_move()
        RETURNS TRIGGER AS $$
        BEGIN
          IF flat_rebuild_suppressed() THEN
            INSERT INTO catalog_reindex_queue (scope, master_product_id, reason)
            SELECT 'product', NEW.id, 'suppressed category move'
            WHERE NOT EXISTS (
              SELECT 1 FROM catalog_reindex_queue
              WHERE scope = 'product' AND master_product_id = NEW.id AND processed_at IS NULL
            );
            RETURN NULL;
          END IF;

          -- updated_at advances here too (decision 0014), matching the
          -- value-change trigger. Consistency matters because updated_at is
          -- the natural key for incremental search-index sync.
          UPDATE master_product
             SET attributes_flat = build_attributes_flat(NEW.id),
                 identity_hash   = build_identity_hash(NEW.id),
                 updated_at      = NOW()
           WHERE id = NEW.id;
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_master_product_refresh_flat_on_move
          AFTER UPDATE OF category_id ON master_product
          FOR EACH ROW EXECUTE FUNCTION refresh_attributes_flat_on_move();
      `);

      // Invalidation source 3: an ATTRIBUTE row changed — the easy one to
      // forget. Editing an attribute on `Tiles` invalidates every product
      // beneath it, which can be tens of thousands of rows. That must NOT
      // happen inline inside the admin's transaction, so it is enqueued and
      // drained by a background job.
      await q(`
        CREATE OR REPLACE FUNCTION enqueue_attribute_reindex()
        RETURNS TRIGGER AS $$
        DECLARE
          v_category UUID := COALESCE(NEW.category_id, OLD.category_id);
        BEGIN
          IF v_category IS NULL THEN
            -- A GLOBAL attribute changed: every product in every category
            -- is affected.
            INSERT INTO catalog_reindex_queue (scope, reason)
            VALUES ('all', TG_OP || ' on global attribute');
          ELSE
            INSERT INTO catalog_reindex_queue (scope, category_id, reason)
            VALUES ('category_subtree', v_category, TG_OP || ' on attribute');
          END IF;

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_attribute_enqueue_reindex
          AFTER INSERT OR UPDATE OR DELETE ON attribute
          FOR EACH ROW EXECUTE FUNCTION enqueue_attribute_reindex();
      `);

      // Drain helpers, called by the background job (and directly by
      // drain_catalog_reindex_queue below).
      await q(`
        CREATE OR REPLACE FUNCTION rebuild_attributes_flat_for_category(p_category_id UUID)
        RETURNS INTEGER AS $$
        DECLARE
          v_rows INTEGER;
        BEGIN
          WITH RECURSIVE subtree AS (
            SELECT id FROM category WHERE id = p_category_id
            UNION ALL
            SELECT c.id FROM category c JOIN subtree s ON c.parent_id = s.id
          )
          UPDATE master_product mp
             SET attributes_flat = build_attributes_flat(mp.id)
           WHERE mp.category_id IN (SELECT id FROM subtree);

          GET DIAGNOSTICS v_rows = ROW_COUNT;
          RETURN v_rows;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE OR REPLACE FUNCTION rebuild_attributes_flat_all()
        RETURNS INTEGER AS $$
        DECLARE
          v_rows INTEGER;
        BEGIN
          UPDATE master_product SET attributes_flat = build_attributes_flat(id);
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          RETURN v_rows;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // The drainer. Idempotent, safe to call concurrently, and collapses
      // redundant work. Call it on a schedule (NestJS task, pg_cron, or
      // external worker) and after any suppressed bulk write. Returns the
      // number of product rows rebuilt, or -1 if another drain holds the
      // lock. Never raises on contention.
      await q(`
        CREATE OR REPLACE FUNCTION drain_catalog_reindex_queue()
        RETURNS INTEGER AS $$
        DECLARE
          v_lock_key BIGINT := hashtext('catalog_reindex_queue');
          -- Anything enqueued mid-drain stays pending for the next run
          -- rather than being marked processed without having been
          -- rebuilt.
          v_cutoff   TIMESTAMPTZ := NOW();
          v_total    INTEGER := 0;
          v_rows     INTEGER;
          r          RECORD;
        BEGIN
          IF NOT pg_try_advisory_lock(v_lock_key) THEN
            RETURN -1;
          END IF;

          -- 1. A global rebuild supersedes every other pending entry.
          IF EXISTS (
            SELECT 1 FROM catalog_reindex_queue
            WHERE processed_at IS NULL AND scope = 'all' AND enqueued_at <= v_cutoff
          ) THEN
            v_total := rebuild_attributes_flat_all();

            UPDATE catalog_reindex_queue SET processed_at = NOW()
             WHERE processed_at IS NULL AND enqueued_at <= v_cutoff;

            PERFORM pg_advisory_unlock(v_lock_key);
            RETURN v_total;
          END IF;

          -- 2. Category subtrees, collapsed: skip any subtree whose
          --    ancestor is also pending, since rebuilding the ancestor
          --    already covers it. This is what the denormalized
          --    category.path column buys us.
          FOR r IN
            SELECT DISTINCT c.id
            FROM catalog_reindex_queue q
            JOIN category c ON c.id = q.category_id
            WHERE q.processed_at IS NULL
              AND q.scope = 'category_subtree'
              AND q.enqueued_at <= v_cutoff
              AND NOT EXISTS (
                SELECT 1
                FROM catalog_reindex_queue q2
                JOIN category c2 ON c2.id = q2.category_id
                WHERE q2.processed_at IS NULL
                  AND q2.scope = 'category_subtree'
                  AND q2.enqueued_at <= v_cutoff
                  AND c.path LIKE c2.path || '/%'
              )
          LOOP
            v_total := v_total + rebuild_attributes_flat_for_category(r.id);
          END LOOP;

          -- 3. Individual products. Rebuilt unconditionally: a product
          --    already covered by step 2 is simply rebuilt twice, which is
          --    wasteful but never wrong.
          UPDATE master_product mp
             SET attributes_flat = build_attributes_flat(mp.id)
           WHERE mp.id IN (
             SELECT q.master_product_id
             FROM catalog_reindex_queue q
             WHERE q.processed_at IS NULL
               AND q.scope = 'product'
               AND q.enqueued_at <= v_cutoff
           );
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          v_total := v_total + v_rows;

          UPDATE catalog_reindex_queue SET processed_at = NOW()
           WHERE processed_at IS NULL AND enqueued_at <= v_cutoff;

          PERFORM pg_advisory_unlock(v_lock_key);
          RETURN v_total;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Processed rows are kept as an audit trail; purge them periodically.
      await q(`
        CREATE OR REPLACE FUNCTION purge_catalog_reindex_queue(p_older_than INTERVAL DEFAULT '7 days')
        RETURNS INTEGER AS $$
        DECLARE
          v_rows INTEGER;
        BEGIN
          DELETE FROM catalog_reindex_queue
           WHERE processed_at IS NOT NULL
             AND processed_at < NOW() - p_older_than;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          RETURN v_rows;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Staleness monitor — should return 0 rows in a healthy system. Alert
      // if the oldest pending entry is more than a few minutes old.
      await q(`
        CREATE OR REPLACE VIEW catalog_reindex_backlog AS
          SELECT scope,
                 COUNT(*)          AS pending,
                 MIN(enqueued_at)  AS oldest_enqueued_at,
                 NOW() - MIN(enqueued_at) AS oldest_age
          FROM catalog_reindex_queue
          WHERE processed_at IS NULL
          GROUP BY scope;
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      await q('DROP VIEW IF EXISTS catalog_reindex_backlog;');
      await q('DROP FUNCTION IF EXISTS purge_catalog_reindex_queue(INTERVAL);');
      await q('DROP FUNCTION IF EXISTS drain_catalog_reindex_queue();');
      await q('DROP FUNCTION IF EXISTS rebuild_attributes_flat_all();');
      await q('DROP FUNCTION IF EXISTS rebuild_attributes_flat_for_category(UUID);');
      await q('DROP TRIGGER IF EXISTS trg_attribute_enqueue_reindex ON attribute;');
      await q('DROP FUNCTION IF EXISTS enqueue_attribute_reindex();');
      await q(
        'DROP TRIGGER IF EXISTS trg_master_product_refresh_flat_on_move ON master_product;',
      );
      await q('DROP FUNCTION IF EXISTS refresh_attributes_flat_on_move();');
      await q(
        'DROP TRIGGER IF EXISTS trg_mpav_refresh_flat ON master_product_attribute_value;',
      );
      await q('DROP FUNCTION IF EXISTS refresh_attributes_flat();');
      await q('DROP FUNCTION IF EXISTS build_identity_hash(UUID);');
      await q(
        'DROP TRIGGER IF EXISTS trg_mpav_enum_value ON master_product_attribute_value;',
      );
      await q('DROP FUNCTION IF EXISTS enforce_attribute_value_option();');
      await q('DROP FUNCTION IF EXISTS flat_rebuild_suppressed();');
      await q('DROP FUNCTION IF EXISTS build_attributes_flat(UUID);');
    });
  },
};
