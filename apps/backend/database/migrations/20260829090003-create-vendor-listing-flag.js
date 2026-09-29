'use strict';

// Phase 7 — catalog-edit re-validation (catalog-integrity-approach.md build
// order #10). When an admin edits a variant-defining attribute value on a
// product that is already LIVE, every vendor_listing attached to it now
// describes something subtly different than what the vendor originally
// confirmed (e.g. a stone product corrected from 18mm to 20mm) — the
// listing itself didn't change, but what it MEANS did.
//
// Persistent flag with a resolution lifecycle, not a queue row that gets
// silently drained — an admin needs to see "this needs a look" and
// explicitly clear it, which catalog_reindex_queue's drain-and-delete
// semantics (built for a background rebuild job, not a human review
// backlog) don't fit.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      await queryInterface.createTable(
        'vendor_listing_flag',
        {
          // A REAL Postgres-side default (gen_random_uuid()), not
          // Sequelize.UUIDV4 — this table is written to by a TRIGGER
          // (flag_listings_on_variant_attr_edit below), not exclusively
          // through the ORM, and Sequelize.UUIDV4 is a client-side default
          // the ORM applies before sending an INSERT. A trigger's raw SQL
          // INSERT never goes through that code path, so id would be NULL.
          // Caught by running this migration's own trigger for real — same
          // class of bug as the Phase 1 created_at lesson, different
          // column.
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendor_listing', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          flagged_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          resolved_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          resolved_by: {
            type: Sequelize.STRING(16),
            allowNull: true, // 'admin' — plain text, same convention as vendor_product_map.confirmed_by
          },
        },
        { transaction: t },
      );

      await q(`
        CREATE INDEX idx_vendor_listing_flag_unresolved
          ON vendor_listing_flag (vendor_listing_id) WHERE resolved_at IS NULL;
      `);

      // Fires when an EXISTING attribute value on a product is edited
      // (not inserted for the first time — a brand-new draft product has
      // no listings yet, nothing to flag) AND that attribute is
      // variant-defining AND the product is currently live.
      await q(`
        CREATE OR REPLACE FUNCTION flag_listings_on_variant_attr_edit()
        RETURNS TRIGGER AS $$
        DECLARE
          v_is_variant_defining BOOLEAN;
          v_product_status master_product_status;
          v_attr_code TEXT;
        BEGIN
          IF NEW.value IS NOT DISTINCT FROM OLD.value THEN
            RETURN NEW; -- no actual change (e.g. touching updated_at only)
          END IF;

          SELECT is_variant_defining, code INTO v_is_variant_defining, v_attr_code
          FROM attribute WHERE id = NEW.attribute_id;

          IF NOT v_is_variant_defining THEN
            RETURN NEW;
          END IF;

          SELECT status INTO v_product_status FROM master_product WHERE id = NEW.master_product_id;
          IF v_product_status IS DISTINCT FROM 'live' THEN
            RETURN NEW; -- draft/pending_review products have no listings to protect yet
          END IF;

          INSERT INTO vendor_listing_flag (vendor_listing_id, reason)
          SELECT vl.id,
                 format('variant-defining attribute "%s" changed from %L to %L after this listing was confirmed',
                        v_attr_code, OLD.value, NEW.value)
          FROM vendor_listing vl
          WHERE vl.master_product_id = NEW.master_product_id
            AND vl.status = 'active';

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await q(`
        CREATE TRIGGER trg_mpav_flag_listings_on_edit
          AFTER UPDATE ON master_product_attribute_value
          FOR EACH ROW EXECUTE FUNCTION flag_listings_on_variant_attr_edit();
      `);
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });
      await q(
        'DROP TRIGGER IF EXISTS trg_mpav_flag_listings_on_edit ON master_product_attribute_value;',
      );
      await q('DROP FUNCTION IF EXISTS flag_listings_on_variant_attr_edit();');
      await queryInterface.dropTable('vendor_listing_flag', { transaction: t });
    });
  },
};
