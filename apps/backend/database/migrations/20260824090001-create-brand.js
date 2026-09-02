'use strict';

// Legal Metrology fields are NOT NULL by decision 0014: a brand that cannot
// supply consumer care details is not listed. See docs/decisions/0010 and
// docs/catalog-schema.sql section 2.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('brand', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(160),
        allowNull: false,
        unique: true,
      },
      logo_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      manufacturer_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      manufacturer_address: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      consumer_care_email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      consumer_care_phone: {
        type: Sequelize.STRING(32),
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
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('brand');
  },
};
