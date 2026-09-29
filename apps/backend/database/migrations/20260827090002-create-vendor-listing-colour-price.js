'use strict';

// Paint colour pricing (decisions 0007, 0016). An ABSOLUTE price per
// listing per colour — no delta, no per-litre scaling, no arithmetic at
// order time. A colour family with no row here is not offered by that
// vendor, and the picker must not show it.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `CREATE TYPE paint_colour_family AS ENUM (
           'white', 'off_white', 'beige', 'brown', 'yellow', 'orange',
           'red', 'pink', 'purple', 'blue', 'green', 'grey', 'black'
         );`,
        { transaction: t },
      );

      await queryInterface.createTable(
        'vendor_listing_colour_price',
        {
          vendor_listing_id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            references: { model: 'vendor_listing', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
          },
          colour_family: {
            type: 'paint_colour_family',
            allowNull: false,
            primaryKey: true,
          },
          price: {
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
        `ALTER TABLE vendor_listing_colour_price
           ADD CONSTRAINT vlcp_price_check CHECK (price >= 0);`,
        { transaction: t },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX idx_vlcp_price ON vendor_listing_colour_price (vendor_listing_id, price);`,
        { transaction: t },
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable('vendor_listing_colour_price', { transaction: t });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS paint_colour_family;', {
        transaction: t,
      });
    });
  },
};
