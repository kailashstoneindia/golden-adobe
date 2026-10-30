'use strict';

// Append-only history (spec §8.2/§8.4): deliberately no updated_at column.
// "Current estimate" for a hire request is always "latest row by
// created_at" — the model must never call .update() on an existing row.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('artisan_completion_estimates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      hire_request_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'artisan_hire_requests',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      estimated_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('artisan_completion_estimates', ['hire_request_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('artisan_completion_estimates');
  },
};
