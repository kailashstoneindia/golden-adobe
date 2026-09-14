'use strict';

// Customer location resolution, path 1 of 2: pincode entry (decision 0018).
// A LOOKUP table, not a computed mapping — pincodes do not self-describe
// their city. Seeded from the public India Post pincode dataset, filtered
// to launch cities only — see decision 0020 for the NCR scope.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('pincode_city_map', {
      pincode: {
        type: Sequelize.STRING(6),
        primaryKey: true,
      },
      city_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'city', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('pincode_city_map', ['city_id'], {
      name: 'idx_pincode_city',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('pincode_city_map');
  },
};
