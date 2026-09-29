'use strict';

// Wrapped in an explicit transaction — see the comment in
// 20260825090002-create-master-product.js: sequelize-cli does not wrap
// up() in a transaction by default, so a failure partway through (enum
// type created, table creation failing) leaves orphaned DDL that blocks
// the retry.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE TYPE vendor_listing_status AS ENUM ('active', 'paused', 'out_of_stock');`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'vendor_listing',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          vendor_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendors', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          master_product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'master_product', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          vendor_sku: {
            type: Sequelize.STRING(64),
            allowNull: true,
          },
          // For tinted paint this is the UNTINTED price; the colour-family
          // price lives in vendor_listing_colour_price. No pricing_mode
          // column (0008 introduced one, 0015 dropped it) — sale_unit_type
          // = 'tinted_to_order' on master_product already signals where to
          // look for a colour price.
          price: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
          },
          mrp: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: true,
          },
          // gst_rate lives on master_product (decision 0010) — GST follows
          // the HSN code, not the seller, so a per-vendor rate here was
          // never legitimate.
          min_order_qty: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 1,
          },
          supports_tinting: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          // Vendor's own grade label, free text not enum — granite grading
          // is not standardized and the same word means different things
          // by origin (decisions 0003, 0009). Part of listing identity:
          // Indian stone price lists quote per grade.
          stated_grade: {
            type: Sequelize.STRING(64),
            allowNull: true,
          },
          // serviceable_pincodes / service_radius_km deliberately absent —
          // removed by decision 0018. Serviceability now lives once, on
          // vendors.city_id, not per listing.
          status: {
            type: 'vendor_listing_status',
            allowNull: false,
            defaultValue: 'active',
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
        `ALTER TABLE vendor_listing ADD CONSTRAINT vendor_listing_price_check CHECK (price >= 0);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE vendor_listing ADD CONSTRAINT vendor_listing_mrp_check CHECK (mrp >= 0);`,
        { transaction: t },
      );

      // One listing per vendor per product PER GRADE (decision 0009) — a
      // stone yard quotes Grade A and commercial grade at different rates,
      // the way its printed price list does. COALESCE is required because
      // Postgres treats NULLs as distinct — without it a vendor could
      // create unlimited duplicate listings for any non-stone product by
      // leaving grade empty every time.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX vendor_listing_unique
           ON vendor_listing (vendor_id, master_product_id, COALESCE(stated_grade, ''));`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_vendor_listing_product ON vendor_listing (master_product_id, status);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_vendor_listing_vendor ON vendor_listing (vendor_id, status);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE INDEX idx_vendor_listing_price ON vendor_listing (master_product_id, price)
           WHERE status = 'active';`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('vendor_listing', { transaction: t });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS vendor_listing_status;', {
        transaction: t,
      });
    });
  },
};
