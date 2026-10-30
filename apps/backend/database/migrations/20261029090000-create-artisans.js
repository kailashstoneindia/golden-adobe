'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('artisans', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      trade_type: {
        type: Sequelize.ENUM(
          'CARPENTER',
          'PLUMBER',
          'PAINTER',
          'ELECTRICIAN',
          'MASON',
          'TILE_LAYING',
          'OTHERS',
        ),
        allowNull: false,
      },
      experience_years: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      service_pincode: {
        type: Sequelize.STRING(10),
        allowNull: true,
      },
      document_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_available: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('artisans', ['user_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('artisans');
  },
};
