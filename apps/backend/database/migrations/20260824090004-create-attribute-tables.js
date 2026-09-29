'use strict';

// attribute + attribute_value_option (decision 0001, 0005). category_id NULL
// means GLOBAL — applies to every product in every category, since there is
// no single root category to hang global attributes on
// (docs/catalog-structure.md section 0, docs/decisions/0005 finding 1).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      CREATE TYPE attribute_data_type AS ENUM ('enum', 'number', 'text', 'boolean');
    `);

    await queryInterface.createTable('attribute', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'category',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      code: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      data_type: {
        type: 'attribute_data_type',
        allowNull: false,
      },
      unit: {
        type: Sequelize.STRING(32),
        allowNull: true,
      },
      is_variant_defining: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_searchable_filter: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    // Code is unique within a category, and unique among globals. Two partial
    // unique indexes because a plain UNIQUE(category_id, code) would let two
    // NULL-category (global) rows share a code — NULL never equals NULL in a
    // standard unique constraint.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_attribute_code_per_category
        ON attribute (category_id, code) WHERE category_id IS NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_attribute_code_global
        ON attribute (code) WHERE category_id IS NULL;
    `);
    await queryInterface.addIndex('attribute', ['category_id'], {
      name: 'idx_attribute_category',
    });

    await queryInterface.createTable('attribute_value_option', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      attribute_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'attribute',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      value: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addConstraint('attribute_value_option', {
      fields: ['attribute_id', 'value'],
      type: 'unique',
      name: 'attribute_value_unique',
    });

    // Only data_type = 'enum' attributes should carry options; a CHECK cannot
    // reach across tables, so this is enforced in the service layer
    // (docs/catalog-schema.sql section 4, comment above attribute_value_option).
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('attribute_value_option');
    await queryInterface.dropTable('attribute');
    await queryInterface.sequelize.query('DROP TYPE attribute_data_type;');
  },
};
