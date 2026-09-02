'use strict';

// Expansion + drain bookkeeping for search_outbox (docs/search-schema.sql
// sections 5-6). Mirrors catalog_reindex_queue's drain shape exactly —
// advisory lock, cutoff-based mark-processed, purge, backlog view — same
// pattern as 20260826090000-create-attributes-flat-triggers.js, one
// migration because these functions call each other.
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // Turns outbox rows into the (product, city) PAIRS whose documents
      // must be rebuilt — the work deliberately moved OUT of the writer's
      // transaction. 'all' is excluded on purpose: a full rebuild routes
      // to the shadow-index + atomic swap job instead (Phase 6h, not
      // built in this migration).
      await q(`
        CREATE OR REPLACE FUNCTION expand_search_outbox(p_cutoff TIMESTAMPTZ)
        RETURNS TABLE (master_product_id UUID, city_id UUID) AS $$
          WITH pending AS (
            SELECT entity_type, entity_id, city_id
            FROM search_outbox
            WHERE processed_at IS NULL
              AND enqueued_at <= p_cutoff
              AND entity_type <> 'all'
          ),

          -- Pairs resolved AT TRIGGER TIME. Trusted as-is even if the row
          -- that produced them is now gone — re-deriving from current
          -- state instead would silently drop exactly the pairs that need
          -- a DELETE.
          direct_pairs AS (
            SELECT entity_id AS master_product_id, city_id
            FROM pending
            WHERE entity_type = 'master_product' AND city_id IS NOT NULL
          ),

          -- Product-level fan-out: master_product/mpav/media changes
          -- (city_id NULL) plus brand/category/stone_variety, resolved to
          -- a bare product set, then joined to CURRENT cities — safe here
          -- since nothing about these events is tied to a row that could
          -- vanish before drain runs.
          dirtied_products AS (
            SELECT entity_id AS id FROM pending WHERE entity_type = 'master_product' AND city_id IS NULL

            UNION

            SELECT mp.id
            FROM pending p
            JOIN master_product mp ON mp.brand_id = p.entity_id
            WHERE p.entity_type = 'brand'

            UNION

            SELECT mp.id
            FROM pending p
            JOIN category c ON c.id = p.entity_id
            JOIN category d ON d.id = c.id OR d.path LIKE c.path || '/%'
            JOIN master_product mp ON mp.category_id = d.id
            WHERE p.entity_type = 'category'

            UNION

            SELECT mp.id
            FROM pending p
            JOIN master_product mp ON mp.stone_variety_id = p.entity_id
            WHERE p.entity_type = 'stone_variety'
          ),

          product_fanout_pairs AS (
            SELECT dp.id AS master_product_id, v.city_id
            FROM dirtied_products dp
            JOIN vendor_listing vl ON vl.master_product_id = dp.id
            JOIN vendors v ON v.id = vl.vendor_id
          ),

          -- City-level fan-out: city rename/deactivate and vendor
          -- relocation (both write entity_type = 'city') — every product
          -- currently listed by a vendor in that city.
          city_fanout_pairs AS (
            SELECT vl.master_product_id, p.entity_id AS city_id
            FROM pending p
            JOIN vendors v ON v.city_id = p.entity_id
            JOIN vendor_listing vl ON vl.vendor_id = v.id
            WHERE p.entity_type = 'city'
          )

          SELECT * FROM direct_pairs
          UNION
          SELECT * FROM product_fanout_pairs
          UNION
          SELECT * FROM city_fanout_pairs;
        $$ LANGUAGE sql STABLE;
      `);

      // Advisory lock, mirroring drain_catalog_reindex_queue() — two
      // worker instances during a rolling deploy would otherwise both
      // drain and both mark rows processed.
      await q(`
        CREATE OR REPLACE FUNCTION search_outbox_try_lock()
        RETURNS BOOLEAN AS $$
          SELECT pg_try_advisory_lock(hashtext('search_outbox_drain'));
        $$ LANGUAGE sql VOLATILE;
      `);
      await q(`
        CREATE OR REPLACE FUNCTION search_outbox_unlock()
        RETURNS VOID AS $$
          SELECT pg_advisory_unlock(hashtext('search_outbox_drain'));
        $$ LANGUAGE sql VOLATILE;
      `);

      // Called only after Meilisearch has accepted every batch for this
      // cutoff. The cutoff is what makes this safe — changes arriving
      // mid-drain land with enqueued_at > cutoff and are picked up next
      // cycle; worst case a document rebuilds twice, never left stale.
      await q(`
        CREATE OR REPLACE FUNCTION mark_search_outbox_processed(p_cutoff TIMESTAMPTZ)
        RETURNS INTEGER AS $$
        DECLARE v_count INTEGER;
        BEGIN
          UPDATE search_outbox
          SET processed_at = NOW()
          WHERE processed_at IS NULL
            AND enqueued_at <= p_cutoff
            AND entity_type <> 'all';
          GET DIAGNOSTICS v_count = ROW_COUNT;
          RETURN v_count;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Processed rows kept briefly as an audit trail, then dropped.
      await q(`
        CREATE OR REPLACE FUNCTION purge_search_outbox(p_older_than INTERVAL DEFAULT '7 days')
        RETURNS INTEGER AS $$
        DECLARE v_count INTEGER;
        BEGIN
          DELETE FROM search_outbox
          WHERE processed_at IS NOT NULL
            AND processed_at < NOW() - p_older_than;
          GET DIAGNOSTICS v_count = ROW_COUNT;
          RETURN v_count;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Operational visibility — a stale index never raises an error on
      // its own, so this view is the only thing that will ever tell
      // anyone the worker is down or wedged.
      await q(`
        CREATE OR REPLACE VIEW search_outbox_backlog AS
        SELECT
          entity_type,
          COUNT(*)          AS pending_rows,
          MIN(enqueued_at)  AS oldest_pending,
          NOW() - MIN(enqueued_at) AS lag
        FROM search_outbox
        WHERE processed_at IS NULL
        GROUP BY entity_type;
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await q('DROP VIEW IF EXISTS search_outbox_backlog;');
      await q('DROP FUNCTION IF EXISTS purge_search_outbox(INTERVAL);');
      await q('DROP FUNCTION IF EXISTS mark_search_outbox_processed(TIMESTAMPTZ);');
      await q('DROP FUNCTION IF EXISTS search_outbox_unlock();');
      await q('DROP FUNCTION IF EXISTS search_outbox_try_lock();');
      await q('DROP FUNCTION IF EXISTS expand_search_outbox(TIMESTAMPTZ);');
    });
  },
};
