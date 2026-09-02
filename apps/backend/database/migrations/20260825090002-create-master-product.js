'use strict';

// The master catalog (decisions 0001-0013). See docs/catalog-schema.sql
// section 6 for the full rationale on every column — the comments here only
// cover what a migration reader needs, not the whole design history.
//
// Wrapped in an explicit transaction: sequelize-cli does NOT wrap a
// migration's up() in a transaction by default, and this migration's first
// live run failed partway through (a missing hsn_code FK target) leaving
// the sale_unit_type / master_product_status enum types and the
// master_product_code_seq sequence orphaned in the database — created, but
// with the migration never recorded as applied, so the retry then failed a
// second time on "type already exists". An explicit transaction makes a
// partial failure roll back completely instead of leaving DDL debris that
// blocks the next attempt.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE TYPE sale_unit_type AS ENUM ('discrete', 'cut_to_length', 'tinted_to_order');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE TYPE master_product_status AS ENUM ('draft', 'pending_review', 'live', 'deprecated');`,
        { transaction: t },
      );

      // Product codes are never reused — a deprecated code may still exist
      // in a vendor's saved spreadsheet or a past order (decision 0011).
      await queryInterface.sequelize.query(
        `CREATE SEQUENCE master_product_code_seq START 100000;`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'master_product',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          // Leaf-only attachment (decision 0001) — enforced by a trigger
          // added in a follow-up migration now that this table exists (see
          // the Phase 1 category migration's comment on the deferred
          // triggers).
          category_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'category', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          product_family_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'product_family', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          // Identity lives in columns, never in attributes (decision 0005,
          // finding 2). NULL brand_id = generic product.
          brand_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'brand', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          stone_variety_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'stone_variety', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          name: {
            type: Sequelize.STRING(255),
            allowNull: false,
          },
          slug: {
            type: Sequelize.STRING(280),
            allowNull: false,
            unique: true,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          // Public, permanent, human-usable identifier (decision 0011).
          // Opaque by design — semantic codes break on reclassification.
          // 'GA-' prefix is load-bearing: Excel silently strips leading
          // zeros from bare numerics.
          product_code: {
            type: Sequelize.STRING(16),
            allowNull: false,
            unique: true,
            defaultValue: Sequelize.literal(
              "'GA-' || LPAD(nextval('master_product_code_seq')::text, 7, '0')",
            ),
          },
          // Bonus identifier, not the backbone — brand_id + mfr_part_number
          // is the primary dedup path (decision 0012). Nullable: stone,
          // generics and small hardware brands routinely have none.
          gtin: {
            type: Sequelize.STRING(20),
            allowNull: true,
            unique: true,
          },
          mfr_part_number: {
            type: Sequelize.STRING(64),
            allowNull: true,
          },
          hsn_code: {
            type: Sequelize.STRING(16),
            allowNull: true,
            references: { model: 'hsn_code', key: 'code' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          // Snapshot of hsn_code.gst_rate taken on write (decisions 0010,
          // 0014) — GST is set by the HSN code, never the seller, and a
          // snapshot keeps historical invoices correct when a rate is later
          // revised.
          gst_rate: {
            type: Sequelize.DECIMAL(5, 2),
            allowNull: false,
            defaultValue: 18.0,
          },
          // Legal Metrology: must be displayed AND exposed as a searchable,
          // sortable filter — a column rather than an attribute so NOT NULL
          // guarantees compliance instead of relying on someone filling it
          // in.
          country_of_origin: {
            type: Sequelize.STRING(64),
            allowNull: false,
            defaultValue: 'India',
          },
          importer_details: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          sale_unit_type: {
            type: 'sale_unit_type',
            allowNull: false,
            defaultValue: 'discrete',
          },
          unit_of_measure_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'unit_of_measure', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          pack_content_qty: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: true,
          },
          is_generic: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          has_natural_variation: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          status: {
            type: 'master_product_status',
            allowNull: false,
            defaultValue: 'draft',
          },
          // Deterministic identity for products with no brand and no MPN
          // (decision 0013) — md5 of normalised variant-defining attribute
          // values. NULL until attributes exist; populated by a trigger
          // added in the follow-up migration alongside attributes_flat
          // maintenance.
          identity_hash: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          identity_hash_version: {
            type: Sequelize.SMALLINT,
            allowNull: false,
            defaultValue: 1,
          },
          // Flattened effective attribute set, resolved on write (decision
          // 0005). Source of truth remains master_product_attribute_value;
          // this is a derived cache maintained by a trigger added in the
          // follow-up migration, not by application code.
          attributes_flat: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {},
          },
          // GLOBAL best price across every vendor in every city —
          // admin/ops visibility only. NOT what a customer is shown
          // (decision 0018): the customer-facing figure is city-scoped and
          // lives in the search document, not here. See
          // search-system-design.md section 5.
          cached_best_price: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: true,
          },
          cached_best_vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          cached_updated_at: {
            type: Sequelize.DATE,
            allowNull: true,
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

      await queryInterface.sequelize.query(
        `ALTER TABLE master_product
           ADD CONSTRAINT master_product_generic_has_no_brand
           CHECK (NOT is_generic OR brand_id IS NULL);`,
        { transaction: t },
      );

      await queryInterface.addIndex('master_product', ['category_id', 'status'], {
        name: 'idx_master_product_category_status',
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_master_product_best_price ON master_product (cached_best_price)
           WHERE status = 'live';`,
        { transaction: t },
      );
      await queryInterface.addIndex('master_product', ['brand_id'], {
        name: 'idx_master_product_brand',
        transaction: t,
      });
      await queryInterface.addIndex('master_product', ['product_family_id'], {
        name: 'idx_master_product_family',
        transaction: t,
      });
      await queryInterface.addIndex('master_product', ['stone_variety_id'], {
        name: 'idx_master_product_stone_variety',
        transaction: t,
      });
      await queryInterface.addIndex('master_product', ['product_code'], {
        name: 'idx_master_product_code',
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_master_product_gtin ON master_product (gtin) WHERE gtin IS NOT NULL;`,
        { transaction: t },
      );

      // PRIMARY DEDUPLICATION DEFENCE (decision 0012). Composite because an
      // MPN is unique only inside its own manufacturer's namespace — two
      // brands can legitimately reuse the same MPN string. Partial:
      // generics carry neither.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX master_product_brand_mpn
           ON master_product (brand_id, mfr_part_number)
           WHERE brand_id IS NOT NULL AND mfr_part_number IS NOT NULL;`,
        { transaction: t },
      );

      // SECOND DEDUPLICATION DEFENCE (decision 0013), covering generics and
      // stone. Enforced at PUBLISH (status = 'live'), not insert — attribute
      // values are written after the product row, so at insert time there
      // is nothing to hash yet. Drafts are unconstrained.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX master_product_generic_identity
           ON master_product (category_id, identity_hash)
           WHERE status = 'live' AND identity_hash IS NOT NULL;`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`, {
        transaction: t,
      });
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_master_product_name_trgm ON master_product USING GIN (name gin_trgm_ops);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_master_product_origin ON master_product (country_of_origin)
           WHERE status = 'live';`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_master_product_attributes ON master_product USING GIN (attributes_flat);`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('master_product', { transaction: t });
      await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS master_product_code_seq;', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS master_product_status;', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS sale_unit_type;', {
        transaction: t,
      });
    });
  },
};
