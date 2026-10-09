'use strict';

// Decision 0033 rules 2, 6, 7: one order, split into per-vendor groups,
// each with its own items; price snapshotted at creation; order_items
// carries both vendor_listing_id and master_product_id for risk-4
// traceability (catalog-integrity-residual-risks.md).
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'orders',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          customer_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'customers', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          delivery_address_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'customer_addresses', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          grand_total: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
          },
          status: {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: 'pending_payment',
          },
          razorpay_order_id: {
            type: Sequelize.STRING(128),
            allowNull: true,
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
        `ALTER TABLE orders ADD CONSTRAINT orders_grand_total_check CHECK (grand_total >= 0);`,
        { transaction: t },
      );
      await queryInterface.addIndex('orders', ['customer_id'], {
        name: 'idx_orders_customer_id',
        transaction: t,
      });

      await queryInterface.createTable(
        'order_vendor_group',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          order_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'orders', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          vendor_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendors', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          subtotal: {
            type: Sequelize.DECIMAL(12, 2),
            allowNull: false,
          },
          status: {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: 'pending',
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
        `ALTER TABLE order_vendor_group ADD CONSTRAINT ovg_subtotal_check CHECK (subtotal >= 0);`,
        { transaction: t },
      );
      await queryInterface.addIndex('order_vendor_group', ['order_id'], {
        name: 'idx_ovg_order_id',
        transaction: t,
      });
      await queryInterface.addIndex('order_vendor_group', ['vendor_id'], {
        name: 'idx_ovg_vendor_id',
        transaction: t,
      });

      await queryInterface.createTable(
        'order_items',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          order_vendor_group_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'order_vendor_group', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendor_listing', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          master_product_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'master_product', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
          },
          quantity: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
          },
          unit_price_snapshot: {
            type: Sequelize.DECIMAL(12, 2),
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
        },
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);`,
        { transaction: t },
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE order_items ADD CONSTRAINT order_items_price_check CHECK (unit_price_snapshot >= 0);`,
        { transaction: t },
      );
      await queryInterface.addIndex('order_items', ['order_vendor_group_id'], {
        name: 'idx_order_items_ovg_id',
        transaction: t,
      });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('order_vendor_group');
    await queryInterface.dropTable('orders');
  },
};
