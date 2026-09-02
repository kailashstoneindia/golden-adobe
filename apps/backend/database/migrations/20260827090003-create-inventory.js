'use strict';

// Counts whatever the vendor_listing points at, in the category's unit of
// measure. Paint is the only exception (decision 0007): nothing is
// countable there — a paint listing is a product line + pack size, not a
// bucket of base — so paint listings simply have no inventory row and
// vendor_listing.status carries availability instead. Not enforced by a
// constraint here; it's a consequence of nothing ever writing an inventory
// row for a tinted_to_order product, not a rule this table encodes.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        'inventory',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
          },
          vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendor_listing', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          warehouse_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'warehouse', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          quantity_available: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 0,
          },
          quantity_reserved: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 0,
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
        },
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE inventory
           ADD CONSTRAINT inventory_quantity_available_check CHECK (quantity_available >= 0);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE inventory
           ADD CONSTRAINT inventory_quantity_reserved_check CHECK (quantity_reserved >= 0);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE inventory
           ADD CONSTRAINT inventory_unique_per_warehouse
           UNIQUE (vendor_listing_id, warehouse_id);`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_inventory_listing ON inventory (vendor_listing_id)
           WHERE quantity_available > 0;`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('inventory');
  },
};
