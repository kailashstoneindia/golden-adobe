'use strict';

// Match once, never re-guess (decision 0011). After one confirmed match the
// vendor's own code is authoritative, so re-uploads skip the matcher
// entirely. Matters most for stone, which has no GTIN or MPN to match
// deterministically.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('vendor_product_map', {
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'vendors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      vendor_sku: {
        type: Sequelize.STRING(64),
        allowNull: false,
        primaryKey: true,
      },
      master_product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'master_product', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // 'vendor' | 'admin' — plain text per the canonical DDL rather than
      // an enum, since this is the only place that distinction is made and
      // it isn't reused elsewhere.
      confirmed_by: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      confirmed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('vendor_product_map', ['master_product_id'], {
      name: 'idx_vpm_product',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('vendor_product_map');
  },
};
