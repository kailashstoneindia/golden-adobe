-- =============================================================================
-- SEARCH SYNC SCHEMA — outbox, triggers, expansion, drain
-- =============================================================================
--
-- Companion to catalog-schema.sql, which stays canonical for the catalog itself.
-- This file is canonical for search synchronisation.
--
-- Design: docs/search-system-design.md
-- Decision: docs/decisions/0017-search-engine-choice.md
--
-- Two rules govern everything below.
--
--   1. TRIGGERS, NOT ORM HOOKS. Bulk Excel import, admin seeding and
--      drain_catalog_reindex_queue() all write in bulk SQL and bypass Sequelize.
--      An afterSave hook silently misses exactly the writes that change the most
--      rows. Triggers see every write regardless of what issued it.
--
--   2. THE OUTBOX RECORDS WHAT CHANGED, NOT WHAT TO REBUILD. Renaming one brand
--      dirties every product beneath it. If the trigger enqueued product IDs it
--      would write thousands of rows inside the transaction that renamed one row.
--      It writes ONE row; the worker expands it afterwards, outside that
--      transaction.
--
-- =============================================================================


-- =============================================================================
-- 1. THE OUTBOX
-- =============================================================================

-- Shape deliberately mirrors catalog_reindex_queue: BIGSERIAL, enqueued_at /
-- processed_at, a CHECK constraint tying the target to the scope. Same pattern,
-- same drain semantics, one thing to learn.
--
-- It differs in being POLYMORPHIC. catalog_reindex_queue has two targets and can
-- afford typed, foreign-keyed columns. This has five, so it carries
-- (entity_type, entity_id) instead.
--
-- The cost is real and worth stating: no foreign key, therefore no ON DELETE
-- CASCADE, therefore the worker must tolerate an entity_id that no longer
-- exists. That turns out to be the DELETE PATH rather than a defect — see
-- section 5.
CREATE TABLE search_outbox (
  id           BIGSERIAL PRIMARY KEY,

  entity_type  TEXT NOT NULL CHECK (entity_type IN (
                 'master_product',   -- 1:1  → that product
                 'vendor_listing',   -- 1:1  → its product
                 'brand',            -- fan-out → all products of the brand
                 'category',         -- fan-out → the whole subtree
                 'stone_variety',    -- fan-out → all products of the variety
                 'all'               -- full rebuild marker
               )),

  entity_id    UUID,        -- NULL only for 'all'
  reason       TEXT NOT NULL,
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  CONSTRAINT search_outbox_target CHECK (
    (entity_type =  'all' AND entity_id IS NULL) OR
    (entity_type <> 'all' AND entity_id IS NOT NULL)
  )
);

CREATE INDEX idx_search_outbox_pending ON search_outbox (enqueued_at)
  WHERE processed_at IS NULL;


-- Bulk-write escape hatch, mirroring flat_rebuild_suppressed(). Seeding 4,000
-- SKUs should not enqueue 4,000 outbox rows and then drain them one document at
-- a time — it should suppress, then enqueue a single 'all' marker and let the
-- shadow-index rebuild handle it.
--
--   BEGIN;
--   SELECT set_config('search.suppress_outbox', 'on', true);   -- txn-local
--   ... bulk writes ...
--   COMMIT;
--   INSERT INTO search_outbox (entity_type, reason) VALUES ('all', 'bulk seed');
--
CREATE OR REPLACE FUNCTION search_outbox_suppressed()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('search.suppress_outbox', TRUE), 'off') = 'on';
$$ LANGUAGE sql STABLE;


-- =============================================================================
-- 2. TRIGGER FUNCTIONS
-- =============================================================================
--
-- STATEMENT-LEVEL, using transition tables (Postgres 10+; this project runs 16).
--
-- Row-level triggers would be fewer lines — a single AFTER INSERT OR UPDATE OR
-- DELETE per table — but they fire once per row. A vendor uploading 500 paint
-- price rows would invoke the function 500 times and write 500 outbox rows for
-- perhaps 50 distinct products. A statement-level trigger runs ONCE and writes
-- one deduplicated INSERT ... SELECT DISTINCT.
--
-- The cost of that choice is fixed by Postgres and cannot be avoided:
--
--   "Multiple events can be specified using OR, except when transition
--    relations are requested."
--                             — PostgreSQL 16, CREATE TRIGGER
--
-- So each event needs its own trigger: 24 triggers over 10 tables. They share
-- just two functions, and the DDL is written once.


-- -----------------------------------------------------------------------------
-- 2a. Generic — the changed row already carries the target id in a column.
--
--   TG_ARGV[0] = entity_type to enqueue
--   TG_ARGV[1] = column on the changed row holding that entity's id
--
-- to_jsonb(row) ->> column avoids dynamic SQL, which cannot see transition
-- tables reliably. The UPDATE branch reads BOTH transition tables because a
-- re-match can move a listing between products, and the OLD product needs
-- reindexing just as much as the new one.
-- -----------------------------------------------------------------------------
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

  ELSE  -- DELETE
    INSERT INTO search_outbox (entity_type, entity_id, reason)
    SELECT DISTINCT TG_ARGV[0], (to_jsonb(o) ->> TG_ARGV[1])::UUID, TG_TABLE_NAME || ' delete'
    FROM old_rows o
    WHERE to_jsonb(o) ->> TG_ARGV[1] IS NOT NULL;
  END IF;

  RETURN NULL;   -- AFTER STATEMENT trigger; return value is ignored
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 2b. Listing children — vendor_listing_colour_price and inventory carry only
-- vendor_listing_id, so the product must be resolved by join.
--
-- Resolved AT TRIGGER TIME, while the parent row is still visible. On a cascade
-- delete the join finds nothing, and that is correct rather than a bug: deleting
-- the vendor_listing fired its OWN delete trigger, which already enqueued the
-- product. The cascade path is redundant, not load-bearing.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_search_outbox_via_listing()
RETURNS TRIGGER AS $$
BEGIN
  IF search_outbox_suppressed() THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO search_outbox (entity_type, entity_id, reason)
    SELECT DISTINCT 'master_product', vl.master_product_id, TG_TABLE_NAME || ' delete'
    FROM old_rows o
    JOIN vendor_listing vl ON vl.id = o.vendor_listing_id;
  ELSE
    INSERT INTO search_outbox (entity_type, entity_id, reason)
    SELECT DISTINCT 'master_product', vl.master_product_id, TG_TABLE_NAME || ' upsert'
    FROM new_rows n
    JOIN vendor_listing vl ON vl.id = n.vendor_listing_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 3. TRIGGERS
-- =============================================================================
--
-- RULE — restrict `UPDATE OF <columns>` only where the trigger FANS OUT.
--
--   1:1 source   → over-firing costs one redundant document rebuild. Not worth
--                  maintaining a column list that silently rots as columns are
--                  added.
--   fan-out      → over-firing costs THOUSANDS of rebuilds. A bare
--                  `AFTER UPDATE ON brand` would reindex every Havells product
--                  because someone touched updated_at.
--
-- This is why brand, category and stone_variety name their columns and the
-- others do not.


-- -- master_product ------------------------------------------------------------
CREATE TRIGGER trg_mp_search_ins AFTER INSERT ON master_product
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'id');

CREATE TRIGGER trg_mp_search_upd AFTER UPDATE ON master_product
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'id');

CREATE TRIGGER trg_mp_search_del AFTER DELETE ON master_product
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'id');


-- -- master_product_attribute_value ---------------------------------------------
-- Composite primary key, no surrogate id — so it enqueues the PRODUCT directly
-- rather than itself. Same for every child table below: the outbox never needs
-- an entity type it cannot resolve later.
CREATE TRIGGER trg_mpav_search_ins AFTER INSERT ON master_product_attribute_value
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');

CREATE TRIGGER trg_mpav_search_upd AFTER UPDATE ON master_product_attribute_value
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');

CREATE TRIGGER trg_mpav_search_del AFTER DELETE ON master_product_attribute_value
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');


-- -- master_product_media --------------------------------------------------------
CREATE TRIGGER trg_mpm_search_ins AFTER INSERT ON master_product_media
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');

CREATE TRIGGER trg_mpm_search_upd AFTER UPDATE ON master_product_media
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');

CREATE TRIGGER trg_mpm_search_del AFTER DELETE ON master_product_media
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');


-- -- vendor_listing ---------------------------------------------------------------
-- Enqueues master_product_id, NOT its own id. On delete the listing is gone, so
-- a 'vendor_listing' entity could never be resolved back to a product at drain
-- time. The UPDATE branch reads both transition tables, which is what makes a
-- re-match (listing moved to a different product) reindex both sides.
CREATE TRIGGER trg_vl_search_ins AFTER INSERT ON vendor_listing
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');

CREATE TRIGGER trg_vl_search_upd AFTER UPDATE ON vendor_listing
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');

CREATE TRIGGER trg_vl_search_del AFTER DELETE ON vendor_listing
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('master_product', 'master_product_id');


-- -- vendor_listing_colour_price (paint colour availability + price) -------------
CREATE TRIGGER trg_vlcp_search_ins AFTER INSERT ON vendor_listing_colour_price
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();

CREATE TRIGGER trg_vlcp_search_upd AFTER UPDATE ON vendor_listing_colour_price
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();

CREATE TRIGGER trg_vlcp_search_del AFTER DELETE ON vendor_listing_colour_price
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();


-- -- inventory ---------------------------------------------------------------------
-- Drives the in_stock flag. Paint has no inventory rows at all (decision 0007),
-- so paint availability comes from vendor_listing.status instead.
CREATE TRIGGER trg_inv_search_ins AFTER INSERT ON inventory
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();

CREATE TRIGGER trg_inv_search_upd AFTER UPDATE ON inventory
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();

CREATE TRIGGER trg_inv_search_del AFTER DELETE ON inventory
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_via_listing();


-- -- stone_variety_alias (searchable synonyms: "Makrana" finds Makrana White) -----
CREATE TRIGGER trg_sva_search_ins AFTER INSERT ON stone_variety_alias
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'stone_variety_id');

CREATE TRIGGER trg_sva_search_upd AFTER UPDATE ON stone_variety_alias
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'stone_variety_id');

CREATE TRIGGER trg_sva_search_del AFTER DELETE ON stone_variety_alias
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'stone_variety_id');


-- -- FAN-OUT SOURCES — column-restricted, because over-firing is expensive here --
--
-- INSERT needs no trigger: a brand-new brand has no products yet. DELETE needs
-- none either — all three are ON DELETE RESTRICT from master_product, so a row
-- with products cannot be deleted.

CREATE TRIGGER trg_brand_search_upd AFTER UPDATE OF name ON brand
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('brand', 'id');

-- path and slug matter because the document carries the category breadcrumb.
CREATE TRIGGER trg_cat_search_upd AFTER UPDATE OF name, slug, path, is_active ON category
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('category', 'id');

CREATE TRIGGER trg_sv_search_upd AFTER UPDATE OF name ON stone_variety
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('stone_variety', 'id');


-- =============================================================================
-- 4. FEEDING FROM THE EXISTING CATALOG QUEUE
-- =============================================================================
--
-- drain_catalog_reindex_queue() rebuilds attributes_flat in bulk. Every product
-- it touches has a changed search document.
--
-- Its UPDATE on master_product fires trg_mp_search_upd automatically, so this is
-- already handled — PROVIDED the drain does not run with search.suppress_outbox
-- set. It must not. Suppression is for the initial seed only.
--
-- Add to the end of drain_catalog_reindex_queue(), for the 'all' scope only,
-- where per-row triggers would enqueue thousands of rows for what is really one
-- job:
--
--   INSERT INTO search_outbox (entity_type, reason)
--   VALUES ('all', 'attributes_flat full rebuild');


-- =============================================================================
-- 5. EXPANSION
-- =============================================================================
--
-- Turns outbox rows into the set of products whose documents must be rebuilt.
-- This is the work deliberately moved OUT of the writer's transaction.
--
-- 'all' is excluded on purpose. A full rebuild does not belong in the
-- incremental path — it routes to the shadow-index + atomic swap job instead,
-- which is faster and never leaves the live index half-updated.
CREATE OR REPLACE FUNCTION expand_search_outbox(p_cutoff TIMESTAMPTZ)
RETURNS TABLE (master_product_id UUID) AS $$
  WITH pending AS (
    SELECT entity_type, entity_id
    FROM search_outbox
    WHERE processed_at IS NULL
      AND enqueued_at <= p_cutoff
      AND entity_type <> 'all'
  )
  -- 1:1
  SELECT entity_id FROM pending WHERE entity_type = 'master_product'

  UNION   -- UNION, not UNION ALL: dedup is the point

  -- fan-out: brand
  SELECT mp.id
  FROM pending p
  JOIN master_product mp ON mp.brand_id = p.entity_id
  WHERE p.entity_type = 'brand'

  UNION

  -- fan-out: category subtree. Prefix match on path rather than a recursive
  -- CTE — idx_category_path already exists with text_pattern_ops.
  SELECT mp.id
  FROM pending p
  JOIN category c ON c.id = p.entity_id
  JOIN category d ON d.id = c.id OR d.path LIKE c.path || '/%'
  JOIN master_product mp ON mp.category_id = d.id
  WHERE p.entity_type = 'category'

  UNION

  -- fan-out: stone variety
  SELECT mp.id
  FROM pending p
  JOIN master_product mp ON mp.stone_variety_id = p.entity_id
  WHERE p.entity_type = 'stone_variety';
$$ LANGUAGE sql STABLE;


-- -----------------------------------------------------------------------------
-- THE DELETE PATH
--
-- Expansion returns IDs, not documents. The worker then asks Postgres which of
-- those products should exist in the index:
--
--   SELECT id FROM master_product
--   WHERE id = ANY($1) AND status = 'live';
--
-- Every ID returned by expansion but ABSENT from that result is deleted from
-- Meilisearch. One query drives both paths, and it covers three cases with no
-- special handling:
--
--   * product row deleted        → absent
--   * status moved off 'live'    → absent
--   * product still live         → rebuilt
--
-- This is why the missing foreign key is not a defect. An entity_id pointing at
-- a deleted row is precisely the signal to remove the document. Without it,
-- deleted products stay searchable forever.
-- -----------------------------------------------------------------------------


-- =============================================================================
-- 6. DRAIN BOOKKEEPING
-- =============================================================================

-- Advisory lock, mirroring drain_catalog_reindex_queue(). Two worker instances
-- during a rolling Railway deploy would otherwise both drain and both mark rows
-- processed.
CREATE OR REPLACE FUNCTION search_outbox_try_lock()
RETURNS BOOLEAN AS $$
  SELECT pg_try_advisory_lock(hashtext('search_outbox_drain'));
$$ LANGUAGE sql VOLATILE;

CREATE OR REPLACE FUNCTION search_outbox_unlock()
RETURNS VOID AS $$
  SELECT pg_advisory_unlock(hashtext('search_outbox_drain'));
$$ LANGUAGE sql VOLATILE;


-- Called ONLY after Meilisearch has accepted every batch for this cutoff.
--
-- The cutoff is what makes this safe. Changes arriving mid-drain land with
-- enqueued_at > cutoff, so they are not marked processed and are picked up next
-- cycle. Worst case a document is rebuilt twice; it is never left stale.
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


-- Mirrors purge_catalog_reindex_queue(). Processed rows are kept briefly as an
-- audit trail for "why did this document change", then dropped.
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


-- Operational visibility, mirroring catalog_reindex_backlog. If oldest_pending
-- grows, the worker is down or wedged — and a stale index NEVER raises an error
-- on its own, so this view is the only thing that will tell anyone.
CREATE OR REPLACE VIEW search_outbox_backlog AS
SELECT
  entity_type,
  COUNT(*)          AS pending_rows,
  MIN(enqueued_at)  AS oldest_pending,
  NOW() - MIN(enqueued_at) AS lag
FROM search_outbox
WHERE processed_at IS NULL
GROUP BY entity_type;
