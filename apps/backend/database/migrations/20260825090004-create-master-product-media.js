'use strict';

// Wrapped in an explicit transaction — see the comment in
// 20260825090002-create-master-product.js for why: sequelize-cli does not
// wrap up() in a transaction by default, so a failure partway through
// (e.g. the enum type creation succeeding but createTable failing) would
// otherwise leave orphaned DDL that blocks the retry.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE TYPE media_type AS ENUM ('image', 'spec_sheet_pdf', 'certification_doc');`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'master_product_media',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          master_product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'master_product', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          url: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          type: {
            type: 'media_type',
            allowNull: false,
            defaultValue: 'image',
          },
          display_order: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          is_primary: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          // Indicative, not a specific item — e.g. a stone slab photo that
          // shows typical grain, not the exact slab a customer will
          // receive.
          is_representative: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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
        `CREATE UNIQUE INDEX idx_mpm_one_primary
           ON master_product_media (master_product_id) WHERE is_primary;`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('master_product_media', { transaction: t });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS media_type;', { transaction: t });
    });
  },
};
