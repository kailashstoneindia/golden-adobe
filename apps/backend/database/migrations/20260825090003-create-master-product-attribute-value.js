'use strict';

// Source of truth for attribute values: validated, constrained,
// admin-editable. attributes_flat on master_product is a derived cache of
// this table, kept in sync by a trigger added in the follow-up migration.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('master_product_attribute_value', {
      master_product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'master_product', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      attribute_id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'attribute', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      value: {
        type: Sequelize.STRING(255),
        allowNull: false,
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

    await queryInterface.addIndex('master_product_attribute_value', ['attribute_id', 'value'], {
      name: 'idx_mpav_attribute',
    });

    // Enforcing that enum values exist in attribute_value_option is a
    // trigger (trg_mpav_enum_value), not a constraint here — a foreign key
    // cannot express "only when data_type = enum", and Postgres has no
    // partial FK. Added in the follow-up migration alongside the other
    // trigger logic.
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('master_product_attribute_value');
  },
};
