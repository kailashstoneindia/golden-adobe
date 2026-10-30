'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('artisan_hire_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      artisan_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'artisans',
          key: 'id',
        },
      },
      status: {
        type: Sequelize.ENUM(
          'PENDING_ADMIN_REVIEW',
          'ADMIN_REJECTED',
          'ACCEPTED_BY_ARTISAN',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
        ),
        allowNull: false,
        defaultValue: 'PENDING_ADMIN_REVIEW',
      },
      admin_reviewed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      admin_reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      admin_reject_reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      address_text: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('artisan_hire_requests', ['customer_id']);
    await queryInterface.addIndex('artisan_hire_requests', ['artisan_id']);
    await queryInterface.addIndex('artisan_hire_requests', ['status']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('artisan_hire_requests');
  },
};
