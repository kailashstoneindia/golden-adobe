'use strict';

// GST follows the HSN code, so the code owns the rate (decision 0014).
// master_product.gst_rate is a snapshot of this at write time, not a join
// on read — rates change rarely, and a snapshot keeps historical invoices
// correct when a rate is later revised. Part of docs/catalog-schema.sql
// section 2 (Reference Data) — omitted from the Phase 1 taxonomy migration
// batch by oversight; master_product.hsn_code (Phase 2) is what actually
// requires it to exist first.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('hsn_code', {
      code: {
        type: Sequelize.STRING(16),
        primaryKey: true,
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      gst_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE hsn_code ADD CONSTRAINT hsn_code_gst_rate_check CHECK (gst_rate >= 0);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('hsn_code');
  },
};
