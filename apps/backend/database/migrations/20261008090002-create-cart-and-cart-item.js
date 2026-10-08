'use strict';

// Decision 0033 rule 1: cart_item references vendor_listing_id, never
// master_product_id — stock, price and min_order_qty all live on the
// listing. One open cart per customer, enforced by the unique index on
// cart.customer_id.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        'cart',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          customer_id: {
            type: Sequelize.UUID,
            allowNull: false,
            unique: true,
            references: { model: 'customers', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
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

      await queryInterface.createTable(
        'cart_item',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true,
          },
          cart_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'cart', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'vendor_listing', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          quantity: {
            type: Sequelize.DECIMAL(12, 3),
            allowNull: false,
            defaultValue: 1,
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

      // One row per (cart, listing) — adding an already-present listing
      // updates quantity rather than creating a duplicate line.
      await queryInterface.addConstraint('cart_item', {
        fields: ['cart_id', 'vendor_listing_id'],
        type: 'unique',
        name: 'cart_item_cart_listing_unique',
        transaction: t,
      });

      await queryInterface.sequelize.query(
        'ALTER TABLE cart_item ADD CONSTRAINT cart_item_quantity_check CHECK (quantity > 0);',
        { transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('cart_item');
    await queryInterface.dropTable('cart');
  },
};
