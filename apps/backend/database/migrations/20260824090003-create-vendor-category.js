'use strict';

// Vendor registration scope. Level 1 doubles as shop type (decision 0001);
// many-to-many, so a shop selling both plumbing and sanitaryware registers
// for both.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('vendor_category', {
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'vendors',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'category',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('vendor_category');
  },
};
