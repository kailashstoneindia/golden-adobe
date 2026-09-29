-- =============================================================================
-- SEARCH SYNC SCHEMA — outbox, triggers, expansion, drain
-- =============================================================================
--
-- Companion to catalog-schema.sql, which stays canonical for the catalog itself.
-- This file is canonical for search synchronisation.
--
-- DEPENDS ON catalog-schema.sql's Geography section (city, and vendors.city_id
-- once that migration lands) — this file must apply after it.
--
-- Design: docs/search-system-design.md
-- Decisions: docs/decisions/0017-search-engine-choice.md (engine)
--            docs/decisions/0018-city-scoped-search.md   (the unit is (product, city))
--
-- Three rules govern everything below. The third was added by 0018 and is the
-- one most likely to be gotten wrong.
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
--   3. A DOCUMENT IS (PRODUCT, CITY), NOT PRODUCT (decision 0018). The business
--      connects customers to LOCAL vendors, so "is this product available" is a
--      question with a different answer per city. Deleting a vendor's last
--      listing for a product in a city must delete exactly that one document —
--      not the product's documents in every OTHER city where it is still sold.
--      This is why some triggers below resolve the city AT TRIGGER TIME rather
--      than leaving the worker to re-derive it later: by drain time, the row
--      that would have revealed which city just lost coverage may already be
--      gone.
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
-- afford typed, foreign-keyed columns. This has several, so it carries
-- (entity_type, entity_id) instead. The cost is real: no foreign key on
-- entity_id, therefore no ON DELETE CASCADE, therefore the worker must tolerate
-- an entity_id that no longer exists. That turns out to be the DELETE PATH
-- rather than a defect — see section 5.
--
-- city_id is DIFFERENT from entity_id: it is a typed, foreign-keyed column
-- (city rows are not deleted in the ordinary course of business — RESTRICT is
-- appropriate) that is populated ONLY when a trigger can name the specific city
-- a change affects. NULL means "figure out the affected cities from current
-- state at drain time" — safe for fan-out sources, unsafe for anything tied to
-- a row that might not exist by drain time. See rule 3 above.
CREATE TABLE search_outbox (
  id           BIGSERIAL PRIMARY KEY,

  entity_type  TEXT NOT NULL CHECK (entity_type IN (
                 'master_product',   -- 1:1, or fan-out via city_id (see below)
                 'brand',            -- fan-out → all products of the brand
                 'category',         -- fan-out → the whole subtree
                 'stone_variety',    -- fan-out → all products of the variety
                 'city',             -- fan-out → all products currently listed in the city
                 'all'               -- full rebuild marker
               )),

  entity_id    UUID,                             -- NULL only for 'all'
  city_id      UUID REFERENCES city(id) ON DELETE RESTRICT,  -- see note above

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
-- So each event needs its own trigger: 26 triggers over 12 tables. They share
-- three functions, and the DDL is written once.
--
-- THREE functions, not two, because of rule 3. Deciding which one a table needs
-- comes down to one question: does this row carry vendor_id (or resolve to it
-- in one hop), and would losing that row on DELETE also lose the only way to
-- learn which city was affected?
--
--   enqueue_search_outbox()             — no city to resolve, or resolving it
--                                          later from current state is safe
--   enqueue_search_outbox_for_listing() — vendor_listing itself: carries
--                                          vendor_id directly
--   enqueue_search_outbox_via_listing() — vlcp / inventory: one hop through
--                                          vendor_listing_id to reach vendor_id


-- -----------------------------------------------------------------------------
-- 2a. Generic — the changed row already carries the target id in a column, and
-- no city needs resolving at trigger time (city_id is left NULL).
--
--   TG_ARGV[0] = entity_type to enqueue
--   TG_ARGV[1] = column on the changed row holding that entity's id
--
-- to_jsonb(row) ->> column avoids dynamic SQL, which cannot see transition
-- tables reliably. The UPDATE branch reads BOTH transition tables — originally
-- to catch a product re-match moving between products, and it does double duty
-- for vendors.city_id: unioning OLD and NEW turns a relocation into "recheck
-- the old city AND the new city", reusing the SAME 'city' fan-out mechanism a
-- city rename uses. No separate 'vendor relocated' code path exists.
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
-- 2b. vendor_listing itself. Carries vendor_id directly, so city is one join
-- away — resolved NOW, inside this transaction, while the row (and therefore
-- its vendor_id) is still visible.
--
-- This is the function rule 3 exists for. Without capturing city_id here, a
-- vendor's LAST listing for a product in a city being deleted would leave
-- nothing behind that could ever tell the worker which city just lost
-- coverage — the row that knew is the row that's gone. The document would
-- become a ghost: present in Meilisearch, absent from Postgres, invisible to
-- every check that runs afterwards, because every later check needs a listing
-- row to join through and there isn't one.
--
-- UPDATE unions old and new pairs separately (never cross-matched) so an
-- admin reassigning a listing to a different vendor dirties BOTH the old
-- product/city pair and the new one, correctly.
-- -----------------------------------------------------------------------------
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

  ELSE  -- DELETE — the case rule 3 is written for
    INSERT INTO search_outbox (entity_type, entity_id, city_id, reason)
    SELECT DISTINCT 'master_product', o.master_product_id, v.city_id, 'vendor_listing delete'
    FROM old_rows o
    JOIN vendors v ON v.id = o.vendor_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- -----------------------------------------------------------------------------
-- 2c. Listing children — vendor_listing_colour_price and inventory carry only
-- vendor_listing_id, so BOTH the product and the city are resolved by a join
-- through vendor_listing → vendors, at trigger time, for the same reason as 2b.
--
-- On a cascade delete (the parent vendor_listing itself was deleted) the join
-- to vendor_listing finds nothing here — and that is correct rather than a
-- bug: the vendor_listing DELETE fired 2b, which already captured this exact
-- pair before the row disappeared. This trigger firing empty is the redundant
-- path, not the load-bearing one.
-- -----------------------------------------------------------------------------
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
-- This is why brand, category, stone_variety, city and vendors (city_id only)
-- name their columns and the others do not.


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
-- rather than itself. city_id stays NULL: an attribute value change does not
-- add or remove a city's availability, only a document's content, so
-- re-deriving current cities at drain time is correct and cheap.
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
-- Uses 2b, NOT the generic function — this is the row that carries vendor_id,
-- and therefore the row that can resolve city_id before it potentially
-- disappears. See the comment on enqueue_search_outbox_for_listing().
CREATE TRIGGER trg_vl_search_ins AFTER INSERT ON vendor_listing
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_for_listing();

CREATE TRIGGER trg_vl_search_upd AFTER UPDATE ON vendor_listing
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_for_listing();

CREATE TRIGGER trg_vl_search_del AFTER DELETE ON vendor_listing
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox_for_listing();


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
-- INSERT needs no trigger for brand / category / stone_variety: a brand-new
-- one has no products yet. DELETE needs none either — all three are
-- ON DELETE RESTRICT from master_product, so a row with products cannot be
-- deleted.

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


-- -- GEOGRAPHY FAN-OUT (decision 0018) — new in this pass ------------------------
--
-- city itself: a rename needs the document's city label refreshed; a
-- deactivation (pausing operations in a city) needs every document currently
-- attributed to it removed. Both are the same fan-out — "every product
-- currently listed by a vendor in this city" — read at drain time from
-- CURRENT state, which is safe here because nothing about THIS event is tied
-- to a row that might vanish before drain runs.
CREATE TRIGGER trg_city_search_upd AFTER UPDATE OF name, is_active ON city
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('city', 'id');

-- vendors.city_id (relocation): reuses the SAME 'city' fan-out as a rename,
-- not a new entity type. The generic function's UPDATE branch already unions
-- OLD and NEW column values — applied here, that union is exactly "recheck the
-- old city AND the new city", which is the correct fan-out for a relocation.
-- No bespoke "vendor moved" logic exists anywhere in this file.
--
-- Depends on `vendors.city_id`, added by decision 0018 to a table that already
-- exists in production — see the consequences section of that record before
-- this trigger is applied.
CREATE TRIGGER trg_vendor_search_upd AFTER UPDATE OF city_id ON vendors
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION enqueue_search_outbox('city', 'city_id');


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
-- Turns outbox rows into the set of (product, city) PAIRS whose documents must
-- be rebuilt. This is the work deliberately moved OUT of the writer's
-- transaction — and, since decision 0018, also the point where "which product
-- changed" becomes "which product, in which city."
--
-- 'all' is excluded on purpose. A full rebuild does not belong in the
-- incremental path — it routes to the shadow-index + atomic swap job instead,
-- which is faster and never leaves the live index half-updated.
CREATE OR REPLACE FUNCTION expand_search_outbox(p_cutoff TIMESTAMPTZ)
RETURNS TABLE (master_product_id UUID, city_id UUID) AS $$
  WITH pending AS (
    SELECT entity_type, entity_id, city_id
    FROM search_outbox
    WHERE processed_at IS NULL
      AND enqueued_at <= p_cutoff
      AND entity_type <> 'all'
  ),

  -- Pairs resolved AT TRIGGER TIME (2b / 2c above). Trusted as-is: even if the
  -- listing that produced this row is gone by now, the pair itself is exactly
  -- what needs (re)checking. Re-deriving these from current state instead
  -- would silently drop exactly the pairs that need a DELETE — see rule 3.
  direct_pairs AS (
    SELECT entity_id AS master_product_id, city_id
    FROM pending
    WHERE entity_type = 'master_product' AND city_id IS NOT NULL
  ),

  -- Product-level fan-out: master_product/mpav/media changes (city_id NULL —
  -- nothing about availability changed) plus brand/category/stone_variety.
  -- Resolved to a bare product set first, then joined out to CURRENT cities —
  -- safe here because nothing about these events is tied to a row that could
  -- vanish before drain runs.
  dirtied_products AS (
    SELECT entity_id AS id FROM pending WHERE entity_type = 'master_product' AND city_id IS NULL

    UNION

    SELECT mp.id
    FROM pending p
    JOIN master_product mp ON mp.brand_id = p.entity_id
    WHERE p.entity_type = 'brand'

    UNION

    -- Prefix match on path rather than a recursive CTE — idx_category_path
    -- already exists with text_pattern_ops.
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

  -- City-level fan-out: city rename/deactivate, and vendor relocation (both
  -- write entity_type = 'city'). Every product currently listed by a vendor
  -- in that city.
  city_fanout_pairs AS (
    SELECT vl.master_product_id, p.entity_id AS city_id
    FROM pending p
    JOIN vendors v ON v.city_id = p.entity_id
    JOIN vendor_listing vl ON vl.vendor_id = v.id
    WHERE p.entity_type = 'city'
  )

  SELECT * FROM direct_pairs
  UNION   -- UNION, not UNION ALL: dedup is the point
  SELECT * FROM product_fanout_pairs
  UNION
  SELECT * FROM city_fanout_pairs;
$$ LANGUAGE sql STABLE;


-- -----------------------------------------------------------------------------
-- THE DELETE PATH
--
-- Expansion returns candidate PAIRS, not documents. The worker checks every
-- candidate pair against current state in one query:
--
--   SELECT candidate.master_product_id, candidate.city_id
--   FROM (candidate pairs, e.g. a temp table or unnest($1::uuid[], $2::uuid[]))
--          AS candidate(master_product_id, city_id)
--   JOIN master_product mp ON mp.id = candidate.master_product_id AND mp.status = 'live'
--   JOIN city            c ON c.id = candidate.city_id            AND c.is_active
--   WHERE EXISTS (
--     SELECT 1 FROM vendor_listing vl
--     JOIN vendors v ON v.id = vl.vendor_id
--     WHERE vl.master_product_id = candidate.master_product_id
--       AND v.city_id = candidate.city_id
--   );
--
-- Every candidate PRESENT in that result is upserted. Every candidate ABSENT
-- is deleted from Meilisearch. One query, three independent reasons a pair can
-- disappear, no special-casing between them:
--
--   * product status moved off 'live'                → absent
--   * the city was deactivated                        → absent
--   * no vendor_listing remains for that vendor's city → absent  (the EXISTS
--     check, re-verified fresh — NOT assumed from how the pair was found)
--
-- That EXISTS re-check is what makes direct_pairs safe to trust even when
-- stale: a pair discovered via a DELETE trigger is checked against the SAME
-- live-state query as every other pair, so if some OTHER vendor still serves
-- that product in that city, the document correctly survives with updated
-- content instead of being wrongly deleted.
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
