'use strict';

// Variable depth 2-3, hard cap at 3 (decision 0001). level/path/is_leaf are
// denormalized and maintained by the service layer.
//
// The two leaf-invariant triggers in docs/catalog-schema.sql section 9a
// (trg_master_product_leaf_category, trg_category_leaf_transition) are NOT
// installed by this migration — both reference master_product, which does
// not exist until Phase 2. They belong in the migration that creates
// master_product, not here; until then is_leaf has no enforced guard against
// gaining children while products are attached (there are no products yet).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('category', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'category',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      name: {
        type: Sequelize.STRING(128),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },
      level: {
        type: Sequelize.SMALLINT,
        allowNull: false,
      },
      path: {
        type: Sequelize.TEXT,
        allowNull: false,
        unique: true,
      },
      is_leaf: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      unit_of_measure_default_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'unit_of_measure',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      hsn_code_default: {
        type: Sequelize.STRING(16),
        allowNull: true,
      },
      external_taxonomy_code: {
        type: Sequelize.STRING(64),
        allowNull: true,
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

    await queryInterface.addConstraint('category', {
      fields: ['level'],
      type: 'check',
      name: 'category_level_range',
      where: { level: { [Sequelize.Op.between]: [1, 3] } },
    });

    // (parent_id IS NULL) = (level = 1) — a root has no parent and nothing
    // else is level 1. Written as raw SQL: queryInterface.addConstraint has no
    // portable way to express an equivalence check across two columns.
    await queryInterface.sequelize.query(`
      ALTER TABLE category
        ADD CONSTRAINT category_root_is_level1
        CHECK ((parent_id IS NULL) = (level = 1));
    `);

    await queryInterface.addConstraint('category', {
      fields: ['parent_id', 'slug'],
      type: 'unique',
      name: 'category_slug_unique_per_parent',
    });

    await queryInterface.addIndex('category', ['parent_id'], {
      name: 'idx_category_parent',
    });
    // path text_pattern_ops powers the prefix match used for "whole subtree"
    // lookups (e.g. category rename fan-out in search sync) — a plain btree
    // index does not support LIKE 'prefix%' efficiently with a non-C locale.
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_category_path ON category (path text_pattern_ops);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX idx_category_level ON category (level) WHERE is_active;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('category');
  },
};
