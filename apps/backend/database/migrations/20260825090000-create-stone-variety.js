'use strict';

// Neither table holds product rows — lookup tables for domain values that
// are neither attributes nor SKUs (decision 0003, 0009). stone_variety_alias
// drives import matching: stone has no GTIN or MPN, so the top of the
// normal match ladder is unavailable and alias-matching is the entry point.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('stone_variety', {
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
      stone_type: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      origin_region: {
        type: Sequelize.STRING(128),
        allowNull: true,
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

    await queryInterface.createTable('stone_variety_alias', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      stone_variety_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'stone_variety',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      alias: {
        type: Sequelize.STRING(160),
        allowNull: false,
        unique: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // gin_trgm_ops fuzzy-match index for alias resolution during vendor
    // import (docs/catalog-schema.sql section 5). Requires pg_trgm, already
    // enabled by the canonical DDL's CREATE EXTENSION — confirm it exists
    // rather than assume, since this is the first migration to depend on it.
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_stone_alias_trgm ON stone_variety_alias USING GIN (alias gin_trgm_ops);
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('stone_variety_alias');
    await queryInterface.dropTable('stone_variety');
  },
};
