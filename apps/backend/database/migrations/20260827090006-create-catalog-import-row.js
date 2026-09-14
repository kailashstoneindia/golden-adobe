'use strict';

// Vendor import staging (decision 0011 match ladder). Rows land here first
// and are promoted to vendor_listing only on confirmation — see
// catalog-excel-flows.md Flow 2/3 for the full matching and review-queue
// design. The match ladder itself (a service that populates matched_*,
// match_confidence, match_candidates) is deferred to a follow-up pass; this
// migration only creates the staging shape.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE TYPE import_row_status AS ENUM ('auto_matched', 'needs_review', 'approved', 'rejected');`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `CREATE TYPE import_match_method AS ENUM ('gtin', 'mpn', 'structured', 'variety_alias', 'fuzzy', 'manual');`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'catalog_import_row',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          import_batch_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'catalog_import_batch', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          vendor_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendors', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          raw_row_json: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          matched_master_product_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'master_product', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          match_confidence: {
            type: Sequelize.DECIMAL(5, 4),
            allowNull: true,
          },
          match_method: {
            type: 'import_match_method',
            allowNull: true,
          },
          // Ranked candidates, not just a verdict (decision 0011) — a data
          // steward needs candidate pairs with scores and differing values
          // to choose from, not a bare 'needs_review' flag that makes them
          // investigate from scratch.
          // [ {master_product_id, score, matched_on, differing_attributes}, … ]
          match_candidates: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          status: {
            type: 'import_row_status',
            allowNull: false,
            defaultValue: 'needs_review',
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
        `CREATE INDEX idx_import_row_status ON catalog_import_row (import_batch_id, status);`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('catalog_import_row', { transaction: t });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS import_row_status;', {
        transaction: t,
      });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS import_match_method;', {
        transaction: t,
      });
    });
  },
};
